package com.dormtrading.iam.profile;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.errors.ErrorResponseException;
import java.io.ByteArrayInputStream;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Object storage (MinIO / S3 API) cho môi trường thật. Bật bằng {@code storage.backend=s3}. */
@Component
@ConditionalOnProperty(name = "storage.backend", havingValue = "s3")
class S3CardStorage implements CardStorage {
    private final MinioClient client;
    private final String bucket;
    private volatile boolean bucketReady;

    S3CardStorage(@Value("${storage.s3.endpoint}") String endpoint,
                  @Value("${storage.s3.access-key}") String accessKey,
                  @Value("${storage.s3.secret-key}") String secretKey,
                  @Value("${storage.s3.buckets.student-cards:student-cards}") String bucket) {
        this.client = MinioClient.builder().endpoint(endpoint).credentials(accessKey, secretKey).build();
        this.bucket = bucket;
    }

    @Override
    public void put(String key, byte[] bytes, String mime) {
        try {
            // Chỉ kiểm tra/tạo bucket một lần: tránh gọi CreateBucket mỗi lần ghi.
            if (!bucketReady) {
                synchronized (this) {
                    if (!bucketReady) {
                        if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build()))
                            client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                        bucketReady = true;
                    }
                }
            }
            client.putObject(PutObjectArgs.builder().bucket(bucket).object(key)
                    .stream(new ByteArrayInputStream(bytes), bytes.length, -1).contentType(mime).build());
        } catch (Exception e) {
            bucketReady = false;
            throw new IllegalStateException("Không ghi được ảnh thẻ lên object storage.", e);
        }
    }

    @Override
    public Optional<byte[]> get(String key) {
        try (var stream = client.getObject(GetObjectArgs.builder().bucket(bucket).object(key).build())) {
            return Optional.of(stream.readAllBytes());
        } catch (ErrorResponseException e) {
            if ("NoSuchKey".equals(e.errorResponse().code())) return Optional.empty();
            throw new IllegalStateException("Không đọc được ảnh thẻ từ object storage.", e);
        } catch (Exception e) {
            throw new IllegalStateException("Không đọc được ảnh thẻ từ object storage.", e);
        }
    }

    @Override
    public void delete(String key) {
        try {
            client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
        } catch (Exception e) {
            throw new IllegalStateException("Không xóa được ảnh thẻ trên object storage.", e);
        }
    }
}
