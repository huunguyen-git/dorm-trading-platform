package com.dormtrading.catalog.media;

import com.dormtrading.iam.auth.AuthFailure;
import java.io.IOException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MediaService {

    public static final long DEFAULT_MAX_FILE_SIZE_BYTES = 5L * 1024 * 1024;
    public static final int DEFAULT_MAX_FILES_PER_UPLOAD = 5;

    private final JdbcTemplate db;
    private final MediaStorage storage;
    private final Clock clock;
    private final long maxFileSizeBytes;
    private final int maxFilesPerUpload;
    private final String publicBaseUrl;

    public MediaService(
            JdbcTemplate db,
            MediaStorage storage,
            Clock clock,
            @Value("${app.media.max-file-size-bytes:5242880}") long maxFileSizeBytes,
            @Value("${app.media.max-files-per-upload:5}") int maxFilesPerUpload,
            @Value("${app.media.public-base-url:}") String publicBaseUrl
    ) {
        this.db = db;
        this.storage = storage;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.maxFileSizeBytes = maxFileSizeBytes > 0 ? maxFileSizeBytes : DEFAULT_MAX_FILE_SIZE_BYTES;
        this.maxFilesPerUpload = maxFilesPerUpload > 0 ? maxFilesPerUpload : DEFAULT_MAX_FILES_PER_UPLOAD;
        this.publicBaseUrl = publicBaseUrl != null ? publicBaseUrl.strip() : "";
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
    public MediaDtos.MediaUploadResponse uploadImages(
            UUID ownerId,
            List<MultipartFile> files,
            String requestBaseUrl
    ) {
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
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Tệp hình ảnh trống hoặc không hợp lệ.");
            }
            if (file.getSize() > maxFileSizeBytes) {
                throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi hình ảnh không được vượt quá 5MB.");
            }
            byte[] bytes;
            try {
                bytes = file.getBytes();
            } catch (IOException e) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Không thể đọc dữ liệu hình ảnh tải lên.");
            }
            if (bytes.length == 0) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Tệp hình ảnh trống hoặc không hợp lệ.");
            }
            if (bytes.length > maxFileSizeBytes) {
                throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi hình ảnh không được vượt quá 5MB.");
            }

            MediaMagicBytes.DetectedImageType detected = MediaMagicBytes.detect(bytes)
                    .orElseThrow(() -> new AuthFailure(
                            400,
                            "INVALID_MEDIA",
                            "Chỉ hỗ trợ hình ảnh định dạng JPEG, PNG hoặc WebP hợp lệ."
                    ));

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
                    bytes.length,
                    MediaMagicBytes.sha256Hex(bytes),
                    bytes
            ));
        }

        String baseUrl = resolveBaseUrl(requestBaseUrl);
        List<String> storedKeys = new ArrayList<>(validated.size());
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
                        baseUrl + "/api/v1/media/" + item.id(),
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
    public MediaDtos.MediaContent loadMedia(UUID mediaId) {
        if (mediaId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã hình ảnh không hợp lệ.");
        }
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT id, storage_key, content_type, size_bytes FROM media_files WHERE id = ?",
                mediaId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "MEDIA_NOT_FOUND", "Không tìm thấy hình ảnh.");
        }
        Map<String, Object> row = rows.getFirst();
        String storageKey = (String) row.get("storage_key");
        String contentType = (String) row.get("content_type");
        byte[] bytes = storage.load(storageKey);
        return new MediaDtos.MediaContent(mediaId, contentType, bytes.length, bytes);
    }

    private String resolveBaseUrl(String requestBaseUrl) {
        String raw = !publicBaseUrl.isBlank() ? publicBaseUrl : requestBaseUrl;
        if (raw == null || raw.isBlank()) {
            throw new IllegalStateException("Không xác định được địa chỉ công khai của dịch vụ media.");
        }
        String cleaned = raw.strip();
        while (cleaned.endsWith("/")) {
            cleaned = cleaned.substring(0, cleaned.length() - 1);
        }
        return cleaned;
    }
}
