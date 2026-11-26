package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.config.PostgresTestContainer;
import com.dormtrading.gov.GovernanceService;
import com.dormtrading.iam.auth.AuthService;
import com.nimbusds.jwt.SignedJWT;
import io.restassured.response.Response;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.*;

@Import(GovernanceIntegrationTest.RoleProbe.class)
class GovernanceIntegrationTest extends BaseIntegrationTest {
    private static final String ROOT = "/api/v1/admin/senior";
    private static final String PASSWORD = "quiet mountains beneath a silver moon";
    @Autowired JdbcTemplate db;
    @Autowired AuthService auth;
    @Autowired GovernanceService governance;
    @Autowired PasswordEncoder encoder;
    @Autowired DataSource dataSource;
    private final List<UUID> users = new ArrayList<>();
    private final List<String> penalties = new ArrayList<>();
    private UUID senior;
    private String token;
    private String passwordHash;

    @RestController
    static class RoleProbe {
        @GetMapping("/api/v1/admin/governance-role-probe")
        String moderator() { return "authorized"; }
    }

    @BeforeEach
    void fixtures() {
        passwordHash = encoder.encode(PASSWORD);
        senior = member("HOAT_DONG", true, true);
        role(senior, "QUAN_TRI_VIEN_CAP_CAO");
        token = login(senior, "admin-web");
    }

    @AfterEach
    void cleanup() {
        for (UUID id : users) db.update("delete from quyet_dinhs where nguoi_ra_quyet_dinh_id=?", id);
        for (UUID id : users) db.update("delete from bao_caos where nguoi_bao_cao_id=?", id);
        for (String id : penalties) db.update("delete from thang_phats where ma_thang_phat=?", id);
        for (UUID id : users) {
            db.update("delete from governance_audit where actor_id=?", id);
            db.update("delete from auth_refresh where session_id in (select id from auth_session where user_id=?)", id);
            db.update("delete from auth_session where user_id=?", id);
            db.update("delete from auth_login_guard where email=(select email from thanh_viens where user_id=?)", id);
            db.update("delete from vai_tro_quan_tri where user_id=?", id);
            db.update("delete from thanh_viens where user_id=?", id);
        }
    }

    @Test
    void everySeniorEndpointRejectsGuestsMembersModeratorsAndMobileSeniors() {
        UUID regular = member("HOAT_DONG", true, true);
        UUID moderator = member("HOAT_DONG", true, true);
        role(moderator, "KIEM_DUYET_VIEN");
        var clients = List.of(login(regular, "mobile"), login(moderator, "admin-web"), login(senior, "mobile"));
        String[][] endpoints = {{"GET", "/moderators"}, {"GET", "/moderator-candidates"}, {"POST", "/moderators"},
                {"DELETE", "/moderators/" + regular + "?assignmentId=" + UUID.randomUUID()},
                {"GET", "/penalties"}, {"POST", "/penalties"}, {"PUT", "/penalties/missing"},
                {"POST", "/penalties/missing/deactivate"}, {"GET", "/audit"}};
        for (var endpoint : endpoints) {
            given().contentType("application/json").body("{}").request(endpoint[0], ROOT + endpoint[1]).then().statusCode(401);
            for (String client : clients)
                given().auth().oauth2(client).contentType("application/json").body("{}")
                        .request(endpoint[0], ROOT + endpoint[1]).then().statusCode(403);
        }
    }

