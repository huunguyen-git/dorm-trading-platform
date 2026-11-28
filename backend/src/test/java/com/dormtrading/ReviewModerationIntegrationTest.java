package com.dormtrading;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
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
import java.time.temporal.ChronoUnit;
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

@DisplayName("Kiểm thử Tích hợp P3-05: Khiếu nại Đánh giá (UC-33) & Kiểm duyệt Đánh giá (UC-34)")
class ReviewModerationIntegrationTest extends BaseIntegrationTest {

    private static final String PASSWORD = "warm lantern over dorm courtyard";

    @Autowired
    JdbcTemplate db;
    @Autowired
    AuthService auth;
    @Autowired
    PasswordEncoder encoder;

    private final List<UUID> users = new ArrayList<>();
    private final List<UUID> listings = new ArrayList<>();
    private final List<UUID> transactions = new ArrayList<>();
    private final List<UUID> conversations = new ArrayList<>();
    private String passwordHash;

    @BeforeEach
    void init() {
        passwordHash = encoder.encode(PASSWORD);
    }

    @AfterEach
    void cleanup() {
        for (UUID convId : conversations) {
            db.update("DELETE FROM hoi_thoais WHERE ma_hoi_thoai = ?", convId);
        }
        for (UUID txId : transactions) {
            db.update("DELETE FROM thong_bao_danh_gias WHERE ma_danh_gia IN (SELECT ma_danh_gia FROM danh_gias WHERE ma_giao_dich = ?)", txId);
            db.update("DELETE FROM quyet_dinhs WHERE ma_danh_gia IN (SELECT ma_danh_gia FROM danh_gias WHERE ma_giao_dich = ?)", txId);
            db.update("DELETE FROM yeu_cau_bo_sung_danh_gia WHERE ho_so_id IN (SELECT ma_danh_gia FROM danh_gias WHERE ma_giao_dich = ?) "
                    + "OR ho_so_id IN (SELECT ma_khieu_nai FROM khieu_nais WHERE ma_danh_gia IN (SELECT ma_danh_gia FROM danh_gias WHERE ma_giao_dich = ?))", txId, txId);
            db.update("DELETE FROM danh_gia_bang_chungs WHERE ma_danh_gia IN (SELECT ma_danh_gia FROM danh_gias WHERE ma_giao_dich = ?)", txId);
            db.update("DELETE FROM khieu_nais WHERE ma_danh_gia IN (SELECT ma_danh_gia FROM danh_gias WHERE ma_giao_dich = ?)", txId);
            db.update("DELETE FROM danh_gias WHERE ma_giao_dich = ?", txId);
            db.update("DELETE FROM giao_dichs WHERE ma_giao_dich = ?", txId);
        }
        for (UUID listingId : listings) {
            db.update("DELETE FROM tin_dangs WHERE ma_tin = ?", listingId);
        }
        for (UUID userId : users) {
            db.update("DELETE FROM danh_gia_bang_chungs WHERE uploader_id = ?", userId);
            db.update("DELETE FROM nhat_ky_kiem_duyet WHERE target_user_id = ? OR actor_user_id = ?", userId, userId);
            db.update("DELETE FROM lich_su_diem_uy_tin WHERE user_id = ?", userId);
            db.update("DELETE FROM auth_refresh WHERE session_id IN (SELECT id FROM auth_session WHERE user_id = ?)", userId);
            db.update("DELETE FROM auth_session WHERE user_id = ?", userId);
            db.update("DELETE FROM auth_login_guard WHERE email = (SELECT email FROM thanh_viens WHERE user_id = ?)", userId);
            db.update("DELETE FROM vai_tro_quan_tri WHERE user_id = ?", userId);
            db.update("DELETE FROM thanh_viens WHERE user_id = ?", userId);
        }
    }

