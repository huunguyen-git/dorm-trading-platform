package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.OtpDelivery;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.util.*;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class OtpSmtpIntegrationTest extends BaseIntegrationTest {
    @Container static final GenericContainer<?> SMTP = new GenericContainer<>("maildev/maildev:2.1.0").withExposedPorts(1025,1080);
    @DynamicPropertySource static void smtp(DynamicPropertyRegistry properties) {
        properties.add("spring.mail.host",SMTP::getHost);
        properties.add("spring.mail.port",() -> SMTP.getMappedPort(1025));
    }
    @Autowired OtpDelivery delivery;
    @Test void realSmtpReceivesQueuedOtpAndHttpVerificationSucceeds() {
        String id=UUID.randomUUID().toString().substring(0,12),email="smtp"+id+"@student.edu.vn";
        var registration=given().contentType("application/json").body(Map.of("name","SMTP Test","studentId",id,"email",email,"password","orchid ocean compass brass 9384"))
                .post("/api/v1/auth/register");
        assertThat(registration.statusCode()).isEqualTo(201);
        delivery.deliver();
        String mailUrl="http://"+SMTP.getHost()+":"+SMTP.getMappedPort(1080);
        List<Map<String,Object>> messages=given().get(mailUrl+"/email").jsonPath().getList("$");
        var delivered=messages.stream().filter(message -> message.get("to").toString().contains(email)).findFirst();
        assertThat(delivered).isPresent();
        var detail=given().get(mailUrl+"/email/"+delivered.orElseThrow().get("id"));
        var matcher=java.util.regex.Pattern.compile("[0-9]{6}").matcher(detail.jsonPath().getString("text"));
        assertThat(matcher.find()).isTrue();
        given().contentType("application/json").body(Map.of("challengeId",registration.jsonPath().getString("challengeId"),"email",email,"purpose","REGISTER","code",matcher.group()))
                .post("/api/v1/auth/otp/verify").then().statusCode(200).body("emailVerified",org.hamcrest.Matchers.equalTo(true));
        var login=given().contentType("application/json").body(Map.of("email",email,"password","orchid ocean compass brass 9384","client","mobile"))
                .post("/api/v1/auth/login");
        assertThat(login.statusCode()).isEqualTo(200);
        assertThat(login.jsonPath().getBoolean("user.profileApproved")).isFalse();
    }
}