    @Test
    void appointmentRevocationReturnsOnlyUnfinishedReportsAndInvalidatesOldRole() {
        UUID target = member("HOAT_DONG", true, true);
        Instant requestedAt = Instant.now();
        var appointed = appoint(target);
        String assignment = appointed.jsonPath().getString("assignmentId");
        assertThat(Instant.parse(appointed.jsonPath().getString("appointedAt"))).isBetween(requestedAt, Instant.now());
        String moderatorToken = login(target, "admin-web");
        given().auth().oauth2(moderatorToken).get("/api/v1/admin/governance-role-probe").then().statusCode(200);
        UUID unfinished = report(target, "DANG_XU_LY");
        UUID finished = report(target, "DA_XU_LY");
        String email = db.queryForObject("select email from thanh_viens where user_id=?", String.class, target);
        var result = get("/moderators?q=" + email).jsonPath();
        assertThat(result.getString("items[0].userId")).isEqualTo(target.toString());
        given().auth().oauth2(token).queryParam("assignmentId", assignment).delete(ROOT + "/moderators/" + target).then().statusCode(204);
        assertThat(db.queryForMap("select trang_thai,nguoi_xu_ly_id from bao_caos where ma_bao_cao=?", unfinished))
                .containsEntry("trang_thai", "CHO_XU_LY").containsEntry("nguoi_xu_ly_id", null);
        assertThat(db.queryForMap("select trang_thai,nguoi_xu_ly_id from bao_caos where ma_bao_cao=?", finished))
                .containsEntry("trang_thai", "DA_XU_LY").containsEntry("nguoi_xu_ly_id", target);
        given().auth().oauth2(moderatorToken).get("/api/v1/admin/governance-role-probe").then().statusCode(403);
        var rows = get("/audit?resourceType=MODERATOR&resourceId=" + target).jsonPath().getList("items", Map.class);
        assertThat(rows).hasSize(2);
        assertThat(rows).allSatisfy(row -> assertThat(row.get("actorId")).isEqualTo(senior.toString()));
        var revoked = rows.stream().filter(row -> "REVOKE_MODERATOR".equals(row.get("action"))).findFirst().orElseThrow();
        assertThat(((Map<?, ?>) revoked.get("before")).get("assignmentId")).isEqualTo(assignment);
        assertThat(revoked.get("after")).isNull();
        assertThat(revoked.get("happenedAt")).isNotNull();
    }

    @Test
    void invalidTargetsAndStaleAssignmentNeverChangeRolesOrAudit() {
        for (var target : List.of(member("CHO_KICH_HOAT", false, false), member("BI_KHOA", true, true),
                member("HOAT_DONG", false, true), member("HOAT_DONG", true, false))) {
            post("/moderators", Map.of("userId", target)).then().statusCode(409);
            assertThat(effectiveModeratorCount(target)).isZero();
        }
        post("/moderators", Map.of("userId", senior)).then().statusCode(409);
        post("/moderators", Map.of("userId", UUID.randomUUID())).then().statusCode(404);
        assertThat(auditCount()).isZero();
        UUID target = member("HOAT_DONG", true, true);
        String old = appoint(target).jsonPath().getString("assignmentId");
        post("/moderators", Map.of("userId", target)).then().statusCode(409);
        given().auth().oauth2(token).delete(ROOT + "/moderators/" + target).then().statusCode(400);
        given().auth().oauth2(token).queryParam("assignmentId", old).delete(ROOT + "/moderators/" + target).then().statusCode(204);
        String current = appoint(target).jsonPath().getString("assignmentId");
        given().auth().oauth2(token).queryParam("assignmentId", old).delete(ROOT + "/moderators/" + target).then().statusCode(409);
        assertThat(effectiveModeratorCount(target)).isEqualTo(1);
        assertThat(db.queryForObject("select trang_thai_hieu_luc from vai_tro_quan_tri where id=?", Boolean.class, UUID.fromString(current))).isTrue();
        assertThat(auditCount()).isEqualTo(3);
    }

    @Test
    void candidatesExposeEligibilityAndSearchNamesStudentIdsEmailsWithoutSeniorTargets() {
        UUID pending = member("HOAT_DONG", false, false);
        String student = db.queryForObject("select mssv from thanh_viens where user_id=?", String.class, pending);
        var candidate = get("/moderator-candidates?q=" + student).jsonPath();
        assertThat(candidate.getString("items[0].userId")).isEqualTo(pending.toString());
        assertThat(candidate.getBoolean("items[0].emailVerified")).isFalse();
        assertThat(candidate.getBoolean("items[0].profileApproved")).isFalse();
        String seniorEmail = db.queryForObject("select email from thanh_viens where user_id=?", String.class, senior);
        assertThat(get("/moderator-candidates?q=" + seniorEmail).jsonPath().getLong("total")).isZero();
        get("/moderators?page=-1").then().statusCode(400);
        get("/penalties?size=101").then().statusCode(400);
    }

    @Test
    void concurrentAppointmentsProduceOneEffectiveRoleAndOneAudit() throws Exception {
        UUID target = member("HOAT_DONG", true, true);
        var statuses = concurrent(() -> post("/moderators", Map.of("userId", target)).statusCode(),
                () -> post("/moderators", Map.of("userId", target)).statusCode());
        assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        assertThat(effectiveModeratorCount(target)).isEqualTo(1);
        assertThat(auditCount()).isEqualTo(1);
    }

