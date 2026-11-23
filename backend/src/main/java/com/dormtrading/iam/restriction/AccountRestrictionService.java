package com.dormtrading.iam.restriction;

import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.iam.management.UserManagementDtos.UserDetail;
import com.dormtrading.iam.management.UserManagementService;
import com.dormtrading.review.reputation.ReputationLedgerEntry;
import com.dormtrading.review.reputation.ReputationLedgerService;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional(noRollbackFor = AuthFailure.class)
public class AccountRestrictionService {

    public record LockRequest(
            String lockType,
            Integer durationDays,
            String reason,
            Boolean appealable,
            String penaltyCode,
            Long expectedVersion
    ) {
    }

    public record UnlockRequest(
            String reason,
            Long expectedVersion
    ) {
    }

    private final JdbcTemplate db;
    private final Clock clock;
    private final ReputationLedgerService reputationLedger;
    private final UserManagementService userManagement;
    private final ObjectMapper objectMapper;

    public AccountRestrictionService(
            JdbcTemplate db,
            Clock clock,
            ReputationLedgerService reputationLedger,
            UserManagementService userManagement,
            ObjectMapper objectMapper
    ) {
        this.db = db;
        this.clock = clock;
        this.reputationLedger = reputationLedger;
        this.userManagement = userManagement;
        this.objectMapper = objectMapper;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private Timestamp at(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private Map<String, Object> one(String sql, Object... args) {
        var rows = db.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private String requiredReason(String raw) {
        if (raw == null || raw.isBlank() || raw.strip().length() > 1000) {
            throw new AuthFailure(400, "INVALID_INPUT", "Vui lòng nhập lý do hợp lệ (tối đa 1000 ký tự).");
        }
        return raw.strip();
    }

    private void validateExpectedVersionInput(Long expectedVersion) {
        if (expectedVersion != null && expectedVersion < 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Phiên bản đối chiếu (expectedVersion) không hợp lệ.");
        }
    }

    private Set<String> loadActiveAdminRoles(UUID userId, Instant currentTime) {
        var rows = db.queryForList(
                "SELECT loai_vai_tro FROM vai_tro_quan_tri " +
                "WHERE user_id = ? AND trang_thai_hieu_luc = TRUE " +
                "  AND bat_dau <= ? AND (ket_thuc IS NULL OR ket_thuc > ?)",
                String.class,
                userId,
                at(currentTime),
                at(currentTime)
        );
        return new HashSet<>(rows);
    }

    private void enforceRestrictionPrivilege(UUID actorId, UUID targetUserId, Instant currentTime) {
        if (actorId.equals(targetUserId)) {
            throw new AuthFailure(
                    400,
                    "CANNOT_RESTRICT_SELF",
                    "Không thể tự khóa hoặc mở khóa tài khoản của chính mình."
            );
        }
        Set<String> actorRoles = loadActiveAdminRoles(actorId, currentTime);
        Set<String> targetRoles = loadActiveAdminRoles(targetUserId, currentTime);

        boolean actorIsSenior = actorRoles.contains("QUAN_TRI_VIEN_CAP_CAO");
        boolean targetIsStaff = targetRoles.contains("KIEM_DUYET_VIEN")
                || targetRoles.contains("QUAN_TRI_VIEN_CAP_CAO");

        if (!actorIsSenior && targetIsStaff) {
            throw new AuthFailure(
                    403,
                    "INSUFFICIENT_PRIVILEGE",
                    "Kiểm duyệt viên không được khóa hoặc mở khóa Kiểm duyệt viên khác hoặc Quản trị viên cấp cao."
            );
        }
    }

    public UserDetail lockAccount(UUID actorId, UUID targetUserId, LockRequest request) {
        if (actorId == null || targetUserId == null || request == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thông tin khóa tài khoản không hợp lệ.");
        }
        String reason = requiredReason(request.reason());
        validateExpectedVersionInput(request.expectedVersion());

        String lockTypeInput = request.lockType() == null ? "" : request.lockType().strip();
        if (!Set.of("TEMPORARY", "PERMANENT").contains(lockTypeInput)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Loại khóa phải là TEMPORARY hoặc PERMANENT.");
        }

        int durationDays = 14;
        if ("TEMPORARY".equals(lockTypeInput)) {
            durationDays = request.durationDays() == null ? 14 : request.durationDays();
            if (durationDays < 1 || durationDays > 365) {
                throw new AuthFailure(400, "INVALID_INPUT", "Thời hạn khóa tạm thời phải từ 1 đến 365 ngày.");
            }
        }

        if (actorId.equals(targetUserId)) {
            throw new AuthFailure(
                    400,
                    "CANNOT_RESTRICT_SELF",
                    "Không thể tự khóa hoặc mở khóa tài khoản của chính mình."
            );
        }

        var lockedRow = one("SELECT * FROM thanh_viens WHERE user_id = ? FOR UPDATE", targetUserId);
        if (lockedRow == null) {
            throw new AuthFailure(404, "USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }

        Instant currentTime = now();
        enforceRestrictionPrivilege(actorId, targetUserId, currentTime);

        if ("VO_HIEU_HOA".equals(lockedRow.get("trang_thai_tai_khoan"))) {
            throw new AuthFailure(409, "ACCOUNT_DELETED", "Tài khoản người dùng đã bị vô hiệu hóa hoặc xóa.");
        }

        long currentVersion = ((Number) lockedRow.get("version")).longValue();
        if (request.expectedVersion() != null && request.expectedVersion().longValue() != currentVersion) {
            throw new AuthFailure(
                    409,
                    "STATE_CONFLICT",
                    "Trạng thái tài khoản vừa bị thay đổi đồng thời. Vui lòng tải lại dữ liệu mới nhất."
            );
        }

        if (reputationLedger.reconcileExpiredTemporaryLock(targetUserId)) {
            lockedRow = one("SELECT * FROM thanh_viens WHERE user_id = ?", targetUserId);
        }
        String previousStatus = (String) lockedRow.get("trang_thai_tai_khoan");

        ReputationLedgerEntry penaltyEntry = null;
        String normalizedPenaltyCode = null;
        if (request.penaltyCode() != null && !request.penaltyCode().isBlank()) {
            normalizedPenaltyCode = request.penaltyCode().strip();
            penaltyEntry = reputationLedger.applyPenaltyScaleForManualLock(
                    targetUserId,
                    normalizedPenaltyCode,
                    reason,
                    "MOD_LOCK:" + UUID.randomUUID(),
                    actorId
            );
            lockedRow = one("SELECT * FROM thanh_viens WHERE user_id = ?", targetUserId);
        }

        int currentScore = ((Number) lockedRow.get("diem_uy_tin")).intValue();
        boolean penaltyTriggeredPermanent = penaltyEntry != null
                && currentScore <= ReputationLedgerService.PERMANENT_LOCK_MAX_SCORE;
        boolean penaltyTriggeredTemp = penaltyEntry != null
                && currentScore > ReputationLedgerService.PERMANENT_LOCK_MAX_SCORE
                && currentScore <= ReputationLedgerService.TEMPORARY_LOCK_MAX_SCORE;

        String dbLockType;
        Instant lockedUntil;
        boolean appealable;
        String auditAction;
        String effectiveReason = reason;
        Integer tempLockedScore = (Integer) lockedRow.get("diem_da_khoa_tam");

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("reputationScore", currentScore);
        if (normalizedPenaltyCode != null) {
            details.put("penaltyCode", normalizedPenaltyCode);
        }
        if (penaltyEntry != null) {
            details.put("ledgerEntryId", penaltyEntry.id().toString());
        }

        if ("PERMANENT".equals(lockTypeInput)) {
            dbLockType = "KHOA_VINH_VIEN";
            lockedUntil = null;
            appealable = penaltyTriggeredPermanent
                    ? true
                    : (request.appealable() == null ? true : request.appealable());
            auditAction = "LOCK_PERMANENT";
        } else if (penaltyTriggeredPermanent) {
            // FR-12 escalation: NEVER allow a manual TEMPORARY request to downgrade score <= 30 permanent lock.
            dbLockType = "KHOA_VINH_VIEN";
            lockedUntil = null;
            appealable = true;
            auditAction = "THRESHOLD_LOCK_PERMANENT";
            effectiveReason = "Khóa vĩnh viễn theo ngưỡng điểm uy tín (điểm = " + currentScore + " ≤ 30): " + reason;
            details.put("requestedLockType", "TEMPORARY");
            details.put("requestedDurationDays", durationDays);
            details.put("escalatedByReputationThreshold", true);
        } else {
            int minimumThresholdDays = (int) ReputationLedgerService.TEMPORARY_LOCK_DURATION.toDays();
            int effectiveDurationDays = penaltyTriggeredTemp
                    ? Math.max(durationDays, minimumThresholdDays)
                    : durationDays;
            dbLockType = "KHOA_TAM_THOI";
            lockedUntil = currentTime.plus(Duration.ofDays(effectiveDurationDays));
            appealable = Boolean.TRUE.equals(request.appealable());
            auditAction = "LOCK_TEMPORARY";
            if (currentScore <= ReputationLedgerService.TEMPORARY_LOCK_MAX_SCORE) {
                tempLockedScore = Integer.valueOf(currentScore);
            }
            details.put("durationDays", effectiveDurationDays);
            if (effectiveDurationDays != durationDays) {
                details.put("requestedDurationDays", durationDays);
                details.put("enforcedMinimumThresholdDays", true);
            }
        }

        db.update(
                "UPDATE thanh_viens " +
                "SET trang_thai_tai_khoan = 'BI_KHOA', " +
                "    loai_han_che = ?, " +
                "    khoa_den_ngay = ?, " +
                "    ly_do_han_che = ?, " +
                "    cho_phep_khieu_nai = ?, " +
                "    diem_da_khoa_tam = ?, " +
                "    updated_at = ?, " +
                "    version = version + 1 " +
                "WHERE user_id = ?",
                dbLockType,
                at(lockedUntil),
                effectiveReason,
                appealable,
                tempLockedScore,
                at(currentTime),
                targetUserId
        );

        // Revoke admin-web sessions immediately; mobile sessions lose ROLE_MEMBER on next DB check (UC-03 3.2)
        db.update("UPDATE auth_session SET revoked = TRUE WHERE user_id = ? AND client = 'admin-web'", targetUserId);

        db.update(
                "INSERT INTO nhat_ky_kiem_duyet(" +
                "id, target_user_id, actor_user_id, action_type, reason, previous_status, new_status, " +
                "lock_type, locked_until, appealable, details, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, 'BI_KHOA', ?, ?, ?, CAST(? AS jsonb), ?)",
                UUID.randomUUID(),
                targetUserId,
                actorId,
                auditAction,
                effectiveReason,
                previousStatus,
                dbLockType,
                at(lockedUntil),
                appealable,
                toJson(details),
                at(currentTime)
        );

        return userManagement.getUserDetail(targetUserId);
    }

    public UserDetail unlockAccount(UUID actorId, UUID targetUserId, UnlockRequest request) {
        if (actorId == null || targetUserId == null || request == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thông tin mở khóa tài khoản không hợp lệ.");
        }
        String reason = requiredReason(request.reason());
        validateExpectedVersionInput(request.expectedVersion());

        if (actorId.equals(targetUserId)) {
            throw new AuthFailure(
                    400,
                    "CANNOT_RESTRICT_SELF",
                    "Không thể tự khóa hoặc mở khóa tài khoản của chính mình."
            );
        }

        var lockedRow = one("SELECT * FROM thanh_viens WHERE user_id = ? FOR UPDATE", targetUserId);
        if (lockedRow == null) {
            throw new AuthFailure(404, "USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }

        Instant currentTime = now();
        enforceRestrictionPrivilege(actorId, targetUserId, currentTime);

        String currentStatus = (String) lockedRow.get("trang_thai_tai_khoan");
        if ("VO_HIEU_HOA".equals(currentStatus)) {
            throw new AuthFailure(409, "ACCOUNT_DELETED", "Tài khoản người dùng đã bị vô hiệu hóa hoặc xóa.");
        }

        long currentVersion = ((Number) lockedRow.get("version")).longValue();
        if (request.expectedVersion() != null && request.expectedVersion().longValue() != currentVersion) {
            throw new AuthFailure(
                    409,
                    "STATE_CONFLICT",
                    "Trạng thái tài khoản vừa bị thay đổi đồng thời. Vui lòng tải lại dữ liệu mới nhất."
            );
        }

        if (reputationLedger.reconcileExpiredTemporaryLock(targetUserId)) {
            lockedRow = one("SELECT * FROM thanh_viens WHERE user_id = ?", targetUserId);
            currentStatus = (String) lockedRow.get("trang_thai_tai_khoan");
        }

        if (!"BI_KHOA".equals(currentStatus)) {
            throw new AuthFailure(409, "ACCOUNT_NOT_LOCKED", "Tài khoản hiện không ở trạng thái bị khóa.");
        }

        boolean fullyVerified = Boolean.TRUE.equals(lockedRow.get("email_verified"))
                && Boolean.TRUE.equals(lockedRow.get("profile_approved"));
        String restoredStatus = fullyVerified ? "HOAT_DONG" : "CHO_KICH_HOAT";
        int currentScore = ((Number) lockedRow.get("diem_uy_tin")).intValue();
        Integer tempLockedScore = (Integer) lockedRow.get("diem_da_khoa_tam");
        if (currentScore <= ReputationLedgerService.TEMPORARY_LOCK_MAX_SCORE) {
            tempLockedScore = Integer.valueOf(currentScore);
        }
        String previousLockType = (String) lockedRow.get("loai_han_che");

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
                tempLockedScore,
                at(currentTime),
                targetUserId
        );

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("reputationScoreKept", currentScore);
        if (previousLockType != null) {
            details.put("previousLockType", previousLockType);
        }

        db.update(
                "INSERT INTO nhat_ky_kiem_duyet(" +
                "id, target_user_id, actor_user_id, action_type, reason, previous_status, new_status, " +
                "lock_type, locked_until, appealable, details, created_at) " +
                "VALUES (?, ?, ?, 'UNLOCK_MANUAL', ?, 'BI_KHOA', ?, NULL, NULL, FALSE, CAST(? AS jsonb), ?)",
                UUID.randomUUID(),
                targetUserId,
                actorId,
                reason,
                restoredStatus,
                toJson(details),
                at(currentTime)
        );

        return userManagement.getUserDetail(targetUserId);
    }

    private String toJson(Map<String, Object> map) {
        try {
            return objectMapper.writeValueAsString(map);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize audit details", e);
        }
    }
}
