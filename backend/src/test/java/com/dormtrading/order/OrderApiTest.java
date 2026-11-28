package com.dormtrading.order;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
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
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

class OrderApiTest extends BaseIntegrationTest {

    private static final String PASSWORD = "a quiet river beneath stars";

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private JdbcTemplate db;

    @MockitoBean
    private JavaMailSender mail;

    private final ConcurrentMap<String, String> otpCodes = new ConcurrentHashMap<>();

    private record MemberAccount(UUID id, String email, String studentId, String token) {
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

    private MemberAccount createMember(String label, boolean approved, String accountStatus, int score) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "OD" + suffix;
        String email = "ord_" + suffix + "@student.edu.vn";
        String ip = "10.6." + (Math.abs(suffix.hashCode()) % 250) + ".1";

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
        return new MemberAccount(userId, email, studentId, token);
    }

    private MemberAccount createActiveMember(String label) {
        return createMember(label, true, "HOAT_DONG", 100);
    }

    private UUID createItem(String token, String name) {
        String id = given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", name,
                        "tinhTrang", "Mới 95%",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/ord/" + UUID.randomUUID() + ".jpg")
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
        body.put("description", "Mô tả đầy đủ cho kiểm thử giữ chỗ");
        body.put("condition", "Tốt 95%");
        body.put("priceVnd", priceVnd);
        body.put("categoryId", "DO_GIA_DUNG");
        body.put("locationCode", "KTX_KHU_A");
        body.put("locationText", "Sảnh tòa A1");
        body.put("images", List.of("https://cdn.example.edu.vn/ord/listing-" + UUID.randomUUID() + ".jpg"));
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

    @Test
    void uc22AndUc23FullComboReservationLifecycleAndCrossListingBlocking() {
        MemberAccount seller = createActiveMember("Seller");
        MemberAccount buyer1 = createActiveMember("BuyerOne");
        MemberAccount buyer2 = createActiveMember("BuyerTwo");
        MemberAccount outsider = createActiveMember("Outsider");

        UUID item1 = createItem(seller.token(), "Bàn học gấp");
        UUID item2 = createItem(seller.token(), "Đèn bàn LED");
        UUID comboListing = publishListing(seller.token(), "Combo bàn + đèn", 150000, List.of(item1, item2));
        UUID overlappingSingle = publishListing(seller.token(), "Bàn học bán lẻ", 90000, List.of(item1));

        Instant proposedTime = Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);

        // UC-22: Buyer 1 sends reservation request on combo -> YEU_CAU, listing & items NOT locked yet
        Response req1Resp = given()
                .auth().oauth2(buyer1.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "listingId", comboListing.toString(),
                        "agreedPriceVnd", 140000,
                        "proposedMeetingTime", proposedTime.toString(),
                        "proposedMeetingLocation", "Cổng KTX Khu A",
                        "note", "Mình qua lấy buổi tối"
                ))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .body("status", equalTo("YEU_CAU"))
                .body("agreedPriceVnd", equalTo(140000))
                .body("listing.isCombo", equalTo(true))
                .body("items", hasSize(2))
                .body("scheduleConfirmed", equalTo(false))
                .body("viewer.isBuyer", equalTo(true))
                .body("viewer.canCancel", equalTo(true))
                .body("viewer.canAccept", equalTo(false))
                .extract().response();
        UUID order1Id = UUID.fromString(req1Resp.jsonPath().getString("id"));

        // Verify NFR-01 Zero-PII in response JSON
        String rawBody = req1Resp.asString();
        assertThat(rawBody).doesNotContain(seller.email());
        assertThat(rawBody).doesNotContain(buyer1.email());

