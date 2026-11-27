package com.dormtrading.iam;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import javax.crypto.spec.SecretKeySpec;
import com.dormtrading.iam.auth.AccountRestrictedFailure;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.iam.auth.AuthService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
class SecurityConfig {

    private static final class RestrictedBearerTokenException extends AuthenticationException {
        final AccountRestrictedFailure failure;

        RestrictedBearerTokenException(AccountRestrictedFailure failure) {
            super(failure.getMessage(), failure);
            this.failure = failure;
        }
    }

    @Bean
    JwtDecoder jwtDecoder(@Value("${app.jwt.secret}") String encodedKey) {
        byte[] key = Base64.getDecoder().decode(encodedKey);
        if (key.length < 32) throw new IllegalArgumentException("JWT_SECRET requires at least 32 Base64-encoded key bytes");
        var decoder = NimbusJwtDecoder.withSecretKey(new SecretKeySpec(key, "HmacSHA256")).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer("dorm-trading"),
                new JwtTimestampValidator(java.time.Duration.ZERO),
                new JwtClaimValidator<>(JwtClaimNames.EXP, java.util.Objects::nonNull)));
        return decoder;
    }

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, AuthService authService, ObjectMapper objectMapper) throws Exception {
        var defaultEntryPoint = new BearerTokenAuthenticationEntryPoint();
        var defaultAccessDenied = new BearerTokenAccessDeniedHandler();

        AuthenticationEntryPoint entryPoint = (request, response, authException) -> {
            if (authException instanceof RestrictedBearerTokenException restricted) {
                response.setStatus(HttpStatus.FORBIDDEN.value());
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                objectMapper.writeValue(response.getWriter(), restricted.failure.toBody());
            } else {
                defaultEntryPoint.commence(request, response, authException);
            }
        };

        AccessDeniedHandler accessDeniedHandler = (request, response, accessDeniedException) -> {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth instanceof JwtAuthenticationToken jwtAuth) {
                var activeRestriction = authService.findActiveRestriction(jwtAuth.getToken());
                if (activeRestriction.isPresent()) {
                    response.setStatus(HttpStatus.FORBIDDEN.value());
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                    objectMapper.writeValue(response.getWriter(), activeRestriction.get().toBody());
                    return;
                }
            }
            defaultAccessDenied.handle(request, response, accessDeniedException);
        };

        return http.csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers.cacheControl(Customizer.withDefaults()))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .authorizeHttpRequests(auth -> auth
                        // /error là forward nội bộ: chặn nó biến mọi 4xx/5xx thật thành 403.
                        .requestMatchers("/error").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/health", "/api/v1/listings").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/refresh",
                                "/api/v1/auth/otp/resend", "/api/v1/auth/otp/verify", "/api/v1/auth/password/reset").permitAll()
                        .requestMatchers("/api/v1/auth/**").authenticated()
                        .requestMatchers("/api/v1/profile/**").authenticated()
                        .requestMatchers("/api/v1/admin/senior/**").hasRole("SENIOR_ADMIN")
                        .requestMatchers("/api/v1/admin/**").hasRole("MODERATOR")
                        .requestMatchers("/api/v1/**").hasRole("MEMBER")
                        .anyRequest().denyAll())
                .oauth2ResourceServer(server -> server
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(accessDeniedHandler)
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(token -> {
                            try {
                                var user = authService.me(token);
                                var roles = user.roles().stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role)).toList();
                                return new JwtAuthenticationToken(token, roles);
                            } catch (AccountRestrictedFailure e) {
                                throw new RestrictedBearerTokenException(e);
                            } catch (AuthFailure e) {
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
        cors.setExposedHeaders(List.of("WWW-Authenticate", "Retry-After"));
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        return source;
    }
}
