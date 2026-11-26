package com.dormtrading.catalog.listing;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

@Import(ListingApiTest.PendingRequestEventCapture.class)
class ListingApiTest extends BaseIntegrationTest {

    @Component
    static class PendingRequestEventCapture {
        private final List<ListingUpdatedWithPendingRequestsEvent> events = new CopyOnWriteArrayList<>();

        @EventListener
        void onListingUpdated(ListingUpdatedWithPendingRequestsEvent event) {
            events.add(event);
        }

        List<ListingUpdatedWithPendingRequestsEvent> events() {
            return List.copyOf(events);
        }

        void clear() {
            events.clear();
        }
    }

    private static final String PASSWORD = "a quiet river beneath stars";

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private JdbcTemplate db;

    @Autowired
    private PendingRequestEventCapture eventCapture;

    @MockitoBean
    private JavaMailSender mail;

    @MockitoBean
    private Clock clock;

    private final AtomicReference<Instant> currentTime = new AtomicReference<>();
    private final ConcurrentMap<String, String> otpCodes = new ConcurrentHashMap<>();

    private record TestUser(UUID id, String email, String studentId, String token) {
    }

    @BeforeEach
    void setup() {
        eventCapture.clear();
        currentTime.set(Instant.now().truncatedTo(ChronoUnit.MILLIS));
        when(clock.instant()).thenAnswer(inv -> currentTime.get());
        doAnswer(invocation -> {
            SimpleMailMessage msg = invocation.getArgument(0);
            var matcher = Pattern.compile("[0-9]{6}").matcher(Objects.requireNonNull(msg.getText()));
            if (matcher.find()) {
                otpCodes.put(Objects.requireNonNull(msg.getTo())[0], matcher.group());
            }
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));
    }