        // Verify listing and items are STILL available until seller accepts (FR-07, UC-22)
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, comboListing))
                .isEqualTo("CONG_KHAI");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, item1))
                .isEqualTo("KHA_DUNG");

        // Duplicate pending request by same buyer on same listing -> 409 DUPLICATE_PENDING_REQUEST
        given()
                .auth().oauth2(buyer1.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", comboListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(409)
                .body("code", equalTo("DUPLICATE_PENDING_REQUEST"));

        // Buyer 1 CAN request another listing without buyer quota limit (FR-08)
        UUID order1OnSingle = UUID.fromString(given()
                .auth().oauth2(buyer1.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", overlappingSingle.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        assertThat(order1OnSingle).isNotNull();

        // Buyer 2 can also request the overlapping single listing while nothing is accepted yet
        UUID order2Id = UUID.fromString(given()
                .auth().oauth2(buyer2.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", overlappingSingle.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));

        // Seller received notification for reservation request
        given()
                .auth().oauth2(seller.token())
                .get("/api/v1/notifications?unreadOnly=true")
                .then()
                .statusCode(200)
                .body("items[0].type", equalTo("RESERVATION_REQUESTED"));

        // NFR-01: Outsider cannot view or act on order1
        given()
                .auth().oauth2(outsider.token())
                .get("/api/v1/orders/" + order1Id)
                .then()
                .statusCode(403);

        // UC-23 E1: Buyer cannot accept own order
        given()
                .auth().oauth2(buyer1.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + order1Id + "/accept")
                .then()
                .statusCode(403);

        // UC-23: Seller accepts combo order1 -> locks listing & BOTH combo items atomically
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("expectedVersion", 0))
                .post("/api/v1/orders/" + order1Id + "/accept")
                .then()
                .statusCode(200)
                .body("status", equalTo("GIU_CHO"))
                .body("reservedAt", notNullValue())
                .body("scheduleConfirmed", equalTo(false))
                .body("pendingScheduleProposal", notNullValue())
                .body("pendingScheduleProposal.status", equalTo("CHO_XAC_NHAN"))
                .body("pendingScheduleProposal.canConfirm", equalTo(true));

        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, comboListing))
                .isEqualTo("GIU_CHO");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, item1))
                .isEqualTo("DANG_GIU");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, item2))
                .isEqualTo("DANG_GIU");

        // UC-23 E4: Idempotent replay of accept returns 200 with existing GIU_CHO state
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("expectedVersion", 0))
                .post("/api/v1/orders/" + order1Id + "/accept")
                .then()
                .statusCode(200)
                .body("status", equalTo("GIU_CHO"));

        // UC-23 E2: Seller CANNOT accept overlapping single listing (item1 already DANG_GIU!)
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + order2Id + "/accept")
                .then()
                .statusCode(409)
                .body("code", equalTo("ITEM_ALREADY_RESERVED"));

        // UC-22 Exception: New buyer CANNOT request overlapping single listing while item1 is DANG_GIU
        given()
                .auth().oauth2(outsider.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", overlappingSingle.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(409)
                .body("code", equalTo("ITEM_NOT_AVAILABLE"));
    }

    @Test
    void uc22ValidationExceptionsAndFreeGiveawayAndRejectFlow() {
        MemberAccount seller = createActiveMember("SellerFree");
        MemberAccount buyer = createActiveMember("BuyerFree");
        MemberAccount pendingBuyer = createMember("PendingBuyer", false, "CHO_KICH_HOAT", 100);
        MemberAccount lockedBuyer = createMember("LockedBuyer", true, "BI_KHOA", 40);

        UUID item = createItem(seller.token(), "Giáo trình cũ tặng miễn phí");
        UUID freeListing = publishListing(seller.token(), "Tặng giáo trình Giải tích", 0, List.of(item));

        // Self reservation -> 400
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", freeListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(400)
                .body("code", equalTo("SELF_RESERVATION_NOT_ALLOWED"));

        // Pending buyer -> 403
        given()
                .auth().oauth2(pendingBuyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", freeListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(403);

        // Locked buyer -> 403 ACCOUNT_RESTRICTED
        given()
                .auth().oauth2(lockedBuyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", freeListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"));

        // Free 0đ listing rejects non-zero agreedPriceVnd
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", freeListing.toString(), "agreedPriceVnd", 10000))
                .post("/api/v1/orders")
                .then()
                .statusCode(400);

        // UC-23 A1: Buyer requests free item -> Seller rejects -> listing stays CONG_KHAI, item stays KHA_DUNG
        UUID rejectedOrderId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", freeListing.toString(), "agreedPriceVnd", 0))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .body("agreedPriceVnd", equalTo(0))
                .extract().jsonPath().getString("id"));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Ưu tiên bạn ở gần KTX hơn"))
                .post("/api/v1/orders/" + rejectedOrderId + "/reject")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"));

        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, freeListing))
                .isEqualTo("CONG_KHAI");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, item))
                .isEqualTo("KHA_DUNG");

        // UC-23 A2: Buyer can re-request after rejection; seller accepts 0đ giveaway -> locks item
        UUID acceptedOrderId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", freeListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + acceptedOrderId + "/accept")
                .then()
                .statusCode(200)
                .body("status", equalTo("GIU_CHO"))
                .body("agreedPriceVnd", equalTo(0));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, item))
                .isEqualTo("DANG_GIU");
    }

    @Test
    void uc25ScheduleNegotiationAndUc26StartDeliveryAndUc24CancellationBoundaries() {
        MemberAccount seller = createActiveMember("SellerFlow");
        MemberAccount buyer = createActiveMember("BuyerFlow");
        MemberAccount outsider = createActiveMember("OutsiderFlow");

        UUID item = createItem(seller.token(), "Quạt bàn mini");
        UUID listing = publishListing(seller.token(), "Quạt bàn KTX còn mới", 80000, List.of(item));

        UUID orderId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept")
                .then()
                .statusCode(200);

        // UC-26 E2: Cannot start delivery before schedule is mutually confirmed!
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/start-delivery")
                .then()
                .statusCode(409)
                .body("code", equalTo("SCHEDULE_NOT_CONFIRMED"));

        // UC-25: Buyer proposes time 1 -> one-sided proposal does NOT confirm schedule
        Instant time1 = Instant.now().plus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        UUID proposal1Id = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "proposedTime", time1.toString(),
                        "proposedLocation", "Sảnh B2 KTX Khu B",
                        "note", "18h mình đi học về"
                ))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(201)
                .body("scheduleConfirmed", equalTo(false))
                .body("pendingScheduleProposal.canConfirm", equalTo(false))
                .extract().jsonPath().getString("pendingScheduleProposal.id"));

        // UC-25 A1: Buyer CANNOT self-confirm their own proposal!
        given()
                .auth().oauth2(buyer.token())
                .post("/api/v1/orders/" + orderId + "/schedules/" + proposal1Id + "/confirm")
                .then()
                .statusCode(403)
                .body("code", equalTo("CANNOT_CONFIRM_OWN_PROPOSAL"));

        // UC-25 A1: Seller counter-proposes time 2 -> supersedes proposal1
        Instant time2 = Instant.now().plus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        UUID proposal2Id = UUID.fromString(given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "proposedTime", time2.toString(),
                        "proposedLocation", "Nhà Văn hóa Sinh viên ĐHQG"
                ))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(201)
                .body("scheduleConfirmed", equalTo(false))
                .extract().jsonPath().getString("pendingScheduleProposal.id"));

        // UC-25 E3: Confirming superseded proposal1 fails with 409 PROPOSAL_STALE
        given()
                .auth().oauth2(seller.token())
                .post("/api/v1/orders/" + orderId + "/schedules/" + proposal1Id + "/confirm")
                .then()
                .statusCode(409)
                .body("code", equalTo("PROPOSAL_STALE"));

        // UC-25: Buyer confirms proposal2 -> scheduleConfirmed = true
        given()
                .auth().oauth2(buyer.token())
                .post("/api/v1/orders/" + orderId + "/schedules/" + proposal2Id + "/confirm")
                .then()
                .statusCode(200)
                .body("scheduleConfirmed", equalTo(true))
                .body("meetingLocation", equalTo("Nhà Văn hóa Sinh viên ĐHQG"))
                .body("pendingScheduleProposal", nullValue());

        // UC-26 E1: Buyer or outsider CANNOT start delivery
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/start-delivery")
                .then()
                .statusCode(403);

        // UC-26 Main Flow: Seller starts delivery -> DANG_GIAO, deliveryStartedAt set, NO anh_ban_giao / NO OTP / NO reportedDeliveredAt!
        Response startResp = given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/start-delivery")
                .then()
                .statusCode(200)
                .body("status", equalTo("DANG_GIAO"))
                .body("deliveryStartedAt", notNullValue())
                .body("reportedDeliveredAt", nullValue())
                .extract().response();
        String firstDeliveryStartedAt = startResp.jsonPath().getString("deliveryStartedAt");

        Integer otpCount = db.queryForObject(
                "SELECT COUNT(*) FROM ma_xac_nhan_otp WHERE ma_giao_dich = ?",
                Integer.class,
                orderId
        );
        assertThat(otpCount).isZero();
        String handoverPhoto = db.queryForObject(
                "SELECT anh_ban_giao FROM giao_dichs WHERE ma_giao_dich = ?",
                String.class,
                orderId
        );
        assertThat(handoverPhoto).isNull();

        // UC-26 A2: Idempotent replay keeps original deliveryStartedAt and does not create duplicate notification
        int notifCountBefore = db.queryForObject(
                "SELECT COUNT(*) FROM thong_baos WHERE ma_giao_dich = ? AND loai = 'DELIVERY_STARTED'",
                Integer.class,
                orderId
        );
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/start-delivery")
                .then()
                .statusCode(200)
                .body("status", equalTo("DANG_GIAO"))
                .body("deliveryStartedAt", equalTo(firstDeliveryStartedAt));
        int notifCountAfter = db.queryForObject(
                "SELECT COUNT(*) FROM thong_baos WHERE ma_giao_dich = ? AND loai = 'DELIVERY_STARTED'",
                Integer.class,
                orderId
        );
        assertThat(notifCountAfter).isEqualTo(notifCountBefore);

        // UC-25 A3 / UC-26 A3: Rescheduling while DANG_GIAO keeps old confirmed location until both agree
        Instant time3 = Instant.now().plus(4, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "proposedTime", time3.toString(),
                        "proposedLocation", "Cổng UIT"
                ))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(201)
                .body("meetingLocation", equalTo("Nhà Văn hóa Sinh viên ĐHQG"))
                .body("pendingScheduleProposal.proposedLocation", equalTo("Cổng UIT"));

        // UC-24 E1: Outsider cannot cancel
        given()
                .auth().oauth2(outsider.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Spam"))
                .post("/api/v1/orders/" + orderId + "/cancel")
                .then()
                .statusCode(403);

        // UC-24 A3: Buyer CAN still cancel while DANG_GIAO (before UC-27 report delivered!) -> restores item & listing!
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Có việc đột xuất không ra gặp được"))
                .post("/api/v1/orders/" + orderId + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"))
                .body("cancelledAt", notNullValue());

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, item))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listing))
                .isEqualTo("CONG_KHAI");

        // UC-24 E2: Cancelling already HUY order returns 200 idempotently
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"));
    }

    @Test
    void uc24BlocksPostDeliveryCancellationAndPreservesSoldItems() {
        MemberAccount seller = createActiveMember("SellerPostDel");
        MemberAccount buyer = createActiveMember("BuyerPostDel");

        UUID item = createItem(seller.token(), "Bình đun siêu tốc");
        UUID listing = publishListing(seller.token(), "Bình đun nước KTX", 70000, List.of(item));

        UUID orderId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept")
                .then()
                .statusCode(200);

        // Simulate UC-27 (P3-02) seller reported delivered with handover photo -> CHO_XAC_NHAN
        db.update(
                "UPDATE giao_dichs SET trang_thai = 'CHO_XAC_NHAN', anh_ban_giao = 'https://cdn.example.edu.vn/handover.jpg', thoi_diem_bao_giao = ? WHERE ma_giao_dich = ?",
                Timestamp.from(Instant.now()),
                orderId
        );

        // UC-24 A2 / E4: Must block pre-delivery cancel and direct to UC-28
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Muốn hủy sau khi đã báo giao"))
                .post("/api/v1/orders/" + orderId + "/cancel")
                .then()
                .statusCode(409)
                .body("code", equalTo("POST_DELIVERY_CANCELLATION_REQUIRED"));

        // Viewer flags reflect post-delivery state accurately
        given()
                .auth().oauth2(buyer.token())
                .get("/api/v1/orders/" + orderId)
                .then()
                .statusCode(200)
                .body("viewer.canCancel", equalTo(false))
                .body("viewer.requiresPostDeliveryCancel", equalTo(true));

        // Item remains locked
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, item))
                .isEqualTo("DANG_GIU");
    }

    @Test
    void p201ListingUpdateWithPendingRequestsNotifiesWaitingBuyers() {
        MemberAccount seller = createActiveMember("SellerNotify");
        MemberAccount buyer = createActiveMember("BuyerNotify");

        UUID item = createItem(seller.token(), "Balo laptop 15.6 inch");
        UUID listingId = publishListing(seller.token(), "Balo laptop chống sốc", 110000, List.of(item));

        UUID orderId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingId.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));

        // Seller updates listing (UC-17) while buyer has pending YEU_CAU -> fires ListingUpdatedWithPendingRequestsEvent
        Map<String, Object> updateBody = new LinkedHashMap<>();
        updateBody.put("action", "KEEP");
        updateBody.put("version", 0);
        updateBody.put("title", "Balo laptop chống sốc (đã cập nhật ảnh)");
        updateBody.put("description", "Cập nhật thêm mô tả chi tiết khóa kéo");
        updateBody.put("condition", "Tốt 95%");
        updateBody.put("priceVnd", 105000);
        updateBody.put("categoryId", "DO_GIA_DUNG");
        updateBody.put("locationCode", "KTX_KHU_A");
        updateBody.put("locationText", "Sảnh tòa A1");
        updateBody.put("images", List.of("https://cdn.example.edu.vn/ord/updated.jpg"));
        updateBody.put("itemIds", List.of(item.toString()));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(updateBody)
                .put("/api/v1/listings/" + listingId)
                .then()
                .statusCode(200);

        // Buyer receives LISTING_UPDATED_WITH_PENDING_REQUEST notification
        Response notifResp = given()
                .auth().oauth2(buyer.token())
                .get("/api/v1/notifications?unreadOnly=true")
                .then()
                .statusCode(200)
                .body("unreadCount", equalTo(1))
                .body("items[0].type", equalTo("LISTING_UPDATED_WITH_PENDING_REQUEST"))
                .body("items[0].orderId", equalTo(orderId.toString()))
                .extract().response();

        // UC-17 edit bumps pending YEU_CAU order version so stale expectedVersion=0 is rejected with 409 VERSION_CONFLICT
        given()
                .auth().oauth2(seller.token())
                .get("/api/v1/orders/" + orderId)
                .then()
                .statusCode(200)
                .body("version", equalTo(1));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("expectedVersion", 0))
                .post("/api/v1/orders/" + orderId + "/accept")
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        String notifId = notifResp.jsonPath().getString("items[0].id");
        given()
                .auth().oauth2(buyer.token())
                .post("/api/v1/notifications/" + notifId + "/read")
                .then()
                .statusCode(200)
                .body("read", equalTo(true));
    }

    @Test
    void uc22EdgeCasesExpiredWithdrawnHiddenListingsFreeComboValidationAndInactiveSeller() {
        MemberAccount seller = createActiveMember("SellerUc22Edge");
        MemberAccount buyer = createActiveMember("BuyerUc22Edge");

        // Missing listingId -> 400; unknown listingId -> 404
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", UUID.randomUUID().toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(404)
                .body("code", equalTo("LISTING_NOT_FOUND"));

        // Expired CONG_KHAI listing (FR-13 expires_at <= now) -> 409 LISTING_NOT_AVAILABLE
        UUID expItem = createItem(seller.token(), "Ghế gấp sắp hết hạn");
        UUID expiredListing = publishListing(seller.token(), "Ghế gấp hết hạn", 50000, List.of(expItem));
        db.update(
                "UPDATE tin_dangs SET expires_at = ? WHERE ma_tin = ?",
                Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)),
                expiredListing
        );
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", expiredListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_NOT_AVAILABLE"));

        // Withdrawn (DA_RUT) and Hidden (AN) listings -> 409 LISTING_NOT_AVAILABLE
        UUID withdrawnItem = createItem(seller.token(), "Đèn kẹp bàn rút");
        UUID withdrawnListing = publishListing(seller.token(), "Đèn kẹp bàn", 60000, List.of(withdrawnItem));
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/" + withdrawnListing + "/withdraw")
                .then()
                .statusCode(200);
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", withdrawnListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_NOT_AVAILABLE"));

        UUID hiddenItem = createItem(seller.token(), "Bàn phím bị ẩn");
        UUID hiddenListing = publishListing(seller.token(), "Bàn phím ẩn", 120000, List.of(hiddenItem));
        db.update("UPDATE tin_dangs SET trang_thai = 'AN' WHERE ma_tin = ?", hiddenListing);
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", hiddenListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_NOT_AVAILABLE"));

        // Paid listing (priceVnd > 0) MUST reject agreedPriceVnd == 0 with 400 INVALID_INPUT
        UUID paidItem = createItem(seller.token(), "Bàn học gỗ trả phí");
        UUID paidListing = publishListing(seller.token(), "Bàn học gỗ KTX", 120000, List.of(paidItem));
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", paidListing.toString(), "agreedPriceVnd", 0))
                .post("/api/v1/orders")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"))
                .body("message", equalTo("Tin đăng có phí không thể đặt giá thỏa thuận bằng 0đ."));

        // Free combo (BAN_COMBO with gia_vnd = 0) + input validations
        UUID freeComboItem1 = createItem(seller.token(), "Sách Giải tích 1");
        UUID freeComboItem2 = createItem(seller.token(), "Sách Đại số tuyến tính");
        UUID freeComboListing = publishListing(seller.token(), "Tặng combo sách năm nhất", 0, List.of(freeComboItem1, freeComboItem2));

        // > 0 price on free combo -> 400
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", freeComboListing.toString(), "agreedPriceVnd", 5000))
                .post("/api/v1/orders")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Negative price -> 400
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", freeComboListing.toString(), "agreedPriceVnd", -100))
                .post("/api/v1/orders")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Past proposedMeetingTime -> 400 INVALID_MEETING_TIME
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "listingId", freeComboListing.toString(),
                        "proposedMeetingTime", Instant.now().minus(1, ChronoUnit.HOURS).toString()
                ))
                .post("/api/v1/orders")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_MEETING_TIME"));

        // Over-length location (>255) & note (>1000) -> 400
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "listingId", freeComboListing.toString(),
                        "proposedMeetingLocation", "A".repeat(256)
                ))
                .post("/api/v1/orders")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "listingId", freeComboListing.toString(),
                        "note", "N".repeat(1001)
                ))
                .post("/api/v1/orders")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Free combo with null agreedPriceVnd & whitespace-only location/note -> 201 (defaults to 0đ, blanks trimmed to null)
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "listingId", freeComboListing.toString(),
                        "proposedMeetingLocation", "    ",
                        "note", "   "
                ))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .body("agreedPriceVnd", equalTo(0))
                .body("listing.isCombo", equalTo(true))
                .body("listing.isFree", equalTo(true))
                .body("items", hasSize(2))
                .body("proposedMeetingLocation", nullValue())
                .body("note", nullValue());

        // Locked / disabled seller -> 409 LISTING_NOT_AVAILABLE; expired 14-day temp lock -> allowed (FR-12)
        MemberAccount sellerLockTest = createActiveMember("SellerLockTest");
        UUID sellerLockItem = createItem(sellerLockTest.token(), "Giá sách gỗ");
        UUID sellerLockListing = publishListing(sellerLockTest.token(), "Giá sách KTX", 75000, List.of(sellerLockItem));

        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', khoa_den_ngay = ? WHERE user_id = ?",
                Timestamp.from(Instant.now().plus(7, ChronoUnit.DAYS)),
                sellerLockTest.id()
        );
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", sellerLockListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_NOT_AVAILABLE"));

        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'VO_HIEU_HOA', loai_han_che = NULL, khoa_den_ngay = NULL WHERE user_id = ?",
                sellerLockTest.id()
        );
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", sellerLockListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_NOT_AVAILABLE"));

        // FR-12: Expired temporary lock on seller no longer blocks requests
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', khoa_den_ngay = ? WHERE user_id = ?",
                Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)),
                sellerLockTest.id()
        );
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", sellerLockListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201);
    }

    @Test
    void uc23EdgeCasesVersionConflictBuyerLockedSellerLockedExpiredListingPastDraftAndUc17Sync() {
        MemberAccount seller = createActiveMember("SellerUc23Edge");
        MemberAccount buyer = createActiveMember("BuyerUc23Edge");

        UUID itemA = createItem(seller.token(), "Ấm siêu tốc");
        UUID itemB = createItem(seller.token(), "Ly giữ nhiệt");
        UUID listingId = publishListing(seller.token(), "Ấm siêu tốc KTX", 90000, List.of(itemA));

        Instant draftTime = Instant.now().plus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        UUID orderId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "listingId", listingId.toString(),
                        "proposedMeetingTime", draftTime.toString(),
                        "proposedMeetingLocation", "Sảnh A1"
                ))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));

        // expectedVersion mismatch on YEU_CAU -> 409 VERSION_CONFLICT
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("expectedVersion", 99))
                .post("/api/v1/orders/" + orderId + "/accept")
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // Buyer becomes BI_KHOA between UC-22 and UC-23 -> 409 BUYER_ACCOUNT_UNAVAILABLE (not 403 ACCOUNT_RESTRICTED!)
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', khoa_den_ngay = ? WHERE user_id = ?",
                Timestamp.from(Instant.now().plus(5, ChronoUnit.DAYS)),
                buyer.id()
        );
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept")
                .then()
                .statusCode(409)
                .body("code", equalTo("BUYER_ACCOUNT_UNAVAILABLE"));
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listingId))
                .isEqualTo("CONG_KHAI");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, itemA))
                .isEqualTo("KHA_DUNG");

        // Buyer becomes VO_HIEU_HOA -> 409 BUYER_ACCOUNT_UNAVAILABLE
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'VO_HIEU_HOA' WHERE user_id = ?", buyer.id());
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept")
                .then()
                .statusCode(409)
                .body("code", equalTo("BUYER_ACCOUNT_UNAVAILABLE"));

        // Restore buyer via expired 14-day temp lock (FR-12) so accept should treat buyer as available
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', khoa_den_ngay = ? WHERE user_id = ?",
                Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)),
                buyer.id()
        );

        // Seller becomes BI_KHOA -> 403 ACCOUNT_RESTRICTED
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', khoa_den_ngay = ? WHERE user_id = ?",
                Timestamp.from(Instant.now().plus(5, ChronoUnit.DAYS)),
                seller.id()
        );
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept")
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"));

        // Restore seller active
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'HOAT_DONG', loai_han_che = NULL, khoa_den_ngay = NULL WHERE user_id = ?",
                seller.id()
        );

        // Listing expires before accept -> 409 LISTING_NOT_AVAILABLE
        Timestamp futureExpiry = Timestamp.from(Instant.now().plus(20, ChronoUnit.DAYS));
        db.update(
                "UPDATE tin_dangs SET expires_at = ? WHERE ma_tin = ?",
                Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)),
                listingId
        );
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept")
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_NOT_AVAILABLE"));
        db.update("UPDATE tin_dangs SET expires_at = ? WHERE ma_tin = ?", futureExpiry, listingId);

        // UC-17 edit expands listing items [itemA] -> [itemA, itemB] while YEU_CAU is pending
        Map<String, Object> updateBody = new LinkedHashMap<>();
        updateBody.put("action", "KEEP");
        updateBody.put("version", 0);
        updateBody.put("title", "Combo ấm siêu tốc + ly giữ nhiệt");
        updateBody.put("description", "Cập nhật thêm ly giữ nhiệt thành combo");
        updateBody.put("condition", "Tốt 95%");
        updateBody.put("priceVnd", 110000);
        updateBody.put("categoryId", "DO_GIA_DUNG");
        updateBody.put("locationCode", "KTX_KHU_A");
        updateBody.put("locationText", "Sảnh A1");
        updateBody.put("images", List.of("https://cdn.example.edu.vn/ord/combo-updated.jpg"));
        updateBody.put("itemIds", List.of(itemA.toString(), itemB.toString()));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(updateBody)
                .put("/api/v1/listings/" + listingId)
                .then()
                .statusCode(200);

        // Pending order detail immediately reflects BOTH updated items and bumped version before accept
        given()
                .auth().oauth2(seller.token())
                .get("/api/v1/orders/" + orderId)
                .then()
                .statusCode(200)
                .body("items", hasSize(2))
                .body("listing.isCombo", equalTo(true))
                .body("version", equalTo(1));

        // Stale expectedVersion=0 after UC-17 listing update MUST fail with 409 VERSION_CONFLICT
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("expectedVersion", 0))
                .post("/api/v1/orders/" + orderId + "/accept")
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // Backdate buyer's draft proposedMeetingTime into the past -> accept must NOT seed a past pending proposal
        db.update(
                "UPDATE giao_dichs SET thoi_gian_hen_du_kien = ? WHERE ma_giao_dich = ?",
                Timestamp.from(Instant.now().minus(2, ChronoUnit.HOURS)),
                orderId
        );

        // Accept succeeds with refreshed expectedVersion=1 (buyer's expired temp lock allowed per FR-12),
        // locks BOTH items, skips expired draft schedule, AND ignores any unilateral price override attempt (keeps 90000)
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("expectedVersion", 1, "agreedPriceVnd", 999000))
                .post("/api/v1/orders/" + orderId + "/accept")
                .then()
                .statusCode(200)
                .body("status", equalTo("GIU_CHO"))
                .body("agreedPriceVnd", equalTo(90000))
                .body("items", hasSize(2))
                .body("pendingScheduleProposal", nullValue());

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, itemA))
                .isEqualTo("DANG_GIU");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, itemB))
                .isEqualTo("DANG_GIU");
        Integer seededProposals = db.queryForObject(
                "SELECT COUNT(*) FROM lich_hen_giao_dichs WHERE ma_giao_dich = ?",
                Integer.class,
                orderId
        );
        assertThat(seededProposals).isZero();
    }

    @Test
    void uc24EdgeCasesE3SoldAndOtherHoldExpiredAndHiddenListingsWithdrawAndUc09DeleteRegression() {
        MemberAccount seller = createActiveMember("SellerUc24Edge");
        MemberAccount buyer = createActiveMember("BuyerUc24Edge");

        // 1. Buyer withdraws pending YEU_CAU cleanly -> HUY, seller notified, listing stays CONG_KHAI
        UUID itemWithdraw = createItem(seller.token(), "Gối tựa lưng");
        UUID listingWithdraw = publishListing(seller.token(), "Gối tựa lưng KTX", 40000, List.of(itemWithdraw));
        UUID pendingOrder = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingWithdraw.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Đổi ý không mua nữa"))
                .post("/api/v1/orders/" + pendingOrder + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"));
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listingWithdraw))
                .isEqualTo("CONG_KHAI");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, itemWithdraw))
                .isEqualTo("KHA_DUNG");

        // UC-09 regression (V13 ON DELETE SET NULL): after withdraw listing, seller CAN delete item (204)
        // AND cancelled order STILL preserves historical item snapshot & itemCount == 1
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/" + listingWithdraw + "/withdraw")
                .then()
                .statusCode(200);
        given()
                .auth().oauth2(seller.token())
                .delete("/api/v1/inventory/" + itemWithdraw)
                .then()
                .statusCode(204);
        given()
                .auth().oauth2(buyer.token())
                .get("/api/v1/orders/" + pendingOrder)
                .then()
                .statusCode(200)
                .body("items", hasSize(1))
                .body("items[0].id", notNullValue())
                .body("items[0].name", equalTo("Gối tựa lưng"))
                .body("items[0].condition", equalTo("Mới 95%"))
                .body("items[0].status", equalTo("DA_XOA"))
                .body("items[0].heldByThisOrder", equalTo(false));

        // 2. UC-09 regression after GIU_CHO -> cancel -> withdraw listing -> DELETE inventory returns 204
        //    AND GET /orders/{id} + GET /orders still preserve historical item snapshot & itemCount == 1
        UUID itemAfterCancel = createItem(seller.token(), "Kệ dép nhựa");
        UUID listingAfterCancel = publishListing(seller.token(), "Kệ dép 3 tầng", 35000, List.of(itemAfterCancel));
        UUID orderAfterCancel = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingAfterCancel.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderAfterCancel + "/accept").then().statusCode(200);
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON).body(Map.of("reason", "Hủy giữ chỗ"))
                .post("/api/v1/orders/" + orderAfterCancel + "/cancel").then().statusCode(200);
        long listingVer = db.queryForObject("SELECT version FROM tin_dangs WHERE ma_tin = ?", Long.class, listingAfterCancel);
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of("version", listingVer))
                .post("/api/v1/listings/" + listingAfterCancel + "/withdraw").then().statusCode(200);
        given().auth().oauth2(seller.token()).delete("/api/v1/inventory/" + itemAfterCancel).then().statusCode(204);

        given()
                .auth().oauth2(buyer.token())
                .get("/api/v1/orders/" + orderAfterCancel)
                .then()
                .statusCode(200)
                .body("items", hasSize(1))
                .body("items[0].id", notNullValue())
                .body("items[0].name", equalTo("Kệ dép nhựa"))
                .body("items[0].condition", equalTo("Mới 95%"))
                .body("items[0].status", equalTo("DA_XOA"))
                .body("items[0].heldByThisOrder", equalTo(false));
        given()
                .auth().oauth2(buyer.token())
                .get("/api/v1/orders?listingId=" + listingAfterCancel)
                .then()
                .statusCode(200)
                .body("totalElements", equalTo(1))
                .body("items[0].itemCount", equalTo(1));

        // 3. HOAN_TAT -> 409 ORDER_ALREADY_COMPLETED; CHO_XU_LY & DANG_GIAO+reportedDeliveredAt -> 409 POST_DELIVERY_CANCELLATION_REQUIRED
        UUID itemTerm = createItem(seller.token(), "Bình giữ nhiệt");
        UUID listingTerm = publishListing(seller.token(), "Bình giữ nhiệt inox", 65000, List.of(itemTerm));
        UUID orderTerm = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingTerm.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderTerm + "/accept").then().statusCode(200);

        db.update("UPDATE giao_dichs SET trang_thai = 'CHO_XU_LY' WHERE ma_giao_dich = ?", orderTerm);
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderTerm + "/cancel")
                .then()
                .statusCode(409)
                .body("code", equalTo("POST_DELIVERY_CANCELLATION_REQUIRED"));

        db.update(
                "UPDATE giao_dichs SET trang_thai = 'DANG_GIAO', thoi_diem_bao_giao = ? WHERE ma_giao_dich = ?",
                Timestamp.from(Instant.now()),
                orderTerm
        );
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderTerm + "/cancel")
                .then()
                .statusCode(409)
                .body("code", equalTo("POST_DELIVERY_CANCELLATION_REQUIRED"));

        db.update("UPDATE giao_dichs SET trang_thai = 'HOAN_TAT' WHERE ma_giao_dich = ?", orderTerm);
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderTerm + "/cancel")
                .then()
                .statusCode(409)
                .body("code", equalTo("ORDER_ALREADY_COMPLETED"));

        // 4. UC-24 on expired GIU_CHO listing -> item becomes KHA_DUNG, listing becomes HET_HAN (FR-13)
        UUID itemExp = createItem(seller.token(), "Bàn xếp nhỏ");
        UUID listingExp = publishListing(seller.token(), "Bàn xếp học bài", 55000, List.of(itemExp));
        UUID orderExp = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingExp.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderExp + "/accept").then().statusCode(200);
        db.update(
                "UPDATE tin_dangs SET expires_at = ? WHERE ma_tin = ?",
                Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)),
                listingExp
        );
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderExp + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"));
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, itemExp))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listingExp))
                .isEqualTo("HET_HAN");
        assertThat(db.queryForObject("SELECT closed_at FROM tin_dangs WHERE ma_tin = ?", Timestamp.class, listingExp))
                .isNotNull();

        // 5. UC-24 E3: Listing already AN (hidden) or KET_THUC MUST NOT revert to CONG_KHAI
        UUID itemHidden = createItem(seller.token(), "Ổ cắm điện");
        UUID listingHidden = publishListing(seller.token(), "Ổ cắm 6 lỗ", 45000, List.of(itemHidden));
        UUID orderHidden = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingHidden.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderHidden + "/accept").then().statusCode(200);
        db.update("UPDATE tin_dangs SET trang_thai = 'AN' WHERE ma_tin = ?", listingHidden);
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderHidden + "/cancel").then().statusCode(200);
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listingHidden))
                .isEqualTo("AN");

        // 6. UC-24 E3: Combo cancel preserves DA_CHUYEN_GIAO item & releases sibling; listing transitions GIU_CHO -> DA_RUT (no zombie GIU_CHO!)
        UUID soldItem = createItem(seller.token(), "Sách đã chuyển giao");
        UUID siblingItem = createItem(seller.token(), "Sách đi kèm combo");
        UUID comboSoldListing = publishListing(seller.token(), "Combo 2 cuốn sách", 80000, List.of(soldItem, siblingItem));
        UUID comboSoldOrder = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", comboSoldListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + comboSoldOrder + "/accept").then().statusCode(200);
        // Simulate soldItem already marked DA_CHUYEN_GIAO
        db.update("UPDATE do_vats SET trang_thai = 'DA_CHUYEN_GIAO' WHERE ma_vat = ?", soldItem);

        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of("reason", "Hủy kiểm tra E3"))
                .post("/api/v1/orders/" + comboSoldOrder + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, soldItem))
                .isEqualTo("DA_CHUYEN_GIAO");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, siblingItem))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, comboSoldListing))
                .isEqualTo("DA_RUT");

        // 7. UC-24 E3: Combo cancel preserves item held by another valid active order -> listing transitions to DA_RUT (not zombie GIU_CHO)
        UUID otherHeldItem = createItem(seller.token(), "Đồ đang giữ ở đơn khác");
        UUID freeSibling = createItem(seller.token(), "Đồ kèm không bị giữ khác");
        UUID otherListing = publishListing(seller.token(), "Tin đơn hợp lệ khác", 50000, List.of(otherHeldItem));
        UUID comboOtherListing = publishListing(seller.token(), "Combo trùng đồ đơn khác", 90000, List.of(otherHeldItem, freeSibling));

        UUID comboOtherOrder = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", comboOtherListing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + comboOtherOrder + "/accept").then().statusCode(200);

        // Simulate transfer of hold on otherHeldItem to another valid GIU_CHO order (tests E3 guard independently)
        UUID otherOrderId = UUID.randomUUID();
        Timestamp nowTs = Timestamp.from(Instant.now());
        db.update(
                "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, lich_hen_da_xac_nhan, trang_thai, thoi_diem_tao, thoi_diem_giu_cho, updated_at, version) VALUES (?, ?, ?, ?, 50000, FALSE, 'GIU_CHO', ?, ?, ?, 1)",
                otherOrderId, otherListing, seller.id(), buyer.id(), nowTs, nowTs, nowTs
        );
        db.update("UPDATE giao_dich_do_vat SET giu_hieu_luc = FALSE WHERE ma_giao_dich = ? AND ma_vat = ?", comboOtherOrder, otherHeldItem);
        db.update("INSERT INTO giao_dich_do_vat(ma_giao_dich, ma_vat, giu_hieu_luc) VALUES (?, ?, TRUE)", otherOrderId, otherHeldItem);

        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + comboOtherOrder + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, otherHeldItem))
                .isEqualTo("DANG_GIU");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, freeSibling))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, comboOtherListing))
                .isEqualTo("DA_RUT");
    }

    @Test
    void uc25AndUc26EdgeCasesScheduleValidationRejectRescheduleInDeliveryAndStartDeliveryErrors() {
        MemberAccount seller = createActiveMember("SellerUc25Edge");
        MemberAccount buyer = createActiveMember("BuyerUc25Edge");
        MemberAccount outsider = createActiveMember("OutsiderUc25Edge");

        UUID item = createItem(seller.token(), "Máy tính bỏ túi Casio");
        UUID listing = publishListing(seller.token(), "Casio fx-580VN X", 250000, List.of(item));

        UUID orderId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));

        Instant futureTime1 = Instant.now().plus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);

        // Cannot propose schedule or start delivery while YEU_CAU
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("proposedTime", futureTime1.toString(), "proposedLocation", "Cổng KTX A"))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(409)
                .body("code", equalTo("INVALID_ORDER_STATE"));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/start-delivery")
                .then()
                .statusCode(409)
                .body("code", equalTo("INVALID_ORDER_STATE"));

        // Accept reservation -> GIU_CHO
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept").then().statusCode(200);

        // Validation errors on proposeSchedule -> 400
        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("proposedLocation", "Sảnh B"))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("proposedTime", futureTime1.toString(), "proposedLocation", "   "))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "proposedTime", Instant.now().minus(30, ChronoUnit.MINUTES).toString(),
                        "proposedLocation", "Sảnh B"
                ))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_MEETING_TIME"));

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "proposedTime", futureTime1.toString(),
                        "proposedLocation", "Sảnh B",
                        "note", "X".repeat(501)
                ))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Outsider cannot propose schedule -> 403
        given()
                .auth().oauth2(outsider.token())
                .contentType(ContentType.JSON)
                .body(Map.of("proposedTime", futureTime1.toString(), "proposedLocation", "Sảnh B"))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(403);

        // UC-25 A1: Buyer proposes P1 -> self-reject 403 -> Seller rejects P1 -> reservation stays GIU_CHO, buyer notified
        UUID p1 = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("proposedTime", futureTime1.toString(), "proposedLocation", "Cổng KTX A"))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("pendingScheduleProposal.id"));

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Tự từ chối"))
                .post("/api/v1/orders/" + orderId + "/schedules/" + p1 + "/reject")
                .then()
                .statusCode(403);

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Giờ đó mình bận đi học"))
                .post("/api/v1/orders/" + orderId + "/schedules/" + p1 + "/reject")
                .then()
                .statusCode(200)
                .body("status", equalTo("GIU_CHO"))
                .body("scheduleConfirmed", equalTo(false))
                .body("pendingScheduleProposal", nullValue())
                .body("scheduleProposals[0].status", equalTo("TU_CHOI"))
                .body("scheduleProposals[0].rejectReason", equalTo("Giờ đó mình bận đi học"));

        // Rejecting already rejected P1 again -> 409 PROPOSAL_STALE
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/schedules/" + p1 + "/reject")
                .then()
                .statusCode(409)
                .body("code", equalTo("PROPOSAL_STALE"));

        // Seller proposes P2 -> Buyer confirms -> Start delivery with version conflict 409, then success
        Instant futureTime2 = Instant.now().plus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        UUID p2 = UUID.fromString(given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("proposedTime", futureTime2.toString(), "proposedLocation", "Cổng UIT"))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("pendingScheduleProposal.id"));

        long verAfterConfirm = given()
                .auth().oauth2(buyer.token())
                .post("/api/v1/orders/" + orderId + "/schedules/" + p2 + "/confirm")
                .then()
                .statusCode(200)
                .body("scheduleConfirmed", equalTo(true))
                .extract().jsonPath().getLong("version");

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("expectedVersion", verAfterConfirm + 10))
                .post("/api/v1/orders/" + orderId + "/start-delivery")
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("expectedVersion", verAfterConfirm))
                .post("/api/v1/orders/" + orderId + "/start-delivery")
                .then()
                .statusCode(200)
                .body("status", equalTo("DANG_GIAO"));

        // UC-25 A3 / UC-26 A3: Reschedule during DANG_GIAO -> reject preserves old confirmed schedule; confirm updates schedule without touching delivery proof/OTP
        Instant futureTime3 = Instant.now().plus(4, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        UUID p3 = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("proposedTime", futureTime3.toString(), "proposedLocation", "Thư viện trung tâm"))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(201)
                .body("meetingLocation", equalTo("Cổng UIT"))
                .extract().jsonPath().getString("pendingScheduleProposal.id"));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Hơi xa"))
                .post("/api/v1/orders/" + orderId + "/schedules/" + p3 + "/reject")
                .then()
                .statusCode(200)
                .body("status", equalTo("DANG_GIAO"))
                .body("scheduleConfirmed", equalTo(true))
                .body("meetingLocation", equalTo("Cổng UIT"));

        Instant futureTime4 = Instant.now().plus(5, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        UUID p4 = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("proposedTime", futureTime4.toString(), "proposedLocation", "Sảnh tòa C UIT"))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("pendingScheduleProposal.id"));

        given()
                .auth().oauth2(seller.token())
                .post("/api/v1/orders/" + orderId + "/schedules/" + p4 + "/confirm")
                .then()
                .statusCode(200)
                .body("status", equalTo("DANG_GIAO"))
                .body("scheduleConfirmed", equalTo(true))
                .body("meetingLocation", equalTo("Sảnh tòa C UIT"))
                .body("reportedDeliveredAt", nullValue());
        assertThat(db.queryForObject("SELECT COUNT(*) FROM ma_xac_nhan_otp WHERE ma_giao_dich = ?", Integer.class, orderId))
                .isZero();

        // After cancel (HUY): both proposeSchedule and startDelivery -> 409 INVALID_ORDER_STATE
        given().auth().oauth2(buyer.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderId + "/cancel").then().statusCode(200);

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("proposedTime", futureTime4.toString(), "proposedLocation", "Cổng UIT"))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(409)
                .body("code", equalTo("INVALID_ORDER_STATE"));

        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/start-delivery")
                .then()
                .statusCode(409)
                .body("code", equalTo("INVALID_ORDER_STATE"));
    }

    @Test
    void listOrdersFiltersPaginationZeroPiiNotificationsMarkAllReadAndSecurityEnforcement() {
        MemberAccount userA = createActiveMember("MemberA");
        MemberAccount userB = createActiveMember("MemberB");
        MemberAccount outsider = createActiveMember("OutsiderList");
        MemberAccount lockedMember = createMember("LockedNotif", true, "BI_KHOA", 40);
        MemberAccount pendingMember = createMember("PendingNotif", false, "CHO_KICH_HOAT", 100);

        UUID itemA = createItem(userA.token(), "Bàn làm việc gỗ");
        UUID listingA = publishListing(userA.token(), "Bàn gỗ của A", 180000, List.of(itemA));

        UUID itemB = createItem(userB.token(), "Ghế văn phòng");
        UUID listingB = publishListing(userB.token(), "Ghế của B", 220000, List.of(itemB));

        // userB requests listingA (userA = seller, userB = buyer), then userA accepts -> GIU_CHO
        UUID orderWhereAIsSeller = UUID.fromString(given()
                .auth().oauth2(userB.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingA.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        given().auth().oauth2(userA.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderWhereAIsSeller + "/accept").then().statusCode(200);

        // userA requests listingB (userA = buyer, userB = seller) -> YEU_CAU
        UUID orderWhereAIsBuyer = UUID.fromString(given()
                .auth().oauth2(userA.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingB.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));

        // Role filters + pagination + status + listingId
        Response listAllResp = given()
                .auth().oauth2(userA.token())
                .get("/api/v1/orders?role=ALL")
                .then()
                .statusCode(200)
                .body("totalElements", equalTo(2))
                .body("items", hasSize(2))
                .extract().response();

        // Zero-PII across list, detail, and notifications (no email or studentId/MSSV)
        String listRaw = listAllResp.asString();
        assertThat(listRaw).doesNotContain(userA.email(), userB.email(), userA.studentId(), userB.studentId());

        String detailRaw = given()
                .auth().oauth2(userA.token())
                .get("/api/v1/orders/" + orderWhereAIsSeller)
                .then()
                .statusCode(200)
                .extract().asString();
        assertThat(detailRaw).doesNotContain(userA.email(), userB.email(), userA.studentId(), userB.studentId());

        given()
                .auth().oauth2(userA.token())
                .get("/api/v1/orders?role=SELLER")
                .then()
                .statusCode(200)
                .body("totalElements", equalTo(1))
                .body("items[0].id", equalTo(orderWhereAIsSeller.toString()));

        given()
                .auth().oauth2(userA.token())
                .get("/api/v1/orders?role=BUYER")
                .then()
                .statusCode(200)
                .body("totalElements", equalTo(1))
                .body("items[0].id", equalTo(orderWhereAIsBuyer.toString()));

        given()
                .auth().oauth2(userA.token())
                .get("/api/v1/orders?role=ALL&status=GIU_CHO")
                .then()
                .statusCode(200)
                .body("totalElements", equalTo(1))
                .body("items[0].id", equalTo(orderWhereAIsSeller.toString()));

        given()
                .auth().oauth2(userA.token())
                .get("/api/v1/orders?listingId=" + listingB)
                .then()
                .statusCode(200)
                .body("totalElements", equalTo(1))
                .body("items[0].id", equalTo(orderWhereAIsBuyer.toString()));

        given()
                .auth().oauth2(userA.token())
                .get("/api/v1/orders?role=ALL&page=0&size=1")
                .then()
                .statusCode(200)
                .body("items", hasSize(1))
                .body("totalElements", equalTo(2))
                .body("totalPages", equalTo(2));

        // Invalid role & invalid status -> 400
        given().auth().oauth2(userA.token()).get("/api/v1/orders?role=ADMIN")
                .then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().auth().oauth2(userA.token()).get("/api/v1/orders?status=BOGUS")
                .then().statusCode(400).body("code", equalTo("INVALID_INPUT"));

        // Outsider sees 0 orders even when passing listingId (NFR-01)
        given()
                .auth().oauth2(outsider.token())
                .get("/api/v1/orders?listingId=" + listingA)
                .then()
                .statusCode(200)
                .body("totalElements", equalTo(0));

        // Notifications: Zero-PII, cross-user mark-as-read 404, and read-all drops unreadCount to 0
        Response notifResp = given()
                .auth().oauth2(userB.token())
                .get("/api/v1/notifications")
                .then()
                .statusCode(200)
                .extract().response();
        assertThat(notifResp.asString()).doesNotContain(userA.email(), userB.email(), userA.studentId(), userB.studentId());
        long unreadBefore = notifResp.jsonPath().getLong("unreadCount");
        assertThat(unreadBefore).isGreaterThanOrEqualTo(2);
        String userBNotifId = notifResp.jsonPath().getString("items[0].id");

        // Cross-user notification mark-read -> 404 NOTIFICATION_NOT_FOUND
        given()
                .auth().oauth2(outsider.token())
                .post("/api/v1/notifications/" + userBNotifId + "/read")
                .then()
                .statusCode(404)
                .body("code", equalTo("NOTIFICATION_NOT_FOUND"));

        given()
                .auth().oauth2(userB.token())
                .post("/api/v1/notifications/read-all")
                .then()
                .statusCode(200)
                .body("updatedCount", equalTo((int) unreadBefore));

        given()
                .auth().oauth2(userB.token())
                .get("/api/v1/notifications?unreadOnly=true")
                .then()
                .statusCode(200)
                .body("unreadCount", equalTo(0))
                .body("items", hasSize(0));

        // Security enforcement on /orders and /notifications for BI_KHOA & CHO_KICH_HOAT
        given().auth().oauth2(lockedMember.token()).get("/api/v1/orders")
                .then().statusCode(403).body("code", equalTo("ACCOUNT_RESTRICTED"));
        given().auth().oauth2(lockedMember.token()).get("/api/v1/notifications")
                .then().statusCode(403).body("code", equalTo("ACCOUNT_RESTRICTED"));
        given().auth().oauth2(pendingMember.token()).get("/api/v1/orders")
                .then().statusCode(403);
        given().auth().oauth2(pendingMember.token()).get("/api/v1/notifications")
                .then().statusCode(403);
    }

    @Test
    void uc25RejectsExpiredPendingScheduleProposalAndKeepsStartDeliveryBlocked() {
        MemberAccount seller = createActiveMember("SellerExpiredProp");
        MemberAccount buyer = createActiveMember("BuyerExpiredProp");

        UUID item = createItem(seller.token(), "Đèn bàn học sinh");
        UUID listing = publishListing(seller.token(), "Đèn bàn chống cận", 85000, List.of(item));

        UUID orderId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listing.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));

        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept").then().statusCode(200);

        Instant futureTime = Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        UUID proposalId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("proposedTime", futureTime.toString(), "proposedLocation", "Cổng KTX A"))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("pendingScheduleProposal.id"));

        // Backdate proposal time into the past -> confirmSchedule MUST reject with 409 PROPOSAL_EXPIRED
        db.update(
                "UPDATE lich_hen_giao_dichs SET thoi_gian_de_xuat = ? WHERE id = ?",
                Timestamp.from(Instant.now().minus(15, ChronoUnit.MINUTES)),
                proposalId
        );

        given()
                .auth().oauth2(seller.token())
                .get("/api/v1/orders/" + orderId)
                .then()
                .statusCode(200)
                .body("pendingScheduleProposal.canConfirm", equalTo(false))
                .body("pendingScheduleProposal.canReject", equalTo(true));

        given()
                .auth().oauth2(seller.token())
                .post("/api/v1/orders/" + orderId + "/schedules/" + proposalId + "/confirm")
                .then()
                .statusCode(409)
                .body("code", equalTo("PROPOSAL_EXPIRED"));

        assertThat(db.queryForObject(
                "SELECT lich_hen_da_xac_nhan FROM giao_dichs WHERE ma_giao_dich = ?",
                Boolean.class,
                orderId
        )).isFalse();

        // startDelivery MUST remain blocked with 409 SCHEDULE_NOT_CONFIRMED
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of())
                .post("/api/v1/orders/" + orderId + "/start-delivery")
                .then()
                .statusCode(409)
                .body("code", equalTo("SCHEDULE_NOT_CONFIRMED"));
    }

    @Test
    void uc24BuyerCancelClosesListingToDaRutWhenSellerLockedOrDisabledAndReopensIfTempLockExpired() {
        MemberAccount buyer = createActiveMember("BuyerCancelSellerState");

        // Case 1: Seller becomes BI_KHOA (active lock) -> buyer cancel releases item & transitions listing to DA_RUT
        MemberAccount lockedSeller = createActiveMember("LockedSellerCancel");
        UUID itemLocked = createItem(lockedSeller.token(), "Bàn gấp sinh viên");
        UUID listingLocked = publishListing(lockedSeller.token(), "Bàn gấp KTX A", 75000, List.of(itemLocked));
        UUID orderLocked = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingLocked.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        given().auth().oauth2(lockedSeller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderLocked + "/accept").then().statusCode(200);

        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', khoa_den_ngay = ? WHERE user_id = ?",
                Timestamp.from(Instant.now().plus(7, ChronoUnit.DAYS)),
                lockedSeller.id()
        );

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Người bán bị khóa tài khoản"))
                .post("/api/v1/orders/" + orderLocked + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, itemLocked))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listingLocked))
                .isEqualTo("DA_RUT");
        assertThat(db.queryForObject("SELECT closed_at FROM tin_dangs WHERE ma_tin = ?", Timestamp.class, listingLocked))
                .isNotNull();

        // Case 2: Seller becomes VO_HIEU_HOA -> buyer cancel releases item & transitions listing to DA_RUT
        MemberAccount disabledSeller = createActiveMember("DisabledSellerCancel");
        UUID itemDisabled = createItem(disabledSeller.token(), "Quạt sạc mini");
        UUID listingDisabled = publishListing(disabledSeller.token(), "Quạt sạc KTX B", 60000, List.of(itemDisabled));
        UUID orderDisabled = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingDisabled.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        given().auth().oauth2(disabledSeller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderDisabled + "/accept").then().statusCode(200);

        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'VO_HIEU_HOA', loai_han_che = NULL, khoa_den_ngay = NULL WHERE user_id = ?",
                disabledSeller.id()
        );

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Người bán bị vô hiệu hóa"))
                .post("/api/v1/orders/" + orderDisabled + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"));

        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, itemDisabled))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listingDisabled))
                .isEqualTo("DA_RUT");
        assertThat(db.queryForObject("SELECT closed_at FROM tin_dangs WHERE ma_tin = ?", Timestamp.class, listingDisabled))
                .isNotNull();

        // Case 3 (FR-12): Seller had an EXPIRED temporary lock -> reconciled to HOAT_DONG, listing reopens to CONG_KHAI
        MemberAccount expiredLockSeller = createActiveMember("ExpiredLockSellerCancel");
        UUID itemExpiredLock = createItem(expiredLockSeller.token(), "Giá treo quần áo");
        UUID listingExpiredLock = publishListing(expiredLockSeller.token(), "Giá treo inox", 95000, List.of(itemExpiredLock));
        UUID orderExpiredLock = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingExpiredLock.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id"));
        given().auth().oauth2(expiredLockSeller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderExpiredLock + "/accept").then().statusCode(200);

        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', khoa_den_ngay = ? WHERE user_id = ?",
                Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)),
                expiredLockSeller.id()
        );

        given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "Hủy sau khi hết khóa tạm"))
                .post("/api/v1/orders/" + orderExpiredLock + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("HUY"));

        assertThat(db.queryForObject("SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ?", String.class, expiredLockSeller.id()))
                .isEqualTo("HOAT_DONG");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, itemExpiredLock))
                .isEqualTo("KHA_DUNG");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listingExpiredLock))
                .isEqualTo("CONG_KHAI");
    }
}
