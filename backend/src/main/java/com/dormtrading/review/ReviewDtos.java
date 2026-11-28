package com.dormtrading.review;

import com.dormtrading.catalog.ListingDtos;
import com.dormtrading.order.OrderDtos;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.io.Resource;

public final class ReviewDtos {

    private ReviewDtos() {
    }

    public enum ReviewStatus {
        CHO_XET,
        CHAP_NHAN,
        BI_BAC,
        DA_GO,
        DA_XOA
    }

    public enum ReviewLockReason {
        ORDER_NOT_COMPLETED,
        NOT_BUYER,
        REVIEW_WINDOW_EXPIRED,
        NO_REVIEW_BONUS_APPLIED,
        REVIEW_MODERATED,
        REVIEW_COMPLAINT_PENDING,
        REVIEW_COMPLAINT_RESOLVED
    }

    public record CreateReviewRequest(
            Integer rating,
            String comment,
            List<UUID> evidenceIds,
            String idempotencyKey
    ) {
    }

    public record UpdateReviewRequest(
            Integer rating,
            String comment,
            List<UUID> evidenceIds,
            Long expectedVersion
    ) {
    }

    public record EvidenceItemDto(
            UUID id,
            String url,
            String contentType,
            long sizeBytes,
            String originalFilename,
            Instant createdAt
    ) {
    }

    public record EvidenceUploadResponse(
            List<EvidenceItemDto> items
    ) {
    }

    public record EvidenceContent(
            UUID id,
            String contentType,
            long sizeBytes,
            Resource resource
    ) {
    }

    public record ReviewVersionDto(
            int versionNo,
            int rating,
            String comment,
            String status,
            int scoreDeltaApplied,
            int evidenceCount,
            List<UUID> evidenceIds,
            Instant reversedAt,
            Instant createdAt
    ) {
    }

    public record ReviewDetailDto(
            UUID id,
            UUID orderId,
            UUID listingId,
            String listingTitle,
            UUID buyerId,
            String buyerDisplayName,
            UUID sellerId,
            String sellerDisplayName,
            int rating,
            String comment,
            String status,
            boolean publiclyVisible,
            int currentVersionNo,
            int appliedScoreDelta,
            boolean moderated,
            Instant moderatedAt,
            String complaintStatus,
            Instant queueEnteredAt,
            Instant publishedAt,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt,
            long version,
            List<EvidenceItemDto> evidence,
            List<ReviewVersionDto> versions
    ) {
    }

    public record OrderReviewStateDto(
            UUID orderId,
            UUID listingId,
            String listingTitle,
            String orderStatus,
            OrderDtos.PartySummaryDto seller,
            OrderDtos.PartySummaryDto buyer,
            Instant completedAt,
            Instant reviewDeadlineAt,
            int daysRemaining,
            boolean withinReviewWindow,
            boolean noReviewBonusApplied,
            Instant noReviewBonusAppliedAt,
            boolean canReview,
            boolean canEdit,
            boolean canDelete,
            String lockReason,
            String lockMessage,
            boolean hasPendingModerationReview,
            ReviewDetailDto review
    ) {
    }

    public record ReviewMutationResponse(
            ReviewDetailDto review,
            OrderReviewStateDto orderReviewState,
            boolean idempotentReplay
    ) {
    }

    /**
     * Public seller review item complying with NFR-01:
     * only CHAP_NHAN reviews, zero PII, zero private evidence IDs or URLs.
     */
    public record PublicSellerReviewItemDto(
            UUID id,
            UUID orderId,
            UUID listingId,
            String listingTitle,
            String buyerDisplayName,
            int rating,
            String comment,
            boolean edited,
            Instant publishedAt,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record SellerReviewsResponse(
            ListingDtos.SellerPublicSummaryDto seller,
            Map<Integer, Long> starDistribution,
            List<PublicSellerReviewItemDto> items,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {
    }
}
