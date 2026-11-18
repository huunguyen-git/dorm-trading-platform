package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import com.dormtrading.review.reputation.ReputationLedgerService;
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
        currentTime.set(Instant.parse("2026-11-18T12:00:00Z"));
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

        var logs = given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + member.id() + "/moderation-logs");
        assertThat(logs.statusCode()).isEqualTo(200);
        assertThat(logs.jsonPath().getList("items.actionType", String.class))
                .contains("LOCK_PERMANENT", "UNLOCK_MANUAL", "LOCK_TEMPORARY");
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
    }
}
