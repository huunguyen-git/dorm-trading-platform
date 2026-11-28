package com.dormtrading.order.dispute;

import com.dormtrading.iam.auth.AuthFailure;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * Local filesystem implementation of {@link DisputeEvidenceStorage} with strict path-traversal
 * protection. Never writes into or reads from public {@code media_files} storage.
 */
@Component
public class LocalDisputeEvidenceStorage implements DisputeEvidenceStorage {

    private final Path evidenceRootDir;
    private final Path handoverRootDir;

    public LocalDisputeEvidenceStorage(
            @Value("${app.dispute.evidence.local-dir:.local/dispute-evidence}") String evidenceDir,
            @Value("${app.dispute.handover-proofs.local-dir:${storage.handover-proofs.local-dir:.local/handover-proofs}}")
            String handoverDir
    ) {
        this.evidenceRootDir = Paths.get(evidenceDir).toAbsolutePath().normalize();
        this.handoverRootDir = Paths.get(handoverDir).toAbsolutePath().normalize();
    }

    public Path evidenceRootDir() {
        return evidenceRootDir;
    }

    public Path handoverRootDir() {
        return handoverRootDir;
    }

    public Path resolveSafePath(Path root, String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            throw new AuthFailure(400, "INVALID_STORAGE_KEY", "Đường dẫn lưu trữ bằng chứng không hợp lệ.");
        }
        if (storageKey.contains("\\") || storageKey.startsWith("/") || storageKey.contains("\0")) {
            throw new AuthFailure(400, "INVALID_STORAGE_KEY", "Đường dẫn lưu trữ bằng chứng không hợp lệ.");
        }
        for (String segment : storageKey.split("/")) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) {
                throw new AuthFailure(400, "INVALID_STORAGE_KEY", "Đường dẫn lưu trữ bằng chứng không hợp lệ.");
            }
        }
        Path resolved = root.resolve(storageKey).normalize();
        if (!resolved.startsWith(root) || resolved.equals(root)) {
            throw new AuthFailure(400, "INVALID_STORAGE_KEY", "Đường dẫn lưu trữ bằng chứng không hợp lệ.");
        }
        return resolved;
    }

    @Override
    public void store(String storageKey, byte[] content) {
        Path target = resolveSafePath(evidenceRootDir, storageKey);
        try {
            Path parent = target.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Files.write(target, content);
        } catch (IOException e) {
            throw new IllegalStateException("Không thể lưu tệp bằng chứng lên ổ đĩa.", e);
        }
    }

    @Override
    public Resource loadAsResource(String storageKey) {
        Path target = resolveSafePath(evidenceRootDir, storageKey);
        if (!Files.isRegularFile(target) || !Files.isReadable(target)) {
            throw new AuthFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy tệp bằng chứng.");
        }
        return new FileSystemResource(target);
    }

    @Override
    public Resource loadHandoverAsResource(String storageKey) {
        Path inHandoverDir = resolveSafePath(handoverRootDir, storageKey);
        if (Files.isRegularFile(inHandoverDir) && Files.isReadable(inHandoverDir)) {
            return new FileSystemResource(inHandoverDir);
        }
        Path inEvidenceDir = resolveSafePath(evidenceRootDir, storageKey);
        if (Files.isRegularFile(inEvidenceDir) && Files.isReadable(inEvidenceDir)) {
            return new FileSystemResource(inEvidenceDir);
        }
        throw new AuthFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy ảnh bàn giao.");
    }

    @Override
    public void deleteQuietly(String storageKey) {
        try {
            Path target = resolveSafePath(evidenceRootDir, storageKey);
            Files.deleteIfExists(target);
        } catch (RuntimeException | IOException ignored) {
            // Best-effort cleanup on transaction rollback.
        }
    }
}
