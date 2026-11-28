package com.dormtrading.gov;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class GovernanceService {
    private static final String EFFECTIVE = "r.trang_thai_hieu_luc and r.bat_dau<=? and (r.ket_thuc is null or r.ket_thuc>?)";
    private static final String MODERATOR_COLUMNS = "r.id assignment_id,u.user_id,u.ho_ten,u.mssv,u.email,u.trang_thai_tai_khoan,r.bat_dau";
    private static final String USER_SEARCH = "position(? in lower(u.ho_ten || ' ' || u.mssv || ' ' || u.email))>0";
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final Clock clock;

    public GovernanceService(JdbcTemplate db, ObjectMapper json, Clock clock) {
        this.db = db;
        this.json = json;
        this.clock = clock;
    }

    public record Page<T>(List<T> items, int page, int size, long total) {}
    public record Moderator(UUID assignmentId, UUID userId, String name, String studentId, String email,
                            String accountStatus, Instant appointedAt) {}
    public record Candidate(UUID userId, String name, String studentId, String email, String accountStatus,
                            boolean isModerator, boolean emailVerified, boolean profileApproved) {}
    public record Penalty(String id, String name, int points, String description, String status, long version) {}
    public record Audit(UUID id, UUID actorId, String actorName, String action, String resourceType,
                        String resourceId, JsonNode before, JsonNode after, Instant happenedAt) {}
    private record Actor(UUID id, String name) {}
    private record PenaltyValues(String name, int points, String description) {}

    @Transactional(readOnly = true)
    public Page<Moderator> moderators(String q, int page, int size) {
        var time = timestamp();
        String from = "from vai_tro_quan_tri r join thanh_viens u on u.user_id=r.user_id "
                + "where r.loai_vai_tro='KIEM_DUYET_VIEN' and " + EFFECTIVE + " and " + USER_SEARCH;
        return page("select " + MODERATOR_COLUMNS, from, "r.bat_dau desc,r.id", List.of(time, time, search(q)),
                GovernanceService::moderator, page, size);
    }

    @Transactional(readOnly = true)
    public Page<Candidate> candidates(String q, int page, int size) {
        var time = timestamp();
        String from = "from thanh_viens u where not exists (select 1 from vai_tro_quan_tri r where r.user_id=u.user_id "
                + "and r.loai_vai_tro='QUAN_TRI_VIEN_CAP_CAO' and " + EFFECTIVE + ") and " + USER_SEARCH;
        // The moderator flag uses the same instant and active-role definition as authorization.
        String select = "select u.*,exists(select 1 from vai_tro_quan_tri r where r.user_id=u.user_id "
                + "and r.loai_vai_tro='KIEM_DUYET_VIEN' and r.trang_thai_hieu_luc and r.bat_dau<=? "
                + "and (r.ket_thuc is null or r.ket_thuc>?)) is_moderator ";
        bounds(page, size);
        var filter = List.of(time, time, search(q));
        long total = db.queryForObject("select count(*) " + from, Long.class, filter.toArray());
        var args = new ArrayList<Object>(List.of(time, time));
        args.addAll(filter);
        args.add(size);
        args.add((long) page * size);
        var items = db.query(select + from + " order by lower(u.ho_ten),u.user_id limit ? offset ?", (rs, n) ->
                new Candidate(rs.getObject("user_id", UUID.class), rs.getString("ho_ten"), rs.getString("mssv"),
                        rs.getString("email"), rs.getString("trang_thai_tai_khoan"), rs.getBoolean("is_moderator"),
                        rs.getBoolean("email_verified"), rs.getBoolean("profile_approved")), args.toArray());
        return new Page<>(items, page, size, total);
    }

    public Moderator appoint(Jwt jwt, UUID userId) {
        if (userId == null) throw invalid("Vui lòng chọn tài khoản cần bổ nhiệm.");
        lockAccounts(jwt, userId);
        Actor actor = requireSenior(jwt);
        var target = account(userId);
        if (target == null) throw missing("Không tìm thấy tài khoản.");
        var roles = effectiveRoles(userId, "for update");
        if (roles.stream().anyMatch(r -> "QUAN_TRI_VIEN_CAP_CAO".equals(r.get("loai_vai_tro"))))
            throw conflict("SENIOR_TARGET", "Không thể bổ nhiệm tài khoản quản trị viên cấp cao.");
        if (roles.stream().anyMatch(r -> "KIEM_DUYET_VIEN".equals(r.get("loai_vai_tro"))))
            throw conflict("ALREADY_MODERATOR", "Tài khoản đã là kiểm duyệt viên.");
        if (!eligible(target)) throw conflict("INELIGIBLE_ACCOUNT", "Tài khoản phải đang hoạt động, đã xác minh email và được duyệt hồ sơ.");
        UUID assignmentId = UUID.randomUUID();
        var time = timestamp();
        db.update("insert into vai_tro_quan_tri(id,user_id,loai_vai_tro,bat_dau,created_at) values (?,?,'KIEM_DUYET_VIEN',?,?)",
                assignmentId, userId, time, time);
        Moderator result = moderatorByAssignment(assignmentId);
        audit(actor, "APPOINT_MODERATOR", "MODERATOR", userId.toString(), null, result);
        return result;
    }

    public void revoke(Jwt jwt, UUID userId, UUID assignmentId) {
        if (assignmentId == null) throw invalid("Thiếu mã lượt bổ nhiệm.");
        lockAccounts(jwt, userId);
        Actor actor = requireSenior(jwt);
        if (account(userId) == null) throw missing("Không tìm thấy tài khoản.");
        var roles = effectiveRoles(userId, "for update");
        if (roles.stream().anyMatch(r -> "QUAN_TRI_VIEN_CAP_CAO".equals(r.get("loai_vai_tro"))))
            throw conflict("SENIOR_TARGET", "Không thể thay đổi vai trò của quản trị viên cấp cao tại đây.");
        var assignment = roles.stream().filter(r -> "KIEM_DUYET_VIEN".equals(r.get("loai_vai_tro"))
                && assignmentId.equals(r.get("id"))).findFirst();
        if (assignment.isEmpty()) throw conflict("STALE_ASSIGNMENT", "Lượt bổ nhiệm đã thay đổi hoặc đã bị thu hồi. Vui lòng tải lại.");
        Moderator before = moderatorByAssignment(assignmentId);
        var time = timestamp();
        // Revoke all effective moderator rows if legacy data contained duplicates.
        // The supplied ID must still identify the currently effective appointment above.
        for (var role : roles) {
            if ("KIEM_DUYET_VIEN".equals(role.get("loai_vai_tro")))
                db.update("update vai_tro_quan_tri set trang_thai_hieu_luc=false,ket_thuc=? where id=?", time, role.get("id"));
        }
        db.update("update bao_caos set trang_thai='CHO_XU_LY',nguoi_xu_ly_id=null where nguoi_xu_ly_id=? and trang_thai='DANG_XU_LY'", userId);
        db.update("update nhom_bao_caos set trang_thai='CHO_XU_LY',nguoi_xu_ly_id=null,version=version+1 where nguoi_xu_ly_id=? and trang_thai='DANG_XU_LY'", userId);
        audit(actor, "REVOKE_MODERATOR", "MODERATOR", userId.toString(), before, null);
    }

    @Transactional(readOnly = true)
    public Page<Penalty> penalties(String q, String status, int page, int size) {
        if (status != null && !Set.of("DANG_DUNG", "NGUNG_SU_DUNG").contains(status))
            throw invalid("Trạng thái mức phạt không hợp lệ.");
        String from = "from thang_phats where position(? in lower(ten || ' ' || mo_ta))>0";
        var args = new ArrayList<Object>(List.of(search(q)));
        if (status != null) { from += " and trang_thai=?"; args.add(status); }
        return page("select *", from, "lower(ten),ma_thang_phat", args, GovernanceService::penalty, page, size);
    }

    public Penalty createPenalty(Jwt jwt, GovernanceController.PenaltyInput input) {
        Actor actor = lockSenior(jwt);
        PenaltyValues values = values(input);
        String id = "TP_" + UUID.randomUUID();
        db.update("insert into thang_phats(ma_thang_phat,ten,diem_tru,mo_ta) values (?,?,?,?)",
                id, values.name(), values.points(), values.description());
        Penalty after = penaltyById(id, false);
        audit(actor, "CREATE_PENALTY", "PENALTY", id, null, after);
        return after;
    }

    public Penalty updatePenalty(Jwt jwt, String id, GovernanceController.PenaltyInput input) {
        Actor actor = lockSenior(jwt);
        PenaltyValues values = values(input);
        long version = version(input.version());
        Penalty before = penaltyById(id, true);
        checkVersion(before, version);
        if (!"DANG_DUNG".equals(before.status())) throw conflict("PENALTY_INACTIVE", "Mức phạt đã ngừng sử dụng.");
        db.update("update thang_phats set ten=?,diem_tru=?,mo_ta=?,version=version+1 where ma_thang_phat=?",
                values.name(), values.points(), values.description(), id);
        Penalty after = penaltyById(id, false);
        audit(actor, "UPDATE_PENALTY", "PENALTY", id, before, after);
        return after;
    }

    public Penalty deactivate(Jwt jwt, String id, JsonNode requestedVersion) {
        Actor actor = lockSenior(jwt);
        long version = version(requestedVersion);
        Penalty before = penaltyById(id, true);
        checkVersion(before, version);
        if (!"DANG_DUNG".equals(before.status())) throw conflict("PENALTY_INACTIVE", "Mức phạt đã ngừng sử dụng.");
        db.update("update thang_phats set trang_thai='NGUNG_SU_DUNG',version=version+1 where ma_thang_phat=?", id);
        Penalty after = penaltyById(id, false);
        audit(actor, "DEACTIVATE_PENALTY", "PENALTY", id, before, after);
        return after;
    }

    @Transactional(readOnly = true)
    public Page<Audit> audit(String type, String id, int page, int size) {
        if (type != null && !Set.of("MODERATOR", "PENALTY").contains(type)) throw invalid("Loại lịch sử không hợp lệ.");
        if (id != null && (id.isBlank() || id.length() > 50)) throw invalid("Mã đối tượng không hợp lệ.");
        String from = "from governance_audit where true";
        var args = new ArrayList<Object>();
        if (type != null) { from += " and resource_type=?"; args.add(type); }
        if (id != null) { from += " and resource_id=?"; args.add(id); }
        return page("select *", from, "happened_at desc,id desc", args, (rs, n) ->
                new Audit(rs.getObject("id", UUID.class), rs.getObject("actor_id", UUID.class), rs.getString("actor_name"),
                        rs.getString("action"), rs.getString("resource_type"), rs.getString("resource_id"),
                        parse(rs.getString("before_value")), parse(rs.getString("after_value")),
                        rs.getTimestamp("happened_at").toInstant()), page, size);
    }

    private Actor lockSenior(Jwt jwt) {
        UUID id = actorId(jwt);
        db.queryForList("select user_id from thanh_viens where user_id=? for share", id);
        return requireSenior(jwt);
    }

    private void lockAccounts(Jwt jwt, UUID target) {
        // Global account order avoids actor/target lock inversion, including two seniors.
        db.queryForList("select user_id from thanh_viens where user_id in (?,?) order by user_id for update", actorId(jwt), target);
    }

    private UUID actorId(Jwt jwt) {
        if (jwt == null || !"admin-web".equals(jwt.getClaimAsString("client"))) throw forbidden();
        try { return UUID.fromString(jwt.getSubject()); }
        catch (IllegalArgumentException | NullPointerException failure) { throw forbidden(); }
    }

    private Actor requireSenior(Jwt jwt) {
        UUID id = actorId(jwt);
        var account = account(id);
        if (account == null || !eligible(account)) throw forbidden();
        // Lock the actual role row: a concurrent role revocation cannot commit between
        // this authorization check and the mutation/audit commit.
        var time = timestamp();
        var roles = db.queryForList("select r.id from vai_tro_quan_tri r where r.user_id=? "
                + "and r.loai_vai_tro='QUAN_TRI_VIEN_CAP_CAO' and " + EFFECTIVE + " for share", id, time, time);
        if (roles.isEmpty()) throw forbidden();
        return new Actor(id, account.get("ho_ten").toString());
    }

    private Map<String, Object> account(UUID id) {
        var rows = db.queryForList("select user_id,ho_ten,trang_thai_tai_khoan,email_verified,profile_approved from thanh_viens where user_id=?", id);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private boolean eligible(Map<String, Object> row) {
        return "HOAT_DONG".equals(row.get("trang_thai_tai_khoan")) && Boolean.TRUE.equals(row.get("email_verified"))
                && Boolean.TRUE.equals(row.get("profile_approved"));
    }

    private List<Map<String, Object>> effectiveRoles(UUID id, String lock) {
        var time = timestamp();
        return db.queryForList("select r.* from vai_tro_quan_tri r where r.user_id=? and " + EFFECTIVE + " " + lock, id, time, time);
    }

    private Moderator moderatorByAssignment(UUID id) {
        return db.queryForObject("select " + MODERATOR_COLUMNS + " from vai_tro_quan_tri r join thanh_viens u on u.user_id=r.user_id where r.id=?",
                GovernanceService::moderator, id);
    }

    private static Moderator moderator(ResultSet rs, int row) throws SQLException {
        return new Moderator(rs.getObject("assignment_id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getString("ho_ten"), rs.getString("mssv"), rs.getString("email"),
                rs.getString("trang_thai_tai_khoan"), rs.getTimestamp("bat_dau").toInstant());
    }

    private Penalty penaltyById(String id, boolean lock) {
        if (id == null || id.isBlank() || id.length() > 50) throw invalid("Mã mức phạt không hợp lệ.");
        var rows = db.query("select * from thang_phats where ma_thang_phat=?" + (lock ? " for update" : ""), GovernanceService::penalty, id);
        if (rows.isEmpty()) throw missing("Không tìm thấy mức phạt.");
        return rows.getFirst();
    }

    private static Penalty penalty(ResultSet rs, int row) throws SQLException {
        return new Penalty(rs.getString("ma_thang_phat"), rs.getString("ten"), rs.getInt("diem_tru"),
                rs.getString("mo_ta"), rs.getString("trang_thai"), rs.getLong("version"));
    }

    private PenaltyValues values(GovernanceController.PenaltyInput input) {
        if (input.name() == null || input.name().isBlank()) throw invalid("Tên mức phạt không được để trống.");
        String name = input.name().strip();
        if (name.codePointCount(0, name.length()) > 255) throw invalid("Tên mức phạt tối đa 255 ký tự.");
        JsonNode points = input.points();
        if (points == null || !points.isIntegralNumber() || !points.canConvertToInt() || points.intValue() <= 0)
            throw invalid("Điểm trừ phải là số nguyên dương, tối đa 2147483647.");
        String description = input.description() == null ? "" : input.description().strip();
        if (description.length() > 4000) throw invalid("Mô tả tối đa 4.000 ký tự.");
        return new PenaltyValues(name, points.intValue(), description);
    }

    private long version(JsonNode value) {
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 0)
            throw invalid("Version là số nguyên không âm bắt buộc. Vui lòng tải lại dữ liệu.");
        return value.longValue();
    }

    private void checkVersion(Penalty penalty, long version) {
        if (penalty.version() != version) throw conflict("STALE_VERSION", "Mức phạt đã thay đổi. Vui lòng tải lại trước khi lưu.");
        if (version == Long.MAX_VALUE) throw conflict("VERSION_EXHAUSTED", "Mức phạt không thể cập nhật thêm phiên bản.");
    }

    private <T> Page<T> page(String select, String from, String order, List<?> filter, RowMapper<T> mapper, int page, int size) {
        bounds(page, size);
        long total = db.queryForObject("select count(*) " + from, Long.class, filter.toArray());
        var args = new ArrayList<Object>(filter);
        args.add(size);
        args.add((long) page * size);
        return new Page<>(db.query(select + " " + from + " order by " + order + " limit ? offset ?", mapper, args.toArray()), page, size, total);
    }

    private void bounds(int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw invalid("Trang phải từ 0; kích thước trang từ 1 đến 100.");
    }

    private String search(String q) { return q == null ? "" : q.strip().toLowerCase(Locale.ROOT); }
    private Timestamp timestamp() { return Timestamp.from(clock.instant()); }

    private void audit(Actor actor, String action, String type, String id, Object before, Object after) {
        db.update("insert into governance_audit(id,actor_id,actor_name,action,resource_type,resource_id,before_value,after_value,happened_at) "
                + "values (?,?,?,?,?,?,cast(? as jsonb),cast(? as jsonb),?)", UUID.randomUUID(), actor.id(), actor.name(),
                action, type, id, encode(before), encode(after), timestamp());
    }

    private String encode(Object value) {
        if (value == null) return null;
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException failure) { throw new IllegalStateException("Cannot encode governance audit", failure); }
    }

    private JsonNode parse(String value) {
        if (value == null) return null;
        try { return json.readTree(value); }
        catch (JsonProcessingException failure) { throw new IllegalStateException("Cannot decode governance audit", failure); }
    }

    private GovernanceFailure invalid(String message) { return new GovernanceFailure(400, "INVALID_INPUT", message); }
    private GovernanceFailure missing(String message) { return new GovernanceFailure(404, "NOT_FOUND", message); }
    private GovernanceFailure conflict(String code, String message) { return new GovernanceFailure(409, code, message); }
    private GovernanceFailure forbidden() { return new GovernanceFailure(403, "SENIOR_ADMIN_REQUIRED", "Cần quyền quản trị viên cấp cao hiện hành trên admin-web."); }
}
