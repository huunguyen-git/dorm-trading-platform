package com.dormtrading.catalog.listing;

import java.time.Instant;
import java.util.UUID;

/**
 * Domain event emitted when a seller saves updates to a listing that has pending buyer requests
 * (UC-17 Alt 2 / ADR section 2 hook for P2-04 buyer notifications).
 */
public record ListingUpdatedWithPendingRequestsEvent(
        UUID listingId,
        UUID sellerId,
        int pendingRequestCount,
        Instant occurredAt
) {
}
