package com.dormtrading.order;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import io.restassured.http.ContentType;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

@DisplayName("Kiểm thử DemoHandoverDataSeeder: Không nạp trong profile mặc định/test & lũy đẳng hoàn toàn khi bật")
class DemoHandoverDataSeederTest extends BaseIntegrationTest {

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private JdbcTemplate db;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private HandoverProofStorage proofStorage;

    @Autowired
    private HandoverOtpCrypto otpCrypto;

    @Autowired
    private Clock clock;

    @Autowired
    private AuthService authService;

    private static final List<UUID> DEMO_TX_IDS = List.of(
            DemoHandoverDataSeeder.TX_PAID_DANG_GIAO_ID,
            DemoHandoverDataSeeder.TX_FREE_COMBO_DANG_GIAO_ID,
            DemoHandoverDataSeeder.TX_OTP_CHO_XAC_NHAN_ID,
            DemoHandoverDataSeeder.TX_PENDING_CANCEL_ID,
            DemoHandoverDataSeeder.TX_CANCEL_DISPUTE_ID,
            DemoHandoverDataSeeder.TX_COMPLETED_RECEIPT_ID
    );

    private static final List<UUID> DEMO_USER_IDS = List.of(
            DemoHandoverDataSeeder.SELLER_ID,
            DemoHandoverDataSeeder.BUYER_ID,
            DemoHandoverDataSeeder.MODERATOR_ID
    );

    @AfterEach
    void cleanupDemoRows() {
        for (UUID txId : DEMO_TX_IDS) {
            List<String> keys = db.queryForList(
                    "SELECT storage_key FROM anh_ban_giao_giao_dichs WHERE ma_giao_dich = ?",
                    String.class,
                    txId
            );
            for (String key : keys) {
                proofStorage.deleteQuietly(key);
            }
            db.update("DELETE FROM giao_dichs WHERE ma_giao_dich = ?", txId);
        }
        for (UUID userId : DEMO_USER_IDS) {
            db.update("DELETE FROM auth_refresh WHERE session_id IN (SELECT id FROM auth_session WHERE user_id = ?)", userId);
            db.update("DELETE FROM auth_session WHERE user_id = ?", userId);
            db.update("DELETE FROM tin_dangs WHERE nguoi_dang_id = ?", userId);
            db.update("DELETE FROM do_vats WHERE user_id = ?", userId);
            db.update("DELETE FROM thanh_viens WHERE user_id = ?", userId);
        }
        for (String email : List.of(
                DemoHandoverDataSeeder.SELLER_EMAIL,
                DemoHandoverDataSeeder.BUYER_EMAIL,
                DemoHandoverDataSeeder.MODERATOR_EMAIL
        )) {
            db.update("DELETE FROM auth_login_guard WHERE email = ?", email);
            db.update("DELETE FROM auth_event WHERE subject = ?", email);
        }
    }

