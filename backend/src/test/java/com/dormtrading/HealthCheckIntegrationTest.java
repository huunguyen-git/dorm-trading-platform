package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

@DisplayName("Kiểm thử Tích hợp Endpoint Kết nối Đa nền tảng (/api/v1/health)")
class HealthCheckIntegrationTest extends BaseIntegrationTest {

    @Test
    @DisplayName("Endpoint /api/v1/health phải mở công khai (permitAll) và trả về trạng thái UP & DB CONNECTED")
    void shouldReturnHealthStatusSuccessfully() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/health")
        .then()
            .statusCode(200)
            .body("status", equalTo("UP"))
            .body("service", equalTo("dorm-trading-backend"))
            .body("database", equalTo("CONNECTED"))
            .body("timestamp", notNullValue());
    }
}
