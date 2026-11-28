package com.dormtrading.review;

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
import java.nio.charset.StandardCharsets;
import okhttp3.Headers;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class S3ReviewEvidenceStorageUnitTest {

    @Test
    void storeCreatesBucketOnceAndUploadsWithContentType() throws Exception {
        MinioClient client = mock(MinioClient.class);
        when(client.bucketExists(any(BucketExistsArgs.class))).thenReturn(false);

        S3ReviewEvidenceStorage storage = new S3ReviewEvidenceStorage(client, "review-evidence");
        byte[] payload = "jpeg-bytes".getBytes(StandardCharsets.UTF_8);

        storage.store("2026/11/abc.jpg", payload, "image/jpeg");
        storage.store("2026/11/def.png", payload, "image/png");

        // Bucket existence & creation only happen ONCE across multiple stores
        verify(client, times(1)).bucketExists(any(BucketExistsArgs.class));
        verify(client, times(1)).makeBucket(any(MakeBucketArgs.class));
        verify(client, times(2)).putObject(any(PutObjectArgs.class));
    }

    @Test
    void loadReturnsBytesMapsNoSuchKeyTo404AndDeleteRemovesObject() throws Exception {
        MinioClient client = mock(MinioClient.class);
        byte[] expected = "sanitized-image".getBytes(StandardCharsets.UTF_8);
        GetObjectResponse okResponse = new GetObjectResponse(
                Headers.of(),
                "review-evidence",
                "us-east-1",
                "2026/11/ok.jpg",
                new ByteArrayInputStream(expected)
        );
        when(client.getObject(any(GetObjectArgs.class))).thenReturn(okResponse);

        S3ReviewEvidenceStorage storage = new S3ReviewEvidenceStorage(client, "review-evidence");
        Resource resource = storage.loadAsResource("2026/11/ok.jpg");
        assertThat(resource.getInputStream().readAllBytes()).isEqualTo(expected);

        // NoSuchKey -> 404 EVIDENCE_NOT_FOUND
        ErrorResponse errResp = mock(ErrorResponse.class);
        when(errResp.code()).thenReturn("NoSuchKey");
        ErrorResponseException notFound = mock(ErrorResponseException.class);
        when(notFound.errorResponse()).thenReturn(errResp);
        when(client.getObject(any(GetObjectArgs.class))).thenThrow(notFound);

        assertThatThrownBy(() -> storage.loadAsResource("2026/11/missing.jpg"))
                .isInstanceOf(AuthFailure.class)
                .satisfies(e -> {
                    AuthFailure f = (AuthFailure) e;
                    assertThat(f.status).isEqualTo(404);
                    assertThat(f.code).isEqualTo("EVIDENCE_NOT_FOUND");
                });

        storage.deleteQuietly("2026/11/ok.jpg");
        verify(client, times(1)).removeObject(any(RemoveObjectArgs.class));
    }

    @Test
    void rejectsPathTraversalKeys() {
        MinioClient client = mock(MinioClient.class);
        S3ReviewEvidenceStorage storage = new S3ReviewEvidenceStorage(client, "review-evidence");

        assertThatThrownBy(() -> storage.store("../secret.jpg", new byte[]{1}, "image/jpeg"))
                .isInstanceOf(AuthFailure.class)
                .extracting("code").isEqualTo("INVALID_MEDIA");
        assertThatThrownBy(() -> storage.loadAsResource("/abs/path.jpg"))
                .isInstanceOf(AuthFailure.class)
                .extracting("code").isEqualTo("INVALID_MEDIA");
    }
}
