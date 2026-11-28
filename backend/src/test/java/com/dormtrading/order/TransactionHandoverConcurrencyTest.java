package com.dormtrading.order;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
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
import org.junit.jupiter.api.DisplayName;
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

@DisplayName("Kiểm thử đồng thời P3-02 (NFR-03): Xác nhận OTP song song, Hoàn tất vs Hủy đồng thuận, Cấp lại mã vs Xác nhận & 5 lần thử sai")
class TransactionHandoverConcurrencyTest extends BaseIntegrationTest {

    private static final String PASSWORD = "a quiet river beneath stars";

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private JdbcTemplate db;

    @MockitoBean
    private JavaMailSender mail;

    private final ConcurrentMap<String, String> authOtpCodes = new ConcurrentHashMap<>();

    private record Account(UUID id, String token) {
    }

    private record Deal(UUID listingId, UUID itemId, UUID transactionId, String otpCode) {
    }

    private record Outcome(int status, String code, String txStatus) {
    }

    @BeforeEach
    void setup() {
        doAnswer(invocation -> {
            SimpleMailMessage msg = invocation.getArgument(0);
            var matcher = Pattern.compile("[0-9]{6}").matcher(Objects.requireNonNull(msg.getText()));
            if (matcher.find()) {
                authOtpCodes.put(Objects.requireNonNull(msg.getTo())[0], matcher.group());
            }
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));
    }

