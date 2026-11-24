package com.dormtrading.catalog.listing;

import com.dormtrading.catalog.ListingDtos;
import com.dormtrading.catalog.ListingLifecycleHelper;
import com.dormtrading.catalog.ListingValidation;
import com.dormtrading.iam.auth.AccountRestrictedFailure;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.review.reputation.ReputationLedgerService;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * P2-01 Seller Listing Management Service (UC-10, UC-17, UC-18, FR-04, FR-05, FR-13, NFR-02).
 *
 * <p>Uses plain {@code @Transactional} (full rollback on {@link AuthFailure}) and enforces strict
 * deadlock-free row lock ordering:
 * (1) {@code thanh_viens} -> (2) {@code tin_dangs} -> (3) {@code do_vats ORDER BY ma_vat ASC}.
 */
@Service
@Transactional
public class ListingService {

    private static final String ACTION_PUBLISH = "PUBLISH";
    private static final String ACTION_DRAFT = "DRAFT";
    private static final String ACTION_KEEP = "KEEP";

    private static final Set<String> PUBLISHABLE_SOURCE_STATUSES = Set.of(
            ListingDtos.ListingStatus.NHAP.name(),
            ListingDtos.ListingStatus.DA_RUT.name(),
            ListingDtos.ListingStatus.HET_HAN.name()
    );

    private static final Set<String> WITHDRAWABLE_STATUSES = Set.of(
            ListingDtos.ListingStatus.CONG_KHAI.name(),
            ListingDtos.ListingStatus.CHO_DUYET.name()
    );

    private static final Set<String> RENEWABLE_STATUSES = Set.of(
            ListingDtos.ListingStatus.CONG_KHAI.name(),
            ListingDtos.ListingStatus.HET_HAN.name()
    );

    private final JdbcTemplate db;
    private final ListingLifecycleHelper lifecycleHelper;
    private final ReputationLedgerService reputationLedger;
    private final ListingAssembler assembler;

    public ListingService(
            JdbcTemplate db,
            ListingLifecycleHelper lifecycleHelper,
            ReputationLedgerService reputationLedger,
            ListingAssembler assembler
    ) {
        this.db = db;
        this.lifecycleHelper = lifecycleHelper;
        this.reputationLedger = reputationLedger;
        this.assembler = assembler;
    }

    private record LockedSeller(
            UUID userId,
            int reputationScore,
            String accountStatus,
            boolean emailVerified,
            boolean profileApproved
    ) {
    }

    private record LockedListing(
            UUID id,
            UUID sellerId,
            String title,
            String description,
            String condition,
            int priceVnd,
            String listingType,
            String status,
            String categoryId,
            String courseCode,
            String courseName,
            String author,
            String locationCode,
            String locationText,
            Double latitude,
            Double longitude,
            List<String> images,
            Instant publishedAt,
            Instant expiresAt,
            Instant renewalRemindedAt,
            Instant closedAt,
            int renewalCount,
            long version
    ) {
    }

    private record LockedItem(
            UUID id,
            UUID ownerId,
            String status,
            long version
    ) {
    }

