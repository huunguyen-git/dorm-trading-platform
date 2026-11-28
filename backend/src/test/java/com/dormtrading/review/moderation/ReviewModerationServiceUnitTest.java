package com.dormtrading.review.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

class ReviewModerationServiceUnitTest {

    private final ReviewModerationErrors errors = new ReviewModerationErrors();

    @Test
    void computesExactFr10StarToReputationDeltaMapping() {
        assertThat(ReviewModerationService.reputationDeltaForStars(5)).isEqualTo(2);
        assertThat(ReviewModerationService.reputationDeltaForStars(4)).isEqualTo(0);
        assertThat(ReviewModerationService.reputationDeltaForStars(3)).isEqualTo(-1);
        assertThat(ReviewModerationService.reputationDeltaForStars(2)).isEqualTo(-3);
        assertThat(ReviewModerationService.reputationDeltaForStars(1)).isEqualTo(-5);

        assertThatThrownBy(() -> ReviewModerationService.reputationDeltaForStars(0))
                .isInstanceOf(ReviewModerationFailure.class);
        assertThatThrownBy(() -> ReviewModerationService.reputationDeltaForStars(6))
                .isInstanceOf(ReviewModerationFailure.class);
    }

    @Test
    void validatesQueueFiltersActionsAndTextLimits() {
        assertThat(ReviewModerationService.normalizeQueueType(null)).isEqualTo("ALL");
        assertThat(ReviewModerationService.normalizeQueueType(" complaint ")).isEqualTo("COMPLAINT");
        assertThat(ReviewModerationService.normalizeQueueStatus("processed")).isEqualTo("PROCESSED");
        assertThat(ReviewModerationService.normalizeAction(" uphold ", Set.of("UPHOLD", "DISMISS"))).isEqualTo("UPHOLD");
        assertThat(ReviewModerationService.normalizeTargetParty(null, "SELLER")).isEqualTo("SELLER");

        assertThatThrownBy(() -> ReviewModerationService.normalizeQueueType("UNKNOWN"))
                .isInstanceOf(ReviewModerationFailure.class);
        assertThatThrownBy(() -> ReviewModerationService.normalizeAction("DELETE", Set.of("UPHOLD", "DISMISS")))
                .isInstanceOf(ReviewModerationFailure.class)
                .satisfies(e -> assertThat(((ReviewModerationFailure) e).code).isEqualTo("INVALID_ACTION"));
        assertThatThrownBy(() -> ReviewModerationService.normalizeText("a".repeat(2001), 2000, "TOO_LONG", "Quá dài"))
                .isInstanceOf(ReviewModerationFailure.class)
                .satisfies(e -> assertThat(((ReviewModerationFailure) e).code).isEqualTo("TOO_LONG"));
    }

    @Test
    void localReviewEvidenceStorageBlocksPathTraversal(@TempDir Path tempDir) throws Exception {
        var storage = new LocalReviewEvidenceStorage(tempDir.toString());
        byte[] content = "review-proof".getBytes(StandardCharsets.UTF_8);

        storage.store("2026/11/proof.png", content);
        assertThat(storage.loadAsResource("2026/11/proof.png").getContentAsByteArray()).isEqualTo(content);
        storage.deleteQuietly("2026/11/proof.png");
        assertThatThrownBy(() -> storage.loadAsResource("2026/11/proof.png"))
                .isInstanceOf(ReviewModerationFailure.class)
                .satisfies(e -> assertThat(((ReviewModerationFailure) e).status).isEqualTo(404));

        for (String bad : List.of("", "../secret", "/etc/passwd", "2026/../a.jpg", "a\\b.png")) {
            assertThatThrownBy(() -> storage.resolveSafePath(bad))
                    .isInstanceOf(ReviewModerationFailure.class)
                    .satisfies(e -> assertThat(((ReviewModerationFailure) e).code).isEqualTo("INVALID_MEDIA"));
        }
    }

    @Test
    void errorHandlerMapsUniqueConstraintsAndUploadLimits() {
        var dupComplaint = errors.duplicate(new DuplicateKeyException(
                "dup", new SQLException("duplicate key violates uq_khieu_nais_ma_danh_gia")));
        assertThat(dupComplaint.getStatusCode().value()).isEqualTo(409);
        assertThat(dupComplaint.getBody()).containsEntry("code", "COMPLAINT_ALREADY_EXISTS");

        var dupReq = errors.duplicate(new DuplicateKeyException(
                "dup", new SQLException("duplicate key violates uq_khieu_nais_seller_client_req")));
        assertThat(dupReq.getStatusCode().value()).isEqualTo(409);
        assertThat(dupReq.getBody()).containsEntry("code", "CLIENT_REQUEST_ID_CONFLICT");

        var large = errors.multipart(new MaxUploadSizeExceededException(5_242_880));
        assertThat(large.getStatusCode().value()).isEqualTo(413);
        assertThat(large.getBody()).containsEntry("code", "FILE_TOO_LARGE");
    }
}
