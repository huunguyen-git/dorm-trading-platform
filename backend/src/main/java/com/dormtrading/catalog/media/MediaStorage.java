package com.dormtrading.catalog.media;

import java.time.Instant;
import java.util.List;
import java.util.function.Predicate;
import org.springframework.core.io.Resource;

public interface MediaStorage {

    void store(String storageKey, byte[] content);

    Resource loadAsResource(String storageKey);

    void deleteQuietly(String storageKey);

    default List<String> listKeysOlderThan(Instant cutoff, int maxKeys) {
        return List.of();
    }

    /**
     * Streams storage keys older than {@code cutoff} in bounded chunks to {@code chunkConsumer},
     * stopping early as soon as {@code chunkConsumer} returns {@code false}.
     */
    default void visitKeysOlderThan(Instant cutoff, int chunkSize, Predicate<List<String>> chunkConsumer) {
        if (chunkConsumer == null || chunkSize <= 0) {
            return;
        }
        List<String> keys = listKeysOlderThan(cutoff, chunkSize);
        if (!keys.isEmpty()) {
            chunkConsumer.test(keys);
        }
    }
}
