package com.dormtrading.catalog.listing;

import com.dormtrading.config.PostgresTestContainer;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.catalog.moderation-mode=MANUAL_QUEUE"
)
@ActiveProfiles("test")
class ListingManualModerationApiTest {

    private static final PostgresTestContainer POSTGRES_CONTAINER = PostgresTestContainer.getInstance();
    private static final String PASSWORD = "a quiet river beneath stars";

    @LocalServerPort
    private int serverPort;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES_CONTAINER::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES_CONTAINER::getUsername);
        registry.add("spring.datasource.password", POSTGRES_CONTAINER::getPassword);
    }

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private JdbcTemplate db;

    @MockitoBean
    private JavaMailSender mail;

    private final ConcurrentMap<String, String> otpCodes = new ConcurrentHashMap<>();

    @BeforeEach
    void setup() {
        RestAssured.baseURI = "http://localhost";
        RestAssured.port = serverPort;
        RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();

        doAnswer(invocation -> {
            SimpleMailMessage msg = invocation.getArgument(0);
            var matcher = Pattern.compile("[0-9]{6}").matcher(Objects.requireNonNull(msg.getText()));
            if (matcher.find()) {
                otpCodes.put(Objects.requireNonNull(msg.getTo())[0], matcher.group());
            }
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));
    }

    private String createActiveSellerToken() {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "MQ" + suffix;
        String email = "mq_" + suffix + "@student.edu.vn";
        String ip = "10.5." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register("Manual Queue Seller", studentId, email, PASSWORD, ip);
        delivery.deliver();
        var challenge = db.queryForMap(
                "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                email
        );
        auth.verify((UUID) challenge.get("id"), email, "REGISTER", otpCodes.get(email), ip);
        db.update(
                "UPDATE thanh_viens SET profile_approved = TRUE, trang_thai_tai_khoan = 'HOAT_DONG', diem_uy_tin = 100 WHERE email = ?",
                email
        );
        return auth.login(email, PASSWORD, "mobile", ip).token();
    }

    private UUID createItem(String token, String name) {
        String id = given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", name,
                        "tinhTrang", "Mới 90%",
                        "hinhAnh", List.of("https://cdn.example.edu.vn/mq/" + UUID.randomUUID() + ".jpg")
                ))
                .post("/api/v1/inventory")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");
        return UUID.fromString(id);
    }

    private Map<String, Object> publishPayload(String title, UUID itemId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("action", "PUBLISH");
        body.put("title", title);
        body.put("description", "Tin cần kiểm duyệt thủ công");
        body.put("condition", "Tốt");
        body.put("priceVnd", 40000);
        body.put("categoryId", "GIAO_TRINH");
        body.put("locationCode", "UIT");
        body.put("images", List.of("https://cdn.example.edu.vn/mq/photo.jpg"));
        body.put("itemIds", List.of(itemId));
        return body;
    }

    @Test
    void manualQueueRoutesPublishAndPublicEditToChoDuyetAndSupportsWithdrawAndDelete() {
        String token = createActiveSellerToken();
        UUID item = createItem(token, "Giáo trình Mạng máy tính");

        // 1. POST PUBLISH under MANUAL_QUEUE -> CHO_DUYET, publishedAt/expiresAt null, quota activeCount = 0
        String pendingId = given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(publishPayload("Mạng máy tính UIT", item))
                .when()
                .post("/api/v1/listings")
                .then()
                .statusCode(201)
                .body("listing.status", equalTo("CHO_DUYET"))
                .body("listing.publishedAt", nullValue())
                .body("listing.expiresAt", nullValue())
                .body("quota.activeCount", equalTo(0))
                .extract().jsonPath().getString("listing.id");

        // 2. Simulate moderator approving CHO_DUYET -> CONG_KHAI, then seller edits -> returns to CHO_DUYET
        db.update(
                "UPDATE tin_dangs SET trang_thai = 'CONG_KHAI', published_at = CURRENT_TIMESTAMP, expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days' WHERE ma_tin = ?",
                UUID.fromString(pendingId)
        );
        var editBody = publishPayload("Mạng máy tính UIT (đã sửa)", item);
        editBody.put("action", "KEEP");
        editBody.put("version", 0);
        given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(editBody)
                .when()
                .put("/api/v1/listings/{id}", pendingId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CHO_DUYET"))
                .body("listing.publishedAt", nullValue())
                .body("listing.expiresAt", nullValue())
                .body("listing.version", equalTo(1));

        // 3. Withdraw from CHO_DUYET -> DA_RUT
        given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(Map.of("version", 1))
                .when()
                .post("/api/v1/listings/{id}/withdraw", pendingId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("DA_RUT"));

        // 4. Republish DA_RUT via POST /publish -> CHO_DUYET, then hard delete CHO_DUYET -> 204
        given()
                .auth().oauth2(token)
                .contentType(ContentType.JSON)
                .body(Map.of("version", 2))
                .when()
                .post("/api/v1/listings/{id}/publish", pendingId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CHO_DUYET"));

        given()
                .auth().oauth2(token)
                .when()
                .delete("/api/v1/listings/{id}?version=3", pendingId)
                .then()
                .statusCode(204);
    }
}
