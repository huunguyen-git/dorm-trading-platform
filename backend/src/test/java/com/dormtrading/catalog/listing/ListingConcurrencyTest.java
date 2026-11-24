package com.dormtrading.catalog.listing;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
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

class ListingConcurrencyTest extends BaseIntegrationTest {

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

    private record SellerAccount(UUID id, String token) {
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

    private SellerAccount createActiveSeller(int score) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "CC" + suffix;
        String email = "cc_" + suffix + "@student.edu.vn";
        String ip = "10.4." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register("Concurrent Seller " + suffix, studentId, email, PASSWORD, ip);
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
        String token = auth.login(email, PASSWORD, "mobile", ip).token();
        return new SellerAccount(userId, token);
    }

    private UUID createItem(String token, String name) {
        String id = given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", name,
                        "tinhTrang", "Mới 95%",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/cc/" + UUID.randomUUID() + ".jpg")
                ))
                .post("/api/v1/inventory")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");
        return UUID.fromString(id);
    }

    private Map<String, Object> publishPayload(String title, List<UUID> itemIds) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("action", "PUBLISH");
        body.put("title", title);
        body.put("description", "Kiểm thử đồng thời NFR-02");
        body.put("condition", "Tốt");
        body.put("priceVnd", 50000);
        body.put("categoryId", "DO_GIA_DUNG");
        body.put("locationCode", "KTX_KHU_A");
        body.put("images", List.of("https://cdn.example.edu.vn/cc/photo.jpg"));
        body.put("itemIds", itemIds);
        return body;
    }

    @Test
    void nfr02_sixSimultaneousPublishesAtFourOfFiveQuotaAllowStrictlyOneAndRejectFive() throws Exception {
        SellerAccount seller = createActiveSeller(100);
        List<UUID> items = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            items.add(createItem(seller.token(), "Vật phẩm " + i));
        }

        // Fill 4/5 slots first
        for (int i = 0; i < 4; i++) {
            given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                    .body(publishPayload("Tin nền " + i, List.of(items.get(i))))
                    .post("/api/v1/listings")
                    .then().statusCode(201);
        }

        int threads = 6;
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Outcome>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                final int idx = i;
                final UUID itemId = items.get(4 + idx);
                Callable<Outcome> task = () -> {
                    ready.countDown();
                    assertThat(start.await(15, TimeUnit.SECONDS)).isTrue();
                    Response res = given()
                            .auth().oauth2(seller.token())
                            .contentType(ContentType.JSON)
                            .body(publishPayload("Tin đua hạn mức " + idx, List.of(itemId)))
                            .post("/api/v1/listings");
                    String code = res.statusCode() == 201 ? null : res.jsonPath().getString("code");
                    return new Outcome(res.statusCode(), code);
                };
                futures.add(pool.submit(task));
            }

            assertThat(ready.await(15, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<Outcome> outcomes = new ArrayList<>();
            for (Future<Outcome> f : futures) {
                outcomes.add(f.get(30, TimeUnit.SECONDS));
            }

            long createdCount = outcomes.stream().filter(o -> o.status() == 201).count();
            long quotaExceededCount = outcomes.stream()
                    .filter(o -> o.status() == 409 && "QUOTA_EXCEEDED".equals(o.code()))
                    .count();

            assertThat(createdCount).isEqualTo(1);
            assertThat(quotaExceededCount).isEqualTo(5);

            Integer finalDbCount = db.queryForObject(
                    "SELECT COUNT(*) FROM tin_dangs WHERE nguoi_dang_id = ? AND trang_thai IN ('CONG_KHAI', 'GIU_CHO')",
                    Integer.class,
                    seller.id()
            );
            assertThat(finalDbCount).isEqualTo(5);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void nfr02_concurrentEditsWithSameVersionAllowStrictlyOneAndRejectOthersWithVersionConflict() throws Exception {
        SellerAccount seller = createActiveSeller(100);
        UUID item = createItem(seller.token(), "Bàn học đua sửa");

        String listingId = given().auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(publishPayload("Tin gốc", List.of(item)))
                .post("/api/v1/listings")
                .then().statusCode(201)
                .extract().jsonPath().getString("listing.id");

        int threads = 5;
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Outcome>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                final int idx = i;
                Callable<Outcome> task = () -> {
                    ready.countDown();
                    assertThat(start.await(15, TimeUnit.SECONDS)).isTrue();
                    var body = publishPayload("Tin sửa bởi luồng " + idx, List.of(item));
                    body.put("action", "KEEP");
                    body.put("version", 0);
                    Response res = given()
                            .auth().oauth2(seller.token())
                            .contentType(ContentType.JSON)
                            .body(body)
                            .put("/api/v1/listings/{id}", listingId);
                    String code = res.statusCode() == 200 ? null : res.jsonPath().getString("code");
                    return new Outcome(res.statusCode(), code);
                };
                futures.add(pool.submit(task));
            }

            assertThat(ready.await(15, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<Outcome> outcomes = new ArrayList<>();
            for (Future<Outcome> f : futures) {
                outcomes.add(f.get(30, TimeUnit.SECONDS));
            }

            long okCount = outcomes.stream().filter(o -> o.status() == 200).count();
            long conflictCount = outcomes.stream()
                    .filter(o -> o.status() == 409 && "VERSION_CONFLICT".equals(o.code()))
                    .count();

            assertThat(okCount).isEqualTo(1);
            assertThat(conflictCount).isEqualTo(threads - 1);

            Long finalVersion = db.queryForObject(
                    "SELECT version FROM tin_dangs WHERE ma_tin = ?",
                    Long.class,
                    UUID.fromString(listingId)
            );
            assertThat(finalVersion).isEqualTo(1L);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void nfr02_concurrentComboPublishesWithReversedItemOrdersCompleteWithoutDeadlock() throws Exception {
        SellerAccount seller = createActiveSeller(120);
        UUID itemA = createItem(seller.token(), "Combo Item A");
        UUID itemB = createItem(seller.token(), "Combo Item B");

        int threads = 4;
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                final int idx = i;
                final List<UUID> itemOrder = (idx % 2 == 0) ? List.of(itemA, itemB) : List.of(itemB, itemA);
                Callable<Integer> task = () -> {
                    ready.countDown();
                    assertThat(start.await(15, TimeUnit.SECONDS)).isTrue();
                    return given()
                            .auth().oauth2(seller.token())
                            .contentType(ContentType.JSON)
                            .body(publishPayload("Combo không deadlock " + idx, itemOrder))
                            .post("/api/v1/listings")
                            .statusCode();
                };
                futures.add(pool.submit(task));
            }

            assertThat(ready.await(15, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            for (Future<Integer> f : futures) {
                assertThat(f.get(30, TimeUnit.SECONDS)).isEqualTo(201);
            }

            assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemA))
                    .isEqualTo(4L);
            assertThat(db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemB))
                    .isEqualTo(4L);
        } finally {
            pool.shutdownNow();
        }
    }
}
