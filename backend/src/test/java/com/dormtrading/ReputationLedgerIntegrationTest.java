package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.review.reputation.ReputationLedgerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@DisplayName("Kiểm thử Tích hợp Sổ cái Điểm uy tín & Ngưỡng khóa tự động (P1-05 / FR-03, FR-12, NFR-03)")
class ReputationLedgerIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private ReputationLedgerService ledger;

    @Autowired
    private JdbcTemplate db;

    @MockitoBean
    private Clock clock;

    private final AtomicReference<Instant> currentTime = new AtomicReference<>();

    @BeforeEach
    void setUpClock() {
        currentTime.set(Instant.parse("2026-11-18T08:00:00Z"));
        when(clock.instant()).thenAnswer(inv -> currentTime.get());
    }

    private UUID createActiveMember(int initialScore) {
        UUID userId = UUID.randomUUID();
        String suffix = userId.toString().replace("-", "").substring(0, 12);
        db.update(
                "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, diem_uy_tin, " +
                "trang_thai_tai_khoan, email_verified, profile_approved, trang_thai_sv) " +
                "VALUES (?, ?, 'argon2-hash', ?, ?, ?, 'HOAT_DONG', TRUE, TRUE, 'DANG_HOC')",
                userId,
                "u" + suffix + "@student.edu.vn",
                "Sinh Viên " + suffix,
                "SV" + suffix,
                initialScore
        );
        return userId;
    }

    private UUID createActiveSession(UUID userId) {
        UUID sessionId = UUID.randomUUID();
        db.update(
                "INSERT INTO auth_session(id, user_id, client, expires_at, revoked) VALUES (?, ?, 'admin-web', ?, FALSE)",
                sessionId,
                userId,
                Timestamp.from(currentTime.get().plus(Duration.ofDays(30)))
        );
        return sessionId;
    }

    private Map<String, Object> fetchUser(UUID userId) {
        return db.queryForMap("SELECT * FROM thanh_viens WHERE user_id = ?", userId);
    }

    @Test
    @DisplayName("FR-03 & NFR-03: Kích hoạt khởi tạo điểm 100 đúng một lần, gọi lặp lại không cộng lại điểm")
    void activationScoreInitializesTo100Idempotently() {
        UUID actorId = createActiveMember(100);
        UUID newUserId = UUID.randomUUID();
        String suffix = newUserId.toString().replace("-", "").substring(0, 12);
        db.update(
                "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, diem_uy_tin, " +
                "trang_thai_tai_khoan, email_verified, profile_approved) " +
                "VALUES (?, ?, 'hash', 'Tân Sinh Viên', ?, 0, 'HOAT_DONG', TRUE, TRUE)",
                newUserId,
                "new" + suffix + "@student.edu.vn",
                "NS" + suffix
        );

        var first = ledger.initializeActivationScore(newUserId, actorId);
        assertThat(first.idempotentReplay()).isFalse();
        assertThat(first.scoreBefore()).isEqualTo(0);
        assertThat(first.scoreAfter()).isEqualTo(100);
        assertThat(first.delta()).isEqualTo(100);
        var afterInitRow = fetchUser(newUserId);
        assertThat(((Number) afterInitRow.get("diem_uy_tin")).intValue()).isEqualTo(100);
        assertThat(((Number) afterInitRow.get("version")).longValue()).isEqualTo(1L);

        // Deduct 15 points via active penalty scale, then call initializeActivationScore again
        ledger.applyPenaltyScale(newUserId, "TP_BO_HEN_TAI_PHAM", "Bỏ hẹn lần 2", "PEN:" + newUserId, actorId);
        var afterPenaltyRow = fetchUser(newUserId);
        assertThat(((Number) afterPenaltyRow.get("diem_uy_tin")).intValue()).isEqualTo(85);
        assertThat(((Number) afterPenaltyRow.get("version")).longValue()).isEqualTo(2L);

        var replay = ledger.initializeActivationScore(newUserId, actorId);
        assertThat(replay.idempotentReplay()).isTrue();
        assertThat(replay.id()).isEqualTo(first.id());
        // Must NOT overwrite 85 back to 100 or bump version
        var afterReplayRow = fetchUser(newUserId);
        assertThat(((Number) afterReplayRow.get("diem_uy_tin")).intValue()).isEqualTo(85);
        assertThat(((Number) afterReplayRow.get("version")).longValue()).isEqualTo(2L);

        Integer activationCount = db.queryForObject(
                "SELECT count(*) FROM lich_su_diem_uy_tin WHERE user_id = ? AND loai_bien_dong = 'KHOI_TAO_KICH_HOAT'",
                Integer.class,
                newUserId
        );
        assertThat(activationCount).isEqualTo(1);
    }

    @Test
    @DisplayName("FR-12 biên 51, 50, 31, 30, 0 áp dụng đúng khóa tạm 14 ngày và khóa vĩnh viễn có quyền khiếu nại")
    void enforcesExactScoreThresholdBoundaries51And50And31And30And0() {
        // 1) Boundary 51 (> 50): no auto-lock
        UUID u51 = createActiveMember(100);
        UUID s51 = createActiveSession(u51);
        var e51 = ledger.recordScoreChange(
                u51, ReputationLedgerService.CHANGE_MODERATION_ADJUST, -49,
                "Vi phạm mức nhẹ đến 51", "DECISION", "DEC-51", "KEY-51:" + u51, null
        );
        assertThat(e51.scoreAfter()).isEqualTo(51);
        assertThat(e51.triggeredLockType()).isNull();
        assertThat(fetchUser(u51).get("trang_thai_tai_khoan")).isEqualTo("HOAT_DONG");
        assertThat(fetchUser(u51).get("loai_han_che")).isNull();
        assertThat(db.queryForObject("SELECT revoked FROM auth_session WHERE id = ?", Boolean.class, s51)).isFalse();

        // 2) Boundary 50 (30 < diem <= 50): temporary lock 14 days, appealable = false, session revoked
        UUID u50 = createActiveMember(100);
        UUID s50 = createActiveSession(u50);
        var e50 = ledger.applyPenaltyScale(u50, "TP_GIA_MAO_THONG_TIN", "Chạm ngưỡng 50", "KEY-50:" + u50, null);
        assertThat(e50.scoreAfter()).isEqualTo(50);
        assertThat(e50.triggeredLockType()).isEqualTo("KHOA_TAM_THOI");
        var row50 = fetchUser(u50);
        assertThat(row50.get("trang_thai_tai_khoan")).isEqualTo("BI_KHOA");
        assertThat(row50.get("loai_han_che")).isEqualTo("KHOA_TAM_THOI");
        assertThat(((Number) row50.get("version")).longValue()).isEqualTo(1L);
        assertThat(row50.get("cho_phep_khieu_nai")).isEqualTo(false);
        assertThat(((Number) row50.get("diem_da_khoa_tam")).intValue()).isEqualTo(50);
        assertThat(((Timestamp) row50.get("khoa_den_ngay")).toInstant())
                .isEqualTo(currentTime.get().truncatedTo(ChronoUnit.MILLIS).plus(Duration.ofDays(14)));
        assertThat(db.queryForObject("SELECT revoked FROM auth_session WHERE id = ?", Boolean.class, s50)).isTrue();
        assertThat(db.queryForObject(
                "SELECT action_type FROM nhat_ky_kiem_duyet WHERE target_user_id = ?", String.class, u50))
                .isEqualTo("THRESHOLD_LOCK_TEMPORARY");

        // 3) Boundary 31 (30 < diem <= 50): still temporary lock 14 days
        UUID u31 = createActiveMember(51);
        var e31 = ledger.applyPenaltyScale(u31, "TP_NGON_TU_XUC_PHAM", "Chạm ngưỡng 31", "KEY-31:" + u31, null);
        assertThat(e31.scoreAfter()).isEqualTo(31);
        var row31 = fetchUser(u31);
        assertThat(row31.get("trang_thai_tai_khoan")).isEqualTo("BI_KHOA");
        assertThat(row31.get("loai_han_che")).isEqualTo("KHOA_TAM_THOI");
        assertThat(row31.get("cho_phep_khieu_nai")).isEqualTo(false);

        // 4) Boundary 30 (exact 30 is permanent per FR-12!): permanent lock, lockedUntil = null, appealable = true
        UUID u30 = createActiveMember(60);
        UUID s30 = createActiveSession(u30);
        var e30 = ledger.applyPenaltyScale(u30, "TP_KHONG_BAN_GIAO", "Chạm đúng ngưỡng 30", "KEY-30:" + u30, null);
        assertThat(e30.scoreAfter()).isEqualTo(30);
        assertThat(e30.triggeredLockType()).isEqualTo("KHOA_VINH_VIEN");
        var row30 = fetchUser(u30);
        assertThat(row30.get("trang_thai_tai_khoan")).isEqualTo("BI_KHOA");
        assertThat(row30.get("loai_han_che")).isEqualTo("KHOA_VINH_VIEN");
        assertThat(row30.get("khoa_den_ngay")).isNull();
        assertThat(row30.get("cho_phep_khieu_nai")).isEqualTo(true);
        assertThat(db.queryForObject("SELECT revoked FROM auth_session WHERE id = ?", Boolean.class, s30)).isTrue();
        assertThat(db.queryForObject(
                "SELECT action_type FROM nhat_ky_kiem_duyet WHERE target_user_id = ?", String.class, u30))
                .isEqualTo("THRESHOLD_LOCK_PERMANENT");

        // 5) Boundary 0 (clamped at 0 when penalty exceeds remaining score)
        UUID u0 = createActiveMember(15);
        var e0 = ledger.applyPenaltyScale(u0, "TP_KHONG_BAN_GIAO", "Trừ vượt 0", "KEY-0:" + u0, null);
        assertThat(e0.scoreBefore()).isEqualTo(15);
        assertThat(e0.scoreAfter()).isEqualTo(0);
        assertThat(e0.delta()).isEqualTo(-15);
        var row0 = fetchUser(u0);
        assertThat(((Number) row0.get("diem_uy_tin")).intValue()).isEqualTo(0);
        assertThat(row0.get("loai_han_che")).isEqualTo("KHOA_VINH_VIEN");
        assertThat(row0.get("cho_phep_khieu_nai")).isEqualTo(true);
    }

    @Test
    @DisplayName("NFR-03: Trùng idempotency_key trả về bản ghi cũ, không trừ điểm hai lần; từ chối thang phạt không tồn tại")
    void duplicateIdempotencyKeyDoesNotDoubleDeductAndRejectsUnknownPenaltyCode() {
        UUID userId = createActiveMember(100);
        String key = "PENALTY-ONCE:" + userId;

        var first = ledger.applyPenaltyScale(userId, "TP_HANG_KHONG_DUNG_MO_TA", "Sai mô tả", key, null);
        var second = ledger.applyPenaltyScale(userId, "TP_HANG_KHONG_DUNG_MO_TA", "Sai mô tả (gửi lại)", key, null);

        assertThat(first.idempotentReplay()).isFalse();
        assertThat(second.idempotentReplay()).isTrue();
        assertThat(second.id()).isEqualTo(first.id());
        assertThat(((Number) fetchUser(userId).get("diem_uy_tin")).intValue()).isEqualTo(90);

        UUID otherUser = createActiveMember(100);
        assertThatThrownBy(() -> ledger.applyPenaltyScale(otherUser, "TP_BO_HEN_LAN_1", "Khác user", key, null))
                .isInstanceOf(AuthFailure.class)
                .extracting("code")
                .isEqualTo("IDEMPOTENCY_CONFLICT");

        assertThatThrownBy(() -> ledger.applyPenaltyScale(userId, "TP_KHONG_TON_TAI", "Mã lạ", "UNKNOWN:" + userId, null))
                .isInstanceOf(AuthFailure.class)
                .extracting("code")
                .isEqualTo("INVALID_PENALTY_CODE");
    }

    @Test
    @DisplayName("FR-12: Hết 14 ngày khóa tạm mở lại và giữ nguyên điểm cũ, không khóa lại cho tới khi có vi phạm mới")
    void expiredFourteenDayTemporaryLockRestoresAccountKeepingScoreUntilNewViolation() {
        UUID userId = createActiveMember(60);

        // Violation 1 drops 60 -> 45: triggers 14-day temporary lock
        ledger.applyPenaltyScale(userId, "TP_BO_HEN_TAI_PHAM", "Bỏ hẹn tái phạm", "V1:" + userId, null);
        assertThat(fetchUser(userId).get("trang_thai_tai_khoan")).isEqualTo("BI_KHOA");
        assertThat(fetchUser(userId).get("loai_han_che")).isEqualTo("KHOA_TAM_THOI");
        assertThat(((Number) fetchUser(userId).get("diem_uy_tin")).intValue()).isEqualTo(45);

        // Before 14 days (13 days + 23 hours): still locked
        currentTime.set(currentTime.get().plus(Duration.ofDays(13).plusHours(23)));
        assertThat(ledger.reconcileExpiredTemporaryLock(userId)).isFalse();
        assertThat(fetchUser(userId).get("trang_thai_tai_khoan")).isEqualTo("BI_KHOA");

        // At 14 days + 1 second: unlocked, score stays 45, NOT re-locked on subsequent checks or positive score change
        currentTime.set(currentTime.get().plus(Duration.ofHours(1).plusSeconds(1)));
        assertThat(ledger.reconcileExpiredTemporaryLock(userId)).isTrue();
        var unlocked = fetchUser(userId);
        assertThat(unlocked.get("trang_thai_tai_khoan")).isEqualTo("HOAT_DONG");
        assertThat(unlocked.get("loai_han_che")).isNull();
        assertThat(unlocked.get("khoa_den_ngay")).isNull();
        assertThat(((Number) unlocked.get("diem_uy_tin")).intValue()).isEqualTo(45);
        assertThat(((Number) unlocked.get("diem_da_khoa_tam")).intValue()).isEqualTo(45);

        // Repeated reconciliation or positive score restoration (+2 -> 47, still <= 50) must NOT re-lock!
        assertThat(ledger.reconcileExpiredTemporaryLock(userId)).isFalse();
        ledger.recordScoreChange(
                userId, ReputationLedgerService.CHANGE_COMPLAINT_RESTORE, 2,
                "Hoàn điểm khiếu nại", "COMPLAINT", "CMP-1", "POS:" + userId, null
        );
        assertThat(fetchUser(userId).get("trang_thai_tai_khoan")).isEqualTo("HOAT_DONG");
        assertThat(((Number) fetchUser(userId).get("diem_uy_tin")).intValue()).isEqualTo(47);

        // A NEW violation (-5 -> 42) re-evaluates threshold and locks temporarily again for 14 days
        ledger.applyPenaltyScale(userId, "TP_BO_HEN_LAN_1", "Vi phạm mới bỏ hẹn", "V2:" + userId, null);
        var relocked = fetchUser(userId);
        assertThat(relocked.get("trang_thai_tai_khoan")).isEqualTo("BI_KHOA");
        assertThat(relocked.get("loai_han_che")).isEqualTo("KHOA_TAM_THOI");
        assertThat(((Number) relocked.get("diem_uy_tin")).intValue()).isEqualTo(42);

        // Another violation (-15 -> 27 <= 30) escalates to permanent lock with appeal right
        ledger.applyPenaltyScale(userId, "TP_BO_HEN_TAI_PHAM", "Tái phạm chạm <= 30", "V3:" + userId, null);
        var permanent = fetchUser(userId);
        assertThat(permanent.get("trang_thai_tai_khoan")).isEqualTo("BI_KHOA");
        assertThat(permanent.get("loai_han_che")).isEqualTo("KHOA_VINH_VIEN");
        assertThat(permanent.get("khoa_den_ngay")).isNull();
        assertThat(permanent.get("cho_phep_khieu_nai")).isEqualTo(true);
        assertThat(((Number) permanent.get("diem_uy_tin")).intValue()).isEqualTo(27);
    }

    @Test
    @DisplayName("FR-12 bảo vệ VO_HIEU_HOA: Trừ điểm muộn rơi ngưỡng <=50 và <=30 vẫn giữ nguyên VO_HIEU_HOA, không tự khóa hoặc tự mở lại")
    void deletedAccountNeverTransitionsToLockedOrActiveOnLatePenaltyDeductions() {
        UUID deletedUser = createActiveMember(60);
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'VO_HIEU_HOA' WHERE user_id = ?", deletedUser);

        // 1) Late deduction into temporary-lock band (60 - 15 = 45)
        var tempBandEntry = ledger.applyPenaltyScale(
                deletedUser, "TP_BO_HEN_TAI_PHAM", "Trừ điểm muộn sau khi xóa (45)", "DEL-45:" + deletedUser, null
        );
        assertThat(tempBandEntry.scoreAfter()).isEqualTo(45);
        assertThat(tempBandEntry.triggeredLockType()).isNull();

        var afterFirst = fetchUser(deletedUser);
        assertThat(afterFirst.get("trang_thai_tai_khoan")).isEqualTo("VO_HIEU_HOA");
        assertThat(afterFirst.get("loai_han_che")).isNull();
        assertThat(afterFirst.get("khoa_den_ngay")).isNull();
        assertThat(afterFirst.get("cho_phep_khieu_nai")).isEqualTo(false);
        assertThat(((Number) afterFirst.get("version")).longValue()).isEqualTo(1L);

        // Even after 14+ days, reconcileExpiredTemporaryLock must NOT resurrect VO_HIEU_HOA to HOAT_DONG
        currentTime.set(currentTime.get().plus(Duration.ofDays(15)));
        assertThat(ledger.reconcileExpiredTemporaryLock(deletedUser)).isFalse();
        assertThat(fetchUser(deletedUser).get("trang_thai_tai_khoan")).isEqualTo("VO_HIEU_HOA");

        // 2) Late deduction into permanent-lock band (45 - 30 = 15 <= 30)
        var permBandEntry = ledger.applyPenaltyScale(
                deletedUser, "TP_KHONG_BAN_GIAO", "Trừ điểm muộn sau khi xóa (15)", "DEL-15:" + deletedUser, null
        );
        assertThat(permBandEntry.scoreAfter()).isEqualTo(15);
        assertThat(permBandEntry.triggeredLockType()).isNull();

        var afterSecond = fetchUser(deletedUser);
        assertThat(afterSecond.get("trang_thai_tai_khoan")).isEqualTo("VO_HIEU_HOA");
        assertThat(afterSecond.get("loai_han_che")).isNull();
        assertThat(afterSecond.get("khoa_den_ngay")).isNull();
        assertThat(afterSecond.get("cho_phep_khieu_nai")).isEqualTo(false);
        assertThat(((Number) afterSecond.get("version")).longValue()).isEqualTo(2L);

        Integer auditCount = db.queryForObject(
                "SELECT count(*) FROM nhat_ky_kiem_duyet WHERE target_user_id = ?",
                Integer.class,
                deletedUser
        );
        assertThat(auditCount).isZero();
    }

    @Test
    @DisplayName("FR-12 bảo lưu hạn khóa dài hơn: Trừ điểm rơi 30 < điểm <= 50 giữ nguyên khóa > 14 ngày và nâng khóa ngắn < 14 ngày lên 14 ngày")
    void preservesLongerTemporaryLockAndExtendsShorterTemporaryLockOnThresholdDeduction() {
        Instant baseTime = currentTime.get().truncatedTo(ChronoUnit.MILLIS);

        // Case A: Account already temporarily locked for 60 days -> penalty 60 -> 45 MUST keep 60-day expiry
        UUID longLockUser = createActiveMember(60);
        Instant sixtyDaysLater = baseTime.plus(Duration.ofDays(60));
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', " +
                "khoa_den_ngay = ?, ly_do_han_che = 'Khóa tạm thủ công 60 ngày', cho_phep_khieu_nai = FALSE " +
                "WHERE user_id = ?",
                Timestamp.from(sixtyDaysLater),
                longLockUser
        );

        var longEntry = ledger.applyPenaltyScale(
                longLockUser, "TP_BO_HEN_TAI_PHAM", "Trừ điểm khi đang khóa 60 ngày", "LONG-LOCK:" + longLockUser, null
        );
        assertThat(longEntry.scoreAfter()).isEqualTo(45);
        assertThat(longEntry.triggeredLockType()).isEqualTo("KHOA_TAM_THOI");
        assertThat(longEntry.lockedUntil()).isEqualTo(sixtyDaysLater);

        var longRow = fetchUser(longLockUser);
        assertThat(longRow.get("trang_thai_tai_khoan")).isEqualTo("BI_KHOA");
        assertThat(longRow.get("loai_han_che")).isEqualTo("KHOA_TAM_THOI");
        assertThat(((Timestamp) longRow.get("khoa_den_ngay")).toInstant()).isEqualTo(sixtyDaysLater);
        assertThat(((Number) longRow.get("diem_uy_tin")).intValue()).isEqualTo(45);
        assertThat(((Number) longRow.get("version")).longValue()).isEqualTo(1L);

        // Case B: Account temporarily locked for only 5 days -> penalty 60 -> 45 MUST extend expiry to 14 days
        UUID shortLockUser = createActiveMember(60);
        Instant fiveDaysLater = baseTime.plus(Duration.ofDays(5));
        Instant fourteenDaysLater = baseTime.plus(Duration.ofDays(14));
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', " +
                "khoa_den_ngay = ?, ly_do_han_che = 'Khóa tạm thủ công 5 ngày', cho_phep_khieu_nai = FALSE " +
                "WHERE user_id = ?",
                Timestamp.from(fiveDaysLater),
                shortLockUser
        );

        var shortEntry = ledger.applyPenaltyScale(
                shortLockUser, "TP_BO_HEN_TAI_PHAM", "Trừ điểm khi đang khóa 5 ngày", "SHORT-LOCK:" + shortLockUser, null
        );
        assertThat(shortEntry.scoreAfter()).isEqualTo(45);
        assertThat(shortEntry.triggeredLockType()).isEqualTo("KHOA_TAM_THOI");
        assertThat(shortEntry.lockedUntil()).isEqualTo(fourteenDaysLater);

        var shortRow = fetchUser(shortLockUser);
        assertThat(((Timestamp) shortRow.get("khoa_den_ngay")).toInstant()).isEqualTo(fourteenDaysLater);
        assertThat(((Number) shortRow.get("diem_uy_tin")).intValue()).isEqualTo(45);
    }
}