    @Test
    void revokedSeniorFailsBothHttpAndTransactionalServiceAuthorization() throws Exception {
        Jwt old = jwt(token);
        db.update("update vai_tro_quan_tri set trang_thai_hieu_luc=false where user_id=?", senior);
        post("/penalties", Map.of("name", "Never created", "points", 1)).then().statusCode(403);
        assertThatThrownBy(() -> governance.appoint(old, member("HOAT_DONG", true, true)))
                .isInstanceOf(RuntimeException.class).hasMessageContaining("cấp cao");
        assertThat(auditCount()).isZero();
    }

    @Test
    void penaltySearchMatchesDescriptionWithoutRequiringNameMatch() {
        String description = "specific-detail-" + UUID.randomUUID();
        String id = create("Search " + UUID.randomUUID(), 3, description).jsonPath().getString("id");
        var result = get("/penalties?q=" + description.toUpperCase(Locale.ROOT)).jsonPath();
        assertThat(result.getString("items[0].id")).isEqualTo(id);
    }

    @Test
    void rejectsNonIntegerPointsInvalidVersionsBlankAndNormalizedDuplicateNamesAtomically() {
        for (String points : List.of("null", "0", "-1", "1.5", "1.0", "2147483648", "999999999999999999999999", "\"2\"", "true")) {
            post("/penalties", "{\"name\":\"Invalid\",\"points\":" + points + "}").then().statusCode(400);
        }
        post("/penalties", Map.of("name", "  ", "points", 1)).then().statusCode(400);
        post("/penalties", Map.of("name", "Missing points")).then().statusCode(400);
        assertThat(auditCount()).isZero();
        String name = "Penalty " + UUID.randomUUID();
        var created = create(name, Integer.MAX_VALUE, "boundary");
        String id = created.jsonPath().getString("id");
        assertThat(created.jsonPath().getInt("points")).isEqualTo(Integer.MAX_VALUE);
        post("/penalties", Map.of("name", "  " + name.toUpperCase(Locale.ROOT) + "  ", "points", 1)).then().statusCode(409);
        for (String version : List.of("null", "-1", "0.5", "0.0", "9223372036854775808", "\"0\"")) {
            put("/penalties/" + id, "{\"name\":\"Still invalid\",\"points\":2,\"version\":" + version + "}").then().statusCode(400);
            post("/penalties/" + id + "/deactivate", "{\"version\":" + version + "}").then().statusCode(400);
        }
        put("/penalties/" + id, Map.of("name", "Missing version", "points", 2)).then().statusCode(400);
        post("/penalties/" + id + "/deactivate", Map.of()).then().statusCode(400);
        assertThat(auditCount()).isEqualTo(1);
        assertThat(db.queryForObject("select ten from thang_phats where ma_thang_phat=?", String.class, id)).isEqualTo(name);
    }
    @Test
    void deactivatedPenaltyNamesCanBeReusedButDeactivatedPenaltyCannotBeEdited() {
        String name = "Reusable " + UUID.randomUUID();
        String id = create(name, 5, "initial").jsonPath().getString("id");
        post("/penalties/" + id + "/deactivate", Map.of("version", 0)).then().statusCode(200);

        String replacementId = create("  " + name.toUpperCase(Locale.ROOT) + "  ", 3, "replacement")
                .then().statusCode(201).extract().jsonPath().getString("id");
        assertThat(replacementId).isNotEqualTo(id);
        put("/penalties/" + id, Map.of("name", name + " edited", "points", 7, "version", 1))
                .then().statusCode(409);
        assertThat(db.queryForObject("select count(*) from thang_phats where lower(ten)=lower(?)", Long.class, name))
                .isEqualTo(2);
    }

    @Test
    void penaltyDescriptionAcceptsFourThousandCharactersAndRejectsLongerValues() {
        create("Description boundary " + UUID.randomUUID(), 2, "x".repeat(4000)).then().statusCode(201);
        post("/penalties", Map.of("name", "Too long " + UUID.randomUUID(), "points", 2, "description", "x".repeat(4001)))
                .then().statusCode(400);
    }

