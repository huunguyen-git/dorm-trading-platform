package com.dormtrading.order;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Cryptographic helper for 6-digit handover completion OTPs (UC-27 / FR-09 / NFR-01).
 *
 * <p>Derives two domain-separated 256-bit keys from {@code app.jwt.secret}:
 * <ul>
 *   <li>{@code hashKey}: HMAC-SHA256 digest bound to {@code otpId:orderId:code} for constant-time verification.</li>
 *   <li>{@code encKey}: AES-256-GCM encryption bound via AAD {@code otpId:orderId} with random 12-byte nonce so the
 *       authenticated buyer can view their active in-app code without ever persisting plaintext OTP in PostgreSQL.</li>
 * </ul>
 */
@Component
public class HandoverOtpCrypto {

    private final SecureRandom random;
    private final byte[] hashKey;
    private final byte[] encKey;

    public HandoverOtpCrypto(
            SecureRandom random,
            @Value("${app.jwt.secret}") String encodedSecret
    ) {
        this.random = random != null ? random : new SecureRandom();
        byte[] master = Base64.getDecoder().decode(encodedSecret);
        this.hashKey = deriveKey(master, "dorm-handover-otp-hash-v1");
        this.encKey = deriveKey(master, "dorm-handover-otp-enc-v1");
    }

    public String generateCode() {
        return String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
    }

    public String hashCode(UUID otpId, UUID orderId, String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hashKey, "HmacSHA256"));
            String payload = otpId + ":" + orderId + ":" + code;
            return HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cannot compute handover OTP digest", e);
        }
    }

    public boolean matches(UUID otpId, UUID orderId, String candidateCode, String expectedHexHash) {
        if (otpId == null || orderId == null || candidateCode == null || expectedHexHash == null) {
            return false;
        }
        String computed = hashCode(otpId, orderId, candidateCode);
        return MessageDigest.isEqual(
                computed.getBytes(StandardCharsets.US_ASCII),
                expectedHexHash.strip().getBytes(StandardCharsets.US_ASCII)
        );
    }

    public String encryptCode(UUID otpId, UUID orderId, String code) {
        byte[] nonce = new byte[12];
        random.nextBytes(nonce);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(encKey, "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD((otpId + ":" + orderId).getBytes(StandardCharsets.US_ASCII));
            byte[] encrypted = cipher.doFinal(code.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(nonce) + ":" + Base64.getEncoder().encodeToString(encrypted);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cannot encrypt handover OTP", e);
        }
    }

    public String decryptCode(UUID otpId, UUID orderId, String payload) {
        if (otpId == null || orderId == null || payload == null || payload.isBlank()) {
            return null;
        }
        String[] parts = payload.split(":", 2);
        if (parts.length != 2) {
            return null;
        }
        try {
            byte[] nonce = Base64.getDecoder().decode(parts[0]);
            byte[] ciphertext = Base64.getDecoder().decode(parts[1]);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(encKey, "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD((otpId + ":" + orderId).getBytes(StandardCharsets.US_ASCII));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return null;
        }
    }

    private static byte[] deriveKey(byte[] master, String domain) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(master, "HmacSHA256"));
            return mac.doFinal(domain.getBytes(StandardCharsets.US_ASCII));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cannot derive handover OTP key", e);
        }
    }
}
