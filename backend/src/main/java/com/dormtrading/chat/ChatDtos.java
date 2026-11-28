package com.dormtrading.chat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ChatDtos {

    private ChatDtos() {}

    public static final String RESERVATION_NOTICE =
            "Đã ghi nhận mức giá thỏa thuận. Lưu ý: Đồng ý giá chưa phải là giữ chỗ hàng, bạn cần gửi yêu cầu giữ chỗ để chính thức giữ đồ.";

    public record OpenConversationRequest(UUID listingId) {}

    public record SendMessageRequest(String content, String clientMessageId) {}

    public record CreateOfferRequest(Object offeredPrice, String note, String clientMessageId) {}

    public record RespondOfferRequest(String action, Object counterPrice, String note, String clientMessageId) {}

    public record ParticipantDto(UUID id, String name) {}

    public record ListingSummaryDto(
            UUID id,
            String title,
            String description,
            int price,
            String seller,
            UUID sellerId,
            String listingType,
            String status) {}

    public record ChatMessageDto(
            UUID id,
            UUID conversationId,
            long sequenceNumber,
            Long conversationVersion,
            UUID senderId,
            String senderName,
            String type,
            String messageType,
            String content,
            Integer offeredPrice,
            String offerStatus,
            String responseAction,
            String responseNote,
            UUID respondedById,
            UUID parentOfferId,
            String clientMessageId,
            boolean canRespond,
            Instant createdAt,
            Instant updatedAt,
            Instant respondedAt) {}

    public record ConversationSummaryDto(
            UUID id,
            ListingSummaryDto listing,
            UUID listingId,
            String listingTitle,
            Integer listingPrice,
            String listingType,
            String listingStatus,
            ParticipantDto buyer,
            UUID buyerId,
            String buyerName,
            ParticipantDto seller,
            UUID sellerId,
            String sellerName,
            UUID counterpartyId,
            String counterpartyName,
            String counterpartyStatus,
            boolean counterpartyRestricted,
            Integer agreedPrice,
            UUID pendingOfferId,
            Integer pendingOfferPrice,
            UUID pendingOfferSenderId,
            ChatMessageDto lastMessage,
            boolean canSendMessage,
            boolean canMakeOffer,
            String restrictionReason,
            long version,
            Instant createdAt,
            Instant updatedAt) {}

    public record ConversationDetailDto(
            UUID id,
            UUID currentUserId,
            ListingSummaryDto listing,
            UUID listingId,
            String listingTitle,
            Integer listingPrice,
            String listingType,
            String listingStatus,
            ParticipantDto buyer,
            UUID buyerId,
            String buyerName,
            ParticipantDto seller,
            UUID sellerId,
            String sellerName,
            UUID counterpartyId,
            String counterpartyName,
            String counterpartyStatus,
            boolean counterpartyRestricted,
            Integer agreedPrice,
            UUID agreedOfferId,
            UUID pendingOfferId,
            Integer pendingOfferPrice,
            UUID pendingOfferSenderId,
            String reservationNotice,
            boolean canSendMessage,
            boolean canMakeOffer,
            String restrictionReason,
            List<ChatMessageDto> messages,
            long version,
            Instant createdAt,
            Instant updatedAt) {}
}
