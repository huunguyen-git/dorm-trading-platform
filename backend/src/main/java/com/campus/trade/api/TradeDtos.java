package com.campus.trade.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.hibernate.validator.constraints.UniqueElements;

/** Shared contract types; business authorization and transactional services are separate work. */
public final class TradeDtos {
    private TradeDtos() { }

    public enum TradeState { AWAITING_HANDOVER, AWAITING_CONFIRMATION, ADMIN_REVIEW, COMPLETED, CANCELLED }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TradeView(
        @NotNull UUID id,
        @NotNull UUID reservationId,
        @NotNull UUID sellerId,
        @NotNull UUID buyerId,
        @NotNull @Valid TradeState state,
        @NotNull Long version,
         Instant handoverReportedAt,
         Instant reviewDueAt,
         Instant completedAt,
         Instant ratingDueAt
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ReportHandoverRequest(
        @NotNull @Min(0L) Long expectedVersion,
        @UniqueElements @NotNull @Size(min = 1) List<@NotNull UUID> photoIds
    ) {
        public ReportHandoverRequest {
            photoIds = photoIds == null ? null : java.util.Collections.unmodifiableList(new java.util.ArrayList<>(photoIds));
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ConfirmCompletionRequest(
        @NotNull @Min(0L) Long expectedVersion,
        @NotNull UUID challengeId,
        @NotBlank @Pattern(regexp = "^[0-9]{6}$") String code
    ) {
        @Override public String toString() { return "ConfirmCompletionRequest[REDACTED]"; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CompletionChallengeView(
        @NotNull UUID id,
        @NotBlank @Pattern(regexp = "^[0-9]{6}$") String code,
        @NotNull Instant expiresAt
    ) {
        @Override public String toString() { return "CompletionChallengeView[REDACTED]"; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SubmitRatingRequest(
        @NotNull @Min(1L) @Max(5L) Integer stars,
        @NotBlank @Size(max = 4000) String comment
    ) {
    }

    public enum RatingReviewState { PENDING, APPROVED, REJECTED, REMOVED }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RatingView(
        @NotNull UUID tradeId,
        @NotNull Integer stars,
        @NotBlank String comment,
        @NotNull @Valid RatingReviewState reviewState,
        @NotNull Instant submittedAt
    ) {
    }
}
