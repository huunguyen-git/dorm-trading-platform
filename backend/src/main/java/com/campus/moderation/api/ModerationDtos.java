package com.campus.moderation.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.hibernate.validator.constraints.UniqueElements;

/** Shared contract types; business authorization and transactional services are separate work. */
public final class ModerationDtos {
    private ModerationDtos() { }

    public enum ListingVerdict { APPROVED, REJECTED }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ReviewListingRequest(
        @NotNull @Min(0L) Long expectedVersion,
        @NotNull UUID revisionId,
        @NotNull @Valid ListingVerdict verdict,
        @NotBlank @Size(max = 4000) String reason
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CreateReportRequest(
        @NotNull UUID reportedMemberId,
         UUID listingId,
         UUID tradeId,
        @NotBlank @Size(max = 10000) String description,
        @UniqueElements @NotNull @Size(min = 1) List<@NotNull UUID> evidenceIds
    ) {
        public CreateReportRequest {
            evidenceIds = evidenceIds == null ? null : java.util.Collections.unmodifiableList(new java.util.ArrayList<>(evidenceIds));
        }
    }

    public enum ReportState { SUBMITTED, UNDER_REVIEW, RESOLVED, DISMISSED }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ReportView(
        @NotNull UUID id,
        @NotNull UUID reportedMemberId,
         UUID listingId,
         UUID tradeId,
        @NotNull @Valid ReportState state,
        @NotNull Instant createdAt
    ) {
    }
}
