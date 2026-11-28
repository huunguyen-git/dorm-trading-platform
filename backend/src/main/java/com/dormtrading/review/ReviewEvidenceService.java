package com.dormtrading.review;

import com.dormtrading.catalog.media.MediaImageSanitizer;
import com.dormtrading.catalog.media.MediaMagicBytes;
import com.dormtrading.iam.auth.AccountRestrictedFailure;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.review.reputation.ReputationLedgerService;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * Private review evidence upload, draft deletion, orphan cleanup & NFR-01 ACL download service
 * (UC-30, UC-31, UC-34, NFR-01). Strictly isolated from public {@code media_files} storage.
 */
@Service
public class ReviewEvidenceService {

    public static final long DEFAULT_MAX_FILE_SIZE_BYTES = 5L * 1024 * 1024;
    public static final int DEFAULT_MAX_FILES_PER_UPLOAD = 5;
    public static final int DEFAULT_MAX_FILES_PER_USER = 100;
    public static final long DEFAULT_MAX_BYTES_PER_USER = 100L * 1024 * 1024;

    private final JdbcTemplate db;
    private final ReviewEvidenceStorage storage;
    private final ReputationLedgerService reputationLedger;
    private final Clock clock;
    private final TransactionTemplate txTemplate;
    private final long maxFileSizeBytes;
    private final int maxFilesPerUpload;
    private final int maxFilesPerUser;
    private final long maxBytesPerUser;

