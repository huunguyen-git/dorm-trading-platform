package com.dormtrading.order;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

public final class OrderDtos {

    private OrderDtos() {
    }

    public enum OrderStatus {
        YEU_CAU,
        GIU_CHO,
        DANG_GIAO,
        CHO_XAC_NHAN,
        CHO_XU_LY,
        HOAN_TAT,
        HUY;

        public static Optional<OrderStatus> fromString(String raw) {
            if (raw == null || raw.isBlank()) {
                return Optional.empty();
            }
            String normalized = raw.strip().toUpperCase(Locale.ROOT);
            for (OrderStatus status : values()) {
                if (status.name().equals(normalized)) {
                    return Optional.of(status);
                }
            }
            return Optional.empty();
        }
    }

    public enum ScheduleProposalStatus {
        CHO_XAC_NHAN,
        DA_XAC_NHAN,
        TU_CHOI,
        DA_THAY_THE
    }

    public enum NotificationType {
        RESERVATION_REQUESTED,
        RESERVATION_ACCEPTED,
        RESERVATION_REJECTED,
        RESERVATION_CANCELLED,
        LISTING_UPDATED_WITH_PENDING_REQUEST,
        SCHEDULE_PROPOSED,
        SCHEDULE_CONFIRMED,
        SCHEDULE_REJECTED,
        DELIVERY_STARTED
    }

    public record CreateOrderRequest(
            UUID listingId,
            Integer agreedPriceVnd,
            Instant proposedMeetingTime,
            String proposedMeetingLocation,
            String note
    ) {
    }

    public record AcceptOrderRequest(
            Long expectedVersion,
            Integer agreedPriceVnd
    ) {
    }

    public record RejectOrderRequest(
            String reason,
            Long expectedVersion
    ) {
    }

    public record CancelOrderRequest(
            String reason,
            Long expectedVersion
    ) {
    }

    public record ProposeScheduleRequest(
            Instant proposedTime,
            String proposedLocation,
            String note,
            Long expectedVersion
    ) {
    }

    public record RejectScheduleRequest(
            String reason
    ) {
    }

    public record StartDeliveryRequest(
            Long expectedVersion
    ) {
    }

    /** Public counterparty info only (NFR-01 Zero-PII: no email, studentId, phone, or card images). */
    public record PartySummaryDto(
            UUID id,
            String displayName,
            int reputationScore
    ) {
    }

    public record OrderListingSummaryDto(
            UUID id,
            String title,
            int listedPriceVnd,
            String listingType,
            boolean isCombo,
            boolean isFree,
            String status,
            String thumbnailUrl,
            String locationName
    ) {
    }

    public record OrderItemDto(
            UUID id,
            String name,
            String condition,
            String status,
            List<String> images,
            boolean heldByThisOrder
    ) {
    }

    public record ScheduleProposalDto(
            UUID id,
            UUID orderId,
            UUID proposedById,
            String proposedByName,
            Instant proposedTime,
            String proposedLocation,
            String note,
            String status,
            UUID respondedById,
            Instant respondedAt,
            String rejectReason,
            Instant createdAt,
            boolean canConfirm,
            boolean canReject
    ) {
    }

    public record OrderViewerFlagsDto(
            boolean isBuyer,
            boolean isSeller,
            boolean canAccept,
            boolean canReject,
            boolean canCancel,
            boolean canProposeSchedule,
            boolean canStartDelivery,
            boolean requiresPostDeliveryCancel
    ) {
    }

    public record OrderSummaryDto(
            UUID id,
            OrderListingSummaryDto listing,
            PartySummaryDto seller,
            PartySummaryDto buyer,
            int agreedPriceVnd,
            String status,
            boolean scheduleConfirmed,
            Instant meetingTime,
            String meetingLocation,
            Instant proposedMeetingTime,
            String proposedMeetingLocation,
            boolean hasPendingScheduleProposal,
            int itemCount,
            Instant createdAt,
            Instant reservedAt,
            Instant deliveryStartedAt,
            Instant reportedDeliveredAt,
            Instant cancelledAt,
            long version
    ) {
    }

    public record OrderDetailDto(
            UUID id,
            OrderListingSummaryDto listing,
            PartySummaryDto seller,
            PartySummaryDto buyer,
            int agreedPriceVnd,
            String status,
            String note,
            boolean scheduleConfirmed,
            Instant meetingTime,
            String meetingLocation,
            Instant proposedMeetingTime,
            String proposedMeetingLocation,
            List<OrderItemDto> items,
            ScheduleProposalDto pendingScheduleProposal,
            List<ScheduleProposalDto> scheduleProposals,
            UUID cancelledById,
            String cancelReason,
            Instant createdAt,
            Instant reservedAt,
            Instant deliveryStartedAt,
            Instant reportedDeliveredAt,
            Instant completedAt,
            Instant cancelledAt,
            Instant updatedAt,
            long version,
            OrderViewerFlagsDto viewer
    ) {
    }

    public record OrderPageDto(
            List<OrderSummaryDto> items,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {
    }

    public record NotificationDto(
            UUID id,
            String type,
            String title,
            String message,
            UUID listingId,
            UUID orderId,
            boolean read,
            Instant createdAt
    ) {
    }

    public record NotificationsPageDto(
            List<NotificationDto> items,
            long unreadCount,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {
    }
}
