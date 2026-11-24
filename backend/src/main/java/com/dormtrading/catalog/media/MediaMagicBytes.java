package com.dormtrading.catalog.media;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;

public final class MediaMagicBytes {

    private MediaMagicBytes() {
    }

    public enum DetectedImageType {
        JPEG("image/jpeg", "jpg"),
        PNG("image/png", "png"),
        WEBP("image/webp", "webp");

        private final String contentType;
        private final String extension;

        DetectedImageType(String contentType, String extension) {
            this.contentType = contentType;
            this.extension = extension;
        }

        public String contentType() {
            return contentType;
        }

        public String extension() {
            return extension;
        }
    }

    private static final byte[] PNG_SIGNATURE = new byte[]{
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    };

    public static Optional<DetectedImageType> detect(byte[] bytes) {
        if (bytes == null || bytes.length < 3) {
            return Optional.empty();
        }
        if (isJpeg(bytes)) {
            return Optional.of(DetectedImageType.JPEG);
        }
        if (isPng(bytes)) {
            return Optional.of(DetectedImageType.PNG);
        }
        if (isWebp(bytes)) {
            return Optional.of(DetectedImageType.WEBP);
        }
        return Optional.empty();
    }

    private static boolean isJpeg(byte[] bytes) {
        return bytes.length >= 3
                && (bytes[0] & 0xFF) == 0xFF
                && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF;
    }

    private static boolean isPng(byte[] bytes) {
        if (bytes.length < PNG_SIGNATURE.length) {
            return false;
        }
        for (int i = 0; i < PNG_SIGNATURE.length; i++) {
            if (bytes[i] != PNG_SIGNATURE[i]) {
                return false;
            }
        }
        return true;
    }

    private static boolean isWebp(byte[] bytes) {
        return bytes.length >= 12
                && bytes[0] == 'R'
                && bytes[1] == 'I'
                && bytes[2] == 'F'
                && bytes[3] == 'F'
                && bytes[8] == 'W'
                && bytes[9] == 'E'
                && bytes[10] == 'B'
                && bytes[11] == 'P';
    }

    public static String sha256Hex(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", e);
        }
    }

    public static String sanitizeFilename(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return null;
        }
        String stripped = originalFilename.replace('\\', '/');
        int lastSlash = stripped.lastIndexOf('/');
        String baseName = lastSlash >= 0 ? stripped.substring(lastSlash + 1) : stripped;
        baseName = baseName.replaceAll("[\\p{Cntrl}]", "").strip();
        if (baseName.isEmpty()) {
            return null;
        }
        return baseName.length() > 255 ? baseName.substring(0, 255) : baseName;
    }
}
