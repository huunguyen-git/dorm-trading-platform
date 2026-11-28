package com.dormtrading.order.dispute;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZonedDateTime;
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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@TestPropertySource(properties = {
        "app.dispute.scheduler.enabled=true",
        "app.dispute.scheduler.initial-delay-ms=3600000",
        "app.dispute.scheduler.fixed-delay-ms=3600000"
})
class DisputeSchedulerIntegrationTest extends BaseIntegrationTest {

    private static final String PASSWORD = "a quiet river beneath stars";

    @Autowired
    private DisputeEscalationScheduler scheduler;

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
        String studentId = "DS" + suffix;
        String email = prefix + "_" + suffix + "@student.edu.vn";
        String ip = "10.10." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register("Sched " + prefix + " " + suffix, studentId, email, PASSWORD, ip);
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

    private UUID[] createAcceptedOrder(Account seller, Account buyer, String title) {
        UUID itemId = UUID.fromString(given()
                .auth().oauth2(seller.token()).contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", "Đồ " + title,
                        "tinhTrang", "Mới 95%",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/ds/" + UUID.randomUUID() + ".jpg")
                ))
                .post("/api/v1/inventory").then().statusCode(201).extract().jsonPath().getString("id"));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("action", "PUBLISH");
        body.put("title", title);
        body.put("description", "Scheduler integration test listing");
        body.put("condition", "Tốt");
        body.put("priceVnd", 75000);
        body.put("categoryId", "DO_GIA_DUNG");
        body.put("locationCode", "KTX_KHU_A");
        body.put("locationText", "Sảnh A");
        body.put("images", List.of("https://cdn.example.edu.vn/ds/l-" + UUID.randomUUID() + ".jpg"));
        body.put("itemIds", List.of(itemId.toString()));

        UUID listingId = UUID.fromString(given()
                .auth().oauth2(seller.token()).contentType(ContentType.JSON).body(body)
                .post("/api/v1/listings").then().statusCode(201).extract().jsonPath().getString("listing.id"));

        UUID orderId = UUID.fromString(given()
                .auth().oauth2(buyer.token()).contentType(ContentType.JSON)
                .body(Map.of("listingId", listingId.toString()))
                .post("/api/v1/orders").then().statusCode(201).extract().jsonPath().getString("id"));

        given().auth().oauth2(seller.token()).contentType(ContentType.JSON).body(Map.of())
                .post("/api/v1/orders/" + orderId + "/accept").then().statusCode(200);

        return new UUID[]{orderId, listingId, itemId};
    }

    @Test
    void escalateOverdueTransactionsMovesOnlyPast24hOrdersKeepsItemsHeldAndSets3BusinessDaySla() {
        Account seller = createActiveAccount("s1");
        Account buyer = createActiveAccount("b1");

        UUID[] overdue = createAcceptedOrder(seller, buyer, "Đơn quá hạn 24h");
        UUID overdueOrderId = overdue[0];
        UUID overdueListingId = overdue[1];
        UUID overdueItemId = overdue[2];

        UUID[] recent = createAcceptedOrder(seller, buyer, "Đơn mới báo giao 20h");
        UUID recentOrderId = recent[0];

        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        db.update(
                "UPDATE giao_dichs SET trang_thai = 'CHO_XAC_NHAN', thoi_diem_bao_giao = ? WHERE ma_giao_dich = ?",
                Timestamp.from(now.minus(25, ChronoUnit.HOURS)),
                overdueOrderId
        );
        db.update(
                "UPDATE giao_dichs SET trang_thai = 'CHO_XAC_NHAN', thoi_diem_bao_giao = ? WHERE ma_giao_dich = ?",
                Timestamp.from(now.minus(20, ChronoUnit.HOURS)),
                recentOrderId
        );

        int count = scheduler.escalateOverdueTransactions();
        assertThat(count).isGreaterThanOrEqualTo(1);

        // Overdue order -> CHO_XU_LY with OVERDUE_24H + SLA + timeline + 2 notifications; items stay DANG_GIU!
        Map<String, Object> overdueRow = db.queryForMap(
                "SELECT trang_thai, ly_do_cho_xu_ly, thoi_diem_chuyen_xu_ly, han_phan_hoi_kdv FROM giao_dichs WHERE ma_giao_dich = ?",
                overdueOrderId
        );
        assertThat(overdueRow.get("trang_thai")).isEqualTo("CHO_XU_LY");
        assertThat(overdueRow.get("ly_do_cho_xu_ly")).isEqualTo("OVERDUE_24H");
        assertThat(overdueRow.get("thoi_diem_chuyen_xu_ly")).isNotNull();
        assertThat(overdueRow.get("han_phan_hoi_kdv")).isNotNull();

        Instant escalatedAt = ((Timestamp) overdueRow.get("thoi_diem_chuyen_xu_ly")).toInstant();
        Instant deadline = ((Timestamp) overdueRow.get("han_phan_hoi_kdv")).toInstant();
        assertThat(deadline).isEqualTo(DisputeService.addBusinessDays(escalatedAt, 3));

        // FR-09: NEVER auto-complete or release held items!
        assertThat(db.queryForObject("SELECT trang_thai FROM do_vats WHERE ma_vat = ?", String.class, overdueItemId))
                .isEqualTo("DANG_GIU");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, overdueListingId))
                .isEqualTo("GIU_CHO");
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM lich_su_trang_thai_giao_dich WHERE ma_giao_dich = ? AND hanh_dong = 'AUTO_ESCALATED_OVERDUE_24H'",
                Integer.class,
                overdueOrderId
        )).isEqualTo(1);
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM thong_baos WHERE ma_giao_dich = ? AND loai = 'ORDER_ESCALATED_OVERDUE_24H'",
                Integer.class,
                overdueOrderId
        )).isEqualTo(2);

        // Recent (<24h) order stays untouched in CHO_XAC_NHAN!
        assertThat(db.queryForObject("SELECT trang_thai FROM giao_dichs WHERE ma_giao_dich = ?", String.class, recentOrderId))
                .isEqualTo("CHO_XAC_NHAN");

        // Idempotent second run does not re-escalate
        assertThat(scheduler.escalateOverdueTransactions()).isZero();
    }

    @Test
    void expireOverdueEvidenceRequestsMovesExpiredRequestsToQuaHanAndKeepsActiveRequests() {
        Account seller = createActiveAccount("s2");
        Account buyer = createActiveAccount("b2");
        Account mod = createActiveAccount("m2");

        UUID[] order1 = createAcceptedOrder(seller, buyer, "Đơn hết hạn bổ sung");
        UUID[] order2 = createAcceptedOrder(seller, buyer, "Đơn còn hạn bổ sung");

        db.update("UPDATE giao_dichs SET trang_thai = 'CHO_XU_LY', ly_do_cho_xu_ly = 'OVERDUE_24H', thoi_diem_chuyen_xu_ly = NOW() WHERE ma_giao_dich IN (?, ?)",
                order1[0], order2[0]);

        UUID expiredReqId = UUID.randomUUID();
        UUID activeReqId = UUID.randomUUID();
        db.update(
                """
                INSERT INTO yeu_cau_bo_sung_giao_dichs(id, ma_giao_dich, nguoi_yeu_cau_id, ben_duoc_yeu_cau, noi_dung, han_bo_sung, trang_thai)
                VALUES (?, ?, ?, 'BUYER', 'Yêu cầu đã hết hạn', NOW() - INTERVAL '1 hour', 'CHO_BO_SUNG'),
                       (?, ?, ?, 'SELLER', 'Yêu cầu còn hạn', NOW() + INTERVAL '24 hours', 'CHO_BO_SUNG')
                """,
                expiredReqId, order1[0], mod.id(),
                activeReqId, order2[0], mod.id()
        );

        int expiredCount = scheduler.expireOverdueEvidenceRequests();
        assertThat(expiredCount).isGreaterThanOrEqualTo(1);

        assertThat(db.queryForObject("SELECT trang_thai FROM yeu_cau_bo_sung_giao_dichs WHERE id = ?", String.class, expiredReqId))
                .isEqualTo("QUA_HAN");
        assertThat(db.queryForObject("SELECT trang_thai FROM yeu_cau_bo_sung_giao_dichs WHERE id = ?", String.class, activeReqId))
                .isEqualTo("CHO_BO_SUNG");
        assertThat(db.queryForObject(
                "SELECT COUNT(*) FROM lich_su_trang_thai_giao_dich WHERE ma_giao_dich = ? AND hanh_dong = 'EVIDENCE_REQUEST_EXPIRED'",
                Integer.class,
                order1[0]
        )).isEqualTo(1);
    }

    @Test
    void addBusinessDaysSkipsSaturdayAndSundayInVietnamTimezone() {
        // Friday 2026-11-27 14:30 Asia/Ho_Chi_Minh + 3 business days -> Wednesday 2026-12-02 14:30 Asia/Ho_Chi_Minh
        Instant friday = ZonedDateTime.of(2026, 11, 27, 14, 30, 0, 0, DisputeService.VIETNAM_ZONE).toInstant();
        Instant expectedWed = ZonedDateTime.of(2026, 12, 2, 14, 30, 0, 0, DisputeService.VIETNAM_ZONE).toInstant();
        assertThat(DisputeService.addBusinessDays(friday, 3)).isEqualTo(expectedWed);

        // Saturday 2026-11-28 10:00 + 3 business days -> Wednesday 2026-12-02 10:00
        Instant saturday = ZonedDateTime.of(2026, 11, 28, 10, 0, 0, 0, DisputeService.VIETNAM_ZONE).toInstant();
        Instant expectedSatToWed = ZonedDateTime.of(2026, 12, 2, 10, 0, 0, 0, DisputeService.VIETNAM_ZONE).toInstant();
        assertThat(DisputeService.addBusinessDays(saturday, 3)).isEqualTo(expectedSatToWed);

        // Monday 2026-11-30 09:00 + 3 business days -> Thursday 2026-12-03 09:00
        Instant monday = ZonedDateTime.of(2026, 11, 30, 9, 0, 0, 0, DisputeService.VIETNAM_ZONE).toInstant();
        Instant expectedThu = ZonedDateTime.of(2026, 12, 3, 9, 0, 0, 0, DisputeService.VIETNAM_ZONE).toInstant();
        assertThat(DisputeService.addBusinessDays(monday, 3)).isEqualTo(expectedThu);
    }
}
