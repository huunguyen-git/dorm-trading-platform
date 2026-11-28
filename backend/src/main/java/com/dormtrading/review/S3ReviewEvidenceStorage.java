package com.dormtrading.review;

import com.dormtrading.iam.auth.AuthFailure;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.errors.ErrorResponseException;
import java.io.ByteArrayInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * MinIO / S3-compatible private object storage for review evidence (NFR-01).
 * Enabled when {@code storage.backend=s3} (e.g., Docker Compose / production deployments).
 */
@Component
@ConditionalOnProperty(name = "storage.backend", havingValue = "s3")
public class S3ReviewEvidenceStorage implements ReviewEvidenceStorage {

    private static final Logger log = LoggerFactory.getLogger(S3ReviewEvidenceStorage.class);

    private final MinioClient client;
    private final String bucket;
    private volatile boolean bucketReady;

    @Autowired
    public S3ReviewEvidenceStorage(
            @Value("${storage.s3.endpoint}") String endpoint,
            @Value("${storage.s3.access-key}") String accessKey,
            @Value("${storage.s3.secret-key}") String secretKey,
            @Value("${storage.s3.buckets.review-evidence:review-evidence}") String bucket
    ) {
        this(
                MinioClient.builder().endpoint(endpoint).credentials(accessKey, secretKey).build(),
                bucket
        );
    }

    S3ReviewEvidenceStorage(MinioClient client, String bucket) {
        this.client = client;
        this.bucket = bucket;
    }

    @Override
    public void store(String storageKey, byte[] content, String contentType) {
        LocalDiskReviewEvidenceStorage.validateSafeKey(storageKey);
        try {
            ensureBucket();
            String effectiveMime = (contentType == null || contentType.isBlank())
                    ? "application/octet-stream"
                    : contentType;
            client.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(storageKey)
                    .stream(new ByteArrayInputStream(content), content.length, -1)
                    .contentType(effectiveMime)
                    .build());
        } catch (Exception e) {
            bucketReady = false;
            throw new IllegalStateException("Không ghi được tệp bằng chứng lên object storage.", e);
        }
    }

    @Override
    public Resource loadAsResource(String storageKey) {
        LocalDiskReviewEvidenceStorage.validateSafeKey(storageKey);
        try (var stream = client.getObject(GetObjectArgs.builder().bucket(bucket).object(storageKey).build())) {
            byte[] bytes = stream.readAllBytes();
            return new ByteArrayResource(bytes);
        } catch (ErrorResponseException e) {
            if (e.errorResponse() != null && "NoSuchKey".equals(e.errorResponse().code())) {
                throw new AuthFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy tệp bằng chứng.");
            }
            throw new IllegalStateException("Không đọc được tệp bằng chứng từ object storage.", e);
        } catch (Exception e) {
            throw new IllegalStateException("Không đọc được tệp bằng chứng từ object storage.", e);
        }
    }

    @Override
    public void deleteQuietly(String storageKey) {
        try {
            LocalDiskReviewEvidenceStorage.validateSafeKey(storageKey);
            client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(storageKey).build());
        } catch (Exception e) {
            log.warn("Best-effort delete of S3 review evidence '{}' in bucket '{}' failed: {}", storageKey, bucket, e.getMessage());
        }
    }

    private void ensureBucket() throws Exception {
        if (!bucketReady) {
            synchronized (this) {
                if (!bucketReady) {
                    if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                        client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                    }
                    bucketReady = true;
                }
            }
        }
    }
}
