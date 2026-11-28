package com.dormtrading.order;

import com.dormtrading.iam.auth.AuthFailure;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.errors.ErrorResponseException;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * MinIO / S3 object storage backend for private handover proof photos ({@code storage.backend=s3}).
 */
@Component
@ConditionalOnProperty(name = "storage.backend", havingValue = "s3")
public class S3HandoverProofStorage implements HandoverProofStorage {

    private static final Logger log = LoggerFactory.getLogger(S3HandoverProofStorage.class);
    private static final long DEFAULT_MAX_PROOF_SIZE_BYTES = 5L * 1024 * 1024;

    private final MinioClient client;
    private final String bucket;
    private final long maxProofSizeBytes;
    private volatile boolean bucketReady;

    @Autowired
    public S3HandoverProofStorage(
            @Value("${storage.s3.endpoint}") String endpoint,
            @Value("${storage.s3.access-key}") String accessKey,
            @Value("${storage.s3.secret-key}") String secretKey,
            @Value("${storage.s3.region:us-east-1}") String region,
            @Value("${storage.s3.buckets.handover-proofs:handover-proofs}") String bucket,
            @Value("${app.media.max-file-size-bytes:5242880}") long maxProofSizeBytes
    ) {
        MinioClient.Builder builder = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey);
        if (region != null && !region.isBlank()) {
            builder.region(region.strip());
        }
        this.client = builder.build();
        this.bucket = bucket;
        this.maxProofSizeBytes = maxProofSizeBytes > 0 ? maxProofSizeBytes : DEFAULT_MAX_PROOF_SIZE_BYTES;
    }

    S3HandoverProofStorage(MinioClient client, String bucket, long maxProofSizeBytes) {
        this.client = client;
        this.bucket = bucket;
        this.maxProofSizeBytes = maxProofSizeBytes > 0 ? maxProofSizeBytes : DEFAULT_MAX_PROOF_SIZE_BYTES;
    }

    @Override
    public void store(String storageKey, byte[] content, String contentType) {
        String validKey = HandoverProofKeys.validate(storageKey);
        try {
            ensureBucketReady();
            client.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(validKey)
                    .stream(new ByteArrayInputStream(content), content.length, -1)
                    .contentType(contentType)
                    .build());
        } catch (AuthFailure e) {
            throw e;
        } catch (Exception e) {
            bucketReady = false;
            throw new IllegalStateException("Không thể lưu ảnh bàn giao lên object storage.", e);
        }
    }

    @Override
    public Resource loadAsResource(String storageKey) {
        String validKey = HandoverProofKeys.validate(storageKey);
        try (InputStream stream = client.getObject(GetObjectArgs.builder().bucket(bucket).object(validKey).build())) {
            byte[] bytes = readBounded(stream, maxProofSizeBytes);
            return new ByteArrayResource(bytes);
        } catch (AuthFailure e) {
            throw e;
        } catch (ErrorResponseException e) {
            String errorCode = e.errorResponse() != null ? e.errorResponse().code() : null;
            if ("NoSuchKey".equals(errorCode) || "NoSuchBucket".equals(errorCode)) {
                throw new AuthFailure(404, "PROOF_NOT_FOUND", "Không tìm thấy ảnh bàn giao.");
            }
            throw new IllegalStateException("Không đọc được ảnh bàn giao từ object storage.", e);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Không đọc được ảnh bàn giao từ object storage.", e);
        }
    }

    @Override
    public void deleteQuietly(String storageKey) {
        try {
            String validKey = HandoverProofKeys.validate(storageKey);
            client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(validKey).build());
        } catch (Exception e) {
            log.warn("Failed to clean up S3 handover proof object bucket={} key={}: {}", bucket, storageKey, e.getMessage());
        }
    }

    private void ensureBucketReady() throws Exception {
        if (bucketReady) {
            return;
        }
        synchronized (this) {
            if (bucketReady) {
                return;
            }
            if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                try {
                    client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                } catch (ErrorResponseException e) {
                    String errorCode = e.errorResponse() != null ? e.errorResponse().code() : null;
                    if (!"BucketAlreadyOwnedByYou".equals(errorCode) && !"BucketAlreadyExists".equals(errorCode)) {
                        throw e;
                    }
                }
            }
            bucketReady = true;
        }
    }

    private static byte[] readBounded(InputStream stream, long maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long total = 0;
        int read;
        while ((read = stream.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) {
                throw new IllegalStateException("Kích thước ảnh bàn giao trên object storage vượt quá giới hạn an toàn.");
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }
}
