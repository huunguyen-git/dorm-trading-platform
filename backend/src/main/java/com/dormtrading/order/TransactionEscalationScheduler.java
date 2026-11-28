package com.dormtrading.order;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * FR-09 / UC-27 E7 background escalation worker: periodically transitions delivered transactions
 * ({@code CHO_XAC_NHAN}) unconfirmed for more than 24 hours into {@code CHO_XU_LY} ({@code OVERDUE_24H})
 * in bounded {@code FOR UPDATE SKIP LOCKED} batches without auto-completing or releasing goods.
 */
@Component
public class TransactionEscalationScheduler {

    private final TransactionHandoverService handoverService;
    private final boolean enabled;
    private final int batchSize;

    public TransactionEscalationScheduler(
            TransactionHandoverService handoverService,
            @Value("${app.order.escalation-enabled:true}") boolean enabled,
            @Value("${app.order.escalation-batch-size:100}") int batchSize
    ) {
        this.handoverService = handoverService;
        this.enabled = enabled;
        this.batchSize = batchSize > 0 ? batchSize : 100;
    }

    @Scheduled(fixedDelayString = "${app.order.escalation-delay-ms:60000}")
    public void escalateOverdueDeliveries() {
        if (!enabled) {
            return;
        }
        handoverService.reconcileOverdueDeliveries(batchSize);
    }
}
