package com.dormtrading.iam.auth;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor = AuthFailure.class)
public class AuthService {
    private final JdbcTemplate db;
    private final PasswordEncoder encoder;
    private final PasswordPolicy policy;
    private final OtpDelivery delivery;
    private final Clock clock;
    private final SecureRandom random;
    private final byte[] key;
    private final String dummyHash;
    private final int otpSeconds, resendSeconds, otpAttempts, hourlySends, dailySends, hourlyWrong, ipHourly;

    public AuthService(JdbcTemplate db, PasswordEncoder encoder, PasswordPolicy policy, OtpDelivery delivery,
                       Clock clock, SecureRandom random, @Value("${app.jwt.secret}") String secret,
                       @Value("${app.auth.otp-seconds:300}") int otpSeconds,
                       @Value("${app.auth.resend-seconds:60}") int resendSeconds,
                       @Value("${app.auth.otp-attempts:5}") int otpAttempts,
                       @Value("${app.auth.hourly-sends:5}") int hourlySends,
                       @Value("${app.auth.daily-sends:10}") int dailySends,
                       @Value("${app.auth.hourly-wrong:10}") int hourlyWrong,
                       @Value("${app.auth.ip-hourly:100}") int ipHourly) {
        this.db = db; this.encoder = encoder; this.policy = policy; this.delivery = delivery;
        this.clock = clock; this.random = random; this.key = Base64.getDecoder().decode(secret);
        this.otpSeconds = otpSeconds; this.resendSeconds = resendSeconds; this.otpAttempts = otpAttempts;
        this.hourlySends = hourlySends; this.dailySends = dailySends; this.hourlyWrong = hourlyWrong; this.ipHourly = ipHourly;
        this.dummyHash = encoder.encode("dummy credential that never authenticates");
    }
    public record User(UUID id, String name, String email, String studentId, String role, List<String> roles,
                       boolean emailVerified, boolean profileApproved, String accountStatus) {}
    public record Session(String token, String refreshToken, User user) {}
    public record Challenge(UUID challengeId, int expiresIn, int resendAfter, String message) {}
    public record Verified(String resetToken, boolean emailVerified) {}

