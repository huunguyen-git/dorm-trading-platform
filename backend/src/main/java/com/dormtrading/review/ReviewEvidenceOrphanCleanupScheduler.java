package com.dormtrading.review;

import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodically cleans up expired unattached draft review evidence ({@code ma_danh_gia IS NULL})
 * from both DB and storage (plus orphaned local files) so abandoned drafts do not leak user quota.
 */
@Component
@ConditionalOnProperty(
        name = "app.review.evidence-orphan-cleanup-enabled",
        havingValue = "true",
        matchIfMissing = true
)
public class ReviewEvidenceOrphanCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReviewEvidenceOrphanCleanupScheduler.class);

    private final ReviewEvidenceService evidenceService;
    private final Duration draftTtl;

    public ReviewEvidenceOrphanCleanupScheduler(
            ReviewEvidenceService evidenceService,
            @Value("${app.review.evidence-draft-ttl-minutes:120}") long draftTtlMinutes
    ) {
        this.evidenceService = evidenceService;
        this.draftTtl = Duration.ofMinutes(Math.max(1L, draftTtlMinutes));
    }

    @Scheduled(fixedDelayString = "${app.review.evidence-orphan-cleanup-delay-ms:3600000}")
    public void cleanupExpiredDraftEvidence() {
        int removed = evidenceService.cleanupExpiredDraftEvidence(draftTtl, 200);
        if (removed > 0) {
            log.info("Removed {} expired draft/orphaned review evidence file(s)", removed);
        }
    }
}