    private Account createMember(String label) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "TC" + suffix;
        String email = "txc_" + suffix + "@student.edu.vn";
        String ip = "10.9." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register(label + " " + suffix, studentId, email, PASSWORD, ip);
        delivery.deliver();
        String code = authOtpCodes.get(email);
        var challenge = db.queryForMap(
                "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                email
        );
        auth.verify((UUID) challenge.get("id"), email, "REGISTER", code, ip);
        db.update(
                "UPDATE thanh_viens SET profile_approved = TRUE, trang_thai_tai_khoan = 'HOAT_DONG', diem_uy_tin = 100 WHERE email = ?",
                email
        );
        UUID id = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email);
        String token = auth.login(email, PASSWORD, "mobile", ip).token();
        return new Account(id, token);
    }

    private Deal createDeliveredDeal(Account seller, Account buyer) {
        UUID listingId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        UUID txId = UUID.randomUUID();
        Timestamp nowTs = Timestamp.from(Instant.now());
        Timestamp expiresTs = Timestamp.from(Instant.now().plus(20, ChronoUnit.DAYS));

        db.update(
                "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, hinh_thuc, trang_thai, published_at, expires_at) "
                        + "VALUES (?, ?, 'Đồ kiểm thử đồng thời', 120000, 'BAN_LE', 'GIU_CHO', ?, ?)",
                listingId, seller.id(), nowTs, expiresTs
        );
        db.update(
                "INSERT INTO do_vats(ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai) "
                        + "VALUES (?, ?, 'Quạt KTX', 'Tốt', ARRAY['/api/v1/media/00000000-0000-0000-0000-000000000001'], 'DANG_GIU')",
                itemId, seller.id()
        );
        db.update("INSERT INTO tin_dang_do_vat(ma_tin, ma_vat) VALUES (?, ?)", listingId, itemId);
        db.update(
                "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai, thoi_diem_giu_cho, thoi_diem_bat_dau_giao, updated_at) "
                        + "VALUES (?, ?, ?, ?, 120000, 'DANG_GIAO', ?, ?, ?)",
                txId, listingId, seller.id(), buyer.id(), nowTs, nowTs, nowTs
        );

        given().auth().oauth2(seller.token())
                .multiPart("file", "handover.jpg", HandoverTestImages.sampleJpeg(), "image/jpeg")
                .post("/api/v1/transactions/{id}/deliver", txId)
                .then().statusCode(200);

        String otp = given().auth().oauth2(buyer.token())
                .get("/api/v1/transactions/{id}", txId)
                .then().statusCode(200)
                .extract().jsonPath().getString("otp.inAppCode");

        return new Deal(listingId, itemId, txId, otp);
    }

    @Test
    @DisplayName("UC-27 E6 / NFR-03: 5 yêu cầu xác nhận cùng mã OTP hợp lệ chạy song song chỉ cho phép đúng 1 thành công (200) và 4 bị từ chối (409)")
    void nfr03_concurrentDoubleCompleteAllowsStrictlyOneAndRejectsRest() throws Exception {
        Account seller = createMember("SellerDC");
        Account buyer = createMember("BuyerDC");
        Deal deal = createDeliveredDeal(seller, buyer);

        int threads = 5;
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Outcome>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                Callable<Outcome> task = () -> {
                    ready.countDown();
                    assertThat(start.await(15, TimeUnit.SECONDS)).isTrue();
                    Response res = given().auth().oauth2(buyer.token())
                            .contentType(ContentType.JSON)
                            .body(Map.of("otp", deal.otpCode()))
                            .post("/api/v1/transactions/{id}/complete", deal.transactionId());
                    String code = res.statusCode() == 200 ? null : res.jsonPath().getString("code");
                    String txStatus = res.statusCode() == 200 ? res.jsonPath().getString("status") : null;
                    return new Outcome(res.statusCode(), code, txStatus);
                };
                futures.add(pool.submit(task));
            }
            assertThat(ready.await(15, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<Outcome> outcomes = new ArrayList<>();
            for (Future<Outcome> f : futures) {
                outcomes.add(f.get(30, TimeUnit.SECONDS));
            }

            long okCount = outcomes.stream().filter(o -> o.status() == 200 && "HOAN_TAT".equals(o.txStatus())).count();
            long conflictCount = outcomes.stream()
                    .filter(o -> o.status() == 409 && "OTP_ALREADY_USED".equals(o.code()))
                    .count();

            assertThat(okCount).isEqualTo(1);
            assertThat(conflictCount).isEqualTo(threads - 1);

            assertThat(db.queryForObject("SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, deal.transactionId()))
                    .isEqualTo("HOAN_TAT");
            assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, deal.itemId()))
                    .isEqualTo("DA_CHUYEN_GIAO");
            assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, deal.listingId()))
                    .isEqualTo("KET_THUC");
            assertThat(db.queryForObject(
                    "SELECT COUNT(*) FROM lich_su_trang_thai_giao_dich WHERE ma_giao_dich = ? AND hanh_dong = 'COMPLETED_BY_OTP'",
                    Integer.class, deal.transactionId())).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    @DisplayName("UC-27 & UC-28: Người mua nhập OTP hoàn tất đồng thời với Người bán đồng ý hủy -> đúng 1 thắng (HOAN_TAT XOR HUY), không deadlock")
    void concurrentCompleteVsMutualCancelAgreeSerializesCleanlyWithStrictMutualExclusion() throws Exception {
        Account seller = createMember("SellerRace");
        Account buyer = createMember("BuyerRace");
        Deal deal = createDeliveredDeal(seller, buyer);

        String cancelReqId = given().auth().oauth2(buyer.token())
                .contentType(ContentType.JSON)
                .body(Map.of("reasonCode", "MUTUAL_AGREEMENT", "reasonNote", "Đua hoàn tất vs hủy"))
                .post("/api/v1/transactions/{id}/cancel-requests", deal.transactionId())
                .then().statusCode(201)
                .extract().jsonPath().getString("cancellationRequest.id");

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Outcome> completeFuture = pool.submit(() -> {
                ready.countDown();
                assertThat(start.await(15, TimeUnit.SECONDS)).isTrue();
                Response res = given().auth().oauth2(buyer.token())
                        .contentType(ContentType.JSON)
                        .body(Map.of("otp", deal.otpCode()))
                        .post("/api/v1/transactions/{id}/complete", deal.transactionId());
                return new Outcome(
                        res.statusCode(),
                        res.statusCode() == 200 ? null : res.jsonPath().getString("code"),
                        res.statusCode() == 200 ? res.jsonPath().getString("status") : null
                );
            });

            Future<Outcome> cancelAgreeFuture = pool.submit(() -> {
                ready.countDown();
                assertThat(start.await(15, TimeUnit.SECONDS)).isTrue();
                Response res = given().auth().oauth2(seller.token())
                        .contentType(ContentType.JSON)
                        .body(Map.of("decision", "AGREE", "responseNote", "Đồng ý hủy"))
                        .post("/api/v1/transactions/{id}/cancel-requests/{reqId}/respond", deal.transactionId(), cancelReqId);
                return new Outcome(
                        res.statusCode(),
                        res.statusCode() == 200 ? null : res.jsonPath().getString("code"),
                        res.statusCode() == 200 ? res.jsonPath().getString("status") : null
                );
            });

            assertThat(ready.await(15, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            Outcome completeRes = completeFuture.get(30, TimeUnit.SECONDS);
            Outcome cancelRes = cancelAgreeFuture.get(30, TimeUnit.SECONDS);

            // Strictly ONE succeeds (200) and the OTHER is rejected (409)
            assertThat(List.of(completeRes.status(), cancelRes.status())).containsExactlyInAnyOrder(200, 409);

            String finalTxStatus = db.queryForObject(
                    "SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, deal.transactionId());
            String finalItemStatus = db.queryForObject(
                    "SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, deal.itemId());
            String finalListingStatus = db.queryForObject(
                    "SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, deal.listingId());

            if ("HOAN_TAT".equals(finalTxStatus)) {
                assertThat(completeRes.status()).isEqualTo(200);
                assertThat(cancelRes.status()).isEqualTo(409);
                assertThat(finalItemStatus).isEqualTo("DA_CHUYEN_GIAO");
                assertThat(finalListingStatus).isEqualTo("KET_THUC");
            } else {
                assertThat(finalTxStatus).isEqualTo("HUY");
                assertThat(cancelRes.status()).isEqualTo(200);
                assertThat(completeRes.status()).isEqualTo(409);
                assertThat(finalItemStatus).isEqualTo("KHA_DUNG");
                assertThat(finalListingStatus).isEqualTo("CONG_KHAI");
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    @DisplayName("UC-27 E3/E4: 6 lần nhập sai OTP chạy song song khóa đúng ở mốc 5 lần, không mất lượt đếm (lost update)")
    void concurrentWrongOtpAttemptsSerializeAndLockExactlyAtFive() throws Exception {
        Account seller = createMember("SellerW5");
        Account buyer = createMember("BuyerW5");
        Deal deal = createDeliveredDeal(seller, buyer);
        String wrongCode = deal.otpCode().equals("111111") ? "222222" : "111111";

        int threads = 6;
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Outcome>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    assertThat(start.await(15, TimeUnit.SECONDS)).isTrue();
                    Response res = given().auth().oauth2(buyer.token())
                            .contentType(ContentType.JSON)
                            .body(Map.of("otp", wrongCode))
                            .post("/api/v1/transactions/{id}/complete", deal.transactionId());
                    return new Outcome(res.statusCode(), res.jsonPath().getString("code"), null);
                }));
            }
            assertThat(ready.await(15, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<Outcome> outcomes = new ArrayList<>();
            for (Future<Outcome> f : futures) {
                outcomes.add(f.get(30, TimeUnit.SECONDS));
            }

            long invalid400 = outcomes.stream()
                    .filter(o -> o.status() == 400 && "OTP_INVALID".equals(o.code()))
                    .count();
            long locked409 = outcomes.stream()
                    .filter(o -> o.status() == 409 && "OTP_ATTEMPTS_EXCEEDED".equals(o.code()))
                    .count();

            assertThat(invalid400).isEqualTo(4);
            assertThat(locked409).isEqualTo(2);

            Integer finalAttempts = db.queryForObject(
                    "SELECT so_lan_thu_sai FROM ma_xac_nhan_otp WHERE ma_giao_dich = ?",
                    Integer.class, deal.transactionId());
            Boolean invalidated = db.queryForObject(
                    "SELECT bi_vo_hieu FROM ma_xac_nhan_otp WHERE ma_giao_dich = ?",
                    Boolean.class, deal.transactionId());
            assertThat(finalAttempts).isEqualTo(5);
            assertThat(invalidated).isTrue();
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    @DisplayName("FR-09: Cấp lại OTP song song với xác nhận mã cũ luôn giữ bất biến tối đa 1 mã hoạt động và không deadlock")
    void concurrentOtpReissueVsOldCodeCompleteMaintainsSingleActiveOtpInvariant() throws Exception {
        Account seller = createMember("SellerRe");
        Account buyer = createMember("BuyerRe");
        Deal deal = createDeliveredDeal(seller, buyer);

        record ReissueOutcome(int status, String code, String txStatus, String newOtpCode) {
        }

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<ReissueOutcome> reissueFuture = pool.submit(() -> {
                ready.countDown();
                assertThat(start.await(15, TimeUnit.SECONDS)).isTrue();
                Response res = given().auth().oauth2(buyer.token())
                        .contentType(ContentType.JSON)
                        .body(Map.of())
                        .post("/api/v1/transactions/{id}/otp/reissue", deal.transactionId());
                return new ReissueOutcome(
                        res.statusCode(),
                        res.statusCode() == 200 ? null : res.jsonPath().getString("code"),
                        res.statusCode() == 200 ? res.jsonPath().getString("status") : null,
                        res.statusCode() == 200 ? res.jsonPath().getString("otp.inAppCode") : null
                );
            });

            Future<Outcome> completeFuture = pool.submit(() -> {
                ready.countDown();
                assertThat(start.await(15, TimeUnit.SECONDS)).isTrue();
                Response res = given().auth().oauth2(buyer.token())
                        .contentType(ContentType.JSON)
                        .body(Map.of("otp", deal.otpCode()))
                        .post("/api/v1/transactions/{id}/complete", deal.transactionId());
                return new Outcome(
                        res.statusCode(),
                        res.statusCode() == 200 ? null : res.jsonPath().getString("code"),
                        res.statusCode() == 200 ? res.jsonPath().getString("status") : null
                );
            });

            assertThat(ready.await(15, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            ReissueOutcome reissueRes = reissueFuture.get(30, TimeUnit.SECONDS);
            Outcome completeRes = completeFuture.get(30, TimeUnit.SECONDS);

            String finalStatus = db.queryForObject(
                    "SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?",
                    String.class,
                    deal.transactionId()
            );
            Integer activeCount = db.queryForObject(
                    "SELECT COUNT(*) FROM ma_xac_nhan_otp WHERE ma_giao_dich = ? AND NOT da_dung AND NOT bi_vo_hieu",
                    Integer.class, deal.transactionId());

            assertThat(finalStatus).isIn("HOAN_TAT", "CHO_XAC_NHAN");
            if ("HOAN_TAT".equals(finalStatus)) {
                assertThat(completeRes.status()).isEqualTo(200);
                assertThat(activeCount).isZero();
                if (reissueRes.status() == 200) {
                    // Only possible in the 1-in-1,000,000 event that reissue generated the exact same 6-digit code
                    assertThat(deal.otpCode()).isEqualTo(reissueRes.newOtpCode());
                } else {
                    assertThat(reissueRes.status()).isEqualTo(409);
                    assertThat(reissueRes.code()).isEqualTo("INVALID_STATE_TRANSITION");
                }
            } else {
                assertThat(reissueRes.status()).isEqualTo(200);
                assertThat(completeRes.status()).isIn(400, 409);
                assertThat(completeRes.code()).isIn("OTP_INVALID", "OTP_EXPIRED", "OTP_ALREADY_USED");
                assertThat(activeCount).isEqualTo(1);
            }
        } finally {
            pool.shutdownNow();
        }
    }
}
