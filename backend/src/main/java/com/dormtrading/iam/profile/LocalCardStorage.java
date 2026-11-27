package com.dormtrading.iam.profile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Backend mặc định cho dev/test: thư mục cục bộ, không cần chạy MinIO. */
@Component
@ConditionalOnProperty(name = "storage.backend", havingValue = "local", matchIfMissing = true)
class LocalCardStorage implements CardStorage {
    private static final Pattern KEY = Pattern.compile("[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\\.(jpg|png)");
    private final Path root;

    LocalCardStorage(@Value("${storage.local.dir:.local/student-cards}") String dir) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
    }

    @Override
    public void put(String key, byte[] bytes, String mime) {
        Path file = resolve(key);
        try {
            Files.createDirectories(file.getParent());
            Files.write(file, bytes);
        } catch (IOException e) {
            throw new UncheckedIOException("Không ghi được ảnh thẻ.", e);
        }
    }

    @Override
    public Optional<byte[]> get(String key) {
        Path file = resolve(key);
        try {
            return Files.exists(file) ? Optional.of(Files.readAllBytes(file)) : Optional.empty();
        } catch (IOException e) {
            throw new UncheckedIOException("Không đọc được ảnh thẻ.", e);
        }
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException e) {
            throw new UncheckedIOException("Không xóa được ảnh thẻ.", e);
        }
    }

    // Key do server sinh; vẫn kiểm tra để chặn path traversal nếu key trong DB bị sửa.
    private Path resolve(String key) {
        if (key == null || !KEY.matcher(key).matches())
            throw new IllegalArgumentException("object key không hợp lệ");
        return root.resolve(key);
    }
}
