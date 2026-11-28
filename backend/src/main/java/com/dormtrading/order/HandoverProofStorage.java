package com.dormtrading.order;

import org.springframework.core.io.Resource;

/**
 * Isolated storage abstraction for private handover proof photos (UC-27 / NFR-01).
 * Strictly separated from public listing media ({@code media_files} / {@code /api/v1/media/{id}}).
 */
public interface HandoverProofStorage {

    void store(String storageKey, byte[] content, String contentType);

    Resource loadAsResource(String storageKey);

    void deleteQuietly(String storageKey);
}
