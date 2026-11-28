package com.dormtrading.order;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.io.Resource;

/**
 * Request/response DTOs and domain enums for P3-02 Transaction Handover, 6-Digit OTP Completion,
 * and Post-Delivery Mutual Cancellation (UC-27, UC-28).
 */
public final class TransactionDtos {

    private TransactionDtos() {
    }

    public enum TransactionStatus {
        YEU_CAU,
        GIU_CHO,
        DANG_GIAO,
        CHO_XAC_NHAN,
        CHO_XU_LY,
        HOAN_TAT,
        HUY;

        public static Optional<TransactionStatus> fromString(String raw) {
            if (raw == null || raw.isBlank()) {
                return Optional.empty();
            }
            String normalized = raw.strip().toUpperCase(Locale.ROOT);
            for (TransactionStatus status : values()) {
                if (status.name().equals(normalized)) {
                    return Optional.of(status);
                }
            }
            return Optional.empty();
        }
    }

    public enum CancelReasonCode {
        ITEM_NOT_AS_DESCRIBED("Sản phẩm không đúng mô tả"),
        DEFECT_AT_HANDOVER("Phát sinh lỗi khi kiểm tra trực tiếp"),
        COMBO_MISSING_ITEM("Thiếu món trong bộ combo"),
        MUTUAL_AGREEMENT("Hai bên thống nhất hủy"),
        OTHER("Lý do khác");

        private final String label;

        CancelReasonCode(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }

        public static Optional<CancelReasonCode> fromString(String raw) {
            if (raw == null || raw.isBlank()) {
                return Optional.empty();
            }
            String normalized = raw.strip().toUpperCase(Locale.ROOT);
            for (CancelReasonCode code : values()) {
                if (code.name().equals(normalized)) {
                    return Optional.of(code);
                }
            }
            return Optional.empty();
        }
    }

    public enum CancelDecision {
        AGREE,
        REJECT;

        public static Optional<CancelDecision> fromString(String raw) {
            if (raw == null || raw.isBlank()) {
                return Optional.empty();
            }
            String normalized = raw.strip().toUpperCase(Locale.ROOT);
            for (CancelDecision d : values()) {
                if (d.name().equals(normalized)) {
                    return Optional.of(d);
                }
            }
            return Optional.empty();
        }
    }

    public record CompleteTransactionRequest(
            String otp,
            Long version
    ) {
        @Override
        public String toString() {
            return "CompleteTransactionRequest[otp=[redacted], version=" + version + "]";
        }
    }

    public record ReissueOtpRequest(
            Long version
    ) {
    }

    public record CreateCancelRequest(
            String reasonCode,
            String reasonNote,
            Long version
    ) {
    }

    public record RespondCancelRequest(
            String decision,
            String responseNote,
            Long version
    ) {
    }

    /** Zero-PII counterparty summary (NFR-01). */
    public record CounterpartySummaryDto(
            UUID id,
            String displayName,
            int reputationScore
    ) {
    }

    public record TransactionListingDto(
            UUID id,
            String title,
            String thumbnailUrl,
            boolean isCombo,
            boolean isFree,
            String status
    ) {
    }

    public record TransactionItemDto(
            UUID id,
            String name,
            String condition,
            String status,
            String thumbnailUrl
    ) {
    }

    public record HandoverPhotoItemDto(
            UUID id,
            String url,
            String contentType,
            long sizeBytes,
            Instant uploadedAt
    ) {
    }

    public record HandoverProofDto(
            UUID photoId,
            String photoUrl,
            List<HandoverPhotoItemDto> photos,
            Instant uploadedAt,
            String note,
            String contentType
    ) {
    }

    public enum AdminViewerRole {
        NONE,
        MODERATOR,
        SENIOR_ADMIN;

        public boolean isPrivileged() {
            return this != NONE;
        }
    }

