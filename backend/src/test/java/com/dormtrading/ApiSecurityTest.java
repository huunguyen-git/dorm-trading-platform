package com.dormtrading;

import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(ApiSecurityTest.AdminProbe.class)
class ApiSecurityTest {
    private static final String ADMIN_PATH = "/api/v1/admin/probe";
    private static final byte[] KEY = new byte[32];

    @DynamicPropertySource
    static void configureKey(DynamicPropertyRegistry registry) {
        registry.add("app.jwt.secret", () -> Base64.getEncoder().encodeToString(KEY));
    }

    @RestController
    static class AdminProbe {
        @GetMapping(ADMIN_PATH)
        String probe() {
            return "ok";
        }
    }

    @Autowired
    TestRestTemplate client;

    @Test
    void publicHealthWorksWithoutDatabase() {
        var response = client.getForEntity("/api/v1/health", com.fasterxml.jackson.databind.JsonNode.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        var body = response.getBody();
        assertThat(body.path("status").asText()).isEqualTo("UP");
        assertThat(body.path("service").asText()).isEqualTo("dorm-trading-backend");
        assertThat(Instant.parse(body.path("timestamp").asText())).isBeforeOrEqualTo(Instant.now());
    }

    @Test
    void protectedRoutesRequireToken() {
        assertThat(client.getForEntity(ADMIN_PATH, String.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(client.getForEntity("/api/v1/orders", String.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void rejectsInvalidSignatureAndLifetime() throws Exception {
        byte[] wrongKey = KEY.clone();
        wrongKey[0] = 1;
        assertThat(adminStatus(token("ADMIN", wrongKey, Instant.now().plusSeconds(300)))).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(adminStatus(token("ADMIN", KEY, Instant.now().minusSeconds(300)))).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(adminStatus(token("ADMIN", KEY, null))).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void requiresAdminRole() throws Exception {
        var expiry = Instant.now().plusSeconds(300);
        assertThat(adminStatus(token("MEMBER", KEY, expiry))).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(adminStatus(token("ADMIN", KEY, expiry))).isEqualTo(HttpStatus.OK);
    }

    private HttpStatusCode adminStatus(String token) {
        var headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return client.exchange(ADMIN_PATH, HttpMethod.GET, new HttpEntity<>(headers), String.class).getStatusCode();
    }

    private String token(String role, byte[] key, Instant expiration) throws Exception {
        var claims = new JWTClaimsSet.Builder().subject("test-user").claim("roles", List.of(role));
        if (expiration != null) {
            claims.expirationTime(Date.from(expiration));
        }
        var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims.build());
        jwt.sign(new MACSigner(key));
        return jwt.serialize();
    }
}
