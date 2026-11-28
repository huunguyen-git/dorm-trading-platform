package com.dormtrading;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.config.PostgresTestContainer;
import com.dormtrading.iam.auth.AuthService;
import io.restassured.response.Response;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.sql.DriverManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import javax.imageio.ImageIO;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

@DisplayName("Kiểm thử Tích hợp P2-06: Báo cáo Người dùng (UC-35) & Báo cáo Tin đăng (UC-36)")
class ReportIntegrationTest extends BaseIntegrationTest {

    private static final String PASSWORD = "calm dorm corridor after midnight";

    @Autowired
    JdbcTemplate db;
    @Autowired
    AuthService auth;
    @Autowired
    PasswordEncoder encoder;

    private final List<UUID> createdUsers = new ArrayList<>();
    private final List<UUID> createdListings = new ArrayList<>();
    private final List<UUID> createdConversations = new ArrayList<>();
    private String passwordHash;

    @BeforeEach
    void init() {
        passwordHash = encoder.encode(PASSWORD);
    }

    @AfterEach
    void cleanup() {
        for (UUID convId : createdConversations) {
            db.update("DELETE FROM hoi_thoais WHERE ma_hoi_thoai = ?", convId);
        }
        for (UUID userId : createdUsers) {
            db.update("DELETE FROM bao_cao_bang_chungs WHERE uploader_id = ?", userId);
            db.update("DELETE FROM bao_caos WHERE nguoi_bao_cao_id = ?", userId);
        }
        for (UUID listingId : createdListings) {
            db.update("DELETE FROM nhom_bao_caos WHERE loai_doi_tuong = 'TIN_DANG' AND doi_tuong_id = ?", listingId);
            db.update("DELETE FROM tin_dangs WHERE ma_tin = ?", listingId);
        }
        for (UUID userId : createdUsers) {
            db.update("DELETE FROM nhom_bao_caos WHERE loai_doi_tuong = 'NGUOI_DUNG' AND doi_tuong_id = ?", userId);
            db.update("DELETE FROM auth_refresh WHERE session_id IN (SELECT id FROM auth_session WHERE user_id = ?)", userId);
            db.update("DELETE FROM auth_session WHERE user_id = ?", userId);
            db.update("DELETE FROM auth_login_guard WHERE email = (SELECT email FROM thanh_viens WHERE user_id = ?)", userId);
            db.update("DELETE FROM vai_tro_quan_tri WHERE user_id = ?", userId);
            db.update("DELETE FROM thanh_viens WHERE user_id = ?", userId);
        }
    }

