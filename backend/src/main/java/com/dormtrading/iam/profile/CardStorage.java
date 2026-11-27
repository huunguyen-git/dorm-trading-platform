package com.dormtrading.iam.profile;

import java.util.Optional;

/**
 * Nơi lưu ảnh thẻ sinh viên (NFR-01). Backend chọn bằng {@code storage.backend}:
 * {@code local} (mặc định, dev/test) hoặc {@code s3} (MinIO/S3).
 */
interface CardStorage {
    void put(String key, byte[] bytes, String mime);

    Optional<byte[]> get(String key);

    void delete(String key);
}