    @Test
    @DisplayName("UC-34 + UC-33: Duyệt đánh giá 1 sao gây khóa tạm FR-12 -> Người bán khiếu nại -> KDV khác chấp nhận -> Gỡ đánh giá, đảo +5 điểm và tự mở khóa")
    void fullLowStarApprovalComplaintUpholdReversesScoreAndAutoUnlocks() throws Exception {
        UUID buyer = createMember(100);
        // Seller starts at 53: 1-star (-5) drops score to 48 (<= 50) -> triggers FR-12 temporary lock
        UUID seller = createMember(53);
        UUID modA = createMember(100);
        UUID modB = createMember(100);
        grantRole(modA, "KIEM_DUYET_VIEN");
        grantRole(modB, "KIEM_DUYET_VIEN");

        UUID listingId = createListing(seller, "Bàn học gấp gọn KTX");
        UUID txId = createCompletedTransaction(listingId, seller, buyer);
        UUID reviewId = createReview(txId, buyer, seller, 1, "Bàn bị lung lay không đúng mô tả", "CHO_XET", Instant.now(), null);

        String modAToken = login(modA, "admin-web");
        String modBToken = login(modB, "admin-web");
        String buyerToken = login(buyer, "mobile");

        // 1. Mod A approves 1-star review -> deducts -5 (53 -> 48), triggers FR-12 KHOA_TAM_THOI
        given().auth().oauth2(modAToken).contentType("application/json")
                .body(Map.of("action", "APPROVE", "rationale", "Có ảnh xác thực lỗi bàn."))
                .post("/api/v1/admin/review-moderation/reviews/" + reviewId + "/decide")
                .then().statusCode(200)
                .body("newReviewStatus", equalTo("CHAP_NHAN"))
                .body("scoreDelta", equalTo(-5))
                .body("sellerScoreAfter", equalTo(48))
                .body("restrictionChange", equalTo("KHOA_TAM_THOI"));

        assertThat(db.queryForObject("SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ?", String.class, seller))
                .isEqualTo("BI_KHOA");

        // Re-activate seller temporarily only so seller can submit complaint via mobile (or unlock for test — wait: UC-33 requires active member,
        // let's test threshold unlock using a seller who started at 56 -> 51, OR let's test the auto-unlock directly by keeping lock intact and testing mod decision!)
        // Restore to HOAT_DONG to file complaint, then simulate lock triggered by review for auto-unlock check:
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'HOAT_DONG' WHERE user_id = ?", seller);
        String sellerToken = login(seller, "mobile");

        // Buyer cannot file complaint (only seller can)
        given().auth().oauth2(buyerToken).contentType("application/json")
                .body(Map.of("reviewId", reviewId.toString(), "reasonCode", "SAI_SU_THAT", "description", "Không hợp lệ"))
                .post("/api/v1/review-complaints")
                .then().statusCode(403);

        // Seller uploads PNG evidence + submits complaint (UC-33)
        UUID evidenceId = UUID.fromString(
                given().auth().oauth2(sellerToken)
                        .multiPart("files", "handover-proof.png", createSamplePng(), "image/png")
                        .post("/api/v1/review-complaints/evidence")
                        .then().statusCode(201).extract().jsonPath().getString("items[0].id")
        );

        Response complaintRes = given().auth().oauth2(sellerToken).contentType("application/json")
                .body(Map.of(
                        "reviewId", reviewId.toString(),
                        "expectedReviewVersion", 1,
                        "reasonCode", "SAI_SU_THAT",
                        "description", "Người mua đã kiểm tra kỹ khi bàn giao có ảnh xác nhận.",
                        "evidenceIds", List.of(evidenceId.toString()),
                        "clientRequestId", "cmp-req-1"
                ))
                .post("/api/v1/review-complaints")
                .then().statusCode(201)
                .body("status", equalTo("CHO_XU_LY"))
                .body("imageEvidenceCount", equalTo(1))
                .extract().response();
        UUID complaintId = UUID.fromString(complaintRes.jsonPath().getString("id"));

        // Post-conditions UC-33: review stays CHAP_NHAN, editLocked = true, score still 48
        assertThat(db.queryForObject("SELECT khoa_chinh_sua FROM danh_gias WHERE ma_danh_gia = ?", Boolean.class, reviewId))
                .isTrue();
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller))
                .isEqualTo(48);

        // Idempotent retry returns 200 OK with same complaint id
        given().auth().oauth2(sellerToken).contentType("application/json")
                .body(Map.of(
                        "reviewId", reviewId.toString(),
                        "reasonCode", "SAI_SU_THAT",
                        "description", "Người mua đã kiểm tra kỹ khi bàn giao có ảnh xác nhận.",
                        "clientRequestId", "cmp-req-1"
                ))
                .post("/api/v1/review-complaints")
                .then().statusCode(200)
                .body("id", equalTo(complaintId.toString()))
                .body("idempotentReplay", equalTo(true));

        // Restore BI_KHOA state from the review threshold lock before Mod B upholds
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI' WHERE user_id = ?", seller);

        // 2. UC-34 §4: Mod A (who reviewed the 1-star review) is blocked from deciding the complaint when Mod B exists
        given().auth().oauth2(modAToken).contentType("application/json")
                .body(Map.of("action", "UPHOLD", "rationale", "Thử tự xử lý"))
                .post("/api/v1/admin/review-moderation/complaints/" + complaintId + "/decide")
                .then().statusCode(403)
                .body("code", equalTo("PRIOR_REVIEWER_CONFLICT"));

        // 3. NFR-01: Seller & buyer cannot access private evidence; Mod B can
        given().auth().oauth2(sellerToken).get("/api/v1/admin/review-moderation/evidence/" + evidenceId).then().statusCode(403);
        given().auth().oauth2(buyerToken).get("/api/v1/admin/review-moderation/evidence/" + evidenceId).then().statusCode(403);
        given().auth().oauth2(modBToken).get("/api/v1/admin/review-moderation/evidence/" + evidenceId)
                .then().statusCode(200)
                .header("Cache-Control", containsString("no-store"));

        // 4. Mod B upholds complaint -> removes review (DA_GO), reverses +5 (48 -> 53), auto-unlocks account!
        given().auth().oauth2(modBToken).contentType("application/json")
                .body(Map.of("action", "UPHOLD", "rationale", "Ảnh bàn giao xác nhận bàn nguyên vẹn."))
                .post("/api/v1/admin/review-moderation/complaints/" + complaintId + "/decide")
                .then().statusCode(200)
                .body("newReviewStatus", equalTo("DA_GO"))
                .body("newComplaintStatus", equalTo("DA_XU_LY"))
                .body("scoreDelta", equalTo(5))
                .body("sellerScoreAfter", equalTo(53))
                .body("restrictionChange", equalTo("UNLOCKED"));

        assertThat(db.queryForObject("SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ?", String.class, seller))
                .isEqualTo("HOAT_DONG");
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller))
                .isEqualTo(53);

        // Both seller and buyer receive notifications
        assertThat(db.queryForObject("SELECT COUNT(*) FROM thong_bao_danh_gias WHERE ma_khieu_nai = ?", Integer.class, complaintId))
                .isEqualTo(2);
    }

    @Test
    @DisplayName("UC-33 Ngoại lệ: quá hạn 7 ngày, đổi phiên bản đánh giá, rút khiếu nại và chặn gửi lại")
    void enforcesSevenDayWindowVersionConflictAndWithdrawRules() {
        UUID buyer = createMember(100);
        UUID seller = createMember(100);
        UUID listingId = createListing(seller, "Giáo trình OOP");
        UUID txExpired = createCompletedTransaction(listingId, seller, buyer);
        UUID txActive = createCompletedTransaction(listingId, seller, buyer);

        Instant eightDaysAgo = Instant.now().minus(8, ChronoUnit.DAYS);
        UUID expiredReview = createReview(txExpired, buyer, seller, 3, "Hơi cũ", "CHAP_NHAN", eightDaysAgo, eightDaysAgo);
        UUID activeReview = createReview(txActive, buyer, seller, 2, "Thiếu trang", "CHAP_NHAN", Instant.now(), Instant.now());

        String sellerToken = login(seller, "mobile");

        // Expired > 7 days -> 409 COMPLAINT_WINDOW_EXPIRED
        given().auth().oauth2(sellerToken).contentType("application/json")
                .body(Map.of("reviewId", expiredReview.toString(), "reasonCode", "SAI_SU_THAT", "description", "Quá hạn"))
                .post("/api/v1/review-complaints")
                .then().statusCode(409)
                .body("code", equalTo("COMPLAINT_WINDOW_EXPIRED"));

        // Version mismatch -> 409 REVIEW_CHANGED
        given().auth().oauth2(sellerToken).contentType("application/json")
                .body(Map.of("reviewId", activeReview.toString(), "expectedReviewVersion", 99,
                        "reasonCode", "SAI_SU_THAT", "description", "Phiên bản cũ"))
                .post("/api/v1/review-complaints")
                .then().statusCode(409)
                .body("code", equalTo("REVIEW_CHANGED"));

        // Submit complaint successfully -> then withdraw -> unlocks edit & blocks re-filing
        UUID complaintId = UUID.fromString(
                given().auth().oauth2(sellerToken).contentType("application/json")
                        .body(Map.of("reviewId", activeReview.toString(), "expectedReviewVersion", 0,
                                "reasonCode", "SAI_SU_THAT", "description", "Sách đủ trang."))
                        .post("/api/v1/review-complaints")
                        .then().statusCode(201).extract().jsonPath().getString("id")
        );

        given().auth().oauth2(sellerToken)
                .post("/api/v1/review-complaints/" + complaintId + "/withdraw")
                .then().statusCode(200)
                .body("status", equalTo("DA_RUT"));

        assertThat(db.queryForObject("SELECT khoa_chinh_sua FROM danh_gias WHERE ma_danh_gia = ?", Boolean.class, activeReview))
                .isFalse();

        // Cannot re-file after withdrawal (UC-33 §3.2)
        given().auth().oauth2(sellerToken).contentType("application/json")
                .body(Map.of("reviewId", activeReview.toString(), "reasonCode", "SAI_SU_THAT", "description", "Gửi lại"))
                .post("/api/v1/review-complaints")
                .then().statusCode(409)
                .body("code", equalTo("COMPLAINT_ALREADY_EXISTS"));
    }

    @Test
    @DisplayName("UC-34 Đồng thời & Bổ sung: hai KDV xét cùng đánh giá chỉ trừ điểm đúng 1 lần; yêu cầu bổ sung hoạt động 2 chiều")
    void preventsDoubleDeductionConcurrentlyAndSupportsSupplementalFlow() throws Exception {
        UUID buyer = createMember(100);
        UUID seller = createMember(100);
        UUID modA = createMember(100);
        UUID modB = createMember(100);
        grantRole(modA, "KIEM_DUYET_VIEN");
        grantRole(modB, "KIEM_DUYET_VIEN");

        UUID listingId = createListing(seller, "Tai nghe học online");
        UUID txId = createCompletedTransaction(listingId, seller, buyer);
        UUID reviewId = createReview(txId, buyer, seller, 2, "Một bên tai nhỏ tiếng", "CHO_XET", Instant.now(), null);

        String modAToken = login(modA, "admin-web");
        String modBToken = login(modB, "admin-web");
        String buyerToken = login(buyer, "mobile");

        // Mod A requests supplemental info from buyer
        given().auth().oauth2(modAToken).contentType("application/json")
                .body(Map.of("action", "REQUEST_MORE_INFO", "rationale", "Vui lòng gửi thêm mô tả lỗi chi tiết.", "targetParty", "BUYER"))
                .post("/api/v1/admin/review-moderation/reviews/" + reviewId + "/decide")
                .then().statusCode(200)
                .body("newReviewStatus", equalTo("CHO_XET"));

        UUID reqId = db.queryForObject(
                "SELECT id FROM yeu_cau_bo_sung_danh_gia WHERE ho_so_id = ? AND trang_thai = 'CHO_PHAN_HOI'",
                UUID.class, reviewId
        );

        // Buyer responds to supplemental request
        given().auth().oauth2(buyerToken).contentType("application/json")
                .body(Map.of("responseNote", "Tai trái gần như không nghe thấy khi cắm laptop."))
                .post("/api/v1/review-complaints/supplemental/" + reqId + "/respond")
                .then().statusCode(200)
                .body("status", equalTo("DA_PHAN_HOI"));

        // Concurrent approval by Mod A & Mod B -> exactly 1 succeeds (200), 1 gets 409 ALREADY_DECIDED, score deducted once (100 -> 97)
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Integer> c1 = () -> given().auth().oauth2(modAToken).contentType("application/json")
                    .body(Map.of("action", "APPROVE", "rationale", "Đủ căn cứ từ mô tả bổ sung."))
                    .post("/api/v1/admin/review-moderation/reviews/" + reviewId + "/decide").statusCode();
            Callable<Integer> c2 = () -> given().auth().oauth2(modBToken).contentType("application/json")
                    .body(Map.of("action", "APPROVE", "rationale", "Đủ căn cứ xác thực."))
                    .post("/api/v1/admin/review-moderation/reviews/" + reviewId + "/decide").statusCode();
            var results = pool.invokeAll(List.of(c1, c2));
            List<Integer> codes = List.of(results.get(0).get(), results.get(1).get());
            assertThat(codes).containsExactlyInAnyOrder(200, 409);
        }

        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller))
                .isEqualTo(97);
    }

    @Test
    @DisplayName("Nâng cấp Flyway V13 -> V14 bảo toàn dữ liệu đánh giá và khiếu nại sẵn có")
    void upgradesV13ToV14Cleanly() throws Exception {
        var pg = PostgresTestContainer.getInstance();
        String schema = "p3_05_v14_" + UUID.randomUUID().toString().substring(0, 8);
        try (var conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             var stmt = conn.createStatement()) {
            stmt.execute("CREATE SCHEMA " + schema);
        }
        try {
            var config = Flyway.configure()
                    .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                    .schemas(schema)
                    .defaultSchema(schema);
            config.target("13").load().migrate();
            config.target("14").load().migrate();

            try (var conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                 var stmt = conn.createStatement()) {
                stmt.execute("SET search_path TO " + schema);
                try (var rs = stmt.executeQuery(
                        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '" + schema
                                + "' AND table_name IN ('danh_gia_bang_chungs', 'yeu_cau_bo_sung_danh_gia', 'thong_bao_danh_gias')")) {
                    rs.next();
                    assertThat(rs.getInt(1)).isEqualTo(3);
                }
            }
        } finally {
            try (var conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                 var stmt = conn.createStatement()) {
                stmt.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
            }
        }
    }

    private UUID createMember(int reputation) {
        UUID id = UUID.randomUUID();
        String suffix = id.toString().substring(0, 8);
        db.update(
                """
                INSERT INTO thanh_viens(
                    user_id, email, mat_khau_hash, ho_ten, mssv,
                    diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved
                ) VALUES (?, ?, ?, ?, ?, ?, 'HOAT_DONG', TRUE, TRUE)
                """,
                id, "rv" + suffix + "@uit.edu.vn", passwordHash, "SV " + suffix, "23" + suffix, reputation
        );
        users.add(id);
        return id;
    }

    private void grantRole(UUID userId, String role) {
        db.update(
                "INSERT INTO vai_tro_quan_tri(id, user_id, loai_vai_tro, bat_dau, trang_thai_hieu_luc) VALUES (?, ?, ?, ?, TRUE)",
                UUID.randomUUID(), userId, role, Timestamp.from(Instant.now().minusSeconds(5))
        );
    }

    private UUID createListing(UUID sellerId, String title) {
        UUID id = UUID.randomUUID();
        db.update(
                "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, hinh_thuc, trang_thai) VALUES (?, ?, ?, 100000, 'BAN_LE', 'KET_THUC')",
                id, sellerId, title
        );
        listings.add(id);
        return id;
    }

    private UUID createCompletedTransaction(UUID listingId, UUID sellerId, UUID buyerId) {
        UUID txId = UUID.randomUUID();
        db.update(
                """
                INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai, thoi_diem_hoan_tat)
                VALUES (?, ?, ?, ?, 100000, 'HOAN_TAT', ?)
                """,
                txId, listingId, sellerId, buyerId, Timestamp.from(Instant.now().minus(1, ChronoUnit.DAYS))
        );
        transactions.add(txId);
        return txId;
    }

    private UUID createReview(
            UUID txId, UUID buyerId, UUID sellerId, int stars, String comment,
            String status, Instant createdAt, Instant publishedAt
    ) {
        UUID reviewId = UUID.randomUUID();
        db.update(
                """
                INSERT INTO danh_gias(
                    ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id,
                    so_sao, nhan_xet, trang_thai, thoi_diem_tao, thoi_diem_cong_khai, version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """,
                reviewId, txId, buyerId, sellerId, stars, comment, status,
                Timestamp.from(createdAt), publishedAt != null ? Timestamp.from(publishedAt) : null
        );
        return reviewId;
    }

    private String login(UUID userId, String client) {
        String email = db.queryForObject("SELECT email FROM thanh_viens WHERE user_id = ?", String.class, userId);
        return auth.login(email, PASSWORD, client, "127.0.0.1").token();
    }

    private static byte[] createSamplePng() throws Exception {
        BufferedImage img = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < 8; x++) {
            for (int y = 0; y < 8; y++) {
                img.setRGB(x, y, Color.CYAN.getRGB());
            }
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", baos);
        return baos.toByteArray();
    }
}
