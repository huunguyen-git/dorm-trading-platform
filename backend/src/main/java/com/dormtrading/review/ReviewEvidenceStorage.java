package com.dormtrading.review;

import java.time.Instant;
import java.util.List;
import java.util.function.Predicate;
import org.springframework.core.io.Resource;

/**
 * Private storage abstraction for review evidence files (NFR-01),
 * strictly isolated from public listing media storage.
 */
public interface ReviewEvidenceStorage {

    void store(String storageKey, byte[] content, String contentType);

    Resource loadAsResource(String storageKey);

    void deleteQuietly(String storageKey);

    default void visitKeysOlderThan(Instant cutoff, int chunkSize, Predicate<List<String>> chunkConsumer) {
        // Optional local filesystem orphan sweep; S3/object storage relies on DB-tracked draft cleanup.
    }
}
