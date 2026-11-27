package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import com.dormtrading.review.reputation.ReputationLedgerService;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

@Import(AccountRestrictionApiTest.MemberProbeController.class)
@DisplayName("Kiểm thử Tích hợp Khóa / Mở khóa Tài khoản & Tự mở sau 14 ngày (P1-05 / UC-13, UC-14, FR-12)")
class AccountRestrictionApiTest extends BaseIntegrationTest {

    private static final String PASSWORD = "a quiet river beneath stars";
    private static final String ALLOWED_ORIGIN = "http://localhost:5173";

    @RestController
    static class MemberProbeController {
        @PostMapping("/api/v1/restriction-probe/member-write")
        String memberWrite() {
            return "allowed";
        }
    }

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private ReputationLedgerService reputationLedger;

    @Autowired
    private JdbcTemplate db;

    @MockitoBean
    private JavaMailSender mail;

    @MockitoBean
    private Clock clock;

    private final AtomicReference<Instant> currentTime = new AtomicReference<>();
    private final ConcurrentMap<String, String> otpCodes = new ConcurrentHashMap<>();

    @BeforeEach
    void setUp() {
        currentTime.set(Instant.now());
        when(clock.instant()).thenAnswer(inv -> currentTime.get());
        doAnswer(inv -> {
            var msg = (SimpleMailMessage) inv.getArgument(0);
            var matcher = Pattern.compile("[0-9]{6}").matcher(msg.getText());
            if (matcher.find()) {
                otpCodes.put(msg.getTo()[0], matcher.group());
            }
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));
    }

    private record TestAccount(UUID id, String email, String studentId) {
    }

    private TestAccount createAccount(boolean activate, String adminRole) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "RS" + suffix;
        String email = "r" + suffix + "@student.edu.vn";