    @Test
    void penaltyUpdatesUseOptimisticVersionsAndAuditExactBeforeAfter() throws Exception {
        String name = "Penalty " + UUID.randomUUID();
        String id = create(name, 7, "initial").jsonPath().getString("id");
        var statuses = concurrent(() -> put("/penalties/" + id, Map.of("name", name, "points", 9, "description", "changed", "version", 0)).statusCode(),
                () -> put("/penalties/" + id, Map.of("name", name, "points", 9, "description", "changed", "version", 0)).statusCode());
        assertThat(statuses).containsExactlyInAnyOrder(200, 409);
        post("/penalties/" + id + "/deactivate", Map.of("version", 0)).then().statusCode(409);
        post("/penalties/" + id + "/deactivate", Map.of("version", 1)).then().statusCode(200);
        var audit = get("/audit?resourceType=PENALTY&resourceId=" + id).jsonPath().getList("items", Map.class);
        assertThat(audit).hasSize(3);
        var update = audit.stream().filter(row -> "UPDATE_PENALTY".equals(row.get("action"))).findFirst().orElseThrow();
        assertThat(update.get("actorId")).isEqualTo(senior.toString());
        assertThat(update.get("actorName")).isEqualTo("Governance " + senior.toString().substring(0, 8));
        assertThat(((Map<?, ?>) update.get("before")).get("points")).isEqualTo(7);
        assertThat(((Map<?, ?>) update.get("before")).get("description")).isEqualTo("initial");
        assertThat(((Map<?, ?>) update.get("after")).get("points")).isEqualTo(9);
        assertThat(((Map<?, ?>) update.get("after")).get("description")).isEqualTo("changed");
        assertThat(get("/penalties?q=" + name.replace(" ", "%20") + "&status=DANG_DUNG").jsonPath().getLong("total")).isZero();
    }

    @Test
    void auditInsertFailureRollsBackPenaltyAndRoleAndReportChanges() {
        UUID target = member("HOAT_DONG", true, true);
        String assignment = appoint(target).jsonPath().getString("assignmentId");
        UUID report = report(target, "DANG_XU_LY");
        String id = create("Rollback " + UUID.randomUUID(), 4, "original").jsonPath().getString("id");
        long count = auditCount();
        String suffix = UUID.randomUUID().toString().replace("-", "");
        String function = "gov_fail_" + suffix;
        String trigger = "gov_audit_" + suffix;
        db.execute("create function " + function + "() returns trigger language plpgsql as $$ begin if new.actor_id='" + senior
                + "'::uuid then raise exception 'Injected audit failure'; end if; return new; end $$");
        db.execute("create trigger " + trigger + " before insert on governance_audit for each row execute function " + function + "()");
        try {
            put("/penalties/" + id, Map.of("name", "Should roll back", "points", 8, "version", 0)).then().statusCode(503);
            given().auth().oauth2(token).queryParam("assignmentId", assignment).delete(ROOT + "/moderators/" + target).then().statusCode(503);
            UUID candidate = member("HOAT_DONG", true, true);
            post("/moderators", Map.of("userId", candidate)).then().statusCode(503);
            assertThat(effectiveModeratorCount(candidate)).isZero();
            assertThat(effectiveModeratorCount(target)).isEqualTo(1);
            assertThat(db.queryForObject("select trang_thai from bao_caos where ma_bao_cao=?", String.class, report)).isEqualTo("DANG_XU_LY");
            assertThat(db.queryForObject("select diem_tru from thang_phats where ma_thang_phat=?", Integer.class, id)).isEqualTo(4);
            assertThat(db.queryForObject("select version from thang_phats where ma_thang_phat=?", Long.class, id)).isZero();
            assertThat(auditCount()).isEqualTo(count);
        } finally {
            db.execute("drop trigger " + trigger + " on governance_audit");
            db.execute("drop function " + function + "()");
        }
    }

