package com.dormtrading.review.reputation;

import java.time.Instant;
import java.util.UUID;

public record ReputationLedgerEntry(
        UUID id,
        UUID userId,
        String changeType,
        int delta,
        int scoreBefore,
        int scoreAfter,
        String reason,
        String referenceSource,
        String referenceId,
        String idempotencyKey,
        UUID actorId,
        Instant createdAt,
        boolean idempotentReplay,
        String triggeredLockType,
        Instant lockedUntil
) {
}
