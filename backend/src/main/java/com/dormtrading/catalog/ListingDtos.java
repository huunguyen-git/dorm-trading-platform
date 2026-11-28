package com.dormtrading.catalog;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

public final class ListingDtos {

    private ListingDtos() {
    }

    public enum ListingStatus {
        NHAP,
        CHO_DUYET,
        CONG_KHAI,
        GIU_CHO,
        DA_RUT,
        HET_HAN,
        AN,
        KET_THUC;

        public static Optional<ListingStatus> fromString(String value) {
            if (value == null || value.isBlank()) {
                return Optional.empty();
            }
            try {
                return Optional.of(ListingStatus.valueOf(value.strip().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException e) {
                return Optional.empty();
            }
        }

        public static boolean isActiveForQuota(String status) {
            return CHO_DUYET.name().equals(status)
                    || CONG_KHAI.name().equals(status)
                    || GIU_CHO.name().equals(status);
        }

        public static boolean isActiveForInventoryLink(String status) {
            return NHAP.name().equals(status)
                    || CHO_DUYET.name().equals(status)
                    || CONG_KHAI.name().equals(status)
                    || GIU_CHO.name().equals(status)
                    || AN.name().equals(status);
        }

        public static boolean isPubliclyVisible(String status) {
            return CONG_KHAI.name().equals(status) || GIU_CHO.name().equals(status);
        }
    }

    public enum ListingType {
        BAN_LE,
        BAN_COMBO,
        CHO_TANG;

        public static Optional<ListingType> fromString(String value) {
            if (value == null || value.isBlank()) {
                return Optional.empty();
            }
            try {
                return Optional.of(ListingType.valueOf(value.strip().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException e) {
                return Optional.empty();
            }
        }
    }

    public enum ModerationMode {
        AUTO_PRECHECK,
        MANUAL_QUEUE;

        public static ModerationMode fromConfig(String value) {
            if (value == null || value.isBlank()) {
                return AUTO_PRECHECK;
            }
            try {
                return ModerationMode.valueOf(value.strip().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                return AUTO_PRECHECK;
            }
        }
    }

    public record ListingCategoryDto(
            String id,
            String name,
            String parentId,
            String description
    ) {
        public ListingCategoryDto(String id, String name, String parentId) {
            this(id, name, parentId, null);
        }
    }

    public record CategoryTreeNodeDto(
            String id,
            String name,
            String parentId,
            String description,
            List<CategoryTreeNodeDto> children
    ) {
    }

    public record CategoriesResponse(
            List<ListingCategoryDto> items,
            List<CategoryTreeNodeDto> tree
    ) {
    }

    public record LocationZoneDto(
            String code,
            String name,
            String group,
            double latitude,
            double longitude
    ) {
    }

    public record LocationsResponse(
            List<LocationZoneDto> items
    ) {
    }

    public record ListingItemSummaryDto(
            UUID id,
            String name,
            String condition,
            String status,
            List<String> images
    ) {
    }

    /**
     * Public seller summary complying with NFR-01: never exposes email, MSSV/studentId,
     * phone number, student card URLs, or password hashes.
     */
    public record SellerPublicSummaryDto(
            UUID id,
            String displayName,
            int reputationScore,
            Double averageRating,
            int reviewCount
    ) {
    }

    public record ListingViewerContextDto(
            boolean isOwner,
            boolean canEdit,
            boolean canWithdraw,
            boolean canDelete,
            boolean canPublish,
            boolean canRenew,
            boolean canMakeOffer,
            boolean canReserve,
            boolean canMessage
    ) {
    }

    public record ListingQuotaDto(
            int reputationScore,
            int activeCount,
            int limit,
            int remaining,
            boolean canPublish,
            int highTierThreshold,
            int standardLimit,
            int highTierLimit
    ) {
    }

    public record ListingSummaryDto(
            UUID id,
            String title,
            String description,
            String condition,
            int priceVnd,
            String listingType,
            boolean isCombo,
            boolean isFree,
            String status,
            String categoryId,
            String categoryName,
            String courseCode,
            String courseName,
            String author,
            String locationCode,
            String locationName,
            String locationText,
            Double latitude,
            Double longitude,
            Double distanceKm,
            String thumbnailUrl,
            List<String> images,
            int itemCount,
            SellerPublicSummaryDto seller,
            boolean hasUnavailableItems,
            Instant publishedAt,
            Instant expiresAt,
            boolean renewalReminderDue,
            int renewalCount,
            Instant createdAt,
            Instant updatedAt,
            long version,
            UUID activeTransactionId
    ) {
        public ListingSummaryDto(
                UUID id,
                String title,
                String description,
                String condition,
                int priceVnd,
                String listingType,
                boolean isCombo,
                boolean isFree,
                String status,
                String categoryId,
                String categoryName,
                String courseCode,
                String courseName,
                String author,
                String locationCode,
                String locationName,
                String locationText,
                Double latitude,
                Double longitude,
                Double distanceKm,
                String thumbnailUrl,
                List<String> images,
                int itemCount,
                SellerPublicSummaryDto seller,
                boolean hasUnavailableItems,
                Instant publishedAt,
                Instant expiresAt,
                boolean renewalReminderDue,
                int renewalCount,
                Instant createdAt,
                Instant updatedAt,
                long version
        ) {
            this(
                    id, title, description, condition, priceVnd, listingType, isCombo, isFree, status,
                    categoryId, categoryName, courseCode, courseName, author, locationCode, locationName,
                    locationText, latitude, longitude, distanceKm, thumbnailUrl, images, itemCount, seller,
                    hasUnavailableItems, publishedAt, expiresAt, renewalReminderDue, renewalCount,
                    createdAt, updatedAt, version, null
            );
        }
    }

    public record ListingDetailDto(
            UUID id,
            String title,
            String description,
            String condition,
            int priceVnd,
            String listingType,
            boolean isCombo,
            boolean isFree,
            String status,
            String categoryId,
            String categoryName,
            ListingCategoryDto category,
            String courseCode,
            String courseName,
            String author,
            String locationCode,
            String locationName,
            String locationText,
            Double latitude,
            Double longitude,
            Double distanceKm,
            String thumbnailUrl,
            List<String> images,
            int itemCount,
            List<ListingItemSummaryDto> items,
            SellerPublicSummaryDto seller,
            ListingViewerContextDto viewer,
            boolean hasUnavailableItems,
            int pendingRequestCount,
            Instant publishedAt,
            Instant expiresAt,
            boolean renewalReminderDue,
            int renewalCount,
            Instant closedAt,
            String hiddenReason,
            Instant createdAt,
            Instant updatedAt,
            long version,
            UUID activeTransactionId
    ) {
        public static ListingDetailDto fromSummary(
                ListingSummaryDto summary,
                ListingCategoryDto category,
                List<ListingItemSummaryDto> items,
                ListingViewerContextDto viewer,
                int pendingRequestCount,
                Instant closedAt,
                String hiddenReason
        ) {
            return new ListingDetailDto(
                    summary.id(),
                    summary.title(),
                    summary.description(),
                    summary.condition(),
                    summary.priceVnd(),
                    summary.listingType(),
                    summary.isCombo(),
                    summary.isFree(),
                    summary.status(),
                    summary.categoryId(),
                    summary.categoryName(),
                    category,
                    summary.courseCode(),
                    summary.courseName(),
                    summary.author(),
                    summary.locationCode(),
                    summary.locationName(),
                    summary.locationText(),
                    summary.latitude(),
                    summary.longitude(),
                    summary.distanceKm(),
                    summary.thumbnailUrl(),
                    summary.images(),
                    summary.itemCount(),
                    items != null ? List.copyOf(items) : List.of(),
                    summary.seller(),
                    viewer,
                    summary.hasUnavailableItems(),
                    pendingRequestCount,
                    summary.publishedAt(),
                    summary.expiresAt(),
                    summary.renewalReminderDue(),
                    summary.renewalCount(),
                    closedAt,
                    hiddenReason,
                    summary.createdAt(),
                    summary.updatedAt(),
                    summary.version(),
                    summary.activeTransactionId()
            );
        }
    }

    public record ListingPageDto(
            List<ListingSummaryDto> items,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {
    }

    public record MyListingsPageDto(
            List<ListingSummaryDto> items,
            int page,
            int size,
            long totalElements,
            int totalPages,
            ListingQuotaDto quota
    ) {
    }

    public record ListingMutationResponse(
            ListingDetailDto listing,
            ListingQuotaDto quota
    ) {
    }

    public record CreateListingRequest(
            String action,
            String title,
            String description,
            String condition,
            Integer priceVnd,
            String categoryId,
            String locationCode,
            String locationText,
            Double latitude,
            Double longitude,
            String courseCode,
            String courseName,
            String author,
            List<String> images,
            List<UUID> itemIds
    ) {
    }

    public record UpdateListingRequest(
            String action,
            String title,
            String description,
            String condition,
            Integer priceVnd,
            String categoryId,
            String locationCode,
            String locationText,
            Double latitude,
            Double longitude,
            String courseCode,
            String courseName,
            String author,
            List<String> images,
            List<UUID> itemIds,
            Long version
    ) {
    }

    public record VersionRequest(
            Long version
    ) {
    }
}
