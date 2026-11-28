package com.dormtrading.review.moderation;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;

public final class ReviewModerationDtos {

    private ReviewModerationDtos() {
    }

    public record Page<T>(List<T> items, int page, int size, long total) {}

    public record ComplaintReasonDto(String code, String label, String description) {}

    public record ComplaintReasonListResponse(List<ComplaintReasonDto> items) {}

    public record UploadedReviewEvidenceDto(
            UUID id,
            String originalFilename,
            String contentType,
            long sizeBytes
    ) {}

    public record EvidenceUploadResponse(List<UploadedReviewEvidenceDto> items) {}

    public record ChatMessageOptionDto(
            UUID id,
            UUID senderId,
            String senderName,
            String content,
            Integer offeredPrice,
            Instant sentAt
    ) {}

    public record ChatConversationOptionDto(
            UUID conversationId,
            UUID listingId,
            String listingTitle,
            UUID counterpartyId,
            String counterpartyName,
            List<ChatMessageOptionDto> messages
    ) {}

    public record ChatEvidenceOptionsResponse(List<ChatConversationOptionDto> conversations) {}

    public record CreateComplaintRequest(
            UUID reviewId,
            Long expectedReviewVersion,
            String reasonCode,
            String description,
            List<UUID> evidenceIds,
            UUID chatConversationId,
            List<UUID> chatMessageIds,
            Boolean attachChatLog,
            String clientRequestId
    ) {}

    public record ComplaintSummaryDto(
            UUID id,
            UUID reviewId,
            long reviewVersion,
            String reasonCode,
            String reasonLabel,
            String description,
            String status,
            String conclusion,
            String moderationRationale,
            int imageEvidenceCount,
            boolean hasChatLog,
            String supplementalStatus,
            Instant createdAt,
            Instant resolvedAt,
            Instant withdrawnAt,
            boolean idempotentReplay
    ) {}

    public record SupplementalRequestDto(
            UUID id,
            String caseType,
            UUID caseId,
            UUID recipientId,
            String recipientRole,
            String requestNote,
            String responseNote,
            String status,
            Instant createdAt,
            Instant respondedAt
    ) {}

    public record RespondSupplementalRequest(
            String responseNote,
            List<UUID> evidenceIds
    ) {}

    public record SellerReceivedReviewDto(
            UUID reviewId,
            UUID transactionId,
            UUID listingId,
            String listingTitle,
            UUID buyerId,
            String buyerName,
            int stars,
            String comment,
            String status,
            long version,
            boolean editLocked,
            Integer appliedScoreDelta,
            Instant createdAt,
            Instant publishedAt,
            Instant complaintDeadline,
            int daysRemainingToComplain,
            boolean canComplain,
            ComplaintSummaryDto complaint,
            List<SupplementalRequestDto> pendingSupplementalRequests
    ) {}

    public record SellerReceivedReviewsResponse(List<SellerReceivedReviewDto> items) {}

    public record ReviewNotificationDto(
            UUID id,
            String type,
            UUID reviewId,
            UUID complaintId,
            String title,
            String body,
            boolean read,
            Instant createdAt
    ) {}

    public record ReviewNotificationsResponse(List<ReviewNotificationDto> items) {}

    // ---- Admin / Moderator DTOs (UC-34) ----

    public record ModerationQueueItemDto(
            String caseType, // COMPLAINT | LOW_STAR_REVIEW
            UUID caseId,
            UUID reviewId,
            UUID transactionId,
            String listingTitle,
            UUID buyerId,
            String buyerName,
            UUID sellerId,
            String sellerName,
            int stars,
            String reviewStatus,
            String complaintStatus,
            String reasonLabel,
            String supplementalStatus,
            Instant submittedAt,
            Instant resolvedAt,
            String conclusion,
            boolean priorReviewerWarning
    ) {}

    public record AdminEvidenceItemDto(
            UUID id,
            String source, // KHIEU_NAI_NGUOI_BAN | DANH_GIA_NGUOI_MUA | BO_SUNG
            String type,   // HINH_ANH | NHAT_KY_CHAT
            String originalFilename,
            String contentType,
            Long sizeBytes,
            UUID conversationId,
            Instant createdAt
    ) {}

    public record ModerationDecisionHistoryDto(
            UUID id,
            UUID moderatorId,
            String moderatorName,
            String conclusion,
            String rationale,
            Integer scoreDelta,
            Instant decidedAt
    ) {}

    public record ModerationCaseDetailDto(
            String caseType,
            UUID caseId,
            UUID reviewId,
            long reviewVersion,
            String reviewStatus,
            int stars,
            String reviewComment,
            String reviewSnapshotJson,
            Integer appliedScoreDelta,
            Instant reviewCreatedAt,
            Instant reviewPublishedAt,
            UUID transactionId,
            UUID listingId,
            String listingTitle,
            int agreedPriceVnd,
            String handoverProofRef,
            Instant transactionCompletedAt,
            UUID buyerId,
            String buyerName,
            UUID sellerId,
            String sellerName,
            int sellerReputationScore,
            String sellerAccountStatus,
            String complaintStatus,
            String complaintReasonCode,
            String complaintReasonLabel,
            String complaintDescription,
            Instant complaintCreatedAt,
            String complaintConclusion,
            String complaintRationale,
            Long complaintVersion,
            String supplementalStatus,
            boolean canCurrentModeratorDecide,
            String cannotDecideReason,
            boolean singleModeratorOverride,
            List<AdminEvidenceItemDto> evidences,
            List<SupplementalRequestDto> supplementalRequests,
            List<ModerationDecisionHistoryDto> decisions
    ) {}

    public record DecideReviewRequest(
            String action, // APPROVE | REJECT | REQUEST_MORE_INFO
            String rationale,
            String targetParty, // BUYER | SELLER (for REQUEST_MORE_INFO)
            Long expectedVersion
    ) {}

    public record DecideComplaintRequest(
            String action, // UPHOLD | DISMISS | REQUEST_MORE_INFO
            String rationale,
            String targetParty, // BUYER | SELLER (for REQUEST_MORE_INFO)
            Long expectedVersion
    ) {}

    public record ModerationDecisionResponse(
            String caseType,
            UUID caseId,
            UUID reviewId,
            String action,
            String newReviewStatus,
            String newComplaintStatus,
            Integer scoreDelta,
            Integer sellerScoreAfter,
            String restrictionChange,
            boolean singleModeratorOverride,
            Instant decidedAt
    ) {}

    public record EvidenceDownloadResult(
            UUID id,
            String evidenceType,
            String contentType,
            long sizeBytes,
            Resource imageResource,
            String chatLogJson
    ) {}
}