    @Test
    void decisionsFreezePenaltyValuesAndRejectNewStoppedSelectionsAndTampering() {
        String name = "History " + UUID.randomUUID();
        String id = create(name, 6, "old description").jsonPath().getString("id");
        UUID original = decision(id);
        put("/penalties/" + id, Map.of("name", name + " edited", "points", 12, "description", "new description", "version", 0)).then().statusCode(200);
        UUID later = decision(id);
        post("/penalties/" + id + "/deactivate", Map.of("version", 1)).then().statusCode(200);
        assertThat(snapshot(original)).containsEntry("ten_thang_phat_snapshot", name)
                .containsEntry("diem_tru_snapshot", 6).containsEntry("mo_ta_thang_phat_snapshot", "old description");
        assertThat(snapshot(later)).containsEntry("ten_thang_phat_snapshot", name + " edited")
                .containsEntry("diem_tru_snapshot", 12).containsEntry("mo_ta_thang_phat_snapshot", "new description");
        assertThatThrownBy(() -> decision(id)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> db.update("update quyet_dinhs set diem_tru_snapshot=999 where ma_quyet_dinh=?", original)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> db.update("update quyet_dinhs set ma_thang_phat=null where ma_quyet_dinh=?", original)).isInstanceOf(DataAccessException.class);
        assertThat(db.queryForObject("select count(*) from quyet_dinhs where nguoi_ra_quyet_dinh_id=?", Long.class, senior)).isEqualTo(2);
    }

    @Test
    void newDecisionCannotRacePastAnUncommittedPenaltyDeactivation() throws Exception {
        String id = create("Concurrent history " + UUID.randomUUID(), 3, "snapshot").jsonPath().getString("id");
        try (var updating = dataSource.getConnection(); var inserting = dataSource.getConnection()) {
            updating.setAutoCommit(false);
            inserting.setAutoCommit(false);
            try (var change = updating.prepareStatement("update thang_phats set trang_thai='NGUNG_SU_DUNG' where ma_thang_phat=?");
                 var insert = inserting.prepareStatement("insert into quyet_dinhs(nguoi_ra_quyet_dinh_id,ma_thang_phat,ket_luan,can_cu) values (?,?,'Concurrent','Concurrent')");
                 var settings = inserting.createStatement()) {
                change.setString(1, id);
                change.executeUpdate();
                settings.execute("set local lock_timeout='250ms'");
                insert.setObject(1, senior);
                insert.setString(2, id);
                // A KEY SHARE-only implementation would incorrectly insert immediately.
                assertThatThrownBy(insert::executeUpdate).isInstanceOf(java.sql.SQLException.class)
                        .satisfies(error -> assertThat(((java.sql.SQLException) error).getSQLState()).isEqualTo("55P03"));
                inserting.rollback();
                updating.commit();
                assertThatThrownBy(insert::executeUpdate).isInstanceOf(java.sql.SQLException.class)
                        .satisfies(error -> assertThat(((java.sql.SQLException) error).getSQLState()).isEqualTo("23514"));
            } finally {
                inserting.rollback();
                updating.rollback();
            }
        }
        assertThat(db.queryForObject("select count(*) from quyet_dinhs where nguoi_ra_quyet_dinh_id=?", Long.class, senior)).isZero();
    }

