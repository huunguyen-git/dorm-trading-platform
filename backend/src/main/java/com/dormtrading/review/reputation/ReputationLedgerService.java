package com.dormtrading.review.reputation;

import com.dormtrading.iam.auth.AuthFailure;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional(noRollbackFor = AuthFailure.class)
public class ReputationLedgerService {

    public static final int INITIAL_ACTIVATION_SCORE = 100;
    public static final int TEMPORARY_LOCK_MAX_SCORE = 50;
    public static final int PERMANENT_LOCK_MAX_SCORE = 30;
    public static final Duration TEMPORARY_LOCK_DURATION = Duration.ofDays(14);

    public static final String CHANGE_ACTIVATION = "KHOI_TAO_KICH_HOAT";
    public static final String CHANGE_PENALTY_SCALE = "XU_PHAT_THANG_PHAT";
    public static final String CHANGE_MODERATION_ADJUST = "DIEU_CHINH_KIEM_DUYET";
    public static final String CHANGE_TRANSACTION_REVIEW = "DANH_GIA_GIAO_DICH";
    public static final String CHANGE_COMPLAINT_RESTORE = "KHIEU_NAI_HOAN_DIEM";

    private static final Set<String> ALLOWED_CHANGE_TYPES = Set.of(
            CHANGE_ACTIVATION,
            CHANGE_PENALTY_SCALE,
            CHANGE_MODERATION_ADJUST,
            CHANGE_TRANSACTION_REVIEW,
            CHANGE_COMPLAINT_RESTORE
    );

    private final JdbcTemplate db;
    private final Clock clock;
    private final ObjectMapper objectMapper;

