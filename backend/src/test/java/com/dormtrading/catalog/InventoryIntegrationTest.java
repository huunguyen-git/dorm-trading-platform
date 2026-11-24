package com.dormtrading.catalog;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

class InventoryIntegrationTest extends BaseIntegrationTest {

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

    private String userToken;
    private UUID userId;
    private String userEmail;

    private String secondUserToken;
    @SuppressWarnings("unused")
    private UUID secondUserId;

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
        userEmail = "u" + student1 + "@student.edu.vn";
        userToken = createActiveUser("Nguyen Van A", student1, userEmail);
        userId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, userEmail);

        String student2 = UUID.randomUUID().toString().substring(0, 10);
        String email2 = "u" + student2 + "@student.edu.vn";
        secondUserToken = createActiveUser("Tran Van B", student2, email2);
        secondUserId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email2);
    }

    private String createActiveUser(String name, String studentId, String email) {
        String ip = "10.0." + (Math.abs(studentId.hashCode()) % 250) + ".1";
        auth.register(name, studentId, email, PASSWORD, ip);
        delivery.deliver();
        String code = codes.get(email);
        var challenge = db.queryForMap(
                "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                email);
        auth.verify((UUID) challenge.get("id"), email, "REGISTER", code, ip);
        db.update("UPDATE thanh_viens SET profile_approved = true, trang_thai_tai_khoan = 'HOAT_DONG', diem_uy_tin = 100 WHERE email = ?", email);
        var session = auth.login(email, PASSWORD, "mobile", ip);
        return session.token();
    }

    @Test
    void testCreateItemSuccessAndList() {
        var createBody = Map.of(
                "ten", "Nồi cơm điện mini Sharp",
                "tinhTrang", "Đã qua sử dụng 1 học kỳ, còn mới 90%",
                "hinhAnh", List.of("https://res.cloudinary.com/img1.jpg", "https://res.cloudinary.com/img2.jpg")
        );

        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(201)
                .body("ten", equalTo("Nồi cơm điện mini Sharp"))
                .body("tinhTrang", equalTo("Đã qua sử dụng 1 học kỳ, còn mới 90%"))
                .body("hinhAnh", hasSize(2))
                .body("trangThai", equalTo("KHA_DUNG"))
                .body("canEdit", equalTo(true))
                .body("canDelete", equalTo(true))
                .body("version", equalTo(0))
                .extract().jsonPath().getString("id");

        UUID itemId = UUID.fromString(itemIdStr);

        // List should return this item
        given()
                .auth().oauth2(userToken)
                .when()
                .get("/api/v1/inventory")
                .then()
                .statusCode(200)
                .body("$", hasSize(1))
                .body("[0].id", equalTo(itemIdStr))
                .body("[0].ten", equalTo("Nồi cơm điện mini Sharp"))
                .body("[0].canEdit", equalTo(true))
                .body("[0].canDelete", equalTo(true));

        // Detail endpoint
        given()
                .auth().oauth2(userToken)
                .when()
                .get("/api/v1/inventory/{id}", itemId)
                .then()
                .statusCode(200)
                .body("id", equalTo(itemIdStr))
                .body("hinhAnh", hasSize(2))
                .body("linkedListings", empty());

        // Other user cannot view this item (404)
        given()
                .auth().oauth2(secondUserToken)
                .when()
                .get("/api/v1/inventory/{id}", itemId)
                .then()
                .statusCode(404);
    }

    @Test
    void testCreateItemValidationErrors() {
        // Empty name
        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "  ", "tinhTrang", "Tot", "hinhAnh", List.of("http://img1.jpg")))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Empty description
        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Bàn học", "tinhTrang", "  ", "hinhAnh", List.of("http://img1.jpg")))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Missing images (empty list)
        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Bàn học", "tinhTrang", "Con tot", "hinhAnh", List.of()))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Exceeding 5 images (6 images)
        List<String> sixImages = List.of("img1", "img2", "img3", "img4", "img5", "img6");
        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Bàn học", "tinhTrang", "Con tot", "hinhAnh", sixImages))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        // Blank image string in array
        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Bàn học", "tinhTrang", "Con tot", "hinhAnh", List.of("   ")))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));
    }

    @Test
    void testUpdateItemSuccessAndVersionIncrement() {
        var createBody = Map.of(
                "ten", "Quạt đứng Senko",
                "tinhTrang", "Mới 80%",
                "hinhAnh", List.of("https://img1.jpg")
        );
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        var updateBody = Map.of(
                "tinhTrang", "Mới 95%, kèm remote điều khiển",
                "hinhAnh", List.of("https://img1_new.jpg", "https://img2_new.jpg"),
                "version", 0
        );

        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(updateBody)
                .when()
                .put("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(200)
                .body("tinhTrang", equalTo("Mới 95%, kèm remote điều khiển"))
                .body("hinhAnh", hasSize(2))
                .body("version", equalTo(1));

        // Verify updated version in DB
        Long dbVersion = db.queryForObject("SELECT version FROM do_vats WHERE ma_vat = ?", Long.class, UUID.fromString(itemIdStr));
        assertThat(dbVersion).isEqualTo(1L);
    }

    @Test
    void testUpdateItemConflictWhenVersionMismatched() {
        var createBody = Map.of(
                "ten", "Bàn phím cơ",
                "tinhTrang", "Red switch",
                "hinhAnh", List.of("https://img1.jpg")
        );
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        var updateBody = Map.of(
                "tinhTrang", "Blue switch",
                "hinhAnh", List.of("https://img2.jpg"),
                "version", 99
        );

        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(updateBody)
                .when()
                .put("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));
    }

    @Test
    void testUpdateAndBlockWhenStatusNotKhaDung() {
        var createBody = Map.of(
                "ten", "Ấm siêu tốc Lock&Lock",
                "tinhTrang", "Dung tích 1.8L",
                "hinhAnh", List.of("https://img1.jpg")
        );
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        // Manually transition status to DANG_GIU
        db.update("UPDATE do_vats SET trang_thai = 'DANG_GIU' WHERE ma_vat = ?", UUID.fromString(itemIdStr));

        // GET detail should show canEdit=false, canDelete=false
        given()
                .auth().oauth2(userToken)
                .when()
                .get("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(200)
                .body("canEdit", equalTo(false))
                .body("canDelete", equalTo(false))
                .body("trangThai", equalTo("DANG_GIU"));

        // PUT update must be rejected with 409
        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("tinhTrang", "Dung tích 1.8L da sua", "hinhAnh", List.of("https://img2.jpg"), "version", 0))
                .when()
                .put("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(409)
                .body("code", equalTo("ITEM_STATUS_CONFLICT"));

        // DELETE must also be rejected with 409
        given()
                .auth().oauth2(userToken)
                .when()
                .delete("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(409)
                .body("code", equalTo("ITEM_STATUS_CONFLICT"));
    }

    @Test
    void testUpdateAndBlockWhenLinkedToListing() {
        var createBody = Map.of(
                "ten", "Giá sách gỗ 3 tầng",
                "tinhTrang", "Gỗ cao su chắc chắn",
                "hinhAnh", List.of("https://img1.jpg")
        );
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        UUID itemId = UUID.fromString(itemIdStr);
        UUID listingId = UUID.randomUUID();

        // Create a listing and link the item in tin_dang_do_vat
        db.update("INSERT INTO tin_dangs (ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) VALUES (?, ?, 'Tin thanh lý giá sách', 100000, 'CONG_KHAI')",
                listingId, userId);
        db.update("INSERT INTO tin_dang_do_vat (ma_tin, ma_vat) VALUES (?, ?)", listingId, itemId);

        // GET inventory list should reflect linkedListingCount = 1 and canEdit = false, canDelete = false
        given()
                .auth().oauth2(userToken)
                .when()
                .get("/api/v1/inventory")
                .then()
                .statusCode(200)
                .body("[0].linkedListingCount", equalTo(1))
                .body("[0].canEdit", equalTo(false))
                .body("[0].canDelete", equalTo(false));

        // GET detail should contain the linked listing
        given()
                .auth().oauth2(userToken)
                .when()
                .get("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(200)
                .body("linkedListings", hasSize(1))
                .body("linkedListings[0].tieuDe", equalTo("Tin thanh lý giá sách"));

        // PUT must be rejected with 409
        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("tinhTrang", "Mô tả mới", "hinhAnh", List.of("https://img2.jpg"), "version", 0))
                .when()
                .put("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(409)
                .body("code", equalTo("ITEM_LINKED_TO_LISTING"));

        // DELETE must be rejected with 409
        given()
                .auth().oauth2(userToken)
                .when()
                .delete("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(409)
                .body("code", equalTo("ITEM_LINKED_TO_LISTING"));
    }

    @Test
    void testDeleteItemSuccess() {
        var createBody = Map.of(
                "ten", "Vợt cầu lông Yonex",
                "tinhTrang", "Căng cước 10.5kg",
                "hinhAnh", List.of("https://img1.jpg")
        );
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        // DELETE item
        given()
                .auth().oauth2(userToken)
                .when()
                .delete("/api/v1/inventory/{id}?version=0", itemIdStr)
                .then()
                .statusCode(204);

        // GET detail should now return 404
        given()
                .auth().oauth2(userToken)
                .when()
                .get("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(404);
    }

    @Test
    void testSecurityUnauthenticatedRejectedWith401() {
        given()
                .when()
                .get("/api/v1/inventory")
                .then()
                .statusCode(401);

        given()
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Test", "tinhTrang", "Test", "hinhAnh", List.of("img")))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(401);
    }

    @Test
    void testSecurityLockedUserRejectedWith403_WhenLocked() {
        // Create an item first while active
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Ghế xoay văn phòng", "tinhTrang", "Bọc nỉ", "hinhAnh", List.of("https://img.jpg")))
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        // Lock user account (BI_KHOA)
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'BI_KHOA' WHERE user_id = ?", userId);

        // All inventory operations must now return 403 ACCOUNT_RESTRICTED (AccountRestrictedFailure from main)
        given()
                .auth().oauth2(userToken)
                .when()
                .get("/api/v1/inventory")
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"));

        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Vat moi", "tinhTrang", "Tot", "hinhAnh", List.of("https://img.jpg")))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"));

        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("tinhTrang", "Sua mo ta", "hinhAnh", List.of("https://img.jpg"), "version", 0))
                .when()
                .put("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"));

        given()
                .auth().oauth2(userToken)
                .when()
                .delete("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(403)
                .body("code", equalTo("ACCOUNT_RESTRICTED"));
    }

    @Test
    void testConcurrencyOptimisticLockingOnUpdate() throws Exception {
        var createBody = Map.of(
                "ten", "Máy tính Casio fx-580VN X",
                "tinhTrang", "Còn dùng tốt, đầy đủ nắp",
                "hinhAnh", List.of("https://img.jpg")
        );
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        // Run 2 concurrent updates with version = 0
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> updateTask1 = () -> given()
                    .auth().oauth2(userToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("tinhTrang", "Update thread 1", "hinhAnh", List.of("https://img1.jpg"), "version", 0))
                    .put("/api/v1/inventory/{id}", itemIdStr)
                    .statusCode();

            Callable<Integer> updateTask2 = () -> given()
                    .auth().oauth2(userToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("tinhTrang", "Update thread 2", "hinhAnh", List.of("https://img2.jpg"), "version", 0))
                    .put("/api/v1/inventory/{id}", itemIdStr)
                    .statusCode();

            var results = executor.invokeAll(List.of(updateTask1, updateTask2));
            List<Integer> statusCodes = List.of(results.get(0).get(), results.get(1).get());

            // Exactly one should succeed with 200, the other must fail with 409 Conflict
            assertThat(statusCodes).containsExactlyInAnyOrder(200, 409);
        }
    }

    @Test
    void testDeleteItemConflict_WhenVersionMismatch() {
        var createBody = Map.of(
                "ten", "Quạt đứng Senko",
                "tinhTrang", "Chạy êm",
                "hinhAnh", List.of("https://img.jpg")
        );
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        // Try deleting with wrong version 99
        given()
                .auth().oauth2(userToken)
                .when()
                .delete("/api/v1/inventory/{id}?version=99", itemIdStr)
                .then()
                .statusCode(409)
                .body("code", equalTo("VERSION_CONFLICT"));
    }

    @Test
    void testCrossUserAccessForbidden_Returns404() {
        var createBody = Map.of(
                "ten", "Đèn học Rạng Đông",
                "tinhTrang", "Tốt",
                "hinhAnh", List.of("https://img.jpg")
        );
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        // User 2 attempts to get detail
        given()
                .auth().oauth2(secondUserToken)
                .when()
                .get("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(404)
                .body("code", equalTo("ITEM_NOT_FOUND"));

        // User 2 attempts to update
        given()
                .auth().oauth2(secondUserToken)
                .contentType(ContentType.JSON)
                .body(Map.of("tinhTrang", "Hacked", "hinhAnh", List.of("https://img.jpg"), "version", 0))
                .when()
                .put("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(404)
                .body("code", equalTo("ITEM_NOT_FOUND"));

        // User 2 attempts to delete
        given()
                .auth().oauth2(secondUserToken)
                .when()
                .delete("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(404)
                .body("code", equalTo("ITEM_NOT_FOUND"));
    }

    @Test
    void testPendingActivationUserForbidden_Returns403() {
        // Change user status to CHO_KICH_HOAT
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'CHO_KICH_HOAT' WHERE user_id = ?", userId);

        given()
                .auth().oauth2(userToken)
                .when()
                .get("/api/v1/inventory")
                .then()
                .statusCode(403);
    }

    @Test
    void testValidation_ConditionTooLong_Returns400() {
        String longCondition = "A".repeat(2001);
        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Món đồ", "tinhTrang", longCondition, "hinhAnh", List.of("https://img.jpg")))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));
    }

    @Test
    void testValidation_InvalidImageUrlScheme_Returns400() {
        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Món đồ", "tinhTrang", "Tốt", "hinhAnh", List.of("javascript:alert(1)")))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));

        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Món đồ", "tinhTrang", "Tốt", "hinhAnh", List.of("data:image/png;base64,abc")))
                .when()
                .post("/api/v1/inventory")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));
    }

    @Test
    void testUpdateItem_EmptyNameRejectedWith400() {
        var createBody = Map.of(
                "ten", "Bàn gấp",
                "tinhTrang", "Mới",
                "hinhAnh", List.of("https://img.jpg")
        );
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "   ", "tinhTrang", "Cũ hơn", "hinhAnh", List.of("https://img.jpg"), "version", 0))
                .when()
                .put("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));
    }

    @Test
    void testInvalidUuidPath_Returns400() {
        given()
                .auth().oauth2(userToken)
                .when()
                .get("/api/v1/inventory/not-a-valid-uuid")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));
    }

    @Test
    void testUpdateItem_MissingVersion_Returns400() {
        var createBody = Map.of(
                "ten", "Đèn học mini",
                "tinhTrang", "Mới 90%",
                "hinhAnh", List.of("https://img.jpg")
        );
        String itemIdStr = given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(createBody)
                .post("/api/v1/inventory")
                .then().statusCode(201).extract().jsonPath().getString("id");

        given()
                .auth().oauth2(userToken)
                .contentType(ContentType.JSON)
                .body(Map.of("ten", "Đèn học sửa", "tinhTrang", "Cũ hơn", "hinhAnh", List.of("https://img.jpg")))
                .when()
                .put("/api/v1/inventory/{id}", itemIdStr)
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));
    }
}