    @Test
    void upgradesV4BackfillsExistingDecisionBeforeDiscontinuingAllSixSamples() throws Exception {
        var pg = PostgresTestContainer.getInstance();
        String schema = "gov_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var config = Flyway.configure().dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()).schemas(schema).defaultSchema(schema);
        try {
            config.target("4").load().migrate();
            try (var connection = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()); var sql = connection.createStatement()) {
                sql.execute("set search_path to " + schema);
                sql.execute("insert into thanh_viens(user_id,email,mat_khau_hash,ho_ten,mssv) values ('" + senior + "','legacy@uni.edu.vn','unused','Legacy','LEGACY')");
                sql.execute("insert into quyet_dinhs(nguoi_ra_quyet_dinh_id,ma_thang_phat,ket_luan,can_cu) values ('" + senior + "','TP_BO_HEN_LAN_1','legacy','legacy')");
                config.target("5").load().migrate();
                try (var rows = sql.executeQuery("select q.ten_thang_phat_snapshot,q.diem_tru_snapshot,q.mo_ta_thang_phat_snapshot,p.ten,p.diem_tru,p.trang_thai "
                        + "from quyet_dinhs q join thang_phats p using(ma_thang_phat)")) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getString(1)).isEqualTo(rows.getString(4));
                    assertThat(rows.getInt(2)).isEqualTo(rows.getInt(5));
                    assertThat(rows.getString(3)).isEmpty();
                    assertThat(rows.getString(6)).isEqualTo("NGUNG_SU_DUNG");
                }
                try (var rows = sql.executeQuery("select count(*),count(*) filter(where trang_thai='DANG_DUNG') from thang_phats")) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getInt(1)).isEqualTo(6);
                    assertThat(rows.getInt(2)).isZero();
                }
                assertThatThrownBy(() -> sql.execute("insert into quyet_dinhs(nguoi_ra_quyet_dinh_id,ma_thang_phat,ket_luan,can_cu) values ('" + senior
                        + "','TP_BO_HEN_LAN_1','stopped','stopped')")).isInstanceOf(java.sql.SQLException.class);
            }
        } finally {
            db.execute("drop schema if exists " + schema + " cascade");
        }
    }

    private UUID member(String status, boolean verified, boolean approved) {
        UUID id = UUID.randomUUID();
        String student = id.toString().replace("-", "").substring(0, 16);
        db.update("insert into thanh_viens(user_id,email,mat_khau_hash,ho_ten,mssv,trang_thai_tai_khoan,email_verified,profile_approved) values (?,?,?,?,?,?,?,?)",
                id, "gov" + student + "@student.edu.vn", passwordHash, "Governance " + id.toString().substring(0, 8), student, status, verified, approved);
        users.add(id);
        return id;
    }

    private void role(UUID id, String role) {
        db.update("insert into vai_tro_quan_tri(user_id,loai_vai_tro,bat_dau) values (?,?,?)", id, role, java.sql.Timestamp.from(Instant.now().minusSeconds(60)));
    }

    private String login(UUID id, String client) {
        String email = db.queryForObject("select email from thanh_viens where user_id=?", String.class, id);
        return auth.login(email, PASSWORD, client, id.toString()).token();
    }

    private Response get(String path) { return given().auth().oauth2(token).get(ROOT + path); }
    private Response post(String path, Object body) { return given().auth().oauth2(token).contentType("application/json").body(body).post(ROOT + path); }
    private Response put(String path, Object body) { return given().auth().oauth2(token).contentType("application/json").body(body).put(ROOT + path); }
    private Response appoint(UUID target) {
        var response = post("/moderators", Map.of("userId", target));
        response.then().statusCode(201);
        return response;
    }
    private Response create(String name, int points, String description) {
        var response = post("/penalties", Map.of("name", name, "points", points, "description", description));
        response.then().statusCode(201);
        penalties.add(response.jsonPath().getString("id"));
        return response;
    }
    private long auditCount() { return db.queryForObject("select count(*) from governance_audit where actor_id=?", Long.class, senior); }
    private long effectiveModeratorCount(UUID target) {
        return db.queryForObject("select count(*) from vai_tro_quan_tri where user_id=? and loai_vai_tro='KIEM_DUYET_VIEN' and trang_thai_hieu_luc "
                + "and bat_dau<=current_timestamp and (ket_thuc is null or ket_thuc>current_timestamp)", Long.class, target);
    }
    private UUID report(UUID target, String status) {
        UUID id = UUID.randomUUID();
        db.update("insert into bao_caos(ma_bao_cao,nguoi_bao_cao_id,loai_doi_tuong,doi_tuong_id,danh_muc_vi_pham,noi_dung,trang_thai,nguoi_xu_ly_id) "
                + "values (?,?,'NGUOI_DUNG',?,'TEST','Test report',?,?)", id, senior, target, status, target);
        return id;
    }
    private UUID decision(String penalty) {
        UUID id = UUID.randomUUID();
        db.update("insert into quyet_dinhs(ma_quyet_dinh,nguoi_ra_quyet_dinh_id,ma_thang_phat,ket_luan,can_cu) values (?,?,?,'Test','Test')", id, senior, penalty);
        return id;
    }
    private Map<String, Object> snapshot(UUID id) {
        return db.queryForMap("select ten_thang_phat_snapshot,diem_tru_snapshot,mo_ta_thang_phat_snapshot from quyet_dinhs where ma_quyet_dinh=?", id);
    }
    private Jwt jwt(String value) throws Exception {
        var claims = SignedJWT.parse(value).getJWTClaimsSet();
        return Jwt.withTokenValue(value).header("alg", "HS256").claims(c -> c.putAll(claims.getClaims()))
                .issuedAt(claims.getIssueTime().toInstant()).expiresAt(claims.getExpirationTime().toInstant()).build();
    }
    private <T> List<T> concurrent(Callable<T> first, Callable<T> second) throws Exception {
        try (var pool = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            var a = pool.submit(() -> { start.await(); return first.call(); });
            var b = pool.submit(() -> { start.await(); return second.call(); });
            start.countDown();
            return List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS));
        }
    }
}
