package com.dormtrading.gov;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

class ReportServiceUnitTest {

    private final GovernanceErrors errors = new GovernanceErrors();

    @Test
    void validatesTargetTypeAndCategoryNormalization() {
        assertThat(ReportService.requireTargetType(" nguoi_dung ")).isEqualTo("NGUOI_DUNG");
        assertThat(ReportService.requireTargetType("tin_dang")).isEqualTo("TIN_DANG");
        assertThat(ReportService.normalizeOptionalTargetType("   ")).isNull();

        assertThatThrownBy(() -> ReportService.requireTargetType("ORDER"))
                .isInstanceOf(GovernanceFailure.class)
                .satisfies(err -> assertThat(((GovernanceFailure) err).code).isEqualTo("INVALID_TARGET_TYPE"));

        assertThat(ReportService.normalizeCategoryCode("  tin_dang_hang_cam ")).isEqualTo("TIN_DANG_HANG_CAM");
        assertThat(ReportService.normalizeCategoryCode("   ")).isNull();
    }

    @Test
    void enforcesDescriptionAndClientRequestIdLimits() {
        assertThat(ReportService.normalizeDescription(null)).isEmpty();
        assertThat(ReportService.normalizeDescription("  Hàng không đúng mô tả  ")).isEqualTo("Hàng không đúng mô tả");

        String tooLong = "a".repeat(ReportService.MAX_DESCRIPTION_LENGTH + 1);
        assertThatThrownBy(() -> ReportService.normalizeDescription(tooLong))
                .isInstanceOf(GovernanceFailure.class)
                .satisfies(err -> {
                    var failure = (GovernanceFailure) err;
                    assertThat(failure.status).isEqualTo(400);
                    assertThat(failure.code).isEqualTo("DESCRIPTION_TOO_LONG");
                });

        assertThat(ReportService.normalizeClientRequestId("  req-123  ")).isEqualTo("req-123");
        assertThat(ReportService.normalizeClientRequestId("   ")).isNull();
        assertThatThrownBy(() -> ReportService.normalizeClientRequestId("bad\nkey"))
                .isInstanceOf(GovernanceFailure.class);
        assertThatThrownBy(() -> ReportService.normalizeClientRequestId("x".repeat(101)))
                .isInstanceOf(GovernanceFailure.class);
    }

    @Test
    void deduplicatesIdsAndRejectsNullEntries() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        assertThat(ReportService.deduplicateIds(List.of(a, b, a))).containsExactly(a, b);
        assertThatThrownBy(() -> ReportService.deduplicateIds(Arrays.asList(a, null)))
                .isInstanceOf(GovernanceFailure.class);
    }

    @Test
    void localReportEvidenceStorageStoresLoadsDeletesAndBlocksPathTraversal(@TempDir Path tempDir) throws Exception {
        var storage = new LocalReportEvidenceStorage(tempDir.toString());
        byte[] payload = "evidence-bytes".getBytes(StandardCharsets.UTF_8);

        storage.store("2026/11/sample.jpg", payload);
        var resource = storage.loadAsResource("2026/11/sample.jpg");
        assertThat(resource.getContentAsByteArray()).isEqualTo(payload);

        storage.deleteQuietly("2026/11/sample.jpg");
        assertThatThrownBy(() -> storage.loadAsResource("2026/11/sample.jpg"))
                .isInstanceOf(GovernanceFailure.class)
                .satisfies(err -> assertThat(((GovernanceFailure) err).status).isEqualTo(404));

        for (String badKey : List.of("", "../escape.jpg", "/etc/passwd", "a\\b.jpg", "2026/../x.jpg", "bad\0key")) {
            assertThatThrownBy(() -> storage.resolveSafePath(badKey))
                    .isInstanceOf(GovernanceFailure.class)
                    .satisfies(err -> assertThat(((GovernanceFailure) err).code).isEqualTo("INVALID_MEDIA"));
        }
    }

    @Test
    void governanceErrorsMapsReportUniqueConstraintsAndMultipartLimits() {
        var dupReport = errors.duplicate(new DuplicateKeyException(
                "dup", new SQLException("duplicate key violates uq_bao_caos_active_reporter_target_category")));
        assertThat(dupReport.getStatusCode().value()).isEqualTo(409);
        assertThat(dupReport.getBody()).containsEntry("code", "DUPLICATE_REPORT");

        var dupClientReq = errors.duplicate(new DuplicateKeyException(
                "dup", new SQLException("duplicate key violates uq_bao_caos_reporter_client_req")));
        assertThat(dupClientReq.getStatusCode().value()).isEqualTo(409);
        assertThat(dupClientReq.getBody()).containsEntry("code", "CLIENT_REQUEST_ID_CONFLICT");

        var tooLarge = errors.multipart(new MaxUploadSizeExceededException(5_242_880));
        assertThat(tooLarge.getStatusCode().value()).isEqualTo(413);
        assertThat(tooLarge.getBody()).containsEntry("code", "FILE_TOO_LARGE");
    }
}
