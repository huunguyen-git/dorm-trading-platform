package com.dormtrading.review;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduled background worker for FR-10 15-day no-review +1 seller reputation bonus.
 */
@Component
@ConditionalOnProperty(
        name = "app.review.no-review-bonus-enabled",
        havingValue = "true",
        matchIfMissing = true
)
public class NoReviewBonusScheduler {

    private static final Logger log = LoggerFactory.getLogger(NoReviewBonusScheduler.class);
    private static final int MAX_BATCHES_PER_TICK = 10;

    private final ReviewBonusService bonusService;

    public NoReviewBonusScheduler(ReviewBonusService bonusService) {
        this.bonusService = bonusService;
    }

    @Scheduled(fixedDelayString = "${app.review.no-review-bonus-delay-ms:60000}")
    public void processNoReviewBonuses() {
        int totalAwarded = 0;
        for (int i = 0; i < MAX_BATCHES_PER_TICK; i++) {
            int awarded = bonusService.processDueNoReviewBonuses();
            totalAwarded += awarded;
            if (awarded == 0) {
                break;
            }
        }
        if (totalAwarded > 0) {
            log.info("FR-10 scheduled no-review bonus credited +1 to {} completed order(s)", totalAwarded);
        }
    }
}
