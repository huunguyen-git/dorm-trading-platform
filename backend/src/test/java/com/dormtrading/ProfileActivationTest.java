package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import com.dormtrading.iam.profile.ProfileNotices;
import io.restassured.http.ContentType;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ProfileActivationTest extends BaseIntegrationTest {
    @Autowired AuthService auth;
    @Autowired OtpDelivery delivery;
    @Autowired ProfileNotices notices;
    @Autowired JdbcTemplate db;
    @MockitoBean JavaMailSender mail;
    @MockitoBean Clock clock;
    private final AtomicReference<Instant> time = new AtomicReference<>();
    private final ConcurrentMap<String,String> codes = new ConcurrentHashMap<>();
    private String email, student;
    private static final String PASSWORD = "a quiet river beneath stars";
    private static final String NEW_EMAIL_DOMAIN = "@student.edu.vn";
    private static final String ORIGIN = "http://localhost:5173";

    @BeforeEach void setup() {
        time.set(Instant.now()); when(clock.instant()).thenAnswer(i -> time.get());
        student = UUID.randomUUID().toString().substring(0,12);
        email = "u" + student + NEW_EMAIL_DOMAIN;
        captureCodes();
    }

    private void captureCodes() {
        doAnswer(i -> {
            var message=(SimpleMailMessage)i.getArgument(0);
            var matcher=Pattern.compile("[0-9]{6}").matcher(message.getText());
            if(matcher.find()) codes.put(message.getTo()[0],matcher.group());
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));
    }

    private AuthService.Challenge register(String address) { return auth.register("Test",student,address,PASSWORD,student); }
    private String codeFor(String address) { delivery.deliver(); return codes.get(address); }
    private UUID id(String address) { return db.queryForObject("select user_id from thanh_viens where email=?",UUID.class,address); }
    private String login(String address, String client) {
        var request = given().contentType(ContentType.JSON).body(Map.of("email",address,"password",PASSWORD,"client",client));
        if ("admin-web".equals(client)) request = request.header("Origin",ORIGIN);
        return request.post("/api/v1/auth/login").then().statusCode(200).extract().jsonPath().getString("token");
    }

    /** Tạo kiểm duyệt viên đã kích hoạt và trả token admin-web. */
    private String moderator() {
        String address = "m" + UUID.randomUUID().toString().substring(0,10) + NEW_EMAIL_DOMAIN;
        String mssv = "M" + UUID.randomUUID().toString().substring(0,8);
        var challenge = auth.register("Mod",mssv,address,PASSWORD,mssv);
        delivery.deliver();
        auth.verify(challenge.challengeId(),address,"REGISTER",codes.get(address),mssv);
        db.update("update thanh_viens set profile_approved=true,trang_thai_tai_khoan='HOAT_DONG' where email=?",address);
        db.update("insert into vai_tro_quan_tri(user_id,loai_vai_tro,bat_dau) values (?,'KIEM_DUYET_VIEN',?)",
                id(address),java.sql.Timestamp.from(time.get().minusSeconds(1)));
        return login(address,"admin-web");
    }
    private void activate() {
        db.update("update thanh_viens set profile_approved=true,trang_thai_tai_khoan='HOAT_DONG' where email=?",email);
    }

    @Test void approvalActivatesOnceAndNeverResetsReputation() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        String admin = moderator();

        given().auth().oauth2(admin).get("/api/v1/admin/profiles/pending")
                .then().statusCode(200).body("find { it.email == '" + email + "' }.kind", equalTo("DANG_KY"));
        given().auth().oauth2(admin).post("/api/v1/admin/profiles/" + id(email) + "/approve").then().statusCode(204);

        var row = db.queryForMap("select * from thanh_viens where email=?",email);
        assertThat(row.get("trang_thai_tai_khoan")).isEqualTo("HOAT_DONG");
        assertThat(row.get("diem_uy_tin")).isEqualTo(100);
        assertThat(row.get("diem_khoi_tao")).isEqualTo(true);
        assertThat(db.queryForObject("select count(*) from kiem_duyet_ho_so where user_id=? and ket_qua='CHAP_THUAN'",Integer.class,id(email))).isEqualTo(1);

        // UC-05: cập nhật định danh chờ duyệt, tài khoản đã kích hoạt vẫn giữ quyền và điểm.
        db.update("update thanh_viens set diem_uy_tin=87 where email=?",email);
        given().auth().oauth2(token).contentType(ContentType.JSON)
                .body(Map.of("studentId","NEW" + student)).patch("/api/v1/profile/me")
                .then().statusCode(200).body("profileStatus",equalTo("CHO_DUYET")).body("pendingUpdate",equalTo(true));
        assertThat(db.queryForObject("select mssv from thanh_viens where email=?",String.class,email)).isEqualTo(student);

        given().auth().oauth2(admin).post("/api/v1/admin/profiles/" + id(email) + "/approve").then().statusCode(204);
        var updated = db.queryForMap("select * from thanh_viens where email=?",email);
        assertThat(updated.get("mssv")).isEqualTo("NEW" + student);
        assertThat(updated.get("diem_uy_tin")).isEqualTo(87);
        assertThat(updated.get("profile_approved")).isEqualTo(true);
        assertThat(updated.get("cho_duyet_lai")).isEqualTo(false);
        assertThat(db.queryForObject("select count(*) from ho_so_cap_nhat where user_id=?",Integer.class,id(email))).isZero();
    }

    @Test void pendingListOnlyShowsVerifiedProfilesAndPaginates() {
        var challenge = register(email);
        String admin = moderator();
        assertThat(given().auth().oauth2(admin).get("/api/v1/admin/profiles/pending").then().statusCode(200)
                .extract().jsonPath().getList("email",String.class)).doesNotContain(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        assertThat(given().auth().oauth2(admin).get("/api/v1/admin/profiles/pending").then().statusCode(200)
                .extract().jsonPath().getList("email",String.class)).contains(email);
        given().auth().oauth2(admin).get("/api/v1/admin/profiles/pending?offset=0&limit=500").then().statusCode(200);
    }

    @Test void rejectRequiresReasonAndKeepsDecisionWhenMailFails() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        String admin = moderator();
        UUID userId = id(email);

        given().auth().oauth2(admin).contentType(ContentType.JSON).body(Map.of("reason","  "))
                .post("/api/v1/admin/profiles/" + userId + "/reject")
                .then().statusCode(400).body("code",equalTo("INVALID_REASON"));

        doThrow(new org.springframework.mail.MailSendException("test unavailable")).when(mail).send(any(SimpleMailMessage.class));
        given().auth().oauth2(admin).contentType(ContentType.JSON).body(Map.of("reason","Ảnh thẻ không đọc được."))
                .post("/api/v1/admin/profiles/" + userId + "/reject").then().statusCode(204);
        var row = db.queryForMap("select * from thanh_viens where user_id=?",userId);
        assertThat(row.get("profile_approved")).isEqualTo(false);
        assertThat(row.get("ly_do_tu_choi")).isEqualTo("Ảnh thẻ không đọc được.");
        assertThat(row.get("trang_thai_tai_khoan")).isEqualTo("CHO_KICH_HOAT");
        notices.deliver();
        assertThat(db.queryForObject("select sent from ho_so_thong_bao where email=?",Boolean.class,email)).isFalse();
        assertThat(db.queryForObject("select failures from ho_so_thong_bao where email=?",Integer.class,email)).isEqualTo(1);

        captureCodes(); notices.deliver();
        assertThat(db.queryForObject("select sent from ho_so_thong_bao where email=?",Boolean.class,email)).isTrue();
        var token = login(email,"mobile");
        given().auth().oauth2(token).get("/api/v1/profile/me")
                .then().statusCode(200).body("profileStatus",equalTo("BI_TU_CHOI"))
                .body("rejectReason",equalTo("Ảnh thẻ không đọc được."));
        // Gửi duyệt lại lấy lại trạng thái chờ duyệt.
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("name","Test Again"))
                .patch("/api/v1/profile/me").then().statusCode(200).body("profileStatus",equalTo("CHO_DUYET"));
    }

    @Test void concurrentApprovalLetsExactlyOneModeratorWin() throws Exception {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        String first = moderator(), second = moderator();
        UUID userId = id(email);
        try (var pool = Executors.newFixedThreadPool(2)) {
            java.util.function.Function<String,Integer> call = token -> given().auth().oauth2(token)
                    .post("/api/v1/admin/profiles/" + userId + "/approve").then().extract().statusCode();
            var results = pool.invokeAll(List.<Callable<Integer>>of(() -> call.apply(first), () -> call.apply(second)));
            List<Integer> codes = new ArrayList<>();
            for (var result : results) codes.add(result.get());
            assertThat(codes).containsExactlyInAnyOrder(204, 409);
        }
        assertThat(db.queryForObject("select count(*) from kiem_duyet_ho_so where user_id=?",Integer.class,userId)).isEqualTo(1);
    }

    @Test void memberCannotUseModerationEndpoints() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        activate();
        var token = login(email,"mobile");
        UUID userId = id(email);
        assertThat(given().auth().oauth2(token).get("/api/v1/admin/profiles/pending").then().extract().statusCode()).isEqualTo(403);
        assertThat(given().auth().oauth2(token).get("/api/v1/admin/profiles/" + userId).then().extract().statusCode()).isEqualTo(403);
        assertThat(given().auth().oauth2(token).post("/api/v1/admin/profiles/" + userId + "/approve").then().extract().statusCode()).isEqualTo(403);
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("reason","Tự duyệt hồ sơ."))
                .post("/api/v1/admin/profiles/" + userId + "/reject").then().statusCode(403);
        assertThat(given().get("/api/v1/profile/me").then().extract().statusCode()).isEqualTo(401);
    }

    @Test void studentCardIsReadableOnlyByOwnerAndModerator() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        UUID userId = id(email);
        byte[] png = {(byte)0x89,'P','N','G',0x0D,0x0A,0x1A,0x0A,0,0,0,0};

        given().auth().oauth2(token).multiPart("file","card.bin","not an image".getBytes(),"image/png")
                .post("/api/v1/profile/me/student-card")
                .then().statusCode(400).body("code",equalTo("INVALID_STUDENT_CARD"));
        given().auth().oauth2(token).multiPart("file","card.png",png,"image/jpeg")
                .post("/api/v1/profile/me/student-card").then().statusCode(204);
        // Ảnh mới nằm ở bảng chờ duyệt, chưa thay ảnh chính thức.
        assertThat(db.queryForObject("select object_key from the_sinh_viens_cho_duyet where user_id=?",String.class,userId)).isNotBlank();

        given().auth().oauth2(token).get("/api/v1/profile/student-cards/" + userId)
                .then().statusCode(200).header("Cache-Control","no-store").contentType("image/png");
        String admin = moderator();
        given().auth().oauth2(admin).get("/api/v1/admin/profiles/" + userId + "/student-card").then().statusCode(200);

        String otherEmail = "o" + UUID.randomUUID().toString().substring(0,10) + NEW_EMAIL_DOMAIN;
        String otherMssv = "O" + UUID.randomUUID().toString().substring(0,8);
        var other = auth.register("Other",otherMssv,otherEmail,PASSWORD,otherMssv);
        delivery.deliver();
        auth.verify(other.challengeId(),otherEmail,"REGISTER",codes.get(otherEmail),otherMssv);
        assertThat(given().auth().oauth2(login(otherEmail,"mobile"))
                .get("/api/v1/profile/student-cards/" + userId).then().extract().statusCode()).isEqualTo(403);
    }

    @Test void phoneOnlyUpdateSavesImmediatelyAndKeepsApprovedStatus() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        activate();
        var token = login(email,"mobile");
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("phone","0901 234 567"))
                .patch("/api/v1/profile/me").then().statusCode(200)
                .body("profileStatus",equalTo("DA_DUYET")).body("phone",equalTo("0901 234 567"));
        assertThat(db.queryForObject("select so_dien_thoai from thanh_viens where email=?",String.class,email)).isEqualTo("0901 234 567");
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("phone","abc"))
                .patch("/api/v1/profile/me").then().statusCode(400).body("code",equalTo("INVALID_PHONE"));
        // MSSV của người khác bị chặn ngay khi đưa vào bản chờ duyệt.
        String takenMssv = "T" + UUID.randomUUID().toString().substring(0,8);
        db.update("update thanh_viens set mssv=? where email=?",takenMssv,email);
        String otherEmail = "x" + UUID.randomUUID().toString().substring(0,10) + NEW_EMAIL_DOMAIN;
        String otherMssv = "X" + UUID.randomUUID().toString().substring(0,8);
        var other = auth.register("Other",otherMssv,otherEmail,PASSWORD,otherMssv);
        delivery.deliver();
        auth.verify(other.challengeId(),otherEmail,"REGISTER",codes.get(otherEmail),otherMssv);
        given().auth().oauth2(login(otherEmail,"mobile")).contentType(ContentType.JSON).body(Map.of("studentId",takenMssv))
                .patch("/api/v1/profile/me").then().statusCode(409).body("code",equalTo("STUDENT_ID_IN_USE"));
    }

    @Test void changeEmailValidatesThenConfirmsThroughOtp() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        String fresh = "n" + UUID.randomUUID().toString().substring(0,10) + NEW_EMAIL_DOMAIN;
        String taken = "t" + UUID.randomUUID().toString().substring(0,10) + NEW_EMAIL_DOMAIN;
        String takenMssv = "Z" + UUID.randomUUID().toString().substring(0,8);
        var other = auth.register("Other",takenMssv,taken,PASSWORD,takenMssv);
        delivery.deliver();
        auth.verify(other.challengeId(),taken,"REGISTER",codes.get(taken),takenMssv);

        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("currentPassword","wrong one entirely","newEmail",fresh))
                .patch("/api/v1/profile/email").then().statusCode(401).body("code",equalTo("INVALID_CREDENTIALS"));
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("currentPassword",PASSWORD,"newEmail","someone@gmail.com"))
                .patch("/api/v1/profile/email").then().statusCode(400).body("code",equalTo("INVALID_EMAIL"));
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("currentPassword",PASSWORD,"newEmail",email))
                .patch("/api/v1/profile/email").then().statusCode(400).body("code",equalTo("EMAIL_UNCHANGED"));
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("currentPassword",PASSWORD,"newEmail",taken))
                .patch("/api/v1/profile/email").then().statusCode(409).body("code",equalTo("EMAIL_IN_USE"));

        var issued = given().auth().oauth2(token).contentType(ContentType.JSON)
                .body(Map.of("currentPassword",PASSWORD,"newEmail",fresh))
                .patch("/api/v1/profile/email").then().statusCode(200).extract().jsonPath();
        String challengeId = issued.getString("challengeId");
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("currentPassword",PASSWORD,"newEmail",fresh))
                .patch("/api/v1/profile/email").then().statusCode(429).body("code",equalTo("RATE_LIMITED"));

        delivery.deliver();
        String otp = codes.get(fresh);
        String wrong = otp.equals("000000") ? "999999" : "000000";
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("challengeId",challengeId,"code",wrong))
                .post("/api/v1/profile/email/verify").then().statusCode(400).body("code",equalTo("INVALID_OTP"));
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("challengeId",challengeId,"code",otp))
                .post("/api/v1/profile/email/verify").then().statusCode(204);
        assertThat(db.queryForObject("select email from thanh_viens where user_id=?",String.class,id(fresh))).isEqualTo(fresh);
        assertThat(db.queryForObject("select email_verified from thanh_viens where email=?",Boolean.class,fresh)).isTrue();
        // Mã đã dùng không tái sử dụng được.
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("challengeId",challengeId,"code",otp))
                .post("/api/v1/profile/email/verify").then().statusCode(400).body("code",equalTo("INVALID_OTP"));
    }

    @Test void twoAccountsCannotClaimSameEmailConcurrently() throws Exception {
        String target = "c" + UUID.randomUUID().toString().substring(0,10) + NEW_EMAIL_DOMAIN;
        List<String> tokens = new ArrayList<>();
        List<String> challengeIds = new ArrayList<>();
        List<String> otps = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            String address = "s" + UUID.randomUUID().toString().substring(0,10) + NEW_EMAIL_DOMAIN;
            String mssv = "S" + UUID.randomUUID().toString().substring(0,8);
            var registered = auth.register("Race",mssv,address,PASSWORD,mssv);
            delivery.deliver();
            auth.verify(registered.challengeId(),address,"REGISTER",codes.get(address),mssv);
            String token = login(address,"mobile");
            challengeIds.add(given().auth().oauth2(token).contentType(ContentType.JSON)
                    .body(Map.of("currentPassword",PASSWORD,"newEmail",target))
                    .patch("/api/v1/profile/email").then().statusCode(200).extract().jsonPath().getString("challengeId"));
            delivery.deliver();
            otps.add(codes.get(target));
            tokens.add(token);
        }
        try (var pool = Executors.newFixedThreadPool(2)) {
            java.util.function.IntFunction<Integer> call = i -> given().auth().oauth2(tokens.get(i)).contentType(ContentType.JSON)
                    .body(Map.of("challengeId",challengeIds.get(i),"code",otps.get(i)))
                    .post("/api/v1/profile/email/verify").then().extract().statusCode();
            var results = pool.invokeAll(List.<Callable<Integer>>of(() -> call.apply(0), () -> call.apply(1)));
            List<Integer> statuses = new ArrayList<>();
            for (var result : results) statuses.add(result.get());
            assertThat(statuses).containsExactlyInAnyOrder(204, 409);
        }
        assertThat(db.queryForObject("select count(*) from thanh_viens where lower(email)=?",Integer.class,target)).isEqualTo(1);
    }

    @Test void changeEmailRejectsUnknownChallenge() {
        var registered = register(email);
        auth.verify(registered.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        given().auth().oauth2(token).contentType(ContentType.JSON)
                .body(Map.of("challengeId",UUID.randomUUID().toString(),"code","123456"))
                .post("/api/v1/profile/email/verify").then().statusCode(400).body("code",equalTo("INVALID_OTP"));
    }

    /** UC-02: hồ sơ đã bị từ chối rời hàng đợi, không quyết định lại được, và gửi lại thì quay về hàng đợi. */
    @Test void rejectedRegistrationLeavesQueueUntilResubmitted() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        String admin = moderator();
        UUID userId = id(email);
        String body = "/api/v1/admin/profiles/" + userId;

        given().auth().oauth2(admin).contentType(ContentType.JSON).body(Map.of("reason","Ảnh thẻ mờ."))
                .post(body + "/reject").then().statusCode(204);

        // Không còn trong danh sách chờ duyệt.
        assertThat(given().auth().oauth2(admin).get("/api/v1/admin/profiles/pending")
                .then().statusCode(200).extract().jsonPath().getList("email",String.class)).doesNotContain(email);
        // Quyết định lần hai bị chặn, không ghi thêm bản kiểm duyệt.
        given().auth().oauth2(admin).post(body + "/approve").then().statusCode(409).body("code",equalTo("PROFILE_ALREADY_HANDLED"));
        given().auth().oauth2(admin).contentType(ContentType.JSON).body(Map.of("reason","Từ chối lần hai."))
                .post(body + "/reject").then().statusCode(409).body("code",equalTo("PROFILE_ALREADY_HANDLED"));
        assertThat(db.queryForObject("select count(*) from kiem_duyet_ho_so where user_id=?",Integer.class,userId)).isEqualTo(1);
        // Trang chi tiết vẫn đọc được hồ sơ đã xử lý thay vì 409 để UI không kẹt.
        given().auth().oauth2(admin).get(body).then().statusCode(200)
                .body("profileStatus",equalTo("BI_TU_CHOI")).body("rejectReason",equalTo("Ảnh thẻ mờ."));

        // Gửi lại hồ sơ đăng ký lại vào hàng đợi và vẫn là hồ sơ đăng ký mới.
        var token = login(email,"mobile");
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("name","Test Resubmit"))
                .patch("/api/v1/profile/me").then().statusCode(200).body("profileStatus",equalTo("CHO_DUYET"));
        given().auth().oauth2(admin).get("/api/v1/admin/profiles/pending").then().statusCode(200)
                .body("find { it.email == '" + email + "' }.kind", equalTo("DANG_KY"));
    }

    /** Bổ sung phạm vi P1-05: tài khoản bị khóa/vô hiệu hóa không sửa được hồ sơ hay đổi email. */
    @Test void lockedAccountCannotMutateProfile() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        activate();
        var token = login(email,"mobile");
        String fresh = "l" + UUID.randomUUID().toString().substring(0,10) + NEW_EMAIL_DOMAIN;
        byte[] png = {(byte)0x89,'P','N','G',0x0D,0x0A,0x1A,0x0A,0,0,0,0};

        db.update("update thanh_viens set trang_thai_tai_khoan='BI_KHOA' where email=?",email);
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("phone","0901 234 567"))
                .patch("/api/v1/profile/me").then().statusCode(403).body("code",equalTo("ACCOUNT_RESTRICTED"));
        given().auth().oauth2(token).multiPart("file","card.png",png,"image/png")
                .post("/api/v1/profile/me/student-card").then().statusCode(403).body("code",equalTo("ACCOUNT_RESTRICTED"));
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("currentPassword",PASSWORD,"newEmail",fresh))
                .patch("/api/v1/profile/email").then().statusCode(403).body("code",equalTo("ACCOUNT_RESTRICTED"));
        assertThat(db.queryForObject("select count(*) from the_sinh_viens where user_id=?",Integer.class,id(email))).isZero();
        assertThat(db.queryForObject("select count(*) from the_sinh_viens_cho_duyet where user_id=?",Integer.class,id(email))).isZero();
        assertThat(db.queryForObject("select count(*) from auth_challenge where user_id=? and purpose='CHANGE_EMAIL'",
                Integer.class,id(email))).isZero();

        db.update("update thanh_viens set trang_thai_tai_khoan='VO_HIEU_HOA' where email=?",email);
        assertThat(given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("phone","0901 234 567"))
                .patch("/api/v1/profile/me").then().extract().statusCode()).isIn(401, 403);
    }

    /** Ảnh thẻ mới thay ảnh cũ và object cũ bị xoá sau khi commit. */
    @Test void replacingStudentCardKeepsOnlyLatestObject() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        UUID userId = id(email);
        byte[] png = {(byte)0x89,'P','N','G',0x0D,0x0A,0x1A,0x0A,0,0,0,0};

        given().auth().oauth2(token).multiPart("file","card.png",png,"image/png")
                .post("/api/v1/profile/me/student-card").then().statusCode(204);
        String first = db.queryForObject("select object_key from the_sinh_viens_cho_duyet where user_id=?",String.class,userId);
        given().auth().oauth2(token).multiPart("file","card.png",png,"image/png")
                .post("/api/v1/profile/me/student-card").then().statusCode(204);
        String second = db.queryForObject("select object_key from the_sinh_viens_cho_duyet where user_id=?",String.class,userId);

        assertThat(second).isNotEqualTo(first);
        assertThat(java.nio.file.Path.of(".local/student-cards", first)).doesNotExist();
        assertThat(java.nio.file.Path.of(".local/student-cards", second)).exists();
        // Chưa duyệt: ảnh chính thức vẫn trống (M2).
        assertThat(db.queryForObject("select count(*) from the_sinh_viens where user_id=?",Integer.class,userId)).isZero();

        // Duyệt: ảnh chờ thành ảnh chính thức, bảng chờ rỗng, object vừa thăng cấp vẫn còn.
        given().auth().oauth2(moderator()).post("/api/v1/admin/profiles/" + userId + "/approve").then().statusCode(204);
        assertThat(db.queryForObject("select object_key from the_sinh_viens where user_id=?",String.class,userId)).isEqualTo(second);
        assertThat(db.queryForObject("select count(*) from the_sinh_viens_cho_duyet where user_id=?",Integer.class,userId)).isZero();
        assertThat(java.nio.file.Path.of(".local/student-cards", second)).exists();
    }

    /** Mục 6 review vòng 2: đang giữ mã đổi email mà tài khoản bị khóa thì không xác minh được. */
    @Test void lockedAccountCannotVerifyEmailChange() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        activate();
        var token = login(email,"mobile");
        String fresh = "k" + UUID.randomUUID().toString().substring(0,10) + NEW_EMAIL_DOMAIN;
        String challengeId = given().auth().oauth2(token).contentType(ContentType.JSON)
                .body(Map.of("currentPassword",PASSWORD,"newEmail",fresh))
                .patch("/api/v1/profile/email").then().statusCode(200).extract().jsonPath().getString("challengeId");
        delivery.deliver();
        String otp = codes.get(fresh);

        db.update("update thanh_viens set trang_thai_tai_khoan='BI_KHOA' where email=?",email);
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("challengeId",challengeId,"code",otp))
                .post("/api/v1/profile/email/verify").then().statusCode(403).body("code",equalTo("ACCOUNT_RESTRICTED"));
        assertThat(db.queryForObject("select email from thanh_viens where user_id=?",String.class,id(email))).isEqualTo(email);
    }

    /** Mục 4 review vòng 2: xoá trắng trường định danh phải xoá thật, không lấp lại giá trị cũ. */
    @Test void clearingIdentityFieldHidesOldValueInPendingProfile() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        String admin = moderator();
        UUID userId = id(email);

        given().auth().oauth2(token).contentType(ContentType.JSON)
                .body(Map.of("school","ĐH Bách khoa","major","CNTT")).patch("/api/v1/profile/me").then().statusCode(200);
        given().auth().oauth2(admin).get("/api/v1/admin/profiles/" + userId).then().statusCode(200)
                .body("school",equalTo("ĐH Bách khoa")).body("major",equalTo("CNTT"));

        given().auth().oauth2(token).contentType(ContentType.JSON)
                .body(Map.of("school","","major","")).patch("/api/v1/profile/me").then().statusCode(200)
                .body("school",nullValue()).body("major",nullValue());
        given().auth().oauth2(admin).get("/api/v1/admin/profiles/" + userId).then().statusCode(200)
                .body("school",nullValue()).body("major",nullValue());

        given().auth().oauth2(admin).post("/api/v1/admin/profiles/" + userId + "/approve").then().statusCode(204);
        assertThat(db.queryForObject("select truong from thanh_viens where user_id=?",String.class,userId)).isNull();
        assertThat(db.queryForObject("select nganh_hoc from thanh_viens where user_id=?",String.class,userId)).isNull();
    }

    /** Mục 6 review vòng 2: tài khoản vô hiệu hoá rời hàng đợi và không quyết định được. */
    @Test void disabledAccountLeavesQueueAndCannotBeReviewed() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        String admin = moderator();
        UUID userId = id(email);

        assertThat(given().auth().oauth2(admin).get("/api/v1/admin/profiles/pending")
                .then().statusCode(200).extract().jsonPath().getList("email",String.class)).contains(email);
        db.update("update thanh_viens set trang_thai_tai_khoan='VO_HIEU_HOA' where user_id=?",userId);

        assertThat(given().auth().oauth2(admin).get("/api/v1/admin/profiles/pending")
                .then().statusCode(200).extract().jsonPath().getList("email",String.class)).doesNotContain(email);
        given().auth().oauth2(admin).post("/api/v1/admin/profiles/" + userId + "/approve")
                .then().statusCode(409).body("code",equalTo("ACCOUNT_DELETED"));
        given().auth().oauth2(admin).contentType(ContentType.JSON).body(Map.of("reason","Tài khoản đã xoá."))
                .post("/api/v1/admin/profiles/" + userId + "/reject").then().statusCode(409).body("code",equalTo("ACCOUNT_DELETED"));
        assertThat(db.queryForObject("select count(*) from kiem_duyet_ho_so where user_id=?",Integer.class,userId)).isZero();
    }

    /** Mục 5 review vòng 2: điểm khởi tạo đi qua sổ cái, đúng một bản ghi, duyệt lại không cộng thêm. */
    @Test void approvalWritesActivationEntryOnceInLedger() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        String admin = moderator();
        UUID userId = id(email);

        given().auth().oauth2(admin).post("/api/v1/admin/profiles/" + userId + "/approve").then().statusCode(204);
        assertThat(db.queryForObject("select count(*) from lich_su_diem_uy_tin where user_id=? and loai_bien_dong='KHOI_TAO_KICH_HOAT'",
                Integer.class,userId)).isEqualTo(1);

        db.update("update thanh_viens set diem_uy_tin=64 where user_id=?",userId);
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("name","Tên Mới"))
                .patch("/api/v1/profile/me").then().statusCode(200);
        given().auth().oauth2(admin).post("/api/v1/admin/profiles/" + userId + "/approve").then().statusCode(204);

        assertThat(db.queryForObject("select diem_uy_tin from thanh_viens where user_id=?",Integer.class,userId)).isEqualTo(64);
        assertThat(db.queryForObject("select count(*) from lich_su_diem_uy_tin where user_id=? and loai_bien_dong='KHOI_TAO_KICH_HOAT'",
                Integer.class,userId)).isEqualTo(1);
    }

    /** UC-02 §3.3 bước 7: quyết định phải dựa trên đúng bản hồ sơ đã xem, không phải bản mới hơn. */
    @Test void decisionOnStaleSnapshotIsRejectedAndNewVersionStaysPending() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        String admin = moderator();
        UUID userId = id(email);

        long seen = given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("name","Ban A"))
                .patch("/api/v1/profile/me").then().statusCode(200).extract().jsonPath().getLong("version");
        // Người dùng sửa tiếp thành bản B trong lúc kiểm duyệt viên còn đang xem bản A.
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("name","Ban B"))
                .patch("/api/v1/profile/me").then().statusCode(200);

        given().auth().oauth2(admin)
                .post("/api/v1/admin/profiles/" + userId + "/approve?expectedVersion=" + seen)
                .then().statusCode(409).body("code",equalTo("PROFILE_CHANGED"));
        given().auth().oauth2(admin).contentType(ContentType.JSON).body(Map.of("reason","Ảnh mờ quá khó đọc."))
                .post("/api/v1/admin/profiles/" + userId + "/reject?expectedVersion=" + seen)
                .then().statusCode(409).body("code",equalTo("PROFILE_CHANGED"));
        assertThat(db.queryForObject("select count(*) from kiem_duyet_ho_so where user_id=?",Integer.class,userId)).isZero();
        // Bản B vẫn chờ duyệt và tên hiệu lực chưa đổi.
        assertThat(db.queryForObject("select ho_ten from thanh_viens where user_id=?",String.class,userId)).isEqualTo("Test");

        long latest = given().auth().oauth2(admin).get("/api/v1/admin/profiles/" + userId)
                .then().statusCode(200).body("name",equalTo("Ban B")).extract().jsonPath().getLong("version");
        given().auth().oauth2(admin)
                .post("/api/v1/admin/profiles/" + userId + "/approve?expectedVersion=" + latest).then().statusCode(204);
        assertThat(db.queryForObject("select ho_ten from thanh_viens where user_id=?",String.class,userId)).isEqualTo("Ban B");
    }

    /** Hàng đợi phải hiện đúng tên/MSSV mà kiểm duyệt viên sắp duyệt, tức bản chờ duyệt. */
    @Test void pendingQueueShowsSubmittedSnapshotInsteadOfLiveProfile() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        String admin = moderator();

        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("name","Ten Cho Duyet","studentId","Q" + student))
                .patch("/api/v1/profile/me").then().statusCode(200);
        given().auth().oauth2(admin).get("/api/v1/admin/profiles/pending").then().statusCode(200)
                .body("find { it.email == '" + email + "' }.name", equalTo("Ten Cho Duyet"))
                .body("find { it.email == '" + email + "' }.studentId", equalTo("Q" + student));
    }

    /** UC-05: người dùng tự khai tình trạng học tập nhưng chỉ có hiệu lực sau khi duyệt. */
    @Test void studyStatusIsSubmittedForReviewAndAppliedOnApproval() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        String admin = moderator();
        UUID userId = id(email);

        given().auth().oauth2(admin).post("/api/v1/admin/profiles/" + userId + "/approve").then().statusCode(204);
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("studyStatus","DA_TOT_NGHIEP"))
                .patch("/api/v1/profile/me").then().statusCode(200)
                .body("studyStatus",equalTo("DA_TOT_NGHIEP")).body("profileStatus",equalTo("CHO_DUYET"));
        // Chưa duyệt thì giá trị hiệu lực vẫn là DANG_HOC và tài khoản vẫn HOAT_DONG.
        assertThat(db.queryForObject("select trang_thai_sv from thanh_viens where user_id=?",String.class,userId)).isEqualTo("DANG_HOC");
        assertThat(db.queryForObject("select trang_thai_tai_khoan from thanh_viens where user_id=?",String.class,userId)).isEqualTo("HOAT_DONG");
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("studyStatus","DANG_HOC_LAI"))
                .patch("/api/v1/profile/me").then().statusCode(400).body("code",equalTo("INVALID_INPUT"));

        given().auth().oauth2(admin).post("/api/v1/admin/profiles/" + userId + "/approve").then().statusCode(204);
        assertThat(db.queryForObject("select trang_thai_sv from thanh_viens where user_id=?",String.class,userId)).isEqualTo("DA_TOT_NGHIEP");
        assertThat(db.queryForObject("select trang_thai_tai_khoan from thanh_viens where user_id=?",String.class,userId)).isEqualTo("HOAT_DONG");
    }

    /** Gửi lại y nguyên dữ liệu đang hiệu lực thì rút bản chờ duyệt thay vì bắt kiểm duyệt viên duyệt lại. */
    @Test void resubmittingEffectiveValuesWithdrawsPendingSnapshot() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        activate();
        var token = login(email,"mobile");
        String admin = moderator();
        UUID userId = id(email);

        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("school","ĐH Bách khoa"))
                .patch("/api/v1/profile/me").then().statusCode(200).body("profileStatus",equalTo("CHO_DUYET"));
        // "" là xoá trường, nên gửi lại đúng giá trị cũ bằng cách gửi null tường minh không được; gửi lại y nguyên bản cũ.
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("school","ĐH Bách khoa"))
                .patch("/api/v1/profile/me").then().statusCode(200).body("profileStatus",equalTo("CHO_DUYET"));
        given().auth().oauth2(admin).get("/api/v1/admin/profiles/" + userId).then().statusCode(200)
                .body("school",equalTo("ĐH Bách khoa"));
        given().auth().oauth2(admin).post("/api/v1/admin/profiles/" + userId + "/approve").then().statusCode(204);
        assertThat(db.queryForObject("select truong from thanh_viens where user_id=?",String.class,userId)).isEqualTo("ĐH Bách khoa");
    }

    /** Mục 1 review vòng 3: bộ đếm PASSWORD_WRONG không bị rollback, lần thứ 6 trả 429 kèm Retry-After. */
    @Test void wrongCurrentPasswordOnChangeEmailIsRateLimited() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        var token = login(email,"mobile");
        String fresh = "r" + UUID.randomUUID().toString().substring(0,10) + NEW_EMAIL_DOMAIN;

        for (int i = 0; i < 5; i++)
            given().auth().oauth2(token).contentType(ContentType.JSON)
                    .body(Map.of("currentPassword","wrong one entirely","newEmail",fresh))
                    .patch("/api/v1/profile/email").then().statusCode(401).body("code",equalTo("INVALID_CREDENTIALS"));
        // Bản ghi PASSWORD_WRONG phải còn sau khi AuthFailure rollback transaction.
        assertThat(db.queryForObject("select count(*) from auth_event where subject=? and kind='PASSWORD_WRONG'",
                Integer.class,email)).isEqualTo(5);
        // Đúng mật khẩu cũng bị chặn: ngưỡng kiểm trước khi so mật khẩu nên không thành đường dò.
        var limited = given().auth().oauth2(token).contentType(ContentType.JSON)
                .body(Map.of("currentPassword",PASSWORD,"newEmail",fresh))
                .patch("/api/v1/profile/email").then().statusCode(429).body("code",equalTo("RATE_LIMITED"))
                .extract();
        assertThat(limited.header("Retry-After")).matches("[0-9]+");
        assertThat(limited.jsonPath().getLong("retryAfter")).isPositive();
    }

    /** Mục 2 review vòng 3: PATCH từng phần giữ trường đang chờ, gửi ngược về giá trị hiệu lực thì rút bản chờ. */
    @Test void partialUpdateKeepsPendingFieldAndRevertingWithdrawsPendingSnapshot() {
        var challenge = register(email);
        auth.verify(challenge.challengeId(),email,"REGISTER",codeFor(email),student);
        activate();
        var token = login(email,"mobile");
        UUID userId = id(email);

        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("school","ĐH Bách khoa"))
                .patch("/api/v1/profile/me").then().statusCode(200).body("profileStatus",equalTo("CHO_DUYET"));
        // PATCH từng phần chỉ có major không được ghi đè mất school đang chờ.
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("major","CNTT"))
                .patch("/api/v1/profile/me").then().statusCode(200)
                .body("school",equalTo("ĐH Bách khoa")).body("major",equalTo("CNTT"))
                .body("profileStatus",equalTo("CHO_DUYET"));
        // Xoá school: vẫn còn major khác giá trị hiệu lực nên bản chờ giữ nguyên.
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("school","BK cơ sở 2"))
                .patch("/api/v1/profile/me").then().statusCode(200)
                .body("school",equalTo("BK cơ sở 2")).body("major",equalTo("CNTT")).body("profileStatus",equalTo("CHO_DUYET"));
        // Gửi school về giá trị đang hiệu lực: major vẫn khác nên chưa rút bản chờ.
        String effectiveSchool = db.queryForObject("select truong from thanh_viens where user_id=?",String.class,userId);
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("school",effectiveSchool))
                .patch("/api/v1/profile/me").then().statusCode(200)
                .body("school",equalTo(effectiveSchool)).body("major",equalTo("CNTT")).body("profileStatus",equalTo("CHO_DUYET"));
        // Gửi nốt major về null (bằng giá trị hiệu lực): bản chờ trùng hệt nên bị rút và hồ sơ về DA_DUYET.
        given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("major",""))
                .patch("/api/v1/profile/me").then().statusCode(200)
                .body("major",nullValue()).body("profileStatus",equalTo("DA_DUYET"));
        assertThat(db.queryForObject("select count(*) from ho_so_cap_nhat where user_id=?",Integer.class,userId)).isZero();
        assertThat(db.queryForObject("select cho_duyet_lai from thanh_viens where user_id=?",Boolean.class,userId)).isFalse();
    }

    private static org.hamcrest.Matcher<Object> equalTo(Object value) {
        return org.hamcrest.Matchers.equalTo(value);
    }
    private static org.hamcrest.Matcher<Object> nullValue() {
        return org.hamcrest.Matchers.nullValue();
    }
}
