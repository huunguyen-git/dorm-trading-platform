package com.dormtrading;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import io.restassured.http.ContentType;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

class ReportModerationAndStatisticsIntegrationTest extends BaseIntegrationTest {
    private static final String PASSWORD = "quiet mountains beneath a silver moon";
    @Autowired JdbcTemplate db;
    @Autowired AuthService auth;
    @Autowired PasswordEncoder encoder;

    private final List<UUID> users = new ArrayList<>();
    private final List<UUID> listings = new ArrayList<>();
    private final List<UUID> transactions = new ArrayList<>();
    private final List<UUID> reports = new ArrayList<>();
    private final List<UUID> decisions = new ArrayList<>();
    private final List<String> penalties = new ArrayList<>();

    private String modToken;
    private String seniorToken;
    private UUID modId;
    private UUID seniorId;
    private UUID sellerId;
    private UUID buyerId;

    @BeforeEach
    void setUp() {
        String hash = encoder.encode(PASSWORD);
        String suffix = UUID.randomUUID().toString().substring(0, 6);
        modId = createUser("mod.p306." + suffix + "@gm.uit.edu.vn", "2352" + suffix.substring(0, 4), "Kiểm duyệt viên P306", 100, hash);
        seniorId = createUser("senior.p306." + suffix + "@gm.uit.edu.vn", "2353" + suffix.substring(0, 4), "Quản trị cấp cao P306", 100, hash);
        sellerId = createUser("seller.p306." + suffix + "@gm.uit.edu.vn", "2354" + suffix.substring(0, 4), "Người bán P306", 60, hash);
        buyerId = createUser("buyer.p306." + suffix + "@gm.uit.edu.vn", "2355" + suffix.substring(0, 4), "Người mua P306", 90, hash);

        grantRole(modId, "KIEM_DUYET_VIEN", seniorId);
        grantRole(seniorId, "QUAN_TRI_VIEN_CAP_CAO", seniorId);

        modToken = login("mod.p306." + suffix + "@gm.uit.edu.vn");
        seniorToken = login("senior.p306." + suffix + "@gm.uit.edu.vn");
    }

    @AfterEach
    void tearDown() {
        for (UUID tx : transactions) db.update("DELETE FROM giao_dichs WHERE ma_giao_dich = ?", tx);
        for (UUID rep : reports) db.update("UPDATE bao_caos SET quyet_dinh_id = NULL WHERE ma_bao_cao = ?", rep);
        for (int i = decisions.size() - 1; i >= 0; i--) {
            db.update("DELETE FROM quyet_dinhs WHERE ma_quyet_dinh = ?", decisions.get(i));
        }
        for (UUID rep : reports) db.update("DELETE FROM bao_caos WHERE ma_bao_cao = ?", rep);
        for (UUID lst : listings) db.update("DELETE FROM tin_dangs WHERE ma_tin = ?", lst);
        for (String p : penalties) db.update("DELETE FROM thang_phats WHERE ma_thang_phat = ?", p);
        for (UUID u : users) {
            db.update("DELETE FROM lich_su_diem_uy_tin WHERE user_id = ?", u);
            db.update("DELETE FROM auth_refresh WHERE session_id IN (SELECT id FROM auth_session WHERE user_id = ?)", u);
            db.update("DELETE FROM auth_session WHERE user_id = ?", u);
            db.update("DELETE FROM auth_login_guard WHERE email = (SELECT email FROM thanh_viens WHERE user_id = ?)", u);
            db.update("DELETE FROM vai_tro_quan_tri WHERE user_id = ?", u);
            db.update("DELETE FROM thanh_viens WHERE user_id = ?", u);
        }
    }