    private record ValidatedFields(
            String title,
            String description,
            String condition,
            int priceVnd,
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

    private record LocationZone(
            String code,
            String name,
            double latitude,
            double longitude
    ) {
    }

    public ListingDtos.ListingQuotaDto getQuota(UUID sellerId) {
        verifyActiveSellerReadOnly(sellerId);
        return lifecycleHelper.loadQuota(sellerId);
    }

    public ListingDtos.MyListingsPageDto getMyListings(UUID sellerId, String statusParam, int page, int size) {
        verifyActiveSellerReadOnly(sellerId);
        int validPage = ListingValidation.validatePage(page);
        int validSize = ListingValidation.validateSize(size);

        String statusFilter = null;
        if (statusParam != null && !statusParam.isBlank()) {
            statusFilter = ListingDtos.ListingStatus.fromString(statusParam)
                    .map(Enum::name)
                    .orElseThrow(() -> new AuthFailure(400, "INVALID_INPUT", "Trạng thái tin đăng không hợp lệ."));
        }

        lifecycleHelper.reconcileExpiredListingsForSeller(sellerId);
        lifecycleHelper.markRenewalRemindersForSeller(sellerId);

        long totalElements = countSellerListings(sellerId, statusFilter);
        Instant currentTime = lifecycleHelper.now();
        ListingDtos.SellerPublicSummaryDto seller = assembler.loadSellerPublicSummary(sellerId);
        if (seller == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }

        List<ListingDtos.ListingSummaryDto> items = assembler.loadPagedSummariesForSeller(
                sellerId,
                statusFilter,
                validPage,
                validSize,
                seller,
                currentTime
        );
        ListingDtos.ListingQuotaDto quota = lifecycleHelper.loadQuotaForScore(sellerId, seller.reputationScore());
        int totalPages = ListingValidation.calculateTotalPages(totalElements, validSize);

        return new ListingDtos.MyListingsPageDto(items, validPage, validSize, totalElements, totalPages, quota);
    }

    public ListingDtos.ListingMutationResponse createListing(UUID sellerId, ListingDtos.CreateListingRequest req) {
        if (req == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Dữ liệu tạo tin đăng không hợp lệ.");
        }
        String action = parseCreateAction(req.action());
        boolean isPublish = ACTION_PUBLISH.equals(action);

        ValidatedFields fields = validateListingFields(
                req.title(),
                req.description(),
                req.condition(),
                req.priceVnd(),
                req.categoryId(),
                req.locationCode(),
                req.locationText(),
                req.latitude(),
                req.longitude(),
                req.courseCode(),
                req.courseName(),
                req.author(),
                req.images(),
                req.itemIds(),
                isPublish
        );

        LockedSeller seller;
        if (isPublish) {
            // Lock order (1): thanh_viens FOR UPDATE
            seller = lockAndVerifyActiveSeller(sellerId);
            lifecycleHelper.reconcileExpiredListingsForSeller(sellerId);
            ListingDtos.ListingQuotaDto preQuota = lifecycleHelper.loadQuotaForScore(sellerId, seller.reputationScore());
            if (!preQuota.canPublish()) {
                throw new AuthFailure(
                        409,
                        "QUOTA_EXCEEDED",
                        "Bạn đã đạt hạn mức tin đăng đang mở (" + preQuota.activeCount() + "/" + preQuota.limit()
                                + "). Hãy rút tin cũ hoặc lưu bản nháp."
                );
            }
        } else {
            seller = verifyActiveSellerReadOnly(sellerId);
        }

        // Lock order (3): do_vats ORDER BY ma_vat ASC FOR UPDATE
        if (!fields.itemIds().isEmpty()) {
            Map<UUID, LockedItem> lockedItems = lockItemsSorted(fields.itemIds());
            verifyOwnedAndAvailable(fields.itemIds(), lockedItems, sellerId);
        }

        Instant now = lifecycleHelper.now();
        UUID listingId = UUID.randomUUID();
        String targetStatus = isPublish ? lifecycleHelper.targetPublishStatus() : ListingDtos.ListingStatus.NHAP.name();
        Instant publishedAt = ListingDtos.ListingStatus.CONG_KHAI.name().equals(targetStatus) ? now : null;
        Instant expiresAt = ListingLifecycleHelper.calculateExpiresAt(publishedAt);
        String listingType = ListingLifecycleHelper.deriveListingType(fields.itemIds().size(), fields.priceVnd());

        insertListing(listingId, sellerId, fields, listingType, targetStatus, publishedAt, expiresAt, now);
        if (!fields.itemIds().isEmpty()) {
            insertListingItems(listingId, fields.itemIds());
            bumpItemsVersion(fields.itemIds(), now);
        }

        ListingDtos.ListingDetailDto detail = assembler.loadDetailForOwner(listingId, now);
        ListingDtos.ListingQuotaDto quota = lifecycleHelper.loadQuotaForScore(sellerId, seller.reputationScore());
        return new ListingDtos.ListingMutationResponse(detail, quota);
    }

    public ListingDtos.ListingMutationResponse updateListing(
            UUID sellerId,
            UUID listingId,
            ListingDtos.UpdateListingRequest req
    ) {
        if (listingId == null || req == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Dữ liệu cập nhật tin đăng không hợp lệ.");
        }
        if (req.version() == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thiếu thông tin phiên bản dữ liệu (version).");
        }
        String action = parseUpdateAction(req.action());
        boolean wantsPublish = ACTION_PUBLISH.equals(action);

        LockedSeller seller;
        if (wantsPublish) {
            // Lock order (1): thanh_viens FOR UPDATE before tin_dangs
            seller = lockAndVerifyActiveSeller(sellerId);
            lifecycleHelper.reconcileExpiredListingsForSeller(sellerId);
        } else {
            seller = verifyActiveSellerReadOnly(sellerId);
        }

        // Lock order (2): tin_dangs FOR UPDATE
        LockedListing current = lockListingForUpdate(listingId);
        assertOwner(current, sellerId);
        assertNotLocked(current);

        if (!req.version().equals(current.version())) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Tin đăng đã thay đổi bởi thao tác khác. Vui lòng làm mới.");
        }

        List<UUID> oldItemIds = loadLinkedItemIds(listingId);
        List<UUID> effectiveItemIds = req.itemIds() != null ? req.itemIds() : oldItemIds;

        String currentStatus = current.status();
        boolean currentlyActivePublicOrPending = ListingDtos.ListingStatus.CONG_KHAI.name().equals(currentStatus)
                || ListingDtos.ListingStatus.CHO_DUYET.name().equals(currentStatus);
        boolean transitioningFromInactiveToPublish = wantsPublish && !currentlyActivePublicOrPending;
        boolean transitioningFromPendingToPublic = wantsPublish
                && ListingDtos.ListingStatus.CHO_DUYET.name().equals(currentStatus)
                && lifecycleHelper.moderationMode() == ListingDtos.ModerationMode.AUTO_PRECHECK;
        boolean requiresQuotaCheck = transitioningFromInactiveToPublish || transitioningFromPendingToPublic;
        boolean requiresFullValidation = wantsPublish || currentlyActivePublicOrPending;

        ValidatedFields fields = validateListingFields(
                req.title(),
                req.description(),
                req.condition(),
                req.priceVnd(),
                req.categoryId(),
                req.locationCode(),
                req.locationText(),
                req.latitude(),
                req.longitude(),
                req.courseCode(),
                req.courseName(),
                req.author(),
                req.images(),
                effectiveItemIds,
                requiresFullValidation
        );

        if (requiresQuotaCheck) {
            ListingDtos.ListingQuotaDto preQuota = lifecycleHelper.loadQuotaForScore(sellerId, seller.reputationScore());
            if (!preQuota.canPublish()) {
                throw new AuthFailure(
                        409,
                        "QUOTA_EXCEEDED",
                        "Bạn đã đạt hạn mức tin đăng đang mở (" + preQuota.activeCount() + "/" + preQuota.limit()
                                + "). Không thể công khai thêm tin."
                );
            }
        }

        // Lock order (3): union of old + new do_vats sorted ascending FOR UPDATE
        LinkedHashSet<UUID> allInvolvedItemIds = new LinkedHashSet<>(oldItemIds);
        allInvolvedItemIds.addAll(fields.itemIds());
        if (!allInvolvedItemIds.isEmpty()) {
            Map<UUID, LockedItem> lockedItems = lockItemsSorted(allInvolvedItemIds);
            Set<UUID> oldSet = Set.copyOf(oldItemIds);
            if (requiresFullValidation) {
                verifyOwnedAndAvailable(fields.itemIds(), lockedItems, sellerId);
            } else {
                for (UUID itemId : fields.itemIds()) {
                    LockedItem item = lockedItems.get(itemId);
                    if (item == null || !item.ownerId().equals(sellerId)) {
                        throw new AuthFailure(409, "ITEM_NOT_OWNED", "Đồ vật không tồn tại hoặc không thuộc kho cá nhân của bạn.");
                    }
                    if (!oldSet.contains(itemId) && !"KHA_DUNG".equals(item.status())) {
                        throw new AuthFailure(
                                409,
                                "ITEM_STATUS_CONFLICT",
                                "Đồ vật đang ở trạng thái " + item.status() + ", không thể gắn vào tin đăng."
                        );
                    }
                }
            }
        }

        Instant now = lifecycleHelper.now();
        String nextStatus = resolveUpdatedStatus(currentStatus, wantsPublish);
        Instant nextPublishedAt = current.publishedAt();
        Instant nextExpiresAt = current.expiresAt();
        Instant nextRenewalRemindedAt = current.renewalRemindedAt();
        Instant nextClosedAt = current.closedAt();

        if (transitioningFromInactiveToPublish || transitioningFromPendingToPublic) {
            if (ListingDtos.ListingStatus.CONG_KHAI.name().equals(nextStatus)) {
                nextPublishedAt = now;
                nextExpiresAt = ListingLifecycleHelper.calculateExpiresAt(now);
            } else {
                nextPublishedAt = null;
                nextExpiresAt = null;
            }
            nextRenewalRemindedAt = null;
            nextClosedAt = null;
        } else if (ListingDtos.ListingStatus.CONG_KHAI.name().equals(currentStatus)
                && ListingDtos.ListingStatus.CHO_DUYET.name().equals(nextStatus)) {
            // MANUAL_QUEUE re-moderation on editing a CONG_KHAI listing
            nextPublishedAt = null;
            nextExpiresAt = null;
            nextRenewalRemindedAt = null;
        }

        String listingType = ListingLifecycleHelper.deriveListingType(fields.itemIds().size(), fields.priceVnd());

        int updated = updateListingRow(
                listingId,
                sellerId,
                current.version(),
                fields,
                listingType,
                nextStatus,
                nextPublishedAt,
                nextExpiresAt,
                nextRenewalRemindedAt,
                nextClosedAt,
                now
        );
        if (updated == 0) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Xung đột đồng thời khi cập nhật tin đăng.");
        }

