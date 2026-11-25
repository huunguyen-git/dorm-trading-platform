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

    private record MemberAccount(UUID id, String email, String token) {
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
        return new MemberAccount(userId, email, token);
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

        String notifId = notifResp.jsonPath().getString("items[0].id");
        given()
                .auth().oauth2(buyer.token())
                .post("/api/v1/notifications/" + notifId + "/read")
                .then()
                .statusCode(200)
                .body("read", equalTo(true));
    }
}
