package com.campus.reservation.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

/** Shared contract types; business authorization and transactional services are separate work. */
public final class ReservationDtos {
    private ReservationDtos() { }

    public enum ReservationState { REQUESTED, ACCEPTED, REJECTED, CANCELLED, COMPLETED }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CreateReservationRequest(
        @NotNull UUID listingId,
        @NotNull UUID revisionId,
         UUID proposalId
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ReservationView(
        @NotNull UUID id,
        @NotNull UUID listingId,
        @NotNull UUID revisionId,
        @NotNull UUID sellerId,
        @NotNull UUID buyerId,
        @NotNull @Valid ReservationState state,
        @NotNull Long version,
         Long agreedPriceVnd,
         Instant acceptedAt,
        @NotNull Instant createdAt
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AppointmentRequest(
        @NotNull @Min(0L) Long expectedVersion,
        @NotNull Instant meetingAt,
        @NotBlank @Size(max = 2000) String placeDescription
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AppointmentView(
        @NotNull UUID reservationId,
        @NotNull Instant meetingAt,
        @NotBlank String placeDescription,
        @NotNull Long version
    ) {
    }
}
