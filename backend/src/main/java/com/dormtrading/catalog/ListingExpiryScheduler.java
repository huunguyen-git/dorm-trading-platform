package com.dormtrading.catalog;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduled background worker for FR-13 30-day listing expiry reconciliation in bounded batches,
 * keeping anonymous public discovery GET endpoints strictly read-only.
 */
@Component
@ConditionalOnProperty(
        name = "app.catalog.expiry-reconcile-enabled",
        havingValue = "true",
        matchIfMissing = true
)
public class ListingExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(ListingExpiryScheduler.class);
    private static final int MAX_BATCHES_PER_TICK = 10;

    private final ListingLifecycleHelper lifecycleHelper;

    public ListingExpiryScheduler(ListingLifecycleHelper lifecycleHelper) {
        this.lifecycleHelper = lifecycleHelper;
    }

    @Scheduled(fixedDelayString = "${app.catalog.expiry-reconcile-delay-ms:60000}")
    public void reconcileExpiredListingsBatch() {
        int totalExpired = 0;
        for (int i = 0; i < MAX_BATCHES_PER_TICK; i++) {
            int expired = lifecycleHelper.reconcileAllExpiredListings();
            totalExpired += expired;
            if (expired == 0) {
                break;
            }
        }
        if (totalExpired > 0) {
            log.info("FR-13 scheduled expiry reconciled {} overdue CONG_KHAI listing(s) to HET_HAN", totalExpired);
        }
    }
}
