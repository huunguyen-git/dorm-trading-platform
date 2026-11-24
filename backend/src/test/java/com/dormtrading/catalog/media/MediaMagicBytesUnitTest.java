package com.dormtrading.catalog.media;

import com.dormtrading.iam.auth.AuthFailure;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MediaMagicBytesUnitTest {

    static byte[] sampleJpeg() {
        return new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00};
    }

    static byte[] samplePng() {
        return new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D};
    }

    static byte[] sampleWebp() {
        return new byte[]{'R', 'I', 'F', 'F', 0x24, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' '};
    }

    @Test
    void detectsValidJpegPngAndWebpMagicBytes() {
        assertThat(MediaMagicBytes.detect(sampleJpeg()))
                .contains(MediaMagicBytes.DetectedImageType.JPEG);
        assertThat(MediaMagicBytes.detect(samplePng()))
                .contains(MediaMagicBytes.DetectedImageType.PNG);
        assertThat(MediaMagicBytes.detect(sampleWebp()))
                .contains(MediaMagicBytes.DetectedImageType.WEBP);
    }

    @Test
    void rejectsNonImageOrSpoofedPayloads() {
        assertThat(MediaMagicBytes.detect(null)).isEmpty();
        assertThat(MediaMagicBytes.detect(new byte[0])).isEmpty();
        assertThat(MediaMagicBytes.detect(new byte[]{(byte) 0xFF, (byte) 0xD8})).isEmpty();
        assertThat(MediaMagicBytes.detect(new byte[]{(byte) 0xFF, (byte) 0xD8, 0x00})).isEmpty();
        assertThat(MediaMagicBytes.detect("GIF89a...".getBytes(StandardCharsets.US_ASCII))).isEmpty();
        assertThat(MediaMagicBytes.detect("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>".getBytes(StandardCharsets.UTF_8))).isEmpty();
        assertThat(MediaMagicBytes.detect("%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII))).isEmpty();
        assertThat(MediaMagicBytes.detect("RIFF1234WAVEfmt ".getBytes(StandardCharsets.US_ASCII))).isEmpty();
        assertThat(MediaMagicBytes.detect("<?php echo 1; ?>".getBytes(StandardCharsets.UTF_8))).isEmpty();
    }

    @Test
    void computesSha256HexAndSanitizesFilenames() {
        assertThat(MediaMagicBytes.sha256Hex(new byte[0]))
                .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assertThat(MediaMagicBytes.sha256Hex("abc".getBytes(StandardCharsets.US_ASCII)))
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

        assertThat(MediaMagicBytes.sanitizeFilename("../../secret/photo.jpg")).isEqualTo("photo.jpg");
        assertThat(MediaMagicBytes.sanitizeFilename("C:\\Users\\test\\img.png")).isEqualTo("img.png");
        assertThat(MediaMagicBytes.sanitizeFilename("   ")).isNull();
        assertThat(MediaMagicBytes.sanitizeFilename(null)).isNull();
        assertThat(MediaMagicBytes.sanitizeFilename("a".repeat(300))).hasSize(255);
    }

    @Test
    void localDiskStorageBlocksPathTraversalAndRoundTripsBytes(@TempDir Path tempDir) {
        LocalDiskMediaStorage storage = new LocalDiskMediaStorage(tempDir.toString());

        assertThatThrownBy(() -> storage.resolveSafePath("../outside.jpg"))
                .isInstanceOf(AuthFailure.class)
                .extracting("code").isEqualTo("INVALID_MEDIA");
        assertThatThrownBy(() -> storage.resolveSafePath("2026/../../outside.jpg"))
                .isInstanceOf(AuthFailure.class)
                .extracting("code").isEqualTo("INVALID_MEDIA");
        assertThatThrownBy(() -> storage.resolveSafePath("/etc/passwd"))
                .isInstanceOf(AuthFailure.class)
                .extracting("code").isEqualTo("INVALID_MEDIA");
        assertThatThrownBy(() -> storage.resolveSafePath("2026\\11\\file.jpg"))
                .isInstanceOf(AuthFailure.class)
                .extracting("code").isEqualTo("INVALID_MEDIA");

        String key = "2026/11/" + UUID.randomUUID() + ".jpg";
        byte[] content = sampleJpeg();
        storage.store(key, content);
        assertThat(storage.load(key)).isEqualTo(content);

        storage.deleteQuietly(key);
        assertThatThrownBy(() -> storage.load(key))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(404, "MEDIA_NOT_FOUND");
    }

    @Test
    void mediaServiceEnforcesFileCountSizeAndMagicBytesBeforeSaving(@TempDir Path tempDir) {
        JdbcTemplate db = Mockito.mock(JdbcTemplate.class);
        LocalDiskMediaStorage storage = new LocalDiskMediaStorage(tempDir.toString());
        Clock clock = Clock.fixed(Instant.parse("2026-11-24T12:00:00Z"), ZoneOffset.UTC);
        MediaService service = new MediaService(db, storage, clock, 5242880L, 5, "");
        UUID ownerId = UUID.randomUUID();

        // Empty list rejected
        assertThatThrownBy(() -> service.uploadImages(ownerId, List.of(), "http://localhost:8082"))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");

        // 6 files rejected
        List<MultipartFile> sixFiles = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            sixFiles.add(new MockMultipartFile("files", "img" + i + ".jpg", "image/jpeg", sampleJpeg()));
        }
        assertThatThrownBy(() -> service.uploadImages(ownerId, sixFiles, "http://localhost:8082"))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");

        // Oversized (> 5MB) rejected with 413 FILE_TOO_LARGE
        byte[] oversized = new byte[5 * 1024 * 1024 + 1];
        oversized[0] = (byte) 0xFF;
        oversized[1] = (byte) 0xD8;
        oversized[2] = (byte) 0xFF;
        MultipartFile tooBig = new MockMultipartFile("files", "huge.jpg", "image/jpeg", oversized);
        assertThatThrownBy(() -> service.uploadImages(ownerId, List.of(tooBig), "http://localhost:8082"))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(413, "FILE_TOO_LARGE");

        // Spoofed SVG disguised as image/jpeg rejected with 400 INVALID_MEDIA (even in batch with valid image)
        MultipartFile validJpeg = new MockMultipartFile("files", "good.jpg", "image/jpeg", sampleJpeg());
        MultipartFile spoofedSvg = new MockMultipartFile(
                "files",
                "evil.jpg",
                "image/jpeg",
                "<svg onload=\"alert(1)\"></svg>".getBytes(StandardCharsets.UTF_8)
        );
        assertThatThrownBy(() -> service.uploadImages(ownerId, List.of(validJpeg, spoofedSvg), "http://localhost:8082"))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");

        // Ensure all-or-nothing validation wrote zero files to disk
        assertThat(tempDir.toFile().list()).isEmpty();
    }
}
