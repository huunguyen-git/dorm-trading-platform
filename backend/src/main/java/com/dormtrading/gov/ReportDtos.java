package com.dormtrading.gov;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;

public final class ReportDtos {

    private ReportDtos() {
    }

    public record ReportCategoryDto(
            String code,
            String targetType,
            String name,
            String description,
            int displayOrder
    ) {}

    public record ReportCategoryListResponse(List<ReportCategoryDto> items) {}

    public record UploadedEvidenceDto(
            UUID id,
            String originalFilename,
            String contentType,
            long sizeBytes
    ) {}

    public record EvidenceUploadResponse(List<UploadedEvidenceDto> items) {}

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

    public record CreateReportRequest(
            String targetType,
            UUID targetId,
            String categoryCode,
            String description,
            List<UUID> evidenceIds,
            UUID chatConversationId,
            List<UUID> chatMessageIds,
            Boolean attachChatLog,
            String clientRequestId
    ) {}

    public record ReportSubmissionResponse(
            UUID id,
            UUID groupId,
            int groupReportCount,
            String targetType,
            UUID targetId,
            String targetSummary,
            String categoryCode,
            String categoryName,
            String description,
            String status,
            int imageEvidenceCount,
            boolean hasChatLog,
            Instant createdAt,
            boolean idempotentReplay
    ) {}

    public record MyReportSummaryDto(
            UUID id,
            UUID groupId,
            String targetType,
            UUID targetId,
            String targetSummary,
            String categoryCode,
            String categoryName,
            String description,
            String status,
            int imageEvidenceCount,
            boolean hasChatLog,
            Instant createdAt
    ) {}

    public record AdminEvidenceMetadataDto(
            UUID id,
            String type,
            String originalFilename,
            String contentType,
            Long sizeBytes,
            UUID conversationId,
            Instant createdAt
    ) {}

    public record AdminReportEntryDto(
            UUID id,
            UUID reporterId,
            String reporterName,
            String description,
            String status,
            Instant createdAt,
            List<AdminEvidenceMetadataDto> evidences
    ) {}

    public record AdminReportGroupDto(
            UUID groupId,
            String targetType,
            UUID targetId,
            String targetSummary,
            String categoryCode,
            String categoryName,
            String status,
            int reportCount,
            Instant createdAt,
            Instant latestSubmittedAt,
            UUID assigneeId,
            List<AdminReportEntryDto> reports
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
