package com.dormtrading.order;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.builder.MultiPartSpecBuilder;
import io.restassured.http.ContentType;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@DisplayName("Kiểm thử tích hợp API P3-02: Bàn giao, OTP 6 số (UC-27) & Yêu cầu hủy sau báo giao (UC-28)")
class TransactionHandoverApiTest extends BaseIntegrationTest {

    private static final String PASSWORD = "a quiet river beneath stars";

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private JdbcTemplate db;

    @Autowired
    private TransactionHandoverService handoverService;

    @MockitoBean
    private JavaMailSender mail;

    private final ConcurrentMap<String, String> authOtpCodes = new ConcurrentHashMap<>();

    private record Account(UUID id, String email, String token) {
    }

    private record SeededDeal(UUID listingId, List<UUID> itemIds, UUID transactionId) {
    }

    @BeforeEach
    void setup() {
        doAnswer(invocation -> {
            SimpleMailMessage msg = invocation.getArgument(0);
            var matcher = Pattern.compile("[0-9]{6}").matcher(Objects.requireNonNull(msg.getText()));
            if (matcher.find()) {
                authOtpCodes.put(Objects.requireNonNull(msg.getTo())[0], matcher.group());
            }
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));
    }

    private Account createMember(String label, boolean approved, String accountStatus, int score) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "TX" + suffix;
        String email = "tx_" + suffix + "@student.edu.vn";
        String ip = "10.8." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register(label + " " + suffix, studentId, email, PASSWORD, ip);
        if (approved) {
            delivery.deliver();
            String code = authOtpCodes.get(email);
            var challenge = db.queryForMap(
                    "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                    email
            );
            auth.verify((UUID) challenge.get("id"), email, "REGISTER", code, ip);
            db.update(
                    "UPDATE thanh_viens SET profile_approved = TRUE, trang_thai_tai_khoan = ?, diem_uy_tin = ? WHERE email = ?",
                    accountStatus,
                    score,
                    email
            );
        }
        UUID id = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email);
        String token = auth.login(email, PASSWORD, "mobile", ip).token();
        return new Account(id, email, token);
    }

    private Account createAdmin(String adminRole) {
        Account base = createMember("Admin", true, "HOAT_DONG", 120);
        db.update(
                "INSERT INTO vai_tro_quan_tri(user_id, loai_vai_tro, bat_dau) VALUES (?, ?, ?)",
                base.id(),
                adminRole,
                Timestamp.from(Instant.now().minusSeconds(60))
        );
        String adminToken = given()
                .header("Origin", "http://localhost:5173")
                .contentType(ContentType.JSON)
                .body(Map.of("email", base.email(), "password", PASSWORD, "client", "admin-web"))
                .post("/api/v1/auth/login")
                .then()
                .statusCode(200)
                .extract().jsonPath().getString("token");
        return new Account(base.id(), base.email(), adminToken);
    }

    private SeededDeal seedDeal(
            UUID sellerId,
            UUID buyerId,
            int priceVnd,
            int itemCount,
            String txStatus,
            Instant listingExpiresAt
    ) {
        UUID listingId = UUID.randomUUID();
        String listingType = itemCount >= 2 ? "BAN_COMBO" : (priceVnd == 0 ? "CHO_TANG" : "BAN_LE");
        Timestamp nowTs = Timestamp.from(Instant.now());
        Timestamp expiresTs = listingExpiresAt != null ? Timestamp.from(listingExpiresAt) : null;

        db.update(
                """
                INSERT INTO tin_dangs(
                    ma_tin, nguoi_dang_id, tieu_de, mo_ta, tinh_trang, gia_vnd, hinh_anh,
                    khu_vuc, ma_khu_vuc, ma_danh_muc, hinh_thuc, trang_thai, published_at, expires_at
                ) VALUES (?, ?, ?, 'Mô tả chi tiết sản phẩm', 'Mới 95%', ?, ARRAY['/api/v1/media/00000000-0000-0000-0000-000000000001'],
                          'KTX Khu A', 'KTX_KHU_A', 'GT_CNTT', ?, 'GIU_CHO', ?, ?)
                """,
                listingId,
                sellerId,
                priceVnd == 0 ? "Giáo trình tặng sinh viên" : "Giáo trình SE100",
                priceVnd,
                listingType,
                nowTs,
                expiresTs
        );

        List<UUID> itemIds = new java.util.ArrayList<>();
        for (int i = 0; i < itemCount; i++) {
            UUID itemId = UUID.randomUUID();
            db.update(
                    """
                    INSERT INTO do_vats(ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai)
                    VALUES (?, ?, ?, 'Tốt', ARRAY['/api/v1/media/00000000-0000-0000-0000-000000000001'], 'DANG_GIU')
                    """,
                    itemId,
                    sellerId,
                    "Đồ vật #" + (i + 1)
            );
            db.update("INSERT INTO tin_dang_do_vat(ma_tin, ma_vat) VALUES (?, ?)", listingId, itemId);
            itemIds.add(itemId);
        }

        UUID txId = UUID.randomUUID();
        Timestamp startTs = "DANG_GIAO".equals(txStatus) ? nowTs : null;
        db.update(
                """
                INSERT INTO giao_dichs(
                    ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan,
                    thoi_gian_hen, dia_diem_hen, trang_thai, thoi_diem_giu_cho, thoi_diem_bat_dau_giao, updated_at, version
                ) VALUES (?, ?, ?, ?, ?, ?, 'Sảnh B4 KTX Khu A', ?, ?, ?, ?, 0)
                """,
                txId,
                listingId,
                sellerId,
                buyerId,
                priceVnd,
                Timestamp.from(Instant.now().plus(2, ChronoUnit.HOURS)),
                txStatus,
                nowTs,
                startTs,
                nowTs
        );

        return new SeededDeal(listingId, List.copyOf(itemIds), txId);
    }

    @Test
    @DisplayName("UC-27 Luồng chính & A2 (0đ) & NFR-01: Báo giao kèm ảnh gỡ EXIF, phân quyền ảnh chặt, cấp OTP riêng cho người mua, xác nhận hoàn tất đúng 1 lần")
    void uc27_happyPath_exifStrip_proofAuthMatrix_andFreeGiftCompletion() throws Exception {
        Account seller = createMember("Seller", true, "HOAT_DONG", 100);
        Account buyer = createMember("Buyer", true, "HOAT_DONG", 100);
        Account outsider = createMember("Outsider", true, "HOAT_DONG", 100);
        Account moderator = createAdmin("KIEM_DUYET_VIEN");
        Account seniorAdmin = createAdmin("QUAN_TRI_VIEN_CAP_CAO");

        // UC-27 A2: 0đ free combo handover still requires proof photo + 6-digit OTP
        SeededDeal deal = seedDeal(seller.id(), buyer.id(), 0, 2, "DANG_GIAO", Instant.now().plus(20, ChronoUnit.DAYS));

        // Listing detail exposes activeTransactionId ONLY to seller/buyer, NEVER to outsider (Zero-PII)
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/{id}", deal.listingId())
                .then().statusCode(200)
                .body("activeTransactionId", equalTo(deal.transactionId().toString()));
        given().auth().oauth2(buyer.token())
                .get("/api/v1/listings/{id}", deal.listingId())
                .then().statusCode(200)
                .body("activeTransactionId", equalTo(deal.transactionId().toString()));
        given().auth().oauth2(outsider.token())
                .get("/api/v1/listings/{id}", deal.listingId())
                .then().statusCode(200)
                .body("activeTransactionId", nullValue());
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/mine")
                .then().statusCode(200)
                .body("items[0].activeTransactionId", equalTo(deal.transactionId().toString()));

        // Seller lists transactions: pendingActionCount = 1 in DANG_GIAO
        given().auth().oauth2(seller.token())
                .queryParam("role", "SELLER")
                .queryParam("status", "ACTION_REQUIRED")
                .get("/api/v1/transactions")
                .then().statusCode(200)
                .body("pendingActionCount", equalTo(1))
                .body("items", hasSize(1))
                .body("items[0].id", equalTo(deal.transactionId().toString()))
                .body("items[0].isFree", equalTo(true))
                .body("items[0].isCombo", equalTo(true))
                .body("items[0].needsViewerAction", equalTo(true));

        // Seller uploads JPEG containing EXIF Orientation 6 + GPS coordinates and reports delivered
        byte[] dirtyJpeg = HandoverTestImages.jpegWithExifOrientation6AndGps();
        given().auth().oauth2(seller.token())
                .multiPart("file", "handover.jpg", dirtyJpeg, "image/jpeg")
                .multiPart(new MultiPartSpecBuilder("Đã giao đủ 2 cuốn tại sảnh B4")
                        .controlName("note")
                        .charset(StandardCharsets.UTF_8)
                        .mimeType("text/plain")
                        .build())
                .formParam("version", 0)
                .post("/api/v1/transactions/{id}/deliver", deal.transactionId())
                .then()
                .statusCode(200)
                .header("Cache-Control", containsString("no-store"))
                .body("status", equalTo("CHO_XAC_NHAN"))
                .body("version", equalTo(1))
                .body("viewerRole", equalTo("SELLER"))
                .body("handoverProof.photoUrl", equalTo("/api/v1/transactions/" + deal.transactionId() + "/handover-photo"))
                .body("handoverProof.note", equalTo("Đã giao đủ 2 cuốn tại sảnh B4"))
                .body("handoverProof.photos", hasSize(1))
                .body("otp.status", equalTo("ACTIVE"))
                .body("otp.attemptsUsed", equalTo(0))
                .body("otp.maxAttempts", equalTo(5))
                .body("otp.remainingAttempts", equalTo(5))
                // CRITICAL NFR-01 / UC-27 Step 5: Seller NEVER sees Buyer's private inAppCode!
                .body("otp.inAppCode", nullValue())
                .body("actions.canReportDelivered", equalTo(false))
                .body("actions.canVerifyOtp", equalTo(false))
                .body("actions.canReissueOtp", equalTo(false)) // OTP still active -> seller cannot grief it
                .body("actions.canRequestCancel", equalTo(true))
                .body("timeline", hasSize(1))
                .body("timeline[0].action", equalTo("REPORT_DELIVERED"))
                .body("timeline[0].actorRole", equalTo("SELLER"));

        // Verify DB NEVER stored plaintext OTP in ma_otp, and stored 64-char HMAC hash + ciphertext
        Map<String, Object> otpDbRow = db.queryForMap(
                "SELECT ma_otp, otp_hash, otp_ciphertext FROM ma_xac_nhan_otp WHERE ma_giao_dich = ?",
                deal.transactionId()
        );
        assertThat(otpDbRow.get("ma_otp")).isNull();
        assertThat(otpDbRow.get("otp_hash").toString().strip()).hasSize(64);
        assertThat(otpDbRow.get("otp_ciphertext").toString()).contains(":");

        // Verify proof photo is NOT exposed via public /api/v1/media/{id}
        UUID proofId = db.queryForObject(
                "SELECT id FROM anh_ban_giao_giao_dichs WHERE ma_giao_dich = ?",
                UUID.class,
                deal.transactionId()
        );
        given().get("/api/v1/media/{id}", proofId).then().statusCode(404);

        // NFR-01 Proof Photo Authorization Matrix:
        // Guest -> 401; Outsider -> 403; Seller, Buyer, Moderator, SeniorAdmin -> 200 private no-store + EXIF stripped!
        given().get("/api/v1/transactions/{id}/handover-photo", deal.transactionId())
                .then().statusCode(401);
        given().auth().oauth2(outsider.token())
                .get("/api/v1/transactions/{id}/handover-photo", deal.transactionId())
                .then().statusCode(403)
                .body("code", equalTo("TRANSACTION_FORBIDDEN"));
        given().auth().oauth2(outsider.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(403)
                .body("code", equalTo("TRANSACTION_FORBIDDEN"));

        for (String authorizedToken : List.of(seller.token(), buyer.token(), moderator.token(), seniorAdmin.token())) {
            byte[] fetched = given().auth().oauth2(authorizedToken)
                    .get("/api/v1/transactions/{id}/handover-photo", deal.transactionId())
                    .then()
                    .statusCode(200)
                    .contentType("image/jpeg")
                    .header("Cache-Control", containsString("private"))
                    .header("Cache-Control", containsString("no-store"))
                    .header("X-Content-Type-Options", equalTo("nosniff"))
                    .header("Vary", containsString("Authorization"))
                    .extract().asByteArray();
            assertThat(new String(fetched, StandardCharsets.ISO_8859_1)).doesNotContain("Exif", "GPS:10.8782");
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(fetched));
            assertThat(img).isNotNull();
            assertThat(img.getWidth()).isEqualTo(2);
            assertThat(img.getHeight()).isEqualTo(4);
        }

        // Moderator viewing detail NEVER receives Buyer's OTP code and has all write actions false
        given().auth().oauth2(moderator.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .body("viewerRole", equalTo("MODERATOR"))
                .body("otp.inAppCode", nullValue())
                .body("actions.canVerifyOtp", equalTo(false))
                .body("actions.canViewHandoverPhoto", equalTo(true));

        // Buyer views detail: receives inAppCode (6 digits) and serverNow
        String buyerOtpCode = given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .header("Cache-Control", containsString("no-store"))
                .body("viewerRole", equalTo("BUYER"))
                .body("serverNow", notNullValue())
                .body("autoEscalateAt", notNullValue())
                .body("otp.inAppCode", notNullValue())
                .body("actions.canVerifyOtp", equalTo(true))
                .body("actions.canReissueOtp", equalTo(true))
                .body("actions.canRequestCancel", equalTo(true))
                .extract().jsonPath().getString("otp.inAppCode");
        assertThat(buyerOtpCode).matches("[0-9]{6}");

        // Seller attempting to complete with Buyer's OTP -> 403 TRANSACTION_FORBIDDEN
        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("otp", buyerOtpCode, "version", 1))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(403)
                .body("code", equalTo("TRANSACTION_FORBIDDEN"));

        // Buyer completes with valid 6-digit OTP -> HOAN_TAT, items DA_CHUYEN_GIAO, listing KET_THUC, OTP used & ciphertext wiped
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("otp", buyerOtpCode, "version", 1))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(200)
                .body("status", equalTo("HOAN_TAT"))
                .body("completedAt", notNullValue())
                .body("listing.status", equalTo("KET_THUC"))
                .body("items[0].status", equalTo("DA_CHUYEN_GIAO"))
                .body("items[1].status", equalTo("DA_CHUYEN_GIAO"))
                .body("otp.status", equalTo("USED"))
                .body("otp.inAppCode", nullValue())
                .body("actions.canVerifyOtp", equalTo(false))
                .body("actions.canRequestCancel", equalTo(false))
                .body("timeline", hasSize(2))
                .body("timeline[1].action", equalTo("COMPLETED_BY_OTP"));

        // Ciphertext wiped in DB; reputation scores unchanged (belongs to UC-30)
        assertThat(db.queryForObject(
                "SELECT otp_ciphertext FROM ma_xac_nhan_otp WHERE ma_giao_dich = ?",
                String.class, deal.transactionId())).isNull();
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(100);
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, buyer.id()))
                .isEqualTo(100);

        // NFR-03 / UC-27 E5: Replaying OTP after completion -> 409 OTP_ALREADY_USED
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("otp", buyerOtpCode))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_ALREADY_USED"));
    }

    @Test
    @DisplayName("UC-27 E1 & E2: Chặn thiếu ảnh, sai định dạng, quá 5MB, sai vai trò, và chưa bắt đầu giao (GIU_CHO)")
    void uc27_e1_e2_validationPermissionsAndPreconditions() {
        Account seller = createMember("SellerE1", true, "HOAT_DONG", 100);
        Account buyer = createMember("BuyerE1", true, "HOAT_DONG", 100);

        SeededDeal notStartedDeal = seedDeal(seller.id(), buyer.id(), 80000, 1, "GIU_CHO", Instant.now().plus(10, ChronoUnit.DAYS));
        SeededDeal deliveringDeal = seedDeal(seller.id(), buyer.id(), 80000, 1, "DANG_GIAO", Instant.now().plus(10, ChronoUnit.DAYS));
        byte[] jpeg = HandoverTestImages.sampleJpeg();

        // GIU_CHO (before UC-26 start-delivery) rejected -> 409 INVALID_STATE_TRANSITION
        given().auth().oauth2(seller.token())
                .multiPart("file", "ok.jpg", jpeg, "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", notStartedDeal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));

        // Buyer cannot report delivered -> 403 TRANSACTION_FORBIDDEN
        given().auth().oauth2(buyer.token())
                .multiPart("file", "ok.jpg", jpeg, "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", deliveringDeal.transactionId())
                .then().statusCode(403)
                .body("code", equalTo("TRANSACTION_FORBIDDEN"));

        // E1: Missing photo -> 400 HANDOVER_PHOTO_REQUIRED, order stays DANG_GIAO
        given().auth().oauth2(seller.token())
                .multiPart("note", "Chưa có ảnh")
                .post("/api/v1/transactions/{id}/deliver", deliveringDeal.transactionId())
                .then().statusCode(400)
                .body("code", equalTo("HANDOVER_PHOTO_REQUIRED"));

        // E1: Fake SVG disguised as JPEG -> 400 INVALID_MEDIA
        given().auth().oauth2(seller.token())
                .multiPart("file", "fake.jpg", "<svg>bad</svg>".getBytes(StandardCharsets.UTF_8), "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", deliveringDeal.transactionId())
                .then().statusCode(400)
                .body("code", equalTo("INVALID_MEDIA"));

        // E1: File > 5MB -> 413 FILE_TOO_LARGE
        byte[] oversized = new byte[5 * 1024 * 1024 + 32];
        oversized[0] = (byte) 0xFF;
        oversized[1] = (byte) 0xD8;
        oversized[2] = (byte) 0xFF;
        given().auth().oauth2(seller.token())
                .multiPart("file", "big.jpg", oversized, "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", deliveringDeal.transactionId())
                .then().statusCode(413)
                .body("code", equalTo("FILE_TOO_LARGE"));

        // Stale version -> 409 VERSION_CONFLICT
        given().auth().oauth2(seller.token())
                .multiPart("file", "ok.jpg", jpeg, "image/jpeg")
                .formParam("version", 99)
                .post("/api/v1/transactions/{id}/deliver", deliveringDeal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // Transaction remains DANG_GIAO with 0 proof rows
        assertThat(db.queryForObject(
                "SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?",
                String.class, deliveringDeal.transactionId())).isEqualTo("DANG_GIAO");
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM anh_ban_giao_giao_dichs WHERE ma_giao_dich = ?",
                Integer.class, deliveringDeal.transactionId())).isZero();
    }

    @Test
    @DisplayName("UC-27 E3, E4, E5, E7 & FR-09: Nhập sai 1..5 lần bền vững, hết hạn 10 phút không hủy giữ chỗ, cấp lại vô hiệu mã cũ giữ mốc 24h, quá 24h chuyển CHO_XU_LY")
    void uc27_otpWrongAttemptsLockoutExpiryReissueAnd24hEscalation() {
        Account seller = createMember("SellerOtp", true, "HOAT_DONG", 100);
        Account buyer = createMember("BuyerOtp", true, "HOAT_DONG", 100);
        SeededDeal deal = seedDeal(seller.id(), buyer.id(), 95000, 1, "DANG_GIAO", Instant.now().plus(15, ChronoUnit.DAYS));

        given().auth().oauth2(seller.token())
                .multiPart("file", "handover.png", HandoverTestImages.samplePng(), "image/png")
                .post("/api/v1/transactions/{id}/deliver", deal.transactionId())
                .then().statusCode(200);

        Instant originalDeliveredAt = db.queryForObject(
                "SELECT thoi_diem_bao_giao FROM giao_dichs WHERE ma_giao_dich = ?",
                Timestamp.class, deal.transactionId()).toInstant();

        String firstCode = given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");
        String wrongCode = firstCode.equals("000000") ? "999999" : "000000";

        // Malformed input does NOT burn an attempt
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("otp", "12ab"))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // E3: Wrong attempts 1..4 MUST persist and return remainingAttempts 4..1
        for (int attempt = 1; attempt <= 4; attempt++) {
            int expectedRemaining = 5 - attempt;
            given().auth().oauth2(buyer.token())
                    .contentType(ContentType.JSON)
                    .body(Map.of("otp", wrongCode))
                    .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                    .then().statusCode(400)
                    .body("code", equalTo("OTP_INVALID"))
                    .body("attemptsUsed", equalTo(attempt))
                    .body("maxAttempts", equalTo(5))
                    .body("remainingAttempts", equalTo(expectedRemaining))
                    .body("locked", equalTo(false));
        }

        // E4: 5th wrong attempt locks OTP (409 OTP_ATTEMPTS_EXCEEDED), wipes ciphertext, preserves CHO_XAC_NHAN & DANG_GIU!
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("otp", wrongCode))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_ATTEMPTS_EXCEEDED"))
                .body("attemptsUsed", equalTo(5))
                .body("remainingAttempts", equalTo(0))
                .body("locked", equalTo(true));

        // Even submitting the previously-correct firstCode is now rejected because 5/5 exhausted!
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("otp", firstCode))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_ATTEMPTS_EXCEEDED"));

        assertThat(db.queryForObject("SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, deal.transactionId()))
                .isEqualTo("CHO_XAC_NHAN");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, deal.itemIds().getFirst()))
                .isEqualTo("DANG_GIU");

        // Seller CAN now reissue because OTP is EXHAUSTED (still never sees inAppCode!)
        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/transactions/{id}/otp/reissue", deal.transactionId())
                .then().statusCode(200)
                .body("otp.status", equalTo("ACTIVE"))
                .body("otp.attemptsUsed", equalTo(0))
                .body("otp.inAppCode", nullValue());

        String secondCode = given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");
        assertThat(secondCode).matches("[0-9]{6}");

        // Verify 24h escalation anchor (thoi_diem_bao_giao) was NOT shifted by reissue (UC-29 Assumption)
        Instant afterReissueDeliveredAt = db.queryForObject(
                "SELECT thoi_diem_bao_giao FROM giao_dichs WHERE ma_giao_dich = ?",
                Timestamp.class, deal.transactionId()).toInstant();
        assertThat(afterReissueDeliveredAt).isEqualTo(originalDeliveredAt);

        // E5: Simulate 10-minute OTP expiry -> 409 OTP_EXPIRED, hold preserved!
        db.update(
                "UPDATE ma_xac_nhan_otp SET thoi_diem_phat = CURRENT_TIMESTAMP - INTERVAL '11 minutes', "
                        + "thoi_diem_het_han = CURRENT_TIMESTAMP - INTERVAL '1 minute' "
                        + "WHERE ma_giao_dich = ? AND NOT da_dung AND NOT bi_vo_hieu",
                deal.transactionId()
        );

        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("otp", secondCode))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_EXPIRED"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, deal.itemIds().getFirst()))
                .isEqualTo("DANG_GIU");

        // Buyer reissues OTP while still active -> old code immediately invalidated (FR-09)
        String thirdCode = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/transactions/{id}/otp/reissue", deal.transactionId())
                .then().statusCode(200)
                .body("otp.inAppCode", notNullValue())
                .extract().jsonPath().getString("otp.inAppCode");

        String fourthCode = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/transactions/{id}/otp/reissue", deal.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");

        // Old thirdCode (if distinct) cannot pass; even if equal by 1-in-1M chance, verify only 1 active OTP row in DB
        Integer activeOtpCount = db.queryForObject(
                "SELECT COUNT(*) FROM ma_xac_nhan_otp WHERE ma_giao_dich = ? AND NOT da_dung AND NOT bi_vo_hieu",
                Integer.class, deal.transactionId());
        assertThat(activeOtpCount).isEqualTo(1);
        if (!thirdCode.equals(fourthCode)) {
            given().auth().oauth2(buyer.token())
                    .contentType(ContentType.JSON)
                    .body(Map.of("otp", thirdCode))
                    .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                    .then().statusCode(400)
                    .body("code", equalTo("OTP_INVALID"));
        }

        // E7: Simulate > 24 hours since thoi_diem_bao_giao -> scheduler escalates CHO_XAC_NHAN -> CHO_XU_LY (OVERDUE_24H), hold preserved!
        db.update(
                "UPDATE giao_dichs SET thoi_diem_bao_giao = CURRENT_TIMESTAMP - INTERVAL '25 hours' WHERE ma_giao_dich = ?",
                deal.transactionId()
        );
        int escalated = handoverService.reconcileOverdueDeliveries(50);
        assertThat(escalated).isGreaterThanOrEqualTo(1);

        given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .body("status", equalTo("CHO_XU_LY"))
                .body("escalationReason", equalTo("OVERDUE_24H"))
                .body("items[0].status", equalTo("DANG_GIU"))
                .body("listing.status", equalTo("GIU_CHO"))
                .body("timeline.action", hasItem("AUTO_ESCALATED_OVERDUE_24H"));

        // UC-29 Alt 3: Before moderator decides, buyer can still complete with valid active OTP -> HOAN_TAT!
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("otp", fourthCode))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(200)
                .body("status", equalTo("HOAN_TAT"))
                .body("items[0].status", equalTo("DA_CHUYEN_GIAO"))
                .body("listing.status", equalTo("KET_THUC"));
    }

    @Test
    @DisplayName("UC-28 Luồng chính, A1 (Đồng thuận hủy), A3 (Chặn trước giao), E1, E3 (Lặp lũy đẳng), E5 (Không giải phóng đồ vật bị giữ nơi khác)")
    void uc28_postDeliveryCancelRequestMutualConsentAndSharedItemGuard() {
        Account seller = createMember("SellerC", true, "HOAT_DONG", 100);
        Account buyer = createMember("BuyerC", true, "HOAT_DONG", 100);
        Account outsider = createMember("OutsiderC", true, "HOAT_DONG", 100);

        // Pre-delivery order (DANG_GIAO) cannot use UC-28 (A3)
        SeededDeal preDelivery = seedDeal(seller.id(), buyer.id(), 50000, 1, "DANG_GIAO", Instant.now().plus(10, ChronoUnit.DAYS));
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", preDelivery.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));

        // Post-delivery order with 2 items (combo)
        SeededDeal deal = seedDeal(seller.id(), buyer.id(), 180000, 2, "DANG_GIAO", Instant.now().plus(20, ChronoUnit.DAYS));
        given().auth().oauth2(seller.token())
                .multiPart("file", "proof.webp", HandoverTestImages.webpWithExifAndXmp(), "image/webp")
                .post("/api/v1/transactions/{id}/deliver", deal.transactionId())
                .then().statusCode(200);

        String activeOtpBeforeCancel = given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");

        // E1: Outsider cannot create cancel request
        given().auth().oauth2(outsider.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", deal.transactionId())
                .then().statusCode(403)
                .body("code", equalTo("TRANSACTION_FORBIDDEN"));

        // OTHER requires reasonNote >= 3 chars
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "OTHER", "reasonNote", "ab"))
                .post("/api/v1/transactions/{id}/cancel-requests", deal.transactionId())
                .then().statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Step 3-6: Buyer submits cancel request -> 201 Created, order stays CHO_XAC_NHAN, items stay DANG_GIU!
        String cancelReqId = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "DEFECT_AT_HANDOVER", "reasonNote", "Phát hiện nút nguồn bị kẹt khi kiểm tra trực tiếp"))
                .post("/api/v1/transactions/{id}/cancel-requests", deal.transactionId())
                .then().statusCode(201)
                .body("status", equalTo("CHO_XAC_NHAN"))
                .body("items[0].status", equalTo("DANG_GIU"))
                .body("items[1].status", equalTo("DANG_GIU"))
                .body("listing.status", equalTo("GIU_CHO"))
                .body("cancellationRequest.status", equalTo("CHO_XAC_NHAN"))
                .body("cancellationRequest.requestedByRole", equalTo("BUYER"))
                .body("cancellationRequest.isViewerRequester", equalTo(true))
                .body("actions.canRequestCancel", equalTo(false))
                .body("actions.canRespondCancel", equalTo(false))
                .extract().jsonPath().getString("cancellationRequest.id");

        // E3 / NFR-03: Duplicate request by SAME buyer returns idempotent 200 (never creates duplicate, never self-confirms)
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "DEFECT_AT_HANDOVER", "reasonNote", "Gửi lặp"))
                .post("/api/v1/transactions/{id}/cancel-requests", deal.transactionId())
                .then().statusCode(200)
                .body("status", equalTo("CHO_XAC_NHAN"))
                .body("cancellationRequest.id", equalTo(cancelReqId));

        // Counterparty calling POST /cancel-requests while pending -> 409 CANCEL_REQUEST_ALREADY_PENDING
        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", deal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("CANCEL_REQUEST_ALREADY_PENDING"));

        // Requester CANNOT respond to own cancel request -> 403 TRANSACTION_FORBIDDEN
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("decision", "AGREE"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", deal.transactionId(), cancelReqId)
                .then().statusCode(403)
                .body("code", equalTo("TRANSACTION_FORBIDDEN"));

        // UC-28 E5 test: Simulate item #2 also being held by another active order on another listing
        UUID otherListingId = UUID.randomUUID();
        UUID otherOrderId = UUID.randomUUID();
        db.update(
                "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) VALUES (?, ?, 'Tin khác giữ chung món 2', 50000, 'GIU_CHO')",
                otherListingId, seller.id());
        db.update("INSERT INTO tin_dang_do_vat(ma_tin, ma_vat) VALUES (?, ?)", otherListingId, deal.itemIds().get(1));
        db.update(
                "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai) VALUES (?, ?, ?, ?, 50000, 'GIU_CHO')",
                otherOrderId, otherListingId, seller.id(), outsider.id());

        // A1: Seller AGREES -> HUY, OTP invalidated, item #1 released to KHA_DUNG, item #2 stays DANG_GIU (E5), listing goes DA_RUT (not CONG_KHAI because item #2 unavailable!)
        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("decision", "AGREE", "responseNote", "Đồng ý nhận lại đồ"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", deal.transactionId(), cancelReqId)
                .then().statusCode(200)
                .body("status", equalTo("HUY"))
                .body("cancelledAt", notNullValue())
                .body("cancellationRequest.status", equalTo("DONG_Y"))
                .body("otp.status", equalTo("INVALIDATED"))
                .body("listing.status", equalTo("DA_RUT"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, deal.itemIds().get(0)))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, deal.itemIds().get(1)))
                .isEqualTo("DANG_GIU");

        // Idempotent replay of AGREE -> 200 OK without error
        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("decision", "AGREE"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", deal.transactionId(), cancelReqId)
                .then().statusCode(200)
                .body("status", equalTo("HUY"));

        // Old OTP cannot complete cancelled order
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("otp", activeOtpBeforeCancel))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));
    }

    @Test
    @DisplayName("UC-28 A2/A4 (Từ chối -> CHO_XU_LY giữ nguyên đồ), đồng thuận mở lại CONG_KHAI, và tài khoản BI_KHOA chỉ đọc")
    void uc28_rejectEscalatesToDispute_reopenPublicOnCleanAgree_andRestrictedAccountReadOnly() {
        Account seller = createMember("SellerR", true, "HOAT_DONG", 100);
        Account buyer = createMember("BuyerR", true, "HOAT_DONG", 100);

        // Deal 1: Clean mutual cancel reopens listing to CONG_KHAI & item to KHA_DUNG
        SeededDeal cleanDeal = seedDeal(seller.id(), buyer.id(), 70000, 1, "DANG_GIAO", Instant.now().plus(20, ChronoUnit.DAYS));
        given().auth().oauth2(seller.token())
                .multiPart("file", "p.jpg", HandoverTestImages.sampleJpeg(), "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", cleanDeal.transactionId())
                .then().statusCode(200);
        String cleanCancelId = given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "MUTUAL_AGREEMENT", "reasonNote", "Hai bên thống nhất hủy"))
                .post("/api/v1/transactions/{id}/cancel-requests", cleanDeal.transactionId())
                .then().statusCode(201)
                .extract().jsonPath().getString("cancellationRequest.id");
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("decision", "AGREE"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", cleanDeal.transactionId(), cleanCancelId)
                .then().statusCode(200)
                .body("status", equalTo("HUY"))
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("items[0].status", equalTo("KHA_DUNG"));

        // Deal 2: Counterparty REJECTS -> CHO_XU_LY (CANCEL_DISPUTE), items remain DANG_GIU & listing GIU_CHO
        SeededDeal disputeDeal = seedDeal(seller.id(), buyer.id(), 110000, 1, "DANG_GIAO", Instant.now().plus(20, ChronoUnit.DAYS));
        given().auth().oauth2(seller.token())
                .multiPart("file", "p2.jpg", HandoverTestImages.sampleJpeg(), "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", disputeDeal.transactionId())
                .then().statusCode(200);
        String disputeCancelId = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "ITEM_NOT_AS_DESCRIBED", "reasonNote", "Màu sắc khác ảnh"))
                .post("/api/v1/transactions/{id}/cancel-requests", disputeDeal.transactionId())
                .then().statusCode(201)
                .extract().jsonPath().getString("cancellationRequest.id");

        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("decision", "REJECT", "responseNote", "Sản phẩm đúng mô tả, người mua đã kiểm tra kỹ"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", disputeDeal.transactionId(), disputeCancelId)
                .then().statusCode(200)
                .body("status", equalTo("CHO_XU_LY"))
                .body("escalationReason", equalTo("CANCEL_DISPUTE"))
                .body("cancellationRequest.status", equalTo("TU_CHOI"))
                .body("items[0].status", equalTo("DANG_GIU"))
                .body("listing.status", equalTo("GIU_CHO"))
                .body("actions.canRespondCancel", equalTo(true)); // Seller can still change mind & agree before moderator decides (UC-29 Alt 4)

        // FR-12 / P1-05: Lock buyer account (BI_KHOA) -> read-only access allowed (inAppCode=null, actions.*=false), writes rejected 403 ACCOUNT_RESTRICTED
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', "
                        + "ly_do_han_che = 'Điểm uy tín thấp', khoa_den_ngay = CURRENT_TIMESTAMP + INTERVAL '14 days' WHERE user_id = ?",
                buyer.id()
        );

        given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions")
                .then().statusCode(200)
                .body("pendingActionCount", equalTo(0));

        given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", disputeDeal.transactionId())
                .then().statusCode(200)
                .body("otp.inAppCode", nullValue())
                .body("actions.canVerifyOtp", equalTo(false))
                .body("actions.canReissueOtp", equalTo(false))
                .body("actions.canRequestCancel", equalTo(false))
                .body("actions.canViewHandoverPhoto", equalTo(true));

        given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}/handover-photo", disputeDeal.transactionId())
                .then().statusCode(200);

        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("otp", "123456"))
                .post("/api/v1/transactions/{id}/complete", disputeDeal.transactionId())
                .then().statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"));
    }

    @Test
    @DisplayName("Đa ảnh bàn giao (2 & 6 ảnh), bảo toàn lý do vô hiệu OTP cũ, AGREE khi tin HET_HAN/người bán BI_KHOA và TU_CHOI -> AGREE (UC-29 Alt 4)")
    void multiPhotoUpload_historicalOtpReasonPreservation_expiredAndLockedSellerReopen_andRejectToAgree() {
        Account seller = createMember("SellerEdge", true, "HOAT_DONG", 100);
        Account buyer = createMember("BuyerEdge", true, "HOAT_DONG", 100);
        Account outsider = createMember("OutsiderEdge", true, "HOAT_DONG", 100);

        // 1. Multi-photo files upload: 6 photos -> 400 INVALID_MEDIA; 2 photos -> 200 & both stream with strict auth
        SeededDeal multiDeal = seedDeal(seller.id(), buyer.id(), 140000, 1, "DANG_GIAO", Instant.now().minus(1, ChronoUnit.HOURS));
        byte[] jpeg = HandoverTestImages.sampleJpeg();
        byte[] png = HandoverTestImages.samplePng();

        given().auth().oauth2(seller.token())
                .multiPart("files", "1.jpg", jpeg, "image/jpeg")
                .multiPart("files", "2.jpg", jpeg, "image/jpeg")
                .multiPart("files", "3.jpg", jpeg, "image/jpeg")
                .multiPart("files", "4.jpg", jpeg, "image/jpeg")
                .multiPart("files", "5.jpg", jpeg, "image/jpeg")
                .multiPart("files", "6.jpg", jpeg, "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", multiDeal.transactionId())
                .then().statusCode(400)
                .body("code", equalTo("INVALID_MEDIA"));

        var deliveredRes = given().auth().oauth2(seller.token())
                .multiPart("files", "front.jpg", jpeg, "image/jpeg")
                .multiPart("files", "angle2.png", png, "image/png")
                .post("/api/v1/transactions/{id}/deliver", multiDeal.transactionId())
                .then().statusCode(200)
                .body("handoverProof.photos", hasSize(2))
                .body("handoverProof.photos[0].contentType", equalTo("image/jpeg"))
                .body("handoverProof.photos[1].contentType", equalTo("image/png"))
                .extract();

        String photo0Id = deliveredRes.jsonPath().getString("handoverProof.photos[0].id");
        String photo1Id = deliveredRes.jsonPath().getString("handoverProof.photos[1].id");

        given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}/handover-photos/{photoId}", multiDeal.transactionId(), photo0Id)
                .then().statusCode(200)
                .contentType("image/jpeg")
                .header("Cache-Control", containsString("no-store"));
        given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}/handover-photos/{photoId}", multiDeal.transactionId(), photo1Id)
                .then().statusCode(200)
                .contentType("image/png")
                .header("Cache-Control", containsString("no-store"));
        given().auth().oauth2(outsider.token())
                .get("/api/v1/transactions/{id}/handover-photos/{photoId}", multiDeal.transactionId(), photo1Id)
                .then().statusCode(403)
                .body("code", equalTo("TRANSACTION_FORBIDDEN"));

        // Reissue OTP once so first OTP has historical ly_do_vo_hieu = 'CAP_LAI'
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/transactions/{id}/otp/reissue", multiDeal.transactionId())
                .then().statusCode(200);

        // 2. FR-13: AGREE on expired listing -> item KHA_DUNG, listing transitions to HET_HAN (not CONG_KHAI)
        String expiredCancelId = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", multiDeal.transactionId())
                .then().statusCode(201)
                .extract().jsonPath().getString("cancellationRequest.id");

        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("decision", "AGREE"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", multiDeal.transactionId(), expiredCancelId)
                .then().statusCode(200)
                .body("status", equalTo("HUY"))
                .body("listing.status", equalTo("HET_HAN"))
                .body("items[0].status", equalTo("KHA_DUNG"));

        // Historical CAP_LAI reason must remain preserved while only the active OTP got DA_HUY_GIAO_DICH
        List<String> invalidationReasons = db.queryForList(
                "SELECT ly_do_vo_hieu FROM ma_xac_nhan_otp WHERE ma_giao_dich = ? ORDER BY thoi_diem_phat ASC",
                String.class,
                multiDeal.transactionId()
        );
        assertThat(invalidationReasons).containsExactly("CAP_LAI", "DA_HUY_GIAO_DICH");

        // 3. UC-29 Alt 4: TU_CHOI -> counterparty changes mind and responds AGREE before moderator decides -> HUY + CONG_KHAI
        SeededDeal flipDeal = seedDeal(seller.id(), buyer.id(), 90000, 1, "DANG_GIAO", Instant.now().plus(15, ChronoUnit.DAYS));
        given().auth().oauth2(seller.token())
                .multiPart("file", "f.jpg", jpeg, "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", flipDeal.transactionId())
                .then().statusCode(200);

        String flipCancelId = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "ITEM_NOT_AS_DESCRIBED", "reasonNote", "Không đúng phiên bản"))
                .post("/api/v1/transactions/{id}/cancel-requests", flipDeal.transactionId())
                .then().statusCode(201)
                .extract().jsonPath().getString("cancellationRequest.id");

        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("decision", "REJECT", "responseNote", "Cần kiểm tra lại"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", flipDeal.transactionId(), flipCancelId)
                .then().statusCode(200)
                .body("status", equalTo("CHO_XU_LY"))
                .body("cancellationRequest.status", equalTo("TU_CHOI"))
                .body("items[0].status", equalTo("DANG_GIU"));

        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("decision", "AGREE", "responseNote", "Sau khi trao đổi lại, đồng ý hủy"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", flipDeal.transactionId(), flipCancelId)
                .then().statusCode(200)
                .body("status", equalTo("HUY"))
                .body("cancellationRequest.status", equalTo("DONG_Y"))
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("items[0].status", equalTo("KHA_DUNG"));

        // 4. FR-12: AGREE when seller is BI_KHOA -> item KHA_DUNG, listing transitions to DA_RUT (never reopened to CONG_KHAI)
        SeededDeal lockedSellerDeal = seedDeal(seller.id(), buyer.id(), 65000, 1, "DANG_GIAO", Instant.now().plus(15, ChronoUnit.DAYS));
        given().auth().oauth2(seller.token())
                .multiPart("file", "ls.jpg", jpeg, "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", lockedSellerDeal.transactionId())
                .then().statusCode(200);

        String lockedSellerCancelId = given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", lockedSellerDeal.transactionId())
                .then().statusCode(201)
                .extract().jsonPath().getString("cancellationRequest.id");

        // Lock seller account before buyer agrees
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', "
                        + "ly_do_han_che = 'Vi phạm chính sách', khoa_den_ngay = CURRENT_TIMESTAMP + INTERVAL '14 days' WHERE user_id = ?",
                seller.id()
        );

        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("decision", "AGREE"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", lockedSellerDeal.transactionId(), lockedSellerCancelId)
                .then().statusCode(200)
                .body("status", equalTo("HUY"))
                .body("listing.status", equalTo("DA_RUT"))
                .body("items[0].status", equalTo("KHA_DUNG"));
    }

    @Test
    @DisplayName("Wave 2 P0: Phân biệt chính xác ROLE_SENIOR_ADMIN vs ROLE_MODERATOR, seller/buyer Zero-PII, chặn VO_HIEU_HOA (401) & CHO_KICH_HOAT (403), kiểm đủ header ảnh")
    void wave2_adminRoleDistinction_disabledAndPendingAccounts_andHandoverPhotoHeaders() {
        Account seller = createMember("SellerW2", true, "HOAT_DONG", 112);
        Account buyer = createMember("BuyerW2", true, "HOAT_DONG", 104);
        Account moderator = createAdmin("KIEM_DUYET_VIEN");
        Account seniorAdmin = createAdmin("QUAN_TRI_VIEN_CAP_CAO");
        Account pendingUser = createMember("PendingW2", false, "CHO_KICH_HOAT", 0);
        Account disabledUser = createMember("DisabledW2", true, "HOAT_DONG", 100);

        SeededDeal deal = seedDeal(seller.id(), buyer.id(), 150000, 1, "DANG_GIAO", Instant.now().plus(20, ChronoUnit.DAYS));
        given().auth().oauth2(seller.token())
                .multiPart("file", "handover.jpg", HandoverTestImages.sampleJpeg(), "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", deal.transactionId())
                .then().statusCode(200);

        // Disable account after login to verify live session rejection (401) across ALL GET and POST endpoints
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'VO_HIEU_HOA' WHERE user_id = ?", disabledUser.id());

        // ROLE_MODERATOR sees viewerRole=MODERATOR + BOTH seller & buyer Zero-PII summaries + all write actions false
        given().auth().oauth2(moderator.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .body("viewerRole", equalTo("MODERATOR"))
                .body("seller.id", equalTo(seller.id().toString()))
                .body("seller.reputationScore", equalTo(112))
                .body("seller", not(hasKey("email")))
                .body("seller", not(hasKey("mssv")))
                .body("buyer.id", equalTo(buyer.id().toString()))
                .body("buyer.reputationScore", equalTo(104))
                .body("buyer", not(hasKey("email")))
                .body("buyer", not(hasKey("mssv")))
                .body("otp.inAppCode", nullValue())
                .body("actions.canReportDelivered", equalTo(false))
                .body("actions.canVerifyOtp", equalTo(false))
                .body("actions.canReissueOtp", equalTo(false))
                .body("actions.canRequestCancel", equalTo(false))
                .body("actions.canRespondCancel", equalTo(false))
                .body("actions.canViewHandoverPhoto", equalTo(true));

        // ROLE_SENIOR_ADMIN gets exact viewerRole=SENIOR_ADMIN (never collapsed to MODERATOR!)
        given().auth().oauth2(seniorAdmin.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .body("viewerRole", equalTo("SENIOR_ADMIN"))
                .body("seller.id", equalTo(seller.id().toString()))
                .body("buyer.id", equalTo(buyer.id().toString()))
                .body("otp.inAppCode", nullValue())
                .body("actions.canReportDelivered", equalTo(false))
                .body("actions.canVerifyOtp", equalTo(false))
                .body("actions.canReissueOtp", equalTo(false))
                .body("actions.canRequestCancel", equalTo(false))
                .body("actions.canRespondCancel", equalTo(false))
                .body("actions.canViewHandoverPhoto", equalTo(true));

        // Verify full security headers on /handover-photo including Content-Length & Content-Disposition: inline
        var photoResponse = given().auth().oauth2(seniorAdmin.token())
                .get("/api/v1/transactions/{id}/handover-photo", deal.transactionId())
                .then().statusCode(200)
                .contentType("image/jpeg")
                .header("Content-Disposition", equalTo("inline"))
                .header("Cache-Control", containsString("private"))
                .header("Cache-Control", containsString("no-store"))
                .header("Pragma", equalTo("no-cache"))
                .header("Vary", containsString("Authorization"))
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .header("Content-Length", notNullValue())
                .extract();
        assertThat(Integer.parseInt(photoResponse.header("Content-Length")))
                .isEqualTo(photoResponse.asByteArray().length);

        // VO_HIEU_HOA rejected with 401 across ALL GET and POST transaction endpoints
        given().auth().oauth2(disabledUser.token()).get("/api/v1/transactions").then().statusCode(401);
        given().auth().oauth2(disabledUser.token()).get("/api/v1/transactions/{id}", deal.transactionId()).then().statusCode(401);
        given().auth().oauth2(disabledUser.token()).get("/api/v1/transactions/{id}/handover-photo", deal.transactionId()).then().statusCode(401);
        given().auth().oauth2(disabledUser.token())
                .contentType(ContentType.JSON).body(Map.of("otp", "123456"))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId()).then().statusCode(401);
        given().auth().oauth2(disabledUser.token())
                .contentType(ContentType.JSON).body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", deal.transactionId()).then().statusCode(401);

        // CHO_KICH_HOAT rejected with 403 across ALL GET and POST transaction endpoints
        given().auth().oauth2(pendingUser.token()).get("/api/v1/transactions").then().statusCode(403);
        given().auth().oauth2(pendingUser.token()).get("/api/v1/transactions/{id}", deal.transactionId()).then().statusCode(403);
        given().auth().oauth2(pendingUser.token()).get("/api/v1/transactions/{id}/handover-photo", deal.transactionId()).then().statusCode(403);
        given().auth().oauth2(pendingUser.token())
                .contentType(ContentType.JSON).body(Map.of("otp", "123456"))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId()).then().statusCode(403);
        given().auth().oauth2(pendingUser.token())
                .contentType(ContentType.JSON).body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", deal.transactionId()).then().statusCode(403);
    }

    @Test
    @DisplayName("Wave 2 P1: Tìm kiếm q thoát wildcard LIKE an toàn, counts đầy đủ kể cả tab rỗng và sắp xếp ưu tiên needsViewerAction DESC")
    void wave2_listSearchWildcardEscaping_liveTabCounts_andPriorityOrdering() {
        Account seller = createMember("UniqueSellerName", true, "HOAT_DONG", 110);
        Account buyer = createMember("CounterpartyMinh", true, "HOAT_DONG", 105);

        // 1. Older DANG_GIAO deal (needs seller action!)
        SeededDeal urgentDeal = seedDeal(seller.id(), buyer.id(), 120000, 1, "DANG_GIAO", Instant.now().plus(20, ChronoUnit.DAYS));
        db.update(
                "UPDATE tin_dangs SET tieu_de = 'Đèn bàn 100% mới_KTX' WHERE ma_tin = ?",
                urgentDeal.listingId()
        );
        db.update(
                "UPDATE giao_dichs SET dia_diem_hen = 'Sảnh B4 KTX Khu A', updated_at = CURRENT_TIMESTAMP - INTERVAL '2 hours' WHERE ma_giao_dich = ?",
                urgentDeal.transactionId()
        );

        // 2. Delivered CHO_XAC_NHAN deal (seller waiting, buyer action required)
        SeededDeal waitingDeal = seedDeal(seller.id(), buyer.id(), 90000, 1, "DANG_GIAO", Instant.now().plus(20, ChronoUnit.DAYS));
        db.update(
                "UPDATE tin_dangs SET tieu_de = 'Quạt bàn Senko phòng trọ' WHERE ma_tin = ?",
                waitingDeal.listingId()
        );
        given().auth().oauth2(seller.token())
                .multiPart("file", "w.jpg", HandoverTestImages.sampleJpeg(), "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", waitingDeal.transactionId())
                .then().statusCode(200);

        // 3. Brand-new completed HOAN_TAT deal (newest updated_at, does NOT need action)
        SeededDeal completedDeal = seedDeal(seller.id(), buyer.id(), 60000, 1, "DANG_GIAO", Instant.now().plus(20, ChronoUnit.DAYS));
        db.update(
                "UPDATE tin_dangs SET tieu_de = 'Giáo trình Giải tích 1' WHERE ma_tin = ?",
                completedDeal.listingId()
        );
        given().auth().oauth2(seller.token())
                .multiPart("file", "c.jpg", HandoverTestImages.sampleJpeg(), "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", completedDeal.transactionId())
                .then().statusCode(200);
        String completeOtp = given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", completedDeal.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", completeOtp))
                .post("/api/v1/transactions/{id}/complete", completedDeal.transactionId())
                .then().statusCode(200);
        db.update(
                "UPDATE giao_dichs SET updated_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes' WHERE ma_giao_dich = ?",
                completedDeal.transactionId()
        );

        // Seller lists ALL: urgent DANG_GIAO (2h old) MUST appear BEFORE newer HOAN_TAT (+5m)!
        given().auth().oauth2(seller.token())
                .get("/api/v1/transactions")
                .then().statusCode(200)
                .header("Pragma", equalTo("no-cache"))
                .header("Cache-Control", containsString("no-store"))
                .body("pendingActionCount", equalTo(1))
                .body("counts.all", equalTo(3))
                .body("counts.actionRequired", equalTo(1))
                .body("counts.dangGiao", equalTo(1))
                .body("counts.choXacNhan", equalTo(1))
                .body("counts.choXuLy", equalTo(0))
                .body("counts.hoanTat", equalTo(1))
                .body("counts.huy", equalTo(0))
                .body("items", hasSize(3))
                .body("items[0].id", equalTo(urgentDeal.transactionId().toString()))
                .body("items[0].needsViewerAction", equalTo(true))
                .body("items[1].id", equalTo(completedDeal.transactionId().toString()))
                .body("items[2].autoEscalateAt", notNullValue());

        // Filtering an EMPTY status tab (HUY) STILL returns accurate non-zero counts for all other tabs!
        given().auth().oauth2(seller.token())
                .queryParam("status", "HUY")
                .get("/api/v1/transactions")
                .then().statusCode(200)
                .body("items", hasSize(0))
                .body("totalElements", equalTo(0))
                .body("counts.all", equalTo(3))
                .body("counts.actionRequired", equalTo(1))
                .body("counts.dangGiao", equalTo(1))
                .body("counts.choXacNhan", equalTo(1))
                .body("counts.hoanTat", equalTo(1));

        // SQL LIKE wildcard escaping: q="100%" and q="mới_KTX" match ONLY literal title (never all 3 rows!)
        given().auth().oauth2(seller.token())
                .queryParam("q", "100%")
                .get("/api/v1/transactions")
                .then().statusCode(200)
                .body("items", hasSize(1))
                .body("counts.all", equalTo(1))
                .body("items[0].id", equalTo(urgentDeal.transactionId().toString()));

        given().auth().oauth2(seller.token())
                .queryParam("q", "mới_KTX")
                .get("/api/v1/transactions")
                .then().statusCode(200)
                .body("items", hasSize(1))
                .body("items[0].id", equalTo(urgentDeal.transactionId().toString()));

        // Counterparty search works, and viewer's own displayName NEVER produces false-positive matches!
        given().auth().oauth2(seller.token())
                .queryParam("q", "CounterpartyMinh")
                .get("/api/v1/transactions")
                .then().statusCode(200)
                .body("items", hasSize(3));

        given().auth().oauth2(seller.token())
                .queryParam("q", "UniqueSellerName")
                .get("/api/v1/transactions")
                .then().statusCode(200)
                .body("items", hasSize(0))
                .body("counts.all", equalTo(0));
    }

    @Test
    @DisplayName("Wave 2 P0/P1: Telemetry OTP (ttlSeconds, reissueCount, autoEscalateRemainingSeconds), HET_HAN bền vững, OTP_LOCKED_MAX_ATTEMPTS, không vấp VERSION_CONFLICT khi quá hạn 24h & chặn combo hỏng trạng thái")
    void wave2_otpTelemetry_hetHanPersistence_lockoutTimeline_overdueRetry_andComboGuard() {
        Account seller = createMember("SellerTel", true, "HOAT_DONG", 100);
        Account buyer = createMember("BuyerTel", true, "HOAT_DONG", 100);

        SeededDeal deal = seedDeal(seller.id(), buyer.id(), 130000, 1, "DANG_GIAO", Instant.now().plus(20, ChronoUnit.DAYS));
        given().auth().oauth2(seller.token())
                .multiPart("file", "t.jpg", HandoverTestImages.sampleJpeg(), "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", deal.transactionId())
                .then().statusCode(200)
                .body("autoEscalateRemainingSeconds", greaterThan(0))
                .body("otp.ttlSeconds", equalTo(600))
                .body("otp.reissueCount", equalTo(0));

        // 1. 5 wrong attempts -> persists OTP_LOCKED_MAX_ATTEMPTS timeline event!
        String firstCode = given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");
        String wrongCode = firstCode.equals("000000") ? "999999" : "000000";

        for (int i = 0; i < 4; i++) {
            given().auth().oauth2(buyer.token())
                    .contentType(ContentType.JSON).body(Map.of("otp", wrongCode))
                    .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                    .then().statusCode(400);
        }
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", wrongCode))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_ATTEMPTS_EXCEEDED"));

        given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .body("otp.status", equalTo("EXHAUSTED"))
                .body("timeline.action", hasItem("OTP_LOCKED_MAX_ATTEMPTS"));

        // 2. Reissue -> reissueCount increments to 1, then simulate 10-min expiry
        String secondCode = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/transactions/{id}/otp/reissue", deal.transactionId())
                .then().statusCode(200)
                .body("otp.reissueCount", equalTo(1))
                .body("otp.ttlSeconds", equalTo(600))
                .extract().jsonPath().getString("otp.inAppCode");

        UUID secondOtpId = db.queryForObject(
                "SELECT id FROM ma_xac_nhan_otp WHERE ma_giao_dich = ? AND NOT da_dung AND NOT bi_vo_hieu",
                UUID.class, deal.transactionId());
        // Simulate 11 minutes passing across the transaction's OTP timeline (preserving chronological issue order)
        db.update(
                "UPDATE ma_xac_nhan_otp SET thoi_diem_phat = thoi_diem_phat - INTERVAL '11 minutes', "
                        + "thoi_diem_het_han = thoi_diem_het_han - INTERVAL '11 minutes' WHERE ma_giao_dich = ?",
                deal.transactionId()
        );

        // POST /complete on expired OTP MUST persist bi_vo_hieu = TRUE, ly_do_vo_hieu = 'HET_HAN', otp_ciphertext = NULL!
        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", secondCode))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_EXPIRED"))
                .body("locked", equalTo(false));

        Map<String, Object> expiredRow = db.queryForMap(
                "SELECT bi_vo_hieu, ly_do_vo_hieu, otp_ciphertext FROM ma_xac_nhan_otp WHERE id = ?",
                secondOtpId
        );
        assertThat(expiredRow.get("bi_vo_hieu")).isEqualTo(true);
        assertThat(expiredRow.get("ly_do_vo_hieu")).isEqualTo("HET_HAN");
        assertThat(expiredRow.get("otp_ciphertext")).isNull();

        // Subsequent GET MUST still report otp.status = EXPIRED (not INVALIDATED!), and repeat POST /complete returns locked=false
        given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", deal.transactionId())
                .then().statusCode(200)
                .body("otp.status", equalTo("EXPIRED"));

        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", secondCode))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_EXPIRED"))
                .body("locked", equalTo(false));

        // 3. Reissue again (reissueCount = 2), simulate >24h overdue WITHOUT running scheduler:
        // Wrong OTP must NOT bump giao_dichs.version so immediate retry with same version succeeds!
        var thirdRes = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/transactions/{id}/otp/reissue", deal.transactionId())
                .then().statusCode(200)
                .body("otp.reissueCount", equalTo(2))
                .extract();
        String thirdCode = thirdRes.jsonPath().getString("otp.inAppCode");
        long cachedVersion = thirdRes.jsonPath().getLong("version");
        String wrongThird = thirdCode.equals("111111") ? "222222" : "111111";

        db.update(
                "UPDATE giao_dichs SET thoi_diem_bao_giao = CURRENT_TIMESTAMP - INTERVAL '26 hours' WHERE ma_giao_dich = ?",
                deal.transactionId()
        );

        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", wrongThird, "version", cachedVersion))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(400)
                .body("code", equalTo("OTP_INVALID"));

        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", thirdCode, "version", cachedVersion))
                .post("/api/v1/transactions/{id}/complete", deal.transactionId())
                .then().statusCode(200)
                .body("status", equalTo("HOAN_TAT"))
                .body("autoEscalateRemainingSeconds", nullValue());

        // 4. Combo item-state guard: if 1 of 2 combo items is not DANG_GIU (e.g. KHA_DUNG), /complete rejects 409 and rolls back!
        SeededDeal badCombo = seedDeal(seller.id(), buyer.id(), 200000, 2, "DANG_GIAO", Instant.now().plus(20, ChronoUnit.DAYS));
        given().auth().oauth2(seller.token())
                .multiPart("file", "cb.jpg", HandoverTestImages.sampleJpeg(), "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", badCombo.transactionId())
                .then().statusCode(200);
        String comboOtp = given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", badCombo.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");

        db.update("UPDATE do_vats SET trang_thai = 'KHA_DUNG' WHERE ma_vat = ?", badCombo.itemIds().get(1));

        given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", comboOtp))
                .post("/api/v1/transactions/{id}/complete", badCombo.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));

        // Verify rollback preserved CHO_XAC_NHAN and item #1 remained DANG_GIU
        assertThat(db.queryForObject("SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, badCombo.transactionId()))
                .isEqualTo("CHO_XAC_NHAN");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, badCombo.itemIds().get(0)))
                .isEqualTo("DANG_GIU");

        // 5. Helpful 409 guidance when responder tries to create a 2nd cancel request on TU_CHOI
        String reqId = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("reasonCode", "COMBO_MISSING_ITEM"))
                .post("/api/v1/transactions/{id}/cancel-requests", badCombo.transactionId())
                .then().statusCode(201)
                .extract().jsonPath().getString("cancellationRequest.id");
        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON).body(Map.of("decision", "REJECT", "responseNote", "Đủ món"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", badCombo.transactionId(), reqId)
                .then().statusCode(200);
        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON).body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", badCombo.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("CANCEL_REQUEST_ALREADY_PENDING"))
                .body("message", containsString("Đồng ý"));
    }

    @Test
    @DisplayName("Wave 4: Toàn bộ thông báo lỗi và ghi chú lịch sử giao dịch không chứa thuật ngữ nội bộ (UC-/FR-/NFR-/KDV/OTP/actor/user)")
    void wave4_userFacingMessagesAndTimelineNotesContainZeroInternalJargon() {
        Pattern forbiddenJargon = Pattern.compile(
                "(?i)(UC-\\d+|FR-\\d+|NFR-\\d+|P3-02|\\bKDV\\b|\\bOTP\\b|\\bactor\\b|\\buser\\b|vô hiệu hóa mã cũ|giữ chỗ vẫn được bảo toàn)"
        );
        Pattern forbiddenRawEnums = Pattern.compile("\\b(HOAN_TAT|HUY|AGREE|REJECT|SELLER|BUYER)\\b");

        List<String> collectedTexts = new java.util.ArrayList<>();
        java.util.function.Consumer<String> recordAndVerify = text -> {
            assertThat(text).isNotBlank();
            collectedTexts.add(text);
            assertThat(forbiddenJargon.matcher(text).find())
                    .as("User-facing text leaked internal jargon: %s", text)
                    .isFalse();
            assertThat(forbiddenRawEnums.matcher(text).find())
                    .as("User-facing text leaked raw enum name: %s", text)
                    .isFalse();
        };

        Account seller = createMember("SellerCopy", true, "HOAT_DONG", 100);
        Account buyer = createMember("BuyerCopy", true, "HOAT_DONG", 100);
        byte[] jpeg = HandoverTestImages.sampleJpeg();

        // 1. Invalid role filter -> natural Vietnamese
        recordAndVerify.accept(given().auth().oauth2(buyer.token())
                .queryParam("role", "INVALID")
                .get("/api/v1/transactions")
                .then().statusCode(400)
                .extract().jsonPath().getString("message"));

        // 2. Deliver on GIU_CHO -> no (UC-26)
        SeededDeal holdDeal = seedDeal(seller.id(), buyer.id(), 50000, 1, "GIU_CHO", Instant.now().plus(10, ChronoUnit.DAYS));
        recordAndVerify.accept(given().auth().oauth2(seller.token())
                .multiPart("file", "p.jpg", jpeg, "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", holdDeal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"))
                .extract().jsonPath().getString("message"));

        // 3. Pre-delivery cancel request on DANG_GIAO -> no (UC-24) / (UC-27)
        SeededDeal otpDeal = seedDeal(seller.id(), buyer.id(), 95000, 1, "DANG_GIAO", Instant.now().plus(15, ChronoUnit.DAYS));
        String preDeliveryCancelMsg = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", otpDeal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"))
                .extract().jsonPath().getString("message");
        assertThat(preDeliveryCancelMsg).isEqualTo("Giao dịch chưa được báo giao — hãy dùng chức năng hủy giữ chỗ trước bàn giao.");
        recordAndVerify.accept(preDeliveryCancelMsg);

        // 4. Missing handover photo
        recordAndVerify.accept(given().auth().oauth2(seller.token())
                .multiPart("note", "Thiếu ảnh")
                .post("/api/v1/transactions/{id}/deliver", otpDeal.transactionId())
                .then().statusCode(400)
                .body("code", equalTo("HANDOVER_PHOTO_REQUIRED"))
                .extract().jsonPath().getString("message"));

        // 5. Deliver with default timeline note + seller active reissue error
        given().auth().oauth2(seller.token())
                .multiPart("file", "p.jpg", jpeg, "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", otpDeal.transactionId())
                .then().statusCode(200);
        recordAndVerify.accept(given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/transactions/{id}/otp/reissue", otpDeal.transactionId())
                .then().statusCode(409)
                .extract().jsonPath().getString("message"));

        // 6. Wrong OTP 1..4 -> crisp "Còn X/5 lượt thử." & 5th -> exhausted + timeline note
        String firstCode = given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", otpDeal.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");
        String wrongCode = firstCode.equals("000000") ? "999999" : "000000";

        String wrong1Msg = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", wrongCode))
                .post("/api/v1/transactions/{id}/complete", otpDeal.transactionId())
                .then().statusCode(400)
                .body("code", equalTo("OTP_INVALID"))
                .extract().jsonPath().getString("message");
        assertThat(wrong1Msg).isEqualTo("Mã xác nhận không đúng. Còn 4/5 lượt thử.");
        recordAndVerify.accept(wrong1Msg);

        for (int i = 0; i < 3; i++) {
            recordAndVerify.accept(given().auth().oauth2(buyer.token())
                    .contentType(ContentType.JSON).body(Map.of("otp", wrongCode))
                    .post("/api/v1/transactions/{id}/complete", otpDeal.transactionId())
                    .then().statusCode(400)
                    .extract().jsonPath().getString("message"));
        }
        String exhaustedMsg = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", wrongCode))
                .post("/api/v1/transactions/{id}/complete", otpDeal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_ATTEMPTS_EXCEEDED"))
                .extract().jsonPath().getString("message");
        assertThat(exhaustedMsg).isEqualTo("Đã nhập sai 5/5 lượt. Hãy yêu cầu gửi lại mã mới — đồ vật vẫn được giữ chỗ.");
        recordAndVerify.accept(exhaustedMsg);

        // Repeat on already-exhausted code
        recordAndVerify.accept(given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", wrongCode))
                .post("/api/v1/transactions/{id}/complete", otpDeal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_ATTEMPTS_EXCEEDED"))
                .extract().jsonPath().getString("message"));

        // 7. Reissue -> clean timeline note -> expire -> clean OTP_EXPIRED message
        String secondCode = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/transactions/{id}/otp/reissue", otpDeal.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");
        db.update(
                "UPDATE ma_xac_nhan_otp SET thoi_diem_phat = thoi_diem_phat - INTERVAL '11 minutes', "
                        + "thoi_diem_het_han = thoi_diem_het_han - INTERVAL '11 minutes' WHERE ma_giao_dich = ?",
                otpDeal.transactionId()
        );
        String expiredMsg = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", secondCode))
                .post("/api/v1/transactions/{id}/complete", otpDeal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_EXPIRED"))
                .extract().jsonPath().getString("message");
        assertThat(expiredMsg).isEqualTo("Mã xác nhận đã hết hạn. Hãy gửi lại mã mới để tiếp tục.");
        recordAndVerify.accept(expiredMsg);

        // 8. 24h overdue escalation -> clean timeline note, then reissue & complete -> clean timeline note & replay error
        String thirdCode = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/transactions/{id}/otp/reissue", otpDeal.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");
        db.update(
                "UPDATE giao_dichs SET thoi_diem_bao_giao = CURRENT_TIMESTAMP - INTERVAL '25 hours' WHERE ma_giao_dich = ?",
                otpDeal.transactionId()
        );
        handoverService.reconcileOverdueDeliveries(50);

        List<String> otpTimelineNotes = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", thirdCode))
                .post("/api/v1/transactions/{id}/complete", otpDeal.transactionId())
                .then().statusCode(200)
                .extract().jsonPath().getList("timeline.note", String.class);
        assertThat(otpTimelineNotes).contains(
                "Nhập sai mã xác nhận 5 lần.",
                "Đã gửi lại mã xác nhận mới.",
                "Quá 24 giờ chưa xác nhận, chuyển đội kiểm duyệt xem xét.",
                "Người mua đã xác nhận nhận hàng."
        );
        otpTimelineNotes.forEach(recordAndVerify);

        // Replay after completion + cancel on completed deal (no raw HOAN_TAT enum!)
        recordAndVerify.accept(given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("otp", thirdCode))
                .post("/api/v1/transactions/{id}/complete", otpDeal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("OTP_ALREADY_USED"))
                .extract().jsonPath().getString("message"));
        recordAndVerify.accept(given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", otpDeal.transactionId())
                .then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"))
                .extract().jsonPath().getString("message"));

        // 9. Cancel reject (default note) -> invalid decision -> cancel agree (default note) -> cancel on HUY deal
        SeededDeal cancelDeal = seedDeal(seller.id(), buyer.id(), 85000, 1, "DANG_GIAO", Instant.now().plus(15, ChronoUnit.DAYS));
        given().auth().oauth2(seller.token())
                .multiPart("file", "p.jpg", jpeg, "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", cancelDeal.transactionId())
                .then().statusCode(200);
        String reqId = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("reasonCode", "DEFECT_AT_HANDOVER"))
                .post("/api/v1/transactions/{id}/cancel-requests", cancelDeal.transactionId())
                .then().statusCode(201)
                .extract().jsonPath().getString("cancellationRequest.id");

        recordAndVerify.accept(given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON).body(Map.of("decision", "MAYBE"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", cancelDeal.transactionId(), reqId)
                .then().statusCode(400)
                .extract().jsonPath().getString("message"));

        given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON).body(Map.of("decision", "REJECT"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", cancelDeal.transactionId(), reqId)
                .then().statusCode(200);

        // Requester & responder duplicate cancel messages after REJECT
        recordAndVerify.accept(given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", cancelDeal.transactionId())
                .then().statusCode(409)
                .extract().jsonPath().getString("message"));
        recordAndVerify.accept(given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON).body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", cancelDeal.transactionId())
                .then().statusCode(409)
                .extract().jsonPath().getString("message"));

        // Agree without responseNote -> default timeline note
        List<String> cancelTimelineNotes = given().auth().oauth2(seller.token())
                .contentType(ContentType.JSON).body(Map.of("decision", "AGREE"))
                .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", cancelDeal.transactionId(), reqId)
                .then().statusCode(200)
                .extract().jsonPath().getList("timeline.note", String.class);
        assertThat(cancelTimelineNotes).contains(
                "Từ chối yêu cầu hủy, chuyển đội kiểm duyệt xem xét.",
                "Hai bên đã đồng ý hủy giao dịch."
        );
        cancelTimelineNotes.forEach(recordAndVerify);

        // Cancel on HUY deal (no raw HUY enum!)
        recordAndVerify.accept(given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON).body(Map.of("reasonCode", "MUTUAL_AGREEMENT"))
                .post("/api/v1/transactions/{id}/cancel-requests", cancelDeal.transactionId())
                .then().statusCode(409)
                .extract().jsonPath().getString("message"));

        // All CancelReasonCode labels are clean
        for (TransactionDtos.CancelReasonCode rc : TransactionDtos.CancelReasonCode.values()) {
            recordAndVerify.accept(rc.label());
        }

        assertThat(collectedTexts.size()).isGreaterThanOrEqualTo(25);
    }
}
