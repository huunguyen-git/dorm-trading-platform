package com.dormtrading.chat;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;
import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
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
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@DisplayName("Kiểm thử tích hợp P2-03 (UC-21): Nhắn tin & Thương lượng giá")
class ChatIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private JdbcTemplate db;

    @MockitoBean
    private JavaMailSender mail;

    private final ConcurrentMap<String, String> codes = new ConcurrentHashMap<>();
    private static final String PASSWORD = "a quiet river beneath stars";

    private String sellerToken;
    private UUID sellerId;

    private String buyerToken;
    private UUID buyerId;

    private String outsiderToken;

    private UUID saleItemId;
    private UUID saleListingId;
    private UUID freeListingId;

    @BeforeEach
    void setUp() {
        doAnswer(invocation -> {
            SimpleMailMessage msg = invocation.getArgument(0);
            var matcher = Pattern.compile("[0-9]{6}").matcher(Objects.requireNonNull(msg.getText()));
            if (matcher.find()) {
                codes.put(Objects.requireNonNull(msg.getTo())[0], matcher.group());
            }
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));

        String s1 = UUID.randomUUID().toString().substring(0, 10);
        String sellerEmail = "seller" + s1 + "@student.edu.vn";
        sellerToken = createActiveUser("Nguyen Ban Hang", s1, sellerEmail);
        sellerId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, sellerEmail);

        String s2 = UUID.randomUUID().toString().substring(0, 10);
        String buyerEmail = "buyer" + s2 + "@student.edu.vn";
        buyerToken = createActiveUser("Tran Mua Hang", s2, buyerEmail);
        buyerId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, buyerEmail);

        String s3 = UUID.randomUUID().toString().substring(0, 10);
        String outsiderEmail = "outsider" + s3 + "@student.edu.vn";
        outsiderToken = createActiveUser("Le Nguoi Ngoai", s3, outsiderEmail);

        saleItemId = UUID.randomUUID();
        db.update("""
                INSERT INTO do_vats (ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai)
                VALUES (?, ?, 'Bàn học gấp gọn KTX', 'Còn mới 95%', ARRAY['https://example.com/desk.jpg'], 'KHA_DUNG')
                """,
                saleItemId,
                sellerId);

        Timestamp nowTs = Timestamp.from(Instant.now());
        Timestamp futureExpiryTs = Timestamp.from(Instant.now().plus(30, ChronoUnit.DAYS));

        saleListingId = UUID.randomUUID();
        db.update("""
                INSERT INTO tin_dangs (
                    ma_tin, nguoi_dang_id, tieu_de, mo_ta, gia_vnd, hinh_anh,
                    khu_vuc, ma_khu_vuc, ma_danh_muc, hinh_thuc, trang_thai,
                    published_at, expires_at
                )
                VALUES (?, ?, 'Bàn học gấp gọn KTX Khu B', 'Bàn gỗ chắc chắn, giao tại KTX Khu B', 150000,
                        ARRAY['https://example.com/desk.jpg'], 'KTX Khu B', 'KTX_KHU_B', 'NOI_THAT_TRO', 'BAN_LE', 'CONG_KHAI',
                        ?, ?)
                """,
                saleListingId,
                sellerId,
                nowTs,
                futureExpiryTs);

        db.update("INSERT INTO tin_dang_do_vat (ma_tin, ma_vat) VALUES (?, ?)", saleListingId, saleItemId);

        freeListingId = UUID.randomUUID();
        db.update("""
                INSERT INTO tin_dangs (
                    ma_tin, nguoi_dang_id, tieu_de, mo_ta, gia_vnd, hinh_anh,
                    khu_vuc, ma_khu_vuc, ma_danh_muc, hinh_thuc, trang_thai,
                    published_at, expires_at
                )
                VALUES (?, ?, 'Tặng tài liệu ôn Giải tích 1', NULL, 0,
                        ARRAY['https://example.com/book.jpg'], 'KTX Khu A', 'KTX_KHU_A', 'DO_CHO_TANG', 'CHO_TANG', 'CONG_KHAI',
                        ?, ?)
                """,
                freeListingId,
                sellerId,
                nowTs,
                futureExpiryTs);
    }

    private String createActiveUser(String name, String studentId, String email) {
        String ip = "10.1." + (Math.abs(studentId.hashCode()) % 250) + ".1";
        auth.register(name, studentId, email, PASSWORD, ip);
        delivery.deliver();
        String code = codes.get(email);
        var challenge = db.queryForMap(
                "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                email);
        auth.verify((UUID) challenge.get("id"), email, "REGISTER", code, ip);
        db.update(
                "UPDATE thanh_viens SET profile_approved = true, trang_thai_tai_khoan = 'HOAT_DONG', diem_uy_tin = 100 WHERE email = ?",
                email);
        return auth.login(email, PASSWORD, "mobile", ip).token();
    }

    private String createPendingUser(String name, String studentId, String email) {
        String ip = "10.2." + (Math.abs(studentId.hashCode()) % 250) + ".1";
        auth.register(name, studentId, email, PASSWORD, ip);
        delivery.deliver();
        String code = codes.get(email);
        var challenge = db.queryForMap(
                "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                email);
        auth.verify((UUID) challenge.get("id"), email, "REGISTER", code, ip);
        return auth.login(email, PASSWORD, "mobile", ip).token();
    }

    @Test
    @DisplayName("TC-01: Mở/tái sử dụng hội thoại từ tin đăng, chống tự nhắn tin, bảo mật tin NHAP/AN và chặn người thứ ba truy cập")
    void openConversationAndEnforceParticipantAccess() throws Exception {
        // Unauthenticated requests are rejected with 401
        given()
                .when()
                .get("/api/v1/conversations")
                .then()
                .statusCode(401);

        // Public listings endpoint (DiscoveryService ListingPageDto) exposes items with seller.id, listingType, status
        given()
                .when()
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.find { it.id == '" + saleListingId + "' }.seller.id", equalTo(sellerId.toString()))
                .body("items.find { it.id == '" + saleListingId + "' }.listingType", equalTo("BAN_LE"))
                .body("items.find { it.id == '" + saleListingId + "' }.status", equalTo("CONG_KHAI"))
                .body("items.find { it.id == '" + freeListingId + "' }.description", nullValue());

        // Non-existent listing returns 404 LISTING_NOT_FOUND
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", UUID.randomUUID()))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(404)
                .body("code", equalTo("LISTING_NOT_FOUND"));

        // Private NHAP, CHO_DUYET, or AN listing of another user returns 404 LISTING_NOT_FOUND (preventing probing)
        for (String privateStatus : List.of("NHAP", "CHO_DUYET", "AN")) {
            UUID privateListingId = UUID.randomUUID();
            db.update("""
                    INSERT INTO tin_dangs (ma_tin, nguoi_dang_id, tieu_de, mo_ta, gia_vnd, hinh_anh, khu_vuc, ma_danh_muc, hinh_thuc, trang_thai)
                    VALUES (?, ?, 'Tin riêng tư', 'Chưa công khai', 100000, ARRAY['https://example.com/draft.jpg'], 'KTX Khu B', 'NOI_THAT_TRO', 'BAN_LE', ?)
                    """,
                    privateListingId,
                    sellerId,
                    privateStatus);
            given()
                    .auth().oauth2(buyerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("listingId", privateListingId))
                    .when()
                    .post("/api/v1/conversations")
                    .then()
                    .statusCode(404)
                    .body("code", equalTo("LISTING_NOT_FOUND"));
        }

        // DA_RUT or expired CONG_KHAI listing (expires_at <= now) without an existing conversation returns 409 LISTING_NOT_AVAILABLE
        UUID overdueListingId = UUID.randomUUID();
        Timestamp pastExpiry = Timestamp.from(Instant.now().minus(1, ChronoUnit.DAYS));
        db.update("""
                INSERT INTO tin_dangs (ma_tin, nguoi_dang_id, tieu_de, mo_ta, gia_vnd, hinh_anh, khu_vuc, ma_danh_muc, hinh_thuc, trang_thai, expires_at)
                VALUES (?, ?, 'Tin quá hạn', 'Đã quá hạn 30 ngày', 100000, ARRAY['https://example.com/exp.jpg'], 'KTX Khu B', 'NOI_THAT_TRO', 'BAN_LE', 'CONG_KHAI', ?)
                """,
                overdueListingId,
                sellerId,
                pastExpiry);
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", overdueListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_NOT_AVAILABLE"));

        // Seller cannot open conversation on own listing
        given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", saleListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(400)
                .body("code", equalTo("SELF_CONVERSATION_NOT_ALLOWED"));

        // Concurrent open requests from buyer create exactly one conversation
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<String> openCall = () -> given()
                    .auth().oauth2(buyerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("listingId", saleListingId))
                    .when()
                    .post("/api/v1/conversations")
                    .then()
                    .extract().jsonPath().getString("id");
            var futures = pool.invokeAll(List.of(openCall, openCall));
            String id1 = futures.get(0).get();
            String id2 = futures.get(1).get();
            assertThat(id1).isNotBlank().isEqualTo(id2);
        }

        // Subsequent open returns 200 OK with the existing conversation and nested buyer/seller/listing
        String convId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", saleListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(200)
                .body("currentUserId", equalTo(buyerId.toString()))
                .body("listing.id", equalTo(saleListingId.toString()))
                .body("listingId", equalTo(saleListingId.toString()))
                .body("buyer.id", equalTo(buyerId.toString()))
                .body("buyer.name", equalTo("Tran Mua Hang"))
                .body("seller.id", equalTo(sellerId.toString()))
                .body("seller.name", equalTo("Nguyen Ban Hang"))
                .body("counterpartyId", equalTo(sellerId.toString()))
                .body("counterpartyName", equalTo("Nguyen Ban Hang"))
                .body("counterpartyStatus", equalTo("HOAT_DONG"))
                .body("counterpartyRestricted", equalTo(false))
                .body("canSendMessage", equalTo(true))
                .body("canMakeOffer", equalTo(true))
                .extract().jsonPath().getString("id");

        // Both buyer and seller see the conversation in their inbox list, and offset/limit pagination works
        given()
                .auth().oauth2(sellerToken)
                .when()
                .get("/api/v1/conversations")
                .then()
                .statusCode(200)
                .body("find { it.id == '" + convId + "' }.counterpartyId", equalTo(buyerId.toString()))
                .body("find { it.id == '" + convId + "' }.counterpartyName", equalTo("Tran Mua Hang"))
                .body("find { it.id == '" + convId + "' }.buyer.id", equalTo(buyerId.toString()))
                .body("find { it.id == '" + convId + "' }.seller.id", equalTo(sellerId.toString()));

        // Open a second conversation on freeListingId to test inbox pagination (limit=1, offset=0/1) and invalid pagination params (400 INVALID_INPUT)
        String freeConvId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", freeListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");

        given()
                .auth().oauth2(buyerToken)
                .queryParam("offset", 0)
                .queryParam("limit", 1)
                .when()
                .get("/api/v1/conversations")
                .then()
                .statusCode(200)
                .body("$", hasSize(1))
                .body("[0].id", equalTo(freeConvId));

        given()
                .auth().oauth2(buyerToken)
                .queryParam("offset", 1)
                .queryParam("limit", 1)
                .when()
                .get("/api/v1/conversations")
                .then()
                .statusCode(200)
                .body("$", hasSize(1))
                .body("[0].id", equalTo(convId));

        given()
                .auth().oauth2(buyerToken)
                .queryParam("offset", -1)
                .queryParam("limit", 10)
                .when()
                .get("/api/v1/conversations")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        given()
                .auth().oauth2(buyerToken)
                .queryParam("offset", 0)
                .queryParam("limit", 101)
                .when()
                .get("/api/v1/conversations")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Outsider cannot read or post messages/offers/responses to this conversation (404 CONVERSATION_NOT_FOUND)
        given()
                .auth().oauth2(outsiderToken)
                .when()
                .get("/api/v1/conversations/{id}", convId)
                .then()
                .statusCode(404)
                .body("code", equalTo("CONVERSATION_NOT_FOUND"));

        given()
                .auth().oauth2(outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("content", "Cho mình hỏi ké"))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(404)
                .body("code", equalTo("CONVERSATION_NOT_FOUND"));

        given()
                .auth().oauth2(outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("offeredPrice", 100000))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(404)
                .body("code", equalTo("CONVERSATION_NOT_FOUND"));

        given()
                .auth().oauth2(outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("action", "ACCEPT"))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, UUID.randomUUID())
                .then()
                .statusCode(404)
                .body("code", equalTo("CONVERSATION_NOT_FOUND"));
    }

    @Test
    @DisplayName("TC-02: Gửi tin nhắn văn bản và gửi lại idempotent qua clientMessageId (201 mới, 200 replay, 409 CLIENT_MESSAGE_ID_CONFLICT)")
    void sendMessageAndIdempotentClientRetry() {
        String convId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", saleListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");

        String msgId1 = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "content", "Bàn còn chắc chắn không bạn? Hẹn xem ở cổng KTX Khu B lúc 17h nhé?",
                        "clientMessageId", "11111111-1111-4111-8111-111111111111"))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(201)
                .body("type", equalTo("VAN_BAN"))
                .body("messageType", equalTo("VAN_BAN"))
                .body("conversationVersion", equalTo(1))
                .body("senderId", equalTo(buyerId.toString()))
                .body("clientMessageId", equalTo("11111111-1111-4111-8111-111111111111"))
                .body("canRespond", equalTo(false))
                .extract().jsonPath().getString("id");

        // Retrying with the exact same clientMessageId and content returns 200 OK with the same message without duplicating
        String msgIdReplay = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "content", "Bàn còn chắc chắn không bạn? Hẹn xem ở cổng KTX Khu B lúc 17h nhé?",
                        "clientMessageId", "11111111-1111-4111-8111-111111111111"))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(200)
                .extract().jsonPath().getString("id");

        assertThat(msgIdReplay).isEqualTo(msgId1);

        // Reusing the same clientMessageId with different content returns 409 CLIENT_MESSAGE_ID_CONFLICT
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "content", "Nội dung khác nhưng trùng clientMessageId",
                        "clientMessageId", "11111111-1111-4111-8111-111111111111"))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(409)
                .body("code", equalTo("CLIENT_MESSAGE_ID_CONFLICT"));

        // Seller replies
        given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("content", "Còn rất chắc nha bạn, 17h ở cổng Khu B được luôn."))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(201);

        // Verify conversation detail has exactly 2 messages in ascending sequence order
        given()
                .auth().oauth2(buyerToken)
                .when()
                .get("/api/v1/conversations/{id}", convId)
                .then()
                .statusCode(200)
                .body("messages", hasSize(2))
                .body("messages[0].id", equalTo(msgId1));

        // When conversation exceeds 500 messages after a pending offer, GET detail returns the 500 NEWEST messages ordered ASC and preserves pendingOffer
        String earlyOfferId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("offeredPrice", 130000))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("pendingOfferId");

        UUID convUuid = UUID.fromString(convId);
        Instant baseTime = Instant.now();
        for (int i = 1; i <= 505; i++) {
            Timestamp ts = Timestamp.from(baseTime.plusMillis(i));
            db.update("""
                    INSERT INTO tin_nhans (
                        ma_tin_nhan, ma_hoi_thoai, nguoi_gui_id, loai_tin_nhan,
                        noi_dung, thoi_diem_gui, updated_at
                    ) VALUES (?, ?, ?, 'VAN_BAN', ?, ?, ?)
                    """,
                    UUID.randomUUID(),
                    convUuid,
                    buyerId,
                    "Tin nhan thu " + i,
                    ts,
                    ts);
        }

        given()
                .auth().oauth2(buyerToken)
                .when()
                .get("/api/v1/conversations/{id}", convId)
                .then()
                .statusCode(200)
                .body("messages", hasSize(500))
                .body("messages[0].content", equalTo("Tin nhan thu 6"))
                .body("messages[499].content", equalTo("Tin nhan thu 505"))
                .body("pendingOfferId", equalTo(earlyOfferId))
                .body("pendingOfferPrice", equalTo(130000));
    }

    @Test
    @DisplayName("TC-03: Thương lượng giá (Đề nghị -> Từ chối -> Đề nghị mới -> Đề xuất lại -> Chấp nhận -> Giữ agreedPrice) & Không tự động giữ chỗ")
    void priceNegotiationLifecycleAndNoAutoReservationInvariant() throws Exception {
        String convId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", saleListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");

        // 1. Buyer sends offer 120,000 VND with clientMessageId
        String offer1Id = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "offeredPrice", 120000,
                        "note", "Mình qua lấy tận nơi, để mình 120k nhé",
                        "clientMessageId", "offer-key-001"))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(201)
                .body("agreedPrice", nullValue())
                .body("pendingOfferId", notNullValue())
                .body("messages", hasSize(1))
                .body("messages[0].type", equalTo("DE_NGHI_GIA"))
                .body("messages[0].messageType", equalTo("DE_NGHI_GIA"))
                .body("messages[0].offeredPrice", equalTo(120000))
                .body("messages[0].offerStatus", equalTo("CHO_PHAN_HOI"))
                .body("messages[0].canRespond", equalTo(false)) // buyer cannot respond to own offer
                .extract().jsonPath().getString("messages[0].id");

        // Idempotent replay of createOffer with same clientMessageId, price, and note returns 200 OK
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "offeredPrice", 120000,
                        "note", "Mình qua lấy tận nơi, để mình 120k nhé",
                        "clientMessageId", "offer-key-001"))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(200)
                .body("messages", hasSize(1));

        // Replaying createOffer with same clientMessageId and price but DIFFERENT note returns 409 CLIENT_MESSAGE_ID_CONFLICT
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "offeredPrice", 120000,
                        "note", "Khác ghi chú nhưng trùng clientMessageId",
                        "clientMessageId", "offer-key-001"))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(409)
                .body("code", equalTo("CLIENT_MESSAGE_ID_CONFLICT"));

        // Buyer cannot accept their own offer
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("action", "ACCEPT"))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, offer1Id)
                .then()
                .statusCode(403)
                .body("code", equalTo("OFFER_RESPONSE_FORBIDDEN"));

        // Seller sees canRespond = true on buyer's pending offer
        given()
                .auth().oauth2(sellerToken)
                .when()
                .get("/api/v1/conversations/{id}", convId)
                .then()
                .statusCode(200)
                .body("messages[0].canRespond", equalTo(true));

        // 2. Seller rejects offer 120,000 VND and stores responseNote & respondedById
        given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("action", "REJECT", "note", "120k thấp quá bạn ơi"))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, offer1Id)
                .then()
                .statusCode(200)
                .body("agreedPrice", nullValue())
                .body("pendingOfferId", nullValue())
                .body("messages", hasSize(1))
                .body("messages[0].offerStatus", equalTo("DA_TU_CHOI"))
                .body("messages[0].responseAction", equalTo("REJECT"))
                .body("messages[0].responseNote", equalTo("120k thấp quá bạn ơi"))
                .body("messages[0].respondedById", equalTo(sellerId.toString()));

        // Responding again to rejected offer returns 409 OFFER_NOT_PENDING
        given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("action", "ACCEPT"))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, offer1Id)
                .then()
                .statusCode(409)
                .body("code", equalTo("OFFER_NOT_PENDING"));

        // 3. Buyer sends offer 125,000 VND, then directly sends a new offer 130,000 VND via POST /offers (supersedes 125k -> DA_THAY_THE)
        String offer2aId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("offeredPrice", 125000, "clientMessageId", "offer-key-002a"))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("pendingOfferId");

        // Attempting to createOffer with a conflicting clientMessageId throws 409 and MUST NOT commit DA_THAY_THE on offer2aId
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("offeredPrice", 128000, "clientMessageId", "offer-key-001"))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(409)
                .body("code", equalTo("CLIENT_MESSAGE_ID_CONFLICT"));

        String statusAfterConflict = db.queryForObject(
                "SELECT trang_thai_de_nghi FROM tin_nhans WHERE ma_tin_nhan = ?",
                String.class,
                UUID.fromString(offer2aId));
        assertThat(statusAfterConflict).isEqualTo("CHO_PHAN_HOI");

        String offer2Id = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("offeredPrice", 130000))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(201)
                .body("messages[1].offerStatus", equalTo("DA_THAY_THE"))
                .body("messages[2].content", equalTo(""))
                .body("messages[2].offerStatus", equalTo("CHO_PHAN_HOI"))
                .extract().jsonPath().getString("messages[2].id");

        // Invalid counterPrice (> listingPrice) is rejected with 400 INVALID_OFFER_PRICE
        given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("action", "COUNTER", "counterPrice", 200000))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, offer2Id)
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_OFFER_PRICE"));

        String counterOfferId = given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "action", "COUNTER",
                        "counterPrice", 140000,
                        "note", "Bớt bạn 10k còn 140k nha",
                        "clientMessageId", "counter-key-001"))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, offer2Id)
                .then()
                .statusCode(200)
                .body("messages[2].offerStatus", equalTo("DA_THAY_THE"))
                .body("messages[2].responseAction", equalTo("COUNTER"))
                .body("messages[3].type", equalTo("DE_NGHI_GIA"))
                .body("messages[3].content", equalTo("Bớt bạn 10k còn 140k nha"))
                .body("messages[3].offeredPrice", equalTo(140000))
                .body("messages[3].offerStatus", equalTo("CHO_PHAN_HOI"))
                .body("messages[3].responseAction", nullValue())
                .body("messages[3].parentOfferId", equalTo(offer2Id))
                .extract().jsonPath().getString("messages[3].id");

        // Idempotent replay of COUNTER with same clientMessageId, counterPrice, and note returns 200 OK
        given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "action", "COUNTER",
                        "counterPrice", 140000,
                        "note", "Bớt bạn 10k còn 140k nha",
                        "clientMessageId", "counter-key-001"))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, offer2Id)
                .then()
                .statusCode(200)
                .body("messages", hasSize(4));

        // Replaying COUNTER with same clientMessageId but different counterPrice returns 409 CLIENT_MESSAGE_ID_CONFLICT
        given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "action", "COUNTER",
                        "counterPrice", 135000,
                        "note", "Bớt bạn 10k còn 140k nha",
                        "clientMessageId", "counter-key-001"))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, offer2Id)
                .then()
                .statusCode(409)
                .body("code", equalTo("CLIENT_MESSAGE_ID_CONFLICT"));

        // 4. Buyer concurrently attempts two responses on the counter-offer -> only one wins (NFR-02)
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Integer> acceptCall = () -> given()
                    .auth().oauth2(buyerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("action", "ACCEPT", "note", "Chốt 140k nha bạn"))
                    .when()
                    .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, counterOfferId)
                    .statusCode();
            Callable<Integer> secondAcceptCall = () -> given()
                    .auth().oauth2(buyerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("action", "ACCEPT"))
                    .when()
                    .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, counterOfferId)
                    .statusCode();
            var statuses = pool.invokeAll(List.of(acceptCall, secondAcceptCall));
            List<Integer> codesResult = List.of(statuses.get(0).get(), statuses.get(1).get());
            assertThat(codesResult).containsExactlyInAnyOrder(200, 409);
        }

        // 5. Verify agreedPrice = 140000, reservationNotice is present, and listing/item are NOT reserved (FR-07, FR-08)
        given()
                .auth().oauth2(buyerToken)
                .when()
                .get("/api/v1/conversations/{id}", convId)
                .then()
                .statusCode(200)
                .body("agreedPrice", equalTo(140000))
                .body("agreedOfferId", equalTo(counterOfferId))
                .body("reservationNotice", notNullValue())
                .body("listingStatus", equalTo("CONG_KHAI"));

        // 6. If a new offer is later created (135,000), and seller lowers listingPrice to 125,000 (UC-17), ACCEPT is rejected with 409
        String offerAfterAcceptId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("offeredPrice", 135000))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(201)
                .body("agreedPrice", equalTo(140000))
                .extract().jsonPath().getString("pendingOfferId");

        db.update("UPDATE tin_dangs SET gia_vnd = 125000 WHERE ma_tin = ?", saleListingId);
        given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("action", "ACCEPT"))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, offerAfterAcceptId)
                .then()
                .statusCode(409)
                .body("code", equalTo("OFFER_NOT_PENDING"));
        db.update("UPDATE tin_dangs SET gia_vnd = 150000 WHERE ma_tin = ?", saleListingId);

        given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("action", "REJECT"))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, offerAfterAcceptId)
                .then()
                .statusCode(200)
                .body("agreedPrice", equalTo(140000));

        String listingStatusInDb = db.queryForObject(
                "SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?",
                String.class,
                saleListingId);
        String itemStatusInDb = db.queryForObject(
                "SELECT trang_thai FROM do_vats WHERE ma_vat = ?",
                String.class,
                saleItemId);
        Integer orderCount = db.queryForObject(
                "SELECT count(*) FROM giao_dichs WHERE ma_tin = ?",
                Integer.class,
                saleListingId);

        assertThat(listingStatusInDb).isEqualTo("CONG_KHAI");
        assertThat(itemStatusInDb).isEqualTo("KHA_DUNG");
        assertThat(orderCount).isZero();
    }

    @Test
    @DisplayName("TC-04: Chặn đề nghị giá trên tin cho tặng miễn phí (0đ) và kiểm tra biên giá đề nghị (0, âm, lẻ, định dạng 120.000, vượt niêm yết, bằng niêm yết)")
    void rejectOfferOnFreeGiveawayListingAndInvalidPrices() {
        // Open conversation on free giveaway listing (0 VND, CHO_TANG)
        String freeConvId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", freeListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(201)
                .body("canSendMessage", equalTo(true))
                .body("canMakeOffer", equalTo(false))
                .body("restrictionReason", equalTo("FREE_LISTING_NO_NEGOTIATION"))
                .extract().jsonPath().getString("id");

        // Normal text messaging on giveaway listing works
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("content", "Mình xin nhận tài liệu Giải tích ở thư viện được không bạn?"))
                .when()
                .post("/api/v1/conversations/{id}/messages", freeConvId)
                .then()
                .statusCode(201);

        // Making price offer on giveaway listing is rejected with 409 FREE_LISTING_NO_NEGOTIATION
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("offeredPrice", 10000))
                .when()
                .post("/api/v1/conversations/{id}/offers", freeConvId)
                .then()
                .statusCode(409)
                .body("code", equalTo("FREE_LISTING_NO_NEGOTIATION"));

        // On paid listing (150,000 VND), test price boundaries (<= 0, fractional, "120.000", > listingPrice, and == listingPrice)
        String paidConvId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", saleListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");

        for (Object invalidPrice : List.of(0, -5000, 125000.5, "120.000", "120,000", 150001)) {
            given()
                    .auth().oauth2(buyerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("offeredPrice", invalidPrice))
                    .when()
                    .post("/api/v1/conversations/{id}/offers", paidConvId)
                    .then()
                    .statusCode(400)
                    .body("code", equalTo("INVALID_OFFER_PRICE"));
        }

        // Offer equal to listing price (150,000 VND) is valid
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("offeredPrice", 150000))
                .when()
                .post("/api/v1/conversations/{id}/offers", paidConvId)
                .then()
                .statusCode(201)
                .body("pendingOfferPrice", equalTo(150000));
    }

    @Test
    @DisplayName("TC-05: Chặn người gọi BI_KHOA (403 ACCOUNT_RESTRICTED kèm restriction) / CHO_KICH_HOAT, chặn khi đối phương bị khóa, tự mở lại khi hết hạn khóa tạm 14 ngày (FR-12) và giữ lịch sử khi tin đã xóa")
    void blockMutationsWhenRestrictedReconcileExpiredTemporaryLockAndPreserveDeletedListingHistory() {
        // Pending user (CHO_KICH_HOAT) is blocked from chat endpoints with 403
        String pendingStudent = UUID.randomUUID().toString().substring(0, 10);
        String pendingToken = createPendingUser("Pham Cho Duyet", pendingStudent, "pending" + pendingStudent + "@student.edu.vn");
        given()
                .auth().oauth2(pendingToken)
                .when()
                .get("/api/v1/conversations")
                .then()
                .statusCode(403);

        String convId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", saleListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");

        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("content", "Tin nhắn lưu làm bằng chứng trước khi khóa"))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(201);

        // 1. Lock seller with active temporary lock (expires in future)
        Timestamp futureExpiry = Timestamp.from(Instant.now().plus(7, ChronoUnit.DAYS));
        db.update("""
                UPDATE thanh_viens
                SET trang_thai_tai_khoan = 'BI_KHOA',
                    loai_han_che = 'KHOA_TAM_THOI',
                    ly_do_han_che = 'Vi phạm quy định',
                    khoa_den_ngay = ?
                WHERE user_id = ?
                """,
                futureExpiry,
                sellerId);

        // Locked seller calling /api/v1/conversations directly receives 403 ACCOUNT_RESTRICTED with restriction payload
        given()
                .auth().oauth2(sellerToken)
                .when()
                .get("/api/v1/conversations")
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"))
                .body("restriction.accountStatus", equalTo("BI_KHOA"))
                .body("restriction.lockType", equalTo("KHOA_TAM_THOI"))
                .body("restriction.reason", equalTo("Vi phạm quy định"));

        // Opening a brand-new conversation with a locked seller is rejected with 403 COUNTERPARTY_RESTRICTED
        given()
                .auth().oauth2(outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", saleListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(403)
                .body("code", equalTo("COUNTERPARTY_RESTRICTED"));

        // Active buyer can still read conversation history, with canSendMessage=false, restrictionReason=COUNTERPARTY_RESTRICTED, counterpartyStatus=HAN_CHE
        given()
                .auth().oauth2(buyerToken)
                .when()
                .get("/api/v1/conversations/{id}", convId)
                .then()
                .statusCode(200)
                .body("canSendMessage", equalTo(false))
                .body("canMakeOffer", equalTo(false))
                .body("counterpartyStatus", equalTo("HAN_CHE"))
                .body("counterpartyRestricted", equalTo(true))
                .body("restrictionReason", equalTo("COUNTERPARTY_RESTRICTED"))
                .body("messages", hasSize(1));

        // Active buyer cannot send new messages or offers while seller is locked (403 COUNTERPARTY_RESTRICTED)
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("content", "Tin nhắn khi người bán đang bị khóa"))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(403)
                .body("code", equalTo("COUNTERPARTY_RESTRICTED"));

        // 2. Temporary lock expires (past timestamp) -> ChatService lazily reconciles seller back to HOAT_DONG even before seller logs in!
        Timestamp pastExpiry = Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS));
        db.update("UPDATE thanh_viens SET khoa_den_ngay = ? WHERE user_id = ?", pastExpiry, sellerId);

        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("content", "Tin nhắn sau khi người bán hết hạn khóa tạm 14 ngày"))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(201);

        // 2b. VO_HIEU_HOA seller is rejected at SecurityConfig (401 for disabled caller token) and treated as restricted counterparty (403 COUNTERPARTY_RESTRICTED)
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'VO_HIEU_HOA' WHERE user_id = ?", sellerId);
        given()
                .auth().oauth2(sellerToken)
                .when()
                .get("/api/v1/conversations")
                .then()
                .statusCode(401);
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("content", "Thử gửi tin khi đối phương VO_HIEU_HOA"))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(403)
                .body("code", equalTo("COUNTERPARTY_RESTRICTED"));
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'HOAT_DONG' WHERE user_id = ?", sellerId);

        // Create a pending offer while CONG_KHAI so we can test respond rejection after transition to GIU_CHO
        String pendingOfferId = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("offeredPrice", 130000))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("pendingOfferId");

        // 3. Listing transitions to GIU_CHO -> aligned with DiscoveryService (viewer.canMessage=true, canMakeOffer=false):
        // text messaging remains allowed (canSendMessage=true), while price offers/responses are blocked (canMakeOffer=false, 409 LISTING_NOT_AVAILABLE)
        db.update("UPDATE tin_dangs SET trang_thai = 'GIU_CHO' WHERE ma_tin = ?", saleListingId);

        given()
                .auth().oauth2(buyerToken)
                .when()
                .get("/api/v1/conversations/{id}", convId)
                .then()
                .statusCode(200)
                .body("listingStatus", equalTo("GIU_CHO"))
                .body("canSendMessage", equalTo(true))
                .body("canMakeOffer", equalTo(false))
                .body("restrictionReason", equalTo("LISTING_NOT_AVAILABLE"))
                .body("messages[2].canRespond", equalTo(false));

        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", saleListingId))
                .when()
                .post("/api/v1/conversations")
                .then()
                .statusCode(200)
                .body("canSendMessage", equalTo(true))
                .body("canMakeOffer", equalTo(false))
                .body("restrictionReason", equalTo("LISTING_NOT_AVAILABLE"));

        // Text messaging on GIU_CHO is allowed (201 Created)
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("content", "Mình nhắn hỏi lịch hẹn bàn giao khi tin đang GIU_CHO"))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(201);

        // Creating or responding to price offers on GIU_CHO is rejected with 409 LISTING_NOT_AVAILABLE
        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("offeredPrice", 125000))
                .when()
                .post("/api/v1/conversations/{id}/offers", convId)
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_NOT_AVAILABLE"));

        given()
                .auth().oauth2(sellerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("action", "ACCEPT"))
                .when()
                .post("/api/v1/conversations/{id}/offers/{offerId}/respond", convId, pendingOfferId)
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_NOT_AVAILABLE"));

        // 3b. When CONG_KHAI listing has expires_at <= now() (lazy expiry V12), effective status becomes HET_HAN -> read-only, text & offers rejected with 409
        Timestamp expiredAt = Timestamp.from(Instant.now().minus(5, ChronoUnit.MINUTES));
        db.update("UPDATE tin_dangs SET trang_thai = 'CONG_KHAI', expires_at = ? WHERE ma_tin = ?", expiredAt, saleListingId);

        given()
                .auth().oauth2(buyerToken)
                .when()
                .get("/api/v1/conversations/{id}", convId)
                .then()
                .statusCode(200)
                .body("listingStatus", equalTo("HET_HAN"))
                .body("canSendMessage", equalTo(false))
                .body("canMakeOffer", equalTo(false))
                .body("restrictionReason", equalTo("LISTING_NOT_AVAILABLE"));

        given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("content", "Thử gửi tin khi tin CONG_KHAI đã quá hạn expires_at"))
                .when()
                .post("/api/v1/conversations/{id}/messages", convId)
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_NOT_AVAILABLE"));

        // 4. If listing is deleted (ON DELETE SET NULL -> ma_tin becomes NULL), history remains readable with listing=null
        db.update("DELETE FROM tin_dang_do_vat WHERE ma_tin = ?", saleListingId);
        db.update("DELETE FROM tin_dangs WHERE ma_tin = ?", saleListingId);

        given()
                .auth().oauth2(buyerToken)
                .when()
                .get("/api/v1/conversations/{id}", convId)
                .then()
                .statusCode(200)
                .body("listing", nullValue())
                .body("listingId", nullValue())
                .body("canSendMessage", equalTo(false))
                .body("canMakeOffer", equalTo(false))
                .body("restrictionReason", equalTo("LISTING_NOT_AVAILABLE"))
                .body("messages", hasSize(4));
    }
}