    private Instant now() { return clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MILLIS); }
    private Timestamp at(Instant time) { return Timestamp.from(time); }
    private void lock(String subject) {
        db.query("select pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> { }, subject);
    }
    private Map<String,Object> one(String sql, Object... args) {
        var rows = db.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.getFirst();
    }
    private Instant instant(Map<String,Object> row, String field) { return ((Timestamp) row.get(field)).toInstant(); }
    public String email(String input) {
        if (input == null) throw invalid();
        String value = input.strip().toLowerCase(Locale.ROOT);
        if (value.length() > 255 || !value.matches("[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.edu\\.vn"))
            throw new AuthFailure(400, "INVALID_EMAIL", "Sử dụng email sinh viên thuộc miền .edu.vn.");
        return value;
    }
    private String required(String value, int max) {
        if (value == null || value.isBlank() || value.length() > max) throw invalid();
        return value.strip();
    }
    private AuthFailure invalid() { return new AuthFailure(400, "INVALID_INPUT", "Thông tin không hợp lệ."); }
    private AuthFailure denied() { return new AuthFailure(401, "INVALID_CREDENTIALS", "Thông tin xác thực không hợp lệ hoặc đã hết hạn."); }
    private AuthFailure limited() { return new AuthFailure(429, "RATE_LIMITED", "Đã vượt giới hạn. Vui lòng chờ và thử lại."); }
    private Map<String,Object> account(String email) { return one("select * from thanh_viens where lower(email)=?", email); }
    private void event(String subject, String kind) { db.update("insert into auth_event(subject,kind,happened_at) values (?,?,?)", subject, kind, at(now())); }
    private int count(String subject, String kind, long seconds) {
        return db.queryForObject("select count(*) from auth_event where subject=? and kind=? and happened_at>?", Integer.class,
                subject, kind, at(now().minusSeconds(seconds)));
    }
    private void ipLimit(String ip) {
        String subject = "ip:" + ip;
        lock(subject);
        if (count(subject, "REQUEST", 3600) >= ipHourly) throw limited();
        event(subject, "REQUEST");
    }
    public Challenge register(String name, String studentId, String address, String password, String ip) {
        String email = email(address);
        name = required(name, 150); studentId = required(studentId, 20);
        ipLimit(ip); lock(email); lock("student:" + studentId);
        if (account(email) != null || one("select user_id from thanh_viens where mssv=?", studentId) != null)
            throw new AuthFailure(409, "ACCOUNT_CONFLICT", "Không thể đăng ký bằng thông tin này. Hãy đăng nhập hoặc khôi phục tài khoản.");
        checkSendLimits(email);
        String hash = encoder.encode(policy.validate(password, email, studentId));
        db.update("insert into thanh_viens(user_id,email,mat_khau_hash,ho_ten,mssv,diem_uy_tin) values (?,?,?,?,?,0)",
                UUID.randomUUID(), email, hash, name, studentId);
        return issue(email, "REGISTER");
    }
    public Challenge requestOtp(String address, String purpose, String ip) {
        String email = email(address); purpose(purpose);
        ipLimit(ip); lock(email);
        return issue(email, purpose);
    }
    private void purpose(String value) {
        if (!Set.of("REGISTER", "RESET").contains(value == null ? "" : value)) throw invalid();
    }
    private Challenge issue(String email, String purpose) {
        checkSendLimits(email);
        event(email,"SEND");
        UUID id = UUID.randomUUID();
        var user = account(email);
        // Same response and limits for unknown/already verified addresses.
        if (user != null && (purpose.equals("RESET") || !Boolean.TRUE.equals(user.get("email_verified")))) {
            String code = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
            db.update("update auth_challenge set used=true where email=? and purpose=? and not used",email,purpose);
            db.update("insert into auth_challenge(id,email,purpose,secret_hash,expires_at,created_at) values (?,?,?,?,?,?)",
                    id,email,purpose,digest(id + ":" + code),at(now().plusSeconds(otpSeconds)),at(now()));
            delivery.enqueue(id,"Mã xác minh: " + code + "\nMã có hiệu lực " + otpSeconds / 60 + " phút từ lúc yêu cầu. Không chia sẻ mã này.");
        }
        return new Challenge(id, otpSeconds, resendSeconds, "Nếu email có tài khoản phù hợp, chúng tôi sẽ gửi mã xác minh.");
    }
    private void checkSendLimits(String email) {
        if (count(email,"SEND",resendSeconds) > 0 || count(email,"SEND",3600) >= hourlySends || count(email,"SEND",86400) >= dailySends)
            throw limited();
    }
    public Verified verify(UUID id, String address, String purpose, String code, String ip) {
        String email = email(address); purpose(purpose);
        ipLimit(ip); lock(email);
        if (count(email,"WRONG",3600) >= hourlyWrong) throw limited();
        var challenge = one("select * from auth_challenge where id=? and email=? and purpose=?",id,email,purpose);
        boolean valid = challenge != null && !Boolean.TRUE.equals(challenge.get("used")) &&
                instant(challenge,"expires_at").isAfter(now()) && ((Number)challenge.get("attempts")).intValue() < otpAttempts &&
                code != null && code.matches("[0-9]{6}") && MessageDigest.isEqual(
                        digest(id + ":" + code).getBytes(StandardCharsets.US_ASCII),
                        challenge.get("secret_hash").toString().getBytes(StandardCharsets.US_ASCII));
        if (!valid) {
            event(email,"WRONG");
            if (challenge != null) db.update("update auth_challenge set attempts=attempts+1,used=used or attempts+1>=? where id=?",otpAttempts,id);
            throw new AuthFailure(400,"INVALID_OTP","Mã không hợp lệ, đã dùng hoặc hết hạn.");
        }
        db.update("update auth_challenge set used=true where id=?",id);
        var user = account(email);
        if (purpose.equals("REGISTER")) {
            db.update("update thanh_viens set email_verified=true,updated_at=? where user_id=?",at(now()),user.get("user_id"));
            return new Verified(null,true);
        }
        String grant = randomToken();
        db.update("update auth_reset_grant set used=true where user_id=?",user.get("user_id"));
        db.update("insert into auth_reset_grant(secret_hash,user_id,expires_at) values (?,?,?)",digest(grant),user.get("user_id"),at(now().plusSeconds(300)));
        return new Verified(grant,Boolean.TRUE.equals(user.get("email_verified")));
    }
    public Session login(String address, String password, String client, String ip) {
        String email = email(address); checkClient(client);
        ipLimit(ip); lock(email);
        db.update("insert into auth_login_guard(email) values (?) on conflict do nothing",email);
        var guard = one("select * from auth_login_guard where email=?",email);
        if (guard.get("blocked_until") != null && instant(guard,"blocked_until").isAfter(now())) throw limited();
        var row = account(email);
        String normalized = policy.normalize(password);
        boolean matches = encoder.matches(normalized, row == null ? dummyHash : row.get("mat_khau_hash").toString());
        if (row == null || !matches) {
            int failures = ((Number)guard.get("failures")).intValue() + 1;
            long delay = failures < 5 ? 0 : Math.min(900, 30L << Math.min(5,failures - 5));
            db.update("update auth_login_guard set failures=?,blocked_until=? where email=?",failures,delay == 0 ? null : at(now().plusSeconds(delay)),email);
            throw denied();
        }
        db.update("update auth_login_guard set failures=0,blocked_until=null where email=?",email);
        User user = user(row,client);
        if (client.equals("admin-web") && !user.roles().contains("MODERATOR") && !user.roles().contains("SENIOR_ADMIN"))
            throw new AuthFailure(403,"ADMIN_REQUIRED","Tài khoản không có quyền quản trị.");
        if (Set.of("BI_KHOA","VO_HIEU_HOA").contains(user.accountStatus()))
            throw new AuthFailure(403,"ACCOUNT_RESTRICTED","Tài khoản đang bị hạn chế.");
        UUID sid = UUID.randomUUID();
        db.update("insert into auth_session(id,user_id,client,expires_at) values (?,?,?,?)",sid,user.id(),client,at(now().plusSeconds(30L*86400)));
        return tokens(sid,0,user,client);
    }
    private void checkClient(String client) {
        if (!Set.of("mobile","admin-web").contains(client == null ? "" : client)) throw invalid();
    }
    private User user(Map<String,Object> row, String client) {
        List<String> roles = new ArrayList<>();
        boolean active = Boolean.TRUE.equals(row.get("email_verified")) && Boolean.TRUE.equals(row.get("profile_approved")) && "HOAT_DONG".equals(row.get("trang_thai_tai_khoan"));
        if (active) {
            roles.add("MEMBER");
            if (client.equals("admin-web")) {
                var assigned = db.queryForList("select loai_vai_tro from vai_tro_quan_tri where user_id=? and trang_thai_hieu_luc and bat_dau<=? and (ket_thuc is null or ket_thuc>?)",String.class,row.get("user_id"),at(now()),at(now()));
                if (assigned.contains("KIEM_DUYET_VIEN")) roles.add("MODERATOR");
                if (assigned.contains("QUAN_TRI_VIEN_CAP_CAO")) { roles.add("SENIOR_ADMIN"); if (!roles.contains("MODERATOR")) roles.add("MODERATOR"); }
            }
        }
        String role = roles.contains("SENIOR_ADMIN") ? "admin" : roles.contains("MODERATOR") ? "moderator" : "member";
        return new User((UUID)row.get("user_id"),row.get("ho_ten").toString(),row.get("email").toString(),row.get("mssv").toString(),role,roles,
                Boolean.TRUE.equals(row.get("email_verified")),Boolean.TRUE.equals(row.get("profile_approved")),row.get("trang_thai_tai_khoan").toString());
    }
    private Session tokens(UUID sid, int generation, User user, String client) {
        String refresh = randomToken();
        db.update("insert into auth_refresh(secret_hash,session_id) values (?,?)",digest(refresh),sid);
        try {
            var claims = new JWTClaimsSet.Builder().subject(user.id().toString()).issuer("dorm-trading")
                    .issueTime(Date.from(now())).expirationTime(Date.from(now().plusSeconds(900))).jwtID(UUID.randomUUID().toString())
                    .claim("sid",sid.toString()).claim("generation",generation).claim("roles",user.roles()).claim("client",client).build();
            var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256),claims); jwt.sign(new MACSigner(key));
            return new Session(jwt.serialize(),refresh,user);
        } catch (JOSEException e) { throw new IllegalStateException("Cannot sign session",e); }
    }
    public Session refresh(String token, String client) {
        checkClient(client);
        if (token == null || token.length() > 256) throw denied();
        var found = one("select s.*,r.used from auth_refresh r join auth_session s on s.id=r.session_id where r.secret_hash=?",digest(token));
        if (found == null) throw denied();
        var row = one("select * from thanh_viens where user_id=?",found.get("user_id"));
        lock(row.get("email").toString());
        found = one("select s.*,r.used from auth_refresh r join auth_session s on s.id=r.session_id where r.secret_hash=?",digest(token));
        if (!client.equals(found.get("client")) || Boolean.TRUE.equals(found.get("revoked")) || !instant(found,"expires_at").isAfter(now())) throw denied();
        if (Boolean.TRUE.equals(found.get("used"))) {
            db.update("update auth_session set revoked=true where id=?",found.get("id")); throw denied();
        }
        row = account(row.get("email").toString());
        if (Set.of("BI_KHOA","VO_HIEU_HOA").contains(row.get("trang_thai_tai_khoan").toString())) throw denied();
        User user = user(row,client);
        if (client.equals("admin-web") && !user.roles().contains("MODERATOR")) throw denied();
        db.update("update auth_refresh set used=true where secret_hash=?",digest(token));
        return tokens((UUID)found.get("id"),((Number)found.get("generation")).intValue(),user,client);
    }
    public User me(Jwt jwt) { return user(requireSession(jwt),jwt.getClaimAsString("client")); }
    private Map<String,Object> requireSession(Jwt jwt) {
        try {
            var session = one("select * from auth_session where id=? and user_id=?",UUID.fromString(jwt.getClaimAsString("sid")),UUID.fromString(jwt.getSubject()));
            if (session == null || Boolean.TRUE.equals(session.get("revoked")) || !instant(session,"expires_at").isAfter(now()) ||
                    !session.get("client").equals(jwt.getClaimAsString("client")) ||
                    ((Number)session.get("generation")).intValue() != ((Number)jwt.getClaims().get("generation")).intValue()) throw denied();
            var row = one("select * from thanh_viens where user_id=?",session.get("user_id"));
            if (Set.of("BI_KHOA","VO_HIEU_HOA").contains(row.get("trang_thai_tai_khoan").toString())) throw denied();
            return row;
        } catch (IllegalArgumentException | NullPointerException e) { throw denied(); }
    }
    public void logout(Jwt jwt) {
        var row = requireSession(jwt); lock(row.get("email").toString());
        db.update("update auth_session set revoked=true where id=?",UUID.fromString(jwt.getClaimAsString("sid")));
    }
    public Session changePassword(Jwt jwt, String current, String password) {
        var initial = requireSession(jwt); lock(initial.get("email").toString());
        var row = requireSession(jwt);
        String email = row.get("email").toString();
        if (count(email,"PASSWORD_WRONG",3600) >= 5) throw limited();
        if (!encoder.matches(policy.normalize(current),row.get("mat_khau_hash").toString())) { event(email,"PASSWORD_WRONG"); throw denied(); }
        String value = policy.validate(password,email,row.get("mssv").toString());
        if (encoder.matches(value,row.get("mat_khau_hash").toString())) throw new AuthFailure(400,"PASSWORD_REUSED","Mật khẩu mới phải khác mật khẩu hiện tại.");
        UUID sid = UUID.fromString(jwt.getClaimAsString("sid"));
        db.update("update thanh_viens set mat_khau_hash=?,updated_at=? where user_id=?",encoder.encode(value),at(now()),row.get("user_id"));
        db.update("update auth_session set revoked=true where user_id=? and id<>?",row.get("user_id"),sid);
        db.update("update auth_refresh set used=true where session_id=?",sid);
        db.update("update auth_session set generation=generation+1 where id=?",sid);
        invalidateRecovery(row.get("user_id"),email);
        int generation = db.queryForObject("select generation from auth_session where id=?",Integer.class,sid);
        return tokens(sid,generation,user(row,jwt.getClaimAsString("client")),jwt.getClaimAsString("client"));
    }
    public void reset(String grant, String password) {
        if (grant == null || grant.length() > 256) throw denied();
        var found = one("select g.*,u.email from auth_reset_grant g join thanh_viens u on u.user_id=g.user_id where secret_hash=?",digest(grant));
        if (found == null) throw denied();
        String email = found.get("email").toString(); lock(email);
        found = one("select * from auth_reset_grant where secret_hash=?",digest(grant));
        if (Boolean.TRUE.equals(found.get("used")) || !instant(found,"expires_at").isAfter(now())) throw denied();
        var row = account(email);
        String value = policy.validate(password,email,row.get("mssv").toString());
        if (encoder.matches(value,row.get("mat_khau_hash").toString())) throw new AuthFailure(400,"PASSWORD_REUSED","Mật khẩu mới phải khác mật khẩu hiện tại.");
        db.update("update thanh_viens set mat_khau_hash=?,updated_at=? where user_id=?",encoder.encode(value),at(now()),row.get("user_id"));
        db.update("update auth_session set revoked=true where user_id=?",row.get("user_id"));
        db.update("delete from auth_login_guard where email=?",email);
        invalidateRecovery(row.get("user_id"),email);
    }
    private void invalidateRecovery(Object userId,String email) {
        db.update("update auth_reset_grant set used=true where user_id=?",userId);
        db.update("update auth_challenge set used=true where email=? and purpose='RESET'",email);
        db.update("insert into auth_notice(email) values (?)",email);
    }
    public User updateProfile(Jwt jwt, String name) {
        var initial = requireSession(jwt); lock(initial.get("email").toString());
        var row = requireSession(jwt);
        db.update("update thanh_viens set ho_ten=?,updated_at=? where user_id=?",required(name,150),at(now()),row.get("user_id"));
        return user(account(row.get("email").toString()),jwt.getClaimAsString("client"));
    }
    private String randomToken() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    private String digest(String value) {
        try {
            var mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(key,"HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
}
