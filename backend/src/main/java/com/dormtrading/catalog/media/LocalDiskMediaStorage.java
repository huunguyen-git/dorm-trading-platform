package com.dormtrading.catalog.media;

import com.dormtrading.iam.auth.AuthFailure;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.function.Predicate;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
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
    public Resource loadAsResource(String storageKey) {
        Path target = resolveSafePath(storageKey);
        if (!Files.isRegularFile(target) || !Files.isReadable(target)) {
            throw new AuthFailure(404, "MEDIA_NOT_FOUND", "Không tìm thấy hình ảnh.");
        }
        return new FileSystemResource(target);
    }

    @Override
    public void deleteQuietly(String storageKey) {
        try {
            Path target = resolveSafePath(storageKey);
            Files.deleteIfExists(target);
        } catch (RuntimeException | IOException ignored) {
            // Best-effort cleanup on failed upload transaction or orphan sweep.
        }
    }

    @Override
    public List<String> listKeysOlderThan(Instant cutoff, int maxKeys) {
        if (cutoff == null || maxKeys <= 0 || !Files.isDirectory(rootDir)) {
            return List.of();
        }
        List<String> keys = new ArrayList<>();
        visitKeysOlderThan(cutoff, maxKeys, chunk -> {
            for (String key : chunk) {
                if (keys.size() >= maxKeys) {
                    return false;
                }
                keys.add(key);
            }
            return keys.size() < maxKeys;
        });
        return List.copyOf(keys);
    }

    @Override
    public void visitKeysOlderThan(Instant cutoff, int chunkSize, Predicate<List<String>> chunkConsumer) {
        if (cutoff == null || chunkSize <= 0 || chunkConsumer == null || !Files.isDirectory(rootDir)) {
            return;
        }
        List<String> batch = new ArrayList<>(Math.min(chunkSize, 500));
        try (Stream<Path> walk = Files.walk(rootDir, 4)) {
            Iterator<Path> it = walk.iterator();
            while (it.hasNext()) {
                Path path = it.next();
                if (!Files.isRegularFile(path)) {
                    continue;
                }
                try {
                    Instant mtime = Files.getLastModifiedTime(path).toInstant();
                    if (mtime.isBefore(cutoff)) {
                        String key = rootDir.relativize(path).toString().replace('\\', '/');
                        batch.add(key);
                        if (batch.size() >= chunkSize) {
                            boolean keepGoing = chunkConsumer.test(List.copyOf(batch));
                            batch.clear();
                            if (!keepGoing) {
                                return;
                            }
                        }
                    }
                } catch (IOException ignored) {
                    // Skip unreadable/concurrently deleted files.
                }
            }
            if (!batch.isEmpty()) {
                chunkConsumer.test(List.copyOf(batch));
            }
        } catch (IOException ignored) {
            // Best-effort sweep; transient filesystem errors are skipped until next cycle.
        }
    }
}
