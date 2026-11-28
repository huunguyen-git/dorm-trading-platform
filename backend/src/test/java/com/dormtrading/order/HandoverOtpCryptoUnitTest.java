package com.dormtrading.order;

import com.dormtrading.iam.auth.AuthFailure;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.Resource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("Kiểm thử đơn vị mật mã OTP & lưu trữ ảnh bàn giao (P3-02 NFR-01)")
class HandoverOtpCryptoUnitTest {

    private static final String TEST_SECRET = Base64.getEncoder()
            .encodeToString("0123456789abcdef0123456789abcdef".getBytes());

    @Test
    void hashesAndEncryptsOtpWithOrderAndOtpIdBindingAndRedactsToString() {
        HandoverOtpCrypto crypto = new HandoverOtpCrypto(new SecureRandom(), TEST_SECRET);
        UUID otpId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID otherOrderId = UUID.randomUUID();

        String code = crypto.generateCode();
        assertThat(code).matches("[0-9]{6}");

        String hash = crypto.hashCode(otpId, orderId, code);
        assertThat(hash).hasSize(64);
        assertThat(crypto.matches(otpId, orderId, code, hash)).isTrue();
        assertThat(crypto.matches(otpId, otherOrderId, code, hash)).isFalse();
        assertThat(crypto.matches(otpId, orderId, code.equals("000000") ? "000001" : "000000", hash)).isFalse();

        String ciphertext = crypto.encryptCode(otpId, orderId, code);
        assertThat(ciphertext).doesNotContain(code);
        assertThat(crypto.decryptCode(otpId, orderId, ciphertext)).isEqualTo(code);
        // AAD mismatch rejects tampering / cross-order replay
        assertThat(crypto.decryptCode(otpId, otherOrderId, ciphertext)).isNull();

        // DTO toString() must redact OTP secrets
        var otpDto = new TransactionDtos.HandoverOtpDto(
                otpId, "ACTIVE", Instant.now(), Instant.now().plusSeconds(600), 600, 600, 2, 0, 5, 5, code);
        assertThat(otpDto.toString()).doesNotContain(code).contains("[redacted]").contains("ttlSeconds=600").contains("reissueCount=2");
        var reqDto = new TransactionDtos.CompleteTransactionRequest(code, 1L);
        assertThat(reqDto.toString()).doesNotContain(code).contains("[redacted]");
    }

    @Test
    void localHandoverProofStorageEnforcesStrictKeyPatternAndStreamsCleanly(@TempDir Path tempDir) throws Exception {
        LocalHandoverProofStorage storage = new LocalHandoverProofStorage(tempDir.toString());

        assertThatThrownBy(() -> HandoverProofKeys.validate(null))
                .isInstanceOf(AuthFailure.class).extracting("code").isEqualTo("INVALID_MEDIA");
        assertThatThrownBy(() -> storage.resolveSafePath("../escape.jpg"))
                .isInstanceOf(AuthFailure.class).extracting("code").isEqualTo("INVALID_MEDIA");
        assertThatThrownBy(() -> storage.resolveSafePath("not-uuid/file.jpg"))
                .isInstanceOf(AuthFailure.class).extracting("code").isEqualTo("INVALID_MEDIA");
        assertThatThrownBy(() -> storage.resolveSafePath(UUID.randomUUID() + "/" + UUID.randomUUID() + ".svg"))
                .isInstanceOf(AuthFailure.class).extracting("code").isEqualTo("INVALID_MEDIA");

        String validKey = UUID.randomUUID() + "/" + UUID.randomUUID() + ".jpg";
        byte[] content = HandoverTestImages.sampleJpeg();
        storage.store(validKey, content, "image/jpeg");

        Resource res = storage.loadAsResource(validKey);
        assertThat(res.exists()).isTrue();
        assertThat(res.getContentAsByteArray()).isEqualTo(content);

        storage.deleteQuietly(validKey);
        assertThatThrownBy(() -> storage.loadAsResource(validKey))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(404, "PROOF_NOT_FOUND");
    }
}
