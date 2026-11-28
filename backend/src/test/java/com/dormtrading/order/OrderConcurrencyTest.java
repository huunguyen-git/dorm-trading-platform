package com.dormtrading.order;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

/**
 * Real PostgreSQL 16 concurrency & deadlock-freedom verification for P2-04 & P2-05
 * (FR-08, NFR-02, UC-23 E2/E3, UC-24, UC-26 E3).
 */
class OrderConcurrencyTest extends BaseIntegrationTest {

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

    private record Account(UUID id, String token) {
    }

    private record Outcome(int status, String code) {
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

    private Account createActiveAccount(String prefix) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "OC" + suffix;
        String email = prefix + "_" + suffix + "@student.edu.vn";
        String ip = "10.7." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register("Concurrent " + prefix + " " + suffix, studentId, email, PASSWORD, ip);
        delivery.deliver();
        String code = otpCodes.get(email);
        var challenge = db.queryForMap(
                "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                email
        );
        auth.verify((UUID) challenge.get("id"), email, "REGISTER", code, ip);
        db.update(
                "UPDATE thanh_viens SET profile_approved = TRUE, trang_thai_tai_khoan = 'HOAT_DONG', diem_uy_tin = 100 WHERE email = ?",
                email
        );
        UUID userId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email);
        String token = auth.login(email, PASSWORD, "mobile", ip).token();
        return new Account(userId, token);
    }

    private UUID createItem(String token, String name) {
        String id = given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", name,
                        "tinhTrang", "Mới 95%",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/occ/" + UUID.randomUUID() + ".jpg")
                ))
                .post("/api/v1/inventory")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");
        return UUID.fromString(id);
    }

    private UUID publishListing(String token, String title, List<UUID> itemIds) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("action", "PUBLISH");
        body.put("title", title);
        body.put("description", "Kiểm thử tranh chấp giữ chỗ đồng thời");
        body.put("condition", "Tốt");
        body.put("priceVnd", 100000);
        body.put("categoryId", "DO_GIA_DUNG");
        body.put("locationCode", "KTX_KHU_A");
        body.put("locationText", "Sảnh KTX");
        body.put("images", List.of("https://cdn.example.edu.vn/occ/l-" + UUID.randomUUID() + ".jpg"));
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

    private UUID requestReservation(String buyerToken, UUID listingId) {
        String id = given()
                .auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("listingId", listingId.toString()))
                .post("/api/v1/orders")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");
        return UUID.fromString(id);
    }

    private List<Outcome> runSimultaneously(List<Callable<Outcome>> tasks) throws Exception {
        CountDownLatch ready = new CountDownLatch(tasks.size());
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        try {
            List<Future<Outcome>> futures = new ArrayList<>();
            for (Callable<Outcome> task : tasks) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    if (!start.await(10, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("Barrier timeout");
                    }
                    return task.call();
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<Outcome> outcomes = new ArrayList<>();
            for (Future<Outcome> future : futures) {
                outcomes.add(future.get(30, TimeUnit.SECONDS));
            }
            return outcomes;
        } finally {
            pool.shutdownNow();
        }
    }

    private Outcome postAction(String token, String path, Map<String, Object> body) {
        Response response = given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(body)
                .post(path);
        String code = null;
        if (response.statusCode() >= 400) {
            try {
                code = response.jsonPath().getString("code");
            } catch (Exception ignored) {
                code = null;
            }
        }
        return new Outcome(response.statusCode(), code);
    }

    @Test
    void concurrentAcceptOnSameListingAllowsExactlyOneReservation() throws Exception {
        Account seller = createActiveAccount("s1");
        Account buyer1 = createActiveAccount("b1");
        Account buyer2 = createActiveAccount("b2");

        UUID item = createItem(seller.token(), "Ghế xoay học tập");
        UUID listing = publishListing(seller.token(), "Ghế xoay KTX", List.of(item));

        UUID order1 = requestReservation(buyer1.token(), listing);
        UUID order2 = requestReservation(buyer2.token(), listing);

        List<Outcome> outcomes = runSimultaneously(List.of(
                () -> postAction(seller.token(), "/api/v1/orders/" + order1 + "/accept", Map.of()),
                () -> postAction(seller.token(), "/api/v1/orders/" + order2 + "/accept", Map.of())
        ));

        long successCount = outcomes.stream().filter(o -> o.status() == 200).count();
        long conflictCount = outcomes.stream().filter(o -> o.status() == 409).count();
        assertThat(successCount).isEqualTo(1);
        assertThat(conflictCount).isEqualTo(1);

        Integer activeOrders = db.queryForObject(
                "SELECT COUNT(*) FROM giao_dichs WHERE ma_tin = ? AND trang_thai = 'GIU_CHO'",
                Integer.class,
                listing
        );
        assertThat(activeOrders).isEqualTo(1);
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, item))
                .isEqualTo("DANG_GIU");
    }

    @Test
    void concurrentAcceptAcrossSharedItemListingsPreventsDoubleHoldAndPartialComboLock() throws Exception {
        Account seller = createActiveAccount("s2");
        Account buyerSingle = createActiveAccount("bs");
        Account buyerCombo = createActiveAccount("bc");

        UUID sharedItem = createItem(seller.token(), "Màn hình 24 inch");
        UUID comboExtraItem = createItem(seller.token(), "Arm treo màn hình");

        UUID singleListing = publishListing(seller.token(), "Bán lẻ màn hình 24 inch", List.of(sharedItem));
        UUID comboListing = publishListing(seller.token(), "Combo màn hình + arm", List.of(sharedItem, comboExtraItem));

        UUID singleOrder = requestReservation(buyerSingle.token(), singleListing);
        UUID comboOrder = requestReservation(buyerCombo.token(), comboListing);

        List<Outcome> outcomes = runSimultaneously(List.of(
                () -> postAction(seller.token(), "/api/v1/orders/" + singleOrder + "/accept", Map.of()),
                () -> postAction(seller.token(), "/api/v1/orders/" + comboOrder + "/accept", Map.of())
        ));

        long successCount = outcomes.stream().filter(o -> o.status() == 200).count();
        long conflictCount = outcomes.stream().filter(o -> o.status() == 409).count();
        assertThat(successCount).isEqualTo(1);
        assertThat(conflictCount).isEqualTo(1);

        // Exactly 1 active hold exists for sharedItem in giao_dich_do_vat (FR-08 / NFR-02)
        Integer activeHoldsOnShared = db.queryForObject(
                "SELECT COUNT(*) FROM giao_dich_do_vat WHERE ma_vat = ? AND giu_hieu_luc = TRUE",
                Integer.class,
                sharedItem
        );
        assertThat(activeHoldsOnShared).isEqualTo(1);

        String singleOrderStatus = db.queryForObject(
                "SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, singleOrder);
        String comboOrderStatus = db.queryForObject(
                "SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, comboOrder);
        String extraItemStatus = db.queryForObject(
                "SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, comboExtraItem);

        if ("GIU_CHO".equals(singleOrderStatus)) {
            assertThat(comboOrderStatus).isEqualTo("YEU_CAU");
            // Combo was rejected atomically -> extra item MUST remain KHA_DUNG (no partial combo lock!)
            assertThat(extraItemStatus).isEqualTo("KHA_DUNG");
        } else {
            assertThat(comboOrderStatus).isEqualTo("GIU_CHO");
            assertThat(singleOrderStatus).isEqualTo("YEU_CAU");
            // Combo won -> BOTH items are DANG_GIU
            assertThat(extraItemStatus).isEqualTo("DANG_GIU");
        }
    }

    @Test
    void concurrentStartDeliveryAndBuyerCancelMaintainsConsistentStateWithoutDeadlock() throws Exception {
        Account seller = createActiveAccount("s3");
        Account buyer = createActiveAccount("b3");

        UUID item = createItem(seller.token(), "Bàn phím cơ");
        UUID listing = publishListing(seller.token(), "Bàn phím cơ cũ", List.of(item));
        UUID orderId = requestReservation(buyer.token(), listing);

        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept").then().statusCode(200);

        Instant time = Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        String proposalId = given().auth().oauth2(buyer.token()).contentType(ContentType.JSON)
                .body(Map.of("proposedTime", time.toString(), "proposedLocation", "Cổng KTX A"))
                .post("/api/v1/orders/" + orderId + "/schedules")
                .then().statusCode(201).extract().jsonPath().getString("pendingScheduleProposal.id");

        given().auth().oauth2(seller.token())
                .post("/api/v1/orders/" + orderId + "/schedules/" + proposalId + "/confirm")
                .then().statusCode(200);

        List<Outcome> outcomes = runSimultaneously(List.of(
                () -> postAction(seller.token(), "/api/v1/orders/" + orderId + "/start-delivery", Map.of()),
                () -> postAction(buyer.token(), "/api/v1/orders/" + orderId + "/cancel", Map.of("reason", "Hủy gấp"))
        ));

        // Zero 500s / zero deadlocks
        assertThat(outcomes).allSatisfy(o -> assertThat(o.status()).isIn(200, 409));

        String finalOrderStatus = db.queryForObject(
                "SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, orderId);
        String finalItemStatus = db.queryForObject(
                "SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, item);
        String finalListingStatus = db.queryForObject(
                "SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listing);

        // Either cancel happened after start-delivery (both 200 -> final HUY + KHA_DUNG + CONG_KHAI)
        // or cancel happened before start-delivery (cancel 200, start-delivery 409 -> final HUY + KHA_DUNG + CONG_KHAI)
        assertThat(finalOrderStatus).isEqualTo("HUY");
        assertThat(finalItemStatus).isEqualTo("KHA_DUNG");
        assertThat(finalListingStatus).isEqualTo("CONG_KHAI");
    }

    @Test
    void concurrentAcceptAndSellerListingUpdateNeverDeadlocks() throws Exception {
        Account seller = createActiveAccount("s4");
        Account buyer = createActiveAccount("b4");

        UUID item = createItem(seller.token(), "Tai nghe chụp tai");
        UUID listing = publishListing(seller.token(), "Tai nghe học online", List.of(item));
        UUID orderId = requestReservation(buyer.token(), listing);

        Map<String, Object> updatePayload = new LinkedHashMap<>();
        updatePayload.put("action", "KEEP");
        updatePayload.put("version", 0);
        updatePayload.put("title", "Tai nghe học online (cập nhật)");
        updatePayload.put("description", "Cập nhật mô tả");
        updatePayload.put("condition", "Tốt");
        updatePayload.put("priceVnd", 95000);
        updatePayload.put("categoryId", "DO_GIA_DUNG");
        updatePayload.put("locationCode", "KTX_KHU_A");
        updatePayload.put("locationText", "Sảnh A");
        updatePayload.put("images", List.of("https://cdn.example.edu.vn/occ/u.jpg"));
        updatePayload.put("itemIds", List.of(item.toString()));

        List<Outcome> outcomes = runSimultaneously(List.of(
                () -> postAction(seller.token(), "/api/v1/orders/" + orderId + "/accept", Map.of()),
                () -> {
                    Response resp = given()
                            .auth().oauth2(seller.token())
                            .contentType(ContentType.JSON)
                            .body(updatePayload)
                            .put("/api/v1/listings/" + listing);
                    String code = resp.statusCode() >= 400 ? resp.jsonPath().getString("code") : null;
                    return new Outcome(resp.statusCode(), code);
                }
        ));

        // Zero 500s / zero deadlocks; accept always succeeds (either before or after update)
        assertThat(outcomes).allSatisfy(o -> assertThat(o.status()).isIn(200, 409));
        assertThat(outcomes.getFirst().status()).isEqualTo(200);
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listing))
                .isEqualTo("GIU_CHO");
    }

    @Test
    void concurrentBuyerScheduleOpsAndSellerDeliveryOrCancelNeverDeadlocks() throws Exception {
        Account seller = createActiveAccount("s5");
        Account buyer = createActiveAccount("b5");

        Instant baseTime = Instant.now().plus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);

        // (1) Buyer proposeSchedule vs Seller startDelivery (with pre-confirmed schedule)
        UUID item1 = createItem(seller.token(), "Bàn học gấp race 1");
        UUID listing1 = publishListing(seller.token(), "Bàn học gấp 1", List.of(item1));
        UUID order1 = requestReservation(buyer.token(), listing1);
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + order1 + "/accept").then().statusCode(200);
        String p1 = given().auth().oauth2(buyer.token()).contentType(ContentType.JSON)
                .body(Map.of("proposedTime", baseTime.toString(), "proposedLocation", "Sảnh A1"))
                .post("/api/v1/orders/" + order1 + "/schedules")
                .then().statusCode(201).extract().jsonPath().getString("pendingScheduleProposal.id");
        given().auth().oauth2(seller.token())
                .post("/api/v1/orders/" + order1 + "/schedules/" + p1 + "/confirm").then().statusCode(200);

        List<Outcome> raceProposeVsStart = runSimultaneously(List.of(
                () -> postAction(buyer.token(), "/api/v1/orders/" + order1 + "/schedules", Map.of(
                        "proposedTime", baseTime.plus(4, ChronoUnit.HOURS).toString(),
                        "proposedLocation", "Cổng KTX A"
                )),
                () -> postAction(seller.token(), "/api/v1/orders/" + order1 + "/start-delivery", Map.of())
        ));
        assertThat(raceProposeVsStart).allSatisfy(o -> assertThat(o.status()).isIn(200, 201, 409));
        assertThat(db.queryForObject("SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, order1))
                .isEqualTo("DANG_GIAO");

        // (2) Buyer proposeSchedule vs Seller cancelReservation
        UUID item2 = createItem(seller.token(), "Ghế gấp race 2");
        UUID listing2 = publishListing(seller.token(), "Ghế gấp 2", List.of(item2));
        UUID order2 = requestReservation(buyer.token(), listing2);
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + order2 + "/accept").then().statusCode(200);

        List<Outcome> raceProposeVsCancel = runSimultaneously(List.of(
                () -> postAction(buyer.token(), "/api/v1/orders/" + order2 + "/schedules", Map.of(
                        "proposedTime", baseTime.plus(6, ChronoUnit.HOURS).toString(),
                        "proposedLocation", "Sảnh B2"
                )),
                () -> postAction(seller.token(), "/api/v1/orders/" + order2 + "/cancel", Map.of("reason", "Hủy đồng thời"))
        ));
        assertThat(raceProposeVsCancel).allSatisfy(o -> assertThat(o.status()).isIn(200, 201, 409));
        assertThat(db.queryForObject("SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, order2))
                .isEqualTo("HUY");
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, item2))
                .isEqualTo("KHA_DUNG");

        // (3) Buyer confirmSchedule vs Seller cancelReservation
        UUID item3 = createItem(seller.token(), "Đèn bàn race 3");
        UUID listing3 = publishListing(seller.token(), "Đèn bàn 3", List.of(item3));
        UUID order3 = requestReservation(buyer.token(), listing3);
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + order3 + "/accept").then().statusCode(200);
        String sellerProp3 = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of("proposedTime", baseTime.plus(8, ChronoUnit.HOURS).toString(), "proposedLocation", "Cổng UIT"))
                .post("/api/v1/orders/" + order3 + "/schedules")
                .then().statusCode(201).extract().jsonPath().getString("pendingScheduleProposal.id");

        List<Outcome> raceConfirmVsCancel = runSimultaneously(List.of(
                () -> postAction(buyer.token(), "/api/v1/orders/" + order3 + "/schedules/" + sellerProp3 + "/confirm", Map.of()),
                () -> postAction(seller.token(), "/api/v1/orders/" + order3 + "/cancel", Map.of("reason", "Hủy khi người mua xác nhận"))
        ));
        assertThat(raceConfirmVsCancel).allSatisfy(o -> assertThat(o.status()).isIn(200, 409));
        assertThat(db.queryForObject("SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, order3))
                .isEqualTo("HUY");

        // (4) Buyer rejectSchedule vs Seller startDelivery (with pre-confirmed schedule + seller reschedule proposal)
        UUID item4 = createItem(seller.token(), "Bình giữ nhiệt race 4");
        UUID listing4 = publishListing(seller.token(), "Bình giữ nhiệt 4", List.of(item4));
        UUID order4 = requestReservation(buyer.token(), listing4);
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + order4 + "/accept").then().statusCode(200);
        String initProp4 = given().auth().oauth2(buyer.token()).contentType(ContentType.JSON)
                .body(Map.of("proposedTime", baseTime.toString(), "proposedLocation", "Thư viện ĐHQG"))
                .post("/api/v1/orders/" + order4 + "/schedules")
                .then().statusCode(201).extract().jsonPath().getString("pendingScheduleProposal.id");
        given().auth().oauth2(seller.token())
                .post("/api/v1/orders/" + order4 + "/schedules/" + initProp4 + "/confirm").then().statusCode(200);
        String sellerResched4 = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of("proposedTime", baseTime.plus(10, ChronoUnit.HOURS).toString(), "proposedLocation", "Nhà Văn hóa SV"))
                .post("/api/v1/orders/" + order4 + "/schedules")
                .then().statusCode(201).extract().jsonPath().getString("pendingScheduleProposal.id");

        List<Outcome> raceRejectVsStart = runSimultaneously(List.of(
                () -> postAction(buyer.token(), "/api/v1/orders/" + order4 + "/schedules/" + sellerResched4 + "/reject", Map.of("reason", "Giữ lịch cũ")),
                () -> postAction(seller.token(), "/api/v1/orders/" + order4 + "/start-delivery", Map.of())
        ));
        assertThat(raceRejectVsStart).allSatisfy(o -> assertThat(o.status()).isIn(200, 409));
        assertThat(db.queryForObject("SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, order4))
                .isEqualTo("DANG_GIAO");

        // (5) Buyer confirmSchedule vs Seller startDelivery (reschedule confirm racing with start-delivery)
        UUID item5 = createItem(seller.token(), "Quạt mini race 5");
        UUID listing5 = publishListing(seller.token(), "Quạt mini 5", List.of(item5));
        UUID order5 = requestReservation(buyer.token(), listing5);
        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + order5 + "/accept").then().statusCode(200);
        String initProp5 = given().auth().oauth2(buyer.token()).contentType(ContentType.JSON)
                .body(Map.of("proposedTime", baseTime.toString(), "proposedLocation", "Cổng KTX B"))
                .post("/api/v1/orders/" + order5 + "/schedules")
                .then().statusCode(201).extract().jsonPath().getString("pendingScheduleProposal.id");
        given().auth().oauth2(seller.token())
                .post("/api/v1/orders/" + order5 + "/schedules/" + initProp5 + "/confirm").then().statusCode(200);
        String sellerResched5 = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of("proposedTime", baseTime.plus(12, ChronoUnit.HOURS).toString(), "proposedLocation", "Sảnh tòa C UIT"))
                .post("/api/v1/orders/" + order5 + "/schedules")
                .then().statusCode(201).extract().jsonPath().getString("pendingScheduleProposal.id");

        List<Outcome> raceConfirmVsStart = runSimultaneously(List.of(
                () -> postAction(buyer.token(), "/api/v1/orders/" + order5 + "/schedules/" + sellerResched5 + "/confirm", Map.of()),
                () -> postAction(seller.token(), "/api/v1/orders/" + order5 + "/start-delivery", Map.of())
        ));
        assertThat(raceConfirmVsStart).allSatisfy(o -> assertThat(o.status()).isIn(200, 409));
        assertThat(db.queryForObject("SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, order5))
                .isEqualTo("DANG_GIAO");
    }

    @Test
    void concurrentBuyerCreateRequestAndSellerOrderOrListingMutationsNeverDeadlocks() throws Exception {
        Account seller = createActiveAccount("s6");
        Account buyer1 = createActiveAccount("b6a");
        Account buyer2 = createActiveAccount("b6b");
        Account buyer3 = createActiveAccount("b6c");

        Instant baseTime = Instant.now().plus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);

        // (1) Buyer2 createReservationRequest vs Seller acceptReservation (same listing & same seller)
        UUID item1 = createItem(seller.token(), "Balo sinh viên race 1");
        UUID listing1 = publishListing(seller.token(), "Balo race accept", List.of(item1));
        UUID order1 = requestReservation(buyer1.token(), listing1);

        List<Outcome> raceCreateVsAccept = runSimultaneously(List.of(
                () -> postAction(buyer2.token(), "/api/v1/orders", Map.of("listingId", listing1.toString())),
                () -> postAction(seller.token(), "/api/v1/orders/" + order1 + "/accept", Map.of())
        ));
        assertThat(raceCreateVsAccept).allSatisfy(o -> assertThat(o.status()).isIn(200, 201, 409));
        assertThat(raceCreateVsAccept.get(1).status()).isEqualTo(200);
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, listing1))
                .isEqualTo("GIU_CHO");

        // (2) Buyer2 createReservationRequest vs Seller rejectReservation (same listing & same seller)
        UUID item2 = createItem(seller.token(), "Tai nghe race 2");
        UUID listing2 = publishListing(seller.token(), "Tai nghe race reject", List.of(item2));
        UUID order2 = requestReservation(buyer1.token(), listing2);

        List<Outcome> raceCreateVsReject = runSimultaneously(List.of(
                () -> postAction(buyer2.token(), "/api/v1/orders", Map.of("listingId", listing2.toString())),
                () -> postAction(seller.token(), "/api/v1/orders/" + order2 + "/reject", Map.of("reason", "Không phù hợp"))
        ));
        assertThat(raceCreateVsReject).allSatisfy(o -> assertThat(o.status()).isIn(200, 201, 409));
        assertThat(raceCreateVsReject.get(0).status()).isEqualTo(201);
        assertThat(raceCreateVsReject.get(1).status()).isEqualTo(200);

        // (3) Buyer3 createReservationRequest (on seller's listing2) vs Seller startDelivery (on seller's order1)
        //     Directly exercises concurrent FK FOR KEY SHARE vs FOR NO KEY UPDATE on the SAME seller thanh_viens row!
        String prop1 = given().auth().oauth2(buyer1.token()).contentType(ContentType.JSON)
                .body(Map.of("proposedTime", baseTime.toString(), "proposedLocation", "Sảnh A2"))
                .post("/api/v1/orders/" + order1 + "/schedules")
                .then().statusCode(201).extract().jsonPath().getString("pendingScheduleProposal.id");
        given().auth().oauth2(seller.token())
                .post("/api/v1/orders/" + order1 + "/schedules/" + prop1 + "/confirm").then().statusCode(200);

        List<Outcome> raceCreateVsStartDelivery = runSimultaneously(List.of(
                () -> postAction(buyer3.token(), "/api/v1/orders", Map.of("listingId", listing2.toString())),
                () -> postAction(seller.token(), "/api/v1/orders/" + order1 + "/start-delivery", Map.of())
        ));
        assertThat(raceCreateVsStartDelivery).allSatisfy(o -> assertThat(o.status()).isIn(200, 201, 409));
        assertThat(raceCreateVsStartDelivery.get(0).status()).isEqualTo(201);
        assertThat(raceCreateVsStartDelivery.get(1).status()).isEqualTo(200);

        // (4) Buyer createReservationRequest vs Seller updateListing (ListingService FOR UPDATE on thanh_viens -> tin_dangs)
        //     Run 3 independent rounds to thoroughly exercise the lock acquisition window with zero 40P01 deadlocks!
        for (int round = 1; round <= 3; round++) {
            UUID itemUpd = createItem(seller.token(), "Sách giáo trình race update " + round);
            UUID listingUpd = publishListing(seller.token(), "Sách giáo trình " + round, List.of(itemUpd));

            Map<String, Object> updatePayload = new LinkedHashMap<>();
            updatePayload.put("action", "KEEP");
            updatePayload.put("version", 0);
            updatePayload.put("title", "Sách giáo trình " + round + " (cập nhật)");
            updatePayload.put("description", "Cập nhật thông tin đồng thời với tạo yêu cầu giữ chỗ");
            updatePayload.put("condition", "Tốt");
            updatePayload.put("priceVnd", 90000);
            updatePayload.put("categoryId", "DO_GIA_DUNG");
            updatePayload.put("locationCode", "KTX_KHU_A");
            updatePayload.put("locationText", "Sảnh KTX");
            updatePayload.put("images", List.of("https://cdn.example.edu.vn/occ/upd-" + round + ".jpg"));
            updatePayload.put("itemIds", List.of(itemUpd.toString()));

            List<Outcome> raceCreateVsUpdate = runSimultaneously(List.of(
                    () -> postAction(buyer1.token(), "/api/v1/orders", Map.of("listingId", listingUpd.toString())),
                    () -> {
                        Response resp = given()
                                .auth().oauth2(seller.token())
                                .contentType(ContentType.JSON)
                                .body(updatePayload)
                                .put("/api/v1/listings/" + listingUpd);
                        String code = null;
                        if (resp.statusCode() >= 400) {
                            try {
                                code = resp.jsonPath().getString("code");
                            } catch (Exception ignored) {
                                code = null;
                            }
                        }
                        return new Outcome(resp.statusCode(), code);
                    }
            ));
            assertThat(raceCreateVsUpdate).allSatisfy(o -> assertThat(o.status()).isIn(200, 201, 409));
            assertThat(raceCreateVsUpdate.get(0).status()).isEqualTo(201);
            assertThat(raceCreateVsUpdate.get(1).status()).isEqualTo(200);
        }
    }
}
