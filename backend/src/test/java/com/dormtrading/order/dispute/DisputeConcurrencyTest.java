package com.dormtrading.order.dispute;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.sql.Timestamp;
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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

/**
 * Real PostgreSQL 16 concurrency & deadlock-freedom verification for P3-03 (UC-29 §4, NFR-02, NFR-03).
 */
@TestPropertySource(properties = {
        "app.dispute.evidence.local-dir=${java.io.tmpdir}/dorm-trading-test-dispute-concurrency",
        "app.dispute.scheduler.enabled=false"
})
class DisputeConcurrencyTest extends BaseIntegrationTest {

    private static final String PASSWORD = "a quiet river beneath stars";

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private JdbcTemplate db;

    @Autowired
    private TransactionTemplate txTemplate;

    @MockitoBean
    private JavaMailSender mail;

    private final ConcurrentMap<String, String> otpCodes = new ConcurrentHashMap<>();

    private record Account(UUID id, String mobileToken, String adminToken) {
    }

    private record Outcome(int status, String code) {
    }

    private record SeededOrder(UUID orderId, UUID listingId, UUID itemId, long initialItemVersion) {
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

    private Account createAccount(String prefix, String adminRole) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "DC" + suffix;
        String email = prefix + "_" + suffix + "@student.edu.vn";
        String ip = "10.9." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register("Conc " + prefix + " " + suffix, studentId, email, PASSWORD, ip);
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
        if (adminRole != null) {
            db.update(
                    "INSERT INTO vai_tro_quan_tri(user_id, loai_vai_tro, bat_dau, trang_thai_hieu_luc) VALUES (?, ?, NOW() - INTERVAL '1 hour', TRUE)",
                    userId,
                    adminRole
            );
        }
        String mobileToken = auth.login(email, PASSWORD, "mobile", ip).token();
        String adminToken = adminRole != null ? auth.login(email, PASSWORD, "admin-web", ip).token() : null;
        return new Account(userId, mobileToken, adminToken);
    }

