package com.dormtrading.order.dispute;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

@TestPropertySource(properties = {
        "app.dispute.evidence.local-dir=${java.io.tmpdir}/dorm-trading-test-dispute-evidence",
        "app.dispute.handover-proofs.local-dir=${java.io.tmpdir}/dorm-trading-test-handover-proofs",
        "app.dispute.scheduler.enabled=false"
})
class DisputeApiTest extends BaseIntegrationTest {

    private static final String PASSWORD = "a quiet river beneath stars";

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private JdbcTemplate db;

    @MockitoSpyBean
    private LocalDisputeEvidenceStorage evidenceStorage;

    @MockitoBean
    private JavaMailSender mail;

    private final ConcurrentMap<String, String> otpCodes = new ConcurrentHashMap<>();

    private record Account(UUID id, String email, String studentId, String mobileToken, String adminToken) {
    }

    private record SeededDispute(
            UUID orderId,
            UUID listingId,
            List<UUID> itemIds,
            UUID handoverPhotoId,
            UUID otpId
    ) {
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

    private Account createAccount(String label, int score, String adminRole) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "DP" + suffix;
        String email = "disp_" + suffix + "@student.edu.vn";
        String ip = "10.8." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register(label + " " + suffix, studentId, email, PASSWORD, ip);
        delivery.deliver();
        String code = otpCodes.get(email);
        var challenge = db.queryForMap(
                "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                email
        );
        auth.verify((UUID) challenge.get("id"), email, "REGISTER", code, ip);
        db.update(
                "UPDATE thanh_viens SET profile_approved = TRUE, trang_thai_tai_khoan = 'HOAT_DONG', diem_uy_tin = ? WHERE email = ?",
                score,
                email
        );
        UUID userId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email);
        if (adminRole != null) {
            db.update(
                    "INSERT INTO vai_tro_quan_tri(user_id, loai_vai_tro, bat_dau, trang_thai_hieu_luc) VALUES (?, ?, NOW() - INTERVAL '1 hour', TRUE)",
                    userId,
                    adminRole
            );
        }
        String mobileToken = auth.login(email, PASSWORD, "mobile", ip).token();
        String adminToken = adminRole != null ? auth.login(email, PASSWORD, "admin-web", ip).token() : null;
        return new Account(userId, email, studentId, mobileToken, adminToken);
    }

    private UUID createItem(String token, String name) {
        String id = given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", name,
                        "tinhTrang", "Mới 95%",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/dp/" + UUID.randomUUID() + ".jpg")
                ))
                .post("/api/v1/inventory")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");
        return UUID.fromString(id);
    }

    private UUID publishListing(String token, String title, int priceVnd, List<UUID> itemIds) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("action", "PUBLISH");
        body.put("title", title);
        body.put("description", "Mô tả đầy đủ cho kiểm thử UC-29 tranh chấp");
        body.put("condition", "Tốt 95%");
        body.put("priceVnd", priceVnd);
        body.put("categoryId", "DO_GIA_DUNG");
        body.put("locationCode", "KTX_KHU_A");
        body.put("locationText", "Sảnh KTX Khu A");
        body.put("images", List.of("https://cdn.example.edu.vn/dp/listing-" + UUID.randomUUID() + ".jpg"));
        body.put("itemIds", itemIds.stream().map(UUID::toString).toList());

        String id = given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(body)
                .post("/api/v1/listings")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("listing.id");
        return UUID.fromString(id);
    }

    private byte[] createValidPngBytes() throws Exception {
        BufferedImage img = new BufferedImage(32, 32, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.BLUE);
        g.fillRect(0, 0, 32, 32);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private SeededDispute seedDisputeOrder(
            Account seller,
            Account buyer,
            String listingTitle,
            String escalationReason,
            boolean withHandoverPhoto,
            boolean withChatAndCancel
    ) throws Exception {
        UUID item1 = createItem(seller.mobileToken(), "Đồ vật " + listingTitle);
        UUID listingId = publishListing(seller.mobileToken(), listingTitle, 120000, List.of(item1));

        UUID orderId = UUID.fromString(given()
                .auth().oauth2(buyer.mobileToken())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "listingId", listingId.toString(),
                        "agreedPriceVnd", 110000,
                        "proposedMeetingTime", Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS).toString(),
                        "proposedMeetingLocation", "Cổng KTX A"
                ))
                .post("/api/v1/orders")
                .then().statusCode(201).extract().jsonPath().getString("id"));

        given().auth().oauth2(seller.mobileToken()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept").then().statusCode(200);

        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        Instant reportedAt = now.minus(26, ChronoUnit.HOURS);
        Instant escalatedAt = now.minus(2, ChronoUnit.HOURS);
        Instant deadline = DisputeService.addBusinessDays(escalatedAt, 3);

        db.update(
                """
                UPDATE giao_dichs
                SET trang_thai = 'CHO_XU_LY',
                    thoi_diem_bat_dau_giao = ?,
                    thoi_diem_bao_giao = ?,
                    ghi_chu_ban_giao = 'Đã giao tận tay tại sảnh A1',
                    ly_do_cho_xu_ly = ?,
                    thoi_diem_chuyen_xu_ly = ?,
                    han_phan_hoi_kdv = ?,
                    updated_at = ?
                WHERE ma_giao_dich = ?
                """,
                Timestamp.from(reportedAt.minus(1, ChronoUnit.HOURS)),
                Timestamp.from(reportedAt),
                escalationReason,
                Timestamp.from(escalatedAt),
                Timestamp.from(deadline),
                Timestamp.from(now),
                orderId
        );

        UUID otpId = UUID.randomUUID();
        db.update(
                """
                INSERT INTO ma_xac_nhan_otp(
                    id, ma_giao_dich, ma_otp, otp_hash, otp_ciphertext,
                    thoi_diem_phat, thoi_diem_het_han, so_lan_thu_sai, so_lan_thu_toi_da, da_dung, bi_vo_hieu, nguoi_cap_id
                ) VALUES (?, ?, NULL, repeat('a', 64), 'encrypted-otp', ?, ?, 0, 5, FALSE, FALSE, ?)
                """,
                otpId,
                orderId,
                Timestamp.from(reportedAt),
                Timestamp.from(reportedAt.plus(10, ChronoUnit.MINUTES)),
                seller.id()
        );

        UUID photoId = null;
        if (withHandoverPhoto) {
            photoId = UUID.randomUUID();
            byte[] png = createValidPngBytes();
            String key = "handover/" + orderId + "/" + photoId + ".png";
            Path target = evidenceStorage.handoverRootDir().resolve(key);
            Files.createDirectories(target.getParent());
            Files.write(target, png);
            db.update(
                    """
                    INSERT INTO anh_ban_giao_giao_dichs(
                        id, ma_giao_dich, nguoi_tai_len_id, storage_key, original_filename,
                        content_type, size_bytes, sha256, thu_tu, uploaded_at
                    ) VALUES (?, ?, ?, ?, 'handover.png', 'image/png', ?, repeat('c', 64), 0, ?)
                    """,
                    photoId,
                    orderId,
                    seller.id(),
                    key,
                    png.length,
                    Timestamp.from(reportedAt)
            );
        }

        if (withChatAndCancel) {
            UUID convId = UUID.randomUUID();
            db.update(
                    "INSERT INTO hoi_thoais(ma_hoi_thoai, ma_tin, nguoi_mua_id, nguoi_ban_id) VALUES (?, ?, ?, ?)",
                    convId,
                    listingId,
                    buyer.id(),
                    seller.id()
            );
            db.update(
                    "INSERT INTO tin_nhans(ma_hoi_thoai, nguoi_gui_id, noi_dung, gia_de_nghi) VALUES (?, ?, 'Fix 110k nhé bạn', 110000)",
                    convId,
                    buyer.id()
            );
            db.update(
                    """
                    INSERT INTO yeu_cau_huy_giao_dichs(
                        ma_giao_dich, nguoi_yeu_cau_id, ma_ly_do, ly_do, trang_thai
                    ) VALUES (?, ?, 'ITEM_NOT_AS_DESCRIBED', 'Mặt hàng có vết xước', 'CHO_XAC_NHAN')
                    """,
                    orderId,
                    buyer.id()
            );
        }

        db.update(
                """
                INSERT INTO lich_su_trang_thai_giao_dich(
                    ma_giao_dich, hanh_dong, trang_thai_truoc, trang_thai_sau, vai_tro_thuc_hien, ghi_chu, created_at
                ) VALUES (?, 'AUTO_ESCALATED_OVERDUE_24H', 'CHO_XAC_NHAN', 'CHO_XU_LY', 'SYSTEM', 'Quá 24 giờ chưa xác nhận', ?)
                """,
                orderId,
                Timestamp.from(escalatedAt)
        );

        return new SeededDispute(orderId, listingId, List.of(item1), photoId, otpId);
    }

    @Test
    void uc29BasicFlowCompleteWithOtpInvalidationReviewWindowZeroPiiAndZeroReputationChange() throws Exception {
        Account seller = createAccount("SellerBasic", 100, null);
        Account buyer = createAccount("BuyerBasic", 100, null);
        Account moderator = createAccount("ModBasic", 100, "KIEM_DUYET_VIEN");
        Account seniorAdmin = createAccount("SeniorBasic", 100, "QUAN_TRI_VIEN_CAP_CAO");

        String uniqueTitle = "Bàn_học%100%_" + UUID.randomUUID().toString().substring(0, 6);
        SeededDispute dispute = seedDisputeOrder(seller, buyer, uniqueTitle, "OVERDUE_24H", true, true);

        // 1. Queue listing with escaped LIKE wildcards & Cache-Control: private, no-store & size cap
        Response listResp = given()
                .auth().oauth2(moderator.adminToken())
                .queryParam("reason", "OVERDUE_24H")
                .queryParam("queueState", "READY")
                .queryParam("q", "%100%_")
                .queryParam("size", 99) // capped to 50
                .get("/api/v1/admin/disputes")
                .then()
                .statusCode(200)
                .header("Cache-Control", equalTo("private, no-store"))
                .body("size", equalTo(50))
                .body("items", hasSize(1))
                .body("items[0].orderId", equalTo(dispute.orderId().toString()))
                .body("items[0].escalationReason", equalTo("OVERDUE_24H"))
                .body("items[0].queueState", equalTo("READY"))
                .body("counts.ready", greaterThanOrEqualTo(1))
                .extract().response();

        // Zero-PII check (NFR-01)
        String listRaw = listResp.asString();
        assertThat(listRaw).doesNotContain(seller.email(), buyer.email(), seller.studentId(), buyer.studentId());

        // SENIOR_ADMIN also gets ROLE_MODERATOR and can read queue
        given()
                .auth().oauth2(seniorAdmin.adminToken())
                .get("/api/v1/admin/disputes/" + dispute.orderId())
                .then()
                .statusCode(200)
                .header("Cache-Control", equalTo("private, no-store"));

        // 2. Detail view includes full dossier
        Response detailResp = given()
                .auth().oauth2(moderator.adminToken())
                .get("/api/v1/admin/disputes/" + dispute.orderId())
                .then()
                .statusCode(200)
                .header("Cache-Control", equalTo("private, no-store"))
                .body("decidable", equalTo(true))
                .body("items", hasSize(1))
                .body("handoverPhotos", hasSize(1))
                .body("handoverPhotos[0].url", equalTo("/api/v1/admin/disputes/" + dispute.orderId() + "/evidence/handover/" + dispute.handoverPhotoId()))
                .body("scheduleProposals", hasSize(1))
                .body("cancelRequests", hasSize(1))
                .body("chatMessages", hasSize(1))
                .body("timeline", hasSize(1))
                .body("decision", nullValue())
                .extract().response();

        assertThat(detailResp.asString()).doesNotContain(seller.email(), buyer.email(), seller.studentId(), buyer.studentId());

        // 3. Handover photo private download headers
        given()
                .auth().oauth2(moderator.adminToken())
                .get("/api/v1/admin/disputes/" + dispute.orderId() + "/evidence/handover/" + dispute.handoverPhotoId())
                .then()
                .statusCode(200)
                .contentType("image/png")
                .header("Cache-Control", equalTo("private, no-store"))
                .header("Pragma", equalTo("no-cache"))
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .header("Vary", containsString("Authorization"));

        // 4. UC-29 Exception 2: short/blank basis rejected with 400 INVALID_BASIS
        given()
                .auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Quá ngắn"))
                .post("/api/v1/admin/disputes/" + dispute.orderId() + "/complete")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_BASIS"));

        // 5. UC-29 Basic Flow: Complete transaction
        long currentVersion = detailResp.jsonPath().getLong("version");
        given()
                .auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "basis", "Ảnh bàn giao rõ ràng và lịch sử chat xác nhận người mua đã nhận đồ.",
                        "expectedVersion", currentVersion
                ))
                .post("/api/v1/admin/disputes/" + dispute.orderId() + "/complete")
                .then()
                .statusCode(200)
                .header("Cache-Control", equalTo("private, no-store"))
                .body("status", equalTo("HOAN_TAT"))
                .body("queueState", equalTo("RESOLVED"))
                .body("decidable", equalTo(false))
                .body("reviewDeadlineAt", notNullValue())
                .body("decision.conclusion", equalTo("HOAN_TAT"))
                .body("decision.listingStatusAfter", equalTo("KET_THUC"))
                .body("decision.listingHiddenReason", nullValue());

        // Verify DB side-effects
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, dispute.itemIds().getFirst()))
                .isEqualTo("DA_CHUYEN_GIAO");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, dispute.listingId()))
                .isEqualTo("KET_THUC");
        assertThat(db.queryForObject("SELECT giu_hieu_luc FROM giao_dich_do_vat WHERE ma_giao_dich = ?", Boolean.class, dispute.orderId()))
                .isFalse();

        Map<String, Object> otpRow = db.queryForMap(
                "SELECT bi_vo_hieu, ly_do_vo_hieu, otp_ciphertext FROM ma_xac_nhan_otp WHERE id = ?",
                dispute.otpId()
        );
        assertThat(otpRow.get("bi_vo_hieu")).isEqualTo(true);
        assertThat(otpRow.get("ly_do_vo_hieu")).isEqualTo("QUYET_DINH_KIEM_DUYET");
        assertThat(otpRow.get("otp_ciphertext")).isNull();

        assertThat(db.queryForObject(
                "SELECT trang_thai FROM yeu_cau_huy_giao_dichs WHERE ma_giao_dich = ?",
                String.class,
                dispute.orderId()
        )).isEqualTo("DA_DONG_DO_HOAN_TAT");

        // Verify audit trail (nhat_ky_kiem_duyet + lich_su_trang_thai_giao_dich)
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM nhat_ky_kiem_duyet WHERE actor_user_id = ? AND action_type = 'DISPUTE_DECIDED_COMPLETE'",
                Integer.class,
                moderator.id()
        )).isEqualTo(1);
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM lich_su_trang_thai_giao_dich WHERE ma_giao_dich = ? AND hanh_dong = 'MODERATOR_DECIDED_COMPLETE'",
                Integer.class,
                dispute.orderId()
        )).isEqualTo(1);

        // Verify notifications sent to BOTH buyer & seller
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM thong_baos WHERE ma_giao_dich = ? AND loai = 'DISPUTE_RESOLVED_COMPLETED'",
                Integer.class,
                dispute.orderId()
        )).isEqualTo(2);

        // CRITICAL UC-29 §2: Reputation score MUST NOT change!
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(100);
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, buyer.id()))
                .isEqualTo(100);
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM lich_su_diem_uy_tin WHERE user_id IN (?, ?)",
                Integer.class,
                seller.id(),
                buyer.id()
        )).isZero();

        // 6. UC-29 Exception 1: Second decision rejected with 409 DISPUTE_ALREADY_RESOLVED
        given()
                .auth().oauth2(seniorAdmin.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Kiểm duyệt viên thứ hai cố gắng hủy giao dịch đã hoàn tất"))
                .post("/api/v1/admin/disputes/" + dispute.orderId() + "/cancel")
                .then()
                .statusCode(409)
                .body("code", equalTo("DISPUTE_ALREADY_RESOLVED"));
    }

    @Test
    void uc29Alt1CancelReopensEligibleListingAndHidesIneligibleDueToExpiredLockedOrQuota() throws Exception {
        Account moderator = createAccount("ModCancel", 100, "KIEM_DUYET_VIEN");

        // Subcase A: Eligible listing reopens to CONG_KHAI
        Account sellerA = createAccount("SellerElig", 100, null);
        Account buyerA = createAccount("BuyerElig", 100, null);
        SeededDispute dispA = seedDisputeOrder(sellerA, buyerA, "Tin đủ điều kiện mở lại", "CANCEL_DISPUTE", false, false);

        given()
                .auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Bằng chứng cho thấy hai bên chưa bàn giao hàng nên hủy đơn."))
                .post("/api/v1/admin/disputes/" + dispA.orderId() + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"))
                .body("decision.conclusion", equalTo("HUY"))
                .body("decision.listingStatusAfter", equalTo("CONG_KHAI"))
                .body("decision.listingHiddenReason", nullValue());

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, dispA.itemIds().getFirst()))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, dispA.listingId()))
                .isEqualTo("CONG_KHAI");
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, sellerA.id()))
                .isEqualTo(100);

        // Subcase B (UC-29 Exception 4 - FR-13): Listing expired past 30 days -> items KHA_DUNG, listing AN + seller notified with reason
        Account sellerB = createAccount("SellerExp", 100, null);
        Account buyerB = createAccount("BuyerExp", 100, null);
        SeededDispute dispB = seedDisputeOrder(sellerB, buyerB, "Tin đã quá hạn 30 ngày", "OVERDUE_24H", false, false);
        db.update(
                "UPDATE tin_dangs SET published_at = NOW() - INTERVAL '35 days', expires_at = NOW() - INTERVAL '5 days' WHERE ma_tin = ?",
                dispB.listingId()
        );

        given()
                .auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Hủy giao dịch quá hạn nhưng tin đăng đã vượt 30 ngày hiển thị."))
                .post("/api/v1/admin/disputes/" + dispB.orderId() + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"))
                .body("decision.listingStatusAfter", equalTo("AN"))
                .body("decision.listingHiddenReason", containsString("30 ngày"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, dispB.itemIds().getFirst()))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, dispB.listingId()))
                .isEqualTo("AN");
        String sellerBNotif = db.queryForObject(
                "SELECT noi_dung FROM thong_baos WHERE nguoi_nhan_id = ? AND ma_giao_dich = ? AND loai = 'DISPUTE_RESOLVED_CANCELLED'",
                String.class,
                sellerB.id(),
                dispB.orderId()
        );
        assertThat(sellerBNotif).contains("30 ngày");

        // Subcase C (UC-29 Exception 4 - FR-12): Seller is BI_KHOA -> items KHA_DUNG, listing AN
        Account sellerC = createAccount("SellerLock", 100, null);
        Account buyerC = createAccount("BuyerLock", 100, null);
        SeededDispute dispC = seedDisputeOrder(sellerC, buyerC, "Tin người bán bị khóa", "CANCEL_DISPUTE", false, false);
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', khoa_den_ngay = NOW() + INTERVAL '14 days' WHERE user_id = ?",
                sellerC.id()
        );

        given()
                .auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Hủy giao dịch khi tài khoản người bán đang bị tạm khóa."))
                .post("/api/v1/admin/disputes/" + dispC.orderId() + "/cancel")
                .then()
                .statusCode(200)
                .body("decision.listingStatusAfter", equalTo("AN"))
                .body("decision.listingHiddenReason", containsString("không ở trạng thái hoạt động"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, dispC.itemIds().getFirst()))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, dispC.listingId()))
                .isEqualTo("AN");

        // Subcase D (UC-29 Exception 4 - FR-05): Seller already at quota 5/5 (score 100) -> items KHA_DUNG, listing AN
        Account sellerD = createAccount("SellerQuota", 130, null); // start >=120 to publish 6 listings
        Account buyerD = createAccount("BuyerQuota", 100, null);
        SeededDispute dispD = seedDisputeOrder(sellerD, buyerD, "Tin vượt hạn mức khi mở lại", "CANCEL_DISPUTE", false, false);
        for (int i = 0; i < 5; i++) {
            UUID extraItem = createItem(sellerD.mobileToken(), "Extra quota item " + i);
            publishListing(sellerD.mobileToken(), "Extra quota listing " + i, 50000, List.of(extraItem));
        }
        // Drop reputation score below 120 so quota limit becomes 5 while 5 OTHER CONG_KHAI exist
        db.update("UPDATE thanh_viens SET diem_uy_tin = 100 WHERE user_id = ?", sellerD.id());

        given()
                .auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Hủy giao dịch khi người bán đã đạt đủ 5/5 tin công khai."))
                .post("/api/v1/admin/disputes/" + dispD.orderId() + "/cancel")
                .then()
                .statusCode(200)
                .body("decision.listingStatusAfter", equalTo("AN"))
                .body("decision.listingHiddenReason", containsString("hạn mức"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, dispD.itemIds().getFirst()))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, dispD.listingId()))
                .isEqualTo("AN");
    }

    @Test
    void uc29Alt2RequestEvidenceMemberMultipartUploadPrivateAccessAndPathTraversalGuard() throws Exception {
        Account seller = createAccount("SellerEv", 100, null);
        Account buyer = createAccount("BuyerEv", 100, null);
        Account outsider = createAccount("OutsiderEv", 100, null);
        Account moderator = createAccount("ModEv", 100, "KIEM_DUYET_VIEN");

        SeededDispute dispute = seedDisputeOrder(seller, buyer, "Tin cần bổ sung bằng chứng", "CANCEL_DISPUTE", true, false);

        // 1. Moderator requests evidence from BOTH parties
        Response reqEvResp = given()
                .auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetParty", "BOTH",
                        "instruction", "Vui lòng gửi ảnh chụp tình trạng món đồ và đoạn chat hẹn giao.",
                        "dueInHours", 48
                ))
                .post("/api/v1/admin/disputes/" + dispute.orderId() + "/request-evidence")
                .then()
                .statusCode(200)
                .body("status", equalTo("CHO_XU_LY"))
                .body("queueState", equalTo("WAITING_EVIDENCE"))
                .body("hasActiveEvidenceRequest", equalTo(true))
                .body("evidenceRequests", hasSize(1))
                .body("evidenceRequests[0].status", equalTo("CHO_BO_SUNG"))
                .extract().response();

        UUID evRequestId = UUID.fromString(reqEvResp.jsonPath().getString("evidenceRequests[0].id"));

        // Duplicate open request rejected
        given()
                .auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("targetParty", "BUYER", "instruction", "Yêu cầu bổ sung lần hai khi đang mở"))
                .post("/api/v1/admin/disputes/" + dispute.orderId() + "/request-evidence")
                .then()
                .statusCode(409)
                .body("code", equalTo("EVIDENCE_REQUEST_ALREADY_OPEN"));

        // 2. Buyer checks member dispute view
        given()
                .auth().oauth2(buyer.mobileToken())
                .get("/api/v1/orders/" + dispute.orderId() + "/dispute")
                .then()
                .statusCode(200)
                .header("Cache-Control", equalTo("private, no-store"))
                .body("viewerRole", equalTo("BUYER"))
                .body("evidenceRequests[0].canSubmitResponse", equalTo(true))
                .body("evidenceRequests[0].hasViewerResponded", equalTo(false));

        // 3. Invalid non-image file rejected with 400 INVALID_MEDIA (magic bytes check)
        given()
                .auth().oauth2(buyer.mobileToken())
                .multiPart("note", "Đính kèm tệp giả mạo ảnh")
                .multiPart("files", "fake.png", "not-an-image".getBytes(), "image/png")
                .post("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence-requests/" + evRequestId + "/responses")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_MEDIA"));

        // 4. Buyer submits valid PNG + note -> 201 Created, stored privately (NEVER in media_files)
        int mediaCountBefore = db.queryForObject("SELECT COUNT(*) FROM media_files", Integer.class);
        byte[] validPng = createValidPngBytes();

        Response buyerUploadResp = given()
                .auth().oauth2(buyer.mobileToken())
                .multiPart("note", "Tôi gửi ảnh chụp vết trầy thực tế khi nhận đồ")
                .multiPart("files", "proof.png", validPng, "image/png")
                .post("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence-requests/" + evRequestId + "/responses")
                .then()
                .statusCode(201)
                .header("Cache-Control", equalTo("private, no-store"))
                .body("evidenceRequests[0].status", equalTo("CHO_BO_SUNG")) // waiting for seller too
                .body("evidenceRequests[0].hasViewerResponded", equalTo(true))
                .body("evidenceRequests[0].canSubmitResponse", equalTo(false))
                .body("evidenceRequests[0].responses", hasSize(1))
                .body("evidenceRequests[0].responses[0].attachments", hasSize(1))
                .extract().response();

        assertThat(db.queryForObject("SELECT COUNT(*) FROM media_files", Integer.class)).isEqualTo(mediaCountBefore);
        String attachmentId = buyerUploadResp.jsonPath().getString("evidenceRequests[0].responses[0].attachments[0].id");
        String memberAttachmentUrl = buyerUploadResp.jsonPath().getString("evidenceRequests[0].responses[0].attachments[0].url");
        assertThat(memberAttachmentUrl).isEqualTo("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence/" + attachmentId);

        // Duplicate submission by buyer -> 409 EVIDENCE_ALREADY_SUBMITTED
        given()
                .auth().oauth2(buyer.mobileToken())
                .multiPart("note", "Gửi lại lần 2")
                .post("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence-requests/" + evRequestId + "/responses")
                .then()
                .statusCode(409)
                .body("code", equalTo("EVIDENCE_ALREADY_SUBMITTED"));

        // 5. Seller submits text response -> evidence request transitions to DA_PHAN_HOI & returns to READY queue
        given()
                .auth().oauth2(seller.mobileToken())
                .multiPart("note", "Đồ vật đã được kiểm tra kỹ trước khi giao")
                .post("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence-requests/" + evRequestId + "/responses")
                .then()
                .statusCode(201)
                .body("evidenceRequests[0].status", equalTo("DA_PHAN_HOI"))
                .body("evidenceRequests[0].responses", hasSize(2));

        given()
                .auth().oauth2(moderator.adminToken())
                .get("/api/v1/admin/disputes/" + dispute.orderId())
                .then()
                .statusCode(200)
                .body("queueState", equalTo("READY"))
                .body("hasActiveEvidenceRequest", equalTo(false))
                .body("evidenceRequests[0].status", equalTo("DA_PHAN_HOI"));

        // 6. Private evidence authorization: buyer, seller, moderator = 200; outsider = 403
        given().auth().oauth2(buyer.mobileToken()).get(memberAttachmentUrl).then()
                .statusCode(200).header("Cache-Control", equalTo("private, no-store"));
        given().auth().oauth2(seller.mobileToken()).get(memberAttachmentUrl).then()
                .statusCode(200).header("Cache-Control", equalTo("private, no-store"));
        given().auth().oauth2(moderator.adminToken())
                .get("/api/v1/admin/disputes/" + dispute.orderId() + "/evidence/supplementary/" + attachmentId)
                .then().statusCode(200)
                .header("Cache-Control", equalTo("private, no-store"))
                .header("X-Content-Type-Options", equalTo("nosniff"));

        given().auth().oauth2(outsider.mobileToken()).get("/api/v1/orders/" + dispute.orderId() + "/dispute")
                .then().statusCode(403).body("code", equalTo("DISPUTE_FORBIDDEN"));
        given().auth().oauth2(outsider.mobileToken()).get(memberAttachmentUrl)
                .then().statusCode(403).body("code", equalTo("DISPUTE_FORBIDDEN"));

        // 7. Path traversal guard in storage
        assertThatThrownBy(() -> evidenceStorage.loadAsResource("../secret.png"))
                .isInstanceOf(AuthFailure.class)
                .extracting("code").isEqualTo("INVALID_STORAGE_KEY");
        assertThatThrownBy(() -> evidenceStorage.loadAsResource("/etc/passwd"))
                .isInstanceOf(AuthFailure.class)
                .extracting("code").isEqualTo("INVALID_STORAGE_KEY");
        assertThatThrownBy(() -> evidenceStorage.loadAsResource("supplementary\\evil.png"))
                .isInstanceOf(AuthFailure.class)
                .extracting("code").isEqualTo("INVALID_STORAGE_KEY");
    }

    @Test
    void uc29ConflictOfInterestRbacLockedMemberReadOnlyAndAlt3Alt4Guards() throws Exception {
        Account modSeller = createAccount("ModSelfSeller", 100, "KIEM_DUYET_VIEN");
        Account buyer = createAccount("BuyerSelf", 100, null);
        Account otherMod = createAccount("ModOther", 100, "KIEM_DUYET_VIEN");

        SeededDispute selfDispute = seedDisputeOrder(modSeller, buyer, "Tin của chính kiểm duyệt viên", "OVERDUE_24H", true, false);

        // 1. Conflict of interest (UC-29 §4): self-dispute EXCLUDED from list & 403 SELF_DISPUTE_FORBIDDEN on all endpoints
        Response selfList = given()
                .auth().oauth2(modSeller.adminToken())
                .queryParam("q", selfDispute.orderId().toString())
                .get("/api/v1/admin/disputes")
                .then()
                .statusCode(200)
                .body("items", hasSize(0))
                .extract().response();
        assertThat(selfList.asString()).doesNotContain(selfDispute.orderId().toString());

        given().auth().oauth2(modSeller.adminToken())
                .get("/api/v1/admin/disputes/" + selfDispute.orderId())
                .then().statusCode(403).body("code", equalTo("SELF_DISPUTE_FORBIDDEN"));
        given().auth().oauth2(modSeller.adminToken())
                .get("/api/v1/admin/disputes/" + selfDispute.orderId() + "/evidence/handover/" + selfDispute.handoverPhotoId())
                .then().statusCode(403).body("code", equalTo("SELF_DISPUTE_FORBIDDEN"));
        given().auth().oauth2(modSeller.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Tự hoàn tất giao dịch của chính mình bị cấm"))
                .post("/api/v1/admin/disputes/" + selfDispute.orderId() + "/complete")
                .then().statusCode(403).body("code", equalTo("SELF_DISPUTE_FORBIDDEN"));
        given().auth().oauth2(modSeller.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Tự hủy giao dịch của chính mình bị cấm"))
                .post("/api/v1/admin/disputes/" + selfDispute.orderId() + "/cancel")
                .then().statusCode(403).body("code", equalTo("SELF_DISPUTE_FORBIDDEN"));
        given().auth().oauth2(modSeller.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("targetParty", "BUYER", "instruction", "Tự yêu cầu bổ sung bị cấm"))
                .post("/api/v1/admin/disputes/" + selfDispute.orderId() + "/request-evidence")
                .then().statusCode(403).body("code", equalTo("SELF_DISPUTE_FORBIDDEN"));

        // 2. RBAC: regular MEMBER gets 403 on /api/v1/admin/disputes/**
        given().auth().oauth2(buyer.mobileToken())
                .get("/api/v1/admin/disputes")
                .then().statusCode(403);

        // 3. Another moderator requests evidence (BOTH), seller uploads an attachment, then buyer gets BI_KHOA ->
        //    read-only GET /dispute & GET /evidence/{attachmentId} return 200, POST .../responses returns 403 ACCOUNT_RESTRICTED!
        UUID evReqId = UUID.fromString(given()
                .auth().oauth2(otherMod.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("targetParty", "BOTH", "instruction", "Bổ sung hình ảnh bằng chứng giao nhận"))
                .post("/api/v1/admin/disputes/" + selfDispute.orderId() + "/request-evidence")
                .then().statusCode(200).extract().jsonPath().getString("evidenceRequests[0].id"));

        String sellerAttachmentId = given()
                .auth().oauth2(modSeller.mobileToken())
                .multiPart("note", "Người bán gửi ảnh bổ sung trước khi người mua bị khóa")
                .multiPart("files", "seller-ev.png", createValidPngBytes(), "image/png")
                .post("/api/v1/orders/" + selfDispute.orderId() + "/dispute/evidence-requests/" + evReqId + "/responses")
                .then().statusCode(201)
                .extract().jsonPath().getString("evidenceRequests[0].responses[0].attachments[0].id");

        // Self-dispute supplementary attachment download MUST also be 403 SELF_DISPUTE_FORBIDDEN!
        given().auth().oauth2(modSeller.adminToken())
                .get("/api/v1/admin/disputes/" + selfDispute.orderId() + "/evidence/supplementary/" + sellerAttachmentId)
                .then().statusCode(403).body("code", equalTo("SELF_DISPUTE_FORBIDDEN"));

        // Verify counts exclusion for self-dispute (otherMod sees strictly more than modSeller)
        long modSellerTotal = given().auth().oauth2(modSeller.adminToken())
                .get("/api/v1/admin/disputes").then().statusCode(200)
                .extract().jsonPath().getLong("counts.all");
        long otherModTotal = given().auth().oauth2(otherMod.adminToken())
                .get("/api/v1/admin/disputes").then().statusCode(200)
                .extract().jsonPath().getLong("counts.all");
        assertThat(otherModTotal).isGreaterThan(modSellerTotal);

        // Self-dispute when moderator is BUYER
        Account sellerForModBuyer = createAccount("SellerForModBuyer", 100, null);
        SeededDispute modAsBuyerDispute = seedDisputeOrder(sellerForModBuyer, modSeller, "Tin mà KDV là người mua", "CANCEL_DISPUTE", true, false);
        given().auth().oauth2(modSeller.adminToken())
                .queryParam("q", modAsBuyerDispute.orderId().toString())
                .get("/api/v1/admin/disputes")
                .then().statusCode(200).body("items", hasSize(0));
        given().auth().oauth2(modSeller.adminToken())
                .get("/api/v1/admin/disputes/" + modAsBuyerDispute.orderId())
                .then().statusCode(403).body("code", equalTo("SELF_DISPUTE_FORBIDDEN"));
        given().auth().oauth2(modSeller.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "KDV là người mua không được tự hủy giao dịch"))
                .post("/api/v1/admin/disputes/" + modAsBuyerDispute.orderId() + "/cancel")
                .then().statusCode(403).body("code", equalTo("SELF_DISPUTE_FORBIDDEN"));

        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', khoa_den_ngay = NOW() + INTERVAL '7 days' WHERE user_id = ?",
                buyer.id()
        );

        given().auth().oauth2(buyer.mobileToken())
                .get("/api/v1/orders/" + selfDispute.orderId() + "/dispute")
                .then()
                .statusCode(200)
                .body("viewerRole", equalTo("BUYER"))
                .body("evidenceRequests[0].canSubmitResponse", equalTo(false));

        given().auth().oauth2(buyer.mobileToken())
                .get("/api/v1/orders/" + selfDispute.orderId() + "/dispute/evidence/" + sellerAttachmentId)
                .then()
                .statusCode(200)
                .header("Cache-Control", equalTo("private, no-store"));

        given().auth().oauth2(buyer.mobileToken())
                .multiPart("note", "Tài khoản bị khóa không thể gửi bằng chứng")
                .post("/api/v1/orders/" + selfDispute.orderId() + "/dispute/evidence-requests/" + evReqId + "/responses")
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"));

        // 4. Stale expectedVersion -> 409 VERSION_CONFLICT
        given().auth().oauth2(otherMod.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Kiểm thử sai phiên bản expectedVersion", "expectedVersion", 999))
                .post("/api/v1/admin/disputes/" + selfDispute.orderId() + "/complete")
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // 5. UC-29 Alt 3 / Alt 4: Buyer self-confirms (HOAN_TAT) before moderator decides -> 409 DISPUTE_ALREADY_RESOLVED
        db.update("UPDATE giao_dichs SET trang_thai = 'HOAN_TAT', thoi_diem_hoan_tat = NOW() WHERE ma_giao_dich = ?", selfDispute.orderId());
        given().auth().oauth2(otherMod.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Kiểm duyệt viên quyết định sau khi người mua đã tự xác nhận"))
                .post("/api/v1/admin/disputes/" + selfDispute.orderId() + "/cancel")
                .then()
                .statusCode(409)
                .body("code", equalTo("DISPUTE_ALREADY_RESOLVED"));

        given().auth().oauth2(otherMod.adminToken())
                .get("/api/v1/admin/disputes/" + selfDispute.orderId())
                .then()
                .statusCode(200)
                .body("decidable", equalTo(false))
                .body("status", equalTo("HOAN_TAT"));

        // 6. Non-disputed order (e.g., GIU_CHO) -> 404 DISPUTE_NOT_FOUND on admin detail & evidence endpoints (NFR-01),
        //    and 409 INVALID_STATE_TRANSITION on decision endpoints
        Account seller2 = createAccount("SellerNonDisp", 100, null);
        Account buyer2 = createAccount("BuyerNonDisp", 100, null);
        UUID item2 = createItem(seller2.mobileToken(), "Non-dispute item");
        UUID listing2 = publishListing(seller2.mobileToken(), "Non-dispute listing", 50000, List.of(item2));
        UUID order2 = UUID.fromString(given()
                .auth().oauth2(buyer2.mobileToken()).contentType(ContentType.JSON)
                .body(Map.of("listingId", listing2.toString()))
                .post("/api/v1/orders").then().statusCode(201).extract().jsonPath().getString("id"));
        given().auth().oauth2(seller2.mobileToken()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + order2 + "/accept").then().statusCode(200);
        db.update("UPDATE giao_dichs SET anh_ban_giao = '/api/v1/media/legacy-sample.jpg' WHERE ma_giao_dich = ?", order2);

        given().auth().oauth2(otherMod.adminToken())
                .get("/api/v1/admin/disputes/" + order2)
                .then()
                .statusCode(404)
                .body("code", equalTo("DISPUTE_NOT_FOUND"));
        given().auth().oauth2(otherMod.adminToken())
                .get("/api/v1/admin/disputes/" + order2 + "/evidence/handover/" + UUID.randomUUID())
                .then()
                .statusCode(404)
                .body("code", equalTo("DISPUTE_NOT_FOUND"));
        given().auth().oauth2(otherMod.adminToken())
                .get("/api/v1/admin/disputes/" + order2 + "/evidence/supplementary/" + UUID.randomUUID())
                .then()
                .statusCode(404)
                .body("code", equalTo("DISPUTE_NOT_FOUND"));

        given().auth().oauth2(otherMod.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Không thể xử lý đơn chưa ở trạng thái CHO_XU_LY"))
                .post("/api/v1/admin/disputes/" + order2 + "/complete")
                .then()
                .statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));
    }

    @Test
    void uc29CancelEdgeCasesQuotaBoundaryExpiredTempLockComboUnavailablePreservedStatusAndCancelRequestClosure() throws Exception {
        Account moderator = createAccount("ModCancelEdge", 100, "KIEM_DUYET_VIEN");

        // 1. FR-05 boundary (4 other CONG_KHAI + this 1 GIU_CHO with quota 5) -> MUST reopen CONG_KHAI,
        //    clear ly_do_an = NULL, and close pending yeu_cau_huy_giao_dichs to DA_DONG_DO_HUY!
        Account sellerBoundary = createAccount("SellerBound", 100, null);
        Account buyerBoundary = createAccount("BuyerBound", 100, null);
        for (int i = 0; i < 4; i++) {
            UUID extraItem = createItem(sellerBoundary.mobileToken(), "Boundary item " + i);
            publishListing(sellerBoundary.mobileToken(), "Boundary listing " + i, 30000, List.of(extraItem));
        }
        SeededDispute dispBoundary = seedDisputeOrder(sellerBoundary, buyerBoundary, "Tin biên quota 4+1", "CANCEL_DISPUTE", false, true);
        db.update("UPDATE tin_dangs SET ly_do_an = 'Lý do ẩn cũ cần xóa' WHERE ma_tin = ?", dispBoundary.listingId());

        given().auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Hủy giao dịch ở ngưỡng 4 tin công khai khác, tin này phải mở lại công khai."))
                .post("/api/v1/admin/disputes/" + dispBoundary.orderId() + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"))
                .body("decision.listingStatusAfter", equalTo("CONG_KHAI"))
                .body("decision.listingHiddenReason", nullValue());

        Map<String, Object> boundaryListing = db.queryForMap(
                "SELECT trang_thai, ly_do_an FROM tin_dangs WHERE ma_tin = ?",
                dispBoundary.listingId()
        );
        assertThat(boundaryListing.get("trang_thai")).isEqualTo("CONG_KHAI");
        assertThat(boundaryListing.get("ly_do_an")).isNull();
        assertThat(db.queryForObject(
                "SELECT trang_thai FROM yeu_cau_huy_giao_dichs WHERE ma_giao_dich = ?",
                String.class,
                dispBoundary.orderId()
        )).isEqualTo("DA_DONG_DO_HUY");

        // 2. FR-12 expired temporary lock (khoa_den_ngay <= now) -> reconciles & reopens CONG_KHAI!
        Account sellerExpLock = createAccount("SellerExpLock", 45, null);
        Account buyerExpLock = createAccount("BuyerExpLock", 100, null);
        SeededDispute dispExpLock = seedDisputeOrder(sellerExpLock, buyerExpLock, "Tin người bán hết hạn khóa tạm", "OVERDUE_24H", false, false);
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', khoa_den_ngay = NOW() - INTERVAL '2 hours' WHERE user_id = ?",
                sellerExpLock.id()
        );

        given().auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Hủy giao dịch khi khóa tạm 14 ngày của người bán đã hết hạn."))
                .post("/api/v1/admin/disputes/" + dispExpLock.orderId() + "/cancel")
                .then()
                .statusCode(200)
                .body("decision.listingStatusAfter", equalTo("CONG_KHAI"))
                .body("decision.listingHiddenReason", nullValue());

        assertThat(db.queryForObject("SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ?", String.class, sellerExpLock.id()))
                .isEqualTo("HOAT_DONG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, dispExpLock.listingId()))
                .isEqualTo("CONG_KHAI");

        // 3. Combo listing with 1 item already DA_CHUYEN_GIAO -> listing becomes AN, DA_CHUYEN_GIAO item stays untouched
        Account sellerCombo = createAccount("SellerCombo", 100, null);
        Account buyerCombo = createAccount("BuyerCombo", 100, null);
        UUID comboItem1 = createItem(sellerCombo.mobileToken(), "Combo item 1");
        UUID comboItem2 = createItem(sellerCombo.mobileToken(), "Combo item 2");
        UUID comboListingId = publishListing(sellerCombo.mobileToken(), "Combo tranh chấp", 150000, List.of(comboItem1, comboItem2));
        UUID comboOrderId = UUID.fromString(given()
                .auth().oauth2(buyerCombo.mobileToken()).contentType(ContentType.JSON)
                .body(Map.of("listingId", comboListingId.toString()))
                .post("/api/v1/orders").then().statusCode(201).extract().jsonPath().getString("id"));
        given().auth().oauth2(sellerCombo.mobileToken()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + comboOrderId + "/accept").then().statusCode(200);
        db.update(
                "UPDATE giao_dichs SET trang_thai = 'CHO_XU_LY', ly_do_cho_xu_ly = 'CANCEL_DISPUTE', thoi_diem_chuyen_xu_ly = NOW() WHERE ma_giao_dich = ?",
                comboOrderId
        );
        db.update("UPDATE do_vats SET trang_thai = 'DA_CHUYEN_GIAO' WHERE ma_vat = ?", comboItem2);

        given().auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Hủy giao dịch combo khi một đồ vật đã chuyển giao trước đó."))
                .post("/api/v1/admin/disputes/" + comboOrderId + "/cancel")
                .then()
                .statusCode(200)
                .body("decision.listingStatusAfter", equalTo("AN"))
                .body("decision.listingHiddenReason", containsString("Khả dụng"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, comboItem1))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, comboItem2))
                .isEqualTo("DA_CHUYEN_GIAO");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, comboListingId))
                .isEqualTo("AN");

        // 4. Pre-existing AN and KET_THUC listings preserved unchanged on cancelDispute
        Account sellerPres = createAccount("SellerPres", 100, null);
        Account buyerPres = createAccount("BuyerPres", 100, null);
        SeededDispute dispAn = seedDisputeOrder(sellerPres, buyerPres, "Tin đã ẩn sẵn", "CANCEL_DISPUTE", false, false);
        db.update("UPDATE tin_dangs SET trang_thai = 'AN', ly_do_an = 'Người bán đã chủ động ẩn' WHERE ma_tin = ?", dispAn.listingId());

        given().auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Hủy giao dịch của tin đã ẩn từ trước, giữ nguyên trạng thái Ẩn."))
                .post("/api/v1/admin/disputes/" + dispAn.orderId() + "/cancel")
                .then()
                .statusCode(200)
                .body("decision.listingStatusAfter", equalTo("AN"))
                .body("decision.listingHiddenReason", equalTo("Người bán đã chủ động ẩn"));

        SeededDispute dispKetThuc = seedDisputeOrder(sellerPres, buyerPres, "Tin đã kết thúc sẵn", "OVERDUE_24H", false, false);
        db.update("UPDATE tin_dangs SET trang_thai = 'KET_THUC', closed_at = NOW() WHERE ma_tin = ?", dispKetThuc.listingId());

        given().auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Hủy giao dịch của tin đã kết thúc, giữ nguyên trạng thái Kết thúc."))
                .post("/api/v1/admin/disputes/" + dispKetThuc.orderId() + "/cancel")
                .then()
                .statusCode(200)
                .body("decision.listingStatusAfter", equalTo("KET_THUC"))
                .body("decision.listingHiddenReason", nullValue());
    }

    @Test
    void uc29CompleteItemIntegrityDeletedSnapshotCrossOrderIdorAndLegacyPhotoGuards() throws Exception {
        Account moderator = createAccount("ModInteg", 100, "KIEM_DUYET_VIEN");
        Account seller = createAccount("SellerInteg", 130, null);
        Account buyer = createAccount("BuyerInteg", 100, null);

        // 1. completeDispute rejects item already DA_CHUYEN_GIAO or actively held by another order with 409 INVALID_STATE_TRANSITION
        SeededDispute dispTransferred = seedDisputeOrder(seller, buyer, "Tin đồ vật đã chuyển giao", "OVERDUE_24H", true, false);
        db.update("UPDATE do_vats SET trang_thai = 'DA_CHUYEN_GIAO' WHERE ma_vat = ?", dispTransferred.itemIds().getFirst());

        given().auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Không thể hoàn tất khi đồ vật đã ở trạng thái DA_CHUYEN_GIAO"))
                .post("/api/v1/admin/disputes/" + dispTransferred.orderId() + "/complete")
                .then()
                .statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));

        SeededDispute dispOtherHold = seedDisputeOrder(seller, buyer, "Tin đồ vật bị đơn khác giữ chỗ", "OVERDUE_24H", false, false);
        SeededDispute holderOrder = seedDisputeOrder(seller, buyer, "Đơn khác giữ chỗ trùng đồ vật", "CANCEL_DISPUTE", false, false);
        db.update("UPDATE giao_dich_do_vat SET giu_hieu_luc = FALSE WHERE ma_giao_dich = ?", dispOtherHold.orderId());
        db.update(
                "INSERT INTO giao_dich_do_vat(ma_giao_dich, ma_vat, ten_vat_snapshot, tinh_trang_snapshot, giu_hieu_luc) VALUES (?, ?, 'Held', 'Tốt', TRUE)",
                holderOrder.orderId(),
                dispOtherHold.itemIds().getFirst()
        );
        given().auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Không thể hoàn tất khi đồ vật đang bị giữ chỗ bởi giao dịch khác"))
                .post("/api/v1/admin/disputes/" + dispOtherHold.orderId() + "/complete")
                .then()
                .statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));

        // 2. findOrderItemIdsSorted DA_XOA guard: snapshot rows with ma_vat = NULL must NOT fall back to tin_dang_do_vat
        SeededDispute dispDeletedItem = seedDisputeOrder(seller, buyer, "Tin đồ vật bị xóa snapshot", "OVERDUE_24H", false, false);
        UUID unrelatedItem = createItem(seller.mobileToken(), "Unrelated KHA_DUNG item");
        db.update("UPDATE giao_dich_do_vat SET ma_vat = NULL, giu_hieu_luc = FALSE WHERE ma_giao_dich = ?", dispDeletedItem.orderId());
        db.update("DELETE FROM tin_dang_do_vat WHERE ma_tin = ?", dispDeletedItem.listingId());
        db.update("INSERT INTO tin_dang_do_vat(ma_tin, ma_vat) VALUES (?, ?)", dispDeletedItem.listingId(), unrelatedItem);

        given().auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("basis", "Hoàn tất giao dịch dù đồ vật snapshot đã xóa không được chạm tin_dang_do_vat"))
                .post("/api/v1/admin/disputes/" + dispDeletedItem.orderId() + "/complete")
                .then()
                .statusCode(200)
                .body("status", equalTo("HOAN_TAT"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, unrelatedItem))
                .isEqualTo("KHA_DUNG");

        // 3. Cross-order IDOR: orderA path + orderB's photoId/attachmentId -> 404 EVIDENCE_NOT_FOUND
        SeededDispute orderA = seedDisputeOrder(seller, buyer, "IDOR Order A", "OVERDUE_24H", true, false);
        SeededDispute orderB = seedDisputeOrder(seller, buyer, "IDOR Order B", "CANCEL_DISPUTE", true, false);
        UUID reqB = UUID.fromString(given().auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("targetParty", "BUYER", "instruction", "Nộp ảnh bổ sung cho đơn B"))
                .post("/api/v1/admin/disputes/" + orderB.orderId() + "/request-evidence")
                .then().statusCode(200).extract().jsonPath().getString("evidenceRequests[0].id"));
        String attachmentB = given().auth().oauth2(buyer.mobileToken())
                .multiPart("note", "Ảnh bổ sung của đơn B")
                .multiPart("files", "b.png", createValidPngBytes(), "image/png")
                .post("/api/v1/orders/" + orderB.orderId() + "/dispute/evidence-requests/" + reqB + "/responses")
                .then().statusCode(201).extract().jsonPath().getString("evidenceRequests[0].responses[0].attachments[0].id");

        given().auth().oauth2(moderator.adminToken())
                .get("/api/v1/admin/disputes/" + orderA.orderId() + "/evidence/handover/" + orderB.handoverPhotoId())
                .then().statusCode(404).body("code", equalTo("EVIDENCE_NOT_FOUND"));
        given().auth().oauth2(moderator.adminToken())
                .get("/api/v1/admin/disputes/" + orderA.orderId() + "/evidence/supplementary/" + attachmentB)
                .then().statusCode(404).body("code", equalTo("EVIDENCE_NOT_FOUND"));
        given().auth().oauth2(buyer.mobileToken())
                .get("/api/v1/orders/" + orderA.orderId() + "/dispute/evidence/" + attachmentB)
                .then().statusCode(404).body("code", equalTo("EVIDENCE_NOT_FOUND"));

        // 4. Legacy anh_ban_giao fallback guard on disputed order: accepts /api/v1/..., rejects // and external https://
        SeededDispute legacyDisp = seedDisputeOrder(seller, buyer, "Legacy photo dispute", "OVERDUE_24H", false, false);
        db.update("UPDATE giao_dichs SET anh_ban_giao = '/api/v1/media/legacy-sample.jpg' WHERE ma_giao_dich = ?", legacyDisp.orderId());
        given().auth().oauth2(moderator.adminToken())
                .get("/api/v1/admin/disputes/" + legacyDisp.orderId())
                .then().statusCode(200)
                .body("handoverPhotos", hasSize(1))
                .body("handoverPhotos[0].url", equalTo("/api/v1/media/legacy-sample.jpg"));

        db.update("UPDATE giao_dichs SET anh_ban_giao = '//evil.example/leak.png' WHERE ma_giao_dich = ?", legacyDisp.orderId());
        given().auth().oauth2(moderator.adminToken())
                .get("/api/v1/admin/disputes/" + legacyDisp.orderId())
                .then().statusCode(200)
                .body("handoverPhotos", hasSize(0));

        db.update("UPDATE giao_dichs SET anh_ban_giao = 'https://evil.example/leak.png' WHERE ma_giao_dich = ?", legacyDisp.orderId());
        given().auth().oauth2(moderator.adminToken())
                .get("/api/v1/admin/disputes/" + legacyDisp.orderId())
                .then().statusCode(200)
                .body("handoverPhotos", hasSize(0));
    }

    @Test
    void uc29EvidenceValidationLazyExpirySymlinkGuardAndE5StorageFailureRollback() throws Exception {
        Account seller = createAccount("SellerVal", 100, null);
        Account buyer = createAccount("BuyerVal", 100, null);
        Account moderator = createAccount("ModVal", 100, "KIEM_DUYET_VIEN");

        SeededDispute dispute = seedDisputeOrder(seller, buyer, "Tin kiểm thử validation & E5", "CANCEL_DISPUTE", false, false);

        UUID reqId = UUID.fromString(given().auth().oauth2(moderator.adminToken())
                .contentType(ContentType.JSON)
                .body(Map.of("targetParty", "BUYER", "instruction", "Chỉ yêu cầu người mua bổ sung bằng chứng"))
                .post("/api/v1/admin/disputes/" + dispute.orderId() + "/request-evidence")
                .then().statusCode(200).extract().jsonPath().getString("evidenceRequests[0].id"));

        // 1. targetParty mismatch: SELLER tries to submit on BUYER-only request -> 403 DISPUTE_FORBIDDEN
        given().auth().oauth2(seller.mobileToken())
                .multiPart("note", "Người bán không thuộc targetParty")
                .post("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence-requests/" + reqId + "/responses")
                .then().statusCode(403).body("code", equalTo("DISPUTE_FORBIDDEN"));

        // 2. Missing note param -> 400 INVALID_INPUT
        byte[] validPng = createValidPngBytes();
        given().auth().oauth2(buyer.mobileToken())
                .multiPart("files", "p1.png", validPng, "image/png")
                .post("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence-requests/" + reqId + "/responses")
                .then().statusCode(400).body("code", equalTo("INVALID_INPUT"));

        // 3. > 5 files -> 400 INVALID_MEDIA
        given().auth().oauth2(buyer.mobileToken())
                .multiPart("note", "Gửi quá 5 ảnh bằng chứng")
                .multiPart("files", "1.png", validPng, "image/png")
                .multiPart("files", "2.png", validPng, "image/png")
                .multiPart("files", "3.png", validPng, "image/png")
                .multiPart("files", "4.png", validPng, "image/png")
                .multiPart("files", "5.png", validPng, "image/png")
                .multiPart("files", "6.png", validPng, "image/png")
                .post("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence-requests/" + reqId + "/responses")
                .then().statusCode(400).body("code", equalTo("INVALID_MEDIA"));

        // 4. > 5MB file -> 413 FILE_TOO_LARGE
        byte[] oversized = new byte[5 * 1024 * 1024 + 1024];
        System.arraycopy(validPng, 0, oversized, 0, validPng.length);
        given().auth().oauth2(buyer.mobileToken())
                .multiPart("note", "Gửi tệp vượt quá 5MB")
                .multiPart("files", "huge.png", oversized, "image/png")
                .post("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence-requests/" + reqId + "/responses")
                .then().statusCode(413).body("code", equalTo("FILE_TOO_LARGE"));

        // 5. UC-29 E5: storage I/O failure on 2nd file -> 503 DISPUTE_UNAVAILABLE + DB rollback + orphan file cleanup!
        //    First verify real LocalDisputeEvidenceStorage.store() converts IOException -> 503 DISPUTE_UNAVAILABLE
        String ioCollisionKey = "supplementary/io-collision-" + UUID.randomUUID() + "/blocked.png";
        Path collisionDir = evidenceStorage.evidenceRootDir().resolve(ioCollisionKey);
        Files.createDirectories(collisionDir);
        try {
            assertThatThrownBy(() -> evidenceStorage.store(ioCollisionKey, validPng))
                    .isInstanceOf(AuthFailure.class)
                    .satisfies(ex -> {
                        AuthFailure af = (AuthFailure) ex;
                        assertThat(af.status).isEqualTo(503);
                        assertThat(af.code).isEqualTo("DISPUTE_UNAVAILABLE");
                    });
        } finally {
            Files.deleteIfExists(collisionDir);
            Files.deleteIfExists(collisionDir.getParent());
        }

        // Symlink traversal guard check when OS permits symlink creation
        Path outsideFile = Files.createTempFile("dispute-symlink-secret-", ".txt");
        Files.writeString(outsideFile, "secret");
        Path symlinkPath = evidenceStorage.evidenceRootDir().resolve("supplementary/symlink-check-" + UUID.randomUUID() + ".png");
        Files.createDirectories(symlinkPath.getParent());
        try {
            Files.createSymbolicLink(symlinkPath, outsideFile);
            String symlinkKey = evidenceStorage.evidenceRootDir().relativize(symlinkPath).toString().replace('\\', '/');
            assertThatThrownBy(() -> evidenceStorage.loadAsResource(symlinkKey))
                    .isInstanceOf(AuthFailure.class)
                    .extracting("code").isEqualTo("INVALID_STORAGE_KEY");
            assertThatThrownBy(() -> evidenceStorage.store(symlinkKey, validPng))
                    .isInstanceOf(AuthFailure.class)
                    .extracting("code").isEqualTo("INVALID_STORAGE_KEY");
        } catch (UnsupportedOperationException | FileSystemException ignored) {
            // Host OS/user privilege restricts symlink creation; lexical & real-path logic still enforced in LocalDisputeEvidenceStorage
        } finally {
            Files.deleteIfExists(symlinkPath);
            Files.deleteIfExists(outsideFile);
        }

        // End-to-end HTTP UC-29 E5 test: 1st file stored on disk, 2nd file fails storage I/O -> 503 + rollback + 1st file deleted
        AtomicInteger storeAttempts = new AtomicInteger(0);
        AtomicReference<String> firstStoredKey = new AtomicReference<>();
        doAnswer(invocation -> {
            int attempt = storeAttempts.incrementAndGet();
            if (attempt == 1) {
                firstStoredKey.set(invocation.getArgument(0));
                return invocation.callRealMethod();
            }
            throw new AuthFailure(503, "DISPUTE_UNAVAILABLE", "Không thể truy cập kho tệp bằng chứng lúc này. Vui lòng thử lại.");
        }).when(evidenceStorage).store(anyString(), any(byte[].class));

        try {
            given().auth().oauth2(buyer.mobileToken())
                    .multiPart("note", "Kiểm thử lỗi ổ đĩa E5 với 2 tệp đính kèm")
                    .multiPart("files", "first.png", validPng, "image/png")
                    .multiPart("files", "second.png", validPng, "image/png")
                    .post("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence-requests/" + reqId + "/responses")
                    .then()
                    .statusCode(503)
                    .body("code", equalTo("DISPUTE_UNAVAILABLE"));
        } finally {
            Mockito.reset(evidenceStorage);
        }

        assertThat(firstStoredKey.get()).isNotNull();
        assertThat(Files.exists(evidenceStorage.evidenceRootDir().resolve(firstStoredKey.get()))).isFalse();
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM phan_hoi_bo_sung_giao_dichs WHERE yeu_cau_id = ?",
                Integer.class,
                reqId
        )).isZero();
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM bang_chung_bo_sung_giao_dichs WHERE ma_giao_dich = ?",
                Integer.class,
                dispute.orderId()
        )).isZero();
        assertThat(db.queryForObject(
                "SELECT trang_thai FROM yeu_cau_bo_sung_giao_dichs WHERE id = ?",
                String.class,
                reqId
        )).isEqualTo("CHO_BO_SUNG");

        // 6. Expired evidence request: lazy QUA_HAN derivation before scheduler tick + 409 EVIDENCE_REQUEST_EXPIRED on submit
        db.update(
                "UPDATE yeu_cau_bo_sung_giao_dichs SET han_bo_sung = NOW() - INTERVAL '5 minutes' WHERE id = ?",
                reqId
        );

        given().auth().oauth2(moderator.adminToken())
                .get("/api/v1/admin/disputes/" + dispute.orderId())
                .then()
                .statusCode(200)
                .body("queueState", equalTo("READY"))
                .body("hasActiveEvidenceRequest", equalTo(false))
                .body("evidenceRequests[0].status", equalTo("QUA_HAN"));

        given().auth().oauth2(buyer.mobileToken())
                .get("/api/v1/orders/" + dispute.orderId() + "/dispute")
                .then()
                .statusCode(200)
                .body("evidenceRequests[0].status", equalTo("QUA_HAN"))
                .body("evidenceRequests[0].canSubmitResponse", equalTo(false));

        given().auth().oauth2(buyer.mobileToken())
                .multiPart("note", "Nộp sau khi đã quá hạn bổ sung")
                .post("/api/v1/orders/" + dispute.orderId() + "/dispute/evidence-requests/" + reqId + "/responses")
                .then()
                .statusCode(409)
                .body("code", equalTo("EVIDENCE_REQUEST_EXPIRED"));

        // Clean up expired test row so subsequent scheduler tests on shared DB see a clean slate
        db.update("UPDATE yeu_cau_bo_sung_giao_dichs SET trang_thai = 'QUA_HAN' WHERE id = ?", reqId);
    }
}
