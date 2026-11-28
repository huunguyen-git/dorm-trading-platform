package com.dormtrading.review;

import org.springframework.core.io.Resource;

/**
 * Private storage abstraction for review evidence files (NFR-01),
 * strictly isolated from public listing media storage.
 */
public interface ReviewEvidenceStorage {

    void store(String storageKey, byte[] content);

    Resource loadAsResource(String storageKey);

    void deleteQuietly(String storageKey);
}