    public record HandoverOtpDto(
            UUID id,
            String status,
            Instant issuedAt,
            Instant expiresAt,
            long remainingSeconds,
            int ttlSeconds,
            int reissueCount,
            int attemptsUsed,
            int maxAttempts,
            int remainingAttempts,
            String inAppCode
    ) {
        public HandoverOtpDto(
                UUID id,
                String status,
                Instant issuedAt,
                Instant expiresAt,
                long remainingSeconds,
                int attemptsUsed,
                int maxAttempts,
                int remainingAttempts,
                String inAppCode
        ) {
            this(
                    id,
                    status,
                    issuedAt,
                    expiresAt,
                    remainingSeconds,
                    TransactionHandoverService.DEFAULT_OTP_TTL_SECONDS,
                    0,
                    attemptsUsed,
                    maxAttempts,
                    remainingAttempts,
                    inAppCode
            );
        }

        @Override
        public String toString() {
            return "HandoverOtpDto[id=" + id
                    + ", status=" + status
                    + ", issuedAt=" + issuedAt
                    + ", expiresAt=" + expiresAt
                    + ", ttlSeconds=" + ttlSeconds
                    + ", reissueCount=" + reissueCount
                    + ", attemptsUsed=" + attemptsUsed
                    + "/" + maxAttempts
                    + ", inAppCode=" + (inAppCode != null ? "[redacted]" : "null")
                    + "]";
        }
    }

    public record CancellationRequestDto(
            UUID id,
            String status,
            String requestedByRole,
            boolean isViewerRequester,
            String reasonCode,
            String reasonLabel,
            String reasonNote,
            Instant requestedAt,
            Instant respondedAt,
            String responseNote
    ) {
    }

    public record TimelineEventDto(
            UUID id,
            String action,
            String fromStatus,
            String toStatus,
            String actorRole,
            String note,
            Instant createdAt
    ) {
    }

    public record TransactionActionsDto(
            boolean canReportDelivered,
            boolean canVerifyOtp,
            boolean canReissueOtp,
            boolean canRequestCancel,
            boolean canRespondCancel,
            boolean canViewHandoverPhoto
    ) {
    }

    public record TransactionStatusCountsDto(
            long all,
            long actionRequired,
            long yeuCau,
            long giuCho,
            long dangGiao,
            long choXacNhan,
            long choXuLy,
            long hoanTat,
            long huy
    ) {
        public static TransactionStatusCountsDto zero() {
            return new TransactionStatusCountsDto(0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L);
        }
    }

    public record TransactionSummaryDto(
            UUID id,
            UUID listingId,
            String listingTitle,
            String listingThumbnailUrl,
            boolean isCombo,
            boolean isFree,
            int itemCount,
            int agreedPriceVnd,
            String status,
            String viewerRole,
            CounterpartySummaryDto counterparty,
            Instant appointmentAt,
            String appointmentLocation,
            Instant deliveredAt,
            Instant autoEscalateAt,
            Instant completedAt,
            Instant cancelledAt,
            boolean hasPendingCancelRequest,
            boolean needsViewerAction,
            String escalationReason,
            Instant updatedAt,
            long version
    ) {
    }

    public record TransactionPageDto(
            List<TransactionSummaryDto> items,
            long pendingActionCount,
            TransactionStatusCountsDto counts,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {
    }

    public record TransactionDetailDto(
            UUID id,
            long version,
            Instant serverNow,
            String status,
            String viewerRole,
            int agreedPriceVnd,
            boolean isFree,
            Instant appointmentAt,
            String appointmentLocation,
            Instant deliveryStartedAt,
            Instant deliveredAt,
            Instant autoEscalateAt,
            Long autoEscalateRemainingSeconds,
            Instant completedAt,
            Instant cancelledAt,
            String escalationReason,
            Instant escalatedAt,
            TransactionListingDto listing,
            List<TransactionItemDto> items,
            CounterpartySummaryDto counterparty,
            CounterpartySummaryDto seller,
            CounterpartySummaryDto buyer,
            HandoverProofDto handoverProof,
            HandoverOtpDto otp,
            CancellationRequestDto cancellationRequest,
            List<TimelineEventDto> timeline,
            TransactionActionsDto actions
    ) {
    }

    public record HandoverPhotoContent(
            UUID photoId,
            String contentType,
            long sizeBytes,
            Resource resource
    ) {
    }

    public record CancelRequestMutationResult(
            TransactionDetailDto detail,
            boolean created
    ) {
    }
}
