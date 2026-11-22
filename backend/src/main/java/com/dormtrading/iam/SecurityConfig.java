package com.dormtrading.iam;

import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import javax.crypto.spec.SecretKeySpec;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.AuthFailure;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
class SecurityConfig {
    @Bean
    JwtDecoder jwtDecoder(@Value("${app.jwt.secret}") String encodedKey) {
        byte[] key = Base64.getDecoder().decode(encodedKey);
        if (key.length < 32)
            throw new IllegalArgumentException("JWT_SECRET requires at least 32 Base64-encoded key bytes");
        var decoder = NimbusJwtDecoder.withSecretKey(new SecretKeySpec(key, "HmacSHA256")).build();
        decoder.setJwtValidator(
                new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer("dorm-trading"),
                        new JwtTimestampValidator(java.time.Duration.ZERO),
                        new JwtClaimValidator<>(JwtClaimNames.EXP, java.util.Objects::nonNull)));
        return decoder;
    }

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, AuthService authService, JdbcTemplate db) throws Exception {
        return http.csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers.cacheControl(Customizer.withDefaults()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/api/v1/health", "/api/v1/listings").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/register", "/api/v1/auth/login",
                                "/api/v1/auth/refresh",
                                "/api/v1/auth/otp/resend", "/api/v1/auth/otp/verify", "/api/v1/auth/password/reset")
                        .permitAll()
                        .requestMatchers("/api/v1/auth/**").authenticated()
                        .requestMatchers("/api/v1/admin/senior/**").hasRole("SENIOR_ADMIN")
                        .requestMatchers("/api/v1/admin/**").hasRole("MODERATOR")
                        .requestMatchers("/api/v1/**").hasRole("MEMBER")
                        .anyRequest().denyAll())
                .oauth2ResourceServer(server -> server.jwt(jwt -> jwt.jwtAuthenticationConverter(token -> {
                    try {
                        var user = authService.me(token);
                        var roles = user.roles().stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                                .toList();
                        return new JwtAuthenticationToken(token, roles);
                    } catch (AuthFailure e) {
                        try {
                            UUID uid = UUID.fromString(token.getSubject());
                            var status = db.queryForList("select trang_thai_tai_khoan from thanh_viens where user_id=?",
                                    String.class, uid);
                            if (!status.isEmpty() && Set.of("BI_KHOA", "VO_HIEU_HOA").contains(status.getFirst())) {
                                return new JwtAuthenticationToken(token,
                                        List.of(new SimpleGrantedAuthority("ROLE_LOCKED")));
                            }
                        } catch (Exception ignored) {
                        }
                        throw new InvalidBearerTokenException("Session is invalid");
                    }
                })))
                .build();
    }

    @Bean
    UrlBasedCorsConfigurationSource corsConfigurationSource(@Value("${app.cors.origins}") List<String> origins) {
        var cors = new CorsConfiguration();
        cors.setAllowedOrigins(origins);
        cors.setAllowCredentials(true);
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        cors.setExposedHeaders(List.of("WWW-Authenticate"));
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        return source;
    }
}
