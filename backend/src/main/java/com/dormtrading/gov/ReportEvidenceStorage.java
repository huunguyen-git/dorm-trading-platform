package com.dormtrading.gov;

import org.springframework.core.io.Resource;

/**
 * Private storage abstraction for report evidence images (P2-06 / NFR-01).
 * Kept strictly separate from public listing media storage.
 */
public interface ReportEvidenceStorage {

    void store(String storageKey, byte[] content);

    Resource loadAsResource(String storageKey);

    void deleteQuietly(String storageKey);
}
