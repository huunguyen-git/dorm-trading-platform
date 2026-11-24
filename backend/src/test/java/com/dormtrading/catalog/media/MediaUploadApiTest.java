package com.dormtrading.catalog.media;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import java.nio.charset.StandardCharsets;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

class MediaUploadApiTest extends BaseIntegrationTest {

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

    private String activeToken;
    private UUID activeUserId;
    private String pendingToken;

    @BeforeEach
    void setup() {
        doAnswer(invocation -> {
            SimpleMailMessage msg = invocation.getArgument(0);
            var matcher = Pattern.compile("[0-9]{6}").matcher(Objects.requireNonNull(msg.getText()));
            if (matcher.find()) {
                codes.put(Objects.requireNonNull(msg.getTo())[0], matcher.group());
            }
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));

        String student1 = UUID.randomUUID().toString().substring(0, 10);
        String email1 = "media1_" + student1 + "@student.edu.vn";
        activeToken = registerUser(student1, email1, true);
        activeUserId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email1);

        String student2 = UUID.randomUUID().toString().substring(0, 10);
        String email2 = "media2_" + student2 + "@student.edu.vn";
        pendingToken = registerUser(student2, email2, false);
    }

    private String registerUser(String studentId, String email, boolean activate) {
        String ip = "10.1." + (Math.abs(studentId.hashCode()) % 250) + ".1";
        auth.register("Sinh Viên Media", studentId, email, PASSWORD, ip);
        if (activate) {
            delivery.deliver();
            String code = codes.get(email);
            var challenge = db.queryForMap(
                    "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                    email);
            auth.verify((UUID) challenge.get("id"), email, "REGISTER", code, ip);
            db.update(
                    "UPDATE thanh_viens SET profile_approved = true, trang_thai_tai_khoan = 'HOAT_DONG', diem_uy_tin = 100 WHERE email = ?",
                    email);
        }
        return auth.login(email, PASSWORD, "mobile", ip).token();
    }

    @Test
    void uploadsValidImagesServesPubliclyWithSecurityHeadersAndWorksWithInventory() {
        byte[] jpeg = MediaMagicBytesUnitTest.sampleJpeg();
        byte[] png = MediaMagicBytesUnitTest.samplePng();
        byte[] webp = MediaMagicBytesUnitTest.sampleWebp();

        var uploadRes = given()
                .auth().oauth2(activeToken)
                .multiPart("files", "photo1.bin", jpeg, "application/octet-stream")
                .multiPart("files", "photo2.png", png, "image/png")
                .multiPart("files", "photo3.webp", webp, "image/webp")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(201)
                .body("items", hasSize(3))
                .body("items[0].contentType", equalTo("image/jpeg"))
                .body("items[0].sizeBytes", equalTo(jpeg.length))
                .body("items[0].url", startsWith("http://localhost:" + serverPort + "/api/v1/media/"))
                .body("items[1].contentType", equalTo("image/png"))
                .body("items[2].contentType", equalTo("image/webp"))
                .extract();

        String mediaId = uploadRes.jsonPath().getString("items[0].id");
        String mediaUrl = uploadRes.jsonPath().getString("items[0].url");

        // Public GET without auth serves exact bytes with verified headers
        byte[] fetched = given()
                .when()
                .get("/api/v1/media/{id}", mediaId)
                .then()
                .statusCode(200)
                .contentType("image/jpeg")
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .header("Cache-Control", containsString("public"))
                .header("Cache-Control", containsString("max-age=31536000"))
                .header("Cache-Control", containsString("immutable"))
                .extract()
                .asByteArray();
        assertThat(fetched).isEqualTo(jpeg);

        // Uploaded absolute URL works seamlessly in P1-03 Inventory API
        given()
                .auth().oauth2(activeToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", "Giáo trình Giải tích 1",
                        "tinhTrang", "Còn mới 95%",
                        "hinhAnh", List.of(mediaUrl)
                ))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(201)
                .body("hinhAnh[0]", equalTo(mediaUrl));
    }

    @Test
    void enforcesAuthValidationSizeAndNotFoundRules() {
        byte[] jpeg = MediaMagicBytesUnitTest.sampleJpeg();

        // Unauthenticated upload -> 401
        given()
                .multiPart("files", "a.jpg", jpeg, "image/jpeg")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(401);

        // Pending account -> 403
        given()
                .auth().oauth2(pendingToken)
                .multiPart("files", "a.jpg", jpeg, "image/jpeg")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(403);

        // Spoofed SVG disguised as JPEG -> 400 INVALID_MEDIA
        given()
                .auth().oauth2(activeToken)
                .multiPart("files", "fake.jpg", "<svg>x</svg>".getBytes(StandardCharsets.UTF_8), "image/jpeg")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_MEDIA"));

        // >5 files -> 400 INVALID_MEDIA
        given()
                .auth().oauth2(activeToken)
                .multiPart("files", "1.jpg", jpeg, "image/jpeg")
                .multiPart("files", "2.jpg", jpeg, "image/jpeg")
                .multiPart("files", "3.jpg", jpeg, "image/jpeg")
                .multiPart("files", "4.jpg", jpeg, "image/jpeg")
                .multiPart("files", "5.jpg", jpeg, "image/jpeg")
                .multiPart("files", "6.jpg", jpeg, "image/jpeg")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_MEDIA"));

        // >5MB file (service validation) -> 413 FILE_TOO_LARGE
        byte[] tooBig = new byte[5 * 1024 * 1024 + 10];
        tooBig[0] = (byte) 0xFF;
        tooBig[1] = (byte) 0xD8;
        tooBig[2] = (byte) 0xFF;
        given()
                .auth().oauth2(activeToken)
                .multiPart("files", "huge.jpg", tooBig, "image/jpeg")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(413)
                .body("code", equalTo("FILE_TOO_LARGE"));

        // >6MB file (Spring MaxUploadSizeExceededException -> AuthErrors) -> 413 FILE_TOO_LARGE
        byte[] overServletLimit = new byte[6 * 1024 * 1024 + 64 * 1024];
        overServletLimit[0] = (byte) 0xFF;
        overServletLimit[1] = (byte) 0xD8;
        overServletLimit[2] = (byte) 0xFF;
        given()
                .auth().oauth2(activeToken)
                .multiPart("files", "massive.jpg", overServletLimit, "image/jpeg")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(413)
                .body("code", equalTo("FILE_TOO_LARGE"));

        // Missing files part -> 400 INVALID_MEDIA
        given()
                .auth().oauth2(activeToken)
                .multiPart("wrongPart", "a.jpg", jpeg, "image/jpeg")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_MEDIA"));

        // Unknown UUID -> 404 MEDIA_NOT_FOUND; malformed UUID -> 400 INVALID_INPUT
        given()
                .when()
                .get("/api/v1/media/{id}", UUID.randomUUID())
                .then()
                .statusCode(404)
                .body("code", equalTo("MEDIA_NOT_FOUND"));

        given()
                .when()
                .get("/api/v1/media/not-a-uuid")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Locked account -> 403 ACCOUNT_RESTRICTED
        db.update(
                "UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA', loai_han_che = 'KHOA_TAM_THOI', ly_do_han_che = 'Vi phạm' WHERE user_id = ?",
                activeUserId);
        given()
                .auth().oauth2(activeToken)
                .multiPart("files", "a.jpg", jpeg, "image/jpeg")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"));
    }

    @Test
    void inventoryReleasesEditAndDeleteWhenLinkedListingsAreWithdrawnOrExpired() {
        String itemIdStr = given()
                .auth().oauth2(activeToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "ten", "Bàn gấp sinh viên",
                        "tinhTrang", "Mới 90%",
                        "hinhAnh", List.of("https://img.example/desk.jpg")
                ))
                .post("/api/v1/inventory")
                .then()
                .statusCode(201)
                .extract().jsonPath().getString("id");

        UUID itemId = UUID.fromString(itemIdStr);
        UUID listingId = UUID.randomUUID();
        db.update(
                "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) VALUES (?, ?, 'Tin bàn gấp', 120000, 'CONG_KHAI')",
                listingId, activeUserId);
        db.update("INSERT INTO tin_dang_do_vat(ma_tin, ma_vat) VALUES (?, ?)", listingId, itemId);

        // Active CONG_KHAI blocks edit/delete
        given()
                .auth().oauth2(activeToken)
                .get("/api/v1/inventory/{id}", itemId)
                .then()
                .statusCode(200)
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(false));

        // Transition listing to DA_RUT -> releases edit & delete
        db.update("UPDATE tin_dangs SET trang_thai = 'DA_RUT' WHERE ma_tin = ?", listingId);

        given()
                .auth().oauth2(activeToken)
                .get("/api/v1/inventory/{id}", itemId)
                .then()
                .statusCode(200)
                .body("linkedListingCount", equalTo(0))
                .body("canEdit", equalTo(true))
                .body("canDelete", equalTo(true));

        given()
                .auth().oauth2(activeToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "tinhTrang", "Đã lau sạch, còn mới 92%",
                        "hinhAnh", List.of("https://img.example/desk2.jpg"),
                        "version", 0
                ))
                .put("/api/v1/inventory/{id}", itemId)
                .then()
                .statusCode(200)
                .body("version", equalTo(1));

        // Transition listing to HET_HAN -> still allows delete cleanly
        db.update("UPDATE tin_dangs SET trang_thai = 'HET_HAN' WHERE ma_tin = ?", listingId);

        given()
                .auth().oauth2(activeToken)
                .delete("/api/v1/inventory/{id}?version=1", itemId)
                .then()
                .statusCode(204);
    }
}
