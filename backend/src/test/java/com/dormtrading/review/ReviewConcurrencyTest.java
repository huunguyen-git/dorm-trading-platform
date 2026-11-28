package com.dormtrading.review;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
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
 * Real PostgreSQL 16 concurrency & idempotency verification for P3-04
 * (UC-30 double-submit, UC-31 optimistic lock, UC-32 idempotent delete, FR-10 15-day +1 mutual exclusion, NFR-03).
 */
class ReviewConcurrencyTest extends BaseIntegrationTest {

    private static final String PASSWORD = "a quiet river beneath stars";

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private ReviewBonusService bonusService;

    @Autowired
    private JdbcTemplate db;

    @MockitoBean
    private JavaMailSender mail;

    private final ConcurrentMap<String, String> otpCodes = new ConcurrentHashMap<>();

    private record Account(UUID id, String token) {
    }

    private record Outcome(int status, String code, Boolean idempotentReplay) {
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
        String studentId = "RC" + suffix;
        String email = prefix + "_" + suffix + "@student.edu.vn";
        String ip = "10.8." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register("ReviewConc " + prefix + " " + suffix, studentId, email, PASSWORD, ip);
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

    private UUID createCompletedOrder(Account seller, Account buyer, Instant completedAt) {
        UUID listingId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        Timestamp tsCreated = Timestamp.from(completedAt.minus(Duration.ofDays(1)));
        Timestamp tsCompleted = Timestamp.from(completedAt);
        db.update(
                """
                INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, hinh_thuc, trang_thai, created_at, updated_at)
                VALUES (?, ?, 'Tin đánh giá đồng thời', 50000, 'BAN_LE', 'KET_THUC', ?, ?)
                """,
                listingId,
                seller.id(),
                tsCreated,
                tsCompleted
        );
        db.update(
                """
                INSERT INTO giao_dichs(
                    ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan,
                    trang_thai, thoi_diem_tao, thoi_diem_hoan_tat, updated_at, version
                ) VALUES (?, ?, ?, ?, 50000, 'HOAN_TAT', ?, ?, ?, 0)
                """,
                orderId,
                listingId,
                seller.id(),
                buyer.id(),
                tsCreated,
                tsCompleted,
                tsCompleted
        );
        return orderId;
    }

    private <T> List<T> runSimultaneously(List<Callable<T>> tasks) throws Exception {
        CountDownLatch ready = new CountDownLatch(tasks.size());
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (Callable<T> task : tasks) {
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

            List<T> outcomes = new ArrayList<>();
            for (Future<T> future : futures) {
                outcomes.add(future.get(30, TimeUnit.SECONDS));
            }
            return outcomes;
        } finally {
            pool.shutdownNow();
        }
    }

    private Outcome extractOutcome(Response response) {
        String code = null;
        Boolean replay = null;
        try {
            if (response.statusCode() >= 400) {
                code = response.jsonPath().getString("code");
            } else {
                replay = response.jsonPath().getBoolean("idempotentReplay");
            }
        } catch (Exception ignored) {
            // Keep null on non-JSON responses
        }
        return new Outcome(response.statusCode(), code, replay);
    }

    @Test
    void concurrentDoubleSubmitWithoutKeyCreatesExactlyOneReviewAndSingleScoreCredit() throws Exception {
        Account seller = createActiveAccount("s1");
        Account buyer = createActiveAccount("b1");
        UUID orderId = createCompletedOrder(seller, buyer, Instant.now().minus(Duration.ofDays(1)));

        List<Callable<Outcome>> tasks = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            final int attempt = i;
            tasks.add(() -> extractOutcome(given()
                    .auth().oauth2(buyer.token())
                    .contentType(ContentType.JSON)
                    .body(Map.of("rating", 5, "comment", "Đánh giá đồng thời #" + attempt))
                    .post("/api/v1/orders/" + orderId + "/review")));
        }

        List<Outcome> outcomes = runSimultaneously(tasks);
        assertThat(outcomes.stream().filter(o -> o.status() == 201).count()).isEqualTo(1);
        assertThat(outcomes.stream().filter(o -> o.status() == 409 && "REVIEW_ALREADY_EXISTS".equals(o.code())).count())
                .isEqualTo(4);