    @Autowired
    public ReviewEvidenceService(
            JdbcTemplate db,
            ReviewEvidenceStorage storage,
            ReputationLedgerService reputationLedger,
            Clock clock,
            PlatformTransactionManager transactionManager,
            @Value("${app.review.evidence-max-file-size-bytes:5242880}") long maxFileSizeBytes,
            @Value("${app.review.evidence-max-files-per-upload:5}") int maxFilesPerUpload,
            @Value("${app.review.evidence-max-files-per-user:100}") int maxFilesPerUser,
            @Value("${app.review.evidence-max-bytes-per-user:104857600}") long maxBytesPerUser
    ) {
        this.db = db;
        this.storage = storage;
        this.reputationLedger = reputationLedger;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.txTemplate = new TransactionTemplate(transactionManager);
        this.txTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        this.maxFileSizeBytes = maxFileSizeBytes > 0 ? maxFileSizeBytes : DEFAULT_MAX_FILE_SIZE_BYTES;
        this.maxFilesPerUpload = maxFilesPerUpload > 0 ? maxFilesPerUpload : DEFAULT_MAX_FILES_PER_UPLOAD;
        this.maxFilesPerUser = maxFilesPerUser > 0 ? maxFilesPerUser : DEFAULT_MAX_FILES_PER_USER;
        this.maxBytesPerUser = maxBytesPerUser > 0 ? maxBytesPerUser : DEFAULT_MAX_BYTES_PER_USER;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    public static String buildEvidenceUrl(UUID evidenceId) {
        return "/api/v1/reviews/evidence/" + evidenceId;
    }

    private record ValidatedEvidence(
            UUID id,
            String storageKey,
            String originalFilename,
            String contentType,
            long sizeBytes,
            String sha256,
            byte[] bytes
    ) {
    }

    private record DraftRow(UUID id, String storageKey) {
    }

    /**
     * Uploads 1..5 private review evidence images with:
     * (1) lightweight read-only pre-checks BEFORE reading up to 25MB / running image decoding,
     * (2) storage I/O OUTSIDE any DB row lock/transaction, and
     * (3) short atomic DB commit re-checking preconditions & quota under lock (rolling back stored objects on failure).
     */
    public ReviewDtos.EvidenceUploadResponse uploadEvidence(UUID buyerId, UUID orderId, List<MultipartFile> files) {
        if (buyerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (orderId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã giao dịch không hợp lệ.");
        }
        if (files == null || files.isEmpty()) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Vui lòng chọn từ 1 đến " + maxFilesPerUpload + " ảnh bằng chứng.");
        }
        if (files.size() > maxFilesPerUpload) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Chỉ được tải lên tối đa " + maxFilesPerUpload + " ảnh bằng chứng mỗi lần.");
        }
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Tệp bằng chứng trống hoặc không hợp lệ.");
            }
            if (file.getSize() > maxFileSizeBytes) {
                throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi tệp bằng chứng không được vượt quá 5MB.");
            }
        }

        // Phase 1: Lightweight read-only pre-check BEFORE reading bytes or running MediaImageSanitizer (DoS guard)
        Instant preCheckTime = now();
        preCheckUploadEligibilityReadOnly(buyerId, orderId, files.size(), preCheckTime);

        // Phase 2: Read bytes, verify magic bytes, strip EXIF/GPS/XMP (NO DB locks held)
        Instant current = now();
        ZonedDateTime utcTime = current.atZone(ZoneOffset.UTC);

        List<ValidatedEvidence> validated = new ArrayList<>(files.size());
        long batchTotalBytes = 0L;
        for (MultipartFile file : files) {
            byte[] rawBytes;
            try {
                rawBytes = file.getBytes();
            } catch (IOException e) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Không thể đọc dữ liệu tệp bằng chứng tải lên.");
            }
            if (rawBytes.length == 0) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Tệp bằng chứng trống hoặc không hợp lệ.");
            }
            if (rawBytes.length > maxFileSizeBytes) {
                throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi tệp bằng chứng không được vượt quá 5MB.");
            }

            MediaMagicBytes.DetectedImageType detected = MediaMagicBytes.detect(rawBytes)
                    .orElseThrow(() -> new AuthFailure(
                            400,
                            "INVALID_MEDIA",
                            "Bằng chứng đánh giá chỉ hỗ trợ ảnh định dạng JPEG, PNG hoặc WebP hợp lệ."
                    ));

            byte[] sanitizedBytes = MediaImageSanitizer.sanitize(rawBytes, detected, maxFileSizeBytes);
            batchTotalBytes += sanitizedBytes.length;

            UUID evidenceId = UUID.randomUUID();
            String storageKey = String.format(
                    "%04d/%02d/%s.%s",
                    utcTime.getYear(),
                    utcTime.getMonthValue(),
                    evidenceId,
                    detected.extension()
            );

            validated.add(new ValidatedEvidence(
                    evidenceId,
                    storageKey,
                    MediaMagicBytes.sanitizeFilename(file.getOriginalFilename()),
                    detected.contentType(),
                    sanitizedBytes.length,
                    MediaMagicBytes.sha256Hex(sanitizedBytes),
                    sanitizedBytes
            ));
        }

        // Phase 3: Write sanitized blobs to storage OUTSIDE any DB transaction / row lock
        List<String> storedKeys = new ArrayList<>(validated.size());
        try {
            for (ValidatedEvidence ev : validated) {
                storage.store(ev.storageKey(), ev.bytes(), ev.contentType());
                storedKeys.add(ev.storageKey());
            }
        } catch (RuntimeException e) {
            for (String key : storedKeys) {
                storage.deleteQuietly(key);
            }
            throw e;
        }

        // Phase 4: Short atomic DB transaction to lock, re-verify exact quota/preconditions, and persist rows
        long finalBatchTotalBytes = batchTotalBytes;
        try {
            return txTemplate.execute(status -> persistUploadedEvidenceInTx(
                    buyerId,
                    orderId,
                    validated,
                    finalBatchTotalBytes,
                    current
            ));
        } catch (RuntimeException e) {
            for (String key : storedKeys) {
                storage.deleteQuietly(key);
            }
            throw e;
        }
    }

    private void preCheckUploadEligibilityReadOnly(UUID buyerId, UUID orderId, int incomingFileCount, Instant current) {
        List<Map<String, Object>> memberRows = db.queryForList(
                """
                SELECT user_id, diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved,
                       khoa_den_ngay, loai_han_che, ly_do_han_che, cho_phep_khieu_nai
                FROM thanh_viens
                WHERE user_id = ?
                """,
                buyerId
        );
        verifyActiveMemberReadOnly(memberRows, current);

        List<Map<String, Object>> orderRows = db.queryForList(
                """
                SELECT ma_giao_dich, nguoi_mua_id, trang_thai, thoi_diem_hoan_tat, da_cong_diem_khong_danh_gia
                FROM giao_dichs
                WHERE ma_giao_dich = ?
                """,
                orderId
        );
        verifyOrderAndActiveReviewEligible(buyerId, orderId, orderRows, current);

        Map<String, Object> usage = db.queryForMap(
                "SELECT COUNT(*)::int AS file_count, COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes "
                        + "FROM danh_gia_bang_chungs WHERE nguoi_tai_len_id = ?",
                buyerId
        );
        int existingCount = ((Number) usage.get("file_count")).intValue();
        long existingBytes = ((Number) usage.get("total_bytes")).longValue();
        if (existingCount + incomingFileCount > maxFilesPerUser || existingBytes >= maxBytesPerUser) {
            throw new AuthFailure(
                    413,
                    "MEDIA_QUOTA_EXCEEDED",
                    "Bạn đã vượt giới hạn lưu trữ bằng chứng đánh giá cho phép (" + maxFilesPerUser + " tệp / "
                            + Math.max(1L, maxBytesPerUser / (1024L * 1024L)) + "MB)."
            );
        }
    }

    private ReviewDtos.EvidenceUploadResponse persistUploadedEvidenceInTx(
            UUID buyerId,
            UUID orderId,
            List<ValidatedEvidence> validated,
            long batchTotalBytes,
            Instant current
    ) {
        // Lock order: thanh_viens(buyer) FOR UPDATE -> giao_dichs(order) FOR KEY SHARE
        reputationLedger.reconcileExpiredTemporaryLock(buyerId);
        List<Map<String, Object>> memberRows = db.queryForList(
                """
                SELECT user_id, diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved,
                       khoa_den_ngay, loai_han_che, ly_do_han_che, cho_phep_khieu_nai
                FROM thanh_viens
                WHERE user_id = ?
                FOR UPDATE
                """,
                buyerId
        );
        verifyActiveMember(memberRows);

        List<Map<String, Object>> orderRows = db.queryForList(
                """
                SELECT ma_giao_dich, nguoi_mua_id, trang_thai, thoi_diem_hoan_tat, da_cong_diem_khong_danh_gia
                FROM giao_dichs
                WHERE ma_giao_dich = ?
                FOR KEY SHARE
                """,
                orderId
        );
        verifyOrderAndActiveReviewEligible(buyerId, orderId, orderRows, current);

        // Enforce exact per-user private evidence storage quota under lock
        Map<String, Object> usage = db.queryForMap(
                "SELECT COUNT(*)::int AS file_count, COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes "
                        + "FROM danh_gia_bang_chungs WHERE nguoi_tai_len_id = ?",
                buyerId
        );
        int existingCount = ((Number) usage.get("file_count")).intValue();
        long existingBytes = ((Number) usage.get("total_bytes")).longValue();
        if (existingCount + validated.size() > maxFilesPerUser
                || existingBytes + batchTotalBytes > maxBytesPerUser) {
            throw new AuthFailure(
                    413,
                    "MEDIA_QUOTA_EXCEEDED",
                    "Bạn đã vượt giới hạn lưu trữ bằng chứng đánh giá cho phép (" + maxFilesPerUser + " tệp / "
                            + Math.max(1L, maxBytesPerUser / (1024L * 1024L)) + "MB)."
            );
        }

        List<ReviewDtos.EvidenceItemDto> items = new ArrayList<>(validated.size());
        Timestamp createdTs = Timestamp.from(current);
        for (ValidatedEvidence ev : validated) {
            db.update(
                    """
                    INSERT INTO danh_gia_bang_chungs(
                        id, ma_giao_dich, ma_danh_gia, nguoi_tai_len_id, storage_key,
                        original_filename, content_type, size_bytes, sha256, active, created_at
                    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, TRUE, ?)
                    """,
                    ev.id(),
                    orderId,
                    buyerId,
                    ev.storageKey(),
                    ev.originalFilename(),
                    ev.contentType(),
                    ev.sizeBytes(),
                    ev.sha256(),
                    createdTs
            );

            items.add(new ReviewDtos.EvidenceItemDto(
                    ev.id(),
                    buildEvidenceUrl(ev.id()),
                    ev.contentType(),
                    ev.sizeBytes(),
                    ev.originalFilename(),
                    current
            ));
        }

        return new ReviewDtos.EvidenceUploadResponse(List.copyOf(items));
    }

    private void verifyOrderAndActiveReviewEligible(
            UUID buyerId,
            UUID orderId,
            List<Map<String, Object>> orderRows,
            Instant current
    ) {
        if (orderRows.isEmpty()) {
            throw new AuthFailure(404, "ORDER_NOT_FOUND", "Không tìm thấy giao dịch.");
        }
        Map<String, Object> orderRow = orderRows.getFirst();
        UUID orderBuyerId = (UUID) orderRow.get("nguoi_mua_id");
        if (!buyerId.equals(orderBuyerId)) {
            throw new AuthFailure(403, "FORBIDDEN", "Chỉ người mua của giao dịch mới có quyền tải lên bằng chứng đánh giá.");
        }

        String orderStatus = String.valueOf(orderRow.get("trang_thai"));
        Timestamp completedTs = (Timestamp) orderRow.get("thoi_diem_hoan_tat");
        Instant completedAt = completedTs != null ? completedTs.toInstant() : null;
        boolean bonusApplied = Boolean.TRUE.equals(orderRow.get("da_cong_diem_khong_danh_gia"));

        if (!"HOAN_TAT".equals(orderStatus) || completedAt == null) {
            throw new AuthFailure(409, "ORDER_NOT_COMPLETED", "Chỉ có thể tải bằng chứng sau khi giao dịch đã hoàn tất.");
        }
        if (bonusApplied) {
            throw new AuthFailure(409, "NO_REVIEW_BONUS_ALREADY_APPLIED", "Giao dịch đã hết hạn đánh giá và đã cộng +1 điểm uy tín cho người bán.");
        }
        if (!ReviewPolicy.isWithinReviewWindow(completedAt, current)) {
            throw new AuthFailure(409, "REVIEW_WINDOW_EXPIRED", "Đã quá thời hạn 15 ngày kể từ khi hoàn tất giao dịch để gửi hoặc chỉnh sửa đánh giá.");
        }

        // Exact parity with ReviewService.findLockingComplaintStatus (includes quyet_dinhs linked via khieu_nais)
        List<Map<String, Object>> activeReviews = db.queryForList(
                """
                SELECT d.ma_danh_gia, d.trang_thai, d.thoi_diem_xet, d.nguoi_xet_id,
                       (
                           SELECT CASE
                                      WHEN k.trang_thai = 'CHO_XU_LY' THEN 'CHO_XU_LY'
                                      ELSE 'DA_XU_LY'
                                  END
                           FROM khieu_nais k
                           WHERE k.ma_danh_gia = d.ma_danh_gia
                             AND (
                                 k.trang_thai IN ('CHO_XU_LY', 'DA_XU_LY')
                                 OR EXISTS (SELECT 1 FROM quyet_dinhs q WHERE q.ma_khieu_nai = k.ma_khieu_nai)
                             )
                           ORDER BY CASE WHEN k.trang_thai = 'CHO_XU_LY' THEN 0 ELSE 1 END, k.thoi_diem_tao DESC
                           LIMIT 1
                       ) AS locking_complaint_status
                FROM danh_gias d
                WHERE d.ma_giao_dich = ?
                  AND d.trang_thai <> 'DA_XOA'
                LIMIT 1
                """,
                orderId
        );
        if (!activeReviews.isEmpty()) {
            Map<String, Object> active = activeReviews.getFirst();
            String reviewStatus = String.valueOf(active.get("trang_thai"));
            Timestamp moderatedTs = (Timestamp) active.get("thoi_diem_xet");
            Instant moderatedAt = moderatedTs != null ? moderatedTs.toInstant() : null;
            Object moderatorId = active.get("nguoi_xet_id");
            String complaintStatus = (String) active.get("locking_complaint_status");

            if (ReviewPolicy.isComplaintLocked(reviewStatus, complaintStatus)) {
                throw new AuthFailure(
                        409,
                        "REVIEW_COMPLAINT_LOCKED",
                        "Đánh giá đang có khiếu nại hoặc đã bị gỡ nên không thể tải thêm bằng chứng chỉnh sửa."
                );
            }
            if (ReviewPolicy.isModerated(reviewStatus, moderatedAt, moderatorId)) {
                throw new AuthFailure(
                        409,
                        "REVIEW_MODERATED",
                        "Đánh giá đã có quyết định xét duyệt của Kiểm duyệt viên nên không thể chỉnh sửa."
                );
            }
        }
    }

    /**
     * Deletes an unattached draft evidence uploaded by the buyer for this order, immediately freeing user quota.
     * Storage object deletion runs after DB commit so a rolled-back transaction never loses data.
     */
    @Transactional
    public void deleteDraftEvidence(UUID buyerId, UUID orderId, UUID evidenceId) {
        if (buyerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (orderId == null || evidenceId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã giao dịch hoặc mã bằng chứng không hợp lệ.");
        }

        // Lock order: thanh_viens(buyer) FOR UPDATE -> giao_dichs(order) FOR KEY SHARE -> danh_gia_bang_chungs
        reputationLedger.reconcileExpiredTemporaryLock(buyerId);
        List<Map<String, Object>> memberRows = db.queryForList(
                """
                SELECT user_id, diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved,
                       khoa_den_ngay, loai_han_che, ly_do_han_che, cho_phep_khieu_nai
                FROM thanh_viens
                WHERE user_id = ?
                FOR UPDATE
                """,
                buyerId
        );
        verifyActiveMember(memberRows);

        List<Map<String, Object>> orderRows = db.queryForList(
                "SELECT nguoi_mua_id FROM giao_dichs WHERE ma_giao_dich = ? FOR KEY SHARE",
                orderId
        );
        if (orderRows.isEmpty()) {
            throw new AuthFailure(404, "ORDER_NOT_FOUND", "Không tìm thấy giao dịch.");
        }
        if (!buyerId.equals(orderRows.getFirst().get("nguoi_mua_id"))) {
            throw new AuthFailure(403, "FORBIDDEN", "Chỉ người mua của giao dịch mới có quyền xóa bằng chứng nháp.");
        }

        List<Map<String, Object>> evRows = db.queryForList(
                """
                SELECT id, ma_giao_dich, ma_danh_gia, nguoi_tai_len_id, storage_key
                FROM danh_gia_bang_chungs
                WHERE id = ? AND ma_giao_dich = ?
                FOR UPDATE
                """,
                evidenceId,
                orderId
        );
        if (evRows.isEmpty()) {
            throw new AuthFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy bằng chứng nháp.");
        }

        Map<String, Object> row = evRows.getFirst();
        if (!buyerId.equals(row.get("nguoi_tai_len_id"))) {
            throw new AuthFailure(403, "FORBIDDEN", "Bạn không có quyền xóa bằng chứng này.");
        }
        if (row.get("ma_danh_gia") != null) {
            throw new AuthFailure(
                    409,
                    "EVIDENCE_ALREADY_ATTACHED",
                    "Không thể xóa bằng chứng đã được đính kèm vào đánh giá."
            );
        }

        String storageKey = (String) row.get("storage_key");
        int deleted = db.update(
                "DELETE FROM danh_gia_bang_chungs WHERE id = ? AND ma_danh_gia IS NULL",
                evidenceId
        );
        if (deleted > 0 && storageKey != null) {
            if (TransactionSynchronizationManager.isActualTransactionActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        storage.deleteQuietly(storageKey);
                    }
                });
            } else {
                storage.deleteQuietly(storageKey);
            }
        }
    }

    /**
     * Cleans up expired unattached draft evidence rows ({@code ma_danh_gia IS NULL}) from DB & storage
     * (works across both {@code local} and {@code s3} backends), then sweeps any untracked local orphan files.
     */
    public int cleanupExpiredDraftEvidence(Duration draftTtl, int maxDeletes) {
        Duration safeTtl = (draftTtl != null && !draftTtl.isNegative()) ? draftTtl : Duration.ofHours(2);
        int safeMax = maxDeletes > 0 ? Math.min(maxDeletes, 500) : 200;
        Instant cutoff = now().minus(safeTtl);

        // 1. Delete expired DB draft rows (ma_danh_gia IS NULL) atomically and remove their blobs after commit
        List<String> deletedKeys = txTemplate.execute(status -> {
            List<DraftRow> candidates = db.query(
                    """
                    SELECT id, storage_key
                    FROM danh_gia_bang_chungs
                    WHERE ma_danh_gia IS NULL
                      AND created_at < ?
                    ORDER BY created_at ASC, id ASC
                    LIMIT ?
                    FOR UPDATE SKIP LOCKED
                    """,
                    (rs, rowNum) -> new DraftRow(
                            rs.getObject("id", UUID.class),
                            rs.getString("storage_key")
                    ),
                    Timestamp.from(cutoff),
                    safeMax
            );
            List<String> keys = new ArrayList<>(candidates.size());
            for (DraftRow draft : candidates) {
                int removed = db.update(
                        "DELETE FROM danh_gia_bang_chungs WHERE id = ? AND ma_danh_gia IS NULL",
                        draft.id()
                );
                if (removed > 0 && draft.storageKey() != null) {
                    keys.add(draft.storageKey());
                }
            }
            return keys;
        });

        int totalDeleted = 0;
        if (deletedKeys != null) {
            for (String key : deletedKeys) {
                storage.deleteQuietly(key);
                totalDeleted++;
            }
        }

        // 2. Sweep any dangling local files older than cutoff not referenced in danh_gia_bang_chungs
        int remainingBudget = safeMax - totalDeleted;
        if (remainingBudget > 0) {
            int chunkSize = Math.min(remainingBudget, 200);
            int maxScanned = Math.max(remainingBudget * 50, 10_000);
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
                                    "SELECT storage_key FROM danh_gia_bang_chungs WHERE storage_key = ANY(?)"
                            );
                            ps.setArray(1, con.createArrayOf("text", keyArray));
                            return ps;
                        },
                        rs -> {
                            existingKeys.add(rs.getString("storage_key"));
                        }
                );
                for (String key : candidateKeys) {
                    if (counters[0] >= remainingBudget) {
                        return false;
                    }
                    if (!existingKeys.contains(key)) {
                        storage.deleteQuietly(key);
                        counters[0]++;
                    }
                }
                return counters[0] < remainingBudget && counters[1] < maxScanned;
            });
            totalDeleted += counters[0];
        }

        return totalDeleted;
    }

    /**
     * NFR-01 strict ACL download:
     * - Attached evidence: buyer, MODERATOR, SENIOR_ADMIN always allowed; reviewed seller allowed ONLY
     *   when review status is CHAP_NHAN or DA_GO AND (evidence is active OR attached to a CHAP_NHAN/DA_GO version).
     * - Unattached draft evidence: ONLY uploader (buyer), MODERATOR, or SENIOR_ADMIN.
     * - Other authenticated users -> 403 FORBIDDEN; unauthenticated -> 401 (SecurityConfig).
     */
    @Transactional(readOnly = true)
    public ReviewDtos.EvidenceContent loadEvidence(UUID evidenceId, UUID viewerId, boolean isModeratorOrSeniorAdmin) {
        if (viewerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập để xem bằng chứng đánh giá.");
        }
        if (evidenceId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã bằng chứng không hợp lệ.");
        }

        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT e.id, e.ma_danh_gia, e.nguoi_tai_len_id, e.storage_key, e.content_type, e.size_bytes,
                       e.active,
                       d.nguoi_danh_gia_id AS review_buyer_id,
                       d.nguoi_bi_danh_gia_id AS review_seller_id,
                       d.trang_thai AS review_status,
                       EXISTS (
                           SELECT 1
                           FROM danh_gia_phien_bans v
                           WHERE v.ma_danh_gia = e.ma_danh_gia
                             AND v.trang_thai IN ('CHAP_NHAN', 'DA_GO')
                             AND e.id = ANY(v.evidence_ids)
                       ) AS attached_to_seller_visible_version
                FROM danh_gia_bang_chungs e
                LEFT JOIN danh_gias d ON d.ma_danh_gia = e.ma_danh_gia
                WHERE e.id = ?
                """,
                evidenceId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy bằng chứng đánh giá.");
        }

        Map<String, Object> row = rows.getFirst();
        UUID reviewId = (UUID) row.get("ma_danh_gia");
        UUID uploaderId = (UUID) row.get("nguoi_tai_len_id");
        UUID reviewBuyerId = (UUID) row.get("review_buyer_id");
        UUID reviewSellerId = (UUID) row.get("review_seller_id");
        String reviewStatus = (String) row.get("review_status");
        boolean evidenceActive = Boolean.TRUE.equals(row.get("active"));
        boolean attachedToSellerVisibleVersion = Boolean.TRUE.equals(row.get("attached_to_seller_visible_version"));

        boolean sellerVisibleStatus = ReviewDtos.ReviewStatus.CHAP_NHAN.name().equals(reviewStatus)
                || ReviewDtos.ReviewStatus.DA_GO.name().equals(reviewStatus);
        boolean sellerAllowedEvidence = sellerVisibleStatus && (evidenceActive || attachedToSellerVisibleVersion);

        boolean allowed;
        if (isModeratorOrSeniorAdmin) {
            allowed = true;
        } else if (reviewId != null) {
            allowed = viewerId.equals(reviewBuyerId)
                    || (viewerId.equals(reviewSellerId) && sellerAllowedEvidence);
        } else {
            allowed = viewerId.equals(uploaderId);
        }

        if (!allowed) {
            throw new AuthFailure(403, "FORBIDDEN", "Bạn không có quyền truy cập bằng chứng đánh giá này.");
        }

        String storageKey = (String) row.get("storage_key");
        String contentType = (String) row.get("content_type");
        long dbSizeBytes = ((Number) row.get("size_bytes")).longValue();

        Resource resource = storage.loadAsResource(storageKey);
        long resolvedSize;
        try {
            resolvedSize = resource.contentLength();
        } catch (IOException e) {
            resolvedSize = dbSizeBytes;
        }

        return new ReviewDtos.EvidenceContent(evidenceId, contentType, resolvedSize, resource);
    }

    private void verifyActiveMemberReadOnly(List<Map<String, Object>> rows, Instant current) {
        if (rows.isEmpty()) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }
        Map<String, Object> row = rows.getFirst();
        String status = String.valueOf(row.get("trang_thai_tai_khoan"));
        int score = ((Number) row.get("diem_uy_tin")).intValue();
        boolean emailVerified = Boolean.TRUE.equals(row.get("email_verified"));
        boolean profileApproved = Boolean.TRUE.equals(row.get("profile_approved"));

        if ("BI_KHOA".equals(status)) {
            Timestamp lockedUntilTs = (Timestamp) row.get("khoa_den_ngay");
            boolean expiredTempLock = "KHOA_TAM_THOI".equals(row.get("loai_han_che"))
                    && lockedUntilTs != null
                    && !lockedUntilTs.toInstant().isAfter(current);
            if (!expiredTempLock) {
                throw new AccountRestrictedFailure(new AccountRestrictedFailure.RestrictionPayload(
                        status,
                        (String) row.get("loai_han_che"),
                        (String) row.get("ly_do_han_che"),
                        lockedUntilTs != null ? lockedUntilTs.toInstant() : null,
                        Boolean.TRUE.equals(row.get("cho_phep_khieu_nai")),
                        score
                ));
            }
            if (!emailVerified || !profileApproved) {
                throw new AuthFailure(403, "FORBIDDEN", "Tài khoản cần được kích hoạt để tải lên bằng chứng đánh giá.");
            }
            return;
        }
        if (!"HOAT_DONG".equals(status) || !emailVerified || !profileApproved) {
            throw new AuthFailure(403, "FORBIDDEN", "Tài khoản cần được kích hoạt để tải lên bằng chứng đánh giá.");
        }
    }

    private void verifyActiveMember(List<Map<String, Object>> rows) {
        if (rows.isEmpty()) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }
        Map<String, Object> row = rows.getFirst();
        String status = String.valueOf(row.get("trang_thai_tai_khoan"));
        int score = ((Number) row.get("diem_uy_tin")).intValue();
        boolean emailVerified = Boolean.TRUE.equals(row.get("email_verified"));
        boolean profileApproved = Boolean.TRUE.equals(row.get("profile_approved"));

        if ("BI_KHOA".equals(status)) {
            Timestamp lockedUntilTs = (Timestamp) row.get("khoa_den_ngay");
            throw new AccountRestrictedFailure(new AccountRestrictedFailure.RestrictionPayload(
                    status,
                    (String) row.get("loai_han_che"),
                    (String) row.get("ly_do_han_che"),
                    lockedUntilTs != null ? lockedUntilTs.toInstant() : null,
                    Boolean.TRUE.equals(row.get("cho_phep_khieu_nai")),
                    score
            ));
        }
        if (!"HOAT_DONG".equals(status) || !emailVerified || !profileApproved) {
            throw new AuthFailure(403, "FORBIDDEN", "Tài khoản cần được kích hoạt để tải lên bằng chứng đánh giá.");
        }
    }
}
