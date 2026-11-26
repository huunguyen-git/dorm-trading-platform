package com.dormtrading.catalog.media;

import com.dormtrading.iam.auth.AuthFailure;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

class MediaMagicBytesUnitTest {

    static byte[] sampleJpeg() {
        return createValidJpeg(4, 2);
    }

    static byte[] samplePng() {
        return createValidPng(3, 2);
    }

    /**
     * Minimal valid 1x1 lossless WebP (RIFF + WEBP + VP8L).
     */
    static byte[] sampleWebp() {
        return new byte[]{
                'R', 'I', 'F', 'F', 0x1A, 0x00, 0x00, 0x00,
                'W', 'E', 'B', 'P',
                'V', 'P', '8', 'L', 0x0D, 0x00, 0x00, 0x00,
                0x2F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        };
    }

    static byte[] createValidJpeg(int width, int height) {
        try {
            BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    img.setRGB(x, y, new Color((x * 40) % 255, (y * 60) % 255, 180).getRGB());
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "jpeg", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static byte[] createValidPng(int width, int height) {
        try {
            BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
            img.setRGB(0, 0, new Color(180, 65, 40, 255).getRGB());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "png", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Builds a valid JPEG with an injected APP1 EXIF segment containing the requested Orientation
     * and a synthetic GPS marker string.
     */
    static byte[] jpegWithExifOrientationAndGps(int orientation) {
        byte[] clean = createValidJpeg(4, 2);
        // Little-endian TIFF header + 1 IFD entry (tag 0x0112 Orientation) + GPS marker bytes
        byte[] tiffAndGps = new byte[]{
                'E', 'x', 'i', 'f', 0x00, 0x00,
                'I', 'I', 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF header (LE), IFD0 at offset 8
                0x01, 0x00,                                   // 1 IFD entry
                0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, (byte) orientation, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,                       // Next IFD = 0
                'G', 'P', 'S', ':', '1', '0', '.', '8', '7', '8', '2', ',', '1', '0', '6', '.', '8', '0', '6', '3'
        };
        int segLen = tiffAndGps.length + 2;
        ByteArrayOutputStream out = new ByteArrayOutputStream(clean.length + segLen + 4);
        out.write(0xFF);
        out.write(0xD8);
        out.write(0xFF);
        out.write(0xE1); // APP1
        out.write((segLen >>> 8) & 0xFF);
        out.write(segLen & 0xFF);
        out.write(tiffAndGps, 0, tiffAndGps.length);
        out.write(clean, 2, clean.length - 2);
        return out.toByteArray();
    }

    static byte[] jpegWithExifOrientation6AndGps() {
        return jpegWithExifOrientationAndGps(6);
    }

    /**
     * Builds a crafted JPEG with EXIF IFD offset = Integer.MAX_VALUE (0x7FFFFFFF) to guard against
     * signed int32 overflow in TIFF offset parsing.
     */
    static byte[] jpegWithOverflowingExifIfdOffset() {
        byte[] clean = createValidJpeg(4, 2);
        byte[] evilTiff = new byte[]{
                'E', 'x', 'i', 'f', 0x00, 0x00,
                'I', 'I', 0x2A, 0x00,
                (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, 0x7F, // IFD offset = 0x7FFFFFFF (overflows int32 when added to tiffStart!)
                0x00, 0x00, 0x00, 0x00
        };
        int segLen = evilTiff.length + 2;
        ByteArrayOutputStream out = new ByteArrayOutputStream(clean.length + segLen + 4);
        out.write(0xFF);
        out.write(0xD8);
        out.write(0xFF);
        out.write(0xE1);
        out.write((segLen >>> 8) & 0xFF);
        out.write(segLen & 0xFF);
        out.write(evilTiff, 0, evilTiff.length);
        out.write(clean, 2, clean.length - 2);
        return out.toByteArray();
    }

    /**
     * Builds a valid PNG with an injected tEXt chunk containing GPS/camera metadata.
     */
    static byte[] pngWithTextMetadata() {
        byte[] clean = createValidPng(3, 2);
        byte[] payload = "GPSLocation\010.8782,106.8063".getBytes(StandardCharsets.ISO_8859_1);
        byte[] chunkType = "tEXt".getBytes(StandardCharsets.US_ASCII);
        CRC32 crc = new CRC32();
        crc.update(chunkType);
        crc.update(payload);
        long crcVal = crc.getValue();

        // Insert tEXt chunk right before IEND (last 12 bytes of standard PNG)
        int iendStart = clean.length - 12;
        ByteArrayOutputStream out = new ByteArrayOutputStream(clean.length + payload.length + 12);
        out.write(clean, 0, iendStart);
        int len = payload.length;
        out.write((len >>> 24) & 0xFF);
        out.write((len >>> 16) & 0xFF);
        out.write((len >>> 8) & 0xFF);
        out.write(len & 0xFF);
        out.write(chunkType, 0, 4);
        out.write(payload, 0, payload.length);
        out.write((int) ((crcVal >>> 24) & 0xFF));
        out.write((int) ((crcVal >>> 16) & 0xFF));
        out.write((int) ((crcVal >>> 8) & 0xFF));
        out.write((int) (crcVal & 0xFF));
        out.write(clean, iendStart, 12);
        return out.toByteArray();
    }

    /**
     * Builds a valid extended WebP (VP8X + VP8L + EXIF + XMP ) with EXIF/XMP flags enabled.
     */
    static byte[] webpWithExifAndXmp() {
        ByteArrayOutputStream chunks = new ByteArrayOutputStream();
        // VP8X (10 bytes): flags = 0x0C (EXIF=0x08 | XMP=0x04), 1x1 canvas (width-1=0, height-1=0)
        byte[] vp8x = new byte[]{0x0C, 0, 0, 0, 0, 0, 0, 0, 0, 0};
        writeWebpChunk(chunks, "VP8X", vp8x);
        // VP8L (13 bytes + 1 pad byte)
        byte[] vp8l = new byte[]{0x2F, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
        writeWebpChunk(chunks, "VP8L", vp8l);
        // EXIF chunk (odd length to test padding handling)
        writeWebpChunk(chunks, "EXIF", "ExifGPS10.8782".getBytes(StandardCharsets.US_ASCII));
        // XMP  chunk
        writeWebpChunk(chunks, "XMP ", "<x:xmpmeta>secret-device</x:xmpmeta>".getBytes(StandardCharsets.UTF_8));

        byte[] body = chunks.toByteArray();
        int riffSize = 4 + body.length;
        byte[] full = new byte[8 + riffSize];
        full[0] = 'R';
        full[1] = 'I';
        full[2] = 'F';
        full[3] = 'F';
        full[4] = (byte) (riffSize & 0xFF);
        full[5] = (byte) ((riffSize >>> 8) & 0xFF);
        full[6] = (byte) ((riffSize >>> 16) & 0xFF);
        full[7] = (byte) ((riffSize >>> 24) & 0xFF);
        full[8] = 'W';
        full[9] = 'E';
        full[10] = 'B';
        full[11] = 'P';
        System.arraycopy(body, 0, full, 12, body.length);
        return full;
    }

    private static byte[] wrapRiffWebp(byte[] body) {
        int riffSize = 4 + body.length;
        byte[] full = new byte[8 + riffSize];
        full[0] = 'R';
        full[1] = 'I';
        full[2] = 'F';
        full[3] = 'F';
        full[4] = (byte) (riffSize & 0xFF);
        full[5] = (byte) ((riffSize >>> 8) & 0xFF);
        full[6] = (byte) ((riffSize >>> 16) & 0xFF);
        full[7] = (byte) ((riffSize >>> 24) & 0xFF);
        full[8] = 'W';
        full[9] = 'E';
        full[10] = 'B';
        full[11] = 'P';
        System.arraycopy(body, 0, full, 12, body.length);
        return full;
    }

    private static void writeWebpChunk(ByteArrayOutputStream out, String fourCc, byte[] payload) {
        byte[] tag = fourCc.getBytes(StandardCharsets.US_ASCII);
        out.write(tag, 0, 4);
        int len = payload.length;
        out.write(len & 0xFF);
        out.write((len >>> 8) & 0xFF);
        out.write((len >>> 16) & 0xFF);
        out.write((len >>> 24) & 0xFF);
        out.write(payload, 0, payload.length);
        if ((len & 1) == 1) {
            out.write(0);
        }
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
    void stripsExifGpsAndXmpMetadataAcrossJpegPngAndWebpAndRejectsCorruptStreams() throws Exception {
        // JPEG: EXIF/GPS stripped & Orientation=6 rotates 4x2 -> 2x4
        byte[] dirtyJpeg = jpegWithExifOrientation6AndGps();
        assertThat(new String(dirtyJpeg, StandardCharsets.ISO_8859_1)).contains("Exif", "GPS:10.8782");
        byte[] cleanJpeg = MediaImageSanitizer.sanitize(dirtyJpeg, MediaMagicBytes.DetectedImageType.JPEG, 5242880L);
        assertThat(new String(cleanJpeg, StandardCharsets.ISO_8859_1)).doesNotContain("Exif", "GPS:10.8782");
        BufferedImage decodedJpeg = ImageIO.read(new ByteArrayInputStream(cleanJpeg));
        assertThat(decodedJpeg).isNotNull();
        assertThat(decodedJpeg.getWidth()).isEqualTo(2);
        assertThat(decodedJpeg.getHeight()).isEqualTo(4);

        // PNG: tEXt metadata chunk stripped while keeping valid PNG pixels
        byte[] dirtyPng = pngWithTextMetadata();
        assertThat(new String(dirtyPng, StandardCharsets.ISO_8859_1)).contains("GPSLocation");
        byte[] cleanPng = MediaImageSanitizer.sanitize(dirtyPng, MediaMagicBytes.DetectedImageType.PNG, 5242880L);
        assertThat(new String(cleanPng, StandardCharsets.ISO_8859_1)).doesNotContain("GPSLocation", "tEXt");
        BufferedImage decodedPng = ImageIO.read(new ByteArrayInputStream(cleanPng));
        assertThat(decodedPng).isNotNull();
        assertThat(decodedPng.getWidth()).isEqualTo(3);
        assertThat(decodedPng.getHeight()).isEqualTo(2);

        // WebP: EXIF, XMP, ICCP, and unknown JUMB metadata chunks stripped and VP8X flags cleared
        ByteArrayOutputStream webpChunks = new ByteArrayOutputStream();
        // VP8X (10 bytes): flags = 0x2C (ICCP=0x20 | EXIF=0x08 | XMP=0x04), 1x1 canvas
        writeWebpChunk(webpChunks, "VP8X", new byte[]{0x2C, 0, 0, 0, 0, 0, 0, 0, 0, 0});
        writeWebpChunk(webpChunks, "ICCP", "secret-icc-profile".getBytes(StandardCharsets.US_ASCII));
        writeWebpChunk(webpChunks, "VP8L", new byte[]{0x2F, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0});
        writeWebpChunk(webpChunks, "EXIF", "ExifGPS10.8782".getBytes(StandardCharsets.US_ASCII));
        writeWebpChunk(webpChunks, "XMP ", "<x:xmpmeta>secret-device</x:xmpmeta>".getBytes(StandardCharsets.UTF_8));
        writeWebpChunk(webpChunks, "JUMB", "hidden-c2pa-gps".getBytes(StandardCharsets.US_ASCII));
        byte[] dirtyWebp = wrapRiffWebp(webpChunks.toByteArray());
        assertThat(new String(dirtyWebp, StandardCharsets.ISO_8859_1))
                .contains("ExifGPS", "secret-device", "secret-icc-profile", "hidden-c2pa-gps");
        byte[] cleanWebp = MediaImageSanitizer.sanitize(dirtyWebp, MediaMagicBytes.DetectedImageType.WEBP, 5242880L);
        String cleanWebpStr = new String(cleanWebp, StandardCharsets.ISO_8859_1);
        assertThat(cleanWebpStr)
                .doesNotContain("EXIF", "XMP ", "ICCP", "JUMB", "ExifGPS", "secret-device", "secret-icc-profile", "hidden-c2pa-gps");
        assertThat(cleanWebpStr).startsWith("RIFF").contains("WEBP", "VP8X", "VP8L");
        // VP8X flags byte at offset 20 (12 header + 8 chunk header) must have ICCP (0x20), EXIF (0x08) & XMP (0x04) cleared
        assertThat(cleanWebp[20] & 0x2C).isEqualTo(0);

        // JPEG EXIF int32 overflow in IFD offset MUST NOT crash (must fall back safely to orientation 1 and strip EXIF)
        byte[] overflowExifJpeg = jpegWithOverflowingExifIfdOffset();
        byte[] sanitizedOverflowJpeg = MediaImageSanitizer.sanitize(
                overflowExifJpeg, MediaMagicBytes.DetectedImageType.JPEG, 5242880L);
        BufferedImage decodedOverflow = ImageIO.read(new ByteArrayInputStream(sanitizedOverflowJpeg));
        assertThat(decodedOverflow).isNotNull();
        assertThat(decodedOverflow.getWidth()).isEqualTo(4);
        assertThat(decodedOverflow.getHeight()).isEqualTo(2);

        // Verify all EXIF orientations 1..8 transform cleanly with expected dimensions
        for (int orientation = 1; orientation <= 8; orientation++) {
            byte[] oriented = MediaImageSanitizer.sanitize(
                    jpegWithExifOrientationAndGps(orientation),
                    MediaMagicBytes.DetectedImageType.JPEG,
                    5242880L
            );
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(oriented));
            assertThat(img).isNotNull();
            if (orientation >= 5) {
                assertThat(img.getWidth()).isEqualTo(2);
                assertThat(img.getHeight()).isEqualTo(4);
            } else {
                assertThat(img.getWidth()).isEqualTo(4);
                assertThat(img.getHeight()).isEqualTo(2);
            }
        }

        // Crafted WebP with ANMF without VP8X MUST be rejected (no dimension check bypass!)
        ByteArrayOutputStream anmfOnly = new ByteArrayOutputStream();
        writeWebpChunk(anmfOnly, "ANMF", new byte[20]);
        byte[] fakeAnmfWebp = wrapRiffWebp(anmfOnly.toByteArray());
        assertThatThrownBy(() -> MediaImageSanitizer.sanitize(fakeAnmfWebp, MediaMagicBytes.DetectedImageType.WEBP, 5242880L))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");

        // Crafted WebP VP8 non-keyframe (bit 0 = 1) MUST be rejected
        ByteArrayOutputStream interframeVp8 = new ByteArrayOutputStream();
        writeWebpChunk(interframeVp8, "VP8 ", new byte[]{0x01, 0x00, 0x00, (byte) 0x9D, 0x01, 0x2A, 0x04, 0x00, 0x04, 0x00});
        byte[] badVp8Webp = wrapRiffWebp(interframeVp8.toByteArray());
        assertThatThrownBy(() -> MediaImageSanitizer.sanitize(badVp8Webp, MediaMagicBytes.DetectedImageType.WEBP, 5242880L))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");

        // Truncated/corrupt files with only magic bytes must be rejected
        byte[] fakeJpeg = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00, 0x10};
        assertThatThrownBy(() -> MediaImageSanitizer.sanitize(fakeJpeg, MediaMagicBytes.DetectedImageType.JPEG, 5242880L))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");

        byte[] fakeWebp = new byte[]{'R', 'I', 'F', 'F', 0x24, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' '};
        assertThatThrownBy(() -> MediaImageSanitizer.sanitize(fakeWebp, MediaMagicBytes.DetectedImageType.WEBP, 5242880L))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");
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
    void localDiskStorageBlocksPathTraversalStreamsResourceAndListsOldKeys(@TempDir Path tempDir) throws Exception {
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
        Resource res = storage.loadAsResource(key);
        assertThat(res.exists()).isTrue();
        assertThat(res.contentLength()).isEqualTo(content.length);
        assertThat(res.getContentAsByteArray()).isEqualTo(content);

        // Mark file as older than cutoff and verify listKeysOlderThan discovers it
        Path storedPath = storage.resolveSafePath(key);
        Instant twoHoursAgo = Instant.now().minusSeconds(7200);
        Files.setLastModifiedTime(storedPath, FileTime.from(twoHoursAgo));
        assertThat(storage.listKeysOlderThan(Instant.now().minusSeconds(3600), 10)).contains(key);

        storage.deleteQuietly(key);
        assertThatThrownBy(() -> storage.loadAsResource(key))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(404, "MEDIA_NOT_FOUND");
    }

    @Test
    void mediaServiceEnforcesFileCountSizeMagicBytesQuotaAndCleansUpOrphansOnFailure(@TempDir Path tempDir) {
        JdbcTemplate db = Mockito.mock(JdbcTemplate.class);
        LocalDiskMediaStorage storage = new LocalDiskMediaStorage(tempDir.toString());
        Clock clock = Clock.fixed(Instant.parse("2026-11-24T12:00:00Z"), ZoneOffset.UTC);
        MediaService service = new MediaService(db, storage, clock, 5242880L, 5, 2, 1024L * 1024L, "");
        UUID ownerId = UUID.randomUUID();

        // Empty list rejected
        assertThatThrownBy(() -> service.uploadImages(ownerId, List.of()))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");

        // 6 files rejected
        List<MultipartFile> sixFiles = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            sixFiles.add(new MockMultipartFile("files", "img" + i + ".jpg", "image/jpeg", sampleJpeg()));
        }
        assertThatThrownBy(() -> service.uploadImages(ownerId, sixFiles))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");

        // Oversized (> 5MB) rejected with 413 FILE_TOO_LARGE
        byte[] oversized = new byte[5 * 1024 * 1024 + 1];
        oversized[0] = (byte) 0xFF;
        oversized[1] = (byte) 0xD8;
        oversized[2] = (byte) 0xFF;
        MultipartFile tooBig = new MockMultipartFile("files", "huge.jpg", "image/jpeg", oversized);
        assertThatThrownBy(() -> service.uploadImages(ownerId, List.of(tooBig)))
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
        assertThatThrownBy(() -> service.uploadImages(ownerId, List.of(validJpeg, spoofedSvg)))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");

        // Quota exceeded -> 413 MEDIA_QUOTA_EXCEEDED without writing to disk
        when(db.queryForList(anyString(), eq(String.class), eq(ownerId))).thenReturn(List.of("HOAT_DONG"));
        when(db.queryForMap(anyString(), eq(ownerId))).thenReturn(Map.of("file_count", 2, "total_bytes", 1024L));
        assertThatThrownBy(() -> service.uploadImages(ownerId, List.of(validJpeg)))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(413, "MEDIA_QUOTA_EXCEEDED");

        // DB failure mid-upload cleans up written file from disk (zero orphans)
        when(db.queryForMap(anyString(), eq(ownerId))).thenReturn(Map.of("file_count", 0, "total_bytes", 0L));
        when(db.update(anyString(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new RuntimeException("Simulated DB insert failure"));
        assertThatThrownBy(() -> service.uploadImages(ownerId, List.of(validJpeg)))
                .isInstanceOf(RuntimeException.class);

        // Ensure zero orphan files remain in storage
        assertThat(storage.listKeysOlderThan(Instant.now().plusSeconds(60), 10)).isEmpty();
    }
}