        assertThat(db.queryForObject("SELECT COUNT(*) FROM danh_gias WHERE ma_giao_dich = ?", Integer.class, orderId))
                .isEqualTo(1);
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM lich_su_diem_uy_tin WHERE user_id = ? AND loai_bien_dong = 'DANH_GIA_GIAO_DICH'",
                Integer.class,
                seller.id()
        )).isEqualTo(1);
    }

    @Test
    void concurrentDoubleSubmitWithSameIdempotencyKeyReplaysSafelyWithoutDoubleCredit() throws Exception {
        Account seller = createActiveAccount("s2");
        Account buyer = createActiveAccount("b2");
        UUID orderId = createCompletedOrder(seller, buyer, Instant.now().minus(Duration.ofDays(1)));
        String key = "client-req-" + UUID.randomUUID();

        List<Callable<Outcome>> tasks = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            tasks.add(() -> extractOutcome(given()
                    .auth().oauth2(buyer.token())
                    .contentType(ContentType.JSON)
                    .body(Map.of("rating", 5, "comment", "Đánh giá gửi lặp", "idempotencyKey", key))
                    .post("/api/v1/orders/" + orderId + "/review")));
        }

        List<Outcome> outcomes = runSimultaneously(tasks);
        assertThat(outcomes.stream().filter(o -> o.status() == 201 && Boolean.FALSE.equals(o.idempotentReplay())).count())
                .isEqualTo(1);
        assertThat(outcomes.stream().filter(o -> o.status() == 200 && Boolean.TRUE.equals(o.idempotentReplay())).count())
                .isEqualTo(3);

        assertThat(db.queryForObject("SELECT COUNT(*) FROM danh_gias WHERE ma_giao_dich = ?", Integer.class, orderId))
                .isEqualTo(1);
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM lich_su_diem_uy_tin WHERE user_id = ?",
                Integer.class,
                seller.id()
        )).isEqualTo(1);
    }

    @Test
    void concurrentEditsWithSameExpectedVersionEnforceOptimisticLockAndSingleReversal() throws Exception {
        Account seller = createActiveAccount("s3");
        Account buyer = createActiveAccount("b3");
        UUID orderId = createCompletedOrder(seller, buyer, Instant.now().minus(Duration.ofDays(2)));

        String reviewId = given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Ban đầu 5 sao"))
                .post("/api/v1/orders/" + orderId + "/review")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("review.id");
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);

        List<Outcome> outcomes = runSimultaneously(List.of(
                () -> extractOutcome(given()
                        .auth().oauth2(buyer.token())
                        .contentType(ContentType.JSON)
                        .body(Map.of("rating", 4, "comment", "Sửa sang 4 sao", "expectedVersion", 0))
                        .put("/api/v1/reviews/" + reviewId)),
                () -> extractOutcome(given()
                        .auth().oauth2(buyer.token())
                        .contentType(ContentType.JSON)
                        .body(Map.of("rating", 3, "comment", "Sửa sang 3 sao có lý do", "expectedVersion", 0))
                        .put("/api/v1/reviews/" + reviewId))
        ));

        assertThat(outcomes.stream().filter(o -> o.status() == 200).count()).isEqualTo(1);
        assertThat(outcomes.stream().filter(o -> o.status() == 409 && "VERSION_CONFLICT".equals(o.code())).count())
                .isEqualTo(1);

        // Score reversed ONCE from 102 -> 100 (NEVER double-reversed to 98!)
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(100);
        assertThat(db.queryForObject("SELECT version FROM danh_gias WHERE ma_danh_gia = ?", Long.class, UUID.fromString(reviewId)))
                .isEqualTo(1L);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM danh_gia_phien_bans WHERE ma_danh_gia = ?", Integer.class, UUID.fromString(reviewId)))
                .isEqualTo(2);
    }

    @Test
    void concurrentEditAndDeleteWithSameVersionNeverDoubleReversesOrDeadlocks() throws Exception {
        Account seller = createActiveAccount("s4");
        Account buyer = createActiveAccount("b4");
        UUID orderId = createCompletedOrder(seller, buyer, Instant.now().minus(Duration.ofDays(2)));

        UUID reviewId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Đánh giá 5 sao trước race edit/delete"))
                .post("/api/v1/orders/" + orderId + "/review")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("review.id"));

        List<Outcome> outcomes = runSimultaneously(List.of(
                () -> extractOutcome(given()
                        .auth().oauth2(buyer.token())
                        .contentType(ContentType.JSON)
                        .body(Map.of("rating", 4, "comment", "Đổi sang 4 sao", "expectedVersion", 0))
                        .put("/api/v1/reviews/" + reviewId)),
                () -> extractOutcome(given()
                        .auth().oauth2(buyer.token())
                        .delete("/api/v1/reviews/" + reviewId + "?expectedVersion=0"))
        ));

        assertThat(outcomes.stream().filter(o -> o.status() == 200).count()).isEqualTo(1);
        assertThat(outcomes.stream().filter(o -> o.status() == 409).count()).isEqualTo(1);

        // Regardless of winner (4* edit OR soft-delete), seller score MUST be 100 (never 98!)
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(100);
        assertThat(db.queryForObject("SELECT diem_da_ap_dung FROM danh_gias WHERE ma_danh_gia = ?", Integer.class, reviewId))
                .isEqualTo(0);
    }

    @Test
    void concurrentRepeatedDeletesReverseScoreExactlyOnce() throws Exception {
        Account seller = createActiveAccount("s5");
        Account buyer = createActiveAccount("b5");
        UUID orderId = createCompletedOrder(seller, buyer, Instant.now().minus(Duration.ofDays(3)));

        UUID reviewId = UUID.fromString(given()
                .auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("rating", 5, "comment", "Sẽ xóa đồng thời"))
                .post("/api/v1/orders/" + orderId + "/review")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("review.id"));
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(102);

        List<Callable<Outcome>> tasks = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            tasks.add(() -> extractOutcome(given()
                    .auth().oauth2(buyer.token())
                    .delete("/api/v1/reviews/" + reviewId)));
        }

        List<Outcome> outcomes = runSimultaneously(tasks);
        assertThat(outcomes).allSatisfy(o -> assertThat(o.status()).isEqualTo(200));
        assertThat(outcomes.stream().filter(o -> Boolean.FALSE.equals(o.idempotentReplay())).count()).isEqualTo(1);
        assertThat(outcomes.stream().filter(o -> Boolean.TRUE.equals(o.idempotentReplay())).count()).isEqualTo(3);

        // Score reversed exactly once (102 -> 100), 2 ledger entries total (+2, -2), 1 REVIEW_DELETED notification
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(100);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM lich_su_diem_uy_tin WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(2);
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM thong_baos WHERE nguoi_nhan_id = ? AND loai = 'REVIEW_DELETED'",
                Integer.class,
                seller.id()
        )).isEqualTo(1);
    }

    @Test
    void concurrentNoReviewBonusRunsAndReviewCreationAreMutuallyExclusiveAndDeadlockFree() throws Exception {
        Account seller = createActiveAccount("s6");
        Account buyer1 = createActiveAccount("b6a");
        Account buyer2 = createActiveAccount("b6b");

        // Part A: 4 concurrent workers executing 15-day +1 bonus on the same overdue order -> exactly 1 awards +1
        UUID expiredOrder = createCompletedOrder(seller, buyer1, Instant.now().minus(Duration.ofDays(16)));
        List<Callable<Boolean>> bonusTasks = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            bonusTasks.add(() -> bonusService.awardNoReviewBonusForOrder(expiredOrder));
        }
        List<Boolean> bonusResults = runSimultaneously(bonusTasks);
        assertThat(bonusResults.stream().filter(Boolean::booleanValue).count()).isEqualTo(1);
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(101);
        assertThat(db.queryForObject(
                "SELECT da_cong_diem_khong_danh_gia FROM giao_dichs WHERE ma_giao_dich = ?",
                Boolean.class,
                expiredOrder
        )).isTrue();

        // Part B: Concurrent buyer review submission on seller's recent order vs bonus worker on seller's second expired order
        // (stresses shared seller thanh_viens FOR UPDATE lock ordering -> zero deadlocks!)
        UUID recentOrder = createCompletedOrder(seller, buyer2, Instant.now().minus(Duration.ofDays(2)));
        UUID secondExpiredOrder = createCompletedOrder(seller, buyer1, Instant.now().minus(Duration.ofDays(20)));

        List<Object> mixed = runSimultaneously(List.of(
                () -> extractOutcome(given()
                        .auth().oauth2(buyer2.token())
                        .contentType(ContentType.JSON)
                        .body(Map.of("rating", 5, "comment", "Song song với scheduler +1"))
                        .post("/api/v1/orders/" + recentOrder + "/review")),
                () -> bonusService.awardNoReviewBonusForOrder(secondExpiredOrder)
        ));

        Outcome reviewOutcome = (Outcome) mixed.get(0);
        Boolean secondBonusAwarded = (Boolean) mixed.get(1);
        assertThat(reviewOutcome.status()).isEqualTo(201);
        assertThat(secondBonusAwarded).isTrue();
        // 101 + 2 (5-star) + 1 (second expired order) = 104
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(104);

        // Part C: Race bonus vs submit on the SAME order near boundary -> strictly mutually exclusive (never +3!)
        UUID boundaryOrder = createCompletedOrder(seller, buyer2, Instant.now().minus(Duration.ofDays(15)).minusSeconds(1));
        List<Object> sameOrderRace = runSimultaneously(List.of(
                () -> extractOutcome(given()
                        .auth().oauth2(buyer2.token())
                        .contentType(ContentType.JSON)
                        .body(Map.of("rating", 5, "comment", "Gửi đúng mốc hết hạn"))
                        .post("/api/v1/orders/" + boundaryOrder + "/review")),
                () -> bonusService.awardNoReviewBonusForOrder(boundaryOrder)
        ));
        Outcome boundaryReview = (Outcome) sameOrderRace.get(0);
        Boolean boundaryBonus = (Boolean) sameOrderRace.get(1);
        assertThat(boundaryReview.status()).isEqualTo(409);
        assertThat(boundaryReview.code()).isIn("REVIEW_WINDOW_EXPIRED", "NO_REVIEW_BONUS_ALREADY_APPLIED");
        assertThat(boundaryBonus).isTrue();
        assertThat(db.queryForObject("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, seller.id()))
                .isEqualTo(105);
    }
}
