package com.campus.listing.api;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.hibernate.validator.constraints.UniqueElements;

/** Shared contract types; business authorization and transactional services are separate work. */
public final class ListingDtos {
    private ListingDtos() { }

    public enum OfferType { SALE, GIVEAWAY }

    public enum PublicationState { DRAFT, PUBLISHED, HIDDEN, WITHDRAWN, ARCHIVED }

    public enum ReviewState { DRAFT, PENDING, APPROVED, REJECTED }

    public enum Availability { AVAILABLE, HELD, SOLD }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CategoryView(
        @NotNull Long id,
        @NotBlank String code,
        @NotBlank String name,
         Long parentId
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CreateItemRequest(
        @NotBlank @Size(max = 200) String name,
        @NotBlank @Size(max = 4000) String conditionDescription
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ItemView(
        @NotNull UUID id,
        @NotNull UUID sellerId,
        @NotBlank String name,
        @NotBlank String conditionDescription,
        @NotNull @Valid Availability availability
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ListingContent(
        @NotBlank @Size(max = 200) String title,
        @NotBlank @Size(max = 10000) String description,
        @NotNull @Min(1L) Long categoryId,
        @NotNull @Valid OfferType offerType,
        @NotNull @Min(0L) @Max(9007199254740991L) Long priceVnd,
        @NotBlank @Size(max = 200) String areaLabel,
        @UniqueElements @NotNull @Size(min = 1) List<@NotNull UUID> itemIds,
        @UniqueElements @NotNull @Size(min = 1, max = 5) List<@NotNull UUID> photoIds,
        @Size(max = 200) String author,
        @Size(max = 200) String publisher,
        @Size(max = 80) String courseCode,
        @Size(max = 200) String lecturer
    ) {
        public ListingContent {
            itemIds = itemIds == null ? null : java.util.Collections.unmodifiableList(new java.util.ArrayList<>(itemIds));
            photoIds = photoIds == null ? null : java.util.Collections.unmodifiableList(new java.util.ArrayList<>(photoIds));
        }
        @AssertTrue(message = "Giveaway price must be zero")
        @JsonIgnore
        public boolean isGiveawayPriceValid() {
            return offerType != OfferType.GIVEAWAY || priceVnd == null || priceVnd == 0;
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CreateListingRequest(
        @NotNull @Valid ListingContent content
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ReviseListingRequest(
        @NotNull @Min(0L) Long expectedVersion,
        @NotNull @Valid ListingContent content
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ListingView(
        @NotNull UUID id,
        @NotNull UUID sellerId,
        @NotNull UUID revisionId,
        @NotNull Long version,
        @NotNull @Valid PublicationState publicationState,
        @NotNull @Valid ReviewState reviewState,
        @NotNull @Valid Availability availability,
        @NotNull @Valid ListingContent content,
        @NotNull Instant createdAt
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ListingPage(
        @NotNull List<@NotNull ListingView> items,
        @NotNull Integer page,
        @NotNull Integer size,
        @NotNull Long totalElements
    ) {
        public ListingPage {
            items = items == null ? null : java.util.Collections.unmodifiableList(new java.util.ArrayList<>(items));
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ItemPage(
        @NotNull List<@NotNull ItemView> items,
        @NotNull Integer page,
        @NotNull Integer size,
        @NotNull Long totalElements
    ) {
        public ItemPage {
            items = items == null ? null : java.util.Collections.unmodifiableList(new java.util.ArrayList<>(items));
        }
    }
}
