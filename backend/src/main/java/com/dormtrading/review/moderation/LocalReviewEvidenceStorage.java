package com.dormtrading.review.moderation;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

@Component
public class LocalReviewEvidenceStorage implements ReviewEvidenceStorage {

    private final Path rootDir;

    public LocalReviewEvidenceStorage(@Value("${app.reviews.evidence-dir:.local/review-evidence}") String storageDir) {
        this.rootDir = Paths.get(storageDir).toAbsolutePath().normalize();
    }

    public Path resolveSafePath(String storageKey) {
        if (storageKey == null || storageKey.isBlank()
                || storageKey.contains("\\")
                || storageKey.startsWith("/")
                || storageKey.contains("\0")) {
            throw new ReviewModerationFailure(400, "INVALID_MEDIA", "Đường dẫn tệp bằng chứng không hợp lệ.");
        }
        for (String segment : storageKey.split("/")) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) {
                throw new ReviewModerationFailure(400, "INVALID_MEDIA", "Đường dẫn tệp bằng chứng không hợp lệ.");
            }
        }
        Path resolved = rootDir.resolve(storageKey).normalize();
        if (!resolved.startsWith(rootDir) || resolved.equals(rootDir)) {
            throw new ReviewModerationFailure(400, "INVALID_MEDIA", "Đường dẫn tệp bằng chứng không hợp lệ.");
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
            throw new ReviewModerationFailure(503, "EVIDENCE_STORAGE_UNAVAILABLE",
                    "Không thể lưu tệp bằng chứng lúc này. Vui lòng thử lại.");
        }
    }

    @Override
    public Resource loadAsResource(String storageKey) {
        Path target = resolveSafePath(storageKey);
        if (!Files.isRegularFile(target) || !Files.isReadable(target)) {
            throw new ReviewModerationFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy tệp bằng chứng.");
        }
        return new FileSystemResource(target);
    }

    @Override
    public void deleteQuietly(String storageKey) {
        try {
            Path target = resolveSafePath(storageKey);
            Files.deleteIfExists(target);
        } catch (RuntimeException | IOException ignored) {
            // Best-effort cleanup on rollback
        }
    }
}
