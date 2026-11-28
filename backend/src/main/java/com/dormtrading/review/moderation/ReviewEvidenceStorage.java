package com.dormtrading.review.moderation;

import org.springframework.core.io.Resource;

/**
 * Private storage abstraction for review and complaint evidence images (P3-05 / NFR-01).
 */
public interface ReviewEvidenceStorage {

    void store(String storageKey, byte[] content);

    Resource loadAsResource(String storageKey);

    void deleteQuietly(String storageKey);
}
