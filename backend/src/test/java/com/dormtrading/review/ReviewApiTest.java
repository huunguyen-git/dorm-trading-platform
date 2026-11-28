package com.dormtrading.review;

import com.dormtrading.catalog.media.LocalDiskMediaStorage;
import com.dormtrading.catalog.media.MediaService;
import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import com.dormtrading.order.OrderNotificationService;
import com.dormtrading.review.reputation.ReputationLedgerService;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

/**
 * Comprehensive API & domain verification for P3-04 Reviews:
 * UC-30 (Create), UC-31 (Edit), UC-32 (Soft-Delete), FR-10 (+2/0/-1/-3/-5 & 15-day +1 bonus),
 * FR-12 (non-violation reversal safety), NFR-01 (private evidence ACL & zero-PII public API),
 * NFR-03 (idempotent create/delete/bonus), and P3-05 forward-compat complaint/moderation locks.
 */
class ReviewApiTest extends BaseIntegrationTest {

    private static final String PASSWORD = "a quiet river beneath stars";

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private ReviewBonusService bonusService;

    @Autowired
    private ReviewEvidenceService evidenceService;

    @Autowired
    private LocalDiskReviewEvidenceStorage evidenceStorage;

    @Autowired
    private LocalDiskMediaStorage mediaStorage;

    @Autowired
    private MediaService mediaService;

    @Autowired
    private ReputationLedgerService reputationLedger;

    @Autowired
    private OrderNotificationService notificationService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private Clock clock;

    @Autowired
    private JdbcTemplate db;

    @MockitoBean
    private JavaMailSender mail;

    private final ConcurrentMap<String, String> otpCodes = new ConcurrentHashMap<>();

    private record Account(UUID id, String email, String studentId, String token) {
    }

    @BeforeEach
    void setup() {
        doAnswer(invocation -> {
            SimpleMailMessage msg = invocation.getArgument(0);
            var matcher = Pattern.compile("[0-9]{6}").matcher(Objects.requireNonNull(msg.getText()));
            if (matcher.find()) {
                otpCodes.put(Objects.requireNonNull(msg.getTo())[0], matcher.group());
            }
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));
    }

