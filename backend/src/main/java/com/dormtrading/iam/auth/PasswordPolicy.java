package com.dormtrading.iam.auth;

import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;

@Component
public class PasswordPolicy {
    private final boolean breachCheck;
    private final HttpClient http;
    @org.springframework.beans.factory.annotation.Autowired
    public PasswordPolicy(@Value("${app.auth.breach-check:true}") boolean breachCheck) {
        this(breachCheck, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
    }
    public PasswordPolicy(boolean breachCheck, HttpClient http) {
        this.breachCheck = breachCheck;
        this.http = http;
    }
    public String normalize(String password) {
        if (password == null || password.length() > 512) throw weak();
        return Normalizer.normalize(password, Normalizer.Form.NFC);
    }
    public String validate(String password, String email, String studentId) {
        String value = normalize(password);
        int size = value.codePointCount(0, value.length());
        if (size < 15 || size > 128) throw weak();
        String lower = value.toLowerCase(Locale.ROOT);
        String local = email.split("@")[0].toLowerCase(Locale.ROOT);
        if ((local.length() >= 4 && lower.contains(local)) ||
                (studentId.length() >= 4 && lower.contains(studentId.toLowerCase(Locale.ROOT))) ||
                lower.matches(".*(password|123456|qwerty|matkhau).*")) throw weak();
        // SHA-1 is only the HIBP lookup identifier, never the stored password hash.
        if (breachCheck) {
            try {
                String hash = HexFormat.of().withUpperCase().formatHex(
                        MessageDigest.getInstance("SHA-1").digest(value.getBytes(StandardCharsets.UTF_8)));
                var request = HttpRequest.newBuilder(URI.create("https://api.pwnedpasswords.com/range/" + hash.substring(0, 5)))
                        .timeout(Duration.ofSeconds(5)).header("Add-Padding", "true").header("User-Agent", "DormTrading/1.0").GET().build();
                var response = http.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 200) throw new IllegalStateException();
                for (String line : response.body().split("\\R")) {
                    String[] parts = line.split(":");
                    if (parts.length == 2 && parts[0].equalsIgnoreCase(hash.substring(5)) && Long.parseLong(parts[1].trim()) > 0)
                        throw weak();
                }
            } catch (AuthFailure e) { throw e; }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); throw unavailable(); }
            catch (Exception e) { throw unavailable(); }
        }
        return value;
    }
    private AuthFailure weak() { return new AuthFailure(400, "WEAK_PASSWORD", "Mật khẩu cần 15–128 ký tự và không phổ biến hoặc gắn với tài khoản."); }
    private AuthFailure unavailable() { return new AuthFailure(503, "PASSWORD_CHECK_UNAVAILABLE", "Chưa kiểm tra được mật khẩu bị lộ. Vui lòng thử lại."); }
}
