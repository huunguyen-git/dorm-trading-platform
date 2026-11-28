package com.dormtrading.order.dispute;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;

/**
 * DTOs for P3-03 (UC-29: Xử lý giao dịch quá hạn / tranh chấp).
 * Field names are locked across backend, admin-web, and mobile.
 * Zero-PII (NFR-01): never expose email, studentId, phone, or student card fields.
 */
public final class DisputeDtos {

    private DisputeDtos() {
    }

    public record ResolveDisputeRequest(
            String basis,
            Long expectedVersion
    ) {
    }

    public record RequestEvidenceBody(
            String targetParty,
            String instruction,
            Integer dueInHours,
            Long expectedVersion
    ) {
    }

    public record DisputeListingSummaryDto(
            UUID id,
            String title,
            int listedPriceVnd,
            boolean isCombo,
            boolean isFree,
            String status,
            String thumbnailUrl
    ) {
    }

    /** Zero-PII party summary (NFR-01). */
    public record DisputePartySummaryDto(
            UUID id,
            String displayName,
            int reputationScore
    ) {
    }

    public record DecisionSummaryDto(
            String conclusion,
            String decidedByName,
            Instant decidedAt
    ) {
    }

    public record DisputeCountsDto(
            long all,
            long ready,
            long waitingEvidence,
            long resolved,
            long overdue24h,
            long cancelDispute
    ) {
    }

    public record DisputeSummaryDto(
            UUID orderId,
            long version,
            String status,
            String escalationReason,
            Instant escalatedAt,
            Instant responseDeadlineAt,
            boolean overdueSla,
            String queueState,
            DisputeListingSummaryDto listing,
            int agreedPriceVnd,
            DisputePartySummaryDto buyer,
            DisputePartySummaryDto seller,
            Instant reportedDeliveredAt,
            boolean hasActiveEvidenceRequest,
            DecisionSummaryDto decisionSummary
    ) {
    }

    public record DisputePageDto(
            List<DisputeSummaryDto> items,
            DisputeCountsDto counts,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {
    }

    public record DisputeItemDto(
            UUID id,
            String name,
            String condition,
            String status,
            boolean heldByThisOrder
    ) {
    }

    public record HandoverPhotoDto(
            UUID id,
            String url,
            String contentType,
            long sizeBytes,
            Instant uploadedAt
    ) {
    }

    public record DisputeScheduleProposalDto(
            UUID id,
            String proposedByName,
            Instant proposedTime,
            String proposedLocation,
            String note,
            String status,
            Instant respondedAt,
            String rejectReason,
            Instant createdAt
    ) {
    }

    public record DisputeCancelRequestDto(
            UUID id,
            UUID requesterId,
            String requesterRole,
            String requesterName,
            String reasonCode,
            String reasonNote,
            String status,
            String responderName,
            String responseNote,
            Instant respondedAt,
            Instant createdAt
    ) {
    }

    public record EvidenceAttachmentDto(
            UUID id,
            String url,
            String originalFilename,
            String contentType,
            long sizeBytes,
            Instant uploadedAt
    ) {
    }

    public record AdminEvidenceResponseDto(
            UUID id,
            UUID senderId,
            String senderRole,
            String senderName,
            String note,
            Instant createdAt,
            List<EvidenceAttachmentDto> attachments
    ) {
    }

    public record AdminEvidenceRequestDto(
            UUID id,
            String targetParty,
            String instruction,
            Instant dueAt,
            String status,
            String requestedByName,
            Instant createdAt,
            Instant respondedAt,
            List<AdminEvidenceResponseDto> responses
    ) {
    }

    public record DisputeChatMessageDto(
            UUID id,
            UUID senderId,
            String senderRole,
            String senderName,
            String content,
            Integer proposedPriceVnd,
            Instant sentAt
    ) {
    }

    public record DisputeTimelineEntryDto(
            UUID id,
            String action,
            String fromStatus,
            String toStatus,
            String actorRole,
            String note,
            Instant createdAt
    ) {
    }

    public record DisputeDecisionDto(
            UUID id,
            String conclusion,
            String basis,
            UUID decidedById,
            String decidedByName,
            Instant decidedAt,
            String listingStatusAfter,
            String listingHiddenReason
    ) {
    }

    public record DisputeDetailDto(
            UUID orderId,
            long version,
            String status,
            String escalationReason,
            Instant escalatedAt,
            Instant responseDeadlineAt,
            boolean overdueSla,
            String queueState,
            DisputeListingSummaryDto listing,
            int agreedPriceVnd,
            DisputePartySummaryDto buyer,
            DisputePartySummaryDto seller,
            Instant reportedDeliveredAt,
            boolean hasActiveEvidenceRequest,
            DecisionSummaryDto decisionSummary,
            List<DisputeItemDto> items,
            Instant meetingTime,
            String meetingLocation,
            Instant deliveryStartedAt,
            String deliveryNote,
            Instant completedAt,
            Instant cancelledAt,
            Instant reviewDeadlineAt,
            List<HandoverPhotoDto> handoverPhotos,
            List<DisputeScheduleProposalDto> scheduleProposals,
            List<DisputeCancelRequestDto> cancelRequests,
            List<AdminEvidenceRequestDto> evidenceRequests,
            List<DisputeChatMessageDto> chatMessages,
            List<DisputeTimelineEntryDto> timeline,
            DisputeDecisionDto decision,
            boolean decidable
    ) {
    }

    public record MemberEvidenceResponseDto(
            UUID id,
            String senderRole,
            String senderName,
            String note,
            Instant createdAt,
            List<EvidenceAttachmentDto> attachments
    ) {
    }

    public record MemberEvidenceRequestDto(
            UUID id,
            String targetParty,
            String instruction,
            Instant dueAt,
            String status,
            Instant createdAt,
            boolean canSubmitResponse,
            boolean hasViewerResponded,
            List<MemberEvidenceResponseDto> responses
    ) {
    }

    public record MemberDisputeDecisionDto(
            UUID id,
            String conclusion,
            String basis,
            Instant decidedAt,
            String listingStatusAfter,
            String listingHiddenReason
    ) {
    }

    public record MemberDisputeDto(
            UUID orderId,
            String status,
            long version,
            String viewerRole,
            String escalationReason,
            Instant escalatedAt,
            Instant responseDeadlineAt,
            Instant reviewDeadlineAt,
            MemberDisputeDecisionDto decision,
            List<MemberEvidenceRequestDto> evidenceRequests,
            List<DisputeTimelineEntryDto> timeline
    ) {
    }

    public record EvidenceBinaryContent(
            UUID id,
            String contentType,
            long sizeBytes,
            Resource resource
    ) {
    }
}
