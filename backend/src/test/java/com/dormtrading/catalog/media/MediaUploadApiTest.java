package com.dormtrading.catalog.media;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
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
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
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
    private String otherToken;
    private UUID otherUserId;
    private String moderatorToken;
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

        String studentOther = UUID.randomUUID().toString().substring(0, 10);
        String emailOther = "media_other_" + studentOther + "@student.edu.vn";
        otherToken = registerUser(studentOther, emailOther, true);
        otherUserId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, emailOther);

        String studentMod = UUID.randomUUID().toString().substring(0, 10);
        String emailMod = "media_mod_" + studentMod + "@student.edu.vn";
        registerUser(studentMod, emailMod, true);
        UUID modId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, emailMod);
        db.update(
                "INSERT INTO vai_tro_quan_tri(user_id, loai_vai_tro, bat_dau) VALUES (?, 'KIEM_DUYET_VIEN', ?)",
                modId,
                Timestamp.from(Instant.now().minusSeconds(60))
        );
        moderatorToken = given()
                .header("Origin", "http://localhost:5173")
                .contentType(ContentType.JSON)
                .body(Map.of("email", emailMod, "password", PASSWORD, "client", "admin-web"))
                .post("/api/v1/auth/login")
                .then()
                .statusCode(200)
                .extract().jsonPath().getString("token");

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
    void uploadsValidImagesReturnsRelativeUrlsStripsExifEnforcesVisibilityAndCachePolicy() throws Exception {
        byte[] dirtyJpeg = MediaMagicBytesUnitTest.jpegWithExifOrientation6AndGps();
        byte[] dirtyPng = MediaMagicBytesUnitTest.pngWithTextMetadata();
        byte[] dirtyWebp = MediaMagicBytesUnitTest.webpWithExifAndXmp();

        // Spoofed Host header MUST NOT pollute returned URL or DB (relative /api/v1/media/{id} only)
        var uploadRes = given()
                .auth().oauth2(activeToken)
                .header("Host", "evil.attacker.example")
                .multiPart("files", "photo1.bin", dirtyJpeg, "application/octet-stream")
                .multiPart("files", "photo2.png", dirtyPng, "image/png")
                .multiPart("files", "photo3.webp", dirtyWebp, "image/webp")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(201)
                .body("items", hasSize(3))
                .body("items[0].contentType", equalTo("image/jpeg"))
                .body("items[0].url", startsWith("/api/v1/media/"))
                .body("items[0].url", not(containsString("evil.attacker.example")))
                .body("items[1].contentType", equalTo("image/png"))
                .body("items[1].url", startsWith("/api/v1/media/"))
                .body("items[2].contentType", equalTo("image/webp"))
                .body("items[2].url", startsWith("/api/v1/media/"))
                .extract();

        String mediaId = uploadRes.jsonPath().getString("items[0].id");
        String mediaUrl = uploadRes.jsonPath().getString("items[0].url");
        assertThat(mediaUrl).isEqualTo("/api/v1/media/" + mediaId);

        // 1. Unattached media: anonymous & other user receive 404 MEDIA_NOT_FOUND
        given().when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(404).body("code", equalTo("MEDIA_NOT_FOUND"));
        given().auth().oauth2(otherToken).when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(404).body("code", equalTo("MEDIA_NOT_FOUND"));

        // 2. Owner and moderator CAN read unattached media with private, no-store cache headers & EXIF stripped
        byte[] ownerFetched = given()
                .auth().oauth2(activeToken)
                .when()
                .get("/api/v1/media/{id}", mediaId)
                .then()
                .statusCode(200)
                .contentType("image/jpeg")
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .header("Cache-Control", containsString("private"))
                .header("Cache-Control", containsString("no-store"))
                .header("Vary", containsString("Authorization"))
                .extract()
                .asByteArray();
        assertThat(new String(ownerFetched, StandardCharsets.ISO_8859_1)).doesNotContain("Exif", "GPS:10.8782");
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(ownerFetched));
        assertThat(decoded).isNotNull();
        assertThat(decoded.getWidth()).isEqualTo(2);
        assertThat(decoded.getHeight()).isEqualTo(4);

        given().auth().oauth2(moderatorToken).when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(200)
                .header("Cache-Control", containsString("private"))
                .header("Cache-Control", containsString("no-store"));

        // 3. Relative URL works seamlessly in P1-03 Inventory API (still private while unlisted!)
        String itemId = given()
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
                .body("hinhAnh[0]", equalTo(mediaUrl))
                .extract().jsonPath().getString("id");

        // Cross-user exfiltration attempt: another user embedding owner's media URL in their CONG_KHAI listing MUST NOT make it public
        UUID attackerListingId = UUID.randomUUID();
        db.update(
                "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai, hinh_anh, expires_at) " +
                        "VALUES (?, ?, 'Tin đánh cắp ảnh', 50000, 'CONG_KHAI', ARRAY[?], ?)",
                attackerListingId, otherUserId, mediaUrl, Timestamp.from(Instant.now().plus(20, ChronoUnit.DAYS))
        );
        given().when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(404).body("code", equalTo("MEDIA_NOT_FOUND"));

        // 4. Draft (NHAP) listing by owner keeps media private
        String listingId = given()
                .auth().oauth2(activeToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "action", "DRAFT",
                        "title", "Bản nháp có ảnh nội bộ",
                        "description", "Mô tả đầy đủ",
                        "condition", "Mới 95%",
                        "priceVnd", 45000,
                        "categoryId", "GT_CNTT",
                        "locationCode", "UIT",
                        "images", List.of(mediaUrl),
                        "itemIds", List.of(UUID.fromString(itemId))
                ))
                .post("/api/v1/listings")
                .then()
                .statusCode(201)
                .body("listing.images[0]", equalTo(mediaUrl))
                .extract().jsonPath().getString("listing.id");

        given().when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(404).body("code", equalTo("MEDIA_NOT_FOUND"));

        // 5. Publishing listing makes media publicly accessible with short-lived revalidating cache + ETag (NEVER immutable / 1 year)
        given()
                .auth().oauth2(activeToken)
                .contentType(ContentType.JSON)
                .body(Map.of("version", 0))
                .post("/api/v1/listings/{id}/publish", listingId)
                .then()
                .statusCode(200)
                .body("listing.status", equalTo("CONG_KHAI"));

        var publicRes = given()
                .when()
                .get("/api/v1/media/{id}", mediaId)
                .then()
                .statusCode(200)
                .contentType("image/jpeg")
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .header("Cache-Control", containsString("public"))
                .header("Cache-Control", containsString("max-age=300"))
                .header("Cache-Control", containsString("must-revalidate"))
                .header("Cache-Control", not(containsString("immutable")))
                .header("Cache-Control", not(containsString("31536000")))
                .header("ETag", notNullValue())
                .extract();
        String eTag = publicRes.header("ETag");

        // Conditional GET with matching ETag returns 304 Not Modified
        given()
                .header("If-None-Match", eTag)
                .when()
                .get("/api/v1/media/{id}", mediaId)
                .then()
                .statusCode(304)
                .header("ETag", equalTo(eTag));

        // 5b. Cross-user moderation-hidden (AN) listing referencing victim's public media MUST NOT DoS victim's public photo!
        UUID attackerHiddenListingId = UUID.randomUUID();
        db.update(
                "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai, hinh_anh, ly_do_an) " +
                        "VALUES (?, ?, 'Tin spam của kẻ tấn công', 10000, 'AN', ARRAY[?], 'Spam')",
                attackerHiddenListingId, otherUserId, mediaUrl
        );
        given().when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(200)
                .header("ETag", equalTo(eTag));

        // 6. Owner's own moderation-hidden (AN) listing immediately revokes public visibility (even with cached If-None-Match ETag!)
        db.update("UPDATE tin_dangs SET trang_thai = 'AN', ly_do_an = 'Vi phạm hình ảnh' WHERE ma_tin = ?",
                UUID.fromString(listingId));

        given().when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(404).body("code", equalTo("MEDIA_NOT_FOUND"));
        given().header("If-None-Match", eTag).when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(404).body("code", equalTo("MEDIA_NOT_FOUND"));
        given().auth().oauth2(otherToken).when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(404).body("code", equalTo("MEDIA_NOT_FOUND"));
        // Owner & moderator still access evidence with private, no-store
        given().auth().oauth2(activeToken).when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(200).header("Cache-Control", containsString("no-store"));
        given().auth().oauth2(moderatorToken).when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(200).header("Cache-Control", containsString("no-store"));

        // 7. Restoring to CONG_KHAI then locking seller (BI_KHOA) also revokes public visibility
        db.update("UPDATE tin_dangs SET trang_thai = 'CONG_KHAI', ly_do_an = NULL WHERE ma_tin = ?",
                UUID.fromString(listingId));
        given().when().get("/api/v1/media/{id}", mediaId).then().statusCode(200);

        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA' WHERE user_id = ?", activeUserId);
        given().when().get("/api/v1/media/{id}", mediaId).then()
                .statusCode(404).body("code", equalTo("MEDIA_NOT_FOUND"));
    }

    @Autowired
    private MediaService mediaService;

    @Autowired
    private LocalDiskMediaStorage diskMediaStorage;

    @Test
    void cleanupOrphanFilesSweepsOrphansBeyondFirstBatchWithoutStarvation() throws Exception {
        // Seed 6 legitimate tracked files (exceeding maxDeletes=3) + 2 orphan files on disk older than 2 hours
        Instant twoHoursAgo = Instant.now().minus(2, ChronoUnit.HOURS);
        String sha = "b".repeat(64);
        String runTag = UUID.randomUUID().toString().substring(0, 8);
        List<String> trackedKeys = new java.util.ArrayList<>();
        for (int i = 0; i < 6; i++) {
            String key = "2020/01/tracked-" + runTag + "-" + i + ".jpg";
            diskMediaStorage.store(key, MediaMagicBytesUnitTest.sampleJpeg());
            java.nio.file.Files.setLastModifiedTime(
                    diskMediaStorage.resolveSafePath(key),
                    java.nio.file.attribute.FileTime.from(twoHoursAgo)
            );
            db.update(
                    "INSERT INTO media_files(id, owner_id, storage_key, content_type, size_bytes, sha256) VALUES (?, ?, ?, 'image/jpeg', 1024, ?)",
                    UUID.randomUUID(), activeUserId, key, sha
            );
            trackedKeys.add(key);
        }

        String orphan1 = "2099/12/orphan-" + runTag + "-1.jpg";
        String orphan2 = "2099/12/orphan-" + runTag + "-2.jpg";
        String freshOrphan = "2099/12/fresh-orphan-" + runTag + ".jpg";
        for (String key : List.of(orphan1, orphan2, freshOrphan)) {
            diskMediaStorage.store(key, MediaMagicBytesUnitTest.sampleJpeg());
        }
        java.nio.file.Files.setLastModifiedTime(
                diskMediaStorage.resolveSafePath(orphan1),
                java.nio.file.attribute.FileTime.from(twoHoursAgo)
        );
        java.nio.file.Files.setLastModifiedTime(
                diskMediaStorage.resolveSafePath(orphan2),
                java.nio.file.attribute.FileTime.from(twoHoursAgo)
        );

        try {
            // maxDeletes=3 < 6 tracked files: previously starved forever; chunked visit MUST find & delete both old orphans!
            int deleted = mediaService.cleanupOrphanFiles(java.time.Duration.ofHours(1), 3);
            assertThat(deleted).isGreaterThanOrEqualTo(2);

            assertThat(java.nio.file.Files.exists(diskMediaStorage.resolveSafePath(orphan1))).isFalse();
            assertThat(java.nio.file.Files.exists(diskMediaStorage.resolveSafePath(orphan2))).isFalse();
            // Fresh (<1h) orphan must NOT be deleted (protects in-flight uploads)
            assertThat(java.nio.file.Files.exists(diskMediaStorage.resolveSafePath(freshOrphan))).isTrue();
            // All tracked files must remain intact
            for (String key : trackedKeys) {
                assertThat(java.nio.file.Files.exists(diskMediaStorage.resolveSafePath(key))).isTrue();
            }
        } finally {
            diskMediaStorage.deleteQuietly(freshOrphan);
            for (String key : trackedKeys) {
                diskMediaStorage.deleteQuietly(key);
            }
        }
    }

    @Test
    void enforcesAuthValidationSizeQuotaAndNotFoundRules() {
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

        // Corrupt truncated bytes with JPEG magic header only -> 400 INVALID_MEDIA
        given()
                .auth().oauth2(activeToken)
                .multiPart("files", "corrupt.jpg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00}, "image/jpeg")
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

        // Per-user storage quota enforcement -> 413 MEDIA_QUOTA_EXCEEDED
        String sha = "a".repeat(64);
        for (int i = 0; i < 100; i++) {
            db.update(
                    "INSERT INTO media_files(id, owner_id, storage_key, content_type, size_bytes, sha256) VALUES (?, ?, ?, 'image/jpeg', 1024, ?)",
                    UUID.randomUUID(), activeUserId, "2026/11/quota-" + activeUserId + "-" + i + ".jpg", sha
            );
        }
        given()
                .auth().oauth2(activeToken)
                .multiPart("files", "over-quota.jpg", jpeg, "image/jpeg")
                .when()
                .post("/api/v1/media/images")
                .then()
                .statusCode(413)
                .body("code", equalTo("MEDIA_QUOTA_EXCEEDED"));
        db.update("DELETE FROM media_files WHERE owner_id = ?", activeUserId);

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
