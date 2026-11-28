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
        // Quyết định sinh qua API resolve không được theo dõi riêng; xoá theo báo cáo, đi ngược thời gian
        // để liên kết quyet_dinhs.ma_bao_cao không chặn DELETE FROM bao_caos.
        for (int i = reports.size() - 1; i >= 0; i--) {
            UUID rep = reports.get(i);
            db.update("DELETE FROM quyet_dinhs WHERE ma_bao_cao = ?", rep);
            db.update("DELETE FROM bao_caos WHERE ma_bao_cao = ?", rep);
        }
        for (int i = decisions.size() - 1; i >= 0; i--) {
            db.update("DELETE FROM quyet_dinhs WHERE ma_quyet_dinh = ?", decisions.get(i));
        }
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

        // Shared singleton container: other ITs seed listings/txs, so the default top-10
        // window can push our subject out. Request the widest page instead of assuming rank.
        given().auth().oauth2(seniorToken)
                .queryParam("limit", 50)
                .when().get("/api/v1/admin/senior/statistics/top-subjects")
                .then().statusCode(200)
                .body("items.subjectCode", hasItem("IT002"));

        given().auth().oauth2(seniorToken)
                .when().get("/api/v1/admin/senior/statistics/category-location")
                .then().statusCode(200)
                .body("byCategory", not(empty()))
                .body("byLocation", hasSize(9));

        // Same reason: score ASC + size 20 hides our seller behind rows left by other ITs.
        // Walk the pages the endpoint actually reports instead of assuming a rank.
        // ponytail: ceiling is 5 pages x 100; upgrade when the endpoint gains a userId filter.
        List<String> lowRepIds = new ArrayList<>();
        long lowRepTotal = 0;
        for (int page = 0; page < 5; page++) {
            var extracted = given().auth().oauth2(seniorToken)
                    .queryParam("maxScore", 65)
                    .queryParam("size", 100)
                    .queryParam("page", page)
                    .when().get("/api/v1/admin/senior/statistics/low-reputation-disputes")
                    .then().statusCode(200).extract();
            lowRepTotal = ((Number) extracted.path("total")).longValue();
            lowRepIds.addAll(extracted.path("items.userId"));
            if (lowRepIds.size() >= lowRepTotal) {
                break;
            }
        }
        assertThat(lowRepTotal).isGreaterThan(0);
        assertThat(lowRepIds).contains(sellerId.toString());
    }

    @Test
    void statisticsCountDisputesFromDisputeStatusAndExcludePendingAccounts() {
        // UC-29: tranh chấp la giao dich CHO_XU_LY; schema khong co gia tri 'TRANH_CHAP'.
        UUID disputeListing = createListing(sellerId, "Tin tranh cham P306", "IT007", "Thuong mai dien tu", 10000, "BAN_LE");
        createTx(disputeListing, sellerId, buyerId, 10000, "CHO_XU_LY");

        // TAI KHOAN CHO_KICH_HOAT (diem mac dinh) khong duoc xuat hien trong bang theo doi.
        String suffix = UUID.randomUUID().toString().substring(0, 6);
        UUID pendingId = createUser("pending.p306." + suffix + "@gm.uit.edu.vn", "2356" + suffix.substring(0, 4),
                "Tai khoan cho kich hoat P306", 10, encoder.encode(PASSWORD), "CHO_KICH_HOAT");

        Map<String, Map<String, Object>> rows = lowReputationRows(65, 0);
        assertThat(rows).containsKey(sellerId.toString());
        assertThat(((Number) rows.get(sellerId.toString()).get("disputeCount")).longValue())
                .isGreaterThanOrEqualTo(1L);
        assertThat(rows).doesNotContainKey(pendingId.toString());
        assertThat(rows.values()).allMatch(row -> !"CHO_KICH_HOAT".equals(row.get("accountStatus")));
    }

    @Test
    void statisticsViolationCountCountsDistinctDecisionsNotReports() {
        String penaltyCode = "P306_VCN_" + UUID.randomUUID().toString().substring(0, 6);
        penalties.add(penaltyCode);
        db.update("INSERT INTO thang_phats(ma_thang_phat, ten, diem_tru, mo_ta, trang_thai) VALUES (?, ?, 5, ?, 'DANG_DUNG')",
                penaltyCode, "Nhieu bao cao mot quyet dinh " + penaltyCode, "Test FR-16");

        // Hai bao cao cung nhom (nguoi dung + danh muc) => mot quyet dinh VI_PHAM => violationCount = 1.
        UUID otherReporter = createUser("rep2.p306." + UUID.randomUUID().toString().substring(0, 8) + "@gm.uit.edu.vn",
                "2357" + UUID.randomUUID().toString().substring(0, 4), "Nguoi bao cao P306", 95, encoder.encode(PASSWORD));
        createReport(buyerId, "NGUOI_DUNG", sellerId, "GIAN_LAN", "Ban hang khong dat");
        createReport(otherReporter, "NGUOI_DUNG", sellerId, "GIAN_LAN", "Giao dich khong minh bach");

        given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "NGUOI_DUNG",
                        "targetId", sellerId.toString(),
                        "category", "GIAN_LAN",
                        "conclusion", "VI_PHAM",
                        "penaltyId", penaltyCode,
                        "basis", "Hai bao cao gộp chung mot quyet dinh"))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(200)
                .body("updatedReportCount", equalTo(2))
                .extract().path("decisionId");

        Map<String, Object> sellerRow = lowReputationRows(65, 0).get(sellerId.toString());
        assertThat(sellerRow).isNotNull();
        assertThat(((Number) sellerRow.get("violationCount")).longValue()).isEqualTo(1L);
    }

    @Test
    void duplicateCandidatesAreOrderedByDecisionTime() {
        // Quyet dinh cu chen truc tiep voi thoi diem qua khu; neu sach nguyen loi sap xep theo UUID,
        // phan hoi khong giam dan theo thoi_diem va test nay do loi.
        UUID oldListing = createListing(sellerId, "Tin cu P306", "IT008", "Quan tri hoc", 5000, "BAN_LE");
        UUID oldReport = createReport(buyerId, "TIN_DANG", oldListing, "SPAM", "Bao cao cu");
        insertDecision(modId, oldReport, "KHONG_VI_PHAM", "Quyet dinh cu", Instant.now().minusSeconds(86_400 * 30));

        UUID newListing = createListing(sellerId, "Tin moi P306", "IT009", "Luat kinh te", 7000, "BAN_LE");
        createReport(buyerId, "TIN_DANG", newListing, "SPAM", "Bao cao moi");
        String newDecisionId = given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", newListing.toString(),
                        "category", "SPAM",
                        "conclusion", "KHONG_VI_PHAM",
                        "basis", "Quyet dinh moi"))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(200)
                .extract().path("decisionId");

        List<String> times = given().auth().oauth2(modToken)
                .when().get("/api/v1/admin/reports/duplicate-candidates")
                .then().statusCode(200)
                .body("decisionId", hasItem(newDecisionId))
                .extract().jsonPath().getList("decidedAt");
        assertThat(times).hasSizeGreaterThanOrEqualTo(2)
                .isSortedAccordingTo(Comparator.comparing(Instant::parse).reversed());
    }

    @Test
    void resolveRejectsBasisOverLedgerLimitAndStrayPenaltyOnDuplicate() {
        UUID listingId = createListing(sellerId, "Tin can cu dai P306", "IT010", "Tai chinh", 12000, "BAN_LE");
        createReport(buyerId, "TIN_DANG", listingId, "SPAM", "Can cu vuot nguong");
        String penaltyCode = "P306_LONG_" + UUID.randomUUID().toString().substring(0, 6);
        penalties.add(penaltyCode);
        db.update("INSERT INTO thang_phats(ma_thang_phat, ten, diem_tru, mo_ta, trang_thai) VALUES (?, ?, 3, ?, 'DANG_DUNG')",
                penaltyCode, "Can cu dai " + penaltyCode, "Test 1000 ky tu");

        // 1001 ky tu: ledger choi ly do >1000 nen API phai tra 400 chu khong phai 500.
        given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", listingId.toString(),
                        "category", "SPAM",
                        "conclusion", "VI_PHAM",
                        "penaltyId", penaltyCode,
                        "basis", "x".repeat(1001)))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(400)
                .body("message", containsString("1000"));

        // Ket luan TRUNG khong duoc mang penaltyId.
        given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", listingId.toString(),
                        "category", "SPAM",
                        "conclusion", "TRUNG",
                        "penaltyId", penaltyCode,
                        "originalDecisionId", UUID.randomUUID().toString()))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(400)
                .body("message", containsString("mức phạt"));
    }

    @Test
    void resolveTrungRejectsOriginalThatIsNotAReportDecision() {
        UUID listingId = createListing(sellerId, "Tin trung goc khac P306", "IT011", "Ke toan", 9000, "BAN_LE");
        createReport(buyerId, "TIN_DANG", listingId, "SPAM", "Trung voi quyet dinh ngoai bao cao");

        // Quyet dinh khong gan ma_bao_cao (khong phai ket luan bao cao) phai bi tu choi.
        UUID foreignDecision = UUID.randomUUID();
        decisions.add(foreignDecision);
        db.update("INSERT INTO quyet_dinhs(ma_quyet_dinh, nguoi_ra_quyet_dinh_id, ket_luan, can_cu, thoi_diem) " +
                        "VALUES (?, ?, 'VI_PHAM', 'Quyết định khiếu nại', ?)",
                foreignDecision, seniorId, Timestamp.from(Instant.now()));

        given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", listingId.toString(),
                        "category", "SPAM",
                        "conclusion", "TRUNG",
                        "originalDecisionId", foreignDecision.toString(),
                        "basis", "Liên kết sai loại quyết định"))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(404);

        // Quyet dinh goc da la TRUNG -> khong duoc de quy lien ket.
        UUID baseListing = createListing(sellerId, "Tin goc P306", "IT012", "Kiểm toán", 4000, "BAN_LE");
        UUID baseReport = createReport(buyerId, "TIN_DANG", baseListing, "SPAM", "Bao cao goc");
        UUID baseDecision = insertDecision(modId, baseReport, "KHONG_VI_PHAM", "Goc hop le", Instant.now().minusSeconds(60));
        UUID nestedListing = createListing(sellerId, "Tin trung cua trung P306", "IT013", "Thue", 3000, "BAN_LE");
        createReport(buyerId, "TIN_DANG", nestedListing, "SPAM", "Bao cao trung cap hai");
        String nestedDecision = given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", nestedListing.toString(),
                        "category", "SPAM",
                        "conclusion", "TRUNG",
                        "originalDecisionId", baseDecision.toString()))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(200)
                .extract().path("decisionId");

        UUID thirdListing = createListing(sellerId, "Tin trung cap ba P306", "IT014", "Tai chinh", 2000, "BAN_LE");
        createReport(buyerId, "TIN_DANG", thirdListing, "SPAM", "Khong duoc tro toi TRUNG");
        given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", thirdListing.toString(),
                        "category", "SPAM",
                        "conclusion", "TRUNG",
                        "originalDecisionId", nestedDecision))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(400)
                .body("message", containsString("Trùng"));
    }

    @Test
    void resolveViPhamDoesNotOverwriteTerminalListingStatus() {
        String penaltyCode = "P306_TERM_" + UUID.randomUUID().toString().substring(0, 6);
        penalties.add(penaltyCode);
        db.update("INSERT INTO thang_phats(ma_thang_phat, ten, diem_tru, mo_ta, trang_thai) VALUES (?, ?, 4, ?, 'DANG_DUNG')",
                penaltyCode, "An tin ket thuc " + penaltyCode, "Test trang thai dong");

        // KET_THUC: trang thai dong cua giao dich HOAN_TAT; chuyen sang AN se khoi dong lai lien ket do vat.
        UUID closedListing = createListing(sellerId, "Tin ket thuc P306", "IT015", "Logistic", 8000, "BAN_LE",
                "KET_THUC", null);
        createCompletedTx(closedListing, sellerId, buyerId, 8000, Instant.now());
        createReport(buyerId, "TIN_DANG", closedListing, "GIAN_LAN", "Tin da ket thuc van bi bao cao");
        given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", closedListing.toString(),
                        "category", "GIAN_LAN",
                        "conclusion", "VI_PHAM",
                        "penaltyId", penaltyCode,
                        "basis", "Vi pham nhung tin da dong"))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(200)
                .body("penaltyApplied", equalTo(true))
                .body("listingHidden", equalTo(false));
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, closedListing))
                .isEqualTo("KET_THUC");

        // GIU_CHO: con giao dich dang chay, van phai an theo UC-37 buoc 9.
        UUID heldListing = createListing(sellerId, "Tin giu cho P306", "IT016", "Phap luat", 6000, "BAN_LE",
                "GIU_CHO", null);
        createTx(heldListing, sellerId, buyerId, 6000, "GIU_CHO");
        createReport(buyerId, "TIN_DANG", heldListing, "GIAN_LAN", "Tin dang giu cho vi pham");
        given().auth().oauth2(modToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "TIN_DANG",
                        "targetId", heldListing.toString(),
                        "category", "GIAN_LAN",
                        "conclusion", "VI_PHAM",
                        "penaltyId", penaltyCode,
                        "basis", "An tin dang giu cho"))
                .when().post("/api/v1/admin/reports/groups/resolve")
                .then().statusCode(200)
                .body("listingHidden", equalTo(true));
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, heldListing))
                .isEqualTo("AN");
    }

    @Test
    void groupDetailSelectsTheRequestedDecisionWhenGroupWasResolvedTwice() {
        UUID firstListing = createListing(sellerId, "Nhom bao cao hai lan mot", "IT017", "An toan thong tin", 11000, "BAN_LE");
        UUID firstReport = createReport(buyerId, "TIN_DANG", firstListing, "KHAC", "Dot bao cao thu nhat");
        UUID firstDecision = insertDecision(modId, firstReport, "KHONG_VI_PHAM", "Quyết định đợt một", Instant.now().minusSeconds(3600));

        UUID secondReport = createReport(buyerId, "TIN_DANG", firstListing, "KHAC", "Dot bao cao thu hai");
        UUID secondDecision = insertDecision(modId, secondReport, "VI_PHAM", "Quyết định đợt hai", Instant.now());

        // Danh sach DA_XU_LY tách hai dong cho cung mot nhom; moi dong phai mang decisionId rieng.
        List<Map<String, Object>> rows = given().auth().oauth2(modToken)
                .queryParam("status", "DA_XU_LY")
                .queryParam("targetType", "TIN_DANG")
                .queryParam("q", "Nhom bao cao hai lan")
                .when().get("/api/v1/admin/reports/groups")
                .then().statusCode(200)
                .extract().jsonPath().getList("items").stream()
                .<Map<String, Object>>map(item -> (Map<String, Object>) item)
                .toList();
        List<Map<String, Object>> groupRows = rows.stream()
                .filter(row -> firstListing.toString().equals(row.get("targetId")))
                .toList();
        assertThat(groupRows).hasSize(2);
        assertThat(groupRows).extracting(row -> String.valueOf(row.get("decisionId")))
                .containsExactlyInAnyOrder(firstDecision.toString(), secondDecision.toString());

        // Chi tiết phải trả đúng quyết định được chọn, không phai quyet dinh moi nhat.
        given().auth().oauth2(modToken)
                .queryParam("targetType", "TIN_DANG")
                .queryParam("targetId", firstListing.toString())
                .queryParam("category", "KHAC")
                .queryParam("status", "DA_XU_LY")
                .queryParam("decisionId", firstDecision.toString())
                .when().get("/api/v1/admin/reports/groups/detail")
                .then().statusCode(200)
                .body("decision.decisionId", equalTo(firstDecision.toString()))
                .body("decision.basis", equalTo("Quyết định đợt một"))
                .body("reports.reportId", everyItem(equalTo(firstReport.toString())));

        given().auth().oauth2(modToken)
                .queryParam("targetType", "TIN_DANG")
                .queryParam("targetId", firstListing.toString())
                .queryParam("category", "KHAC")
                .queryParam("status", "DA_XU_LY")
                .queryParam("decisionId", secondDecision.toString())
                .when().get("/api/v1/admin/reports/groups/detail")
                .then().statusCode(200)
                .body("decision.decisionId", equalTo(secondDecision.toString()))
                .body("decision.basis", equalTo("Quyết định đợt hai"));
    }

    @Test
    void seniorAdminCanOpenReportQueueOnBackend() {
        // QUAN_TRI_VIEN_CAP_CAO duoc cap ca SENIOR_ADMIN va MODERATOR (AuthService) nen phai doc duoc hang doi bao cao.
        given().auth().oauth2(seniorToken)
                .when().get("/api/v1/admin/reports/groups?status=CHO_XU_LY")
                .then().statusCode(200)
                .body("items", notNullValue());

        given().auth().oauth2(seniorToken)
                .when().get("/api/v1/admin/reports/penalties")
                .then().statusCode(200);

        given().auth().oauth2(seniorToken)
                .when().get("/api/v1/admin/reports/duplicate-candidates")
                .then().statusCode(200);
    }

    private Map<String, Map<String, Object>> lowReputationRows(int maxScore, int minDisputes) {
        Map<String, Map<String, Object>> byUser = new HashMap<>();
        // Shared singleton container: other ITs seed rows, so walk every page instead of assuming rank.
        long total = 0;
        for (int page = 0; page < 5; page++) {
            var extracted = given().auth().oauth2(seniorToken)
                    .queryParam("maxScore", maxScore)
                    .queryParam("minDisputes", minDisputes)
                    .queryParam("size", 100)
                    .queryParam("page", page)
                    .when().get("/api/v1/admin/senior/statistics/low-reputation-disputes")
                    .then().statusCode(200).extract();
            total = ((Number) extracted.path("total")).longValue();
            for (Map<String, Object> row : extracted.jsonPath().getList("items", Map.class)) {
                byUser.put(String.valueOf(row.get("userId")), row);
            }
            if (byUser.size() >= total) {
                break;
            }
        }
        return byUser;
    }

    private UUID createUser(String email, String mssv, String name, int score, String hash) {
        return createUser(email, mssv, name, score, hash, "HOAT_DONG");
    }

    private UUID createUser(String email, String mssv, String name, int score, String hash, String accountStatus) {
        UUID id = UUID.randomUUID();
        users.add(id);
        db.update("INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, diem_uy_tin, " +
                        "trang_thai_tai_khoan, email_verified, profile_approved) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, TRUE)",
                id, email, hash, name, mssv, score, accountStatus);
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

    private UUID createListing(UUID owner, String title, String subjectCode, String subjectName, long price,
                               String type, String status, Instant expiresAt) {
        UUID id = UUID.randomUUID();
        listings.add(id);
        db.update("INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, ma_danh_muc, ma_khu_vuc, tieu_de, mo_ta, " +
                        "gia_vnd, hinh_thuc, tinh_trang, ma_mon_hoc, ten_mon_hoc, trang_thai, published_at, expires_at) " +
                        "VALUES (?, ?, 'GIAO_TRINH', 'KTX_KHU_A', ?, 'Mô tả test', ?, ?, 'CON_MOI', ?, ?, ?, ?, ?)",
                id, owner, title, price, type, subjectCode, subjectName, status,
                Timestamp.from(Instant.now()), expiresAt == null ? null : Timestamp.from(expiresAt));
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

    /** UC-29: giao dich tranh chap luu o trang thai CHO_XU_LY (schema khong co gia tri 'TRANH_CHAP'). */
    private void createTx(UUID listingId, UUID seller, UUID buyer, int price, String status) {
        UUID id = UUID.randomUUID();
        transactions.add(id);
        db.update("INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai, thoi_diem_tao) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                id, listingId, seller, buyer, price, status, Timestamp.from(Instant.now()));
    }

    /** Chèn quyết định trực tiếp bằng SQL cho các ca test ràng buộc liên kết / thứ tự thời gian. */
    private UUID insertDecision(UUID moderator, UUID reportId, String conclusion, String basis, Instant at) {
        UUID id = UUID.randomUUID();
        decisions.add(id);
        db.update("INSERT INTO quyet_dinhs(ma_quyet_dinh, nguoi_ra_quyet_dinh_id, ma_bao_cao, ket_luan, can_cu, thoi_diem) " +
                        "VALUES (?, ?, ?, ?, ?, ?)",
                id, moderator, reportId, conclusion, basis, Timestamp.from(at));
        db.update("UPDATE bao_caos SET trang_thai = 'DA_XU_LY', nguoi_xu_ly_id = ?, quyet_dinh_id = ? WHERE ma_bao_cao = ?",
                moderator, id, reportId);
        return id;
    }
}
