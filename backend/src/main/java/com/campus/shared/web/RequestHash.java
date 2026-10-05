package com.campus.shared.web;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

public final class RequestHash {
    private RequestHash() {}

    public static String sha256Hex(String canonical) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 không khả dụng", e);
        }
    }

    public static String sha256Hex(byte[] bytes, String prefix) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            if (prefix != null) digest.update(prefix.getBytes(StandardCharsets.UTF_8));
            byte[] hash = digest.digest(bytes);
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 không khả dụng", e);
        }
    }
}