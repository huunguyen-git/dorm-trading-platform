package com.dormtrading.iam.profile;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import com.dormtrading.review.reputation.ReputationLedgerService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ProfileService {
    public static final int MAX_CARD_BYTES = 5 * 1024 * 1024;
    private final JdbcTemplate db;
    private final AuthService auth;
    private final PasswordEncoder encoder;
    private final OtpDelivery delivery;
    private final CardStorage cards;
    private final ReputationLedgerService reputationLedger;
    private final Clock clock;
    private final SecureRandom random;
    private final byte[] key;
    private final int otpSeconds, resendSeconds, otpAttempts;

    public ProfileService(JdbcTemplate db, AuthService auth, PasswordEncoder encoder, OtpDelivery delivery,
                          CardStorage cards, ReputationLedgerService reputationLedger,
                          Clock clock, SecureRandom random,
                          @Value("${app.jwt.secret}") String secret,
                          @Value("${app.auth.otp-seconds:300}") int otpSeconds,
                          @Value("${app.auth.resend-seconds:60}") int resendSeconds,
                          @Value("${app.auth.otp-attempts:5}") int otpAttempts) {
        this.db = db; this.auth = auth; this.encoder = encoder; this.delivery = delivery; this.cards = cards;
        this.reputationLedger = reputationLedger;
        this.clock = clock; this.random = random; this.key = Base64.getDecoder().decode(secret);
        this.otpSeconds = otpSeconds; this.resendSeconds = resendSeconds; this.otpAttempts = otpAttempts;
    }

    public record Profile(UUID id, String name, String studentId, String email, String phone, String school,
                          String campus, String major, String cohort, String studyStatus, int reputation,
                          boolean emailVerified, boolean profileApproved, String profileStatus, String rejectReason,
                          boolean pendingUpdate, boolean hasStudentCard, String accountStatus) {}

    public record Update(String name, String studentId, String phone, String school, String campus,
                         String major, String cohort) {}

    public record Pending(UUID id, String name, String studentId, String email, String kind,
                          Instant submittedAt, boolean hasStudentCard) {}

    public record Card(byte[] bytes, String mime) {}

    public record Challenge(UUID challengeId, int expiresIn, int resendAfter, String message) {}

    private java.sql.Timestamp at() { return java.sql.Timestamp.from(clock.instant()); }

    private Map<String, Object> row(Object userId) {
        var rows = db.queryForList("select * from thanh_viens where user_id=?", userId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private Map<String, Object> locked(UUID userId) {
        var rows = db.queryForList("select * from thanh_viens where user_id=? for update", userId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private Map<String, Object> pendingRow(UUID userId) {
        var rows = db.queryForList("select * from ho_so_cap_nhat where user_id=?", userId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private static String string(Map<String, Object> row, String column) {
        if (row == null) return null;
        Object value = row.get(column);
        return value == null ? null : value.toString();
    }

    private Profile view(Map<String, Object> row) {
        UUID id = (UUID) row.get("user_id");
        var pending = pendingRow(id);
        boolean approved = Boolean.TRUE.equals(row.get("profile_approved"));
        boolean pendingUpdate = Boolean.TRUE.equals(row.get("cho_duyet_lai")) || (!approved && pending != null);
        String reject = string(row, "ly_do_tu_choi");
        // Đã duyệt: lý do từ chối (nếu có) là của bản cập nhật, tài khoản vẫn DA_DUYET.
        String status = !approved ? (reject != null ? "BI_TU_CHOI" : "CHO_DUYET")
                : pendingUpdate ? "CHO_DUYET" : "DA_DUYET";
        return new Profile(id, pick(pending, row, "ho_ten"), pick(pending, row, "mssv"), string(row, "email"),
                string(row, "so_dien_thoai"), pick(pending, row, "truong"), pick(pending, row, "co_so"),
                pick(pending, row, "nganh_hoc"), pick(pending, row, "nien_khoa"), string(row, "trang_thai_sv"),
                ((Number) row.get("diem_uy_tin")).intValue(), Boolean.TRUE.equals(row.get("email_verified")),
                approved, status, reject, pendingUpdate,
                // Ảnh đang chờ duyệt cũng phải báo có ảnh, nếu không kiểm duyệt viên không biết cần xem gì.
                hasRow(db, "the_sinh_viens", id) || hasRow(db, "the_sinh_viens_cho_duyet", id),
                string(row, "trang_thai_tai_khoan"));
    }

    // Có hồ sơ chờ duyệt thì mọi trường định danh đọc theo hồ sơ đó, kể cả trường bị xoá (null).
    // Nếu lấy giá trị cũ của from thanh_viens thì trường vừa xoá vẫn hiện lại và kiểm duyệt viên duyệt nhầm dữ liệu.
    private static String pick(Map<String, Object> pending, Map<String, Object> row, String column) {
        return pending != null ? string(pending, column) : string(row, column);
    }

    private static boolean hasRow(JdbcTemplate db, String table, UUID userId) {
        return Boolean.TRUE.equals(db.queryForObject(
                "select exists(select 1 from " + table + " where user_id=?)", Boolean.class, userId));
    }

    public Profile me(Jwt jwt) { return view(row(auth.me(jwt).id())); }

    @Transactional
    public Profile update(Jwt jwt, Update body) {
        UUID userId = auth.me(jwt).id();
        var current = locked(userId);
        requireMutable(jwt, current);
        String name = text(body.name(), string(current, "ho_ten"), 150, "Họ tên không hợp lệ.");
        String studentId = text(body.studentId(), string(current, "mssv"), 20, "MSSV không hợp lệ.");
        String phone = optional(body.phone(), string(current, "so_dien_thoai"), 20);
        if (phone != null && !phone.matches("\\+?[0-9][0-9 -]{7,19}"))
            throw new AuthFailure(400, "INVALID_PHONE", "Số điện thoại không hợp lệ.");
        String school = optional(body.school(), string(current, "truong"), 150);
        String campus = optional(body.campus(), string(current, "co_so"), 150);
        String major = optional(body.major(), string(current, "nganh_hoc"), 150);
        String cohort = optional(body.cohort(), string(current, "nien_khoa"), 50);

        // UC-05: chỉ số điện thoại được lưu ngay; định danh/học tập phải chờ kiểm duyệt.
        boolean identity = !Objects.equals(name, string(current, "ho_ten"))
                || !Objects.equals(studentId, string(current, "mssv"))
                || !Objects.equals(school, string(current, "truong"))
                || !Objects.equals(campus, string(current, "co_so"))
                || !Objects.equals(major, string(current, "nganh_hoc"))
                || !Objects.equals(cohort, string(current, "nien_khoa"));

        if (!Objects.equals(phone, string(current, "so_dien_thoai")))
            db.update("update thanh_viens set so_dien_thoai=?,updated_at=?,version=version+1 where user_id=?",
                    phone, at(), userId);

        if (identity) {
            if (db.queryForObject("""
                    select exists(select 1 from thanh_viens where mssv=? and user_id<>?)
                        or exists(select 1 from ho_so_cap_nhat where mssv=? and user_id<>?)
                    """, Boolean.class, studentId, userId, studentId, userId))
                throw new AuthFailure(409, "STUDENT_ID_IN_USE", "MSSV đã gắn với tài khoản khác.");
            try {
                db.update("""
                        insert into ho_so_cap_nhat(user_id,ho_ten,mssv,truong,co_so,nganh_hoc,nien_khoa,gui_luc)
                        values (?,?,?,?,?,?,?,?)
                        on conflict (user_id) do update set ho_ten=excluded.ho_ten,mssv=excluded.mssv,
                            truong=excluded.truong,co_so=excluded.co_so,nganh_hoc=excluded.nganh_hoc,
                            nien_khoa=excluded.nien_khoa,gui_luc=excluded.gui_luc
                        """, ps -> {
                    ps.setObject(1, userId); ps.setString(2, name); ps.setString(3, studentId); ps.setString(4, school);
                    ps.setString(5, campus); ps.setString(6, major); ps.setString(7, cohort); ps.setTimestamp(8, at());
                });
            } catch (DataIntegrityViolationException e) {
                throw new AuthFailure(409, "STUDENT_ID_IN_USE", "MSSV đã có trong một hồ sơ chờ duyệt khác.");
            }
            db.update("update thanh_viens set cho_duyet_lai=true,ly_do_tu_choi=null,updated_at=?,version=version+1 where user_id=?",
                    at(), userId);
        }
        return view(row(userId));
    }

    @Transactional
    public void uploadCard(Jwt jwt, MultipartFile file) {
        UUID userId = auth.me(jwt).id();
        requireMutable(jwt, locked(userId));
        if (file == null || file.isEmpty())
            throw new AuthFailure(400, "INVALID_STUDENT_CARD", "Chọn ảnh thẻ sinh viên để tải lên.");
        if (file.getSize() > MAX_CARD_BYTES)
            throw new AuthFailure(400, "INVALID_STUDENT_CARD", "Ảnh thẻ tối đa 5MB.");
        byte[] bytes;
        try { bytes = file.getBytes(); }
        catch (java.io.IOException e) { throw new AuthFailure(400, "INVALID_STUDENT_CARD", "Không đọc được ảnh thẻ."); }
        String mime = sniff(bytes);
        if (mime == null) throw new AuthFailure(400, "INVALID_STUDENT_CARD", "Ảnh thẻ phải là JPEG hoặc PNG.");
        String objectKey = userId + "/" + UUID.randomUUID() + ("image/png".equals(mime) ? ".png" : ".jpg");
        // UC-02: ảnh mới chờ duyệt nằm ở bảng riêng, ảnh đang dùng trong the_sinh_viens không bị đụng tới.
        String previous = db.query("select object_key from the_sinh_viens_cho_duyet where user_id=? for update",
                rs -> rs.next() ? rs.getString(1) : null, userId);
        cards.put(objectKey, bytes, mime);
        // Object mới chỉ được xoá khi transaction rollback; object cũ chỉ xoá sau commit để không mất ảnh đang dùng.
        afterCompletion(() -> discard(objectKey));
        db.update("""
                insert into the_sinh_viens_cho_duyet(user_id,object_key,mime,kich_thuoc,uploaded_at) values (?,?,?,?,?)
                on conflict (user_id) do update set object_key=excluded.object_key,mime=excluded.mime,
                    kich_thuoc=excluded.kich_thuoc,uploaded_at=excluded.uploaded_at
                """, ps -> {
            ps.setObject(1, userId); ps.setString(2, objectKey); ps.setString(3, mime);
            ps.setInt(4, bytes.length); ps.setTimestamp(5, at());
        });
        if (previous != null && !previous.equals(objectKey))
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { discard(previous); }
            });
        db.update("update thanh_viens set cho_duyet_lai=true,ly_do_tu_choi=null,updated_at=?,version=version+1 where user_id=?",
                at(), userId);
    }

    /** Xoá object vừa ghi nếu transaction không commit; lỗi xoá chỉ gây rác, không làm hỏng request. */
    private void afterCompletion(Runnable onRollback) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) onRollback.run();
            }
        });
    }

    private void discard(String key) {
        try { cards.delete(key); } catch (RuntimeException ignored) { /* rác trong object storage, không chặn nghiệp vụ */ }
    }

    public Card card(Jwt jwt, UUID ownerId) {
        var user = auth.me(jwt);
        if (!user.id().equals(ownerId) && !user.roles().contains("MODERATOR"))
            throw new AuthFailure(403, "STUDENT_CARD_FORBIDDEN", "Không có quyền xem ảnh thẻ này.");
        // Kiểm duyệt viên phải xem được ảnh vừa tải lên đang chờ duyệt, nên ảnh chờ duyệt được ưu tiên.
        var rows = db.queryForList("select object_key,mime from the_sinh_viens_cho_duyet where user_id=?", ownerId);
        if (rows.isEmpty()) rows = db.queryForList("select object_key,mime from the_sinh_viens where user_id=?", ownerId);
        if (rows.isEmpty())
            throw new AuthFailure(404, "STUDENT_CARD_NOT_FOUND", "Hồ sơ chưa có ảnh thẻ sinh viên.");
        var row = rows.getFirst();
        // Object mất nhưng còn dòng DB: coi như chưa có ảnh thay vì trả 500 cho client.
        byte[] bytes = cards.get(row.get("object_key").toString())
                .orElseThrow(() -> new AuthFailure(404, "STUDENT_CARD_NOT_FOUND", "Hồ sơ chưa có ảnh thẻ sinh viên."));
        return new Card(bytes, row.get("mime").toString());
    }

    public List<Pending> pending(int offset, int limit) {
        return db.query("""
                select v.user_id,v.ho_ten,v.mssv,v.email,v.updated_at,
                       (exists(select 1 from the_sinh_viens t where t.user_id=v.user_id)
                           or exists(select 1 from the_sinh_viens_cho_duyet p where p.user_id=v.user_id)) as co_anh,
                       (v.profile_approved or v.diem_khoi_tao) as da_kich_hoat
                from thanh_viens v
                where v.email_verified and v.ly_do_tu_choi is null
                    and v.trang_thai_tai_khoan <> 'VO_HIEU_HOA'
                    and (not v.profile_approved or v.cho_duyet_lai)
                order by v.updated_at desc limit ? offset ?
                """, (rs, i) -> new Pending((UUID) rs.getObject("user_id"), rs.getString("ho_ten"), rs.getString("mssv"),
                rs.getString("email"), rs.getBoolean("da_kich_hoat") ? "CAP_NHAT" : "DANG_KY",
                rs.getTimestamp("updated_at").toInstant(), rs.getBoolean("co_anh")), limit, offset);
    }

    /** Chi tiết hồ sơ: kiểm duyệt viên vẫn xem được hồ sơ đã xử lý (không 409) để trang không bị kẹt. */
    public Profile detail(UUID userId) {
        var row = row(userId);
        if (row == null) throw new AuthFailure(404, "PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ.");
        return view(row);
    }

    @Transactional
    public void approve(Jwt jwt, UUID userId) {
        UUID moderator = auth.me(jwt).id();
        var current = locked(userId);
        pendingOrThrow(current);
        try {
            db.update("""
                    update thanh_viens v set ho_ten=p.ho_ten,mssv=p.mssv,truong=p.truong,co_so=p.co_so,
                        nganh_hoc=p.nganh_hoc,nien_khoa=p.nien_khoa
                    from ho_so_cap_nhat p where p.user_id=v.user_id and v.user_id=?
                    """, userId);
        } catch (DataIntegrityViolationException e) {
            throw new AuthFailure(409, "STUDENT_ID_IN_USE", "MSSV đã gắn với tài khoản khác.");
        }
        db.update("delete from ho_so_cap_nhat where user_id=?", userId);
        promoteCard(userId);
        boolean activated = !Boolean.TRUE.equals(current.get("diem_khoi_tao"));
        db.update("""
                update thanh_viens set profile_approved=true,cho_duyet_lai=false,ly_do_tu_choi=null,
                    trang_thai_tai_khoan=case when trang_thai_tai_khoan='CHO_KICH_HOAT' then 'HOAT_DONG'
                        else trang_thai_tai_khoan end,
                    updated_at=?,version=version+1
                where user_id=?
                """, at(), userId);
        // FR-03: điểm 100 khởi tạo đúng một lần, ghi qua sổ cái để có lịch sử; duyệt bản cập nhật giữ nguyên điểm.
        if (activated) {
            reputationLedger.initializeActivationScore(userId, moderator);
            db.update("update thanh_viens set diem_khoi_tao=true where user_id=?", userId);
        }
        db.update("insert into kiem_duyet_ho_so(user_id,nguoi_duyet_id,ket_qua) values (?,?,'CHAP_THUAN')",
                userId, moderator);
    }

    /** Ảnh thẻ chờ duyệt trở thành ảnh chính thức; object cũ bị xoá sau commit để không mất ảnh đang dùng. */
    private void promoteCard(UUID userId) {
        var rows = db.queryForList("select object_key,mime,kich_thuoc,uploaded_at from the_sinh_viens_cho_duyet where user_id=?", userId);
        if (rows.isEmpty()) return;
        var pending = rows.getFirst();
        String previous = db.query("select object_key from the_sinh_viens where user_id=? for update",
                rs -> rs.next() ? rs.getString(1) : null, userId);
        db.update("""
                insert into the_sinh_viens(user_id,object_key,mime,kich_thuoc,uploaded_at) values (?,?,?,?,?)
                on conflict (user_id) do update set object_key=excluded.object_key,mime=excluded.mime,
                    kich_thuoc=excluded.kich_thuoc,uploaded_at=excluded.uploaded_at
                """, ps -> {
            ps.setObject(1, userId); ps.setString(2, pending.get("object_key").toString());
            ps.setString(3, pending.get("mime").toString());
            ps.setInt(4, ((Number) pending.get("kich_thuoc")).intValue());
            ps.setTimestamp(5, (java.sql.Timestamp) pending.get("uploaded_at"));
        });
        db.update("delete from the_sinh_viens_cho_duyet where user_id=?", userId);
        if (previous != null && !previous.equals(pending.get("object_key").toString()))
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { discard(previous); }
            });
    }

    @Transactional
    public void reject(Jwt jwt, UUID userId, String reason) {
        UUID moderator = auth.me(jwt).id();
        String value = reason == null ? "" : reason.strip();
        if (value.length() < 3 || value.length() > 1000)
            throw new AuthFailure(400, "INVALID_REASON", "Nhập lý do từ chối từ 3 đến 1000 ký tự.");
        var row = locked(userId);
        pendingOrThrow(row);
        db.update("delete from ho_so_cap_nhat where user_id=?", userId);
        discardPendingCard(userId);
        // Tài khoản đã kích hoạt vẫn giữ quyền và dữ liệu cũ; lý do từ chối bản cập nhật vẫn được lưu.
        db.update("""
                update thanh_viens set cho_duyet_lai=false,ly_do_tu_choi=?,updated_at=?,version=version+1
                where user_id=?
                """, value, at(), userId);
        db.update("insert into kiem_duyet_ho_so(user_id,nguoi_duyet_id,ket_qua,ly_do) values (?,?,'TU_CHOI',?)",
                userId, moderator, value);
        // UC-02: kết quả từ chối được giữ kể cả khi gửi email thất bại (outbox retry).
        db.update("insert into ho_so_thong_bao(email,ly_do) values (?,?)", row.get("email"), value);
    }

    @Transactional
    public Challenge changeEmail(Jwt jwt, String currentPassword, String newEmail) {
        UUID userId = auth.me(jwt).id();
        String email = auth.email(newEmail);
        var current = row(userId);
        requireMutable(jwt, current);
        // Chống dò mật khẩu qua endpoint đổi email: cùng ngưỡng và bộ đếm với đổi mật khẩu (P1-01).
        String accountEmail = string(current, "email");
        long wait = auth.passwordWrongWait(accountEmail);
        if (wait > 0)
            throw new AuthFailure(429, "RATE_LIMITED", "Vui lòng chờ trước khi thử lại.", wait);
        if (!encoder.matches(password(currentPassword), current.get("mat_khau_hash").toString())) {
            auth.recordPasswordWrong(accountEmail);
            throw new AuthFailure(401, "INVALID_CREDENTIALS", "Mật khẩu hiện tại không đúng.");
        }
        if (email.equals(string(current, "email")))
            throw new AuthFailure(400, "EMAIL_UNCHANGED", "Email mới phải khác email hiện tại.");
        if (db.queryForObject("select exists(select 1 from thanh_viens where lower(email)=?)", Boolean.class, email))
            throw new AuthFailure(409, "EMAIL_IN_USE", "Email đã gắn với tài khoản khác.");
        var recent = db.queryForList("""
                select 1 from auth_challenge where purpose='CHANGE_EMAIL' and user_id=?
                    and created_at > current_timestamp - (? * interval '1 second') limit 1
                """, userId, resendSeconds);
        if (!recent.isEmpty())
            throw new AuthFailure(429, "RATE_LIMITED", "Vui lòng chờ trước khi yêu cầu mã mới.", (long) resendSeconds);

        UUID id = UUID.randomUUID();
        String code = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        db.update("update auth_challenge set used=true where purpose='CHANGE_EMAIL' and user_id=? and not used", userId);
        db.update("""
                insert into auth_challenge(id,email,purpose,secret_hash,expires_at,created_at,user_id)
                values (?,?,?,?,?,?,?)
                """, id, email, "CHANGE_EMAIL", digest(id + ":" + code),
                java.sql.Timestamp.from(clock.instant().plusSeconds(otpSeconds)), at(), userId);
        delivery.enqueue(id, "Mã xác minh email mới: " + code + "\nMã có hiệu lực " + otpSeconds / 60
                + " phút. Không chia sẻ mã này.");
        return new Challenge(id, otpSeconds, resendSeconds, "Đã gửi mã xác minh tới email mới.");
    }

    @Transactional(noRollbackFor = AuthFailure.class)
    public void verifyEmailChange(Jwt jwt, UUID challengeId, String code) {
        UUID userId = auth.me(jwt).id();
        requireMutable(jwt, row(userId));
        var rows = db.queryForList("""
                select * from auth_challenge where id=? and purpose='CHANGE_EMAIL' and user_id=? for update
                """, challengeId, userId);
        var challenge = rows.isEmpty() ? null : rows.getFirst();
        boolean valid = challenge != null && !Boolean.TRUE.equals(challenge.get("used"))
                && ((java.sql.Timestamp) challenge.get("expires_at")).toInstant().isAfter(clock.instant())
                && ((Number) challenge.get("attempts")).intValue() < otpAttempts
                && code != null && code.matches("[0-9]{6}")
                && MessageDigest.isEqual(digest(challengeId + ":" + code).getBytes(StandardCharsets.US_ASCII),
                challenge.get("secret_hash").toString().getBytes(StandardCharsets.US_ASCII));
        if (!valid) {
            if (challenge != null)
                db.update("update auth_challenge set attempts=attempts+1,used=used or attempts+1>=? where id=?",
                        otpAttempts, challengeId);
            throw new AuthFailure(400, "INVALID_OTP", "Mã không hợp lệ, đã dùng hoặc hết hạn.");
        }
        String email = challenge.get("email").toString();
        // UC-06: khóa theo email tại thời điểm lưu để hai tài khoản không cùng nhận một email.
        db.query("select pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> { }, email);
        if (db.queryForObject("select exists(select 1 from thanh_viens where lower(email)=? and user_id<>?)",
                Boolean.class, email, userId))
            throw new AuthFailure(409, "EMAIL_IN_USE", "Email đã gắn với tài khoản khác.");
        db.update("update auth_challenge set used=true where id=?", challengeId);
        try {
            db.update("update thanh_viens set email=?,email_verified=true,updated_at=?,version=version+1 where user_id=?",
                    email, at(), userId);
        } catch (DataIntegrityViolationException e) {
            throw new AuthFailure(409, "EMAIL_IN_USE", "Email đã gắn với tài khoản khác.");
        }
    }

    private String password(String value) {
        if (value == null || value.length() > 512)
            throw new AuthFailure(401, "INVALID_CREDENTIALS", "Mật khẩu hiện tại không đúng.");
        return Normalizer.normalize(value, Normalizer.Form.NFC);
    }

    /** Bỏ ảnh chờ duyệt: xoá object sau commit để ảnh đang dùng không bị mất. */
    private void discardPendingCard(UUID userId) {
        String key = db.query("select object_key from the_sinh_viens_cho_duyet where user_id=? for update",
                rs -> rs.next() ? rs.getString(1) : null, userId);
        if (key == null) return;
        db.update("delete from the_sinh_viens_cho_duyet where user_id=?", userId);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { discard(key); }
        });
    }

    private void pendingOrThrow(Map<String, Object> row) {
        if (row == null) throw new AuthFailure(404, "PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ.");
        // Tài khoản đã vô hiệu hoá không còn trong hàng đợi nên cũng không quyết định được.
        if ("VO_HIEU_HOA".equals(row.get("trang_thai_tai_khoan")))
            throw new AuthFailure(409, "ACCOUNT_DELETED", "Tài khoản đã bị vô hiệu hoá.");
        if (!Boolean.TRUE.equals(row.get("email_verified")))
            throw new AuthFailure(409, "EMAIL_NOT_VERIFIED", "Hồ sơ chưa xác minh email.");
        // Hồ sơ đã quyết định (duyệt xong, hoặc bị từ chối mà chưa gửi lại) không được quyết định lần nữa.
        boolean handled = !Boolean.TRUE.equals(row.get("cho_duyet_lai"))
                && (Boolean.TRUE.equals(row.get("profile_approved")) || row.get("ly_do_tu_choi") != null);
        if (handled)
            throw new AuthFailure(409, "PROFILE_ALREADY_HANDLED", "Hồ sơ đã được xử lý. Tải lại danh sách.");
    }

    /** Bổ sung phạm vi P1-05: tài khoản bị khóa không được sửa hồ sơ hay đổi email. */
    private void requireMutable(Jwt jwt, Map<String, Object> row) {
        if (row == null) throw new AuthFailure(404, "PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ.");
        auth.findActiveRestriction(jwt).ifPresent(failure -> { throw failure; });
    }

    private String text(String value, String current, int max, String message) {
        if (value == null) return current;
        String result = value.strip();
        if (result.isEmpty() || result.length() > max) throw new AuthFailure(400, "INVALID_INPUT", message);
        return result;
    }

    private String optional(String value, String current, int max) {
        if (value == null) return current;
        String result = value.strip();
        if (result.isEmpty()) return null;
        if (result.length() > max) throw new AuthFailure(400, "INVALID_INPUT", "Thông tin không hợp lệ.");
        return result;
    }

    private static String sniff(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF)
            return "image/jpeg";
        if (bytes.length >= 8 && (bytes[0] & 0xFF) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G')
            return "image/png";
        return null;
    }

    private String digest(String value) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