    public ReputationLedgerService(JdbcTemplate db, Clock clock, ObjectMapper objectMapper) {
        this.db = db;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private Timestamp at(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private Instant toInstant(Object ts) {
        return ts == null ? null : ((Timestamp) ts).toInstant();
    }

    private Map<String, Object> one(String sql, Object... args) {
        var rows = db.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private String toJson(Map<String, Object> map) {
        try {
            return objectMapper.writeValueAsString(map);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize audit details", e);
        }
    }

    private String requiredText(String value, int maxLength, String message) {
        if (value == null || value.isBlank() || value.strip().length() > maxLength) {
            throw new AuthFailure(400, "INVALID_INPUT", message);
        }
        return value.strip();
    }

    private boolean isExpiredTemporaryLock(Map<String, Object> row, Instant currentTime) {
        if (row == null) {
            return false;
        }
        String status = (String) row.get("trang_thai_tai_khoan");
        String lockType = (String) row.get("loai_han_che");
        Instant lockedUntil = toInstant(row.get("khoa_den_ngay"));
        return "BI_KHOA".equals(status)
                && "KHOA_TAM_THOI".equals(lockType)
                && lockedUntil != null
                && !lockedUntil.isAfter(currentTime);
    }

    /**
     * Reconciles an expired temporary lock lazily using injected Clock and row-level lock.
     * Per FR-12: after 14 days, unlocks the account while keeping the existing reputation score
     * and recording diem_da_khoa_tam so the old score never triggers another auto-lock.
     */
    public boolean reconcileExpiredTemporaryLock(UUID userId) {
        if (userId == null) {
            return false;
        }
        // Fast lock-free check avoids serializing concurrent requests via FOR UPDATE when not expired.
        var quickCheck = one(
                "SELECT trang_thai_tai_khoan, loai_han_che, khoa_den_ngay FROM thanh_viens WHERE user_id = ?",
                userId
        );
        if (!isExpiredTemporaryLock(quickCheck, now())) {
            return false;
        }
        var userRow = one("SELECT * FROM thanh_viens WHERE user_id = ? FOR UPDATE", userId);
        if (userRow == null) {
            return false;
        }
        return reconcileLockedRow(userRow);
    }

    private boolean reconcileLockedRow(Map<String, Object> userRow) {
        Instant currentTime = now();
        if (!isExpiredTemporaryLock(userRow, currentTime)) {
            return false;
        }
        String status = (String) userRow.get("trang_thai_tai_khoan");
        Instant lockedUntil = toInstant(userRow.get("khoa_den_ngay"));

        UUID userId = (UUID) userRow.get("user_id");
        boolean fullyVerified = Boolean.TRUE.equals(userRow.get("email_verified"))
                && Boolean.TRUE.equals(userRow.get("profile_approved"));
        String restoredStatus = fullyVerified ? "HOAT_DONG" : "CHO_KICH_HOAT";
        int currentScore = ((Number) userRow.get("diem_uy_tin")).intValue();

        db.update(
                "UPDATE thanh_viens " +
                "SET trang_thai_tai_khoan = ?, " +
                "    loai_han_che = NULL, " +
                "    khoa_den_ngay = NULL, " +
                "    ly_do_han_che = NULL, " +
                "    cho_phep_khieu_nai = FALSE, " +
                "    diem_da_khoa_tam = ?, " +
                "    updated_at = ?, " +
                "    version = version + 1 " +
                "WHERE user_id = ?",
                restoredStatus,
                currentScore,
                at(currentTime),
                userId
        );

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("reputationScoreKept", currentScore);
        details.put("expiredLockedUntil", lockedUntil.toString());

        db.update(
                "INSERT INTO nhat_ky_kiem_duyet(" +
                "id, target_user_id, actor_user_id, action_type, reason, previous_status, new_status, " +
                "lock_type, locked_until, appealable, details, created_at) " +
                "VALUES (?, ?, NULL, 'UNLOCK_EXPIRED_TEMP', ?, ?, ?, NULL, NULL, FALSE, CAST(? AS jsonb), ?)",
                UUID.randomUUID(),
                userId,
                "Tự động mở khóa sau khi hết thời hạn khóa tạm thời 14 ngày (giữ nguyên điểm uy tín theo FR-12).",
                status,
                restoredStatus,
                toJson(details),
                at(currentTime)
        );
        return true;
    }

    /**
     * FR-03 & NFR-03: Idempotently initializes reputation score to 100 upon account activation.
     * Repeated invocations for the same user return the original ledger entry without re-crediting.
     */
    public ReputationLedgerEntry initializeActivationScore(UUID userId, UUID actorId) {
        if (userId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thiếu định danh người dùng.");
        }
        String idempotencyKey = "ACTIVATION:" + userId;

        var userRow = one("SELECT * FROM thanh_viens WHERE user_id = ? FOR UPDATE", userId);
        if (userRow == null) {
            throw new AuthFailure(404, "USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }

        var existing = one("SELECT * FROM lich_su_diem_uy_tin WHERE idempotency_key = ?", idempotencyKey);
        if (existing != null) {
            return mapLedgerEntry(existing, true, null, null);
        }

        int scoreBefore = ((Number) userRow.get("diem_uy_tin")).intValue();
        int scoreAfter = INITIAL_ACTIVATION_SCORE;
        int delta = scoreAfter - scoreBefore;
        Instant createdAt = now();
        UUID entryId = UUID.randomUUID();

        db.update(
                "UPDATE thanh_viens SET diem_uy_tin = ?, updated_at = ?, version = version + 1 WHERE user_id = ?",
                scoreAfter,
                at(createdAt),
                userId
        );

        db.update(
                "INSERT INTO lich_su_diem_uy_tin(" +
                "id, user_id, loai_bien_dong, diem_thay_doi, diem_truoc, diem_sau, " +
                "ly_do, nguon_tham_chieu, ma_tham_chieu, idempotency_key, nguoi_thuc_hien_id, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                entryId,
                userId,
                CHANGE_ACTIVATION,
                delta,
                scoreBefore,
                scoreAfter,
                "Khởi tạo điểm uy tín ban đầu khi kích hoạt tài khoản",
                "ACCOUNT_ACTIVATION",
                userId.toString(),
                idempotencyKey,
                actorId,
                at(createdAt)
        );

        return new ReputationLedgerEntry(
                entryId,
                userId,
                CHANGE_ACTIVATION,
                delta,
                scoreBefore,
                scoreAfter,
                "Khởi tạo điểm uy tín ban đầu khi kích hoạt tài khoản",
                "ACCOUNT_ACTIVATION",
                userId.toString(),
                idempotencyKey,
                actorId,
                createdAt,
                false,
                null,
                null
        );
    }

    /**
     * FR-12 & NFR-03: Applies an active penalty scale from thang_phats without inventing arbitrary penalty points.
     */
    public ReputationLedgerEntry applyPenaltyScale(
            UUID userId,
            String penaltyCode,
            String reason,
            String idempotencyKey,
            UUID actorId
    ) {
        return applyPenaltyScaleInternal(userId, penaltyCode, reason, idempotencyKey, actorId, true, true);
    }

    /**
     * Applies an active penalty scale inside an existing manual lock flow so AccountRestrictionService
     * performs the single version bump and writes one unified moderation audit entry.
     */
    public ReputationLedgerEntry applyPenaltyScaleForManualLock(
            UUID userId,
            String penaltyCode,
            String reason,
            String idempotencyKey,
            UUID actorId
    ) {
        return applyPenaltyScaleInternal(userId, penaltyCode, reason, idempotencyKey, actorId, false, false);
    }

    private ReputationLedgerEntry applyPenaltyScaleInternal(
            UUID userId,
            String penaltyCode,
            String reason,
            String idempotencyKey,
            UUID actorId,
            boolean evaluateThresholdLock,
            boolean incrementVersion
    ) {
        String normalizedCode = requiredText(penaltyCode, 50, "Mã thang phạt không hợp lệ.");
        var scaleRow = one(
                "SELECT ma_thang_phat, ten, diem_tru, trang_thai FROM thang_phats WHERE ma_thang_phat = ?",
                normalizedCode
        );
        if (scaleRow == null || !"DANG_DUNG".equals(scaleRow.get("trang_thai"))) {
            throw new AuthFailure(400, "INVALID_PENALTY_CODE", "Mã thang phạt không tồn tại hoặc không còn hiệu lực.");
        }
        int penaltyPoints = ((Number) scaleRow.get("diem_tru")).intValue();
        String effectiveReason = (reason == null || reason.isBlank())
                ? scaleRow.get("ten").toString()
                : reason.strip();

        return recordScoreChangeInternal(
                userId,
                CHANGE_PENALTY_SCALE,
                -penaltyPoints,
                effectiveReason,
                "PENALTY_SCALE",
                normalizedCode,
                idempotencyKey,
                actorId,
                evaluateThresholdLock,
                incrementVersion
        );
    }

    /**
     * Records an atomic, idempotent reputation score change and evaluates FR-12 lock thresholds
     * on negative violation events (requestedDelta < 0).
     */
    public ReputationLedgerEntry recordScoreChange(
            UUID userId,
            String changeType,
            int requestedDelta,
            String reason,
            String referenceSource,
            String referenceId,
            String idempotencyKey,
            UUID actorId
    ) {
        return recordScoreChangeInternal(
                userId,
                changeType,
                requestedDelta,
                reason,
                referenceSource,
                referenceId,
                idempotencyKey,
                actorId,
                true,
                true
        );
    }

    private ReputationLedgerEntry recordScoreChangeInternal(
            UUID userId,
            String changeType,
            int requestedDelta,
            String reason,
            String referenceSource,
            String referenceId,
            String idempotencyKey,
            UUID actorId,
            boolean evaluateThresholdLock,
            boolean incrementVersion
    ) {
        if (userId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thiếu định danh người dùng.");
        }
        if (changeType == null || !ALLOWED_CHANGE_TYPES.contains(changeType)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Loại biến động điểm uy tín không hợp lệ.");
        }
        String cleanReason = requiredText(reason, 1000, "Lý do biến động điểm không hợp lệ.");
        String cleanSource = requiredText(referenceSource, 50, "Nguồn tham chiếu không hợp lệ.");
        String cleanKey = requiredText(idempotencyKey, 150, "Idempotency key không hợp lệ.");
        String cleanRefId = (referenceId == null || referenceId.isBlank()) ? null : requiredText(referenceId, 100, "Mã tham chiếu quá dài.");

        var userRow = one("SELECT * FROM thanh_viens WHERE user_id = ? FOR UPDATE", userId);
        if (userRow == null) {
            throw new AuthFailure(404, "USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }

        var existing = one("SELECT * FROM lich_su_diem_uy_tin WHERE idempotency_key = ?", cleanKey);
        if (existing != null) {
            if (!userId.equals(existing.get("user_id"))) {
                throw new AuthFailure(409, "IDEMPOTENCY_CONFLICT", "Idempotency key đã gắn với người dùng khác.");
            }
            return mapLedgerEntry(existing, true, null, null);
        }

        if (reconcileLockedRow(userRow)) {
            userRow = one("SELECT * FROM thanh_viens WHERE user_id = ?", userId);
        }

        int scoreBefore = ((Number) userRow.get("diem_uy_tin")).intValue();
        long unclamped = (long) scoreBefore + requestedDelta;
        int scoreAfter = (int) Math.max(0L, Math.min(Integer.MAX_VALUE, unclamped));
        int actualDelta = scoreAfter - scoreBefore;
        Instant currentTime = now();
        UUID entryId = UUID.randomUUID();

        String previousStatus = (String) userRow.get("trang_thai_tai_khoan");
        String existingLockType = (String) userRow.get("loai_han_che");
        boolean canApplyThresholdLock = evaluateThresholdLock
                && requestedDelta < 0
                && !"VO_HIEU_HOA".equals(previousStatus);

        String triggeredLockType = null;
        Instant triggeredLockedUntil = null;
        String lockReason = null;
        String auditAction = null;

        if (canApplyThresholdLock && scoreAfter <= PERMANENT_LOCK_MAX_SCORE) {
            triggeredLockType = "KHOA_VINH_VIEN";
            lockReason = "Khóa vĩnh viễn tự động theo ngưỡng điểm uy tín (điểm = " + scoreAfter + " ≤ 30): " + cleanReason;
            auditAction = "THRESHOLD_LOCK_PERMANENT";
        } else if (canApplyThresholdLock
                && scoreAfter <= TEMPORARY_LOCK_MAX_SCORE
                && !("BI_KHOA".equals(previousStatus) && "KHOA_VINH_VIEN".equals(existingLockType))) {
            triggeredLockType = "KHOA_TAM_THOI";
            triggeredLockedUntil = currentTime.plus(TEMPORARY_LOCK_DURATION);
            lockReason = "Khóa tạm thời 14 ngày tự động theo ngưỡng điểm uy tín (30 < điểm = " + scoreAfter + " ≤ 50): " + cleanReason;
            auditAction = "THRESHOLD_LOCK_TEMPORARY";
        }

        String versionClause = incrementVersion ? ", version = version + 1" : "";
        if ("KHOA_VINH_VIEN".equals(triggeredLockType)) {
            db.update(
                    "UPDATE thanh_viens " +
                    "SET diem_uy_tin = ?, " +
                    "    trang_thai_tai_khoan = 'BI_KHOA', " +
                    "    loai_han_che = 'KHOA_VINH_VIEN', " +
                    "    khoa_den_ngay = NULL, " +
                    "    cho_phep_khieu_nai = TRUE, " +
                    "    ly_do_han_che = ?, " +
                    "    updated_at = ?" +
                    versionClause + " " +
                    "WHERE user_id = ?",
                    scoreAfter,
                    lockReason,
                    at(currentTime),
                    userId
            );
        } else if ("KHOA_TAM_THOI".equals(triggeredLockType)) {
            db.update(
                    "UPDATE thanh_viens " +
                    "SET diem_uy_tin = ?, " +
                    "    trang_thai_tai_khoan = 'BI_KHOA', " +
                    "    loai_han_che = 'KHOA_TAM_THOI', " +
                    "    khoa_den_ngay = ?, " +
                    "    cho_phep_khieu_nai = FALSE, " +
                    "    diem_da_khoa_tam = ?, " +
                    "    ly_do_han_che = ?, " +
                    "    updated_at = ?" +
                    versionClause + " " +
                    "WHERE user_id = ?",
                    scoreAfter,
                    at(triggeredLockedUntil),
                    scoreAfter,
                    lockReason,
                    at(currentTime),
                    userId
            );
        } else {
            db.update(
                    "UPDATE thanh_viens SET diem_uy_tin = ?, updated_at = ?" + versionClause + " WHERE user_id = ?",
                    scoreAfter,
                    at(currentTime),
                    userId
            );
        }

        db.update(
                "INSERT INTO lich_su_diem_uy_tin(" +
                "id, user_id, loai_bien_dong, diem_thay_doi, diem_truoc, diem_sau, " +
                "ly_do, nguon_tham_chieu, ma_tham_chieu, idempotency_key, nguoi_thuc_hien_id, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                entryId,
                userId,
                changeType,
                actualDelta,
                scoreBefore,
                scoreAfter,
                cleanReason,
                cleanSource,
                cleanRefId,
                cleanKey,
                actorId,
                at(currentTime)
        );

        if (triggeredLockType != null) {
            db.update("UPDATE auth_session SET revoked = TRUE WHERE user_id = ? AND client = 'admin-web'", userId);

            boolean appealable = "KHOA_VINH_VIEN".equals(triggeredLockType);
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("scoreBefore", scoreBefore);
            details.put("scoreAfter", scoreAfter);
            details.put("ledgerEntryId", entryId.toString());
            details.put("referenceSource", cleanSource);
            if (cleanRefId != null) {
                details.put("referenceId", cleanRefId);
            }

            db.update(
                    "INSERT INTO nhat_ky_kiem_duyet(" +
                    "id, target_user_id, actor_user_id, action_type, reason, previous_status, new_status, " +
                    "lock_type, locked_until, appealable, details, created_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?, 'BI_KHOA', ?, ?, ?, CAST(? AS jsonb), ?)",
                    UUID.randomUUID(),
                    userId,
                    actorId,
                    auditAction,
                    lockReason,
                    previousStatus,
                    triggeredLockType,
                    at(triggeredLockedUntil),
                    appealable,
                    toJson(details),
                    at(currentTime)
            );
        }

        return new ReputationLedgerEntry(
                entryId,
                userId,
                changeType,
                actualDelta,
                scoreBefore,
                scoreAfter,
                cleanReason,
                cleanSource,
                cleanRefId,
                cleanKey,
                actorId,
                currentTime,
                false,
                triggeredLockType,
                triggeredLockedUntil
        );
    }

    private ReputationLedgerEntry mapLedgerEntry(
            Map<String, Object> row,
            boolean idempotentReplay,
            String triggeredLockType,
            Instant lockedUntil
    ) {
        return new ReputationLedgerEntry(
                (UUID) row.get("id"),
                (UUID) row.get("user_id"),
                (String) row.get("loai_bien_dong"),
                ((Number) row.get("diem_thay_doi")).intValue(),
                ((Number) row.get("diem_truoc")).intValue(),
                ((Number) row.get("diem_sau")).intValue(),
                (String) row.get("ly_do"),
                (String) row.get("nguon_tham_chieu"),
                (String) row.get("ma_tham_chieu"),
                (String) row.get("idempotency_key"),
                (UUID) row.get("nguoi_thuc_hien_id"),
                toInstant(row.get("created_at")),
                idempotentReplay,
                triggeredLockType,
                lockedUntil
        );
    }
}
