package com.dormtrading.catalog.media;

import com.dormtrading.iam.auth.AuthFailure;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class LocalDiskMediaStorage implements MediaStorage {

    private final Path rootDir;

    public LocalDiskMediaStorage(@Value("${app.media.storage-dir:./data/uploads}") String storageDir) {
        this.rootDir = Paths.get(storageDir).toAbsolutePath().normalize();
    }

    public Path rootDir() {
        return rootDir;
    }

    public Path resolveSafePath(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Đường dẫn lưu trữ hình ảnh không hợp lệ.");
        }
        if (storageKey.contains("\\") || storageKey.startsWith("/") || storageKey.contains("\0")) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Đường dẫn lưu trữ hình ảnh không hợp lệ.");
        }
        for (String segment : storageKey.split("/")) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Đường dẫn lưu trữ hình ảnh không hợp lệ.");
            }
        }
        Path resolved = rootDir.resolve(storageKey).normalize();
        if (!resolved.startsWith(rootDir) || resolved.equals(rootDir)) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Đường dẫn lưu trữ hình ảnh không hợp lệ.");
        }
        return resolved;
    }

    @Override
    public void store(String storageKey, byte[] content) {
        Path target = resolveSafePath(storageKey);
        try {
            Path parent = target.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Files.write(target, content);
        } catch (IOException e) {
            throw new IllegalStateException("Không thể lưu tệp hình ảnh lên ổ đĩa.", e);
        }
    }

    @Override
    public byte[] load(String storageKey) {
        Path target = resolveSafePath(storageKey);
        if (!Files.isRegularFile(target)) {
            throw new AuthFailure(404, "MEDIA_NOT_FOUND", "Không tìm thấy hình ảnh.");
        }
        try {
            return Files.readAllBytes(target);
        } catch (IOException e) {
            throw new IllegalStateException("Không thể đọc tệp hình ảnh từ ổ đĩa.", e);
        }
    }

    @Override
    public void deleteQuietly(String storageKey) {
        try {
            Path target = resolveSafePath(storageKey);
            Files.deleteIfExists(target);
        } catch (RuntimeException | IOException ignored) {
            // Best-effort cleanup on failed upload transaction.
        }
    }
}
