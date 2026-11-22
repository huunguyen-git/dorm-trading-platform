package com.dormtrading.iam.auth;

import java.time.Duration;
import java.util.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService auth;
    private final Set<String> origins;
    public AuthController(AuthService auth,@Value("${app.cors.origins}") List<String> origins) {
        this.auth=auth; this.origins=Set.copyOf(origins);
    }
    public record Register(String name,String studentId,String email,String password) {}
    public record Otp(String email,String purpose) {}
    public record Verify(UUID challengeId,String email,String purpose,String code) {}
    public record Login(String email,String password,String client) {}
    public record Refresh(String refreshToken,String client) {}
    public record Change(String currentPassword,String password) {}
    public record Reset(String resetToken,String password) {}
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthService.Challenge register(@RequestBody Register body,HttpServletRequest req) {
        return auth.register(body.name(),body.studentId(),body.email(),body.password(),req.getRemoteAddr());
    }
    @PostMapping("/otp/resend")
    public AuthService.Challenge resend(@RequestBody Otp body,HttpServletRequest req) {
        return auth.requestOtp(body.email(),body.purpose(),req.getRemoteAddr());
    }
    @PostMapping("/otp/verify")
    public AuthService.Verified verify(@RequestBody Verify body,HttpServletRequest req) {
        return auth.verify(body.challengeId(),body.email(),body.purpose(),body.code(),req.getRemoteAddr());
    }
    @PostMapping("/login")
    public ResponseEntity<AuthService.Session> login(@RequestBody Login body,HttpServletRequest req) {
        if ("admin-web".equals(body.client())) origin(req);
        return session(auth.login(body.email(),body.password(),body.client(),req.getRemoteAddr()),body.client());
    }
    @PostMapping("/refresh")
    public ResponseEntity<AuthService.Session> refresh(@RequestBody Refresh body,
            @CookieValue(name="dorm_refresh",required=false) String cookie,HttpServletRequest req) {
        boolean web = "admin-web".equals(body.client());
        if (web) origin(req);
        return session(auth.refresh(web ? cookie : body.refreshToken(),body.client()),body.client());
    }
    @GetMapping("/me")
    public AuthService.User me(@AuthenticationPrincipal Jwt jwt) { return auth.me(jwt); }
    @PatchMapping("/profile")
    public AuthService.User profile(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,String> body) {
        if (!body.keySet().equals(Set.of("name"))) throw new AuthFailure(400,"INVALID_PROFILE_FIELDS","Chỉ cập nhật họ tên tại API này; đổi email cần xác minh riêng.");
        return auth.updateProfile(jwt,body.get("name"));
    }
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@AuthenticationPrincipal Jwt jwt,HttpServletRequest req) {
        if ("admin-web".equals(jwt.getClaimAsString("client"))) origin(req);
        auth.logout(jwt);
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE,cookie("",Duration.ZERO).toString()).build();
    }
    @PostMapping("/password/change")
    public ResponseEntity<AuthService.Session> change(@AuthenticationPrincipal Jwt jwt,@RequestBody Change body,HttpServletRequest req) {
        String client=jwt.getClaimAsString("client"); if ("admin-web".equals(client)) origin(req);
        return session(auth.changePassword(jwt,body.currentPassword(),body.password()),client);
    }
    @PostMapping("/password/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reset(@RequestBody Reset body) { auth.reset(body.resetToken(),body.password()); }
    private void origin(HttpServletRequest req) {
        if (!origins.contains(Objects.toString(req.getHeader("Origin"),"")))
            throw new AuthFailure(403,"INVALID_ORIGIN","Origin không được phép.");
    }
    private ResponseCookie cookie(String value,Duration age) {
        return ResponseCookie.from("dorm_refresh",value).httpOnly(true).secure(true).sameSite("Strict")
                .path("/api/v1/auth/refresh").maxAge(age).build();
    }
    private ResponseEntity<AuthService.Session> session(AuthService.Session session,String client) {
        if ("admin-web".equals(client)) return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE,cookie(session.refreshToken(),Duration.ofDays(30)).toString())
                .body(new AuthService.Session(session.token(),null,session.user()));
        return ResponseEntity.ok(session);
    }
}
