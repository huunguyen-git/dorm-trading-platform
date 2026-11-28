package com.dormtrading.order;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;

final class HandoverTestImages {

    private HandoverTestImages() {
    }

    static byte[] sampleJpeg() {
        return createValidJpeg(4, 2);
    }

    static byte[] samplePng() {
        return createValidPng(3, 2);
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

    static byte[] jpegWithExifOrientation6AndGps() {
        byte[] clean = createValidJpeg(4, 2);
        byte[] tiffAndGps = new byte[]{
                'E', 'x', 'i', 'f', 0x00, 0x00,
                'I', 'I', 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
                0x01, 0x00,
                0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 6, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                'G', 'P', 'S', ':', '1', '0', '.', '8', '7', '8', '2', ',', '1', '0', '6', '.', '8', '0', '6', '3'
        };
        int segLen = tiffAndGps.length + 2;
        ByteArrayOutputStream out = new ByteArrayOutputStream(clean.length + segLen + 4);
        out.write(0xFF);
        out.write(0xD8);
        out.write(0xFF);
        out.write(0xE1);
        out.write((segLen >>> 8) & 0xFF);
        out.write(segLen & 0xFF);
        out.write(tiffAndGps, 0, tiffAndGps.length);
        out.write(clean, 2, clean.length - 2);
        return out.toByteArray();
    }

    static byte[] webpWithExifAndXmp() {
        ByteArrayOutputStream chunks = new ByteArrayOutputStream();
        writeWebpChunk(chunks, "VP8X", new byte[]{0x0C, 0, 0, 0, 0, 0, 0, 0, 0, 0});
        writeWebpChunk(chunks, "VP8L", new byte[]{0x2F, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0});
        writeWebpChunk(chunks, "EXIF", "ExifGPS10.8782".getBytes(StandardCharsets.US_ASCII));
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
}
