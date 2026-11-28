package com.dormtrading.order;

import com.dormtrading.iam.auth.AuthFailure;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.errors.ErrorResponseException;
import io.minio.messages.ErrorResponse;
import java.io.ByteArrayInputStream;
import java.util.UUID;
import okhttp3.Headers;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@DisplayName("Kiểm thử đơn vị S3HandoverProofStorage (NFR-01, khóa hợp lệ, cạnh tranh tạo bucket, giới hạn đọc)")
class S3HandoverProofStorageUnitTest {

    private static final String BUCKET = "handover-proofs";
    private static final String VALID_KEY = UUID.randomUUID() + "/" + UUID.randomUUID() + ".jpg";

    private static ErrorResponseException minioError(String code) {
        ErrorResponse response = mock(ErrorResponse.class);
        when(response.code()).thenReturn(code);
        return new ErrorResponseException(response, null, null);
    }

    @Test
    void rejectsUnsafeStorageKeysBeforeCallingMinio() {
        MinioClient client = mock(MinioClient.class);
        S3HandoverProofStorage storage = new S3HandoverProofStorage(client, BUCKET, 5L * 1024 * 1024);

        assertThatThrownBy(() -> storage.store("../escape.jpg", new byte[]{1, 2}, "image/jpeg"))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");

        assertThatThrownBy(() -> storage.loadAsResource("bad-key.svg"))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_MEDIA");
    }

    @Test
    void storeAutoCreatesBucketOnceAndHandlesConcurrentBucketAlreadyOwnedRace() throws Exception {
        MinioClient client = mock(MinioClient.class);
        when(client.bucketExists(any(BucketExistsArgs.class))).thenReturn(false);
        doThrow(minioError("BucketAlreadyOwnedByYou"))
                .when(client).makeBucket(any(MakeBucketArgs.class));

        S3HandoverProofStorage storage = new S3HandoverProofStorage(client, BUCKET, 5L * 1024 * 1024);
        byte[] content = HandoverTestImages.sampleJpeg();

        storage.store(VALID_KEY, content, "image/jpeg");
        storage.store(UUID.randomUUID() + "/" + UUID.randomUUID() + ".png", content, "image/png");

        // Bucket readiness cached after first successful store
        verify(client, times(1)).bucketExists(any(BucketExistsArgs.class));
        verify(client, times(1)).makeBucket(any(MakeBucketArgs.class));
        verify(client, times(2)).putObject(any(PutObjectArgs.class));
    }

    @Test
    void loadAsResourceReturnsBytesAndMapsNoSuchKeyAndNoSuchBucketTo404() throws Exception {
        MinioClient client = mock(MinioClient.class);
        byte[] payload = HandoverTestImages.sampleJpeg();
        GetObjectResponse okStream = new GetObjectResponse(
                Headers.of("Content-Type", "image/jpeg"),
                BUCKET,
                "us-east-1",
                VALID_KEY,
                new ByteArrayInputStream(payload)
        );
        when(client.getObject(any(GetObjectArgs.class)))
                .thenReturn(okStream)
                .thenThrow(minioError("NoSuchKey"))
                .thenThrow(minioError("NoSuchBucket"))
                .thenThrow(minioError("AccessDenied"));

        S3HandoverProofStorage storage = new S3HandoverProofStorage(client, BUCKET, 5L * 1024 * 1024);

        Resource res = storage.loadAsResource(VALID_KEY);
        assertThat(res.contentLength()).isEqualTo(payload.length);
        assertThat(res.getContentAsByteArray()).isEqualTo(payload);

        assertThatThrownBy(() -> storage.loadAsResource(VALID_KEY))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(404, "PROOF_NOT_FOUND");

        assertThatThrownBy(() -> storage.loadAsResource(VALID_KEY))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(404, "PROOF_NOT_FOUND");

        assertThatThrownBy(() -> storage.loadAsResource(VALID_KEY))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void loadAsResourceRejectsOversizedStreamBeyondBound() throws Exception {
        MinioClient client = mock(MinioClient.class);
        byte[] tooLarge = new byte[128];
        GetObjectResponse largeStream = new GetObjectResponse(
                Headers.of("Content-Type", "image/jpeg"),
                BUCKET,
                "us-east-1",
                VALID_KEY,
                new ByteArrayInputStream(tooLarge)
        );
        when(client.getObject(any(GetObjectArgs.class))).thenReturn(largeStream);

        S3HandoverProofStorage storage = new S3HandoverProofStorage(client, BUCKET, 64L);
        assertThatThrownBy(() -> storage.loadAsResource(VALID_KEY))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("vượt quá giới hạn an toàn");
    }

    @Test
    void deleteQuietlySwallowsErrorsWithoutPropagating() throws Exception {
        MinioClient client = mock(MinioClient.class);
        doThrow(new RuntimeException("S3 transient outage"))
                .when(client).removeObject(any(RemoveObjectArgs.class));

        S3HandoverProofStorage storage = new S3HandoverProofStorage(client, BUCKET, 5L * 1024 * 1024);
        assertThatCode(() -> storage.deleteQuietly(VALID_KEY)).doesNotThrowAnyException();
        assertThatCode(() -> storage.deleteQuietly("../bad-key")).doesNotThrowAnyException();
        verify(client, times(1)).removeObject(any(RemoveObjectArgs.class));
    }
}