    @Test
    void uc37ModeratesReportGroupDeductsReputationOnceAndBlocksConflictOfInterest() {
        String penaltyCode = "P306_SPAM_" + UUID.randomUUID().toString().substring(0, 6);
        penalties.add(penaltyCode);
        db.update("INSERT INTO thang_phats(ma_thang_phat, ten, diem_tru, mo_ta, trang_thai) VALUES (?, ?, 15, ?, 'DANG_DUNG')",
                penaltyCode, "Spam P306 " + penaltyCode, "Vi phạm đăng tin rác");

        UUID listingId = createListing(sellerId, "Giáo trình Giải tích 1", "MA001", "Giải tích 1", 0, "CHO_TANG");
        UUID rep1 = createReport(buyerId, "TIN_DANG", listingId, "SPAM", "Đăng lặp nhiều lần");
        UUID rep2 = createReport(seniorId, "TIN_DANG", listingId, "SPAM", "Nội dung rác");

        UUID ownReportListing = createListing(sellerId, "Tin có xung đột", "IT001", "Nhập môn", 50000, "BAN_LE");
        createReport(modId, "TIN_DANG", ownReportListing, "SPAM", "Tự báo cáo");

        // Conflict of interest: ownReportListing is excluded from list and blocked on detail
        given().auth().oauth2(modToken)
                .when().get("/api/v1/admin/reports/groups?status=CHO_XU_LY")
                .then().statusCode(200)
                .body("items.targetId", hasItem(listingId.toString()))
                .body("items.targetId", not(hasItem(ownReportListing.toString())));

        given().auth().oauth2(modToken)
                .queryParam("targetType", "TIN_DANG")
                .queryParam("targetId", ownReportListing.toString())
                .queryParam("category", "SPAM")
                .when().get("/api/v1/admin/reports/groups/detail")
                .then().statusCode(403)
                .body("code", equalTo("CONFLICT_OF_INTEREST"));

        // Resolve VI_PHAM
        String decisionId = given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", listingId.toString(),
                        "category", "SPAM",
                        "conclusion", "VI_PHAM",
                        "penaltyId", penaltyCode,
                        "basis", "Xác nhận spam nhiều lần"))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(200)
                .body("updatedReportCount", equalTo(2))
                .body("penaltyApplied", equalTo(true))
                .body("scoreAfter", equalTo(45))
                .body("accountStatusAfter", equalTo("BI_KHOA"))
                .body("listingHidden", equalTo(true))
                .extract().path("decisionId");
        decisions.add(UUID.fromString(decisionId));

        // Second resolve attempt -> 409 conflict
        given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", listingId.toString(),
                        "category", "SPAM",
                        "conclusion", "KHONG_VI_PHAM",
                        "basis", "Thử xử lý lại"))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(409)
                .body("code", equalTo("REPORT_GROUP_ALREADY_PROCESSED"));

        // Verify both reports updated and listing hidden
        Integer resolved = db.queryForObject(
                "SELECT count(*) FROM bao_caos WHERE ma_bao_cao IN (?, ?) AND trang_thai = 'DA_XU_LY'",
                Integer.class, rep1, rep2);
        assertThat(resolved).isEqualTo(2);

        // Non-violation & duplicate conclusions
        UUID cleanListing = createListing(sellerId, "Giáo trình sạch", "MA002", "Đại số tuyến tính", 30000, "BAN_LE");
        createReport(buyerId, "TIN_DANG", cleanListing, "KHAC", "Báo cáo nhầm");
        String cleanDecisionId = given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", cleanListing.toString(),
                        "category", "KHAC",
                        "conclusion", "KHONG_VI_PHAM",
                        "basis", "Tin đăng hợp lệ"))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(200)
                .body("penaltyApplied", equalTo(false))
                .body("listingHidden", equalTo(false))
                .extract().path("decisionId");
        decisions.add(UUID.fromString(cleanDecisionId));

        UUID dupListing = createListing(sellerId, "Tin trùng lặp", "MA003", "Xác suất thống kê", 25000, "BAN_LE");
        createReport(buyerId, "TIN_DANG", dupListing, "SPAM", "Trùng với quyết định trước");
        given().auth().oauth2(modToken)
                .when().get("/api/v1/admin/reports/duplicate-candidates")
                .then().statusCode(200)
                .body("decisionId", hasItem(decisionId));

        String dupDecisionId = given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", dupListing.toString(),
                        "category", "SPAM",
                        "conclusion", "TRUNG",
                        "originalDecisionId", decisionId,
                        "basis", "Trùng nhóm đã xử lý trước đó"))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(200)
                .body("penaltyApplied", equalTo(false))
                .extract().path("decisionId");
        decisions.add(UUID.fromString(dupDecisionId));
        assertThat(db.queryForObject("SELECT quyet_dinh_goc_id FROM quyet_dinhs WHERE ma_quyet_dinh = ?", UUID.class, UUID.fromString(dupDecisionId)))
                .isEqualTo(UUID.fromString(decisionId));

        // Re-resolving already processed group returns 409 conflict
        given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", dupListing.toString(),
                        "category", "SPAM",
                        "conclusion", "KHONG_HOP_LE",
                        "basis", "Thử xử lý lại"))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(409)
                .body("code", equalTo("REPORT_GROUP_ALREADY_PROCESSED"));
    }

    @Test
    void uc38StatisticsEnforcesSeniorRoleAndAggregatesSemesterData() {
        // Moderator forbidden on senior statistics
        given().auth().oauth2(modToken)
                .when().get("/api/v1/admin/senior/statistics/top-subjects")
                .then().statusCode(403);

        given().auth().oauth2(seniorToken)
                .when().get("/api/v1/admin/senior/statistics/semesters")
                .then().statusCode(200)
                .body("code", not(empty()));

        UUID freeListing = createListing(sellerId, "Tài liệu OOP 0đ", "IT002", "Lập trình HĐT", 0, "CHO_TANG");
        UUID paidListing = createListing(sellerId, "Giáo trình CTDL", "IT003", "Cấu trúc dữ liệu", 45000, "BAN_LE");
        Instant now = Instant.now();
        createCompletedTx(freeListing, sellerId, buyerId, 0, now);
        createCompletedTx(paidListing, sellerId, buyerId, 45000, now);

        given().auth().oauth2(seniorToken)
                .when().get("/api/v1/admin/senior/statistics/zero-price")
                .then().statusCode(200)
                .body("totalCompleted", greaterThanOrEqualTo(2))
                .body("zeroPriceCount", greaterThanOrEqualTo(1));

        given().auth().oauth2(seniorToken)
                .when().get("/api/v1/admin/senior/statistics/top-subjects")
                .then().statusCode(200)
                .body("items.subjectCode", hasItem("IT002"));

        given().auth().oauth2(seniorToken)
                .when().get("/api/v1/admin/senior/statistics/category-location")
                .then().statusCode(200)
                .body("byCategory", not(empty()))
                .body("byLocation", hasSize(9));

        given().auth().oauth2(seniorToken)
                .queryParam("maxScore", 65)
                .when().get("/api/v1/admin/senior/statistics/low-reputation-disputes")
                .then().statusCode(200)
                .body("items.userId", hasItem(sellerId.toString()));
    }

    private UUID createUser(String email, String mssv, String name, int score, String hash) {
        UUID id = UUID.randomUUID();
        users.add(id);
        db.update("INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, diem_uy_tin, " +
                        "trang_thai_tai_khoan, email_verified, profile_approved) " +
                        "VALUES (?, ?, ?, ?, ?, ?, 'HOAT_DONG', TRUE, TRUE)",
                id, email, hash, name, mssv, score);
        return id;
    }

    private void grantRole(UUID userId, String role, UUID actor) {
        db.update("INSERT INTO vai_tro_quan_tri(user_id, loai_vai_tro, bat_dau) VALUES (?, ?, ?)",
                userId, role, Timestamp.from(Instant.now().minusSeconds(60)));
    }

    private String login(String email) {
        UUID id = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email);
        return auth.login(email, PASSWORD, "admin-web", id.toString()).token();
    }

    private UUID createListing(UUID owner, String title, String subjectCode, String subjectName, long price, String type) {
        UUID id = UUID.randomUUID();
        listings.add(id);
        db.update("INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, ma_danh_muc, ma_khu_vuc, tieu_de, mo_ta, " +
                        "gia_vnd, hinh_thuc, tinh_trang, ma_mon_hoc, ten_mon_hoc, trang_thai) " +
                        "VALUES (?, ?, 'GIAO_TRINH', 'KTX_KHU_A', ?, 'Mô tả test', ?, ?, 'CON_MOI', ?, ?, 'CONG_KHAI')",
                id, owner, title, price, type, subjectCode, subjectName);
        return id;
    }

    private UUID createReport(UUID reporter, String type, UUID targetId, String category, String content) {
        UUID id = UUID.randomUUID();
        reports.add(id);
        db.update("INSERT INTO bao_caos(ma_bao_cao, nguoi_bao_cao_id, loai_doi_tuong, doi_tuong_id, " +
                        "danh_muc_vi_pham, noi_dung, trang_thai) VALUES (?, ?, ?, ?, ?, ?, 'CHO_XU_LY')",
                id, reporter, type, targetId, category, content);
        return id;
    }

    private void createCompletedTx(UUID listingId, UUID seller, UUID buyer, int price, Instant at) {
        UUID id = UUID.randomUUID();
        transactions.add(id);
        db.update("INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai, thoi_diem_tao, thoi_diem_hoan_tat) " +
                        "VALUES (?, ?, ?, ?, ?, 'HOAN_TAT', ?, ?)",
                id, listingId, seller, buyer, price, Timestamp.from(at), Timestamp.from(at));
    }
}