    private TestUser createUser(String displayName, boolean activate, int score) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "LS" + suffix;
        String email = "lst_" + suffix + "@student.edu.vn";
        String ip = "10.2." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register(displayName, studentId, email, PASSWORD, ip);
        if (activate) {
            delivery.deliver();
            String code = otpCodes.get(email);
            var challenge = db.queryForMap(
                    "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                    email
            );
            auth.verify((UUID) challenge.get("id"), email, "REGISTER", code, ip);
            db.update(
                    "UPDATE thanh_viens SET profile_approved = TRUE, trang_thai_tai_khoan = 'HOAT_DONG', diem_uy_tin = ?, so_dien_thoai = '0901234567' WHERE email = ?",
                    score,
                    email
            );
        }
        UUID userId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email);
        String token = auth.login(email, PASSWORD, "mobile", ip).token();
        return new TestUser(userId, email, studentId, token);
    }

    private String relogin(TestUser user) {
        String ip = "10.3." + (Math.abs(user.studentId().hashCode()) % 250) + ".2";
        return auth.login(user.email(), PASSWORD, "mobile", ip).token();
    }

    private UUID createInventoryItem(String token, String name) {
        String id = given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", name,
                        "tinhTrang", "Còn mới 90%",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/items/" + UUID.randomUUID() + ".jpg")
                ))
                .post("/api/v1/inventory")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");
        return UUID.fromString(id);
    }

    private Map<String, Object> validPublishPayload(String title, int priceVnd, List<UUID> itemIds) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("action", "PUBLISH");
        body.put("title", title);
        body.put("description", "Sách và đồ dùng sinh viên ĐHQG-HCM, còn tốt.");
        body.put("condition", "Mới 95%, không rách trang");
        body.put("priceVnd", priceVnd);
        body.put("categoryId", "GT_CNTT");
        body.put("locationCode", "KTX_KHU_A");
        body.put("courseCode", "SE100");
        body.put("courseName", "Phương pháp Phát triển Phần mềm Hướng đối tượng");
        body.put("author", "Khoa CNPM - UIT");
        body.put("images", List.of("https://cdn.example.edu.vn/listings/photo1.jpg"));
        body.put("itemIds", itemIds);
        return body;
    }

    @Test
    void uc10_publishSingleComboFreeFreeComboTextbookDraftMultiListingSharingAndNoPii() {
        TestUser seller = createUser("Nguyễn Văn Bán", true, 100);
        TestUser buyer = createUser("Trần Thị Mua", true, 100);

        // Seed 1 approved review (5 stars) and 1 pending review (1 star) to verify approved-only rating aggregation
        UUID seededListing = UUID.randomUUID();
        UUID tx1 = UUID.randomUUID();
        UUID tx2 = UUID.randomUUID();
        db.update(
                "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) VALUES (?, ?, 'Tin cũ', 10000, 'KET_THUC')",
                seededListing, seller.id()
        );
        db.update(
                "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai) VALUES (?, ?, ?, ?, 10000, 'HOAN_TAT')",
                tx1, seededListing, seller.id(), buyer.id()
        );
        db.update(
                "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai) VALUES (?, ?, ?, ?, 10000, 'HOAN_TAT')",
                tx2, seededListing, seller.id(), buyer.id()
        );
        db.update(
                "INSERT INTO danh_gias(ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id, so_sao, trang_thai) VALUES (?, ?, ?, ?, 5, 'CHAP_NHAN')",
                UUID.randomUUID(), tx1, buyer.id(), seller.id()
        );
        db.update(
                "INSERT INTO danh_gias(ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id, so_sao, trang_thai) VALUES (?, ?, ?, ?, 1, 'CHO_XET')",
                UUID.randomUUID(), tx2, buyer.id(), seller.id()
        );

        UUID item1 = createInventoryItem(seller.token(), "Giáo trình OOAD");
        UUID item2 = createInventoryItem(seller.token(), "Slide in màu SE100");
        UUID item3 = createInventoryItem(seller.token(), "Đèn bàn học LED");

        // 1. Single listing with textbook attrs + locationCode auto-fill
        ExtractableResponse<Response> singleRes = given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(validPublishPayload("Giáo trình OOAD UIT", 45000, List.of(item1)))
                .when()
                .post("/api/v1/listings")
                .then()
                .statusCode(201)
                .body("listing.title", equalTo("Giáo trình OOAD UIT"))
                .body("listing.priceVnd", equalTo(45000))
                .body("listing.listingType", equalTo("BAN_LE"))
                .body("listing.isCombo", equalTo(false))
                .body("listing.isFree", equalTo(false))
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("listing.categoryId", equalTo("GT_CNTT"))
                .body("listing.category.parentId", equalTo("GIAO_TRINH"))
                .body("listing.courseCode", equalTo("SE100"))
                .body("listing.author", equalTo("Khoa CNPM - UIT"))
                .body("listing.locationCode", equalTo("KTX_KHU_A"))
                .body("listing.locationName", equalTo("KTX Khu A ĐHQG-HCM"))
                .body("listing.locationText", equalTo("KTX Khu A ĐHQG-HCM"))
                .body("listing.latitude", equalTo(10.8782f))
                .body("listing.longitude", equalTo(106.8063f))
                .body("listing.itemCount", equalTo(1))
                .body("listing.items", hasSize(1))
                .body("listing.seller.displayName", equalTo("Nguyễn Văn Bán"))
                .body("listing.seller.reputationScore", equalTo(100))
                .body("listing.seller.averageRating", equalTo(5.0f))
                .body("listing.seller.reviewCount", equalTo(1))
                .body("listing.viewer.isOwner", equalTo(true))
                .body("listing.viewer.canEdit", equalTo(true))
                .body("listing.viewer.canWithdraw", equalTo(true))
                .body("listing.viewer.canDelete", equalTo(true))
                .body("listing.viewer.canPublish", equalTo(false))
                .body("listing.viewer.canRenew", equalTo(true))
                .body("listing.viewer.canMakeOffer", equalTo(false))
                .body("listing.viewer.canReserve", equalTo(false))
                .body("listing.viewer.canMessage", equalTo(false))
                .body("listing.publishedAt", notNullValue())
                .body("listing.expiresAt", notNullValue())
                .body("listing.renewalReminderDue", equalTo(false))
                .body("quota.activeCount", equalTo(1))
                .body("quota.limit", equalTo(5))
                .body("quota.remaining", equalTo(4))
                .extract();

        // NFR-01 PII check: response never exposes email, MSSV, phone, or password hash
        String singleBody = singleRes.asString();
        assertThat(singleBody)
                .doesNotContain(seller.email())
                .doesNotContain(seller.studentId())
                .doesNotContain("0901234567")
                .doesNotContain("mat_khau_hash");

        // 2. Combo listing (2 items, paid) + multi-listing sharing (item1 shared across single & combo!)
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(validPublishPayload("Combo sách + slide SE100", 70000, List.of(item1, item2)))
                .when()
                .post("/api/v1/listings")
                .then()
                .statusCode(201)
                .body("listing.listingType", equalTo("BAN_COMBO"))
                .body("listing.isCombo", equalTo(true))
                .body("listing.isFree", equalTo(false))
                .body("listing.itemCount", equalTo(2))
                .body("quota.activeCount", equalTo(2));

        // 3. Free single listing (0đ, 1 item) -> CHO_TANG
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(validPublishPayload("Tặng đèn học cũ còn sáng", 0, List.of(item3)))
                .when()
                .post("/api/v1/listings")
                .then()
                .statusCode(201)
                .body("listing.listingType", equalTo("CHO_TANG"))
                .body("listing.isCombo", equalTo(false))
                .body("listing.isFree", equalTo(true))
                .body("quota.activeCount", equalTo(3));

        // 4. Free combo listing (0đ, >=2 items) -> BAN_COMBO with isCombo=true AND isFree=true!
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(validPublishPayload("Tặng combo tài liệu SE100", 0, List.of(item1, item2, item3)))
                .when()
                .post("/api/v1/listings")
                .then()
                .statusCode(201)
                .body("listing.listingType", equalTo("BAN_COMBO"))
                .body("listing.isCombo", equalTo(true))
                .body("listing.isFree", equalTo(true))
                .body("listing.priceVnd", equalTo(0))
                .body("listing.itemCount", equalTo(3))
                .body("quota.activeCount", equalTo(4));

        // Verify do_vats.trang_thai was NEVER mutated and version incremented for shared item1 (3 listings)
        Map<String, Object> item1Row = db.queryForMap("SELECT trang_thai, version FROM do_vats WHERE ma_vat = ?", item1);
        assertThat(item1Row.get("trang_thai")).isEqualTo("KHA_DUNG");
        assertThat(((Number) item1Row.get("version")).longValue()).isEqualTo(3L);

        // 5. Draft listing (NHAP): partial fields allowed, no quota consumed, no publishedAt/expiresAt
        given()
                .auth().oauth2(seller.token())
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "action", "DRAFT",
                        "title", "Bản nháp sách đại cương"
                ))
                .when()
                .post("/api/v1/listings")
                .then()
                .statusCode(201)
                .body("listing.status", equalTo("NHAP"))
                .body("listing.priceVnd", equalTo(0))
                .body("listing.publishedAt", nullValue())
                .body("listing.expiresAt", nullValue())
                .body("listing.viewer.canPublish", equalTo(true))
                .body("listing.viewer.canWithdraw", equalTo(false))
                .body("quota.activeCount", equalTo(4));

        // 6. GET /mine lists all seller listings & filters by status
        given()
                .auth().oauth2(seller.token())
                .queryParam("status", "NHAP")
                .when()
                .get("/api/v1/listings/mine")
                .then()
                .statusCode(200)
                .body("items", hasSize(1))
                .body("items[0].title", equalTo("Bản nháp sách đại cương"))
                .body("totalElements", equalTo(1))
                .body("quota.activeCount", equalTo(4));

        given()
                .auth().oauth2(seller.token())
                .queryParam("status", "INVALID_STATUS")
                .when()
                .get("/api/v1/listings/mine")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));
    }

    @Test
    void uc10_validationOwnershipStatusAndAuthBlocks() {
        TestUser seller = createUser("Người Bán Validation", true, 100);
        TestUser otherUser = createUser("Người Khác", true, 100);
        TestUser pendingUser = createUser("Chưa Duyệt", false, 0);

        UUID sellerItem = createInventoryItem(seller.token(), "Bàn gấp sinh viên");
        UUID otherItem = createInventoryItem(otherUser.token(), "Ghế của người khác");
        UUID reservedItem = createInventoryItem(seller.token(), "Đồ đang giữ chỗ");
        db.update("UPDATE do_vats SET trang_thai = 'DANG_GIU' WHERE ma_vat = ?", reservedItem);

        // Unauthenticated -> 401
        given().when().get("/api/v1/listings/quota").then().statusCode(401);
        given().when().get("/api/v1/listings/mine").then().statusCode(401);
        given().contentType(ContentType.JSON).body(validPublishPayload("Test", 10000, List.of(sellerItem)))
                .when().post("/api/v1/listings").then().statusCode(401);

        // Pending user -> 403
        given().auth().oauth2(pendingUser.token()).when().get("/api/v1/listings/quota").then().statusCode(403);
        given().auth().oauth2(pendingUser.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Test", 10000, List.of(sellerItem)))
                .when().post("/api/v1/listings").then().statusCode(403);

        // Invalid action -> 400
        var badAction = validPublishPayload("Test", 10000, List.of(sellerItem));
        badAction.put("action", "ARCHIVE");
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(badAction)
                .post("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));

        // Negative price -> 400
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Test", -5000, List.of(sellerItem)))
                .post("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));

        // 0 images on PUBLISH -> 400
        var noImages = validPublishPayload("Test", 10000, List.of(sellerItem));
        noImages.put("images", List.of());
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(noImages)
                .post("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));

        // 6 images -> 400
        var sixImages = validPublishPayload("Test", 10000, List.of(sellerItem));
        sixImages.put("images", List.of(
                "https://img.example/1.jpg", "https://img.example/2.jpg", "https://img.example/3.jpg",
                "https://img.example/4.jpg", "https://img.example/5.jpg", "https://img.example/6.jpg"
        ));
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(sixImages)
                .post("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));

        // Invalid image URL even on DRAFT -> 400
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of("action", "DRAFT", "title", "Nháp ảnh lỗi", "images", List.of("javascript:alert(1)")))
                .post("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));

        // Unknown category -> 404 CATEGORY_NOT_FOUND
        var badCategory = validPublishPayload("Test", 10000, List.of(sellerItem));
        badCategory.put("categoryId", "KHONG_TON_TAI");
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(badCategory)
                .post("/api/v1/listings").then().statusCode(404).body("code", equalTo("CATEGORY_NOT_FOUND"));

        // Unknown locationCode -> 400 INVALID_LOCATION
        var badLoc = validPublishPayload("Test", 10000, List.of(sellerItem));
        badLoc.put("locationCode", "INVALID_ZONE");
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(badLoc)
                .post("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_LOCATION"));

        // Other user's item -> 409 ITEM_NOT_OWNED
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Test", 10000, List.of(otherItem)))
                .post("/api/v1/listings").then().statusCode(409).body("code", equalTo("ITEM_NOT_OWNED"));

        // Missing random UUID item -> 409 ITEM_NOT_OWNED
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Test", 10000, List.of(UUID.randomUUID())))
                .post("/api/v1/listings").then().statusCode(409).body("code", equalTo("ITEM_NOT_OWNED"));

        // Item in DANG_GIU status -> 409 ITEM_STATUS_CONFLICT
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Test", 10000, List.of(reservedItem)))
                .post("/api/v1/listings").then().statusCode(409).body("code", equalTo("ITEM_STATUS_CONFLICT"));

        // Locked account (BI_KHOA) -> 403 ACCOUNT_RESTRICTED
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', ly_do_han_che = 'Vi phạm' WHERE user_id = ?",
                seller.id()
        );
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Test", 10000, List.of(sellerItem)))
                .post("/api/v1/listings").then().statusCode(403).body("code", equalTo("ACCOUNT_RESTRICTED"));
    }

    @Test
    void fr05_quotaEnforcesStandard119HighTier120GiuChoAndScoreDropRules() {
        TestUser seller = createUser("Người Bán Quota", true, 100);
        UUID item = createInventoryItem(seller.token(), "Đồ dùng học tập");

        // Publish 4 CONG_KHAI listings + 1 CONG_KHAI flipped to GIU_CHO => 5/5 counted
        for (int i = 1; i <= 4; i++) {
            given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                    .body(validPublishPayload("Tin số " + i, 20000, List.of(item)))
                    .post("/api/v1/listings").then().statusCode(201);
        }
        String fifthId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin số 5 giữ chỗ", 25000, List.of(item)))
                .post("/api/v1/listings").then().statusCode(201)
                .extract().jsonPath().getString("listing.id");
        db.update("UPDATE tin_dangs SET trang_thai = 'GIU_CHO' WHERE ma_tin = ?", UUID.fromString(fifthId));

        // Insert non-counted statuses: NHAP, DA_RUT, HET_HAN, AN, KET_THUC
        for (String nonCounted : List.of("NHAP", "DA_RUT", "HET_HAN", "AN", "KET_THUC")) {
            db.update(
                    "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) VALUES (?, ?, ?, 10000, ?)",
                    UUID.randomUUID(), seller.id(), "Tin " + nonCounted, nonCounted
            );
        }

        // Quota must be strictly 5/5
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/quota")
                .then()
                .statusCode(200)
                .body("reputationScore", equalTo(100))
                .body("activeCount", equalTo(5))
                .body("limit", equalTo(5))
                .body("remaining", equalTo(0))
                .body("canPublish", equalTo(false));

        // 6th publish blocked with 409 QUOTA_EXCEEDED
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin thứ 6 bị chặn", 30000, List.of(item)))
                .post("/api/v1/listings")
                .then()
                .statusCode(409)
                .body("code", equalTo("QUOTA_EXCEEDED"));

        // Saving 6th as DRAFT (NHAP) still succeeds!
        var draftPayload = validPublishPayload("Tin thứ 6 bản nháp", 30000, List.of(item));
        draftPayload.put("action", "DRAFT");
        String draftId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(draftPayload)
                .post("/api/v1/listings")
                .then()
                .statusCode(201)
                .body("listing.status", equalTo("NHAP"))
                .extract().jsonPath().getString("listing.id");

        // Boundary 119 still limit 5
        db.update("UPDATE thanh_viens SET diem_uy_tin = 119 WHERE user_id = ?", seller.id());
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/publish", draftId)
                .then()
                .statusCode(409)
                .body("code", equalTo("QUOTA_EXCEEDED"));

        // Boundary 120 raises limit to 10 -> publishing draft succeeds (6/10) and up to 10/10
        db.update("UPDATE thanh_viens SET diem_uy_tin = 120 WHERE user_id = ?", seller.id());
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/publish", draftId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("quota.activeCount", equalTo(6))
                .body("quota.limit", equalTo(10));

        for (int i = 7; i <= 10; i++) {
            given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                    .body(validPublishPayload("Tin cao cấp " + i, 20000, List.of(item)))
                    .post("/api/v1/listings").then().statusCode(201);
        }

        // 11th blocked at 10/10
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin thứ 11", 20000, List.of(item)))
                .post("/api/v1/listings")
                .then()
                .statusCode(409)
                .body("code", equalTo("QUOTA_EXCEEDED"));

        // Score drop scenario: 125 -> 100 with 7 open listings
        TestUser dropSeller = createUser("Người Bán Giảm Điểm", true, 125);
        UUID dropItem = createInventoryItem(dropSeller.token(), "Sách ôn thi");
        String[] createdIds = new String[7];
        for (int i = 0; i < 7; i++) {
            createdIds[i] = given().auth().oauth2(dropSeller.token()).contentType(ContentType.JSON)
                    .body(validPublishPayload("Tin mở " + i, 15000, List.of(dropItem)))
                    .post("/api/v1/listings").then().statusCode(201)
                    .extract().jsonPath().getString("listing.id");
        }

        // Drop reputation score to 100
        db.update("UPDATE thanh_viens SET diem_uy_tin = 100 WHERE user_id = ?", dropSeller.id());

        // Existing 7 listings stay CONG_KHAI; quota reports 7/5, remaining=0, canPublish=false
        given().auth().oauth2(dropSeller.token())
                .get("/api/v1/listings/quota")
                .then()
                .statusCode(200)
                .body("reputationScore", equalTo(100))
                .body("activeCount", equalTo(7))
                .body("limit", equalTo(5))
                .body("remaining", equalTo(0))
                .body("canPublish", equalTo(false));

        // 8th publish blocked
        given().auth().oauth2(dropSeller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin thứ 8 bị chặn", 15000, List.of(dropItem)))
                .post("/api/v1/listings")
                .then()
                .statusCode(409)
                .body("code", equalTo("QUOTA_EXCEEDED"));

        // Editing an existing CONG_KHAI listing still succeeds even when over quota after score drop!
        var editPayload = validPublishPayload("Tin mở 0 đã sửa giá", 12000, List.of(dropItem));
        editPayload.put("action", "KEEP");
        editPayload.put("version", 0);
        given().auth().oauth2(dropSeller.token()).contentType(ContentType.JSON)
                .body(editPayload)
                .put("/api/v1/listings/{id}", createdIds[0])
                .then()
                .statusCode(200)
                .body("listing.priceVnd", equalTo(12000));

        // Withdraw 3 listings (7 -> 4 active) -> publishing 5th succeeds!
        for (int i = 1; i <= 3; i++) {
            given().auth().oauth2(dropSeller.token()).contentType(ContentType.JSON)
                    .body(Map.of("version", 0))
                    .post("/api/v1/listings/{id}/withdraw", createdIds[i])
                    .then()
                    .statusCode(200)
                    .body("listing.status", equalTo("DA_RUT"));
        }
        given().auth().oauth2(dropSeller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin mới thứ 5 sau khi rút", 18000, List.of(dropItem)))
                .post("/api/v1/listings")
                .then()
                .statusCode(201)
                .body("quota.activeCount", equalTo(5))
                .body("quota.limit", equalTo(5));
    }

    @Test
    void uc17_editSyncItemsPublishDraftOptimisticLockPendingRequestsAndGuards() {
        TestUser seller = createUser("Người Bán Sửa Tin", true, 100);
        TestUser other = createUser("Người Mua Khác", true, 100);

        UUID itemA = createInventoryItem(seller.token(), "Món A");
        UUID itemB = createInventoryItem(seller.token(), "Món B");
        UUID itemC = createInventoryItem(seller.token(), "Món C");

        // Create draft with itemA
        String draftId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of("action", "DRAFT", "title", "Nháp ban đầu", "itemIds", List.of(itemA)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        // Publish draft via PUT (action=PUBLISH) with itemA + itemB
        var publishEdit = validPublishPayload("Tin công khai sau sửa", 90000, List.of(itemA, itemB));
        publishEdit.put("action", "PUBLISH");
        publishEdit.put("version", 0);
        var publishedRes = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(publishEdit)
                .put("/api/v1/listings/{id}", draftId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("listing.listingType", equalTo("BAN_COMBO"))
                .body("listing.isCombo", equalTo(true))
                .body("listing.version", equalTo(1))
                .extract();
        String originalPublishedAt = publishedRes.jsonPath().getString("listing.publishedAt");
        String originalExpiresAt = publishedRes.jsonPath().getString("listing.expiresAt");

        long itemBVerBefore = db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemB);
        long itemCVerBefore = db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemC);

        // Add pending YEU_CAU transaction -> UC-17 Alt 2 allows edit and reports pendingRequestCount = 1
        UUID pendingTxId = UUID.randomUUID();
        db.update(
                "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai) VALUES (?, ?, ?, ?, 85000, 'YEU_CAU')",
                pendingTxId, UUID.fromString(draftId), seller.id(), other.id()
        );

        // Edit CONG_KHAI: swap itemB -> itemC, update title/price/textbook/photos
        var editBody = validPublishPayload("Tin đã sửa và đổi món", 80000, List.of(itemA, itemC));
        editBody.put("action", "KEEP");
        editBody.put("version", 1);
        editBody.put("courseCode", "IT001");
        editBody.put("images", List.of("https://cdn.example.edu.vn/new1.jpg", "https://cdn.example.edu.vn/new2.jpg"));

        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(editBody)
                .put("/api/v1/listings/{id}", draftId)
                .then()
                .statusCode(200)
                .body("listing.title", equalTo("Tin đã sửa và đổi món"))
                .body("listing.priceVnd", equalTo(80000))
                .body("listing.courseCode", equalTo("IT001"))
                .body("listing.images", hasSize(2))
                .body("listing.pendingRequestCount", equalTo(1))
                .body("listing.publishedAt", equalTo(originalPublishedAt))
                .body("listing.expiresAt", equalTo(originalExpiresAt))
                .body("listing.version", equalTo(2));

        // Both removed itemB and added itemC must have bumped do_vats.version without changing trang_thai
        assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemB))
                .isEqualTo(itemBVerBefore + 1);
        assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemC))
                .isEqualTo(itemCVerBefore + 1);
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, itemB))
                .isEqualTo("KHA_DUNG");

        // UC-17 Alt 2 / ADR §2 domain event hook fired when pendingRequestCount > 0
        assertThat(eventCapture.events())
                .hasSize(1)
                .first()
                .satisfies(evt -> {
                    assertThat(evt.listingId()).isEqualTo(UUID.fromString(draftId));
                    assertThat(evt.sellerId()).isEqualTo(seller.id());
                    assertThat(evt.pendingRequestCount()).isEqualTo(1);
                    assertThat(evt.occurredAt()).isNotNull();
                });

        // Stale version -> 409 VERSION_CONFLICT
        editBody.put("version", 1);
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(editBody)
                .put("/api/v1/listings/{id}", draftId)
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // Missing version -> 400 INVALID_INPUT
        editBody.remove("version");
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(editBody)
                .put("/api/v1/listings/{id}", draftId)
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Non-owner -> 403 FORBIDDEN
        editBody.put("version", 2);
        given().auth().oauth2(other.token()).contentType(ContentType.JSON)
                .body(editBody)
                .put("/api/v1/listings/{id}", draftId)
                .then()
                .statusCode(403)
                .body("code", equalTo("FORBIDDEN"));

        // Linked item became DANG_GIU elsewhere -> 409 ITEM_STATUS_CONFLICT
        db.update("UPDATE do_vats SET trang_thai = 'DANG_GIU' WHERE ma_vat = ?", itemC);
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(editBody)
                .put("/api/v1/listings/{id}", draftId)
                .then()
                .statusCode(409)
                .body("code", equalTo("ITEM_STATUS_CONFLICT"));
        db.update("UPDATE do_vats SET trang_thai = 'KHA_DUNG' WHERE ma_vat = ?", itemC);

        // Active transaction (GIU_CHO) blocks edit -> 409 LISTING_LOCKED
        db.update("UPDATE giao_dichs SET trang_thai = 'GIU_CHO' WHERE ma_giao_dich = ?", pendingTxId);
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(editBody)
                .put("/api/v1/listings/{id}", draftId)
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_LOCKED"));
    }

    @Test
    void uc18_withdrawUnlocksInventoryPreservesOtherItemStatusAndHardDeleteGuards() {
        TestUser seller = createUser("Người Bán Rút Xóa", true, 100);
        TestUser other = createUser("Người Lạ", true, 100);

        UUID itemA = createInventoryItem(seller.token(), "Bàn học gỗ");
        UUID itemB = createInventoryItem(seller.token(), "Ghế nhựa cao");
        UUID itemC = createInventoryItem(seller.token(), "Kệ sách mini");

        // Publish combo with itemA & itemB
        String comboId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Combo bàn + ghế", 200000, List.of(itemA, itemB)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        // P1-03 inventory locks itemA while linked to CONG_KHAI
        given().auth().oauth2(seller.token())
                .get("/api/v1/inventory/{id}", itemA)
                .then().statusCode(200)
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(false));

        // Simulate itemB being reserved via another listing (DANG_GIU)
        db.update("UPDATE do_vats SET trang_thai = 'DANG_GIU' WHERE ma_vat = ?", itemB);

        // Non-owner cannot withdraw or delete -> 403
        given().auth().oauth2(other.token()).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/withdraw", comboId)
                .then().statusCode(403);
        given().auth().oauth2(other.token())
                .delete("/api/v1/listings/{id}?version=0", comboId)
                .then().statusCode(403);

        // Missing version on DELETE -> 400 INVALID_INPUT; wrong version -> 409 VERSION_CONFLICT
        given().auth().oauth2(seller.token())
                .delete("/api/v1/listings/{id}", comboId)
                .then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().auth().oauth2(seller.token())
                .delete("/api/v1/listings/{id}?version=99", comboId)
                .then().statusCode(409).body("code", equalTo("VERSION_CONFLICT"));

        // Withdraw CONG_KHAI -> DA_RUT restores quota AND unlocks itemA in P1-03 without corrupting itemB!
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/withdraw", comboId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("DA_RUT"))
                .body("listing.closedAt", notNullValue())
                .body("quota.activeCount", equalTo(0));

        // itemB MUST still be DANG_GIU (never blindly reset!)
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, itemB))
                .isEqualTo("DANG_GIU");

        // itemA immediately unlocked in P1-03 Inventory (canEdit & canDelete = true, PUT & DELETE work!)
        long itemAVersion = given().auth().oauth2(seller.token())
                .get("/api/v1/inventory/{id}", itemA)
                .then().statusCode(200)
                .body("linkedListingCount", equalTo(0))
                .body("canEdit", equalTo(true))
                .body("canDelete", equalTo(true))
                .extract().jsonPath().getLong("version");

        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of(
                        "tinhTrang", "Đã vệ sinh sạch sẽ",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/cleaned.jpg"),
                        "version", itemAVersion
                ))
                .put("/api/v1/inventory/{id}", itemA)
                .then().statusCode(200);

        given().auth().oauth2(seller.token())
                .delete("/api/v1/inventory/{id}?version={v}", itemA, itemAVersion + 1)
                .then().statusCode(204);

        // Hard delete draft (NHAP) -> 204
        String draftId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of("action", "DRAFT", "title", "Nháp để xóa"))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");
        given().auth().oauth2(seller.token())
                .delete("/api/v1/listings/{id}?version=0", draftId)
                .then().statusCode(204);

        // Hard delete CONG_KHAI without giao_dichs -> 204 and frees itemC
        String cleanPublicId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin xóa trực tiếp", 50000, List.of(itemC)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");
        given().auth().oauth2(seller.token())
                .delete("/api/v1/listings/{id}?version=0", cleanPublicId)
                .then().statusCode(204);
        given().auth().oauth2(seller.token())
                .get("/api/v1/inventory/{id}", itemC)
                .then().statusCode(200)
                .body("canDelete", equalTo(true));

        // Hard delete with historical giao_dichs -> 409 LISTING_HAS_TRANSACTIONS
        String txListingId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin có lịch sử giao dịch", 60000, List.of(itemC)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");
        db.update(
                "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai) VALUES (?, ?, ?, ?, 60000, 'HUY')",
                UUID.randomUUID(), UUID.fromString(txListingId), seller.id(), other.id()
        );
        given().auth().oauth2(seller.token())
                .delete("/api/v1/listings/{id}?version=0", txListingId)
                .then()
                .statusCode(409)
                .body("code", equalTo("LISTING_HAS_TRANSACTIONS"));

        // GIU_CHO blocks both withdraw and delete -> 409 LISTING_LOCKED
        db.update("UPDATE tin_dangs SET trang_thai = 'GIU_CHO' WHERE ma_tin = ?", UUID.fromString(txListingId));
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/withdraw", txListingId)
                .then().statusCode(409).body("code", equalTo("LISTING_LOCKED"));
        given().auth().oauth2(seller.token())
                .delete("/api/v1/listings/{id}?version=0", txListingId)
                .then().statusCode(409).body("code", equalTo("LISTING_LOCKED"));
    }

    @Test
    void fr13_renewalReminderAt23DaysLazyExpiryAt30DaysLeavesGiuChoUntouchedAndRenewRechecksQuota() {
        TestUser seller = createUser("Người Bán FR13", true, 100);
        UUID item1 = createInventoryItem(seller.token(), "Sách Giải tích 1");
        UUID item2 = createInventoryItem(seller.token(), "Sách Giải tích 2");
        UUID item3 = createInventoryItem(seller.token(), "Sách Đại số tuyến tính");

        Instant day0 = currentTime.get();

        String listing1Id = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Giải tích 1", 30000, List.of(item1)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        String reservedListingId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Giải tích 2 đang giữ chỗ", 35000, List.of(item2)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");
        db.update("UPDATE tin_dangs SET trang_thai = 'GIU_CHO' WHERE ma_tin = ?", UUID.fromString(reservedListingId));

        // Day 0: reminder not due, renewal_reminded_at is NULL
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/mine")
                .then().statusCode(200)
                .body("items.find { it.id == '" + listing1Id + "' }.renewalReminderDue", equalTo(false));
        assertThat(db.queryForObject(
                "SELECT renewal_reminded_at FROM tin_dangs WHERE ma_tin = ?",
                Timestamp.class,
                UUID.fromString(listing1Id)
        )).isNull();

        // Advance Clock +23 days -> renewalReminderDue=true and lazily stamps renewal_reminded_at
        currentTime.set(day0.plus(23, ChronoUnit.DAYS));
        String tokenDay23 = relogin(seller);

        given().auth().oauth2(tokenDay23)
                .get("/api/v1/listings/mine")
                .then().statusCode(200)
                .body("items.find { it.id == '" + listing1Id + "' }.renewalReminderDue", equalTo(true))
                .body("items.find { it.id == '" + reservedListingId + "' }.renewalReminderDue", equalTo(false));

        Timestamp remindedAt = db.queryForObject(
                "SELECT renewal_reminded_at FROM tin_dangs WHERE ma_tin = ?",
                Timestamp.class,
                UUID.fromString(listing1Id)
        );
        assertThat(remindedAt).isNotNull();

        // Renew CONG_KHAI listing 1 -> extends +30d, increments renewalCount, clears renewal_reminded_at
        Instant expectedRenewedExpiry = currentTime.get().plus(30, ChronoUnit.DAYS);
        given().auth().oauth2(tokenDay23).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/renew", listing1Id)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("listing.renewalCount", equalTo(1))
                .body("listing.renewalReminderDue", equalTo(false))
                .body("listing.expiresAt", equalTo(expectedRenewedExpiry.toString()))
                .body("listing.version", equalTo(1));

        assertThat(db.queryForObject(
                "SELECT renewal_reminded_at FROM tin_dangs WHERE ma_tin = ?",
                Timestamp.class,
                UUID.fromString(listing1Id)
        )).isNull();

        // Publish listing 3 on day 23 (expires day 53)
        String listing3Id = given().auth().oauth2(tokenDay23).contentType(ContentType.JSON)
                .body(validPublishPayload("Đại số tuyến tính", 40000, List.of(item3)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        // Advance Clock +30 days + 1 minute from day 23 (day 53 + 1m) -> listing1 & listing3 expire; GIU_CHO stays untouched!
        currentTime.set(day0.plus(53, ChronoUnit.DAYS).plus(1, ChronoUnit.MINUTES));
        String tokenDay53 = relogin(seller);

        given().auth().oauth2(tokenDay53)
                .get("/api/v1/listings/quota")
                .then()
                .statusCode(200)
                .body("activeCount", equalTo(1))
                .body("remaining", equalTo(4));

        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, UUID.fromString(listing1Id)))
                .isEqualTo("HET_HAN");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, UUID.fromString(listing3Id)))
                .isEqualTo("HET_HAN");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, UUID.fromString(reservedListingId)))
                .isEqualTo("GIU_CHO");

        // Item 3 is now unlocked in P1-03 Inventory because listing3 is HET_HAN
        given().auth().oauth2(tokenDay53)
                .get("/api/v1/inventory/{id}", item3)
                .then().statusCode(200)
                .body("canEdit", equalTo(true))
                .body("canDelete", equalTo(true));

        // Fill remaining 4 quota slots (total 5/5 with reservedListing)
        String[] fillerIds = new String[4];
        for (int i = 0; i < 4; i++) {
            fillerIds[i] = given().auth().oauth2(tokenDay53).contentType(ContentType.JSON)
                    .body(validPublishPayload("Tin lấp chỗ " + i, 25000, List.of(item1)))
                    .post("/api/v1/listings")
                    .then().statusCode(201)
                    .extract().jsonPath().getString("listing.id");
        }

        long listing3Version = given().auth().oauth2(tokenDay53)
                .get("/api/v1/listings/mine")
                .then().statusCode(200)
                .extract().jsonPath().getLong("items.find { it.id == '" + listing3Id + "' }.version");

        // Renewing HET_HAN when quota is 5/5 must fail with 409 QUOTA_EXCEEDED
        given().auth().oauth2(tokenDay53).contentType(ContentType.JSON)
                .body(Map.of("version", listing3Version))
                .post("/api/v1/listings/{id}/renew", listing3Id)
                .then()
                .statusCode(409)
                .body("code", equalTo("QUOTA_EXCEEDED"));

        // Withdraw 1 filler -> renewing HET_HAN listing3 succeeds and restores CONG_KHAI
        given().auth().oauth2(tokenDay53).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/withdraw", fillerIds[0])
                .then().statusCode(200);

        given().auth().oauth2(tokenDay53).contentType(ContentType.JSON)
                .body(Map.of("version", listing3Version))
                .post("/api/v1/listings/{id}/renew", listing3Id)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("listing.renewalCount", equalTo(1))
                .body("listing.closedAt", nullValue())
                .body("listing.expiresAt", equalTo(currentTime.get().plus(30, ChronoUnit.DAYS).toString()))
                .body("quota.activeCount", equalTo(5));
    }

    @Test
    void fr13_directInventoryAccessAfterDay30UnlocksAndBumpsVersionAndPreservesHiddenEvidence() {
        TestUser seller = createUser("Người Bán Kho FR13", true, 100);
        UUID itemForGetPutDelete = createInventoryItem(seller.token(), "Đèn bàn hết hạn 30 ngày");
        UUID itemForDirectDelete = createInventoryItem(seller.token(), "Ghế gấp xóa thẳng sau 30 ngày");
        UUID itemOnHiddenListing = createInventoryItem(seller.token(), "Vật chứng tin bị ẩn");

        Instant day0 = currentTime.get();

        String listingAId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin A hết hạn", 40000, List.of(itemForGetPutDelete)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        String listingBId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin B hết hạn", 45000, List.of(itemForDirectDelete)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        String hiddenListingId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin vi phạm sẽ bị ẩn", 50000, List.of(itemOnHiddenListing)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");
        db.update("UPDATE tin_dangs SET trang_thai = 'AN', ly_do_an = 'Vi phạm nội quy' WHERE ma_tin = ?",
                UUID.fromString(hiddenListingId));

        // Verify locked on Day 0 (version = 1 after publish)
        assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemForGetPutDelete))
                .isEqualTo(1L);
        given().auth().oauth2(seller.token())
                .get("/api/v1/inventory/{id}", itemForGetPutDelete)
                .then().statusCode(200)
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(false));

        // Advance Clock +30 days + 1 minute WITHOUT hitting ANY listing endpoint first!
        currentTime.set(day0.plus(30, ChronoUnit.DAYS).plus(1, ChronoUnit.MINUTES));
        String tokenDay31 = relogin(seller);

        // 1. Direct GET /api/v1/inventory/{id} immediately reconciles expiry, unlocks canEdit/canDelete, and bumps do_vats.version (1 -> 2)
        given().auth().oauth2(tokenDay31)
                .get("/api/v1/inventory/{id}", itemForGetPutDelete)
                .then()
                .statusCode(200)
                .body("linkedListingCount", equalTo(0))
                .body("canEdit", equalTo(true))
                .body("canDelete", equalTo(true))
                .body("version", equalTo(2));

        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, UUID.fromString(listingAId)))
                .isEqualTo("HET_HAN");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, UUID.fromString(listingBId)))
                .isEqualTo("HET_HAN");
        assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemForGetPutDelete))
                .isEqualTo(2L);
        assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemForDirectDelete))
                .isEqualTo(2L);

        // 2. Direct PUT /api/v1/inventory/{id} with reconciled version=2 succeeds -> version=3
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of(
                        "tinhTrang", "Đã cập nhật sau khi tin hết hạn",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/updated-after-expiry.jpg"),
                        "version", 2
                ))
                .put("/api/v1/inventory/{id}", itemForGetPutDelete)
                .then()
                .statusCode(200)
                .body("version", equalTo(3));

        // 3. Direct DELETE /api/v1/inventory/{id}?version=3 succeeds -> 204
        given().auth().oauth2(tokenDay31)
                .delete("/api/v1/inventory/{id}?version=3", itemForGetPutDelete)
                .then()
                .statusCode(204);

        // 4. Direct DELETE on second expired item also succeeds
        given().auth().oauth2(tokenDay31)
                .delete("/api/v1/inventory/{id}?version=2", itemForDirectDelete)
                .then()
                .statusCode(204);

        // 5. Item linked to moderation-hidden (AN) listing MUST report canEdit=false, canDelete=false
        // in both GET /inventory & GET /inventory/{id}, and MUST block BOTH PUT and DELETE (409) to protect evidence!
        given().auth().oauth2(tokenDay31)
                .get("/api/v1/inventory")
                .then()
                .statusCode(200)
                .body("find { it.id == '" + itemOnHiddenListing + "' }.linkedListingCount", equalTo(1))
                .body("find { it.id == '" + itemOnHiddenListing + "' }.canEdit", equalTo(false))
                .body("find { it.id == '" + itemOnHiddenListing + "' }.canDelete", equalTo(false));

        given().auth().oauth2(tokenDay31)
                .get("/api/v1/inventory/{id}", itemOnHiddenListing)
                .then()
                .statusCode(200)
                .body("linkedListingCount", equalTo(1))
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(false))
                .body("linkedListings[0].trangThai", equalTo("AN"));

        long hiddenItemVersion = db.queryForObject(
                "SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemOnHiddenListing);
        given().auth().oauth2(tokenDay31)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", "Cố tình sửa bằng chứng",
                        "tinhTrang", "Sửa tình trạng",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/tampered.jpg"),
                        "version", hiddenItemVersion
                ))
                .put("/api/v1/inventory/{id}", itemOnHiddenListing)
                .then()
                .statusCode(409)
                .body("code", equalTo("ITEM_LINKED_TO_LISTING"));
        assertThat(db.queryForObject("SELECT ten FROM do_vats WHERE ma_vat = ?", String.class, itemOnHiddenListing))
                .isEqualTo("Vật chứng tin bị ẩn");

        given().auth().oauth2(tokenDay31)
                .delete("/api/v1/inventory/{id}?version={v}", itemOnHiddenListing, hiddenItemVersion)
                .then()
                .statusCode(409)
                .body("code", equalTo("ITEM_LINKED_TO_LISTING"));
        Integer evidenceLinks = db.queryForObject(
                "SELECT COUNT(*) FROM tin_dang_do_vat WHERE ma_tin = ? AND ma_vat = ?",
                Integer.class,
                UUID.fromString(hiddenListingId),
                itemOnHiddenListing
        );
        assertThat(evidenceLinks).isEqualTo(1);
    }

    @Test
    void fr13_directInventoryPutAndDeleteImmediatelyAfterDay30WithoutPriorGetAvoidsSelfInflictedVersionConflict() {
        TestUser seller = createUser("Người Bán Direct PUT DELETE", true, 100);
        UUID itemForDirectPut = createInventoryItem(seller.token(), "Quạt bàn PUT trực tiếp");
        UUID siblingComboItem = createInventoryItem(seller.token(), "Bàn học combo đi kèm");
        UUID itemForDirectDelete = createInventoryItem(seller.token(), "Đèn học DELETE trực tiếp");
        UUID itemRemainingInDeletedCombo = createInventoryItem(seller.token(), "Giá sách còn lại trong combo");

        Instant day0 = currentTime.get();

        // Publish combo 1 (itemForDirectPut + siblingComboItem) -> both items at version = 1
        String comboPutId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Combo quá hạn PUT thẳng", 150000, List.of(itemForDirectPut, siblingComboItem)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        // Advance Clock +30 days + 2 minutes WITHOUT calling ANY GET endpoint first!
        currentTime.set(day0.plus(30, ChronoUnit.DAYS).plus(2, ChronoUnit.MINUTES));
        String tokenDay31 = relogin(seller);

        // Stale version (0 instead of 1) MUST still fail with 409 VERSION_CONFLICT and roll back cleanly
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of(
                        "tinhTrang", "Phiên bản cũ bị từ chối",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/stale.jpg"),
                        "version", 0
                ))
                .put("/api/v1/inventory/{id}", itemForDirectPut)
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // Direct PUT with pre-expiry version=1 (NO prior GET!) MUST succeed -> version=2,
        // overdue combo transitioned to HET_HAN, and sibling item's version bumped (1 -> 2)
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of(
                        "tinhTrang", "Cập nhật thẳng ngay sau khi hết hạn 30 ngày",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/direct-put.jpg"),
                        "version", 1
                ))
                .put("/api/v1/inventory/{id}", itemForDirectPut)
                .then()
                .statusCode(200)
                .body("version", equalTo(2));

        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, UUID.fromString(comboPutId)))
                .isEqualTo("HET_HAN");
        assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, siblingComboItem))
                .isEqualTo(2L);

        // Now test direct DELETE without prior GET on a second combo after another 30 days
        Instant day31 = currentTime.get();
        String comboDeleteId = given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(validPublishPayload("Combo quá hạn DELETE thẳng", 120000, List.of(itemForDirectDelete, itemRemainingInDeletedCombo)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");
        // Both items now at version = 1
        assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemForDirectDelete))
                .isEqualTo(1L);

        currentTime.set(day31.plus(30, ChronoUnit.DAYS).plus(2, ChronoUnit.MINUTES));
        String tokenDay61 = relogin(seller);

        // Stale version=0 on direct DELETE -> 409 VERSION_CONFLICT
        given().auth().oauth2(tokenDay61)
                .delete("/api/v1/inventory/{id}?version=0", itemForDirectDelete)
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // Direct DELETE with pre-expiry version=1 (NO prior GET!) MUST succeed -> 204!
        given().auth().oauth2(tokenDay61)
                .delete("/api/v1/inventory/{id}?version=1", itemForDirectDelete)
                .then()
                .statusCode(204);

        // Verify comboDeleteId became HET_HAN, recomputed hinh_thuc -> BAN_LE, AND bumped version (0 -> 1 expiry -> 2 detach)!
        Map<String, Object> comboAfterDelete = db.queryForMap(
                "SELECT trang_thai, hinh_thuc, version FROM tin_dangs WHERE ma_tin = ?",
                UUID.fromString(comboDeleteId)
        );
        assertThat(comboAfterDelete.get("trang_thai")).isEqualTo("HET_HAN");
        assertThat(comboAfterDelete.get("hinh_thuc")).isEqualTo("BAN_LE");
        assertThat(((Number) comboAfterDelete.get("version")).longValue()).isEqualTo(2L);
        assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemRemainingInDeletedCombo))
                .isEqualTo(2L);
    }

    @Test
    void fr13_putKeepOnOverduePublicReconcilesToHetHanAndStaleWithdrawRenewReturnVersionConflict() {
        TestUser seller = createUser("Người Bán Overdue Keep", true, 100);
        UUID overdueItem = createInventoryItem(seller.token(), "Sách quá hạn KEEP");
        UUID retryItem = createInventoryItem(seller.token(), "Sách kiểm thử retry version");

        Instant day0 = currentTime.get();

        // Publish listing 1 (will become overdue CONG_KHAI)
        String overdueId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin quá hạn chờ PUT KEEP", 65000, List.of(overdueItem)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        // Verify ListingAssembler coordinate fallback when t.vi_do/t.kinh_do are NULL on a SQL-seeded row
        db.update("UPDATE tin_dangs SET vi_do = NULL, kinh_do = NULL, ma_khu_vuc = 'UIT' WHERE ma_tin = ?",
                UUID.fromString(overdueId));
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/mine")
                .then().statusCode(200)
                .body("items.find { it.id == '" + overdueId + "' }.latitude", equalTo(10.87f))
                .body("items.find { it.id == '" + overdueId + "' }.longitude", equalTo(106.8031f));

        // Advance Clock +30 days + 1 minute WITHOUT hitting any other endpoint first
        currentTime.set(day0.plus(30, ChronoUnit.DAYS).plus(1, ChronoUnit.MINUTES));
        String tokenDay31 = relogin(seller);

        // PUT KEEP on overdue CONG_KHAI MUST NOT remain CONG_KHAI — reconciles to HET_HAN & bumps do_vats.version
        var keepBody = validPublishPayload("Tin quá hạn đã sửa tiêu đề", 55000, List.of(overdueItem));
        keepBody.put("action", "KEEP");
        keepBody.put("version", 0);
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(keepBody)
                .put("/api/v1/listings/{id}", overdueId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("HET_HAN"))
                .body("listing.closedAt", notNullValue())
                .body("listing.version", equalTo(1))
                .body("quota.activeCount", equalTo(0));

        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, UUID.fromString(overdueId)))
                .isEqualTo("HET_HAN");
        assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, overdueItem))
                .isEqualTo(2L);

        // Stale-version retry checks on POST /renew and POST /withdraw -> 409 VERSION_CONFLICT
        String retryId = given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin kiểm thử stale version", 50000, List.of(retryItem)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        // Renew v0 -> v1 succeeds
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/renew", retryId)
                .then().statusCode(200)
                .body("listing.version", equalTo(1));

        // Retry POST /renew with stale v0 -> 409 VERSION_CONFLICT
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/renew", retryId)
                .then().statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // POST /withdraw with stale v0 -> 409 VERSION_CONFLICT
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/withdraw", retryId)
                .then().statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // POST /withdraw with current v1 -> 200 OK (DA_RUT)
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of("version", 1))
                .post("/api/v1/listings/{id}/withdraw", retryId)
                .then().statusCode(200)
                .body("listing.status", equalTo("DA_RUT"))
                .body("listing.version", equalTo(2));
    }

    @Test
    void fr13_directRenewOnOverduePublicAndComboTypeRecomputationAfterInventoryDeletion() {
        TestUser seller = createUser("Người Bán Renew Audit", true, 100);
        UUID itemA = createInventoryItem(seller.token(), "Giáo trình Mạng máy tính");
        UUID itemB = createInventoryItem(seller.token(), "Sách bài tập Mạng máy tính");
        UUID itemFreeA = createInventoryItem(seller.token(), "Đèn bàn học cũ");
        UUID itemFreeB = createInventoryItem(seller.token(), "Kệ nhựa nhỏ");
        UUID itemOverdue = createInventoryItem(seller.token(), "Quạt mini quá hạn");
        UUID itemFiller = createInventoryItem(seller.token(), "Bình giữ nhiệt");

        Instant day0 = currentTime.get();

        // 1. Publish an overdue CONG_KHAI listing (v0)
        String overdueDirectRenewId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Quạt mini quá hạn gia hạn thẳng", 75000, List.of(itemOverdue)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        // 2. Publish paid combo (2 items) and free combo (2 items, 0đ)
        String paidComboId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Combo sách Mạng máy tính", 95000, List.of(itemA, itemB)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .body("listing.listingType", equalTo("BAN_COMBO"))
                .body("listing.isCombo", equalTo(true))
                .extract().jsonPath().getString("listing.id");

        String freeComboId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(validPublishPayload("Combo tặng đèn + kệ", 0, List.of(itemFreeA, itemFreeB)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .body("listing.listingType", equalTo("BAN_COMBO"))
                .body("listing.isCombo", equalTo(true))
                .body("listing.isFree", equalTo(true))
                .extract().jsonPath().getString("listing.id");

        // Advance Clock +30 days + 5 minutes WITHOUT hitting any reconciliation endpoint first
        currentTime.set(day0.plus(30, ChronoUnit.DAYS).plus(5, ChronoUnit.MINUTES));
        String tokenDay31 = relogin(seller);

        // Direct POST /renew with current version=0 on overdue CONG_KHAI MUST succeed (no self-inflicted 409 VERSION_CONFLICT)
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/renew", overdueDirectRenewId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("listing.renewalCount", equalTo(1))
                .body("listing.version", equalTo(1))
                .body("listing.expiresAt", equalTo(currentTime.get().plus(30, ChronoUnit.DAYS).toString()))
                .body("quota.activeCount", equalTo(1));

        // The other 2 overdue combos were reconciled to HET_HAN cleanly
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, UUID.fromString(paidComboId)))
                .isEqualTo("HET_HAN");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, UUID.fromString(freeComboId)))
                .isEqualTo("HET_HAN");

        // Delete 1 component item from each HET_HAN combo in P1-03 Inventory -> only 1 item remains linked
        long itemBVersion = given().auth().oauth2(tokenDay31)
                .get("/api/v1/inventory/{id}", itemB)
                .then().statusCode(200)
                .body("canDelete", equalTo(true))
                .extract().jsonPath().getLong("version");
        given().auth().oauth2(tokenDay31)
                .delete("/api/v1/inventory/{id}?version={v}", itemB, itemBVersion)
                .then().statusCode(204);

        long itemFreeBVersion = given().auth().oauth2(tokenDay31)
                .get("/api/v1/inventory/{id}", itemFreeB)
                .then().statusCode(200)
                .body("canDelete", equalTo(true))
                .extract().jsonPath().getLong("version");
        given().auth().oauth2(tokenDay31)
                .delete("/api/v1/inventory/{id}?version={v}", itemFreeB, itemFreeBVersion)
                .then().statusCode(204);

        // Immediately after Inventory deletion (even BEFORE /renew), HET_HAN combo listings must NOT report stale BAN_COMBO / isCombo=true
        // AND tin_dangs.version must have bumped (1 -> 2) so stale concurrent mutations get 409 VERSION_CONFLICT
        given().auth().oauth2(tokenDay31)
                .get("/api/v1/listings/{id}", paidComboId)
                .then()
                .statusCode(200)
                .body("status", equalTo("HET_HAN"))
                .body("listingType", equalTo("BAN_LE"))
                .body("isCombo", equalTo(false))
                .body("itemCount", equalTo(1))
                .body("version", equalTo(2));

        given().auth().oauth2(tokenDay31)
                .get("/api/v1/listings/{id}", freeComboId)
                .then()
                .statusCode(200)
                .body("status", equalTo("HET_HAN"))
                .body("listingType", equalTo("CHO_TANG"))
                .body("isCombo", equalTo(false))
                .body("isFree", equalTo(true))
                .body("itemCount", equalTo(1))
                .body("version", equalTo(2));

        // Stale version=1 (before item detachment) MUST be rejected with 409 VERSION_CONFLICT
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of("version", 1))
                .post("/api/v1/listings/{id}/renew", paidComboId)
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));

        // Renewing paidComboId (now 1 item, version=2) MUST recompute listingType -> BAN_LE & isCombo -> false
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of("version", 2))
                .post("/api/v1/listings/{id}/renew", paidComboId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("listing.listingType", equalTo("BAN_LE"))
                .body("listing.isCombo", equalTo(false))
                .body("listing.itemCount", equalTo(1))
                .body("listing.renewalCount", equalTo(1))
                .body("listing.version", equalTo(3));

        // Renewing freeComboId (now 1 item, price 0, version=2) MUST recompute listingType -> CHO_TANG & isCombo -> false
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of("version", 2))
                .post("/api/v1/listings/{id}/renew", freeComboId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("listing.listingType", equalTo("CHO_TANG"))
                .body("listing.isCombo", equalTo(false))
                .body("listing.isFree", equalTo(true))
                .body("listing.itemCount", equalTo(1))
                .body("listing.renewalCount", equalTo(1))
                .body("listing.version", equalTo(3));

        // Overdue CONG_KHAI direct renew MUST still enforce FR-05 quota when 5/5 slots are taken
        // Publish 2 more listings on day 31 (total 5/5: overdueDirectRenewId, paidComboId, freeComboId + 2 fillers)
        for (int i = 0; i < 2; i++) {
            given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                    .body(validPublishPayload("Tin lấp chỗ renew " + i, 20000, List.of(itemFiller)))
                    .post("/api/v1/listings")
                    .then().statusCode(201);
        }
        // Make overdueDirectRenewId overdue via DB while keeping 5 other active listings (push another active via DB to 5 active + 1 overdue)
        db.update(
                "UPDATE tin_dangs SET expires_at = ? WHERE ma_tin = ?",
                Timestamp.from(currentTime.get().minus(1, ChronoUnit.MINUTES)),
                UUID.fromString(overdueDirectRenewId)
        );
        // Fill the newly freed 5th slot so activeCount = 5 excluding overdueDirectRenewId
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(validPublishPayload("Tin chiếm suất thứ 5", 20000, List.of(itemFiller)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .body("quota.activeCount", equalTo(5));

        // Direct renew on overdueDirectRenewId (version 2 after reconciliation by filler create, or let's reset to overdue CONG_KHAI v1)
        db.update(
                "UPDATE tin_dangs SET trang_thai = 'CONG_KHAI', closed_at = NULL, expires_at = ?, version = 1 WHERE ma_tin = ?",
                Timestamp.from(currentTime.get().minus(1, ChronoUnit.MINUTES)),
                UUID.fromString(overdueDirectRenewId)
        );
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of("version", 1))
                .post("/api/v1/listings/{id}/renew", overdueDirectRenewId)
                .then()
                .statusCode(409)
                .body("code", equalTo("QUOTA_EXCEEDED"));

        // Free 1 quota slot (withdraw paidComboId, currently at version=3), then set overdueDirectRenewId back to overdue CONG_KHAI v1
        // and reopen via PUT(action=PUBLISH) -> must bump do_vats.version (NFR-02)
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(Map.of("version", 3))
                .post("/api/v1/listings/{id}/withdraw", paidComboId)
                .then().statusCode(200);

        db.update(
                "UPDATE tin_dangs SET trang_thai = 'CONG_KHAI', closed_at = NULL, expires_at = ?, version = 1 WHERE ma_tin = ?",
                Timestamp.from(currentTime.get().minus(1, ChronoUnit.MINUTES)),
                UUID.fromString(overdueDirectRenewId)
        );
        long itemOverdueVersionBefore = db.queryForObject(
                "SELECT version FROM do_vats WHERE ma_vat = ?",
                Long.class,
                itemOverdue
        );
        var republishOverdueBody = validPublishPayload("Quạt mini quá hạn mở lại bằng PUT PUBLISH", 70000, List.of(itemOverdue));
        republishOverdueBody.put("action", "PUBLISH");
        republishOverdueBody.put("version", 1);
        given().auth().oauth2(tokenDay31).contentType(ContentType.JSON)
                .body(republishOverdueBody)
                .put("/api/v1/listings/{id}", overdueDirectRenewId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CONG_KHAI"))
                .body("listing.version", equalTo(2));

        long itemOverdueVersionAfter = db.queryForObject(
                "SELECT version FROM do_vats WHERE ma_vat = ?",
                Long.class,
                itemOverdue
        );
        assertThat(itemOverdueVersionAfter).isGreaterThan(itemOverdueVersionBefore);
    }
}
