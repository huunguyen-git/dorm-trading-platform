package com.dormtrading.order.dispute;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduled background worker for P3-03 (UC-29 / FR-09):
 * <ol>
 *   <li>Escalates {@code CHO_XAC_NHAN} orders overdue past 24 hours since {@code thoi_diem_bao_giao}
 *       into {@code CHO_XU_LY} with 3-business-day moderator response SLA.</li>
 *   <li>Expires overdue supplementary evidence requests ({@code CHO_BO_SUNG} past {@code han_bo_sung})
 *       into {@code QUA_HAN} so disputes return to the READY moderation queue.</li>
 * </ol>
 */
@Component
@ConditionalOnProperty(
        name = "app.dispute.scheduler.enabled",
        havingValue = "true",
        matchIfMissing = true
)
public class DisputeEscalationScheduler {

    private static final Logger log = LoggerFactory.getLogger(DisputeEscalationScheduler.class);
    private static final int MAX_BATCHES_PER_TICK = 10;

    private final DisputeService disputeService;
    private final int batchSize;

    public DisputeEscalationScheduler(
            DisputeService disputeService,
            @Value("${app.dispute.scheduler.batch-size:50}") int batchSize
    ) {
        this.disputeService = disputeService;
        this.batchSize = Math.clamp(batchSize, 1, 500);
    }

    @Scheduled(
            fixedDelayString = "${app.dispute.scheduler.fixed-delay-ms:60000}",
            initialDelayString = "${app.dispute.scheduler.initial-delay-ms:60000}"
    )
    public void runScheduledMaintenance() {
        int escalated = escalateOverdueTransactions();
        int expired = expireOverdueEvidenceRequests();
        if (escalated > 0 || expired > 0) {
            log.info("UC-29 scheduler escalated {} overdue order(s) and expired {} evidence request(s)", escalated, expired);
        }
    }

    public int escalateOverdueTransactions() {
        int total = 0;
        for (int i = 0; i < MAX_BATCHES_PER_TICK; i++) {
            int count = disputeService.escalateOverdueTransactionsBatch(batchSize);
            total += count;
            if (count < batchSize) {
                break;
            }
        }
        return total;
    }

    public int expireOverdueEvidenceRequests() {
        int total = 0;
        for (int i = 0; i < MAX_BATCHES_PER_TICK; i++) {
            int count = disputeService.expireOverdueEvidenceRequestsBatch(batchSize);
            total += count;
            if (count < batchSize) {
                break;
            }
        }
        return total;
    }
}
