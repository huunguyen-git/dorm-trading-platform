package com.dormtrading.catalog.media;

import com.dormtrading.iam.auth.AuthFailure;
import java.io.IOException;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MediaService {

    public static final long DEFAULT_MAX_FILE_SIZE_BYTES = 5L * 1024 * 1024;
    public static final int DEFAULT_MAX_FILES_PER_UPLOAD = 5;
    public static final int DEFAULT_MAX_FILES_PER_USER = 100;
    public static final long DEFAULT_MAX_BYTES_PER_USER = 100L * 1024 * 1024;

    private final JdbcTemplate db;
    private final MediaStorage storage;
    private final Clock clock;
    private final long maxFileSizeBytes;
    private final int maxFilesPerUpload;
    private final int maxFilesPerUser;
    private final long maxBytesPerUser;
    private final String publicBaseUrl;

    public MediaService(
            JdbcTemplate db,
            MediaStorage storage,
            Clock clock,
            long maxFileSizeBytes,
            int maxFilesPerUpload,
            String publicBaseUrl
    ) {
        this(
                db,
                storage,
                clock,
                maxFileSizeBytes,
                maxFilesPerUpload,
                DEFAULT_MAX_FILES_PER_USER,
                DEFAULT_MAX_BYTES_PER_USER,
                publicBaseUrl
        );
    }

    @Autowired
    public MediaService(
            JdbcTemplate db,
            MediaStorage storage,
            Clock clock,
            @Value("${app.media.max-file-size-bytes:5242880}") long maxFileSizeBytes,
            @Value("${app.media.max-files-per-upload:5}") int maxFilesPerUpload,
            @Value("${app.media.max-files-per-user:100}") int maxFilesPerUser,
            @Value("${app.media.max-bytes-per-user:104857600}") long maxBytesPerUser,
            @Value("${app.media.public-base-url:}") String publicBaseUrl
    ) {
        this.db = db;
        this.storage = storage;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.maxFileSizeBytes = maxFileSizeBytes > 0 ? maxFileSizeBytes : DEFAULT_MAX_FILE_SIZE_BYTES;
        this.maxFilesPerUpload = maxFilesPerUpload > 0 ? maxFilesPerUpload : DEFAULT_MAX_FILES_PER_UPLOAD;
        this.maxFilesPerUser = maxFilesPerUser > 0 ? maxFilesPerUser : DEFAULT_MAX_FILES_PER_USER;
        this.maxBytesPerUser = maxBytesPerUser > 0 ? maxBytesPerUser : DEFAULT_MAX_BYTES_PER_USER;
        this.publicBaseUrl = normalizePublicBaseUrl(publicBaseUrl);
    }

    private record ValidatedUpload(
            UUID id,
            String storageKey,
            String originalFilename,
            String contentType,
            long sizeBytes,
            String sha256,
            byte[] bytes
    ) {
    }

    @Transactional
    public MediaDtos.MediaUploadResponse uploadImages(UUID ownerId, List<MultipartFile> files) {
        if (ownerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (files == null || files.isEmpty()) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Vui lòng chọn từ 1 đến " + maxFilesPerUpload + " hình ảnh.");
        }
        if (files.size() > maxFilesPerUpload) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Chỉ được tải lên tối đa " + maxFilesPerUpload + " hình ảnh mỗi lần.");
        }

        Instant createdAt = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        ZonedDateTime utcTime = createdAt.atZone(ZoneOffset.UTC);

        List<ValidatedUpload> validated = new ArrayList<>(files.size());
        long batchTotalBytes = 0L;
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Tệp hình ảnh trống hoặc không hợp lệ.");
            }
            if (file.getSize() > maxFileSizeBytes) {
                throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi hình ảnh không được vượt quá 5MB.");
            }
            byte[] rawBytes;
            try {
                rawBytes = file.getBytes();
            } catch (IOException e) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Không thể đọc dữ liệu hình ảnh tải lên.");
            }
            if (rawBytes.length == 0) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Tệp hình ảnh trống hoặc không hợp lệ.");
            }
            if (rawBytes.length > maxFileSizeBytes) {
                throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi hình ảnh không được vượt quá 5MB.");
            }

            MediaMagicBytes.DetectedImageType detected = MediaMagicBytes.detect(rawBytes)
                    .orElseThrow(() -> new AuthFailure(
                            400,
                            "INVALID_MEDIA",
                            "Chỉ hỗ trợ hình ảnh định dạng JPEG, PNG hoặc WebP hợp lệ."
                    ));

            // Strip EXIF, GPS, XMP, and comments while verifying valid image structure and dimensions
            byte[] sanitizedBytes = MediaImageSanitizer.sanitize(rawBytes, detected, maxFileSizeBytes);
            batchTotalBytes += sanitizedBytes.length;

            UUID mediaId = UUID.randomUUID();
            String storageKey = String.format(
                    "%04d/%02d/%s.%s",
                    utcTime.getYear(),
                    utcTime.getMonthValue(),
                    mediaId,
                    detected.extension()
            );

            validated.add(new ValidatedUpload(
                    mediaId,
                    storageKey,
                    MediaMagicBytes.sanitizeFilename(file.getOriginalFilename()),
                    detected.contentType(),
                    sanitizedBytes.length,
                    MediaMagicBytes.sha256Hex(sanitizedBytes),
                    sanitizedBytes
            ));
        }

        // Lock seller row to serialize concurrent quota checks and verify account is still active
        lockAndVerifyMediaQuota(ownerId, validated.size(), batchTotalBytes);

        List<String> storedKeys = new ArrayList<>(validated.size());
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        for (String key : storedKeys) {
                            storage.deleteQuietly(key);
                        }
                    }
                }
            });
        }

        List<MediaDtos.UploadedMediaItemDto> result = new ArrayList<>(validated.size());
        try {
            Timestamp createdTimestamp = Timestamp.from(createdAt);
            for (ValidatedUpload item : validated) {
                storage.store(item.storageKey(), item.bytes());
                storedKeys.add(item.storageKey());

                db.update(
                        "INSERT INTO media_files(id, owner_id, storage_key, original_filename, content_type, size_bytes, sha256, created_at) " +
                                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        item.id(),
                        ownerId,
                        item.storageKey(),
                        item.originalFilename(),
                        item.contentType(),
                        item.sizeBytes(),
                        item.sha256(),
                        createdTimestamp
                );

                result.add(new MediaDtos.UploadedMediaItemDto(
                        item.id(),
                        buildMediaUrl(item.id()),
                        item.contentType(),
                        item.sizeBytes()
                ));
            }
        } catch (RuntimeException e) {
            for (String key : storedKeys) {
                storage.deleteQuietly(key);
            }
            throw e;
        }

        return new MediaDtos.MediaUploadResponse(List.copyOf(result));
    }

    @Transactional(readOnly = true)
    public MediaDtos.MediaContent loadMedia(UUID mediaId, UUID viewerId, boolean isModerator) {
        if (mediaId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã hình ảnh không hợp lệ.");
        }
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT id, owner_id, storage_key, content_type, size_bytes, sha256 FROM media_files WHERE id = ?",
                mediaId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "MEDIA_NOT_FOUND", "Không tìm thấy hình ảnh.");
        }
        Map<String, Object> row = rows.getFirst();
        UUID ownerId = (UUID) row.get("owner_id");
        String storageKey = (String) row.get("storage_key");
        String contentType = (String) row.get("content_type");
        long dbSizeBytes = ((Number) row.get("size_bytes")).longValue();
        String sha256 = String.valueOf(row.get("sha256")).strip();

        boolean isOwner = viewerId != null && viewerId.equals(ownerId);
        boolean publiclyVisible = isPubliclyVisible(mediaId, ownerId, clock.instant());

        if (!publiclyVisible && !isOwner && !isModerator) {
            throw new AuthFailure(404, "MEDIA_NOT_FOUND", "Không tìm thấy hình ảnh.");
        }

        Resource resource = storage.loadAsResource(storageKey);
        long resolvedSize;
        try {
            resolvedSize = resource.contentLength();
        } catch (IOException e) {
            resolvedSize = dbSizeBytes;
        }

        String eTag = "\"" + sha256 + "\"";
        return new MediaDtos.MediaContent(mediaId, contentType, resolvedSize, eTag, publiclyVisible, resource);
    }

    /**
     * Sweeps files on disk older than {@code minAge} that have no matching row in {@code media_files}.
     * Streams storage keys in chunks so legitimate older files never starve orphan detection, while
     * bounding both deleted files and total scanned keys per run.
     */
    @Transactional(readOnly = true)
    public int cleanupOrphanFiles(Duration minAge, int maxDeletes) {
        Duration safeMinAge = (minAge != null && !minAge.isNegative()) ? minAge : Duration.ofHours(1);
        int safeMaxDeletes = maxDeletes > 0 ? Math.min(maxDeletes, 500) : 100;
        int chunkSize = Math.min(safeMaxDeletes, 200);
        int maxScanned = Math.max(safeMaxDeletes * 50, 10_000);
        Instant cutoff = clock.instant().minus(safeMinAge);

        int[] counters = new int[2]; // [0] = deleted, [1] = scanned
        storage.visitKeysOlderThan(cutoff, chunkSize, candidateKeys -> {
            if (candidateKeys.isEmpty()) {
                return true;
            }
            counters[1] += candidateKeys.size();

            Set<String> existingKeys = new HashSet<>();
            String[] keyArray = candidateKeys.toArray(new String[0]);
            db.query(
                    con -> {
                        PreparedStatement ps = con.prepareStatement(
                                "SELECT storage_key FROM media_files WHERE storage_key = ANY(?)"
                        );
                        ps.setArray(1, con.createArrayOf("text", keyArray));
                        return ps;
                    },
                    rs -> {
                        existingKeys.add(rs.getString("storage_key"));
                    }
            );

            for (String key : candidateKeys) {
                if (counters[0] >= safeMaxDeletes) {
                    return false;
                }
                if (!existingKeys.contains(key)) {
                    storage.deleteQuietly(key);
                    counters[0]++;
                }
            }
            return counters[0] < safeMaxDeletes && counters[1] < maxScanned;
        });
        return counters[0];
    }

    private void lockAndVerifyMediaQuota(UUID ownerId, int incomingFileCount, long incomingBytes) {
        List<String> statuses = db.queryForList(
                "SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ? FOR UPDATE",
                String.class,
                ownerId
        );
        if (statuses.isEmpty()) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }
        String accountStatus = statuses.getFirst();
        if (!"HOAT_DONG".equals(accountStatus)) {
            throw new AuthFailure(403, "FORBIDDEN", "Tài khoản không ở trạng thái hoạt động để tải ảnh lên.");
        }

        Map<String, Object> usage = db.queryForMap(
                "SELECT COUNT(*)::int AS file_count, COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes " +
                        "FROM media_files WHERE owner_id = ?",
                ownerId
        );
        int existingCount = ((Number) usage.get("file_count")).intValue();
        long existingBytes = ((Number) usage.get("total_bytes")).longValue();

        if (existingCount + incomingFileCount > maxFilesPerUser
                || existingBytes + incomingBytes > maxBytesPerUser) {
            throw new AuthFailure(
                    413,
                    "MEDIA_QUOTA_EXCEEDED",
                    "Bạn đã vượt giới hạn lưu trữ hình ảnh cho phép (" + maxFilesPerUser + " ảnh / "
                            + Math.max(1L, maxBytesPerUser / (1024L * 1024L)) + "MB)."
            );
        }
    }

    private boolean isPubliclyVisible(UUID mediaId, UUID ownerId, Instant now) {
        String canonicalPath = "/api/v1/media/" + mediaId;
        String suffixPattern = "%/api/v1/media/" + mediaId;
        Timestamp nowTs = Timestamp.from(now);

        // Moderation-hidden (AN) listings owned by this media owner immediately revoke public visibility
        // (scoped to ownerId so idx_tin_dangs_nguoi_dang_trang_thai is used and other users cannot DoS victim media).
        Boolean blockedByModeration = db.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM tin_dangs t
                    WHERE t.nguoi_dang_id = ?
                      AND t.trang_thai = 'AN'
                      AND (
                          EXISTS (SELECT 1 FROM unnest(t.hinh_anh) AS img WHERE img = ? OR img LIKE ?)
                          OR EXISTS (
                              SELECT 1
                              FROM tin_dang_do_vat td
                              JOIN do_vats dv ON dv.ma_vat = td.ma_vat
                              WHERE td.ma_tin = t.ma_tin
                                AND EXISTS (SELECT 1 FROM unnest(dv.hinh_anh) AS img WHERE img = ? OR img LIKE ?)
                          )
                      )
                )
                """,
                Boolean.class,
                ownerId,
                canonicalPath,
                suffixPattern,
                canonicalPath,
                suffixPattern
        );
        if (Boolean.TRUE.equals(blockedByModeration)) {
            return false;
        }

        // Media is publicly accessible only when referenced by at least one active public/reserved listing
        // owned by the media owner whose account is HOAT_DONG (prevents cross-user draft exfiltration).
        Boolean attachedToActivePublicListing = db.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM tin_dangs t
                    JOIN thanh_viens u ON u.user_id = t.nguoi_dang_id
                    WHERE t.nguoi_dang_id = ?
                      AND u.trang_thai_tai_khoan = 'HOAT_DONG'
                      AND (
                          t.trang_thai = 'GIU_CHO'
                          OR (t.trang_thai = 'CONG_KHAI' AND (t.expires_at IS NULL OR t.expires_at > ?))
                      )
                      AND (
                          EXISTS (SELECT 1 FROM unnest(t.hinh_anh) AS img WHERE img = ? OR img LIKE ?)
                          OR EXISTS (
                              SELECT 1
                              FROM tin_dang_do_vat td
                              JOIN do_vats dv ON dv.ma_vat = td.ma_vat
                              WHERE td.ma_tin = t.ma_tin
                                AND EXISTS (SELECT 1 FROM unnest(dv.hinh_anh) AS img WHERE img = ? OR img LIKE ?)
                          )
                      )
                )
                """,
                Boolean.class,
                ownerId,
                nowTs,
                canonicalPath,
                suffixPattern,
                canonicalPath,
                suffixPattern
        );
        return Boolean.TRUE.equals(attachedToActivePublicListing);
    }

    private String buildMediaUrl(UUID mediaId) {
        String relativePath = "/api/v1/media/" + mediaId;
        if (publicBaseUrl.isEmpty()) {
            return relativePath;
        }
        return publicBaseUrl + relativePath;
    }

    private static String normalizePublicBaseUrl(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String cleaned = raw.strip();
        while (cleaned.endsWith("/")) {
            cleaned = cleaned.substring(0, cleaned.length() - 1);
        }
        return cleaned;
    }
}
