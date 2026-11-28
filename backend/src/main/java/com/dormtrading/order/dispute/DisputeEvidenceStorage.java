package com.dormtrading.order.dispute;

import org.springframework.core.io.Resource;

/**
 * Isolated private storage abstraction for dispute supplementary evidence and handover proof access
 * (NFR-01: strictly separated from public listing media_files).
 */
public interface DisputeEvidenceStorage {

    void store(String storageKey, byte[] content);

    Resource loadAsResource(String storageKey);

    Resource loadHandoverAsResource(String storageKey);

    void deleteQuietly(String storageKey);
}
