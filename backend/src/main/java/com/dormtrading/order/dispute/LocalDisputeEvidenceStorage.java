package com.dormtrading.order.dispute;

import com.dormtrading.iam.auth.AuthFailure;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * Local filesystem implementation of {@link DisputeEvidenceStorage} with strict lexical and
 * symlink-safe path-traversal protection. Never writes into or reads from public {@code media_files} storage.
 */
@Component
public class LocalDisputeEvidenceStorage implements DisputeEvidenceStorage {

    private static final Logger log = LoggerFactory.getLogger(LocalDisputeEvidenceStorage.class);
    private static final String STORAGE_UNAVAILABLE_MESSAGE =
            "Không thể truy cập kho tệp bằng chứng lúc này. Vui lòng thử lại.";

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
            Files.createDirectories(evidenceRootDir);
            Path realRoot = evidenceRootDir.toRealPath();
            Path parent = target.getParent();
            if (parent != null) {
                verifyNoSymlinkSegments(evidenceRootDir, parent);
                Files.createDirectories(parent);
                Path realParent = parent.toRealPath();
                if (!realParent.startsWith(realRoot)) {
                    throw new AuthFailure(400, "INVALID_STORAGE_KEY", "Đường dẫn lưu trữ bằng chứng không hợp lệ.");
                }
            }
            if (Files.isSymbolicLink(target)) {
                throw new AuthFailure(400, "INVALID_STORAGE_KEY", "Đường dẫn lưu trữ bằng chứng không hợp lệ.");
            }
            Files.write(target, content);
        } catch (AuthFailure e) {
            throw e;
        } catch (IOException e) {
            log.error("Failed to store dispute evidence file for key {}", storageKey, e);
            throw new AuthFailure(503, "DISPUTE_UNAVAILABLE", STORAGE_UNAVAILABLE_MESSAGE);
        }
    }

    @Override
    public Resource loadAsResource(String storageKey) {
        return tryLoadSafeRegularFile(evidenceRootDir, storageKey)
                .orElseThrow(() -> new AuthFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy tệp bằng chứng."));
    }

    @Override
    public Resource loadHandoverAsResource(String storageKey) {
        Optional<Resource> inHandoverDir = tryLoadSafeRegularFile(handoverRootDir, storageKey);
        if (inHandoverDir.isPresent()) {
            return inHandoverDir.get();
        }
        Optional<Resource> inEvidenceDir = tryLoadSafeRegularFile(evidenceRootDir, storageKey);
        if (inEvidenceDir.isPresent()) {
            return inEvidenceDir.get();
        }
        throw new AuthFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy ảnh bàn giao.");
    }

    @Override
    public void deleteQuietly(String storageKey) {
        try {
            Path target = resolveSafePath(evidenceRootDir, storageKey);
            if (!Files.exists(evidenceRootDir) || Files.isSymbolicLink(target)) {
                return;
            }
            Path realRoot = evidenceRootDir.toRealPath();
            Path parent = target.getParent();
            if (parent != null && Files.exists(parent) && !parent.toRealPath().startsWith(realRoot)) {
                return;
            }
            Files.deleteIfExists(target);
        } catch (RuntimeException | IOException ignored) {
            // Best-effort cleanup on transaction rollback.
        }
    }

    private Optional<Resource> tryLoadSafeRegularFile(Path root, String storageKey) {
        Path target = resolveSafePath(root, storageKey);
        if (!Files.exists(root)) {
            return Optional.empty();
        }
        if (Files.isSymbolicLink(target)) {
            throw new AuthFailure(400, "INVALID_STORAGE_KEY", "Đường dẫn lưu trữ bằng chứng không hợp lệ.");
        }
        if (!Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS)) {
            return Optional.empty();
        }
        try {
            Path realRoot = root.toRealPath();
            Path realTarget = target.toRealPath();
            if (!realTarget.startsWith(realRoot) || realTarget.equals(realRoot)) {
                throw new AuthFailure(400, "INVALID_STORAGE_KEY", "Đường dẫn lưu trữ bằng chứng không hợp lệ.");
            }
            if (!Files.isReadable(realTarget)) {
                throw new AuthFailure(503, "DISPUTE_UNAVAILABLE", STORAGE_UNAVAILABLE_MESSAGE);
            }
            return Optional.of(new FileSystemResource(realTarget));
        } catch (AuthFailure e) {
            throw e;
        } catch (NoSuchFileException e) {
            return Optional.empty();
        } catch (IOException e) {
            log.error("Failed to read dispute evidence file for key {}", storageKey, e);
            throw new AuthFailure(503, "DISPUTE_UNAVAILABLE", STORAGE_UNAVAILABLE_MESSAGE);
        }
    }

    private static void verifyNoSymlinkSegments(Path root, Path targetDir) {
        Path relative = root.relativize(targetDir);
        Path cursor = root;
        for (Path part : relative) {
            cursor = cursor.resolve(part);
            if (Files.isSymbolicLink(cursor)) {
                throw new AuthFailure(400, "INVALID_STORAGE_KEY", "Đường dẫn lưu trữ bằng chứng không hợp lệ.");
            }
        }
    }
}
