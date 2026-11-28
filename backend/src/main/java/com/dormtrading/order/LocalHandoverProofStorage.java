package com.dormtrading.order;

import com.dormtrading.iam.auth.AuthFailure;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * Local filesystem backend for private handover proof photos (dev/test default when {@code storage.backend=local}).
 */
@Component
@ConditionalOnProperty(name = "storage.backend", havingValue = "local", matchIfMissing = true)
public class LocalHandoverProofStorage implements HandoverProofStorage {

    private static final Logger log = LoggerFactory.getLogger(LocalHandoverProofStorage.class);

    private final Path rootDir;

    public LocalHandoverProofStorage(
            @Value("${storage.handover-proofs.local-dir:.local/handover-proofs}") String storageDir
    ) {
        this.rootDir = Paths.get(storageDir).toAbsolutePath().normalize();
    }

    public Path rootDir() {
        return rootDir;
    }

    public Path resolveSafePath(String storageKey) {
        String validKey = HandoverProofKeys.validate(storageKey);
        Path resolved = rootDir.resolve(validKey).normalize();
        if (!resolved.startsWith(rootDir) || resolved.equals(rootDir)) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Đường dẫn ảnh bàn giao không hợp lệ.");
        }
        return resolved;
    }

    @Override
    public void store(String storageKey, byte[] content, String contentType) {
        Path target = resolveSafePath(storageKey);
        try {
            Path parent = target.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Files.write(target, content);
        } catch (IOException e) {
            throw new IllegalStateException("Không thể lưu ảnh bàn giao lên ổ đĩa.", e);
        }
    }

    @Override
    public Resource loadAsResource(String storageKey) {
        Path target = resolveSafePath(storageKey);
        if (!Files.isRegularFile(target) || !Files.isReadable(target)) {
            throw new AuthFailure(404, "PROOF_NOT_FOUND", "Không tìm thấy ảnh bàn giao.");
        }
        return new FileSystemResource(target);
    }

    @Override
    public void deleteQuietly(String storageKey) {
        try {
            Path target = resolveSafePath(storageKey);
            Files.deleteIfExists(target);
        } catch (RuntimeException | IOException e) {
            log.warn("Failed to clean up local handover proof key={}: {}", storageKey, e.getMessage());
        }
    }
}