    private SeededOrder seedDisputeOrder(Account seller, Account buyer, String title) {
        UUID itemId = UUID.fromString(given()
                .auth().oauth2(seller.mobileToken()).contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", "Vật " + title,
                        "tinhTrang", "Mới 95%",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/dc/" + UUID.randomUUID() + ".jpg")
                ))
                .post("/api/v1/inventory").then().statusCode(201).extract().jsonPath().getString("id"));

        Map<String, Object> listingBody = new LinkedHashMap<>();
        listingBody.put("action", "PUBLISH");
        listingBody.put("title", title);
        listingBody.put("description", "Kiểm thử đồng thời tranh chấp");
        listingBody.put("condition", "Tốt");
        listingBody.put("priceVnd", 100000);
        listingBody.put("categoryId", "DO_GIA_DUNG");
        listingBody.put("locationCode", "KTX_KHU_A");
        listingBody.put("locationText", "Sảnh A");
        listingBody.put("images", List.of("https://cdn.example.edu.vn/dc/l-" + UUID.randomUUID() + ".jpg"));
        listingBody.put("itemIds", List.of(itemId.toString()));

        UUID listingId = UUID.fromString(given()
                .auth().oauth2(seller.mobileToken()).contentType(ContentType.JSON).body(listingBody)
                .post("/api/v1/listings").then().statusCode(201).extract().jsonPath().getString("listing.id"));

        UUID orderId = UUID.fromString(given()
                .auth().oauth2(buyer.mobileToken()).contentType(ContentType.JSON)
                .body(Map.of("listingId", listingId.toString()))
                .post("/api/v1/orders").then().statusCode(201).extract().jsonPath().getString("id"));

        given().auth().oauth2(seller.mobileToken()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept").then().statusCode(200);

        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        db.update(
                """
                UPDATE giao_dichs
                SET trang_thai = 'CHO_XU_LY',
                    thoi_diem_bao_giao = ?,
                    ly_do_cho_xu_ly = 'OVERDUE_24H',
                    thoi_diem_chuyen_xu_ly = ?,
                    han_phan_hoi_kdv = ?,
                    updated_at = ?
                WHERE ma_giao_dich = ?
                """,
                Timestamp.from(now.minus(25, ChronoUnit.HOURS)),
                Timestamp.from(now.minus(1, ChronoUnit.HOURS)),
                Timestamp.from(DisputeService.addBusinessDays(now, 3)),
                Timestamp.from(now),
                orderId
        );
        long itemVersion = db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, itemId);
        return new SeededOrder(orderId, listingId, itemId, itemVersion);
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

    private Outcome postDisputeAction(String adminToken, String path, String basis) {
        Response response = given()
                .auth().oauth2(adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("basis", basis))
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
    void twoModeratorsRacingCompleteVsCancelAllowsExactlyOneDecisionAndSingleItemTransition() throws Exception {
        Account seller = createAccount("s1", null);
        Account buyer = createAccount("b1", null);
        Account mod1 = createAccount("m1", "KIEM_DUYET_VIEN");
        Account mod2 = createAccount("m2", "KIEM_DUYET_VIEN");

        SeededOrder seeded = seedDisputeOrder(seller, buyer, "Race complete vs cancel");

        List<Outcome> outcomes = runSimultaneously(List.of(
                () -> postDisputeAction(mod1.adminToken(), "/api/v1/admin/disputes/" + seeded.orderId() + "/complete",
                        "Kiểm duyệt viên 1 xác nhận hoàn tất giao dịch."),
                () -> postDisputeAction(mod2.adminToken(), "/api/v1/admin/disputes/" + seeded.orderId() + "/cancel",
                        "Kiểm duyệt viên 2 quyết định hủy giao dịch.")
        ));

        assertThat(outcomes).allSatisfy(o -> assertThat(o.status()).isIn(200, 409));
        assertThat(outcomes.stream().filter(o -> o.status() == 200).count()).isEqualTo(1);
        assertThat(outcomes.stream().filter(o -> o.status() == 409 && "DISPUTE_ALREADY_RESOLVED".equals(o.code())).count())
                .isEqualTo(1);

        Integer decisionCount = db.queryForObject(
                "SELECT COUNT(*) FROM quyet_dinh_giao_dichs WHERE ma_giao_dich = ?",
                Integer.class,
                seeded.orderId()
        );
        assertThat(decisionCount).isEqualTo(1);

        String orderStatus = db.queryForObject(
                "SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?",
                String.class,
                seeded.orderId()
        );
        String itemStatus = db.queryForObject(
                "SELECT trang_thai FROM do_vats WHERE ma_vat = ?",
                String.class,
                seeded.itemId()
        );
        long itemVersionAfter = db.queryForObject(
                "SELECT version FROM do_vats WHERE ma_vat = ?",
                Long.class,
                seeded.itemId()
        );

        assertThat(itemVersionAfter).isEqualTo(seeded.initialItemVersion() + 1);
        if ("HOAN_TAT".equals(orderStatus)) {
            assertThat(itemStatus).isEqualTo("DA_CHUYEN_GIAO");
        } else {
            assertThat(orderStatus).isEqualTo("HUY");
            assertThat(itemStatus).isEqualTo("KHA_DUNG");
        }
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(100);
    }

    @Test
    void moderatorDecisionRacingAgainstConcurrentOrderStatusChangePreventsDoubleCompletion() throws Exception {
        Account seller = createAccount("s2", null);
        Account buyer = createAccount("b2", null);
        Account mod = createAccount("m3", "KIEM_DUYET_VIEN");

        SeededOrder seeded = seedDisputeOrder(seller, buyer, "Race mod vs buyer OTP confirm");

        List<Outcome> outcomes = runSimultaneously(List.of(
                () -> postDisputeAction(mod.adminToken(), "/api/v1/admin/disputes/" + seeded.orderId() + "/cancel",
                        "Kiểm duyệt viên hủy trong lúc người mua vừa tự xác nhận."),
                () -> {
                    Boolean updated = txTemplate.execute(st -> {
                        // Lock tin_dangs -> giao_dichs -> do_vats in same canonical order (simulating buyer OTP confirm UC-17/UC-27)
                        db.queryForObject("SELECT ma_tin FROM tin_dangs WHERE ma_tin = ? FOR NO KEY UPDATE", UUID.class, seeded.listingId());
                        String current = db.queryForObject(
                                "SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ? FOR NO KEY UPDATE",
                                String.class,
                                seeded.orderId()
                        );
                        if (!"CHO_XU_LY".equals(current)) {
                            return false;
                        }
                        db.update("UPDATE giao_dichs SET trang_thai = 'HOAN_TAT', thoi_diem_hoan_tat = NOW(), version = version + 1 WHERE ma_giao_dich = ?", seeded.orderId());
                        db.update("UPDATE giao_dich_do_vat SET giu_hieu_luc = FALSE WHERE ma_giao_dich = ?", seeded.orderId());
                        db.update("UPDATE do_vats SET trang_thai = 'DA_CHUYEN_GIAO', version = version + 1 WHERE ma_vat = ?", seeded.itemId());
                        db.update("UPDATE tin_dangs SET trang_thai = 'KET_THUC', version = version + 1 WHERE ma_tin = ?", seeded.listingId());
                        return true;
                    });
                    return Boolean.TRUE.equals(updated)
                            ? new Outcome(200, null)
                            : new Outcome(409, "CONCURRENT_TERMINAL");
                }
        ));

        // Exactly one side wins 200 and the other gets 409 — ZERO deadlocks or dual decisions!
        assertThat(outcomes.stream().filter(o -> o.status() == 200).count()).isEqualTo(1);
        assertThat(outcomes.stream().filter(o -> o.status() == 409).count()).isEqualTo(1);

        String finalOrderStatus = db.queryForObject(
                "SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?",
                String.class,
                seeded.orderId()
        );
        String finalItemStatus = db.queryForObject(
                "SELECT trang_thai FROM do_vats WHERE ma_vat = ?",
                String.class,
                seeded.itemId()
        );
        Integer decisionRows = db.queryForObject(
                "SELECT COUNT(*) FROM quyet_dinh_giao_dichs WHERE ma_giao_dich = ?",
                Integer.class,
                seeded.orderId()
        );

        if ("HOAN_TAT".equals(finalOrderStatus)) {
            assertThat(finalItemStatus).isEqualTo("DA_CHUYEN_GIAO");
            assertThat(decisionRows).isZero();
        } else {
            assertThat(finalOrderStatus).isEqualTo("HUY");
            assertThat(finalItemStatus).isEqualTo("KHA_DUNG");
            assertThat(decisionRows).isEqualTo(1);
        }
    }
}