        var challenge = auth.register("Thành Viên " + suffix, studentId, email, PASSWORD, suffix);
        delivery.deliver();
        auth.verify(challenge.challengeId(), email, "REGISTER", otpCodes.get(email), suffix);
        UUID userId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email);
        if (activate) {
            db.update(
                    "UPDATE thanh_viens SET profile_approved = TRUE, trang_thai_tai_khoan = 'HOAT_DONG' WHERE user_id = ?",
                    userId
            );
            reputationLedger.initializeActivationScore(userId, null);
        }
        if (adminRole != null) {
            db.update(
                    "INSERT INTO vai_tro_quan_tri(user_id, loai_vai_tro, bat_dau, trang_thai_hieu_luc) VALUES (?, ?, ?, TRUE)",
                    userId,
                    adminRole,
                    Timestamp.from(currentTime.get().minusSeconds(60))
            );
        }
        return new TestAccount(userId, email, studentId);
    }

    private AuthService.Session loginMobileSession(TestAccount account) {
        return auth.login(account.email(), PASSWORD, "mobile", account.studentId());
    }

    private String loginAdminWeb(TestAccount account) {
        return auth.login(account.email(), PASSWORD, "admin-web", account.studentId()).token();
    }

    @Test
    @DisplayName("UC-13 & UC-14: Khóa tạm/vĩnh viễn, mất ngay ROLE_MEMBER, kiểm tra expectedVersion/tài khoản xóa, mở khóa thủ công và lưu vết")
    void locksTemporarilyAndPermanentlyStripsMemberPrivilegeEnforcesVersionAndUnlocksWithAudit() {
        var moderator = createAccount(true, "KIEM_DUYET_VIEN");
        var member = createAccount(true, null);
        var deletedUser = createAccount(true, null);
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'VO_HIEU_HOA' WHERE user_id = ?", deletedUser.id());

        String modToken = loginAdminWeb(moderator);
        var memberSession = loginMobileSession(member);

        // Before lock: member has ROLE_MEMBER
        given().auth().oauth2(memberSession.token())
                .post("/api/v1/restriction-probe/member-write")
                .then()
                .statusCode(200);

        long v0 = given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + member.id())
                .jsonPath().getLong("version");

        // Missing Origin rejected
        given().auth().oauth2(modToken)
                .contentType("application/json")
                .body(Map.of("lockType", "TEMPORARY", "reason", "Vi phạm nội quy"))
                .post("/api/v1/admin/users/" + member.id() + "/lock")
                .then()
                .statusCode(403)
                .body("code", equalTo("INVALID_ORIGIN"));

        // Deleted user rejected -> 409 ACCOUNT_DELETED (UC-13 3.3 & UC-14 3.3)
        given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("lockType", "TEMPORARY", "reason", "Khóa tài khoản đã xóa"))
                .post("/api/v1/admin/users/" + deletedUser.id() + "/lock")
                .then()
                .statusCode(409)
                .body("code", equalTo("ACCOUNT_DELETED"));

        given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("reason", "Mở tài khoản đã xóa"))
                .post("/api/v1/admin/users/" + deletedUser.id() + "/unlock")
                .then()
                .statusCode(409)
                .body("code", equalTo("ACCOUNT_DELETED"));

        // Stale expectedVersion on lock -> 409 STATE_CONFLICT (UC-13 3.3)
        given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("lockType", "TEMPORARY", "reason", "Sai phiên bản", "expectedVersion", v0 + 10))
                .post("/api/v1/admin/users/" + member.id() + "/lock")
                .then()
                .statusCode(409)
                .body("code", equalTo("STATE_CONFLICT"));

        // Temporary lock (default 14 days) with matching expectedVersion
        var tempLocked = given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("lockType", "TEMPORARY", "reason", "Spam tin đăng sai quy định", "expectedVersion", v0))
                .post("/api/v1/admin/users/" + member.id() + "/lock");
        assertThat(tempLocked.statusCode()).isEqualTo(200);
        assertThat(tempLocked.jsonPath().getString("accountStatus")).isEqualTo("BI_KHOA");
        assertThat(tempLocked.jsonPath().getString("restrictionType")).isEqualTo("KHOA_TAM_THOI");
        assertThat(tempLocked.jsonPath().getBoolean("appealable")).isFalse();
        assertThat(tempLocked.jsonPath().getLong("version")).isEqualTo(v0 + 1);
        assertThat(Instant.parse(tempLocked.jsonPath().getString("lockedUntil")))
                .isEqualTo(currentTime.get().truncatedTo(ChronoUnit.MILLIS).plus(Duration.ofDays(14)));

        // Mobile session immediately loses ROLE_MEMBER on next request
        assertThat(given().auth().oauth2(memberSession.token())
                .post("/api/v1/restriction-probe/member-write").statusCode()).isIn(401, 403);

        // Stale expectedVersion on unlock -> 409 STATE_CONFLICT (UC-14 3.3)
        given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("reason", "Sai phiên bản mở khóa", "expectedVersion", v0))
                .post("/api/v1/admin/users/" + member.id() + "/unlock")
                .then()
                .statusCode(409)
                .body("code", equalTo("STATE_CONFLICT"));

        // Manual unlock restores HOAT_DONG and keeps reputationScore = 100
        currentTime.set(currentTime.get().plusSeconds(1));
        var unlocked = given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("reason", "Đã xác minh cam kết không tái phạm", "expectedVersion", v0 + 1))
                .post("/api/v1/admin/users/" + member.id() + "/unlock");
        assertThat(unlocked.statusCode()).isEqualTo(200);
        assertThat(unlocked.jsonPath().getString("accountStatus")).isEqualTo("HOAT_DONG");
        assertThat(unlocked.jsonPath().getString("restrictionType")).isNull();
        assertThat(unlocked.jsonPath().getInt("reputationScore")).isEqualTo(100);
        assertThat(unlocked.jsonPath().getLong("version")).isEqualTo(v0 + 2);

        // Permanent lock preserves appeal right by default (FR-12)
        currentTime.set(currentTime.get().plusSeconds(1));
        var permLocked = given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of(
                        "lockType", "PERMANENT",
                        "reason", "Giả mạo thẻ sinh viên nghiêm trọng",
                        "penaltyCode", "TP_GIA_MAO_THONG_TIN",
                        "expectedVersion", v0 + 2
                ))
                .post("/api/v1/admin/users/" + member.id() + "/lock");
        assertThat(permLocked.statusCode()).isEqualTo(200);
        assertThat(permLocked.jsonPath().getString("accountStatus")).isEqualTo("BI_KHOA");
        assertThat(permLocked.jsonPath().getString("restrictionType")).isEqualTo("KHOA_VINH_VIEN");
        assertThat(permLocked.jsonPath().getString("lockedUntil")).isNull();
        assertThat(permLocked.jsonPath().getBoolean("appealable")).isTrue();
        assertThat(permLocked.jsonPath().getInt("reputationScore")).isEqualTo(50);
        assertThat(permLocked.jsonPath().getLong("version")).isEqualTo(v0 + 3);

        var logs = given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + member.id() + "/moderation-logs");
        assertThat(logs.statusCode()).isEqualTo(200);
        assertThat(logs.jsonPath().getList("items.actionType", String.class))
                .containsExactly("LOCK_PERMANENT", "UNLOCK_MANUAL", "LOCK_TEMPORARY");
    }

    @Test
    @DisplayName("UC-13 & UC-14 ngoại lệ: Chặn tự khóa (400), kiểm duyệt viên khóa đồng cấp/senior (403), thiếu lý do (400), mở khi chưa khóa (409)")
    void rejectsSelfLockPeerStaffRestrictionMissingReasonAndUnlockWhenActive() {
        var modA = createAccount(true, "KIEM_DUYET_VIEN");
        var modB = createAccount(true, "KIEM_DUYET_VIEN");
        var senior = createAccount(true, "QUAN_TRI_VIEN_CAP_CAO");
        var member = createAccount(true, null);

        String modAToken = loginAdminWeb(modA);
        String seniorToken = loginAdminWeb(senior);
        String modBWebToken = loginAdminWeb(modB);

        // Self-lock -> 400 CANNOT_RESTRICT_SELF
        given().auth().oauth2(modAToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("lockType", "TEMPORARY", "reason", "Tự khóa"))
                .post("/api/v1/admin/users/" + modA.id() + "/lock")
                .then()
                .statusCode(400)
                .body("code", equalTo("CANNOT_RESTRICT_SELF"));

        // Moderator cannot lock another MODERATOR or SENIOR_ADMIN -> 403 INSUFFICIENT_PRIVILEGE
        for (UUID staffId : new UUID[]{modB.id(), senior.id()}) {
            given().auth().oauth2(modAToken)
                    .header("Origin", ALLOWED_ORIGIN)
                    .contentType("application/json")
                    .body(Map.of("lockType", "TEMPORARY", "reason", "Thử khóa đồng cấp/cấp cao"))
                    .post("/api/v1/admin/users/" + staffId + "/lock")
                    .then()
                    .statusCode(403)
                    .body("code", equalTo("INSUFFICIENT_PRIVILEGE"));
        }

        // SENIOR_ADMIN can lock MODERATOR -> revokes modB's admin-web session immediately
        given().auth().oauth2(seniorToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("lockType", "TEMPORARY", "durationDays", 7, "reason", "Tạm đình chỉ kiểm duyệt viên"))
                .post("/api/v1/admin/users/" + modB.id() + "/lock")
                .then()
                .statusCode(200);

        Integer activeAdminSessions = db.queryForObject(
                "SELECT count(*) FROM auth_session WHERE user_id = ? AND client = 'admin-web' AND NOT revoked",
                Integer.class,
                modB.id()
        );
        assertThat(activeAdminSessions).isZero();
        assertThat(given().auth().oauth2(modBWebToken).get("/api/v1/admin/users").statusCode()).isIn(401, 403);

        // Another MODERATOR cannot unlock that MODERATOR -> 403
        given().auth().oauth2(modAToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("reason", "Đồng cấp tự mở"))
                .post("/api/v1/admin/users/" + modB.id() + "/unlock")
                .then()
                .statusCode(403)
                .body("code", equalTo("INSUFFICIENT_PRIVILEGE"));

        // Blank reason / out-of-range durationDays -> 400 INVALID_INPUT
        given().auth().oauth2(modAToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("lockType", "TEMPORARY", "reason", "   "))
                .post("/api/v1/admin/users/" + member.id() + "/lock")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        Map<String, Object> badDays = new LinkedHashMap<>();
        badDays.put("lockType", "TEMPORARY");
        badDays.put("durationDays", 400);
        badDays.put("reason", "Quá 365 ngày");
        given().auth().oauth2(modAToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(badDays)
                .post("/api/v1/admin/users/" + member.id() + "/lock")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Unlock when account is not BI_KHOA -> 409 ACCOUNT_NOT_LOCKED
        given().auth().oauth2(modAToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("reason", "Mở tài khoản chưa bị khóa"))
                .post("/api/v1/admin/users/" + member.id() + "/unlock")
                .then()
                .statusCode(409)
                .body("code", equalTo("ACCOUNT_NOT_LOCKED"));
    }

    @Test
    @DisplayName("FR-12: Khóa tạm 14 ngày tự mở khi Clock vượt thời hạn, giữ nguyên điểm cũ và không khóa lại theo điểm cũ")
    void autoUnlocksExpiredTemporaryLockWhenClockAdvancesFourteenDays() {
        var moderator = createAccount(true, "KIEM_DUYET_VIEN");
        var member = createAccount(true, null);
        String modToken = loginAdminWeb(moderator);

        // Apply penalty TP_GIA_MAO_THONG_TIN (-50: 100 -> 50 -> triggers 14-day temporary lock)
        reputationLedger.applyPenaltyScale(member.id(), "TP_GIA_MAO_THONG_TIN", "Vi phạm ngưỡng 50", "AUTO14:" + member.id(), moderator.id());

        given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + member.id())
                .then()
                .statusCode(200)
                .body("accountStatus", equalTo("BI_KHOA"))
                .body("restrictionType", equalTo("KHOA_TAM_THOI"))
                .body("reputationScore", equalTo(50));

        // Advance Clock 14 days + 1 second
        currentTime.set(currentTime.get().plus(Duration.ofDays(14).plusSeconds(1)));

        var detailAfterExpiry = given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + member.id());
        assertThat(detailAfterExpiry.statusCode()).isEqualTo(200);
        assertThat(detailAfterExpiry.jsonPath().getString("accountStatus")).isEqualTo("HOAT_DONG");
        assertThat(detailAfterExpiry.jsonPath().getString("restrictionType")).isNull();
        assertThat(detailAfterExpiry.jsonPath().getInt("reputationScore")).isEqualTo(50);

        // Repeated detail/list reads keep HOAT_DONG without re-locking on old score 50
        given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + member.id())
                .then()
                .statusCode(200)
                .body("accountStatus", equalTo("HOAT_DONG"))
                .body("reputationScore", equalTo(50));

        // Direct unlock on an expired temporary lock WITHOUT prior GET must reconcile UNLOCK_EXPIRED_TEMP and reject 409 ACCOUNT_NOT_LOCKED
        var secondMember = createAccount(true, null);
        reputationLedger.applyPenaltyScale(secondMember.id(), "TP_GIA_MAO_THONG_TIN", "Vi phạm ngưỡng 50 lần 2", "EXP2:" + secondMember.id(), moderator.id());
        currentTime.set(currentTime.get().plus(Duration.ofDays(14).plusSeconds(1)));

        given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("reason", "Mở khóa khi khóa tạm vừa hết hạn"))
                .post("/api/v1/admin/users/" + secondMember.id() + "/unlock")
                .then()
                .statusCode(409)
                .body("code", equalTo("ACCOUNT_NOT_LOCKED"));

        var secondAfter = given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + secondMember.id());
        assertThat(secondAfter.statusCode()).isEqualTo(200);
        assertThat(secondAfter.jsonPath().getString("accountStatus")).isEqualTo("HOAT_DONG");
        assertThat(secondAfter.jsonPath().getInt("reputationScore")).isEqualTo(50);

        var secondLogs = given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + secondMember.id() + "/moderation-logs");
        assertThat(secondLogs.jsonPath().getList("items.actionType", String.class))
                .containsExactly("UNLOCK_EXPIRED_TEMP", "THRESHOLD_LOCK_TEMPORARY");
    }

    @Test
    @DisplayName("FR-12 & UC-13: Khóa TEMPORARY kèm penaltyCode tụt điểm <=30 tự nâng cấp KHOA_VINH_VIEN và tăng version đúng 1 lần")
    void temporaryLockWithPenaltyCodeRespectsReputationThresholdsAndBumpsVersionOnce() {
        var moderator = createAccount(true, "KIEM_DUYET_VIEN");
        var escalatedTarget = createAccount(true, null);
        var tempBandTarget = createAccount(true, null);
        String modToken = loginAdminWeb(moderator);

        // Set initial scores to 60 so -50 -> 10 (<=30) and -15 -> 45 (30 < 45 <= 50)
        db.update("UPDATE thanh_viens SET diem_uy_tin = 60 WHERE user_id IN (?, ?)", escalatedTarget.id(), tempBandTarget.id());

        long vEsc = given().auth().oauth2(modToken).get("/api/v1/admin/users/" + escalatedTarget.id()).jsonPath().getLong("version");
        var escalatedResp = given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of(
                        "lockType", "TEMPORARY",
                        "durationDays", 7,
                        "reason", "Giả mạo thông tin gây tụt xuống ngưỡng vĩnh viễn",
                        "appealable", false,
                        "penaltyCode", "TP_GIA_MAO_THONG_TIN",
                        "expectedVersion", vEsc
                ))
                .post("/api/v1/admin/users/" + escalatedTarget.id() + "/lock");
        assertThat(escalatedResp.statusCode()).isEqualTo(200);
        assertThat(escalatedResp.jsonPath().getString("accountStatus")).isEqualTo("BI_KHOA");
        assertThat(escalatedResp.jsonPath().getString("restrictionType")).isEqualTo("KHOA_VINH_VIEN");
        assertThat(escalatedResp.jsonPath().getString("lockedUntil")).isNull();
        assertThat(escalatedResp.jsonPath().getBoolean("appealable")).isTrue();
        assertThat(escalatedResp.jsonPath().getInt("reputationScore")).isEqualTo(10);
        assertThat(escalatedResp.jsonPath().getLong("version")).isEqualTo(vEsc + 1);

        var escalatedLogs = given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + escalatedTarget.id() + "/moderation-logs");
        assertThat(escalatedLogs.statusCode()).isEqualTo(200);
        assertThat(escalatedLogs.jsonPath().getList("items.actionType", String.class))
                .containsExactly("THRESHOLD_LOCK_PERMANENT");
        assertThat(escalatedLogs.jsonPath().getBoolean("items[0].details.escalatedByReputationThreshold")).isTrue();
        assertThat(escalatedLogs.jsonPath().getString("items[0].details.requestedLockType")).isEqualTo("TEMPORARY");

        // Second case: TEMPORARY 7 days + penalty dropping 60 -> 45 (30 < 45 <= 50) enforces minimum 14 days & 1 version bump
        long vTemp = given().auth().oauth2(modToken).get("/api/v1/admin/users/" + tempBandTarget.id()).jsonPath().getLong("version");
        var tempResp = given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of(
                        "lockType", "TEMPORARY",
                        "durationDays", 7,
                        "reason", "Bỏ hẹn tái phạm kèm khóa tạm",
                        "penaltyCode", "TP_BO_HEN_TAI_PHAM",
                        "expectedVersion", vTemp
                ))
                .post("/api/v1/admin/users/" + tempBandTarget.id() + "/lock");
        assertThat(tempResp.statusCode()).isEqualTo(200);
        assertThat(tempResp.jsonPath().getString("restrictionType")).isEqualTo("KHOA_TAM_THOI");
        assertThat(tempResp.jsonPath().getInt("reputationScore")).isEqualTo(45);
        assertThat(tempResp.jsonPath().getLong("version")).isEqualTo(vTemp + 1);
        assertThat(Instant.parse(tempResp.jsonPath().getString("lockedUntil")))
                .isEqualTo(currentTime.get().truncatedTo(ChronoUnit.MILLIS).plus(Duration.ofDays(14)));

        var tempLogs = given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + tempBandTarget.id() + "/moderation-logs");
        assertThat(tempLogs.jsonPath().getList("items.actionType", String.class))
                .containsExactly("LOCK_TEMPORARY");
    }

    @Test
    @DisplayName("UC-03 3.2 & FR-12: Mobile cho phép đăng nhập/refresh/me/logout ở chế độ giới hạn kèm restriction; chặn profile/ROLE_MEMBER bằng 403 ACCOUNT_RESTRICTED và tự mở sau 14 ngày")
    void mobileRestrictedLoginAndMidSessionLockEnforceLimitedSessionAndStructured403() {
        var moderator = createAccount(true, "KIEM_DUYET_VIEN");
        var member = createAccount(true, null);
        String modToken = loginAdminWeb(moderator);

        // Active mobile session before lock
        var activeMobile = loginMobileSession(member);
        assertThat(activeMobile.user().restriction()).isNull();
        assertThat(activeMobile.user().roles()).containsExactly("MEMBER");

        // Mid-session temporary lock via penalty (-50 -> score 50, 14-day KHOA_TAM_THOI)
        reputationLedger.applyPenaltyScale(
                member.id(),
                "TP_GIA_MAO_THONG_TIN",
                "Vi phạm dẫn tới khóa tạm 14 ngày",
                "MIDLOCK:" + member.id(),
                moderator.id()
        );

        // 1) Existing mobile Bearer token immediately loses ROLE_MEMBER -> 403 ACCOUNT_RESTRICTED with restriction payload
        var blockedWrite = given().auth().oauth2(activeMobile.token())
                .post("/api/v1/restriction-probe/member-write");
        assertThat(blockedWrite.statusCode()).isEqualTo(403);
        assertThat(blockedWrite.jsonPath().getString("code")).isEqualTo("ACCOUNT_RESTRICTED");
        assertThat(blockedWrite.jsonPath().getString("restriction.accountStatus")).isEqualTo("BI_KHOA");
        assertThat(blockedWrite.jsonPath().getString("restriction.lockType")).isEqualTo("KHOA_TAM_THOI");
        assertThat(blockedWrite.jsonPath().getBoolean("restriction.appealable")).isFalse();
        assertThat(blockedWrite.jsonPath().getInt("restriction.reputationScore")).isEqualTo(50);

        // 2) PATCH /api/v1/auth/profile also returns 403 ACCOUNT_RESTRICTED
        given().auth().oauth2(activeMobile.token())
                .contentType("application/json")
                .body(Map.of("name", "Tên Mới Khi Đang Khóa"))
                .patch("/api/v1/auth/profile")
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"))
                .body("restriction.lockType", equalTo("KHOA_TAM_THOI"));

        // 3) UC-03 3.2: Mobile GET /auth/me, POST /auth/refresh, POST /auth/login, POST /auth/logout work with roles=[] and restriction details
        var meWhileLocked = given().auth().oauth2(activeMobile.token()).get("/api/v1/auth/me");
        assertThat(meWhileLocked.statusCode()).isEqualTo(200);
        assertThat(meWhileLocked.jsonPath().getString("accountStatus")).isEqualTo("BI_KHOA");
        assertThat(meWhileLocked.jsonPath().getList("roles")).isEmpty();
        assertThat(meWhileLocked.jsonPath().getString("restriction.lockType")).isEqualTo("KHOA_TAM_THOI");

        var refreshedMobile = given().contentType("application/json")
                .body(Map.of("client", "mobile", "refreshToken", activeMobile.refreshToken()))
                .post("/api/v1/auth/refresh");
        assertThat(refreshedMobile.statusCode()).isEqualTo(200);
        assertThat(refreshedMobile.jsonPath().getList("user.roles")).isEmpty();
        assertThat(refreshedMobile.jsonPath().getString("user.restriction.lockType")).isEqualTo("KHOA_TAM_THOI");

        var freshMobileLogin = given().contentType("application/json")
                .body(Map.of("email", member.email(), "password", PASSWORD, "client", "mobile"))
                .post("/api/v1/auth/login");
        assertThat(freshMobileLogin.statusCode()).isEqualTo(200);
        assertThat(freshMobileLogin.jsonPath().getList("user.roles")).isEmpty();
        assertThat(freshMobileLogin.jsonPath().getInt("user.restriction.reputationScore")).isEqualTo(50);
        String limitedToken = freshMobileLogin.jsonPath().getString("token");

        given().auth().oauth2(limitedToken).post("/api/v1/auth/logout").then().statusCode(204);

        // 4) Advance Clock 14 days + 1s: mobile login lazily unlocks keeping score = 50 and restores MEMBER role!
        currentTime.set(currentTime.get().plus(Duration.ofDays(14).plusSeconds(1)));
        var loginAfterExpiry = given().contentType("application/json")
                .body(Map.of("email", member.email(), "password", PASSWORD, "client", "mobile"))
                .post("/api/v1/auth/login");
        assertThat(loginAfterExpiry.statusCode()).isEqualTo(200);
        assertThat(loginAfterExpiry.jsonPath().getString("user.accountStatus")).isEqualTo("HOAT_DONG");
        assertThat(loginAfterExpiry.jsonPath().getList("user.roles", String.class)).containsExactly("MEMBER");
        assertThat((Object) loginAfterExpiry.jsonPath().get("user.restriction")).isNull();

        String restoredToken = loginAfterExpiry.jsonPath().getString("token");
        given().auth().oauth2(restoredToken)
                .post("/api/v1/restriction-probe/member-write")
                .then()
                .statusCode(200);

        // Score remains 50 in DB without re-locking
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, member.id()))
                .isEqualTo(50);
    }

    @Test
    @DisplayName("UC-03 3.3 & Admin-web restriction: Admin-web trả 403 ACCOUNT_RESTRICTED khi BI_KHOA; tài khoản VO_HIEU_HOA trả 401 INVALID_CREDENTIALS")
    void adminWebRestrictedAndDeletedAccountsFollowUc03Rules() throws Exception {
        var senior = createAccount(true, "QUAN_TRI_VIEN_CAP_CAO");
        var modTarget = createAccount(true, "KIEM_DUYET_VIEN");
        var deletedAccount = createAccount(true, null);

        String seniorToken = loginAdminWeb(senior);

        // Log in modTarget on admin-web via HTTP to capture:
        // (a) logged-out token, (b) pre-password-change stale-generation token, (c) current token & refresh cookie
        var loggedOutLogin = given()
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("email", modTarget.email(), "password", PASSWORD, "client", "admin-web"))
                .post("/api/v1/auth/login");
        assertThat(loggedOutLogin.statusCode()).isEqualTo(200);
        String loggedOutToken = loggedOutLogin.jsonPath().getString("token");
        given().header("Origin", ALLOWED_ORIGIN)
                .auth().oauth2(loggedOutToken)
                .post("/api/v1/auth/logout")
                .then()
                .statusCode(204);

        var modWebLogin = given()
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("email", modTarget.email(), "password", PASSWORD, "client", "admin-web"))
                .post("/api/v1/auth/login");
        assertThat(modWebLogin.statusCode()).isEqualTo(200);
        String changedPasswordToken = modWebLogin.jsonPath().getString("token");
        String changedPasswordCookie = modWebLogin.getCookie("dorm_refresh");

        // UC-07 revokes every session; sign in again to obtain active sessions for the lock and stale-generation checks.
        String newPassword = "three mountains over clear valley";
        var rotated = given()
                .header("Origin", ALLOWED_ORIGIN)
                .auth().oauth2(changedPasswordToken)
                .contentType("application/json")
                .body(Map.of("currentPassword", PASSWORD, "password", newPassword))
                .post("/api/v1/auth/password/change");
        assertThat(rotated.statusCode()).isEqualTo(204);
        var signedInAgain = given().header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("email", modTarget.email(), "password", newPassword, "client", "admin-web"))
                .post("/api/v1/auth/login");
        assertThat(signedInAgain.statusCode()).isEqualTo(200);
        String modWebToken = signedInAgain.jsonPath().getString("token");
        String refreshCookie = signedInAgain.getCookie("dorm_refresh");
        UUID modWebSid = UUID.fromString(SignedJWT.parse(modWebToken).getJWTClaimsSet().getStringClaim("sid"));

        var staleGenLogin = given().header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("email", modTarget.email(), "password", newPassword, "client", "admin-web"))
                .post("/api/v1/auth/login");
        assertThat(staleGenLogin.statusCode()).isEqualTo(200);
        String staleGenToken = staleGenLogin.jsonPath().getString("token");
        String staleGenCookie = staleGenLogin.getCookie("dorm_refresh");
        UUID staleGenSid = UUID.fromString(SignedJWT.parse(staleGenToken).getJWTClaimsSet().getStringClaim("sid"));

        // Bump generation on an unrevoked session so the stale-generation branch is verified independently of revocation.
        int updatedStale = db.update(
                "UPDATE auth_session SET generation = generation + 1 WHERE id = ? AND revoked = FALSE",
                staleGenSid
        );
        assertThat(updatedStale).isEqualTo(1);
        given().auth().oauth2(staleGenToken)
                .get("/api/v1/admin/users")
                .then()
                .statusCode(401);

        // Senior admin permanently locks modTarget (revokes all admin-web sessions immediately)
        given().auth().oauth2(seniorToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("lockType", "PERMANENT", "reason", "Vi phạm quy chế kiểm duyệt"))
                .post("/api/v1/admin/users/" + modTarget.id() + "/lock")
                .then()
                .statusCode(200);

        // 1) Revoked, logged-out, password-changed, and stale-generation admin-web tokens/refresh MUST fail with 401 (never leak restriction details)
        for (String invalidatedToken : new String[]{loggedOutToken, changedPasswordToken, staleGenToken, modWebToken}) {
            given().auth().oauth2(invalidatedToken)
                    .get("/api/v1/admin/users")
                    .then()
                    .statusCode(401);
        }

        for (String invalidatedCookie : new String[]{changedPasswordCookie, staleGenCookie, refreshCookie}) {
            given().header("Origin", ALLOWED_ORIGIN)
                    .cookie("dorm_refresh", invalidatedCookie)
                    .contentType("application/json")
                    .body(Map.of("client", "admin-web"))
                    .post("/api/v1/auth/refresh")
                    .then()
                    .statusCode(401);
        }

        // 2) Admin-web login returns 403 ACCOUNT_RESTRICTED with appealable=true
        given().header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(Map.of("email", modTarget.email(), "password", newPassword, "client", "admin-web"))
                .post("/api/v1/auth/login")
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"))
                .body("restriction.lockType", equalTo("KHOA_VINH_VIEN"))
                .body("restriction.appealable", equalTo(true));

        // 3) If an unrevoked admin-web session exists while DB row is BI_KHOA, it returns 403 ACCOUNT_RESTRICTED as defense-in-depth,
        // while stale-generation tokens on an unrevoked session STILL reject with 401 before BI_KHOA check.
        int restoredSessions = db.update(
                "UPDATE auth_session SET revoked = FALSE WHERE id IN (?, ?)",
                modWebSid,
                staleGenSid
        );
        assertThat(restoredSessions).isEqualTo(2);
        given().auth().oauth2(modWebToken)
                .get("/api/v1/admin/users")
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"))
                .body("restriction.lockType", equalTo("KHOA_VINH_VIEN"))
                .body("restriction.appealable", equalTo(true));

        given().auth().oauth2(staleGenToken)
                .get("/api/v1/admin/users")
                .then()
                .statusCode(401);

        // 4) UC-03 3.3: Deleted (VO_HIEU_HOA) account returns 401 INVALID_CREDENTIALS on login/refresh/Bearer
        var beforeDeleteSession = loginMobileSession(deletedAccount);
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'VO_HIEU_HOA' WHERE user_id = ?", deletedAccount.id());

        given().contentType("application/json")
                .body(Map.of("email", deletedAccount.email(), "password", PASSWORD, "client", "mobile"))
                .post("/api/v1/auth/login")
                .then()
                .statusCode(401)
                .body("code", equalTo("INVALID_CREDENTIALS"));

        given().contentType("application/json")
                .body(Map.of("client", "mobile", "refreshToken", beforeDeleteSession.refreshToken()))
                .post("/api/v1/auth/refresh")
                .then()
                .statusCode(401)
                .body("code", equalTo("INVALID_CREDENTIALS"));

        given().auth().oauth2(beforeDeleteSession.token())
                .get("/api/v1/auth/me")
                .then()
                .statusCode(401);
    }
}