    private Account createMember(String label, boolean approved, String accountStatus, int score) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "RV" + suffix;
        String email = "rev_" + suffix + "@student.edu.vn";
        String ip = "10.9." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register(label + " " + suffix, studentId, email, PASSWORD, ip);
        delivery.deliver();
        String code = otpCodes.get(email);
        var challenge = db.queryForMap(
                "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                email
        );
        auth.verify((UUID) challenge.get("id"), email, "REGISTER", code, ip);
        db.update(
                "UPDATE thanh_viens SET profile_approved = ?, trang_thai_tai_khoan = ?, diem_uy_tin = ? WHERE email = ?",
                approved,
                accountStatus,
                score,
                email
        );
        UUID userId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email);
        String token = auth.login(email, PASSWORD, "mobile", ip).token();
        return new Account(userId, email, studentId, token);
    }

    private Account createActiveMember(String label) {
        return createMember(label, true, "HOAT_DONG", 100);
    }

    private Account createAdminWebUser(String label, String dbRole) {
        Account base = createActiveMember(label);
        db.update(
                "INSERT INTO vai_tro_quan_tri(user_id, loai_vai_tro, bat_dau) VALUES (?, ?, ?)",
                base.id(),
                dbRole,
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
        return new Account(base.id(), base.email(), base.studentId(), adminToken);
    }

    private UUID createOrder(Account seller, Account buyer, String status, Instant completedAt, String listingTitle) {
        UUID listingId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        Instant createdAt = (completedAt != null ? completedAt : Instant.now()).minus(Duration.ofDays(1));
        String listingStatus = "HOAN_TAT".equals(status) ? "KET_THUC" : "CONG_KHAI";

        db.update(
                """
                INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, hinh_thuc, trang_thai, created_at, updated_at)
                VALUES (?, ?, ?, 80000, 'BAN_LE', ?, ?, ?)
                """,
                listingId,
                seller.id(),
                listingTitle,
                listingStatus,
                Timestamp.from(createdAt),
                Timestamp.from(createdAt)
        );
        db.update(
                """
                INSERT INTO giao_dichs(
                    ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan,
                    trang_thai, thoi_diem_tao, thoi_diem_hoan_tat, updated_at, version
                ) VALUES (?, ?, ?, ?, 80000, ?, ?, ?, ?, 0)
                """,
                orderId,
                listingId,
                seller.id(),
                buyer.id(),
                status,
                Timestamp.from(createdAt),
                completedAt != null ? Timestamp.from(completedAt) : null,
                Timestamp.from(completedAt != null ? completedAt : createdAt)
        );
        return orderId;
    }

    private static byte[] validJpegWithExifMarker() throws Exception {
        BufferedImage img = new BufferedImage(32, 24, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(40, 120, 200));
        g.fillRect(0, 0, 32, 24);
        g.dispose();

        ByteArrayOutputStream cleanOut = new ByteArrayOutputStream();
        ImageIO.write(img, "jpeg", cleanOut);
        byte[] clean = cleanOut.toByteArray();

        // Inject synthetic APP1 EXIF segment containing GPS/secret marker right after SOI (0xFF 0xD8)
        byte[] exifPayload = "Exif\0\0SECRET_GPS_COORD_10.8782_106.8063".getBytes(StandardCharsets.US_ASCII);
        int segLen = exifPayload.length + 2;
        ByteArrayOutputStream dirty = new ByteArrayOutputStream();
        dirty.write(clean, 0, 2); // SOI
        dirty.write(0xFF);
        dirty.write(0xE1); // APP1
        dirty.write((segLen >> 8) & 0xFF);
        dirty.write(segLen & 0xFF);
        dirty.write(exifPayload);
        dirty.write(clean, 2, clean.length - 2);
        return dirty.toByteArray();
    }

    @Test
    void uc30HappyPathFiveAndFourStarReviewsIdempotencyPublicSummaryAndFiltering() {
        Account seller = createActiveMember("SellerHappy");
        Account buyer1 = createActiveMember("BuyerOne");
        Account buyer2 = createActiveMember("BuyerTwo");

        UUID order5 = createOrder(seller, buyer1, "HOAN_TAT", Instant.now().minus(Duration.ofDays(2)), "Giáo trình Giải tích 1");
        UUID order4 = createOrder(seller, buyer2, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Máy tính Casio fx-580VNX");

        // OrderDetail embeds reviewSummary for completed orders
        given()
                .auth().oauth2(buyer1.token())
                .get("/api/v1/orders/" + order5)
                .then()
                .statusCode(200)
                .body("reviewSummary.canReview", equalTo(true))
                .body("reviewSummary.canEdit", equalTo(false))
                .body("reviewSummary.canDelete", equalTo(false))
                .body("reviewSummary.withinReviewWindow", equalTo(true))
                .body("reviewSummary.daysRemaining", equalTo(13));

        String idempKey = "idem-" + UUID.randomUUID();

        // UC-30: 5-star review -> CHAP_NHAN immediately, public, +2 reputation, seller notified
        Response create5 = given()
                .auth().oauth2(buyer1.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "rating", 5,
                        "comment", "Người bán nhiệt tình, sách rất mới!",
                        "idempotencyKey", idempKey
                ))
                .post("/api/v1/orders/" + order5 + "/review")
                .then()
                .statusCode(201)
                .body("idempotentReplay", equalTo(false))
                .body("review.status", equalTo("CHAP_NHAN"))
                .body("review.publiclyVisible", equalTo(true))
                .body("review.rating", equalTo(5))
                .body("review.appliedScoreDelta", equalTo(2))
                .body("review.currentVersionNo", equalTo(1))
                .body("review.versions", hasSize(1))
                .body("orderReviewState.canReview", equalTo(false))
                .body("orderReviewState.canEdit", equalTo(true))
                .body("orderReviewState.canDelete", equalTo(true))
                .extract().response();
        UUID review5Id = UUID.fromString(create5.jsonPath().getString("review.id"));

        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);

        // Idempotent replay with SAME idempotencyKey -> 200 OK, no second +2!
        given()
                .auth().oauth2(buyer1.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Người bán nhiệt tình, sách rất mới!", "idempotencyKey", idempKey))
                .post("/api/v1/orders/" + order5 + "/review")
                .then()
                .statusCode(200)
                .body("idempotentReplay", equalTo(true))
                .body("review.id", equalTo(review5Id.toString()));
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);

        // Duplicate submit with different/no key -> 409 REVIEW_ALREADY_EXISTS (UC-30 E2)
        given()
                .auth().oauth2(buyer1.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "Gửi lần 2"))
                .post("/api/v1/orders/" + order5 + "/review")
                .then()
                .statusCode(409)
                .body("code", equalTo("REVIEW_ALREADY_EXISTS"));

        // Seller received REVIEW_RECEIVED notification
        given()
                .auth().oauth2(seller.token())
                .get("/api/v1/notifications?unreadOnly=true")
                .then()
                .statusCode(200)
                .body("items[0].type", equalTo("REVIEW_RECEIVED"));

        // UC-30: 4-star review -> CHAP_NHAN immediately, public, 0 score delta (no spurious ledger row)
        given()
                .auth().oauth2(buyer2.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "Máy ổn, giao hơi muộn 10 phút"))
                .post("/api/v1/orders/" + order4 + "/review")
                .then()
                .statusCode(201)
                .body("review.status", equalTo("CHAP_NHAN"))
                .body("review.appliedScoreDelta", equalTo(0));

        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM lich_su_diem_uy_tin WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(1);

        // Public seller reviews endpoint (unauthenticated guest allowed): Zero-PII, rating filter keeps overall summary!
        Response publicResp = given()
                .get("/api/v1/sellers/" + seller.id() + "/reviews?rating=5")
                .then()
                .statusCode(200)
                .body("seller.reputationScore", equalTo(102))
                .body("seller.averageRating", equalTo(4.5f))
                .body("seller.reviewCount", equalTo(2))
                .body("starDistribution.5", equalTo(1))
                .body("starDistribution.4", equalTo(1))
                .body("items", hasSize(1))
                .body("items[0].rating", equalTo(5))
                .body("totalElements", equalTo(1))
                .extract().response();

        String rawPublic = publicResp.asString();
        assertThat(rawPublic).doesNotContain(
                seller.email(),
                buyer1.email(),
                buyer1.studentId(),
                "/api/v1/reviews/evidence/",
                "\"orderId\"",
                order5.toString()
        );
    }

    @Test
    void uc30LowStarModerationPrivateEvidenceExifStrippingAndStrictNfr01Acl() throws Exception {
        Account seller = createActiveMember("SellerLow");
        Account buyer = createActiveMember("BuyerLow");
        Account outsider = createActiveMember("OutsiderLow");
        Account moderator = createAdminWebUser("ModLow", "KIEM_DUYET_VIEN");
        Account seniorAdmin = createAdminWebUser("SeniorLow", "QUAN_TRI_VIEN_CAP_CAO");

        UUID orderId = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Đèn bàn học");

        // UC-30 E3: 1-3 stars with neither comment nor evidence -> 400 REVIEW_DETAILS_REQUIRED
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 2, "comment", "   "))
                .post("/api/v1/orders/" + orderId + "/review")
                .then()
                .statusCode(400)
                .body("code", equalTo("REVIEW_DETAILS_REQUIRED"));

        // Invalid magic bytes -> 400 INVALID_MEDIA
        given()
                .auth().oauth2(buyer.token())
                .multiPart("files", "fake.jpg", "not-an-image".getBytes(StandardCharsets.UTF_8), "image/jpeg")
                .post("/api/v1/orders/" + orderId + "/review/evidence")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_MEDIA"));

        // Non-buyer attempting to upload evidence -> 403 FORBIDDEN
        byte[] dirtyJpeg = validJpegWithExifMarker();
        given()
                .auth().oauth2(seller.token())
                .multiPart("files", "proof.jpg", dirtyJpeg, "image/jpeg")
                .post("/api/v1/orders/" + orderId + "/review/evidence")
                .then()
                .statusCode(403);

        // Buyer uploads valid JPEG with synthetic EXIF GPS marker -> 201, isolated in danh_gia_bang_chungs
        String evidenceIdStr = given()
                .auth().oauth2(buyer.token())
                .multiPart("files", "proof_gps.jpg", dirtyJpeg, "image/jpeg")
                .post("/api/v1/orders/" + orderId + "/review/evidence")
                .then()
                .statusCode(201)
                .body("items", hasSize(1))
                .body("items[0].contentType", equalTo("image/jpeg"))
                .body("items[0].url", containsString("/api/v1/reviews/evidence/"))
                .extract().jsonPath().getString("items[0].id");
        UUID evidenceId = UUID.fromString(evidenceIdStr);

        // Must NOT be stored in public media_files table
        assertThat(db.queryForObject("SELECT COUNT(*) FROM media_files WHERE id = ?", Integer.class, evidenceId)).isZero();
        String storageKey = db.queryForObject("SELECT storage_key FROM danh_gia_bang_chungs WHERE id = ?", String.class, evidenceId);
        assertThat(evidenceStorage.rootDir().resolve(storageKey)).exists();

        // Duplicate UUIDs in evidenceIds rejected (400 INVALID_INPUT)
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 2, "evidenceIds", List.of(evidenceIdStr, evidenceIdStr)))
                .post("/api/v1/orders/" + orderId + "/review")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // NFR-01 Draft ACL (before review submit): buyer/mod/senior -> 200; seller/outsider -> 403; anon -> 401
        given().get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(401);
        given().auth().oauth2(outsider.token()).get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(403);
        given().auth().oauth2(seller.token()).get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(403);
        byte[] downloadedDraft = given()
                .auth().oauth2(buyer.token())
                .get("/api/v1/reviews/evidence/" + evidenceId)
                .then()
                .statusCode(200)
                .header("Cache-Control", containsString("no-store"))
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .extract().asByteArray();
        // Verify EXIF GPS payload was completely stripped!
        assertThat(new String(downloadedDraft, StandardCharsets.ISO_8859_1)).doesNotContain("SECRET_GPS_COORD");

        // UC-30 Alt 1: Submit 2-star review with evidence ONLY -> CHO_XET, NOT public, 0 score delta, notifies buyer only
        String reviewIdStr = given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 2, "evidenceIds", List.of(evidenceIdStr)))
                .post("/api/v1/orders/" + orderId + "/review")
                .then()
                .statusCode(201)
                .body("review.status", equalTo("CHO_XET"))
                .body("review.publiclyVisible", equalTo(false))
                .body("review.appliedScoreDelta", equalTo(0))
                .body("review.queueEnteredAt", notNullValue())
                .body("review.evidence", hasSize(1))
                .extract().jsonPath().getString("review.id");

        // Seller score unchanged, seller NOT notified, buyer received REVIEW_PENDING_MODERATION
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(100);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM thong_baos WHERE nguoi_nhan_id = ?", Integer.class, seller.id()))
                .isZero();
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM thong_baos WHERE nguoi_nhan_id = ? AND loai = 'REVIEW_PENDING_MODERATION'",
                Integer.class,
                buyer.id()
        )).isEqualTo(1);

        // Public seller reviews MUST exclude CHO_XET review
        given()
                .get("/api/v1/sellers/" + seller.id() + "/reviews")
                .then()
                .statusCode(200)
                .body("seller.reviewCount", equalTo(0))
                .body("seller.averageRating", nullValue())
                .body("items", hasSize(0));

        // Seller redaction on OrderDetail, OrderReviewState, and Evidence while CHO_XET:
        given()
                .auth().oauth2(seller.token())
                .get("/api/v1/orders/" + orderId)
                .then()
                .statusCode(200)
                .body("reviewSummary.reviewId", nullValue())
                .body("reviewSummary.rating", nullValue())
                .body("reviewSummary.hasPendingModerationReview", equalTo(true));
        given()
                .auth().oauth2(seller.token())
                .get("/api/v1/orders/" + orderId + "/review")
                .then()
                .statusCode(200)
                .body("review", nullValue())
                .body("hasPendingModerationReview", equalTo(true));

        // NFR-01 ACL while CHO_XET: buyer/mod/senior -> 200; seller/outsider -> 403; anon -> 401
        given().auth().oauth2(buyer.token()).get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(200);
        given().auth().oauth2(moderator.token()).get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(200);
        given().auth().oauth2(seniorAdmin.token()).get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(200);
        given().auth().oauth2(seller.token()).get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(403);
        given().auth().oauth2(outsider.token()).get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(403);
        given().get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(401);

        // Once buyer edits review up to 4* (CHAP_NHAN) keeping evidence, seller CAN now download evidence; outsider STILL 403; public API NEVER leaks evidence!
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "rating", 4,
                        "comment", "Đã trao đổi lại, ổn rồi",
                        "evidenceIds", List.of(evidenceIdStr),
                        "expectedVersion", 0
                ))
                .put("/api/v1/reviews/" + reviewIdStr)
                .then()
                .statusCode(200)
                .body("review.status", equalTo("CHAP_NHAN"));

        given().auth().oauth2(seller.token()).get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(200);
        given().auth().oauth2(outsider.token()).get("/api/v1/reviews/evidence/" + evidenceId).then().statusCode(403);
        String publicAfterEdit = given().get("/api/v1/sellers/" + seller.id() + "/reviews").then().statusCode(200).extract().asString();
        assertThat(publicAfterEdit).doesNotContain(evidenceIdStr, "/api/v1/reviews/evidence/");
    }

    @Test
    void nfr01RedactsUnmoderatedPendingHistoryAndRemovedPendingEvidenceFromSellerAfterUpgradeToAccepted() throws Exception {
        Account seller = createActiveMember("SellerRedact");
        Account buyer = createActiveMember("BuyerRedact");
        Account moderator = createAdminWebUser("ModRedact", "KIEM_DUYET_VIEN");
        Account seniorAdmin = createAdminWebUser("SeniorRedact", "QUAN_TRI_VIEN_CAP_CAO");
        UUID orderId = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Ghế học bài");

        byte[] jpeg = validJpegWithExifMarker();
        String evPending = given()
                .auth().oauth2(buyer.token())
                .multiPart("files", "pending_only.jpg", jpeg, "image/jpeg")
                .post("/api/v1/orders/" + orderId + "/review/evidence")
                .then().statusCode(201).extract().jsonPath().getString("items[0].id");

        // v1: Submit 2-star CHO_XET with private pending comment and evPending
        String reviewId = given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "rating", 2,
                        "comment", "NHAN_XET_CHO_XET_BI_MAT",
                        "evidenceIds", List.of(evPending)
                ))
                .post("/api/v1/orders/" + orderId + "/review")
                .then().statusCode(201)
                .body("review.status", equalTo("CHO_XET"))
                .extract().jsonPath().getString("review.id");

        // v2: Edit CHO_XET -> CHAP_NHAN (5-star) removing evPending
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "rating", 5,
                        "comment", "Đã giải quyết ổn thỏa, rất hài lòng",
                        "evidenceIds", List.of(),
                        "expectedVersion", 0
                ))
                .put("/api/v1/reviews/" + reviewId)
                .then().statusCode(200)
                .body("review.status", equalTo("CHAP_NHAN"))
                .body("review.versions", hasSize(2));

        // Seller viewing GET /orders/{orderId}/review MUST ONLY see CHAP_NHAN v2 (NEVER CHO_XET v1 text, rating, or evPending!)
        Response sellerView = given()
                .auth().oauth2(seller.token())
                .get("/api/v1/orders/" + orderId + "/review")
                .then()
                .statusCode(200)
                .body("review.status", equalTo("CHAP_NHAN"))
                .body("review.versions", hasSize(1))
                .body("review.versions[0].versionNo", equalTo(2))
                .body("review.versions[0].status", equalTo("CHAP_NHAN"))
                .extract().response();
        assertThat(sellerView.asString()).doesNotContain("NHAN_XET_CHO_XET_BI_MAT", evPending);

        // Seller MUST NOT be able to download evPending (403) because it was only ever attached to a CHO_XET version!
        given().auth().oauth2(seller.token()).get("/api/v1/reviews/evidence/" + evPending).then().statusCode(403);

        // Buyer, MODERATOR, and SENIOR_ADMIN still retain full audit access to both versions and evPending (200)
        given().auth().oauth2(buyer.token()).get("/api/v1/orders/" + orderId + "/review")
                .then().statusCode(200).body("review.versions", hasSize(2));
        given().auth().oauth2(moderator.token()).get("/api/v1/orders/" + orderId + "/review")
                .then().statusCode(200).body("review.versions", hasSize(2));
        given().auth().oauth2(buyer.token()).get("/api/v1/reviews/evidence/" + evPending).then().statusCode(200);
        given().auth().oauth2(moderator.token()).get("/api/v1/reviews/evidence/" + evPending).then().statusCode(200);
        given().auth().oauth2(seniorAdmin.token()).get("/api/v1/reviews/evidence/" + evPending).then().statusCode(200);
    }

    @Test
    void uc31EditTransitionsScoreReversalsQueuePreservationEvidenceRetentionAndValidation() throws Exception {
        Account seller = createActiveMember("SellerEdit");
        Account buyer = createActiveMember("BuyerEdit");
        UUID orderId = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(3)), "Bàn học gấp gọn");

        byte[] jpeg = validJpegWithExifMarker();
        String ev1 = given()
                .auth().oauth2(buyer.token())
                .multiPart("files", "e1.jpg", jpeg, "image/jpeg")
                .post("/api/v1/orders/" + orderId + "/review/evidence")
                .then().statusCode(201).extract().jsonPath().getString("items[0].id");

        // v1: Create 5-star (+2 -> 102)
        Response v1 = given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Tuyệt vời", "evidenceIds", List.of(ev1)))
                .post("/api/v1/orders/" + orderId + "/review")
                .then().statusCode(201).extract().response();
        UUID reviewId = UUID.fromString(v1.jsonPath().getString("review.id"));
        Instant publishedAtV1 = Instant.parse(v1.jsonPath().getString("review.publishedAt"));
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);

        // No-op edit rejected (400 REVIEW_NO_CHANGES)
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "  Tuyệt vời  ", "evidenceIds", List.of(ev1), "expectedVersion", 0))
                .put("/api/v1/reviews/" + reviewId)
                .then()
                .statusCode(400)
                .body("code", equalTo("REVIEW_NO_CHANGES"));

        // Seller cannot edit buyer's review -> 403
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Sửa hộ", "expectedVersion", 0))
                .put("/api/v1/reviews/" + reviewId)
                .then().statusCode(403);

        // v2: 5* -> 5* comment edit: score stays 102 (no extra ledger churn), thoi_diem_cong_khai refreshed (UC-33)
        Thread.sleep(10);
        Response v2 = given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Tuyệt vời hơn mong đợi", "evidenceIds", List.of(ev1), "expectedVersion", 0))
                .put("/api/v1/reviews/" + reviewId)
                .then()
                .statusCode(200)
                .body("review.currentVersionNo", equalTo(2))
                .body("review.version", equalTo(1))
                .body("review.appliedScoreDelta", equalTo(2))
                .extract().response();
        Instant publishedAtV2 = Instant.parse(v2.jsonPath().getString("review.publishedAt"));
        assertThat(publishedAtV2).isAfterOrEqualTo(publishedAtV1);
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM lich_su_diem_uy_tin WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(1);
        // Carry-over audit link: v2 inherits v1's apply_ledger_entry_id on 5* -> 5* comment edit
        UUID v1LedgerId = db.queryForObject(
                "SELECT apply_ledger_entry_id FROM danh_gia_phien_bans WHERE ma_danh_gia = ? AND version_no = 1",
                UUID.class,
                reviewId
        );
        UUID v2LedgerId = db.queryForObject(
                "SELECT apply_ledger_entry_id FROM danh_gia_phien_bans WHERE ma_danh_gia = ? AND version_no = 2",
                UUID.class,
                reviewId
        );
        assertThat(v1LedgerId).isNotNull();
        assertThat(v2LedgerId).isEqualTo(v1LedgerId);

        // Stale expectedVersion -> 409 VERSION_CONFLICT
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "Stale", "expectedVersion", 0))
                .put("/api/v1/reviews/" + reviewId)
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // v3: 5* -> 4* reverses +2 (102 -> 100)
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "Ổn nhưng hơi cũ", "evidenceIds", List.of(ev1), "expectedVersion", 1))
                .put("/api/v1/reviews/" + reviewId)
                .then()
                .statusCode(200)
                .body("review.currentVersionNo", equalTo(3))
                .body("review.appliedScoreDelta", equalTo(0));
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(100);

        // v4: 4* -> 5* re-applies +2 (100 -> 102)
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Đổi lại 5 sao", "evidenceIds", List.of(ev1), "expectedVersion", 2))
                .put("/api/v1/reviews/" + reviewId)
                .then()
                .statusCode(200)
                .body("review.currentVersionNo", equalTo(4))
                .body("review.appliedScoreDelta", equalTo(2));
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);

        // v5: 5* -> 3* reverses +2 (102 -> 100), hides from public, enters CHO_XET with queue_entered_at
        Response v5 = given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 3, "comment", "Phát hiện lỗi chân bàn", "evidenceIds", List.of(ev1), "expectedVersion", 3))
                .put("/api/v1/reviews/" + reviewId)
                .then()
                .statusCode(200)
                .body("review.status", equalTo("CHO_XET"))
                .body("review.publiclyVisible", equalTo(false))
                .body("review.appliedScoreDelta", equalTo(0))
                .body("review.publishedAt", nullValue())
                .body("review.queueEnteredAt", notNullValue())
                .extract().response();
        Instant originalQueueEnteredAt = Instant.parse(v5.jsonPath().getString("review.queueEnteredAt"));
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(100);

        // Verify seller's latest REVIEW_UPDATED notification does NOT leak the unmoderated 3-star comment text
        String lastSellerNotif = db.queryForObject(
                "SELECT noi_dung FROM thong_baos WHERE nguoi_nhan_id = ? AND loai = 'REVIEW_UPDATED' ORDER BY created_at DESC LIMIT 1",
                String.class,
                seller.id()
        );
        assertThat(lastSellerNotif).doesNotContain("Phát hiện lỗi chân bàn");

        // Upload new evidence ev2 during edit flow, replace ev1 with ev2, edit CHO_XET (3*) -> CHO_XET (2*)
        String ev2 = given()
                .auth().oauth2(buyer.token())
                .multiPart("files", "e2.jpg", jpeg, "image/jpeg")
                .post("/api/v1/orders/" + orderId + "/review/evidence")
                .then().statusCode(201).extract().jsonPath().getString("items[0].id");

        int sellerNotifCountBeforePendingEdit = db.queryForObject(
                "SELECT COUNT(*) FROM thong_baos WHERE nguoi_nhan_id = ?",
                Integer.class,
                seller.id()
        );
        Thread.sleep(10);
        Response v6 = given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 2, "comment", "Cập nhật thêm ảnh hỏng", "evidenceIds", List.of(ev2), "expectedVersion", 4))
                .put("/api/v1/reviews/" + reviewId)
                .then()
                .statusCode(200)
                .body("review.status", equalTo("CHO_XET"))
                .body("review.currentVersionNo", equalTo(6))
                .body("review.evidence", hasSize(1))
                .body("review.evidence[0].id", equalTo(ev2))
                .body("review.versions", hasSize(6))
                .extract().response();

        // UC-31 Alt 2: queue_entered_at MUST stay unchanged!
        assertThat(Instant.parse(v6.jsonPath().getString("review.queueEnteredAt"))).isEqualTo(originalQueueEnteredAt);
        // Seller not spammed on CHO_XET -> CHO_XET edit
        assertThat(db.queryForObject("SELECT COUNT(*) FROM thong_baos WHERE nguoi_nhan_id = ?", Integer.class, seller.id()))
                .isEqualTo(sellerNotifCountBeforePendingEdit);
        // Removed evidence ev1 retained in DB with active=FALSE for audit
        assertThat(db.queryForObject("SELECT active FROM danh_gia_bang_chungs WHERE id = ?", Boolean.class, UUID.fromString(ev1)))
                .isFalse();

        // Past 15 days -> edit MUST fail (409 REVIEW_WINDOW_EXPIRED)
        db.update(
                "UPDATE giao_dichs SET thoi_diem_hoan_tat = ? WHERE ma_giao_dich = ?",
                Timestamp.from(Instant.now().minus(Duration.ofDays(16))),
                orderId
        );
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "Sửa sau 15 ngày", "expectedVersion", 5))
                .put("/api/v1/reviews/" + reviewId)
                .then()
                .statusCode(409)
                .body("code", equalTo("REVIEW_WINDOW_EXPIRED"));
    }

    @Test
    void uc32DeleteReReviewPost15DayDeleteIdempotencyAndFr12SafeReversal() {
        // Seller starts at 50 (simulating unlocked post-temp-lock score per FR-12!)
        Account seller = createMember("SellerFr12", true, "HOAT_DONG", 50);
        Account buyer = createActiveMember("BuyerDel");
        Account outsider = createActiveMember("OutsiderDel");

        UUID orderWithinWindow = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(2)), "Quạt mini USB");

        // Buyer creates 5-star review -> seller score 50 -> 52
        UUID review1Id = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Rất tốt"))
                .post("/api/v1/orders/" + orderWithinWindow + "/review")
                .then().statusCode(201).extract().jsonPath().getString("review.id"));
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(52);

        // Seller cannot delete buyer's review -> 403
        given().auth().oauth2(seller.token()).delete("/api/v1/reviews/" + review1Id).then().statusCode(403);

        // Buyer deletes 5-star review -> DA_XOA, score reverses 52 -> 50, FR-12 MUST NOT falsely lock seller!
        given()
                .auth().oauth2(buyer.token())
                .delete("/api/v1/reviews/" + review1Id + "?expectedVersion=0")
                .then()
                .statusCode(200)
                .body("idempotentReplay", equalTo(false))
                .body("review.status", equalTo("DA_XOA"))
                .body("review.appliedScoreDelta", equalTo(0))
                .body("review.deletedAt", notNullValue())
                .body("orderReviewState.canReview", equalTo(true))
                .body("orderReviewState.review", nullValue());

        Map<String, Object> sellerAfterReversal = db.queryForMap(
                "SELECT diem_uy_tin, trang_thai_tai_khoan, loai_han_che FROM thanh_viens WHERE user_id = ?",
                seller.id()
        );
        assertThat(((Number) sellerAfterReversal.get("diem_uy_tin")).intValue()).isEqualTo(50);
        assertThat(sellerAfterReversal.get("trang_thai_tai_khoan")).isEqualTo("HOAT_DONG");
        assertThat(sellerAfterReversal.get("loai_han_che")).isNull();

        // Ownership verified BEFORE DA_XOA replay -> outsider still gets 403!
        given().auth().oauth2(outsider.token()).delete("/api/v1/reviews/" + review1Id).then().statusCode(403);

        // Repeated DELETE by buyer -> 200 idempotentReplay=true, score stays 50, no duplicate notification
        given()
                .auth().oauth2(buyer.token())
                .delete("/api/v1/reviews/" + review1Id + "?expectedVersion=0")
                .then()
                .statusCode(200)
                .body("idempotentReplay", equalTo(true));
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(50);
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM thong_baos WHERE nguoi_nhan_id = ? AND loai = 'REVIEW_DELETED'",
                Integer.class,
                seller.id()
        )).isEqualTo(1);

        // Buyer re-reviews SAME order within 15 days -> 201 Created (V14 partial unique index!)
        UUID review2Id = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Đánh giá lại lần 2"))
                .post("/api/v1/orders/" + orderWithinWindow + "/review")
                .then().statusCode(201).extract().jsonPath().getString("review.id"));
        assertThat(review2Id).isNotEqualTo(review1Id);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM danh_gias WHERE ma_giao_dich = ?", Integer.class, orderWithinWindow))
                .isEqualTo(2);
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(52);

        // Move order past 15 days (day 20): canEdit=false (REVIEW_WINDOW_EXPIRED), canDelete=true (UC-32!)
        db.update(
                "UPDATE giao_dichs SET thoi_diem_hoan_tat = ? WHERE ma_giao_dich = ?",
                Timestamp.from(Instant.now().minus(Duration.ofDays(20))),
                orderWithinWindow
        );
        given()
                .auth().oauth2(buyer.token())
                .get("/api/v1/orders/" + orderWithinWindow + "/review")
                .then()
                .statusCode(200)
                .body("withinReviewWindow", equalTo(false))
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(true))
                .body("lockReason", equalTo("REVIEW_WINDOW_EXPIRED"));

        // Post-15-day delete succeeds -> reverses +2 (52 -> 50), and order becomes eligible for +1 bonus ONCE!
        given()
                .auth().oauth2(buyer.token())
                .delete("/api/v1/reviews/" + review2Id)
                .then()
                .statusCode(200)
                .body("review.status", equalTo("DA_XOA"))
                .body("orderReviewState.canReview", equalTo(false))
                .body("orderReviewState.lockReason", equalTo("REVIEW_WINDOW_EXPIRED"));
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(50);

        // Award +1 bonus via scheduler -> 50 -> 51 once!
        assertThat(bonusService.awardNoReviewBonusForOrder(orderWithinWindow)).isTrue();
        assertThat(bonusService.awardNoReviewBonusForOrder(orderWithinWindow)).isFalse();
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(51);

        // Deleting a CHO_XET review does NOT notify seller (was never public)
        UUID orderPending = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Bình nước");
        int sellerNotifBefore = db.queryForObject("SELECT COUNT(*) FROM thong_baos WHERE nguoi_nhan_id = ?", Integer.class, seller.id());
        UUID pendingReviewId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 2, "comment", "Hàng có vết nứt"))
                .post("/api/v1/orders/" + orderPending + "/review")
                .then().statusCode(201).extract().jsonPath().getString("review.id"));
        given().auth().oauth2(buyer.token()).delete("/api/v1/reviews/" + pendingReviewId).then().statusCode(200);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM thong_baos WHERE nguoi_nhan_id = ?", Integer.class, seller.id()))
                .isEqualTo(sellerNotifBefore);
    }

    @Test
    void fr10FifteenDayNoReviewBonusSuppressionRulesAndPendingSellerVisibility() {
        Account seller = createActiveMember("SellerBonus");
        Account buyer = createActiveMember("BuyerBonus");
        Account pendingSeller = createMember("PendingSeller", false, "CHO_KICH_HOAT", 0);

        // Pending seller returns 404 SELLER_NOT_FOUND on public reviews API
        given().get("/api/v1/sellers/" + pendingSeller.id() + "/reviews")
                .then().statusCode(404).body("code", equalTo("SELLER_NOT_FOUND"));

        // 1) 14d 23h -> NOT due yet
        UUID orderNotDue = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(14).plusHours(23)), "Đơn chưa đủ 15 ngày");
        // 2) 15d 1m with NO review -> eligible for +1
        UUID orderEligible = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(15).plusMinutes(1)), "Đơn quá 15 ngày không đánh giá");
        // 3) 16d with CHO_XET -> suppressed
        UUID orderPendingReview = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(16)), "Đơn có đánh giá CHO_XET");
        db.update(
                "INSERT INTO danh_gias(ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id, so_sao, nhan_xet, trang_thai) VALUES (?, ?, ?, ?, 2, 'Chờ xét', 'CHO_XET')",
                UUID.randomUUID(), orderPendingReview, buyer.id(), seller.id()
        );
        // 4) 16d with BI_BAC -> suppressed (UC-30 Assumption!)
        UUID orderRejectedReview = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(16)), "Đơn có đánh giá BI_BAC");
        db.update(
                "INSERT INTO danh_gias(ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id, so_sao, nhan_xet, trang_thai, thoi_diem_xet) VALUES (?, ?, ?, ?, 1, 'Bị bác', 'BI_BAC', NOW())",
                UUID.randomUUID(), orderRejectedReview, buyer.id(), seller.id()
        );
        // 5) 16d with ONLY DA_XOA -> eligible for +1
        UUID orderDeletedReview = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(16)), "Đơn chỉ có đánh giá DA_XOA");
        db.update(
                "INSERT INTO danh_gias(ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id, so_sao, nhan_xet, trang_thai, deleted_at) VALUES (?, ?, ?, ?, 5, 'Đã xóa', 'DA_XOA', NOW())",
                UUID.randomUUID(), orderDeletedReview, buyer.id(), seller.id()
        );

        assertThat(bonusService.awardNoReviewBonusForOrder(orderNotDue)).isFalse();
        assertThat(bonusService.awardNoReviewBonusForOrder(orderPendingReview)).isFalse();
        assertThat(bonusService.awardNoReviewBonusForOrder(orderRejectedReview)).isFalse();

        // Process batch -> awards +1 ONLY to orderEligible and orderDeletedReview (total +2 -> 102)
        int awarded = bonusService.processDueNoReviewBonuses();
        assertThat(awarded).isGreaterThanOrEqualTo(2);
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);

        // Re-running batch awards 0 for these orders
        assertThat(bonusService.awardNoReviewBonusForOrder(orderEligible)).isFalse();
        assertThat(bonusService.awardNoReviewBonusForOrder(orderDeletedReview)).isFalse();

        // Buyer trying to review after bonus applied -> 409 NO_REVIEW_BONUS_ALREADY_APPLIED
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Muộn rồi"))
                .post("/api/v1/orders/" + orderEligible + "/review")
                .then()
                .statusCode(409)
                .body("code", equalTo("NO_REVIEW_BONUS_ALREADY_APPLIED"));
    }

    @Test
    void p305ForwardCompatComplaintModerationLocksAndAccountRoleBoundaries() {
        Account seller = createActiveMember("SellerLock");
        Account buyer = createActiveMember("BuyerLock");
        Account outsider = createActiveMember("OutsiderLock");
        Account lockedBuyer = createMember("LockedBuyer", true, "BI_KHOA", 40);
        Account pendingBuyer = createMember("PendingBuyer", false, "CHO_KICH_HOAT", 0);

        // Non-completed order -> 409 ORDER_NOT_COMPLETED
        UUID pendingOrder = createOrder(seller, buyer, "GIU_CHO", null, "Đơn đang giữ chỗ");
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Chưa xong"))
                .post("/api/v1/orders/" + pendingOrder + "/review")
                .then()
                .statusCode(409)
                .body("code", equalTo("ORDER_NOT_COMPLETED"));

        // Locked buyer -> 403 ACCOUNT_RESTRICTED; pending buyer -> 403; seller -> 403; outsider GET -> 403
        UUID orderForLocks = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Sách OOAD");
        UUID lockedBuyerOrder = createOrder(seller, lockedBuyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Sách bị khóa");
        given().auth().oauth2(lockedBuyer.token()).contentType(ContentType.JSON).body(Map.of("rating", 5))
                .post("/api/v1/orders/" + lockedBuyerOrder + "/review").then().statusCode(403).body("code", equalTo("ACCOUNT_RESTRICTED"));
        given().auth().oauth2(pendingBuyer.token()).contentType(ContentType.JSON).body(Map.of("rating", 5))
                .post("/api/v1/orders/" + orderForLocks + "/review").then().statusCode(403);
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of("rating", 5))
                .post("/api/v1/orders/" + orderForLocks + "/review").then().statusCode(403);
        given().auth().oauth2(outsider.token()).get("/api/v1/orders/" + orderForLocks + "/review").then().statusCode(403);
        given().get("/api/v1/orders/" + orderForLocks + "/review").then().statusCode(401);

        // Create review to test complaint & moderation locks
        UUID reviewId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Tốt lắm"))
                .post("/api/v1/orders/" + orderForLocks + "/review")
                .then().statusCode(201).extract().jsonPath().getString("review.id"));

        // 1) Active complaint (CHO_XU_LY) locks edit & delete
        UUID complaintId = UUID.randomUUID();
        db.update(
                "INSERT INTO khieu_nais(ma_khieu_nai, ma_danh_gia, nguoi_khieu_nai_id, ly_do, trang_thai) VALUES (?, ?, ?, 'Sai sự thật', 'CHO_XU_LY')",
                complaintId, reviewId, seller.id()
        );
        given().auth().oauth2(buyer.token()).get("/api/v1/orders/" + orderForLocks + "/review")
                .then().statusCode(200)
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(false))
                .body("lockReason", equalTo("REVIEW_COMPLAINT_PENDING"));
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "Thử sửa", "expectedVersion", 0))
                .put("/api/v1/reviews/" + reviewId).then().statusCode(409).body("code", equalTo("REVIEW_COMPLAINT_LOCKED"));
        given().auth().oauth2(buyer.token()).delete("/api/v1/reviews/" + reviewId)
                .then().statusCode(409).body("code", equalTo("REVIEW_COMPLAINT_LOCKED"));

        // 2) Withdrawn complaint (DA_RUT per UC-33 Alt 3) RE-OPENS edit & delete!
        db.update("UPDATE khieu_nais SET trang_thai = 'DA_RUT' WHERE ma_khieu_nai = ?", complaintId);
        given().auth().oauth2(buyer.token()).get("/api/v1/orders/" + orderForLocks + "/review")
                .then().statusCode(200)
                .body("canEdit", equalTo(true))
                .body("canDelete", equalTo(true))
                .body("lockReason", nullValue());
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "Sửa sau khi rút khiếu nại", "expectedVersion", 0))
                .put("/api/v1/reviews/" + reviewId).then().statusCode(200);

        // 3) Resolved complaint (DA_XU_LY) locks edit & delete permanently
        db.update("UPDATE khieu_nais SET trang_thai = 'DA_XU_LY' WHERE ma_khieu_nai = ?", complaintId);
        given().auth().oauth2(buyer.token()).get("/api/v1/orders/" + orderForLocks + "/review")
                .then().statusCode(200)
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(false))
                .body("lockReason", equalTo("REVIEW_COMPLAINT_RESOLVED"));
        given().auth().oauth2(buyer.token()).delete("/api/v1/reviews/" + reviewId)
                .then().statusCode(409).body("code", equalTo("REVIEW_COMPLAINT_LOCKED"));

        // 4) Moderated review (1-3* accepted by moderator: thoi_diem_xet != null) locks edit & delete
        UUID orderMod = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Sách đã kiểm duyệt");
        UUID modReviewId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 3, "comment", "Hơi rách bìa"))
                .post("/api/v1/orders/" + orderMod + "/review")
                .then().statusCode(201).extract().jsonPath().getString("review.id"));
        db.update(
                "UPDATE danh_gias SET trang_thai = 'CHAP_NHAN', thoi_diem_xet = NOW(), thoi_diem_cong_khai = NOW() WHERE ma_danh_gia = ?",
                modReviewId
        );
        given().auth().oauth2(buyer.token()).get("/api/v1/orders/" + orderMod + "/review")
                .then().statusCode(200)
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(false))
                .body("lockReason", equalTo("REVIEW_MODERATED"));
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "Sửa sau duyệt", "expectedVersion", 0))
                .put("/api/v1/reviews/" + modReviewId).then().statusCode(409).body("code", equalTo("REVIEW_MODERATED"));
        given().auth().oauth2(buyer.token()).delete("/api/v1/reviews/" + modReviewId)
                .then().statusCode(409).body("code", equalTo("REVIEW_MODERATED"));
    }

    @Test
    void restrictedAccountLockedBuyerFlagsAnd403AcrossAllReviewEndpoints() throws Exception {
        Account seller = createActiveMember("SellerBiKhoa");
        Account buyer = createActiveMember("BuyerBiKhoa");

        UUID orderWithReview = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(2)), "Đơn có đánh giá");
        UUID orderUnreviewed = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Đơn chưa đánh giá");

        // While active, buyer creates a review on orderWithReview and uploads a draft evidence on orderUnreviewed
        UUID reviewId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Đánh giá trước khi bị khóa"))
                .post("/api/v1/orders/" + orderWithReview + "/review")
                .then().statusCode(201).extract().jsonPath().getString("review.id"));

        byte[] jpeg = validJpegWithExifMarker();
        UUID draftId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .multiPart("files", "draft.jpg", jpeg, "image/jpeg")
                .post("/api/v1/orders/" + orderUnreviewed + "/review/evidence")
                .then().statusCode(201).extract().jsonPath().getString("items[0].id"));

        // Lock buyer account (active 14-day temporary lock)
        db.update(
                """
                UPDATE thanh_viens
                SET trang_thai_tai_khoan = 'BI_KHOA',
                    loai_han_che = 'KHOA_TAM_THOI',
                    khoa_den_ngay = ?,
                    ly_do_han_che = 'Vi phạm quy chế'
                WHERE user_id = ?
                """,
                Timestamp.from(Instant.now().plus(Duration.ofDays(14))),
                buyer.id()
        );

        // GET /orders/{id}/review still returns 200 for buyer, but disables ALL mutation flags with ACCOUNT_RESTRICTED
        given().auth().oauth2(buyer.token()).get("/api/v1/orders/" + orderWithReview + "/review")
                .then().statusCode(200)
                .body("canReview", equalTo(false))
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(false))
                .body("lockReason", equalTo("ACCOUNT_RESTRICTED"));
        given().auth().oauth2(buyer.token()).get("/api/v1/orders/" + orderUnreviewed + "/review")
                .then().statusCode(200)
                .body("canReview", equalTo(false))
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(false))
                .body("lockReason", equalTo("ACCOUNT_RESTRICTED"));

        // Every review mutation endpoint returns 403 ACCOUNT_RESTRICTED
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON).body(Map.of("rating", 5))
                .post("/api/v1/orders/" + orderUnreviewed + "/review")
                .then().statusCode(403).body("code", equalTo("ACCOUNT_RESTRICTED"));
        given().auth().oauth2(buyer.token()).multiPart("files", "blocked.jpg", jpeg, "image/jpeg")
                .post("/api/v1/orders/" + orderUnreviewed + "/review/evidence")
                .then().statusCode(403).body("code", equalTo("ACCOUNT_RESTRICTED"));
        given().auth().oauth2(buyer.token())
                .delete("/api/v1/orders/" + orderUnreviewed + "/review/evidence/" + draftId)
                .then().statusCode(403).body("code", equalTo("ACCOUNT_RESTRICTED"));
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "Sửa khi bị khóa", "expectedVersion", 0))
                .put("/api/v1/reviews/" + reviewId)
                .then().statusCode(403).body("code", equalTo("ACCOUNT_RESTRICTED"));
        given().auth().oauth2(buyer.token())
                .delete("/api/v1/reviews/" + reviewId)
                .then().statusCode(403).body("code", equalTo("ACCOUNT_RESTRICTED"));
    }

    @Test
    void negativeIdorRejectsForeignAndCrossOrderEvidenceOnCreateAndEdit() throws Exception {
        Account seller = createActiveMember("SellerIdor");
        Account buyerA = createActiveMember("BuyerIdorA");
        Account buyerB = createActiveMember("BuyerIdorB");

        UUID orderA1 = createOrder(seller, buyerA, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Đơn A1");
        UUID orderA2 = createOrder(seller, buyerA, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Đơn A2");
        UUID orderB1 = createOrder(seller, buyerB, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Đơn B1");

        byte[] jpeg = validJpegWithExifMarker();
        String evA1 = given()
                .auth().oauth2(buyerA.token())
                .multiPart("files", "a1.jpg", jpeg, "image/jpeg")
                .post("/api/v1/orders/" + orderA1 + "/review/evidence")
                .then().statusCode(201).extract().jsonPath().getString("items[0].id");

        // 1) Buyer B cannot attach Buyer A's evidence on POST /review
        given().auth().oauth2(buyerB.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 2, "comment", "IDOR create", "evidenceIds", List.of(evA1)))
                .post("/api/v1/orders/" + orderB1 + "/review")
                .then().statusCode(400).body("code", equalTo("INVALID_INPUT"));

        // 2) Buyer A cannot attach orderA1's evidence to orderA2 on POST /review
        given().auth().oauth2(buyerA.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 2, "comment", "Cross-order create", "evidenceIds", List.of(evA1)))
                .post("/api/v1/orders/" + orderA2 + "/review")
                .then().statusCode(400).body("code", equalTo("INVALID_INPUT"));

        // Create clean reviews on orderB1 and orderA2, then attempt IDOR/cross-order attach on PUT /reviews/{id}
        String reviewB1 = given().auth().oauth2(buyerB.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Hợp lệ B1"))
                .post("/api/v1/orders/" + orderB1 + "/review")
                .then().statusCode(201).extract().jsonPath().getString("review.id");
        String reviewA2 = given().auth().oauth2(buyerA.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Hợp lệ A2"))
                .post("/api/v1/orders/" + orderA2 + "/review")
                .then().statusCode(201).extract().jsonPath().getString("review.id");

        given().auth().oauth2(buyerB.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "IDOR edit", "evidenceIds", List.of(evA1), "expectedVersion", 0))
                .put("/api/v1/reviews/" + reviewB1)
                .then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().auth().oauth2(buyerA.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 4, "comment", "Cross-order edit", "evidenceIds", List.of(evA1), "expectedVersion", 0))
                .put("/api/v1/reviews/" + reviewA2)
                .then().statusCode(400).body("code", equalTo("INVALID_INPUT"));

        // evA1 remains unattached (ma_danh_gia IS NULL)
        assertThat(db.queryForObject("SELECT ma_danh_gia FROM danh_gia_bang_chungs WHERE id = ?", UUID.class, UUID.fromString(evA1)))
                .isNull();
    }

    @Test
    void draftDeleteOrphanCleanupMediaIsolationAndCorsIdempotencyKeyPreflight() throws Exception {
        Account seller = createActiveMember("SellerDraft");
        Account buyer = createActiveMember("BuyerDraft");
        Account outsider = createActiveMember("OutsiderDraft");
        UUID orderId = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(1)), "Tủ mini KTX");

        // 1) CORS preflight allows Idempotency-Key header
        given()
                .header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "Authorization, Content-Type, Idempotency-Key")
                .options("/api/v1/orders/" + orderId + "/review")
                .then()
                .statusCode(200)
                .header("Access-Control-Allow-Headers", containsString("Idempotency-Key"));

        // 2) Upload 4 drafts: dDelete (manual delete), dAttach (attached), dExpired (TTL orphan), dFresh (kept)
        byte[] jpeg = validJpegWithExifMarker();
        Response uploaded = given()
                .auth().oauth2(buyer.token())
                .multiPart("files", "d1.jpg", jpeg, "image/jpeg")
                .multiPart("files", "d2.jpg", jpeg, "image/jpeg")
                .multiPart("files", "d3.jpg", jpeg, "image/jpeg")
                .multiPart("files", "d4.jpg", jpeg, "image/jpeg")
                .post("/api/v1/orders/" + orderId + "/review/evidence")
                .then().statusCode(201).body("items", hasSize(4)).extract().response();

        UUID dDelete = UUID.fromString(uploaded.jsonPath().getString("items[0].id"));
        UUID dAttach = UUID.fromString(uploaded.jsonPath().getString("items[1].id"));
        UUID dExpired = UUID.fromString(uploaded.jsonPath().getString("items[2].id"));
        UUID dFresh = UUID.fromString(uploaded.jsonPath().getString("items[3].id"));

        String deleteKey = db.queryForObject("SELECT storage_key FROM danh_gia_bang_chungs WHERE id = ?", String.class, dDelete);
        String expiredKey = db.queryForObject("SELECT storage_key FROM danh_gia_bang_chungs WHERE id = ?", String.class, dExpired);
        String freshKey = db.queryForObject("SELECT storage_key FROM danh_gia_bang_chungs WHERE id = ?", String.class, dFresh);

        // Outsider cannot delete buyer's draft -> 403
        given().auth().oauth2(outsider.token())
                .delete("/api/v1/orders/" + orderId + "/review/evidence/" + dDelete)
                .then().statusCode(403);

        // Buyer deletes unattached draft -> 204, row & disk blob removed (frees quota), repeat -> 404
        given().auth().oauth2(buyer.token())
                .delete("/api/v1/orders/" + orderId + "/review/evidence/" + dDelete)
                .then().statusCode(204);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM danh_gia_bang_chungs WHERE id = ?", Integer.class, dDelete)).isZero();
        assertThat(evidenceStorage.rootDir().resolve(deleteKey)).doesNotExist();
        given().auth().oauth2(buyer.token())
                .delete("/api/v1/orders/" + orderId + "/review/evidence/" + dDelete)
                .then().statusCode(404).body("code", equalTo("EVIDENCE_NOT_FOUND"));

        // Attach dAttach to a review -> DELETE returns 409 EVIDENCE_ALREADY_ATTACHED
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Có ảnh", "evidenceIds", List.of(dAttach.toString())))
                .post("/api/v1/orders/" + orderId + "/review")
                .then().statusCode(201);
        given().auth().oauth2(buyer.token())
                .delete("/api/v1/orders/" + orderId + "/review/evidence/" + dAttach)
                .then().statusCode(409).body("code", equalTo("EVIDENCE_ALREADY_ATTACHED"));

        // 3) ReviewEvidenceOrphanCleanupScheduler logic: backdate dExpired by 3h -> cleaned; dFresh & dAttach stay!
        db.update(
                "UPDATE danh_gia_bang_chungs SET created_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minus(Duration.ofHours(3))),
                dExpired
        );
        int cleaned = evidenceService.cleanupExpiredDraftEvidence(Duration.ofHours(2), 100);
        assertThat(cleaned).isGreaterThanOrEqualTo(1);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM danh_gia_bang_chungs WHERE id = ?", Integer.class, dExpired)).isZero();
        assertThat(evidenceStorage.rootDir().resolve(expiredKey)).doesNotExist();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM danh_gia_bang_chungs WHERE id = ?", Integer.class, dFresh)).isEqualTo(1);
        assertThat(evidenceStorage.rootDir().resolve(freshKey)).exists();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM danh_gia_bang_chungs WHERE id = ?", Integer.class, dAttach)).isEqualTo(1);

        // 4) MediaOrphanCleanupScheduler MUST NOT delete files stored under <mediaRoot>/review-evidence/
        Path nestedReviewEvidenceFile = mediaStorage.rootDir().resolve("review-evidence/2026/01/preserve.jpg");
        Files.createDirectories(nestedReviewEvidenceFile.getParent());
        Files.write(nestedReviewEvidenceFile, jpeg);
        Files.setLastModifiedTime(nestedReviewEvidenceFile, FileTime.from(Instant.now().minus(Duration.ofHours(5))));
        mediaService.cleanupOrphanFiles(Duration.ofMinutes(1), 100);
        assertThat(nestedReviewEvidenceFile).exists();
        Files.deleteIfExists(nestedReviewEvidenceFile);
    }

    @Test
    void noReviewBonusSchedulerIsolatesPoisonPillOrdersAndAdvancesCursorToHealthyOrders() {
        Account seller = createActiveMember("SellerPoison");
        Account buyer = createActiveMember("BuyerPoison");

        // Create 2 oldest overdue orders (poison pills filling a full batch of size=2) + 1 newer healthy overdue order
        UUID poison1 = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(40)), "Poison 1");
        UUID poison2 = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(39)), "Poison 2");
        UUID healthy = createOrder(seller, buyer, "HOAN_TAT", Instant.now().minus(Duration.ofDays(38)), "Healthy 3");

        Set<UUID> poisonedIds = Set.of(poison1, poison2);
        ReviewBonusService batch2Service = new ReviewBonusService(
                db,
                clock,
                reputationLedger,
                notificationService,
                transactionManager,
                2
        ) {
            @Override
            public boolean awardNoReviewBonusForOrder(UUID orderId) {
                if (poisonedIds.contains(orderId)) {
                    throw new IllegalStateException("Simulated poison-pill failure for " + orderId);
                }
                return super.awardNoReviewBonusForOrder(orderId);
            }
        };

        // Even though BOTH slots in batch 1 throw exceptions, keyset cursor advances to batch 2 and credits healthy order!
        int awarded = batch2Service.processAllDueNoReviewBonuses(5);
        assertThat(awarded).isGreaterThanOrEqualTo(1);
        assertThat(db.queryForObject(
                "SELECT da_cong_diem_khong_danh_gia FROM giao_dichs WHERE ma_giao_dich = ?",
                Boolean.class,
                healthy
        )).isTrue();
        assertThat(db.queryForObject(
                "SELECT da_cong_diem_khong_danh_gia FROM giao_dichs WHERE ma_giao_dich = ?",
                Boolean.class,
                poison1
        )).isFalse();
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(101);
    }
}
