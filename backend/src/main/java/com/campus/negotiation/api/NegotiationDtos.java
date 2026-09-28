package com.campus.negotiation.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Shared contract types; business authorization and transactional services are separate work. */
public final class NegotiationDtos {
    private NegotiationDtos() { }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CreateConversationRequest(
        @NotNull UUID listingId
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ConversationView(
        @NotNull UUID id,
        @NotNull UUID listingId,
        @NotNull UUID sellerId,
        @NotNull UUID buyerId,
        @NotNull Instant createdAt
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SendMessageRequest(
        @NotBlank @Size(max = 4000) String body
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MessageView(
        @NotNull UUID id,
        @NotNull UUID conversationId,
        @NotNull UUID senderId,
        @NotBlank String body,
        @NotNull Instant createdAt
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MessagePage(
        @NotNull List<@NotNull MessageView> items,
        @NotNull Integer page,
        @NotNull Integer size,
        @NotNull Long totalElements
    ) {
        public MessagePage {
            items = items == null ? null : java.util.Collections.unmodifiableList(new java.util.ArrayList<>(items));
        }
    }

    public enum ProposalState { PENDING, ACCEPTED, REJECTED }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ProposePriceRequest(
        @NotNull UUID revisionId,
        @NotNull @Min(0L) @Max(9007199254740991L) Long amountVnd
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ProposalView(
        @NotNull UUID id,
        @NotNull UUID conversationId,
        @NotNull UUID revisionId,
        @NotNull @Min(0L) @Max(9007199254740991L) Long amountVnd,
        @NotNull @Valid ProposalState state
    ) {
    }

    public enum ProposalVerdict { ACCEPTED, REJECTED }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record DecideProposalRequest(
        @NotNull @Valid ProposalVerdict verdict
    ) {
    }
}
