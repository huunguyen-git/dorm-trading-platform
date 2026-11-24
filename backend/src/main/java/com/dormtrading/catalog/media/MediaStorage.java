package com.dormtrading.catalog.media;

public interface MediaStorage {

    void store(String storageKey, byte[] content);

    byte[] load(String storageKey);

    void deleteQuietly(String storageKey);
}
