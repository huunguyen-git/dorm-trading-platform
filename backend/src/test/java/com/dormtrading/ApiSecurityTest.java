package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.bind.annotation.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;
import static io.restassured.RestAssured.given;

@Import(ApiSecurityTest.Probes.class)
class ApiSecurityTest extends BaseIntegrationTest {
    @Autowired AuthService auth;
    @Autowired OtpDelivery delivery;
    @Autowired JdbcTemplate db;
    @MockitoBean JavaMailSender mail;
    @MockitoBean Clock clock;
    private final AtomicReference<Instant> time = new AtomicReference<>();
    private final ConcurrentMap<String,String> codes = new ConcurrentHashMap<>();
    private String email, student;
    private static final String PASSWORD = "a quiet river beneath stars";
    private static final String NEW_PASSWORD = "three islands beyond the horizon";
    @RestController static class Probes {
        @GetMapping("/api/v1/admin/probe") String admin() { return "ok"; }
        @GetMapping("/api/v1/admin/senior/probe") String senior() { return "ok"; }
        @PostMapping("/api/v1/orders/probe") String write() { return "ok"; }
    }
    @BeforeEach void setup() {
        time.set(Instant.now()); when(clock.instant()).thenAnswer(i -> time.get());
        student = UUID.randomUUID().toString().substring(0,12); email = "u" + student + "@student.edu.vn";
        doAnswer(i -> { var message=(SimpleMailMessage)i.getArgument(0); var matcher=Pattern.compile("[0-9]{6}").matcher(message.getText());
            if(matcher.find()) codes.put(message.getTo()[0],matcher.group()); return null; }).when(mail).send(any(SimpleMailMessage.class));
    }
    private String code() { delivery.deliver(); return codes.get(email); }
    private AuthService.Challenge register() { return auth.register("Test",student,email,PASSWORD,student); }
    private void verify(AuthService.Challenge c) { auth.verify(c.challengeId(),email,"REGISTER",code(),student); }
    private void activate() { db.update("update thanh_viens set profile_approved=true,trang_thai_tai_khoan='HOAT_DONG',diem_uy_tin=100 where email=?",email); }
    private int get(String token,String path) { return given().auth().oauth2(token).get(path).statusCode(); }
    private int post(String token,String path) { return given().auth().oauth2(token).post(path).statusCode(); }
    private org.springframework.security.oauth2.jwt.Jwt jwt(String token) {
        try {
            var parsed=com.nimbusds.jwt.SignedJWT.parse(token).getJWTClaimsSet();
            return org.springframework.security.oauth2.jwt.Jwt.withTokenValue(token).header("alg","HS256").claims(c -> c.putAll(parsed.getClaims()))
                    .issuedAt(parsed.getIssueTime().toInstant()).expiresAt(parsed.getExpirationTime().toInstant()).build();
        } catch(Exception e) { throw new RuntimeException(e); }
    }
    @Test void registrationSeparatesVerificationAndApprovalAndGuardsApi() {
        var c=register(); var a=auth.login(email,PASSWORD,"mobile",student);
        assertThat(a.user().emailVerified()).isFalse();
        assertThat(post(a.token(),"/api/v1/orders/probe")).isEqualTo(403);
        assertThat(get(a.token(),"/api/v1/listings")).isEqualTo(200);
        verify(c); assertThat(post(a.token(),"/api/v1/orders/probe")).isEqualTo(403);
        activate(); assertThat(post(a.token(),"/api/v1/orders/probe")).isEqualTo(200);
        assertThat(get(a.token(),"/api/v1/admin/probe")).isEqualTo(403);
        given().auth().oauth2(a.token()).contentType("application/json").body(Map.of("email","other@student.edu.vn"))
                .patch("/api/v1/auth/profile").then().statusCode(400);
        assertThat(db.queryForObject("select mat_khau_hash from thanh_viens where email=?",String.class,email)).startsWith("$argon2id$");
        assertThatThrownBy(() -> auth.register("Test","newid",email,PASSWORD,student)).isInstanceOf(AuthFailure.class);
    }
    @Test void logoutRevokesOnlyOneDeviceImmediately() {
        register(); var a=auth.login(email,PASSWORD,"mobile",student); var b=auth.login(email,PASSWORD,"mobile",student);
        auth.logout(jwt(a.token()));
        assertThat(get(a.token(),"/api/v1/auth/me")).isEqualTo(401);
        assertThat(get(b.token(),"/api/v1/auth/me")).isEqualTo(200);
        assertThatThrownBy(() -> auth.refresh(a.refreshToken(),"mobile")).isInstanceOf(AuthFailure.class);
    }
    @Test void changePasswordRotatesCurrentAndRevokesOthers() {
        register(); var a=auth.login(email,PASSWORD,"mobile",student); var b=auth.login(email,PASSWORD,"mobile",student);
        var changed=auth.changePassword(jwt(a.token()),PASSWORD,NEW_PASSWORD);
        assertThat(get(a.token(),"/api/v1/auth/me")).isEqualTo(401);
        assertThat(get(b.token(),"/api/v1/auth/me")).isEqualTo(401);
        assertThat(get(changed.token(),"/api/v1/auth/me")).isEqualTo(200);
        assertThat(auth.refresh(changed.refreshToken(),"mobile").user().email()).isEqualTo(email);
        assertThat(db.queryForObject("select count(*) from auth_notice where email=?",Integer.class,email)).isEqualTo(1);
    }
    @Test void resetHasOneTimeGrantAndRevokesEveryDevice() {
        register(); var a=auth.login(email,PASSWORD,"mobile",student); var b=auth.login(email,PASSWORD,"mobile",student);
        time.set(time.get().plusSeconds(61)); var c=auth.requestOtp(email,"RESET",student);
        assertThatThrownBy(() -> auth.verify(c.challengeId(),email,"REGISTER",code(),student)).isInstanceOf(AuthFailure.class);
        var grant=auth.verify(c.challengeId(),email,"RESET",code(),student).resetToken(); auth.reset(grant,NEW_PASSWORD);
        assertThat(get(a.token(),"/api/v1/auth/me")).isEqualTo(401);
        assertThat(get(b.token(),"/api/v1/auth/me")).isEqualTo(401);
        assertThatThrownBy(() -> auth.reset(grant,PASSWORD)).isInstanceOf(AuthFailure.class);
        assertThatThrownBy(() -> auth.login(email,PASSWORD,"mobile",student)).isInstanceOf(AuthFailure.class);
        assertThat(auth.login(email,NEW_PASSWORD,"mobile",student).user().id()).isNotNull();
    }
    @Test void refreshRotationDetectsReplayAndRejectsOtherClient() {
        register(); var a=auth.login(email,PASSWORD,"mobile",student);
        assertThatThrownBy(() -> auth.refresh(a.refreshToken(),"admin-web")).isInstanceOf(AuthFailure.class);
        var next=auth.refresh(a.refreshToken(),"mobile");
        assertThatThrownBy(() -> auth.refresh(a.refreshToken(),"mobile")).isInstanceOf(AuthFailure.class);
        assertThat(get(next.token(),"/api/v1/auth/me")).isEqualTo(401);
    }
    @Test void otpLimitsResendAndExpiryPersistAcrossFailedTransactions() {
        var first=register();
        assertThatThrownBy(() -> auth.requestOtp(email,"REGISTER",student)).isInstanceOf(AuthFailure.class);
        String wrong=code().equals("000000") ? "999999" : "000000";
        for(int i=0;i<5;i++) assertThatThrownBy(() -> auth.verify(first.challengeId(),email,"REGISTER",wrong,student)).isInstanceOf(AuthFailure.class);
        assertThatThrownBy(() -> verify(first)).isInstanceOf(AuthFailure.class);
        time.set(time.get().plusSeconds(60)); var second=auth.requestOtp(email,"REGISTER",student);
        assertThat(db.queryForObject("select count(*) from auth_event where subject=? and kind='WRONG'",Integer.class,email)).isEqualTo(6);
        time.set(time.get().plusSeconds(300)); assertThatThrownBy(() -> verify(second)).isInstanceOf(AuthFailure.class);
    }
    @Test void otpCanOnlyBeConsumedOnceConcurrently() throws Exception {
        var c=register(); String code=code();
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<Boolean> call=() -> { try { auth.verify(c.challengeId(),email,"REGISTER",code,student); return true; } catch(AuthFailure e) { return false; } };
            var results=pool.invokeAll(List.of(call,call));
            assertThat(results.stream().filter(f -> { try{return f.get();}catch(Exception e){throw new RuntimeException(e);} }).count()).isEqualTo(1);
        }
    }
    @Test void loginBackoffDoesNotLockBusinessAccount() {
        register();
        for(int i=0;i<5;i++) assertThatThrownBy(() -> auth.login(email,"incorrect passphrase","mobile",student)).isInstanceOf(AuthFailure.class);
        assertThatThrownBy(() -> auth.login(email,PASSWORD,"mobile",student)).isInstanceOf(AuthFailure.class).extracting("status").isEqualTo(429);
        time.set(time.get().plusSeconds(30)); assertThat(auth.login(email,PASSWORD,"mobile",student)).isNotNull();
        assertThat(db.queryForObject("select trang_thai_tai_khoan from thanh_viens where email=?",String.class,email)).isEqualTo("CHO_KICH_HOAT");
    }
    @Test void adminRolesRequireWebOriginAndLiveAssignment() {
        verify(register()); activate(); UUID id=db.queryForObject("select user_id from thanh_viens where email=?",UUID.class,email);
        db.update("insert into vai_tro_quan_tri(user_id,loai_vai_tro,bat_dau) values (?,'KIEM_DUYET_VIEN',?)",id,java.sql.Timestamp.from(time.get().minusSeconds(1)));
        var mobile=auth.login(email,PASSWORD,"mobile",student);
        assertThat(get(mobile.token(),"/api/v1/admin/probe")).isEqualTo(403);
        var body=Map.of("email",email,"password",PASSWORD,"client","admin-web");
        given().contentType("application/json").body(body).post("/api/v1/auth/login").then().statusCode(403);
        var response=given().header("Origin","http://localhost:5173").contentType("application/json").body(body).post("/api/v1/auth/login");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.header("Set-Cookie")).contains("Secure","HttpOnly","SameSite=Strict","Path=/api/v1/auth/refresh");
        assertThat(response.jsonPath().getString("refreshToken")).isNull(); String token=response.jsonPath().getString("token");
        assertThat(get(token,"/api/v1/admin/probe")).isEqualTo(200);
        assertThat(get(token,"/api/v1/admin/senior/probe")).isEqualTo(403);
        db.update("update vai_tro_quan_tri set trang_thai_hieu_luc=false where user_id=?",id);
        assertThat(get(token,"/api/v1/admin/probe")).isEqualTo(403);
    }
    @Test void smtpFailureRetainsEncryptedDeliveryForRetry() {
        doThrow(new org.springframework.mail.MailSendException("test unavailable")).when(mail).send(any(SimpleMailMessage.class));
        var c=register(); delivery.deliver();
        assertThat(db.queryForObject("select failures from auth_otp_delivery where challenge_id=?",Integer.class,c.challengeId())).isEqualTo(1);
        assertThat(db.queryForObject("select sent from auth_otp_delivery where challenge_id=?",Boolean.class,c.challengeId())).isFalse();
        assertThat(db.queryForObject("select payload from auth_otp_delivery where challenge_id=?",String.class,c.challengeId())).contains(":").doesNotContain("Mã xác minh");
        doAnswer(i -> { var message=(SimpleMailMessage)i.getArgument(0); var matcher=Pattern.compile("[0-9]{6}").matcher(message.getText());
            if(matcher.find()) codes.put(message.getTo()[0],matcher.group()); return null; }).when(mail).send(any(SimpleMailMessage.class));
        verify(c);
        assertThat(db.queryForObject("select payload from auth_otp_delivery where challenge_id=?",String.class,c.challengeId())).isEmpty();
    }
    @Test void rejectsUnauthenticatedAndTamperedTokens() {
        assertThat(given().get("/api/v1/auth/me").statusCode()).isEqualTo(401);
        register(); var a=auth.login(email,PASSWORD,"mobile",student);
        String broken=a.token().substring(0,a.token().lastIndexOf('.')+1)+"invalid";
        assertThat(get(broken,"/api/v1/auth/me")).isEqualTo(401);
        assertThat(given().get("/api/v1/health").statusCode()).isEqualTo(200);
    }
    @Test void hourlyDailyAndWrongAttemptLimitsSurviveResend() {
        register();
        for(int i=0;i<4;i++) { time.set(time.get().plusSeconds(60)); auth.requestOtp(email,"REGISTER",student); }
        time.set(time.get().plusSeconds(60));
        assertThatThrownBy(() -> auth.requestOtp(email,"REGISTER",student)).isInstanceOf(AuthFailure.class).extracting("status").isEqualTo(429);
        time.set(time.get().plusSeconds(3600));
        for(int i=0;i<5;i++) { auth.requestOtp(email,"REGISTER",student); time.set(time.get().plusSeconds(60)); }
        time.set(time.get().plusSeconds(3600));
        assertThatThrownBy(() -> auth.requestOtp(email,"RESET",student)).isInstanceOf(AuthFailure.class).extracting("status").isEqualTo(429);
        time.set(time.get().plusSeconds(86400)); var c=auth.requestOtp(email,"REGISTER",student);
        for(int i=0;i<10;i++) assertThatThrownBy(() -> auth.verify(c.challengeId(),email,"REGISTER","not-a-code",student)).isInstanceOf(AuthFailure.class);
        time.set(time.get().plusSeconds(60)); var fresh=auth.requestOtp(email,"REGISTER",student);
        assertThatThrownBy(() -> verify(fresh)).isInstanceOf(AuthFailure.class).extracting("status").isEqualTo(429);
    }
    @Test void resendInvalidatesOldCodeAndResetGrantExpires() {
        var old=register(); String oldCode=code();
        time.set(time.get().plusSeconds(60)); var fresh=auth.requestOtp(email,"REGISTER",student);
        assertThatThrownBy(() -> auth.verify(old.challengeId(),email,"REGISTER",oldCode,student)).isInstanceOf(AuthFailure.class);
        verify(fresh);
        time.set(time.get().plusSeconds(60)); var reset=auth.requestOtp(email,"RESET",student);
        var grant=auth.verify(reset.challengeId(),email,"RESET",code(),student).resetToken();
        time.set(time.get().plusSeconds(300)); assertThatThrownBy(() -> auth.reset(grant,NEW_PASSWORD)).isInstanceOf(AuthFailure.class);
    }
    @Test void concurrentRefreshRevokesFamilyOnReplay() throws Exception {
        register(); var session=auth.login(email,PASSWORD,"mobile",student);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<Boolean> call=() -> { try { auth.refresh(session.refreshToken(),"mobile"); return true; } catch(AuthFailure e) { return false; } };
            var results=pool.invokeAll(List.of(call,call));
            int success=0; for(var result:results) if(result.get()) success++;
            assertThat(success).isEqualTo(1);
            assertThat(get(session.token(),"/api/v1/auth/me")).isEqualTo(401);
        }
    }
    @Test void publicBrowseNeverReturnsDraftOrPrivateIdentity() {
        register(); UUID userId=db.queryForObject("select user_id from thanh_viens where email=?",UUID.class,email);
        UUID published=UUID.randomUUID(),draft=UUID.randomUUID();
        db.update("insert into tin_dangs(ma_tin,nguoi_dang_id,tieu_de,gia_vnd,trang_thai) values (?,?,?,0,'CONG_KHAI')",published,userId,"public item");
        db.update("insert into tin_dangs(ma_tin,nguoi_dang_id,tieu_de,gia_vnd,trang_thai) values (?,?,?,0,'NHAP')",draft,userId,"draft item");
        var response=given().get("/api/v1/listings");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body().asString()).contains(published.toString()).doesNotContain(draft.toString(),email,"studentId","mat_khau_hash");
    }
    @Test void missingExpiryAndExpiredSignedTokensAreRejected() throws Exception {
        register(); var session=auth.login(email,PASSWORD,"mobile",student);
        var original=com.nimbusds.jwt.SignedJWT.parse(session.token()).getJWTClaimsSet();
        for(var expiry:Arrays.asList(Date.from(Instant.now().minusSeconds(60)),null)) {
            var claims=new com.nimbusds.jwt.JWTClaimsSet.Builder(original).expirationTime(expiry).build();
            var signed=new com.nimbusds.jwt.SignedJWT(new com.nimbusds.jose.JWSHeader(com.nimbusds.jose.JWSAlgorithm.HS256),claims);
            signed.sign(new com.nimbusds.jose.crypto.MACSigner(Base64.getDecoder().decode("404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970")));
            assertThat(get(signed.serialize(),"/api/v1/auth/me")).isEqualTo(401);
        }
    }
}
