package com.dormtrading.catalog.media;

import com.dormtrading.iam.auth.AuthFailure;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

/**
 * Validates decoded image geometry and strips EXIF, GPS, XMP, and comment metadata
 * from uploaded JPEG, PNG, and WebP images before persisting to storage.
 */
public final class MediaImageSanitizer {

    public static final int MAX_IMAGE_DIMENSION = 8192;
    public static final long MAX_IMAGE_PIXELS = 40_000_000L;

    private MediaImageSanitizer() {
    }

    public static byte[] sanitize(
            byte[] rawBytes,
            MediaMagicBytes.DetectedImageType detectedType,
            long maxOutputSizeBytes
    ) {
        if (rawBytes == null || rawBytes.length == 0 || detectedType == null) {
            throw invalidMedia("Tệp hình ảnh không hợp lệ.");
        }
        return switch (detectedType) {
            case JPEG -> sanitizeJpeg(rawBytes, maxOutputSizeBytes);
            case PNG -> sanitizePng(rawBytes, maxOutputSizeBytes);
            case WEBP -> sanitizeWebp(rawBytes, maxOutputSizeBytes);
        };
    }

    private static byte[] sanitizeJpeg(byte[] rawBytes, long maxOutputSizeBytes) {
        int orientation = extractJpegExifOrientation(rawBytes);
        BufferedImage decoded = decodeBounded(rawBytes, "jpeg");
        BufferedImage oriented = applyOrientationAndConvertRgb(decoded, orientation);

        byte[] encoded = encodeJpeg(oriented, 0.90f);
        if (encoded.length > maxOutputSizeBytes) {
            encoded = encodeJpeg(oriented, 0.80f);
        }
        if (encoded.length > maxOutputSizeBytes) {
            encoded = encodeJpeg(oriented, 0.72f);
        }
        if (encoded.length == 0) {
            throw invalidMedia("Không thể xử lý tệp ảnh JPEG.");
        }
        if (encoded.length > maxOutputSizeBytes) {
            throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi hình ảnh không được vượt quá 5MB.");
        }
        return encoded;
    }

