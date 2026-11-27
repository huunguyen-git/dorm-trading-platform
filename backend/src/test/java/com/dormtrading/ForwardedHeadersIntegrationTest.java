package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Kiểm thử Forwarded Headers từ Nginx Edge Proxy")
class ForwardedHeadersIntegrationTest extends BaseIntegrationTest {

    private static final String CLIENT_IP_1 = "203.0.113.10";
    private static final String CLIENT_IP_2 = "203.0.113.20";

    @Autowired
    private JdbcTemplate db;

    @BeforeEach
    @AfterEach
    void cleanIpEvents() {
        db.update(
                "DELETE FROM auth_event WHERE subject IN (?, ?)",
                "ip:" + CLIENT_IP_1,
                "ip:" + CLIENT_IP_2
        );
    }

    @Test
    @DisplayName("Phân giải X-Forwarded-For từ proxy nội bộ thành IP client riêng biệt cho rate limit")
    void resolvesDistinctClientIpsThroughTrustedProxy() {
        String email1 = "xff1-" + UUID.randomUUID().toString().substring(0, 8) + "@student.edu.vn";
        String email2 = "xff2-" + UUID.randomUUID().toString().substring(0, 8) + "@student.edu.vn";

        given()
            .contentType(ContentType.JSON)
            .header("X-Forwarded-For", CLIENT_IP_1)
            .body(Map.of("email", email1, "purpose", "REGISTER"))
        .when()
            .post("/api/v1/auth/otp/resend")
        .then()
            .statusCode(200);

        given()
            .contentType(ContentType.JSON)
            .header("X-Forwarded-For", CLIENT_IP_2)
            .body(Map.of("email", email2, "purpose", "REGISTER"))
        .when()
            .post("/api/v1/auth/otp/resend")
        .then()
            .statusCode(200);

        List<String> recordedSubjects = db.queryForList(
                "SELECT subject FROM auth_event WHERE subject IN (?, ?) AND kind = 'REQUEST'",
                String.class,
                "ip:" + CLIENT_IP_1,
                "ip:" + CLIENT_IP_2
        );

        assertThat(recordedSubjects)
                .containsExactlyInAnyOrder("ip:" + CLIENT_IP_1, "ip:" + CLIENT_IP_2);
    }
}