    @Test
    @DisplayName("Bean seeder không được Spring nạp trong profile test/mặc định; khi chạy tay lũy đẳng và đủ 6 giao dịch mẫu UIT KTX")
    void seederIsDisabledInTestProfileAndIdempotentWhenExecuted() {
        assertThat(applicationContext.getBeansOfType(DemoHandoverDataSeeder.class)).isEmpty();

        DemoHandoverDataSeeder seeder = new DemoHandoverDataSeeder(
                db, passwordEncoder, proofStorage, otpCrypto, clock
        );

        // First run + second run (idempotent)
        seeder.seedIfAbsent();
        seeder.seedIfAbsent();

        Integer seededTxCount = db.queryForObject(
                "SELECT COUNT(*) FROM giao_dichs WHERE nguoi_ban_id = ?",
                Integer.class,
                DemoHandoverDataSeeder.SELLER_ID
        );
        assertThat(seededTxCount).isEqualTo(6);

        // Verify all 3 demo accounts can authenticate cleanly
        String sellerToken = authService.login(DemoHandoverDataSeeder.SELLER_EMAIL, DemoHandoverDataSeeder.DEMO_PASSWORD, "mobile", "10.20.0.1").token();
        String buyerToken = authService.login(DemoHandoverDataSeeder.BUYER_EMAIL, DemoHandoverDataSeeder.DEMO_PASSWORD, "mobile", "10.20.0.2").token();
        String modToken = given()
                .header("Origin", "http://localhost:5173")
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "email", DemoHandoverDataSeeder.MODERATOR_EMAIL,
                        "password", DemoHandoverDataSeeder.DEMO_PASSWORD,
                        "client", "admin-web"
                ))
                .post("/api/v1/auth/login")
                .then().statusCode(200)
                .extract().jsonPath().getString("token");

        // Buyer sees all 6 seeded deals with accurate live counts
        given().auth().oauth2(buyerToken)
                .get("/api/v1/transactions")
                .then().statusCode(200)
                .body("counts.all", equalTo(6))
                .body("counts.dangGiao", equalTo(2))
                .body("counts.choXacNhan", equalTo(2))
                .body("counts.choXuLy", equalTo(1))
                .body("counts.hoanTat", equalTo(1));

        // Buyer can inspect live CHO_XAC_NHAN deal #3: real JPEG photo + active 6-digit OTP
        String otpCode = given().auth().oauth2(buyerToken)
                .get("/api/v1/transactions/{id}", DemoHandoverDataSeeder.TX_OTP_CHO_XAC_NHAN_ID)
                .then().statusCode(200)
                .body("status", equalTo("CHO_XAC_NHAN"))
                .body("otp.status", equalTo("ACTIVE"))
                .body("otp.inAppCode", notNullValue())
                .extract().jsonPath().getString("otp.inAppCode");
        assertThat(otpCode).matches("[0-9]{6}");

        given().auth().oauth2(buyerToken)
                .get("/api/v1/transactions/{id}/handover-photo", DemoHandoverDataSeeder.TX_OTP_CHO_XAC_NHAN_ID)
                .then().statusCode(200)
                .contentType("image/jpeg");

        // Moderator can inspect dispute deal #5 cleanly with both seller and buyer summaries
        given().auth().oauth2(modToken)
                .get("/api/v1/transactions/{id}", DemoHandoverDataSeeder.TX_CANCEL_DISPUTE_ID)
                .then().statusCode(200)
                .body("viewerRole", equalTo("MODERATOR"))
                .body("seller.displayName", equalTo("Nguyễn Minh An"))
                .body("buyer.displayName", equalTo("Trần Quốc Bình"))
                .body("otp.inAppCode", nullValue());

        // Complete deal #3 and re-run seeder -> must NOT overwrite completed state!
        given().auth().oauth2(buyerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("otp", otpCode))
                .post("/api/v1/transactions/{id}/complete", DemoHandoverDataSeeder.TX_OTP_CHO_XAC_NHAN_ID)
                .then().statusCode(200)
                .body("status", equalTo("HOAN_TAT"));

        seeder.seedIfAbsent();

        given().auth().oauth2(sellerToken)
                .get("/api/v1/transactions/{id}", DemoHandoverDataSeeder.TX_OTP_CHO_XAC_NHAN_ID)
                .then().statusCode(200)
                .body("status", equalTo("HOAN_TAT"));

        // Wave-4: Ensure zero internal jargon leaks in any seeded deal detail or timeline note
        java.util.regex.Pattern forbiddenJargon = java.util.regex.Pattern.compile(
                "(?i)(UC-\\d+|FR-\\d+|NFR-\\d+|P3-02|\\bKDV\\b|\\bOTP\\b|\\bactor\\b|\\buser\\b|vô hiệu hóa mã cũ|giữ chỗ vẫn được bảo toàn)"
        );
        for (UUID txId : DEMO_TX_IDS) {
            var json = given().auth().oauth2(buyerToken)
                    .get("/api/v1/transactions/{id}", txId)
                    .then().statusCode(200)
                    .extract().jsonPath();
            String title = json.getString("listing.title");
            assertThat(forbiddenJargon.matcher(title).find()).as("listing.title for %s: %s", txId, title).isFalse();
            String proofNote = json.getString("handoverProof.note");
            if (proofNote != null) {
                assertThat(forbiddenJargon.matcher(proofNote).find()).as("handoverProof.note for %s: %s", txId, proofNote).isFalse();
            }
            String cancelLabel = json.getString("cancellationRequest.reasonLabel");
            if (cancelLabel != null) {
                assertThat(forbiddenJargon.matcher(cancelLabel).find()).as("reasonLabel for %s: %s", txId, cancelLabel).isFalse();
            }
            List<String> timelineNotes = json.getList("timeline.note", String.class);
            if (timelineNotes != null) {
                for (String note : timelineNotes) {
                    if (note != null) {
                        assertThat(forbiddenJargon.matcher(note).find()).as("timeline.note for %s: %s", txId, note).isFalse();
                    }
                }
            }
        }
    }
}