    private static byte[] sanitizePng(byte[] rawBytes, long maxOutputSizeBytes) {
        BufferedImage decoded = decodeBounded(rawBytes, "png");
        int imageType = decoded.getColorModel().hasAlpha()
                ? BufferedImage.TYPE_INT_ARGB
                : BufferedImage.TYPE_INT_RGB;
        BufferedImage clean = new BufferedImage(decoded.getWidth(), decoded.getHeight(), imageType);
        Graphics2D g = clean.createGraphics();
        try {
            g.drawImage(decoded, 0, 0, null);
        } finally {
            g.dispose();
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream(Math.min(rawBytes.length, 65536));
        try {
            if (!ImageIO.write(clean, "png", baos)) {
                throw new IllegalStateException("PNG ImageWriter unavailable");
            }
        } catch (IOException e) {
            throw invalidMedia("Không thể xử lý tệp ảnh PNG.");
        }
        byte[] encoded = baos.toByteArray();
        if (encoded.length == 0) {
            throw invalidMedia("Không thể xử lý tệp ảnh PNG.");
        }
        if (encoded.length > maxOutputSizeBytes) {
            throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi hình ảnh không được vượt quá 5MB.");
        }
        return encoded;
    }

    private static byte[] sanitizeWebp(byte[] rawBytes, long maxOutputSizeBytes) {
        if (rawBytes.length < 20
                || rawBytes[0] != 'R' || rawBytes[1] != 'I' || rawBytes[2] != 'F' || rawBytes[3] != 'F'
                || rawBytes[8] != 'W' || rawBytes[9] != 'E' || rawBytes[10] != 'B' || rawBytes[11] != 'P') {
            throw invalidMedia("Tệp hình ảnh WebP không hợp lệ.");
        }

        long riffDeclaredSize = readUint32Le(rawBytes, 4);
        long containerEnd = 8L + riffDeclaredSize;
        if (riffDeclaredSize < 12 || containerEnd > rawBytes.length) {
            throw invalidMedia("Tệp hình ảnh WebP bị lỗi hoặc bị cắt cụt.");
        }

        ByteArrayOutputStream chunksOut = new ByteArrayOutputStream(rawBytes.length);
        int pos = 12;
        int end = (int) containerEnd;
        boolean hasImageBitstream = false;
        boolean hasVp8x = false;

        while (pos < end) {
            if (pos + 8 > end) {
                throw invalidMedia("Tệp hình ảnh WebP có cấu trúc chunk không hợp lệ.");
            }
            String fourCc = new String(rawBytes, pos, 4, StandardCharsets.US_ASCII);
            long chunkSizeLong = readUint32Le(rawBytes, pos + 4);
            long paddedSizeLong = chunkSizeLong + (chunkSizeLong & 1L);
            if (chunkSizeLong < 0 || pos + 8L + paddedSizeLong > end) {
                throw invalidMedia("Tệp hình ảnh WebP bị lỗi kích thước chunk.");
            }
            int chunkSize = (int) chunkSizeLong;
            int payloadOffset = pos + 8;
            int nextPos = payloadOffset + (int) paddedSizeLong;

            // Strict chunk allowlist: strip EXIF, XMP, ICCP, JUMB/C2PA, INFO, LIST, and any unknown metadata chunks
            boolean keepChunk = false;
            byte[] payloadCopy = null;
            if ("VP8X".equals(fourCc)) {
                if (chunkSize != 10) {
                    throw invalidMedia("Tệp hình ảnh WebP có header VP8X không hợp lệ.");
                }
                int canvasWidth = readUint24Le(rawBytes, payloadOffset + 4) + 1;
                int canvasHeight = readUint24Le(rawBytes, payloadOffset + 7) + 1;
                validateDimensions(canvasWidth, canvasHeight);
                payloadCopy = new byte[chunkSize];
                System.arraycopy(rawBytes, payloadOffset, payloadCopy, 0, chunkSize);
                // Clear ICCP (bit 5 = 0x20), EXIF (bit 3 = 0x08), and XMP (bit 2 = 0x04) flags in VP8X
                payloadCopy[0] = (byte) (payloadCopy[0] & ~(0x20 | 0x08 | 0x04));
                hasVp8x = true;
                keepChunk = true;
            } else if ("VP8L".equals(fourCc)) {
                if (chunkSize < 5 || (rawBytes[payloadOffset] & 0xFF) != 0x2F) {
                    throw invalidMedia("Tệp hình ảnh WebP VP8L không hợp lệ.");
                }
                long bits = readUint32Le(rawBytes, payloadOffset + 1);
                int width = (int) (bits & 0x3FFF) + 1;
                int height = (int) ((bits >>> 14) & 0x3FFF) + 1;
                validateDimensions(width, height);
                hasImageBitstream = true;
                keepChunk = true;
            } else if ("VP8 ".equals(fourCc)) {
                // Bit 0 of frame tag must be 0 (keyframe); bytes 3..5 must be VP8 start code 0x9D 0x01 0x2A
                if (chunkSize < 10
                        || (rawBytes[payloadOffset] & 0x01) != 0
                        || (rawBytes[payloadOffset + 3] & 0xFF) != 0x9D
                        || (rawBytes[payloadOffset + 4] & 0xFF) != 0x01
                        || (rawBytes[payloadOffset + 5] & 0xFF) != 0x2A) {
                    throw invalidMedia("Tệp hình ảnh WebP VP8 không hợp lệ.");
                }
                int width = readUint16Le(rawBytes, payloadOffset + 6) & 0x3FFF;
                int height = readUint16Le(rawBytes, payloadOffset + 8) & 0x3FFF;
                validateDimensions(width, height);
                hasImageBitstream = true;
                keepChunk = true;
            } else if ("ALPH".equals(fourCc) || "ANIM".equals(fourCc)) {
                if (!hasVp8x) {
                    throw invalidMedia("Tệp hình ảnh WebP thiếu header VP8X hợp lệ.");
                }
                keepChunk = true;
            } else if ("ANMF".equals(fourCc)) {
                if (!hasVp8x || chunkSize < 16) {
                    throw invalidMedia("Tệp hình ảnh WebP động (ANMF) không hợp lệ.");
                }
                int frameWidth = readUint24Le(rawBytes, payloadOffset + 6) + 1;
                int frameHeight = readUint24Le(rawBytes, payloadOffset + 9) + 1;
                validateDimensions(frameWidth, frameHeight);
                hasImageBitstream = true;
                keepChunk = true;
            }

            if (!keepChunk) {
                pos = nextPos;
                continue;
            }

            try {
                chunksOut.write(rawBytes, pos, 8);
                if (payloadCopy != null) {
                    chunksOut.write(payloadCopy);
                } else {
                    chunksOut.write(rawBytes, payloadOffset, chunkSize);
                }
                if ((chunkSize & 1) == 1) {
                    chunksOut.write(0);
                }
            } catch (IOException e) {
                throw invalidMedia("Không thể xử lý tệp ảnh WebP.");
            }
            pos = nextPos;
        }

        if (!hasImageBitstream) {
            throw invalidMedia("Tệp hình ảnh WebP không chứa dữ liệu ảnh hợp lệ.");
        }

        byte[] bodyChunks = chunksOut.toByteArray();
        int newRiffSize = 4 + bodyChunks.length;
        int totalSize = 8 + newRiffSize;
        if (totalSize > maxOutputSizeBytes) {
            throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi hình ảnh không được vượt quá 5MB.");
        }

        byte[] sanitized = new byte[totalSize];
        sanitized[0] = 'R';
        sanitized[1] = 'I';
        sanitized[2] = 'F';
        sanitized[3] = 'F';
        writeUint32Le(sanitized, 4, newRiffSize);
        sanitized[8] = 'W';
        sanitized[9] = 'E';
        sanitized[10] = 'B';
        sanitized[11] = 'P';
        System.arraycopy(bodyChunks, 0, sanitized, 12, bodyChunks.length);
        return sanitized;
    }

    private static BufferedImage decodeBounded(byte[] rawBytes, String formatName) {
        try (ImageInputStream iis = ImageIO.createImageInputStream(new ByteArrayInputStream(rawBytes))) {
            if (iis == null) {
                throw invalidMedia("Không thể đọc dữ liệu hình ảnh.");
            }
            Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(formatName);
            if (!readers.hasNext()) {
                throw new IllegalStateException("ImageReader unavailable for format " + formatName);
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(iis, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                validateDimensions(width, height);
                BufferedImage img = reader.read(0);
                if (img == null) {
                    throw invalidMedia("Tệp hình ảnh bị hỏng hoặc không đúng định dạng.");
                }
                return img;
            } finally {
                reader.dispose();
            }
        } catch (AuthFailure e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            throw invalidMedia("Tệp hình ảnh bị hỏng hoặc không đúng định dạng JPEG/PNG/WebP.");
        }
    }

    private static void validateDimensions(int width, int height) {
        if (width <= 0 || height <= 0) {
            throw invalidMedia("Kích thước hình ảnh không hợp lệ.");
        }
        if (width > MAX_IMAGE_DIMENSION
                || height > MAX_IMAGE_DIMENSION
                || (long) width * height > MAX_IMAGE_PIXELS) {
            throw invalidMedia("Độ phân giải hình ảnh vượt quá giới hạn cho phép.");
        }
    }

    private static BufferedImage applyOrientationAndConvertRgb(BufferedImage src, int orientation) {
        int w = src.getWidth();
        int h = src.getHeight();
        boolean swapDims = orientation >= 5 && orientation <= 8;
        int targetW = swapDims ? h : w;
        int targetH = swapDims ? w : h;

        BufferedImage dest = new BufferedImage(targetW, targetH, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = dest.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, targetW, targetH);

            AffineTransform tx = new AffineTransform();
            switch (orientation) {
                case 2 -> {
                    tx.scale(-1.0, 1.0);
                    tx.translate(-w, 0);
                }
                case 3 -> {
                    tx.translate(w, h);
                    tx.rotate(Math.PI);
                }
                case 4 -> {
                    tx.scale(1.0, -1.0);
                    tx.translate(0, -h);
                }
                case 5 -> {
                    tx.rotate(-Math.PI / 2.0);
                    tx.scale(-1.0, 1.0);
                }
                case 6 -> {
                    tx.translate(h, 0);
                    tx.rotate(Math.PI / 2.0);
                }
                case 7 -> {
                    tx.scale(-1.0, 1.0);
                    tx.translate(-h, 0);
                    tx.translate(0, w);
                    tx.rotate(3.0 * Math.PI / 2.0);
                }
                case 8 -> {
                    tx.translate(0, w);
                    tx.rotate(3.0 * Math.PI / 2.0);
                }
                default -> {
                    // Orientation 1 (normal) or unknown -> identity
                }
            }
            g.drawImage(src, tx, null);
        } finally {
            g.dispose();
        }
        return dest;
    }

    private static byte[] encodeJpeg(BufferedImage image, float quality) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream(16384);
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) {
            throw new IllegalStateException("JPEG ImageWriter unavailable");
        }
        ImageWriter writer = writers.next();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(baos)) {
            writer.setOutput(ios);
            ImageWriteParam param = writer.getDefaultWriteParam();
            if (param.canWriteCompressed()) {
                param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                param.setCompressionQuality(quality);
            }
            writer.write(null, new IIOImage(image, null, null), param);
            ios.flush();
            return baos.toByteArray();
        } catch (IOException e) {
            throw invalidMedia("Không thể mã hóa lại tệp ảnh JPEG.");
        } finally {
            writer.dispose();
        }
    }

    /**
     * Parses EXIF Orientation (tag 0x0112) from a JPEG APP1 segment if present.
     * Returns 1 when absent or malformed so callers never fail solely due to broken EXIF.
     */
    static int extractJpegExifOrientation(byte[] jpeg) {
        if (jpeg == null || jpeg.length < 4 || (jpeg[0] & 0xFF) != 0xFF || (jpeg[1] & 0xFF) != 0xD8) {
            return 1;
        }
        int pos = 2;
        while (pos + 4 <= jpeg.length) {
            if ((jpeg[pos] & 0xFF) != 0xFF) {
                break;
            }
            while (pos < jpeg.length && (jpeg[pos] & 0xFF) == 0xFF) {
                pos++;
            }
            if (pos >= jpeg.length) {
                break;
            }
            int marker = jpeg[pos++] & 0xFF;
            if (marker == 0xDA || marker == 0xD9) {
                break; // SOS or EOI
            }
            if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD8)) {
                continue; // Standalone markers (TEM, RST0..RST7, SOI) have no 2-byte length
            }
            if (pos + 2 > jpeg.length) {
                break;
            }
            int segLen = ((jpeg[pos] & 0xFF) << 8) | (jpeg[pos + 1] & 0xFF);
            if (segLen < 2 || pos + segLen > jpeg.length) {
                break;
            }
            if (marker == 0xE1 && segLen >= 16) {
                int payload = pos + 2;
                if (jpeg[payload] == 'E' && jpeg[payload + 1] == 'x'
                        && jpeg[payload + 2] == 'i' && jpeg[payload + 3] == 'f'
                        && jpeg[payload + 4] == 0 && jpeg[payload + 5] == 0) {
                    int tiffStart = payload + 6;
                    int segEnd = pos + segLen;
                    if (tiffStart + 8 <= segEnd) {
                        boolean littleEndian = jpeg[tiffStart] == 'I' && jpeg[tiffStart + 1] == 'I';
                        boolean bigEndian = jpeg[tiffStart] == 'M' && jpeg[tiffStart + 1] == 'M';
                        if (littleEndian || bigEndian) {
                            long ifdOffset = readUint32(jpeg, tiffStart + 4, littleEndian);
                            long ifdPosLong = (long) tiffStart + ifdOffset;
                            if (ifdOffset >= 8L && ifdPosLong + 2L <= segEnd) {
                                int ifdPos = (int) ifdPosLong;
                                int entryCount = readUint16(jpeg, ifdPos, littleEndian);
                                long entryPosLong = ifdPosLong + 2L;
                                for (int i = 0; i < entryCount && entryPosLong + 12L <= segEnd; i++, entryPosLong += 12L) {
                                    int entryPos = (int) entryPosLong;
                                    int tag = readUint16(jpeg, entryPos, littleEndian);
                                    if (tag == 0x0112) {
                                        int value = readUint16(jpeg, entryPos + 8, littleEndian);
                                        return (value >= 1 && value <= 8) ? value : 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            pos += segLen;
        }
        return 1;
    }

    private static int readUint16(byte[] data, int offset, boolean littleEndian) {
        if (littleEndian) {
            return (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
        }
        return ((data[offset] & 0xFF) << 8) | (data[offset + 1] & 0xFF);
    }

    private static long readUint32(byte[] data, int offset, boolean littleEndian) {
        if (littleEndian) {
            return (data[offset] & 0xFFL)
                    | ((data[offset + 1] & 0xFFL) << 8)
                    | ((data[offset + 2] & 0xFFL) << 16)
                    | ((data[offset + 3] & 0xFFL) << 24);
        }
        return ((data[offset] & 0xFFL) << 24)
                | ((data[offset + 1] & 0xFFL) << 16)
                | ((data[offset + 2] & 0xFFL) << 8)
                | (data[offset + 3] & 0xFFL);
    }

    private static int readUint16Le(byte[] data, int offset) {
        return (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
    }

    private static int readUint24Le(byte[] data, int offset) {
        return (data[offset] & 0xFF)
                | ((data[offset + 1] & 0xFF) << 8)
                | ((data[offset + 2] & 0xFF) << 16);
    }

    private static long readUint32Le(byte[] data, int offset) {
        return (data[offset] & 0xFFL)
                | ((data[offset + 1] & 0xFFL) << 8)
                | ((data[offset + 2] & 0xFFL) << 16)
                | ((data[offset + 3] & 0xFFL) << 24);
    }

    private static void writeUint32Le(byte[] data, int offset, long value) {
        data[offset] = (byte) (value & 0xFF);
        data[offset + 1] = (byte) ((value >>> 8) & 0xFF);
        data[offset + 2] = (byte) ((value >>> 16) & 0xFF);
        data[offset + 3] = (byte) ((value >>> 24) & 0xFF);
    }

    private static AuthFailure invalidMedia(String message) {
        return new AuthFailure(400, "INVALID_MEDIA", message);
    }
}