        Set<UUID> affectedItems = syncListingItems(listingId, oldItemIds, fields.itemIds());
        boolean becameInventoryActive = !ListingDtos.ListingStatus.isActiveForInventoryLink(currentStatus)
                && ListingDtos.ListingStatus.isActiveForInventoryLink(nextStatus);
        if (becameInventoryActive) {
            affectedItems.addAll(fields.itemIds());
        }
        if (!affectedItems.isEmpty()) {
            bumpItemsVersion(affectedItems, now);
        }

        ListingDtos.ListingDetailDto detail = assembler.loadDetailForOwner(listingId, now);
        ListingDtos.ListingQuotaDto quota = lifecycleHelper.loadQuotaForScore(sellerId, seller.reputationScore());
        return new ListingDtos.ListingMutationResponse(detail, quota);
    }

    public ListingDtos.ListingMutationResponse publishListing(
            UUID sellerId,
            UUID listingId,
            ListingDtos.VersionRequest req
    ) {
        if (listingId == null || req == null || req.version() == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thiếu thông tin phiên bản dữ liệu (version).");
        }

        // Lock order (1): thanh_viens FOR UPDATE
        LockedSeller seller = lockAndVerifyActiveSeller(sellerId);
        lifecycleHelper.reconcileExpiredListingsForSeller(sellerId);

        // Lock order (2): tin_dangs FOR UPDATE
        LockedListing current = lockListingForUpdate(listingId);
        assertOwner(current, sellerId);
        assertNotLocked(current);

        if (!PUBLISHABLE_SOURCE_STATUSES.contains(current.status())) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Chỉ có thể công khai tin từ trạng thái NHAP, DA_RUT hoặc HET_HAN."
            );
        }
        if (!req.version().equals(current.version())) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Tin đăng đã thay đổi bởi thao tác khác. Vui lòng làm mới.");
        }

        List<UUID> linkedItemIds = loadLinkedItemIds(listingId);
        ValidatedFields validated = validateListingFields(
                current.title(),
                current.description(),
                current.condition(),
                current.priceVnd(),
                current.categoryId(),
                current.locationCode(),
                current.locationText(),
                current.latitude(),
                current.longitude(),
                current.courseCode(),
                current.courseName(),
                current.author(),
                current.images(),
                linkedItemIds,
                true
        );

        ListingDtos.ListingQuotaDto preQuota = lifecycleHelper.loadQuotaForScore(sellerId, seller.reputationScore());
        if (!preQuota.canPublish()) {
            throw new AuthFailure(
                    409,
                    "QUOTA_EXCEEDED",
                    "Bạn đã đạt hạn mức tin đăng đang mở (" + preQuota.activeCount() + "/" + preQuota.limit()
                            + "). Không thể công khai thêm tin."
            );
        }

        // Lock order (3): do_vats ORDER BY ma_vat ASC FOR UPDATE
        Map<UUID, LockedItem> lockedItems = lockItemsSorted(validated.itemIds());
        verifyOwnedAndAvailable(validated.itemIds(), lockedItems, sellerId);

        Instant now = lifecycleHelper.now();
        String targetStatus = lifecycleHelper.targetPublishStatus();
        Instant publishedAt = ListingDtos.ListingStatus.CONG_KHAI.name().equals(targetStatus) ? now : null;
        Instant expiresAt = ListingLifecycleHelper.calculateExpiresAt(publishedAt);
        String listingType = ListingLifecycleHelper.deriveListingType(validated.itemIds().size(), validated.priceVnd());

        int updated = db.update(
                """
                UPDATE tin_dangs
                SET trang_thai = ?,
                    hinh_thuc = ?,
                    published_at = ?,
                    expires_at = ?,
                    renewal_reminded_at = NULL,
                    closed_at = NULL,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_tin = ? AND nguoi_dang_id = ? AND version = ?
                """,
                targetStatus,
                listingType,
                toTimestamp(publishedAt),
                toTimestamp(expiresAt),
                Timestamp.from(now),
                listingId,
                sellerId,
                current.version()
        );
        if (updated == 0) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Xung đột đồng thời khi công khai tin đăng.");
        }

        bumpItemsVersion(validated.itemIds(), now);

        ListingDtos.ListingDetailDto detail = assembler.loadDetailForOwner(listingId, now);
        ListingDtos.ListingQuotaDto quota = lifecycleHelper.loadQuotaForScore(sellerId, seller.reputationScore());
        return new ListingDtos.ListingMutationResponse(detail, quota);
    }

    public ListingDtos.ListingMutationResponse withdrawListing(
            UUID sellerId,
            UUID listingId,
            ListingDtos.VersionRequest req
    ) {
        if (listingId == null || req == null || req.version() == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thiếu thông tin phiên bản dữ liệu (version).");
        }

        verifyActiveSellerReadOnly(sellerId);

        // Lock order (2): tin_dangs FOR UPDATE
        LockedListing current = lockListingForUpdate(listingId);
        assertOwner(current, sellerId);
        assertNotLocked(current);

        Instant now = lifecycleHelper.now();
        if (!WITHDRAWABLE_STATUSES.contains(current.status())
                || ListingLifecycleHelper.isExpired(current.status(), current.expiresAt(), now)) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Chỉ có thể rút tin khi tin đang ở trạng thái CONG_KHAI hoặc CHO_DUYET."
            );
        }
        if (!req.version().equals(current.version())) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Tin đăng đã thay đổi bởi thao tác khác. Vui lòng làm mới.");
        }

        // Lock order (3): linked do_vats ORDER BY ma_vat ASC FOR UPDATE (never mutate do_vats.trang_thai!)
        List<UUID> linkedItemIds = loadLinkedItemIds(listingId);
        if (!linkedItemIds.isEmpty()) {
            lockItemsSorted(linkedItemIds);
        }

        int updated = db.update(
                """
                UPDATE tin_dangs
                SET trang_thai = 'DA_RUT',
                    closed_at = ?,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_tin = ? AND nguoi_dang_id = ? AND version = ?
                """,
                Timestamp.from(now),
                Timestamp.from(now),
                listingId,
                sellerId,
                current.version()
        );
        if (updated == 0) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Xung đột đồng thời khi rút tin đăng.");
        }

        if (!linkedItemIds.isEmpty()) {
            bumpItemsVersion(linkedItemIds, now);
        }

        ListingDtos.ListingDetailDto detail = assembler.loadDetailForOwner(listingId, now);
        ListingDtos.ListingQuotaDto quota = lifecycleHelper.loadQuota(sellerId);
        return new ListingDtos.ListingMutationResponse(detail, quota);
    }

    public ListingDtos.ListingMutationResponse renewListing(
            UUID sellerId,
            UUID listingId,
            ListingDtos.VersionRequest req
    ) {
        if (listingId == null || req == null || req.version() == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thiếu thông tin phiên bản dữ liệu (version).");
        }

        // Lock order (1): thanh_viens FOR UPDATE
        LockedSeller seller = lockAndVerifyActiveSeller(sellerId);
        lifecycleHelper.reconcileExpiredListingsForSeller(sellerId);

        // Lock order (2): tin_dangs FOR UPDATE
        LockedListing current = lockListingForUpdate(listingId);
        assertOwner(current, sellerId);
        assertNotLocked(current);

        if (!RENEWABLE_STATUSES.contains(current.status())) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Chỉ có thể gia hạn tin ở trạng thái CONG_KHAI hoặc HET_HAN."
            );
        }
        if (!req.version().equals(current.version())) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Tin đăng đã thay đổi bởi thao tác khác. Vui lòng làm mới.");
        }

        boolean isReopeningExpired = ListingDtos.ListingStatus.HET_HAN.name().equals(current.status());

        List<UUID> linkedItemIds = loadLinkedItemIds(listingId);
        if (isReopeningExpired) {
            validateListingFields(
                    current.title(),
                    current.description(),
                    current.condition(),
                    current.priceVnd(),
                    current.categoryId(),
                    current.locationCode(),
                    current.locationText(),
                    current.latitude(),
                    current.longitude(),
                    current.courseCode(),
                    current.courseName(),
                    current.author(),
                    current.images(),
                    linkedItemIds,
                    true
            );
            ListingDtos.ListingQuotaDto preQuota = lifecycleHelper.loadQuotaForScore(sellerId, seller.reputationScore());
            if (!preQuota.canPublish()) {
                throw new AuthFailure(
                        409,
                        "QUOTA_EXCEEDED",
                        "Bạn đã đạt hạn mức tin đăng đang mở (" + preQuota.activeCount() + "/" + preQuota.limit()
                                + "). Không thể gia hạn tin đã hết hạn."
                );
            }
        } else if (linkedItemIds.isEmpty()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Tin đăng phải gắn ít nhất 1 đồ vật hợp lệ để gia hạn.");
        }

        // Lock order (3): do_vats ORDER BY ma_vat ASC FOR UPDATE
        Map<UUID, LockedItem> lockedItems = lockItemsSorted(linkedItemIds);
        verifyOwnedAndAvailable(linkedItemIds, lockedItems, sellerId);

        Instant now = lifecycleHelper.now();
        Instant newExpiresAt = ListingLifecycleHelper.calculateExpiresAt(now);
        int updated;
        if (isReopeningExpired) {
            updated = db.update(
                    """
                    UPDATE tin_dangs
                    SET trang_thai = 'CONG_KHAI',
                        published_at = ?,
                        expires_at = ?,
                        closed_at = NULL,
                        renewal_reminded_at = NULL,
                        so_lan_gia_han = so_lan_gia_han + 1,
                        updated_at = ?,
                        version = version + 1
                    WHERE ma_tin = ? AND nguoi_dang_id = ? AND version = ?
                    """,
                    Timestamp.from(now),
                    Timestamp.from(newExpiresAt),
                    Timestamp.from(now),
                    listingId,
                    sellerId,
                    current.version()
            );
        } else {
            updated = db.update(
                    """
                    UPDATE tin_dangs
                    SET expires_at = ?,
                        renewal_reminded_at = NULL,
                        so_lan_gia_han = so_lan_gia_han + 1,
                        updated_at = ?,
                        version = version + 1
                    WHERE ma_tin = ? AND nguoi_dang_id = ? AND version = ?
                    """,
                    Timestamp.from(newExpiresAt),
                    Timestamp.from(now),
                    listingId,
                    sellerId,
                    current.version()
            );
        }
        if (updated == 0) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Xung đột đồng thời khi gia hạn tin đăng.");
        }

        if (isReopeningExpired) {
            bumpItemsVersion(linkedItemIds, now);
        }

        ListingDtos.ListingDetailDto detail = assembler.loadDetailForOwner(listingId, now);
        ListingDtos.ListingQuotaDto quota = lifecycleHelper.loadQuotaForScore(sellerId, seller.reputationScore());
        return new ListingDtos.ListingMutationResponse(detail, quota);
    }

    public void deleteListing(UUID sellerId, UUID listingId, Long expectedVersion) {
        if (listingId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã tin đăng không hợp lệ.");
        }
        verifyActiveSellerReadOnly(sellerId);

        // Lock order (2): tin_dangs FOR UPDATE
        LockedListing current = lockListingForUpdate(listingId);
        assertOwner(current, sellerId);
        assertNotLocked(current);

        if (assembler.countAllTransactions(listingId) > 0) {
            throw new AuthFailure(
                    409,
                    "LISTING_HAS_TRANSACTIONS",
                    "Tin đăng đã phát sinh giao dịch nên không thể xóa vĩnh viễn. Vui lòng sử dụng chức năng Rút tin."
            );
        }

        if (expectedVersion != null && !expectedVersion.equals(current.version())) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Tin đăng đã thay đổi bởi thao tác khác. Vui lòng làm mới.");
        }

        // Lock order (3): linked do_vats ORDER BY ma_vat ASC FOR UPDATE
        List<UUID> linkedItemIds = loadLinkedItemIds(listingId);
        if (!linkedItemIds.isEmpty()) {
            lockItemsSorted(linkedItemIds);
        }

        Instant now = lifecycleHelper.now();
        try {
            int deleted = db.update(
                    "DELETE FROM tin_dangs WHERE ma_tin = ? AND nguoi_dang_id = ? AND version = ?",
                    listingId,
                    sellerId,
                    current.version()
            );
            if (deleted == 0) {
                throw new AuthFailure(409, "VERSION_CONFLICT", "Xung đột đồng thời khi xóa tin đăng.");
            }
        } catch (DataIntegrityViolationException e) {
            throw new AuthFailure(
                    409,
                    "LISTING_HAS_TRANSACTIONS",
                    "Tin đăng đã phát sinh giao dịch nên không thể xóa vĩnh viễn. Vui lòng sử dụng chức năng Rút tin."
            );
        }

        if (!linkedItemIds.isEmpty()) {
            bumpItemsVersion(linkedItemIds, now);
        }
    }

    private LockedSeller lockAndVerifyActiveSeller(UUID sellerId) {
        if (sellerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        reputationLedger.reconcileExpiredTemporaryLock(sellerId);
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT user_id, diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved,
                       loai_han_che, ly_do_han_che, khoa_den_ngay, cho_phep_khieu_nai
                FROM thanh_viens
                WHERE user_id = ?
                FOR UPDATE
                """,
                sellerId
        );
        return evaluateSellerRow(rows);
    }

    private LockedSeller verifyActiveSellerReadOnly(UUID sellerId) {
        if (sellerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        reputationLedger.reconcileExpiredTemporaryLock(sellerId);
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT user_id, diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved,
                       loai_han_che, ly_do_han_che, khoa_den_ngay, cho_phep_khieu_nai
                FROM thanh_viens
                WHERE user_id = ?
                """,
                sellerId
        );
        return evaluateSellerRow(rows);
    }

    private LockedSeller evaluateSellerRow(List<Map<String, Object>> rows) {
        if (rows.isEmpty()) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }
        Map<String, Object> row = rows.getFirst();
        String status = String.valueOf(row.get("trang_thai_tai_khoan"));
        int score = ((Number) row.get("diem_uy_tin")).intValue();
        boolean emailVerified = Boolean.TRUE.equals(row.get("email_verified"));
        boolean profileApproved = Boolean.TRUE.equals(row.get("profile_approved"));

        if ("BI_KHOA".equals(status)) {
            Timestamp lockedUntilTs = (Timestamp) row.get("khoa_den_ngay");
            throw new AccountRestrictedFailure(new AccountRestrictedFailure.RestrictionPayload(
                    status,
                    (String) row.get("loai_han_che"),
                    (String) row.get("ly_do_han_che"),
                    lockedUntilTs != null ? lockedUntilTs.toInstant() : null,
                    Boolean.TRUE.equals(row.get("cho_phep_khieu_nai")),
                    score
            ));
        }
        if (!"HOAT_DONG".equals(status) || !emailVerified || !profileApproved) {
            throw new AuthFailure(
                    403,
                    "FORBIDDEN",
                    "Tài khoản cần được xác minh email và phê duyệt hồ sơ trước khi quản lý tin đăng."
            );
        }
        return new LockedSeller(
                (UUID) row.get("user_id"),
                score,
                status,
                emailVerified,
                profileApproved
        );
    }

    private LockedListing lockListingForUpdate(UUID listingId) {
        List<LockedListing> rows = db.query(
                """
                SELECT ma_tin, nguoi_dang_id, tieu_de, mo_ta, tinh_trang, gia_vnd, hinh_thuc, trang_thai,
                       ma_danh_muc, ma_mon_hoc, ten_mon_hoc, tac_gia, ma_khu_vuc, khu_vuc, vi_do, kinh_do,
                       hinh_anh, published_at, expires_at, renewal_reminded_at, closed_at, so_lan_gia_han, version
                FROM tin_dangs
                WHERE ma_tin = ?
                FOR UPDATE
                """,
                (rs, rowNum) -> new LockedListing(
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_dang_id", UUID.class),
                        rs.getString("tieu_de"),
                        rs.getString("mo_ta"),
                        rs.getString("tinh_trang"),
                        rs.getInt("gia_vnd"),
                        rs.getString("hinh_thuc"),
                        rs.getString("trang_thai"),
                        rs.getString("ma_danh_muc"),
                        rs.getString("ma_mon_hoc"),
                        rs.getString("ten_mon_hoc"),
                        rs.getString("tac_gia"),
                        rs.getString("ma_khu_vuc"),
                        rs.getString("khu_vuc"),
                        ListingAssembler.getNullableDouble(rs, "vi_do"),
                        ListingAssembler.getNullableDouble(rs, "kinh_do"),
                        ListingAssembler.extractTextArray(rs, "hinh_anh"),
                        ListingAssembler.toInstant(rs.getTimestamp("published_at")),
                        ListingAssembler.toInstant(rs.getTimestamp("expires_at")),
                        ListingAssembler.toInstant(rs.getTimestamp("renewal_reminded_at")),
                        ListingAssembler.toInstant(rs.getTimestamp("closed_at")),
                        rs.getInt("so_lan_gia_han"),
                        rs.getLong("version")
                ),
                listingId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "LISTING_NOT_FOUND", "Không tìm thấy tin đăng.");
        }
        return rows.getFirst();
    }

    private void assertOwner(LockedListing listing, UUID sellerId) {
        if (!listing.sellerId().equals(sellerId)) {
            throw new AuthFailure(403, "FORBIDDEN", "Bạn không có quyền thao tác trên tin đăng của người khác.");
        }
    }

    private void assertNotLocked(LockedListing listing) {
        if (ListingAssembler.LOCKED_LISTING_STATUSES.contains(listing.status())
                || assembler.countActiveTransactions(listing.id()) > 0) {
            throw new AuthFailure(
                    409,
                    "LISTING_LOCKED",
                    "Tin đăng đang được giữ chỗ, đang có giao dịch hiệu lực hoặc đã bị khóa nên không thể chỉnh sửa/rút/xóa."
            );
        }
    }

    private String parseCreateAction(String rawAction) {
        if (rawAction == null || rawAction.isBlank()) {
            return ACTION_PUBLISH;
        }
        String normalized = rawAction.strip().toUpperCase(Locale.ROOT);
        if (!ACTION_PUBLISH.equals(normalized) && !ACTION_DRAFT.equals(normalized)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Hành động không hợp lệ (chỉ chấp nhận PUBLISH hoặc DRAFT).");
        }
        return normalized;
    }

    private String parseUpdateAction(String rawAction) {
        if (rawAction == null || rawAction.isBlank()) {
            return ACTION_KEEP;
        }
        String normalized = rawAction.strip().toUpperCase(Locale.ROOT);
        if (!ACTION_KEEP.equals(normalized) && !ACTION_PUBLISH.equals(normalized)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Hành động cập nhật không hợp lệ (chỉ chấp nhận KEEP hoặc PUBLISH).");
        }
        return normalized;
    }

    private String resolveUpdatedStatus(String currentStatus, boolean wantsPublish) {
        if (wantsPublish) {
            return lifecycleHelper.targetPublishStatus();
        }
        if (ListingDtos.ListingStatus.CONG_KHAI.name().equals(currentStatus)
                && lifecycleHelper.moderationMode() == ListingDtos.ModerationMode.MANUAL_QUEUE) {
            return ListingDtos.ListingStatus.CHO_DUYET.name();
        }
        return currentStatus;
    }

    private ValidatedFields validateListingFields(
            String rawTitle,
            String rawDescription,
            String rawCondition,
            Integer rawPriceVnd,
            String rawCategoryId,
            String rawLocationCode,
            String rawLocationText,
            Double rawLatitude,
            Double rawLongitude,
            String rawCourseCode,
            String rawCourseName,
            String rawAuthor,
            List<String> rawImages,
            List<UUID> rawItemIds,
            boolean fullValidation
    ) {
        String title = ListingValidation.requiredText(
                rawTitle,
                ListingValidation.MAX_TITLE_LENGTH,
                "Tiêu đề tin đăng không được để trống.",
                "Tiêu đề tin đăng không được vượt quá 255 ký tự."
        );

        String description = fullValidation
                ? ListingValidation.requiredText(
                        rawDescription,
                        ListingValidation.MAX_DESCRIPTION_LENGTH,
                        "Mô tả tin đăng không được để trống khi công khai.",
                        "Mô tả tin đăng không được vượt quá 5000 ký tự."
                )
                : ListingValidation.optionalText(
                        rawDescription,
                        ListingValidation.MAX_DESCRIPTION_LENGTH,
                        "Mô tả tin đăng không được vượt quá 5000 ký tự."
                );

        String condition = fullValidation
                ? ListingValidation.requiredText(
                        rawCondition,
                        ListingValidation.MAX_CONDITION_LENGTH,
                        "Tình trạng sản phẩm không được để trống khi công khai.",
                        "Tình trạng sản phẩm không được vượt quá 2000 ký tự."
                )
                : ListingValidation.optionalText(
                        rawCondition,
                        ListingValidation.MAX_CONDITION_LENGTH,
                        "Tình trạng sản phẩm không được vượt quá 2000 ký tự."
                );

        int priceVnd = ListingValidation.validatePriceVnd(rawPriceVnd, fullValidation);

        String categoryId = ListingValidation.optionalText(rawCategoryId, 50, "Mã danh mục quá dài.");
        if (fullValidation && categoryId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Vui lòng chọn danh mục cho tin đăng.");
        }
        if (categoryId != null) {
            verifyActiveCategory(categoryId);
        }

        ListingValidation.validateCoordinates(rawLatitude, rawLongitude);
        String locationCode = ListingValidation.optionalText(rawLocationCode, 50, "Mã khu vực quá dài.");
        String locationText = ListingValidation.optionalText(
                rawLocationText,
                ListingValidation.MAX_LOCATION_TEXT_LENGTH,
                "Khu vực giao dịch không được vượt quá 255 ký tự."
        );
        Double latitude = rawLatitude;
        Double longitude = rawLongitude;

        if (locationCode != null) {
            LocationZone zone = loadActiveLocationZone(locationCode);
            locationCode = zone.code();
            if (locationText == null) {
                locationText = zone.name();
            }
            if (latitude == null && longitude == null) {
                latitude = zone.latitude();
                longitude = zone.longitude();
            }
        }
        if (fullValidation && locationCode == null && locationText == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Vui lòng chọn khu vực hoặc địa điểm giao dịch.");
        }

        String courseCode = ListingValidation.optionalText(
                rawCourseCode,
                ListingValidation.MAX_COURSE_CODE_LENGTH,
                "Mã môn học không được vượt quá 50 ký tự."
        );
        String courseName = ListingValidation.optionalText(
                rawCourseName,
                ListingValidation.MAX_COURSE_NAME_LENGTH,
                "Tên môn học không được vượt quá 200 ký tự."
        );
        String author = ListingValidation.optionalText(
                rawAuthor,
                ListingValidation.MAX_AUTHOR_LENGTH,
                "Tên tác giả không được vượt quá 200 ký tự."
        );

        List<String> images = ListingValidation.validateImages(rawImages, fullValidation);
        List<UUID> itemIds = ListingValidation.deduplicateItemIds(rawItemIds, fullValidation);

        return new ValidatedFields(
                title,
                description,
                condition,
                priceVnd,
                categoryId,
                locationCode,
                locationText,
                latitude,
                longitude,
                courseCode,
                courseName,
                author,
                images,
                itemIds
        );
    }

    private void verifyActiveCategory(String categoryId) {
        Integer found = db.queryForObject(
                "SELECT COUNT(*) FROM danh_mucs WHERE ma_danh_muc = ? AND hien_thi = TRUE",
                Integer.class,
                categoryId
        );
        if (found == null || found == 0) {
            throw new AuthFailure(404, "CATEGORY_NOT_FOUND", "Danh mục không tồn tại hoặc đang bị ẩn.");
        }
    }

    private LocationZone loadActiveLocationZone(String locationCode) {
        List<LocationZone> zones = db.query(
                "SELECT ma_khu_vuc, ten, vi_do, kinh_do FROM khu_vucs WHERE ma_khu_vuc = ? AND hien_thi = TRUE",
                (rs, rowNum) -> new LocationZone(
                        rs.getString("ma_khu_vuc"),
                        rs.getString("ten"),
                        rs.getDouble("vi_do"),
                        rs.getDouble("kinh_do")
                ),
                locationCode
        );
        if (zones.isEmpty()) {
            throw new AuthFailure(400, "INVALID_LOCATION", "Mã khu vực không tồn tại hoặc không khả dụng.");
        }
        return zones.getFirst();
    }

    private Map<UUID, LockedItem> lockItemsSorted(Collection<UUID> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) {
            return Map.of();
        }
        List<UUID> sortedIds = itemIds.stream()
                .distinct()
                .sorted(Comparator.comparing(UUID::toString))
                .toList();

        Map<UUID, LockedItem> locked = new HashMap<>();
        db.query(
                con -> {
                    PreparedStatement ps = con.prepareStatement(
                            """
                            SELECT ma_vat, user_id, trang_thai, version
                            FROM do_vats
                            WHERE ma_vat = ANY(?)
                            ORDER BY ma_vat ASC
                            FOR UPDATE
                            """
                    );
                    ps.setArray(1, con.createArrayOf("uuid", sortedIds.toArray(new UUID[0])));
                    return ps;
                },
                rs -> {
                    UUID id = rs.getObject("ma_vat", UUID.class);
                    locked.put(id, new LockedItem(
                            id,
                            rs.getObject("user_id", UUID.class),
                            rs.getString("trang_thai"),
                            rs.getLong("version")
                    ));
                }
        );
        return locked;
    }

    private void verifyOwnedAndAvailable(
            List<UUID> requestedItemIds,
            Map<UUID, LockedItem> lockedItems,
            UUID sellerId
    ) {
        for (UUID itemId : requestedItemIds) {
            LockedItem item = lockedItems.get(itemId);
            if (item == null || !item.ownerId().equals(sellerId)) {
                throw new AuthFailure(409, "ITEM_NOT_OWNED", "Đồ vật không tồn tại hoặc không thuộc kho cá nhân của bạn.");
            }
            if (!"KHA_DUNG".equals(item.status())) {
                throw new AuthFailure(
                        409,
                        "ITEM_STATUS_CONFLICT",
                        "Đồ vật đang ở trạng thái " + item.status() + ", không thể đăng/cập nhật tin."
                );
            }
        }
    }

    private List<UUID> loadLinkedItemIds(UUID listingId) {
        return db.queryForList(
                "SELECT ma_vat FROM tin_dang_do_vat WHERE ma_tin = ? ORDER BY ma_vat ASC",
                UUID.class,
                listingId
        );
    }

    private void insertListing(
            UUID listingId,
            UUID sellerId,
            ValidatedFields fields,
            String listingType,
            String status,
            Instant publishedAt,
            Instant expiresAt,
            Instant now
    ) {
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                    INSERT INTO tin_dangs (
                        ma_tin, nguoi_dang_id, tieu_de, mo_ta, tinh_trang, gia_vnd, hinh_anh,
                        khu_vuc, ma_khu_vuc, vi_do, kinh_do, ma_danh_muc, ma_mon_hoc, ten_mon_hoc, tac_gia,
                        hinh_thuc, trang_thai, published_at, expires_at, renewal_reminded_at, closed_at,
                        so_lan_gia_han, created_at, updated_at, version
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, 0)
                    """
            );
            ps.setObject(1, listingId);
            ps.setObject(2, sellerId);
            ps.setString(3, fields.title());
            ps.setString(4, fields.description());
            ps.setString(5, fields.condition());
            ps.setInt(6, fields.priceVnd());
            ps.setArray(7, con.createArrayOf("text", fields.images().toArray(new String[0])));
            ps.setString(8, fields.locationText());
            ps.setString(9, fields.locationCode());
            setNullableDouble(ps, 10, fields.latitude());
            setNullableDouble(ps, 11, fields.longitude());
            ps.setString(12, fields.categoryId());
            ps.setString(13, fields.courseCode());
            ps.setString(14, fields.courseName());
            ps.setString(15, fields.author());
            ps.setString(16, listingType);
            ps.setString(17, status);
            ps.setTimestamp(18, toTimestamp(publishedAt));
            ps.setTimestamp(19, toTimestamp(expiresAt));
            ps.setTimestamp(20, Timestamp.from(now));
            ps.setTimestamp(21, Timestamp.from(now));
            return ps;
        });
    }

    private int updateListingRow(
            UUID listingId,
            UUID sellerId,
            long expectedVersion,
            ValidatedFields fields,
            String listingType,
            String nextStatus,
            Instant publishedAt,
            Instant expiresAt,
            Instant renewalRemindedAt,
            Instant closedAt,
            Instant now
    ) {
        return db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                    UPDATE tin_dangs
                    SET tieu_de = ?,
                        mo_ta = ?,
                        tinh_trang = ?,
                        gia_vnd = ?,
                        hinh_anh = ?,
                        khu_vuc = ?,
                        ma_khu_vuc = ?,
                        vi_do = ?,
                        kinh_do = ?,
                        ma_danh_muc = ?,
                        ma_mon_hoc = ?,
                        ten_mon_hoc = ?,
                        tac_gia = ?,
                        hinh_thuc = ?,
                        trang_thai = ?,
                        published_at = ?,
                        expires_at = ?,
                        renewal_reminded_at = ?,
                        closed_at = ?,
                        updated_at = ?,
                        version = version + 1
                    WHERE ma_tin = ? AND nguoi_dang_id = ? AND version = ?
                    """
            );
            ps.setString(1, fields.title());
            ps.setString(2, fields.description());
            ps.setString(3, fields.condition());
            ps.setInt(4, fields.priceVnd());
            ps.setArray(5, con.createArrayOf("text", fields.images().toArray(new String[0])));
            ps.setString(6, fields.locationText());
            ps.setString(7, fields.locationCode());
            setNullableDouble(ps, 8, fields.latitude());
            setNullableDouble(ps, 9, fields.longitude());
            ps.setString(10, fields.categoryId());
            ps.setString(11, fields.courseCode());
            ps.setString(12, fields.courseName());
            ps.setString(13, fields.author());
            ps.setString(14, listingType);
            ps.setString(15, nextStatus);
            ps.setTimestamp(16, toTimestamp(publishedAt));
            ps.setTimestamp(17, toTimestamp(expiresAt));
            ps.setTimestamp(18, toTimestamp(renewalRemindedAt));
            ps.setTimestamp(19, toTimestamp(closedAt));
            ps.setTimestamp(20, Timestamp.from(now));
            ps.setObject(21, listingId);
            ps.setObject(22, sellerId);
            ps.setLong(23, expectedVersion);
            return ps;
        });
    }

    private void insertListingItems(UUID listingId, List<UUID> itemIds) {
        for (UUID itemId : itemIds) {
            db.update(
                    "INSERT INTO tin_dang_do_vat (ma_tin, ma_vat) VALUES (?, ?)",
                    listingId,
                    itemId
            );
        }
    }

    private Set<UUID> syncListingItems(UUID listingId, List<UUID> oldItemIds, List<UUID> newItemIds) {
        Set<UUID> oldSet = Set.copyOf(oldItemIds);
        Set<UUID> newSet = Set.copyOf(newItemIds);

        List<UUID> removed = oldItemIds.stream().filter(id -> !newSet.contains(id)).toList();
        List<UUID> added = newItemIds.stream().filter(id -> !oldSet.contains(id)).toList();

        if (!removed.isEmpty()) {
            db.update(con -> {
                PreparedStatement ps = con.prepareStatement(
                        "DELETE FROM tin_dang_do_vat WHERE ma_tin = ? AND ma_vat = ANY(?)"
                );
                ps.setObject(1, listingId);
                ps.setArray(2, con.createArrayOf("uuid", removed.toArray(new UUID[0])));
                return ps;
            });
        }
        if (!added.isEmpty()) {
            insertListingItems(listingId, added);
        }

        LinkedHashSet<UUID> affected = new LinkedHashSet<>(removed);
        affected.addAll(added);
        return affected;
    }

    private void bumpItemsVersion(Collection<UUID> itemIds, Instant now) {
        if (itemIds == null || itemIds.isEmpty()) {
            return;
        }
        UUID[] sorted = itemIds.stream()
                .distinct()
                .sorted(Comparator.comparing(UUID::toString))
                .toArray(UUID[]::new);
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "UPDATE do_vats SET version = version + 1, updated_at = ? WHERE ma_vat = ANY(?)"
            );
            ps.setTimestamp(1, Timestamp.from(now));
            ps.setArray(2, con.createArrayOf("uuid", sorted));
            return ps;
        });
    }

    private long countSellerListings(UUID sellerId, String statusFilter) {
        List<Object> params = new ArrayList<>();
        params.add(sellerId);
        String sql = "SELECT COUNT(*) FROM tin_dangs WHERE nguoi_dang_id = ?";
        if (statusFilter != null) {
            sql += " AND trang_thai = ?";
            params.add(statusFilter);
        }
        Long total = db.queryForObject(sql, Long.class, params.toArray());
        return total != null ? total : 0L;
    }

    private static void setNullableDouble(PreparedStatement ps, int index, Double value) throws java.sql.SQLException {
        if (value == null) {
            ps.setNull(index, Types.DOUBLE);
        } else {
            ps.setDouble(index, value);
        }
    }

    private static Timestamp toTimestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}
