package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import com.dormtrading.review.reputation.ReputationLedgerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
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

@DisplayName("Kiểm thử Tích hợp API Quản lý Hồ sơ Người dùng (P1-04 / UC-11, UC-12, FR-02, FR-03, NFR-01)")
class UserManagementApiTest extends BaseIntegrationTest {

    private static final String PASSWORD = "a quiet river beneath stars";
    private static final String ALLOWED_ORIGIN = "http://localhost:5173";

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

    private TestAccount registerAccount(boolean verifyEmail, boolean activate, String adminRole) {
        String codeSuffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "SV" + codeSuffix;
        String email = "u" + codeSuffix + "@student.edu.vn";

        var challenge = auth.register("Sinh Viên " + codeSuffix, studentId, email, PASSWORD, codeSuffix);
        if (verifyEmail) {
            delivery.deliver();
            auth.verify(challenge.challengeId(), email, "REGISTER", otpCodes.get(email), codeSuffix);
        }
        UUID userId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email);
        if (activate) {
            db.update(
                    "UPDATE thanh_viens SET profile_approved = TRUE, trang_thai_tai_khoan = 'HOAT_DONG', " +
                    "anh_the_sv_truoc = '/uploads/student-cards/private-front.png' WHERE user_id = ?",
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

    private String loginMobile(TestAccount account) {
        return auth.login(account.email(), PASSWORD, "mobile", account.studentId()).token();
    }

    private String loginAdminWeb(TestAccount account) {
        return auth.login(account.email(), PASSWORD, "admin-web", account.studentId()).token();
    }

    @Test
    @DisplayName("NFR-01 RBAC & UC-11 Bước 6: Chặn trái quyền; danh sách không lộ ảnh thẻ/hash, chi tiết trả ảnh thẻ cho kiểm duyệt viên")
    void enforcesStrictRbacAndStudentCardVisibilityBoundaries() {
        var pending = registerAccount(true, false, null);
        var member = registerAccount(true, true, null);
        var moderator = registerAccount(true, true, "KIEM_DUYET_VIEN");
        var seniorAdmin = registerAccount(true, true, "QUAN_TRI_VIEN_CAP_CAO");

        given().get("/api/v1/admin/users").then().statusCode(401);

        given().auth().oauth2(loginMobile(pending)).get("/api/v1/admin/users").then().statusCode(403);
        given().auth().oauth2(loginMobile(member)).get("/api/v1/admin/users").then().statusCode(403);
        // Moderator logged in via mobile client MUST NOT receive admin access
        given().auth().oauth2(loginMobile(moderator)).get("/api/v1/admin/users").then().statusCode(403);

        String modWebToken = loginAdminWeb(moderator);
        String seniorWebToken = loginAdminWeb(seniorAdmin);

        var listResp = given().auth().oauth2(modWebToken)
                .queryParam("q", member.studentId())
                .get("/api/v1/admin/users");
        assertThat(listResp.statusCode()).isEqualTo(200);
        assertThat(listResp.jsonPath().getInt("totalElements")).isEqualTo(1);
        assertThat(listResp.body().asString())
                .doesNotContain("mat_khau_hash", "$argon2id$", "private-front.png", "studentCardFront");

        var detailResp = given().auth().oauth2(seniorWebToken)
                .get("/api/v1/admin/users/" + member.id());
        assertThat(detailResp.statusCode()).isEqualTo(200);
        assertThat(detailResp.jsonPath().getString("studentCardFront"))
                .isEqualTo("/uploads/student-cards/private-front.png");
        assertThat(detailResp.jsonPath().getString("studentCardBack")).isNull();
        assertThat(detailResp.jsonPath().getBoolean("hasStudentCardFront")).isTrue();
        assertThat(detailResp.jsonPath().getBoolean("hasStudentCardBack")).isFalse();
        assertThat(detailResp.body().asString()).doesNotContain("mat_khau_hash", "$argon2id$");
    }

    @Test
    @DisplayName("UC-12 & FR-02: PATCH kiểm tra Origin, trường cấm, ảnh thẻ, xung đột phiên bản/tài khoản xóa, tốt nghiệp không khóa và lưu vết audit")
    void updatesIdentityWithValidationCardRulesOptimisticConcurrencyGraduationAndAuditTrail() {
        var moderator = registerAccount(true, true, "KIEM_DUYET_VIEN");
        var seniorAdmin = registerAccount(true, true, "QUAN_TRI_VIEN_CAP_CAO");
        var studentA = registerAccount(true, true, null);
        var studentB = registerAccount(true, true, null);
        var deletedUser = registerAccount(true, true, null);
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'VO_HIEU_HOA' WHERE user_id = ?", deletedUser.id());

        String modToken = loginAdminWeb(moderator);
        String seniorToken = loginAdminWeb(seniorAdmin);
        String studentAMobileToken = loginMobile(studentA);

        long initialVersion = given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + studentA.id())
                .jsonPath().getLong("version");

        Map<String, Object> validPatch = new LinkedHashMap<>();
        validPatch.put("fullName", "Nguyễn Văn Đã Cập Nhật");
        validPatch.put("studentId", studentA.studentId());
        validPatch.put("phone", "0909 123 456");
        validPatch.put("university", "ĐH Bách Khoa - ĐHQG-HCM");
        validPatch.put("campus", "KTX Khu A");
        validPatch.put("major", "Khoa học Máy tính");
        validPatch.put("cohort", "K2022");
        validPatch.put("studentStatus", "DA_TOT_NGHIEP");
        validPatch.put("studentCardFront", "https://cdn.dorm.edu.vn/cards/front-2252.jpg");
        validPatch.put("studentCardBack", "data:image/png;base64,iVBORw0KGgo=");
        validPatch.put("expectedVersion", initialVersion);

        // 1) Missing or wrong Origin -> 403
        given().auth().oauth2(modToken)
                .contentType("application/json")
                .body(validPatch)
                .patch("/api/v1/admin/users/" + studentA.id())
                .then()
                .statusCode(403)
                .body("code", equalTo("INVALID_ORIGIN"));

        given().auth().oauth2(modToken)
                .header("Origin", "https://evil.example")
                .contentType("application/json")
                .body(validPatch)
                .patch("/api/v1/admin/users/" + studentA.id())
                .then()
                .statusCode(403);

        // 2) Unknown / forbidden fields -> 400 INVALID_PROFILE_FIELDS (UC-12 section 4)
        for (String forbiddenKey : new String[]{"email", "password", "reputationScore", "roles", "accountStatus"}) {
            Map<String, Object> badBody = new LinkedHashMap<>(validPatch);
            badBody.put(forbiddenKey, "tampered");
            given().auth().oauth2(modToken)
                    .header("Origin", ALLOWED_ORIGIN)
                    .contentType("application/json")
                    .body(badBody)
                    .patch("/api/v1/admin/users/" + studentA.id())
                    .then()
                    .statusCode(400)
                    .body("code", equalTo("INVALID_PROFILE_FIELDS"));
        }

        // 3) Invalid student card format -> 400 INVALID_STUDENT_CARD (UC-12 3.3)
        for (String badCard : new String[]{
                "javascript:alert(1)",
                "https://cdn.dorm.edu.vn/cards/front.pdf",
                "data:image/svg+xml;base64,PHN2Zz4=",
                "/uploads/../etc/passwd"
        }) {
            Map<String, Object> badCardBody = new LinkedHashMap<>(validPatch);
            badCardBody.put("studentCardFront", badCard);
            given().auth().oauth2(modToken)
                    .header("Origin", ALLOWED_ORIGIN)
                    .contentType("application/json")
                    .body(badCardBody)
                    .patch("/api/v1/admin/users/" + studentA.id())
                    .then()
                    .statusCode(400)
                    .body("code", equalTo("INVALID_STUDENT_CARD"));
        }

        // 4) Invalid UUID / query param / nonexistent user
        given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/not-a-valid-uuid")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        given().auth().oauth2(modToken)
                .queryParam("minReputation", "not-an-int")
                .get("/api/v1/admin/users")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + UUID.randomUUID())
                .then()
                .statusCode(404)
                .body("code", equalTo("USER_NOT_FOUND"));

        // 5) Deleted target account -> 409 ACCOUNT_DELETED (UC-12 3.3)
        Map<String, Object> editDeleted = new LinkedHashMap<>(validPatch);
        editDeleted.remove("expectedVersion");
        editDeleted.put("studentId", deletedUser.studentId());
        given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(editDeleted)
                .patch("/api/v1/admin/users/" + deletedUser.id())
                .then()
                .statusCode(409)
                .body("code", equalTo("ACCOUNT_DELETED"));

        // 6) Stale expectedVersion -> 409 STATE_CONFLICT (UC-12 3.3)
        Map<String, Object> stalePatch = new LinkedHashMap<>(validPatch);
        stalePatch.put("expectedVersion", initialVersion + 99);
        given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(stalePatch)
                .patch("/api/v1/admin/users/" + studentA.id())
                .then()
                .statusCode(409)
                .body("code", equalTo("STATE_CONFLICT"));

        // 7) Duplicate studentId -> 409 STUDENT_ID_CONFLICT
        Map<String, Object> duplicateMssv = new LinkedHashMap<>(validPatch);
        duplicateMssv.put("studentId", studentB.studentId());
        given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(duplicateMssv)
                .patch("/api/v1/admin/users/" + studentA.id())
                .then()
                .statusCode(409)
                .body("code", equalTo("STUDENT_ID_CONFLICT"));

        // 8) Moderator cannot edit SENIOR_ADMIN -> 403 INSUFFICIENT_PRIVILEGE; SENIOR_ADMIN succeeds -> 200
        Map<String, Object> editSenior = new LinkedHashMap<>(validPatch);
        editSenior.remove("expectedVersion");
        editSenior.put("studentId", seniorAdmin.studentId());
        given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(editSenior)
                .patch("/api/v1/admin/users/" + seniorAdmin.id())
                .then()
                .statusCode(403)
                .body("code", equalTo("INSUFFICIENT_PRIVILEGE"));

        given().auth().oauth2(seniorToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(editSenior)
                .patch("/api/v1/admin/users/" + seniorAdmin.id())
                .then()
                .statusCode(200);

        // 9) Valid update with optional reason omitted (defaults cleanly) + DA_TOT_NGHIEP (FR-02 keeps HOAT_DONG)
        var updated = given().auth().oauth2(modToken)
                .header("Origin", ALLOWED_ORIGIN)
                .contentType("application/json")
                .body(validPatch)
                .patch("/api/v1/admin/users/" + studentA.id());
        assertThat(updated.statusCode()).isEqualTo(200);
        assertThat(updated.jsonPath().getString("fullName")).isEqualTo("Nguyễn Văn Đã Cập Nhật");
        assertThat(updated.jsonPath().getString("studentStatus")).isEqualTo("DA_TOT_NGHIEP");
        assertThat(updated.jsonPath().getString("accountStatus")).isEqualTo("HOAT_DONG");
        assertThat(updated.jsonPath().getString("studentCardFront"))
                .isEqualTo("https://cdn.dorm.edu.vn/cards/front-2252.jpg");
        assertThat(updated.jsonPath().getBoolean("hasStudentCardBack")).isTrue();
        assertThat(updated.jsonPath().getLong("version")).isEqualTo(initialVersion + 1);
        assertThat(updated.body().asString()).doesNotContain("mat_khau_hash");

        // Student A's existing mobile token still works seamlessly after graduation status update
        given().auth().oauth2(studentAMobileToken)
                .get("/api/v1/auth/me")
                .then()
                .statusCode(200)
                .body("accountStatus", equalTo("HOAT_DONG"));

        // 10) Verify sub-resource endpoints: transactions, reputation-history, moderation-logs
        given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + studentA.id() + "/transactions")
                .then()
                .statusCode(200)
                .body("totalElements", equalTo(0));

        given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + studentA.id() + "/reputation-history")
                .then()
                .statusCode(200)
                .body("currentScore", equalTo(100))
                .body("totalElements", equalTo(1))
                .body("items[0].changeType", equalTo("KHOI_TAO_KICH_HOAT"));

        var logsResp = given().auth().oauth2(modToken)
                .get("/api/v1/admin/users/" + studentA.id() + "/moderation-logs");
        assertThat(logsResp.statusCode()).isEqualTo(200);
        assertThat(logsResp.jsonPath().getInt("totalElements")).isEqualTo(1);
        assertThat(logsResp.jsonPath().getString("items[0].actionType")).isEqualTo("UPDATE_IDENTITY");
        assertThat(logsResp.jsonPath().getString("items[0].reason")).isEqualTo("Cập nhật hồ sơ người dùng");
        assertThat(logsResp.jsonPath().getString("items[0].details.before.studentStatus")).isEqualTo("DANG_HOC");
        assertThat(logsResp.jsonPath().getString("items[0].details.after.studentStatus")).isEqualTo("DA_TOT_NGHIEP");
        assertThat(logsResp.jsonPath().getString("items[0].details.after.studentCardFront"))
                .isEqualTo("https://cdn.dorm.edu.vn/cards/front-2252.jpg");
    }
}