    @Test
    @DisplayName("UC-35 & UC-36: Liệt kê danh mục báo cáo và gửi báo cáo không làm đổi điểm uy tín hay trạng thái tin")
    void submitsUserAndListingReportsWithoutMutatingReputationOrListingStatus() throws Exception {
        UUID reporter = createMember("HOAT_DONG", true, true, 100);
        UUID targetUser = createMember("HOAT_DONG", true, true, 105);
        UUID listingId = createListing(targetUser, "Giáo trình Giải tích 1", "CONG_KHAI", Instant.now().plusSeconds(3600));
        String reporterToken = login(reporter, "mobile");

        // Categories filter by targetType
        given().auth().oauth2(reporterToken)
                .queryParam("targetType", "TIN_DANG")
                .get("/api/v1/reports/categories")
                .then().statusCode(200)
                .body("items.size()", greaterThanOrEqualTo(5))
                .body("items[0].targetType", equalTo("TIN_DANG"));

        // Upload valid PNG evidence
        byte[] pngBytes = createSamplePng();
        Response uploadRes = given().auth().oauth2(reporterToken)
                .multiPart("files", "proof.png", pngBytes, "image/png")
                .post("/api/v1/reports/evidence")
                .then().statusCode(201)
                .body("items", hasSize(1))
                .extract().response();
        UUID evidenceId = UUID.fromString(uploadRes.jsonPath().getString("items[0].id"));

        // UC-36: Report listing with description + image evidence
        Response listingReport = given().auth().oauth2(reporterToken)
                .contentType("application/json")
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", listingId.toString(),
                        "categoryCode", "TIN_DANG_SAI_SU_THAT",
                        "description", "Ảnh chụp không khớp với cuốn sách thực tế.",
                        "evidenceIds", List.of(evidenceId.toString()),
                        "clientRequestId", "req-uc36-1"
                ))
                .post("/api/v1/reports")
                .then().statusCode(201)
                .body("status", equalTo("CHO_XU_LY"))
                .body("groupReportCount", equalTo(1))
                .body("imageEvidenceCount", equalTo(1))
                .body("hasChatLog", equalTo(false))
                .body("idempotentReplay", equalTo(false))
                .extract().response();
        assertThat(listingReport.jsonPath().getString("groupId")).isNotBlank();

        // Post-condition UC-36: Listing stays CONG_KHAI and seller reputation unchanged
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listingId))
                .isEqualTo("CONG_KHAI");
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, targetUser))
                .isEqualTo(105);

        // UC-35: Report user with description only
        given().auth().oauth2(reporterToken)
                .contentType("application/json")
                .body(Map.of(
                        "targetType", "NGUOI_DUNG",
                        "targetId", targetUser.toString(),
                        "categoryCode", "NGUOI_DUNG_BO_HEN",
                        "description", "Hẹn ở sảnh KTX Khu A nhưng không đến và không phản hồi."
                ))
                .post("/api/v1/reports")
                .then().statusCode(201)
                .body("status", equalTo("CHO_XU_LY"))
                .body("groupReportCount", equalTo(1))
                .body("imageEvidenceCount", equalTo(0));

        // Post-condition UC-35: Target user reputation unchanged
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, targetUser))
                .isEqualTo(105);

        // Reporter sees both reports in /mine
        given().auth().oauth2(reporterToken)
                .get("/api/v1/reports/mine")
                .then().statusCode(200)
                .body("total", equalTo(2))
                .body("items", hasSize(2));
    }

    @Test
    @DisplayName("Tự gom nhóm theo (đối tượng, danh mục) kể cả khi đồng thời, chống báo cáo trùng và hỗ trợ retry idempotent")
    void groupsConcurrentReportsRejectsDuplicatesAndSupportsIdempotentRetry() throws Exception {
        UUID reporterA = createMember("HOAT_DONG", true, true, 100);
        UUID reporterB = createMember("HOAT_DONG", true, true, 100);
        UUID seller = createMember("HOAT_DONG", true, true, 100);
        UUID listingId = createListing(seller, "Xe đạp mini cũ", "CONG_KHAI", Instant.now().plusSeconds(3600));

        String tokenA = login(reporterA, "mobile");
        String tokenB = login(reporterB, "mobile");

        // Concurrent reports from 2 distinct users for the same (listing, category) -> 1 group, count=2
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Response> callA = () -> given().auth().oauth2(tokenA)
                    .contentType("application/json")
                    .body(Map.of(
                            "targetType", "TIN_DANG",
                            "targetId", listingId.toString(),
                            "categoryCode", "TIN_DANG_HANG_CAM",
                            "description", "Báo cáo từ sinh viên A",
                            "clientRequestId", "idem-a-1"
                    ))
                    .post("/api/v1/reports");
            Callable<Response> callB = () -> given().auth().oauth2(tokenB)
                    .contentType("application/json")
                    .body(Map.of(
                            "targetType", "TIN_DANG",
                            "targetId", listingId.toString(),
                            "categoryCode", "TIN_DANG_HANG_CAM",
                            "description", "Báo cáo từ sinh viên B",
                            "clientRequestId", "idem-b-1"
                    ))
                    .post("/api/v1/reports");
            var futures = pool.invokeAll(List.of(callA, callB));
            Response resA = futures.get(0).get();
            Response resB = futures.get(1).get();
            assertThat(resA.statusCode()).isEqualTo(201);
            assertThat(resB.statusCode()).isEqualTo(201);
            assertThat(resA.jsonPath().getString("groupId")).isEqualTo(resB.jsonPath().getString("groupId"));

            UUID groupId = UUID.fromString(resA.jsonPath().getString("groupId"));
            assertThat(db.queryForObject("SELECT so_luong_bao_cao FROM nhom_bao_caos WHERE ma_nhom = ?", Integer.class, groupId))
                    .isEqualTo(2);

            // Idempotent retry by reporterA with same clientRequestId -> 200 OK, same reportId, count stays 2
            given().auth().oauth2(tokenA)
                    .contentType("application/json")
                    .body(Map.of(
                            "targetType", "TIN_DANG",
                            "targetId", listingId.toString(),
                            "categoryCode", "TIN_DANG_HANG_CAM",
                            "description", "Báo cáo từ sinh viên A",
                            "clientRequestId", "idem-a-1"
                    ))
                    .post("/api/v1/reports")
                    .then().statusCode(200)
                    .body("id", equalTo(resA.jsonPath().getString("id")))
                    .body("idempotentReplay", equalTo(true))
                    .body("groupReportCount", equalTo(2));

            // Reusing same clientRequestId for a different category -> 409 CLIENT_REQUEST_ID_CONFLICT
            given().auth().oauth2(tokenA)
                    .contentType("application/json")
                    .body(Map.of(
                            "targetType", "TIN_DANG",
                            "targetId", listingId.toString(),
                            "categoryCode", "TIN_DANG_TRUNG_LAP_SPAM",
                            "description", "Đổi danh mục với cùng key",
                            "clientRequestId", "idem-a-1"
                    ))
                    .post("/api/v1/reports")
                    .then().statusCode(409)
                    .body("code", equalTo("CLIENT_REQUEST_ID_CONFLICT"));

            // Duplicate report by reporterA (new request, same target + category while CHO_XU_LY) -> 409 DUPLICATE_REPORT
            given().auth().oauth2(tokenA)
                    .contentType("application/json")
                    .body(Map.of(
                            "targetType", "TIN_DANG",
                            "targetId", listingId.toString(),
                            "categoryCode", "TIN_DANG_HANG_CAM",
                            "description", "Gửi trùng báo cáo",
                            "clientRequestId", "idem-a-2"
                    ))
                    .post("/api/v1/reports")
                    .then().statusCode(409)
                    .body("code", equalTo("DUPLICATE_REPORT"));
        }
    }

    @Test
    @DisplayName("UC-35/36 Ngoại lệ: thiếu danh mục, thiếu mô tả & bằng chứng, tự báo cáo, tin không công khai, tệp sai định dạng")
    void enforcesAllValidationAndPreconditionExceptions() {
        UUID reporter = createMember("HOAT_DONG", true, true, 100);
        UUID seller = createMember("HOAT_DONG", true, true, 100);
        UUID ownListing = createListing(reporter, "Tin của chính mình", "CONG_KHAI", Instant.now().plusSeconds(3600));
        UUID hiddenListing = createListing(seller, "Tin đã bị ẩn", "AN", Instant.now().plusSeconds(3600));
        UUID publicListing = createListing(seller, "Tin công khai", "CONG_KHAI", Instant.now().plusSeconds(3600));
        String token = login(reporter, "mobile");

        // Missing category
        given().auth().oauth2(token).contentType("application/json")
                .body(Map.of("targetType", "TIN_DANG", "targetId", publicListing.toString(), "description", "Có mô tả"))
                .post("/api/v1/reports")
                .then().statusCode(400).body("code", equalTo("MISSING_CATEGORY"));

        // Mismatched category (user category for listing)
        given().auth().oauth2(token).contentType("application/json")
                .body(Map.of("targetType", "TIN_DANG", "targetId", publicListing.toString(),
                        "categoryCode", "NGUOI_DUNG_LUA_DAO", "description", "Sai danh mục"))
                .post("/api/v1/reports")
                .then().statusCode(400).body("code", equalTo("INVALID_CATEGORY"));

        // Missing both description and evidence
        given().auth().oauth2(token).contentType("application/json")
                .body(Map.of("targetType", "TIN_DANG", "targetId", publicListing.toString(),
                        "categoryCode", "TIN_DANG_HANG_CAM", "description", "   "))
                .post("/api/v1/reports")
                .then().statusCode(400).body("code", equalTo("MISSING_CONTENT_OR_EVIDENCE"));

        // Self-report user
        given().auth().oauth2(token).contentType("application/json")
                .body(Map.of("targetType", "NGUOI_DUNG", "targetId", reporter.toString(),
                        "categoryCode", "NGUOI_DUNG_SPAM", "description", "Tự báo cáo"))
                .post("/api/v1/reports")
                .then().statusCode(400).body("code", equalTo("SELF_REPORT_NOT_ALLOWED"));

        // Self-report listing
        given().auth().oauth2(token).contentType("application/json")
                .body(Map.of("targetType", "TIN_DANG", "targetId", ownListing.toString(),
                        "categoryCode", "TIN_DANG_TRUNG_LAP_SPAM", "description", "Tự báo cáo tin"))
                .post("/api/v1/reports")
                .then().statusCode(400).body("code", equalTo("SELF_REPORT_NOT_ALLOWED"));

        // Non-public listing (AN)
        given().auth().oauth2(token).contentType("application/json")
                .body(Map.of("targetType", "TIN_DANG", "targetId", hiddenListing.toString(),
                        "categoryCode", "TIN_DANG_HANG_CAM", "description", "Tin đã ẩn"))
                .post("/api/v1/reports")
                .then().statusCode(409).body("code", equalTo("LISTING_NOT_AVAILABLE"));

        // Invalid evidence format (plain text pretending to be image)
        given().auth().oauth2(token)
                .multiPart("files", "evil.txt", "not an image".getBytes(), "text/plain")
                .post("/api/v1/reports/evidence")
                .then().statusCode(400).body("code", equalTo("INVALID_MEDIA"));
    }

    @Test
    @DisplayName("NFR-01 & UC-35/36 §3.2/§4: Nhật ký chat và bằng chứng chỉ Kiểm duyệt viên / Quản trị viên cấp cao được xem")
    void attachesChatLogEvidenceAndRestrictsEvidenceAccessToModeratorsAndSeniorAdmins() throws Exception {
        UUID reporter = createMember("HOAT_DONG", true, true, 100);
        UUID seller = createMember("HOAT_DONG", true, true, 100);
        UUID outsider = createMember("HOAT_DONG", true, true, 100);
        UUID moderator = createMember("HOAT_DONG", true, true, 100);
        UUID senior = createMember("HOAT_DONG", true, true, 100);
        grantRole(moderator, "KIEM_DUYET_VIEN");
        grantRole(senior, "QUAN_TRI_VIEN_CAP_CAO");

        UUID listingId = createListing(seller, "Máy tính Casio fx-580VN X", "CONG_KHAI", Instant.now().plusSeconds(3600));
        UUID convId = UUID.randomUUID();
        createdConversations.add(convId);
        db.update("INSERT INTO hoi_thoais(ma_hoi_thoai, ma_tin, nguoi_mua_id, nguoi_ban_id) VALUES (?, ?, ?, ?)",
                convId, listingId, reporter, seller);
        UUID msgId = UUID.randomUUID();
        db.update("INSERT INTO tin_nhans(ma_tin_nhan, ma_hoi_thoai, nguoi_gui_id, noi_dung, gia_de_nghi) VALUES (?, ?, ?, ?, ?)",
                msgId, convId, seller, "Chuyển khoản trước mới giữ máy nhé", 350000);

        String reporterToken = login(reporter, "mobile");
        String sellerToken = login(seller, "mobile");
        String outsiderToken = login(outsider, "mobile");
        String mobileModToken = login(moderator, "mobile");
        String webModToken = login(moderator, "admin-web");
        String webSeniorToken = login(senior, "admin-web");

        // Reporter can fetch own chat evidence options for seller
        given().auth().oauth2(reporterToken)
                .queryParam("targetType", "NGUOI_DUNG")
                .queryParam("targetId", seller.toString())
                .get("/api/v1/reports/chat-evidence-options")
                .then().statusCode(200)
                .body("conversations", hasSize(1))
                .body("conversations[0].messages[0].id", equalTo(msgId.toString()));

        // Outsider cannot attach someone else's conversation
        given().auth().oauth2(outsiderToken).contentType("application/json")
                .body(Map.of(
                        "targetType", "NGUOI_DUNG",
                        "targetId", seller.toString(),
                        "categoryCode", "NGUOI_DUNG_LUA_DAO",
                        "chatConversationId", convId.toString(),
                        "chatMessageIds", List.of(msgId.toString()),
                        "attachChatLog", true
                ))
                .post("/api/v1/reports")
                .then().statusCode(403);

        // Reporter uploads image + submits report with image + chat log (evidence-only, no text description)
        UUID imgEvidenceId = UUID.fromString(
                given().auth().oauth2(reporterToken)
                        .multiPart("files", "chat-shot.png", createSamplePng(), "image/png")
                        .post("/api/v1/reports/evidence")
                        .then().statusCode(201).extract().jsonPath().getString("items[0].id")
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("targetType", "NGUOI_DUNG");
        payload.put("targetId", seller.toString());
        payload.put("categoryCode", "NGUOI_DUNG_LUA_DAO");
        payload.put("description", "");
        payload.put("evidenceIds", List.of(imgEvidenceId.toString()));
        payload.put("chatConversationId", convId.toString());
        payload.put("chatMessageIds", List.of(msgId.toString()));
        payload.put("attachChatLog", true);

        Response reportRes = given().auth().oauth2(reporterToken)
                .contentType("application/json")
                .body(payload)
                .post("/api/v1/reports")
                .then().statusCode(201)
                .body("imageEvidenceCount", equalTo(1))
                .body("hasChatLog", equalTo(true))
                .extract().response();
        UUID reportId = UUID.fromString(reportRes.jsonPath().getString("id"));
        UUID chatEvidenceId = db.queryForObject(
                "SELECT id FROM bao_cao_bang_chungs WHERE ma_bao_cao = ? AND loai_bang_chung = 'NHAT_KY_CHAT'",
                UUID.class, reportId
        );

        // NFR-01: Guest (401), reporter (403), reported seller (403), outsider (403), mobile moderator (403) CANNOT access evidence
        for (UUID eid : List.of(imgEvidenceId, chatEvidenceId)) {
            given().get("/api/v1/admin/reports/evidence/" + eid).then().statusCode(401);
            for (String blocked : List.of(reporterToken, sellerToken, outsiderToken, mobileModToken)) {
                given().auth().oauth2(blocked).get("/api/v1/admin/reports/evidence/" + eid).then().statusCode(403);
            }
        }

        // Moderator & Senior Admin on admin-web CAN access both image and chat log snapshot
        given().auth().oauth2(webModToken)
                .get("/api/v1/admin/reports/evidence/" + imgEvidenceId)
                .then().statusCode(200)
                .header("Cache-Control", org.hamcrest.Matchers.containsString("no-store"))
                .header("X-Content-Type-Options", equalTo("nosniff"));

        given().auth().oauth2(webSeniorToken)
                .get("/api/v1/admin/reports/evidence/" + chatEvidenceId)
                .then().statusCode(200)
                .body("conversationId", equalTo(convId.toString()))
                .body("messages[0].content", equalTo("Chuyển khoản trước mới giữ máy nhé"));

        // Moderator queue lists the grouped report
        given().auth().oauth2(webModToken)
                .queryParam("status", "CHO_XU_LY")
                .get("/api/v1/admin/reports/groups")
                .then().statusCode(200)
                .body("items[0].reportCount", equalTo(1));

        // Conflict of interest (UC-37 §4): if reporter is granted moderator role, they still cannot read evidence of their own report
        grantRole(reporter, "KIEM_DUYET_VIEN");
        String reporterWebModToken = login(reporter, "admin-web");
        given().auth().oauth2(reporterWebModToken)
                .get("/api/v1/admin/reports/evidence/" + imgEvidenceId)
                .then().statusCode(403)
                .body("code", equalTo("CONFLICT_OF_INTEREST"));
    }

    @Test
    @DisplayName("Nâng cấp Flyway V12 -> V13 bảo toàn bao_caos cũ và tạo đủ danh mục, nhóm, bằng chứng")
    void upgradesV12ToV13PreservingExistingReports() throws Exception {
        var pg = PostgresTestContainer.getInstance();
        String schema = "p2_06_v13_" + UUID.randomUUID().toString().substring(0, 8);
        try (var conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             var stmt = conn.createStatement()) {
            stmt.execute("CREATE SCHEMA " + schema);
        }
        try {
            var config = Flyway.configure()
                    .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                    .schemas(schema)
                    .defaultSchema(schema);
            config.target("12").load().migrate();

            UUID reporterId = UUID.randomUUID();
            UUID targetId = UUID.randomUUID();
            UUID legacyReportId = UUID.randomUUID();
            try (var conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                 var stmt = conn.createStatement()) {
                stmt.execute("SET search_path TO " + schema);
                stmt.execute("INSERT INTO thanh_viens(user_id,email,mat_khau_hash,ho_ten,mssv,trang_thai_tai_khoan,email_verified,profile_approved) VALUES "
                        + "('" + reporterId + "','r@uit.edu.vn','hash','Reporter','22521001','HOAT_DONG',true,true),"
                        + "('" + targetId + "','t@uit.edu.vn','hash','Target','22521002','HOAT_DONG',true,true)");
                stmt.execute("INSERT INTO bao_caos(ma_bao_cao,nguoi_bao_cao_id,loai_doi_tuong,doi_tuong_id,danh_muc_vi_pham,noi_dung,trang_thai) VALUES "
                        + "('" + legacyReportId + "','" + reporterId + "','NGUOI_DUNG','" + targetId + "','SPAM','Legacy report','CHO_XU_LY')");
            }

            config.target("13").load().migrate();

            try (var conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                 var stmt = conn.createStatement()) {
                stmt.execute("SET search_path TO " + schema);
                try (var rs = stmt.executeQuery("SELECT COUNT(*) FROM danh_muc_bao_caos WHERE hien_thi = TRUE")) {
                    rs.next();
                    assertThat(rs.getInt(1)).isGreaterThanOrEqualTo(11);
                }
                try (var rs = stmt.executeQuery("SELECT ma_nhom_bao_cao, trang_thai FROM bao_caos WHERE ma_bao_cao = '" + legacyReportId + "'")) {
                    assertThat(rs.next()).isTrue();
                    assertThat(rs.getObject("ma_nhom_bao_cao")).isNull();
                    assertThat(rs.getString("trang_thai")).isEqualTo("CHO_XU_LY");
                }
            }
        } finally {
            try (var conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                 var stmt = conn.createStatement()) {
                stmt.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
            }
        }
    }

    private UUID createMember(String status, boolean emailVerified, boolean profileApproved, int reputation) {
        UUID id = UUID.randomUUID();
        String suffix = id.toString().substring(0, 8);
        db.update(
                """
                INSERT INTO thanh_viens(
                    user_id, email, mat_khau_hash, ho_ten, mssv,
                    diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                id, "u" + suffix + "@uit.edu.vn", passwordHash, "SV " + suffix, "22" + suffix,
                reputation, status, emailVerified, profileApproved
        );
        createdUsers.add(id);
        return id;
    }

    private void grantRole(UUID userId, String role) {
        db.update(
                "INSERT INTO vai_tro_quan_tri(id, user_id, loai_vai_tro, bat_dau, trang_thai_hieu_luc) VALUES (?, ?, ?, ?, TRUE)",
                UUID.randomUUID(), userId, role, Timestamp.from(Instant.now().minusSeconds(5))
        );
    }

    private UUID createListing(UUID ownerId, String title, String status, Instant expiresAt) {
        UUID listingId = UUID.randomUUID();
        db.update(
                """
                INSERT INTO tin_dangs(
                    ma_tin, nguoi_dang_id, tieu_de, mo_ta, gia_vnd, hinh_thuc, trang_thai, expires_at
                ) VALUES (?, ?, ?, 'Mô tả test', 50000, 'BAN_LE', ?, ?)
                """,
                listingId, ownerId, title, status, expiresAt != null ? Timestamp.from(expiresAt) : null
        );
        createdListings.add(listingId);
        return listingId;
    }

    private String login(UUID userId, String client) {
        String email = db.queryForObject("SELECT email FROM thanh_viens WHERE user_id = ?", String.class, userId);
        return auth.login(email, PASSWORD, client, "127.0.0.1").token();
    }

    private static byte[] createSamplePng() throws Exception {
        BufferedImage img = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < 8; x++) {
            for (int y = 0; y < 8; y++) {
                img.setRGB(x, y, Color.ORANGE.getRGB());
            }
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", baos);
        return baos.toByteArray();
    }
}
