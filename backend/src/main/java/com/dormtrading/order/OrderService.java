package com.dormtrading.order;

import com.dormtrading.catalog.ListingDtos;
import com.dormtrading.catalog.ListingLifecycleHelper;
import com.dormtrading.catalog.ListingValidation;
import com.dormtrading.iam.auth.AccountRestrictedFailure;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.review.reputation.ReputationLedgerService;
import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
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
 * P2-04 & P2-05 Order Reservation, Scheduling & Start-Delivery Service
 * (UC-22, UC-23, UC-24, UC-25, UC-26; FR-04, FR-07, FR-08, FR-09, FR-12, NFR-01, NFR-02, NFR-03).
 *
 * <p>Uses plain {@code @Transactional} (full rollback on {@link AuthFailure}) and enforces strict
 * global lock ordering compatible with {@code ListingService} and {@code InventoryService}:
 * (1) {@code thanh_viens (sellerId)} -> (2) {@code tin_dangs (listingId)} -> (3) {@code giao_dichs (orderId)}
 * -> (4) {@code do_vats (ORDER BY ma_vat ASC)}.
 */
@Service
@Transactional
public class OrderService {

    private static final int MAX_LOCATION_LENGTH = 255;
    private static final int MAX_NOTE_LENGTH = 1000;
    private static final int MAX_SCHEDULE_NOTE_LENGTH = 500;
    private static final int MAX_REASON_LENGTH = 1000;

    private static final Set<String> PRE_DELIVERY_RESERVED_STATUSES = Set.of(
            OrderDtos.OrderStatus.GIU_CHO.name(),
            OrderDtos.OrderStatus.DANG_GIAO.name()
    );

    private static final Set<String> POST_DELIVERY_PENDING_STATUSES = Set.of(
            OrderDtos.OrderStatus.CHO_XAC_NHAN.name(),
            OrderDtos.OrderStatus.CHO_XU_LY.name()
    );

    private final JdbcTemplate db;
    private final Clock clock;
    private final ReputationLedgerService reputationLedger;
    private final OrderNotificationService notificationService;

    public OrderService(
            JdbcTemplate db,
            Clock clock,
            ReputationLedgerService reputationLedger,
            OrderNotificationService notificationService
    ) {
        this.db = db;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.reputationLedger = reputationLedger;
        this.notificationService = notificationService;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private record LockedListing(
            UUID id,
            UUID sellerId,
            String title,
            int priceVnd,
            String listingType,
            String status,
            Instant expiresAt,
            long version
    ) {
    }

    private record LockedOrder(
            UUID id,
            UUID listingId,
            UUID sellerId,
            UUID buyerId,
            int agreedPriceVnd,
            String status,
            String note,
            boolean scheduleConfirmed,
            Instant meetingTime,
            String meetingLocation,
            Instant proposedMeetingTime,
            String proposedMeetingLocation,
            UUID cancelledById,
            String cancelReason,
            Instant createdAt,
            Instant reservedAt,
            Instant deliveryStartedAt,
            Instant reportedDeliveredAt,
            Instant completedAt,
            Instant cancelledAt,
            Instant updatedAt,
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

    private record OrderLookup(UUID orderId, UUID listingId, UUID sellerId, UUID buyerId) {
    }

    private record ScheduleProposalRow(
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
            Instant createdAt
    ) {
    }

    // =========================================================================
    // UC-22: Gửi yêu cầu giữ chỗ
    // =========================================================================

    public OrderDtos.OrderDetailDto createReservationRequest(UUID buyerId, OrderDtos.CreateOrderRequest req) {
        if (req == null || req.listingId() == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Vui lòng chọn tin đăng cần gửi yêu cầu giữ chỗ.");
        }
        Instant current = now();
        verifyActiveMemberReadOnly(buyerId);

        String proposedLocation = ListingValidation.optionalText(
                req.proposedMeetingLocation(),
                MAX_LOCATION_LENGTH,
                "Địa điểm hẹn dự kiến không được vượt quá 255 ký tự."
        );
        String note = ListingValidation.optionalText(
                req.note(),
                MAX_NOTE_LENGTH,
                "Ghi chú yêu cầu không được vượt quá 1000 ký tự."
        );
        if (req.proposedMeetingTime() != null && req.proposedMeetingTime().isBefore(current)) {
            throw new AuthFailure(400, "INVALID_MEETING_TIME", "Thời gian hẹn dự kiến không được ở quá khứ.");
        }

        // Lock order: tin_dangs -> do_vats (ORDER BY ma_vat ASC)
        LockedListing listing = lockListingForUpdate(req.listingId());

        if (listing.sellerId().equals(buyerId)) {
            throw new AuthFailure(400, "SELF_RESERVATION_NOT_ALLOWED", "Bạn không thể tự gửi yêu cầu giữ chỗ cho tin đăng của chính mình.");
        }

        if (ListingDtos.ListingStatus.GIU_CHO.name().equals(listing.status())) {
            throw new AuthFailure(409, "LISTING_ALREADY_RESERVED", "Tin đăng này hiện đã được giữ chỗ cho một giao dịch khác.");
        }
        if (!ListingDtos.ListingStatus.CONG_KHAI.name().equals(listing.status())
                || ListingLifecycleHelper.isExpired(listing.status(), listing.expiresAt(), current)) {
            throw new AuthFailure(409, "LISTING_NOT_AVAILABLE", "Tin đăng không còn khả dụng để gửi yêu cầu giữ chỗ.");
        }

        if (countActiveReservationsForListing(listing.id()) > 0) {
            throw new AuthFailure(409, "LISTING_ALREADY_RESERVED", "Tin đăng này hiện đang có giữ chỗ hiệu lực.");
        }

        int agreedPrice = req.agreedPriceVnd() != null ? req.agreedPriceVnd() : listing.priceVnd();
        if (agreedPrice < 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Giá thỏa thuận không được âm.");
        }
        if (listing.priceVnd() == 0 && agreedPrice != 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Tin cho tặng miễn phí chỉ áp dụng mức giá 0đ.");
        }

        List<UUID> itemIds = findListingItemIdsSorted(listing.id());
        if (itemIds.isEmpty()) {
            throw new AuthFailure(409, "LISTING_NOT_AVAILABLE", "Tin đăng chưa có đồ vật khả dụng để giữ chỗ.");
        }

        List<LockedItem> lockedItems = lockItemsSorted(itemIds);
        if (lockedItems.size() != itemIds.size()) {
            throw new AuthFailure(409, "ITEM_NOT_AVAILABLE", "Một hoặc nhiều đồ vật trong tin không còn tồn tại.");
        }
        for (LockedItem item : lockedItems) {
            if (!"KHA_DUNG".equals(item.status()) || hasActiveItemHold(item.id())) {
                throw new AuthFailure(
                        409,
                        "ITEM_NOT_AVAILABLE",
                        "Một hoặc nhiều đồ vật thuộc tin này đã được giữ chỗ hoặc chuyển giao qua giao dịch khác."
                );
            }
        }

        UUID orderId = UUID.randomUUID();
        Timestamp tsNow = Timestamp.from(current);
        Timestamp tsProposed = req.proposedMeetingTime() != null ? Timestamp.from(req.proposedMeetingTime()) : null;

        try {
            db.update(
                    """
                    INSERT INTO giao_dichs(
                        ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan,
                        thoi_gian_hen_du_kien, dia_diem_hen_du_kien, ghi_chu,
                        lich_hen_da_xac_nhan, trang_thai, thoi_diem_tao, updated_at, version
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, 'YEU_CAU', ?, ?, 0)
                    """,
                    orderId,
                    listing.id(),
                    listing.sellerId(),
                    buyerId,
                    agreedPrice,
                    tsProposed,
                    proposedLocation,
                    note,
                    tsNow,
                    tsNow
            );
        } catch (DataIntegrityViolationException ex) {
            throw new AuthFailure(
                    409,
                    "DUPLICATE_PENDING_REQUEST",
                    "Bạn đã có yêu cầu giữ chỗ đang chờ phản hồi cho tin đăng này."
            );
        }

        // Snapshot all items of the listing (combo included as whole set, giu_hieu_luc = FALSE until UC-23 accept)
        replaceOrderItems(orderId, itemIds, false);

        String buyerName = loadDisplayName(buyerId);
        notificationService.notifyUser(
                listing.sellerId(),
                OrderDtos.NotificationType.RESERVATION_REQUESTED,
                "Có yêu cầu giữ chỗ mới",
                buyerName + " vừa gửi yêu cầu giữ chỗ cho tin \"" + listing.title() + "\".",
                listing.id(),
                orderId
        );

        return loadOrderDetail(buyerId, orderId);
    }

    // =========================================================================
    // UC-23: Chấp nhận & Từ chối giữ chỗ
    // =========================================================================

    public OrderDtos.OrderDetailDto acceptReservation(UUID sellerId, UUID orderId, OrderDtos.AcceptOrderRequest req) {
        Instant current = now();
        OrderLookup lookup = lookupOrderOrThrow(orderId);
        if (!lookup.sellerId().equals(sellerId)) {
            throw new AuthFailure(403, "FORBIDDEN", "Chỉ người bán của tin đăng mới có quyền chấp nhận giữ chỗ.");
        }

        // Strict global lock order: (1) thanh_viens(seller) -> (2) tin_dangs -> (3) giao_dichs -> (4) do_vats ASC
        lockAndVerifyActiveSeller(sellerId);
        LockedListing listing = lockListingForUpdate(lookup.listingId());
        LockedOrder order = lockOrderForUpdate(orderId);

        // UC-23 E4 / NFR-03: Idempotent replay if already accepted into GIU_CHO
        if (OrderDtos.OrderStatus.GIU_CHO.name().equals(order.status())) {
            return loadOrderDetail(sellerId, orderId);
        }

        if (!OrderDtos.OrderStatus.YEU_CAU.name().equals(order.status())) {
            throw new AuthFailure(
                    409,
                    "ORDER_NOT_PENDING",
                    "Yêu cầu giữ chỗ không còn ở trạng thái chờ phản hồi (hiện tại: " + order.status() + ")."
            );
        }

        if (req != null && req.expectedVersion() != null && req.expectedVersion() != order.version()) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Giao dịch vừa được cập nhật. Vui lòng tải lại trước khi thao tác.");
        }

        if (ListingDtos.ListingStatus.GIU_CHO.name().equals(listing.status())) {
            throw new AuthFailure(409, "LISTING_ALREADY_RESERVED", "Tin đăng đã được giữ chỗ cho một giao dịch khác.");
        }
        if (!ListingDtos.ListingStatus.CONG_KHAI.name().equals(listing.status())
                || ListingLifecycleHelper.isExpired(listing.status(), listing.expiresAt(), current)) {
            throw new AuthFailure(409, "LISTING_NOT_AVAILABLE", "Tin đăng không còn đủ điều kiện công khai để chấp nhận giữ chỗ.");
        }
        if (countActiveReservationsForListing(listing.id()) > 0) {
            throw new AuthFailure(409, "LISTING_ALREADY_RESERVED", "Tin đăng đang có một giữ chỗ hợp lệ khác.");
        }

        int finalPrice = (req != null && req.agreedPriceVnd() != null)
                ? req.agreedPriceVnd()
                : order.agreedPriceVnd();
        if (finalPrice < 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Giá thỏa thuận không được âm.");
        }
        if (listing.priceVnd() == 0 && finalPrice != 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Tin cho tặng miễn phí chỉ chấp nhận mức giá thỏa thuận 0đ.");
        }

        // Lock ALL current items of the listing atomically (combo all-or-nothing, UC-23 E2/E3)
        List<UUID> itemIds = findListingItemIdsSorted(listing.id());
        if (itemIds.isEmpty()) {
            throw new AuthFailure(409, "LISTING_NOT_AVAILABLE", "Tin đăng không còn đồ vật hợp lệ để giữ chỗ.");
        }

        List<LockedItem> lockedItems = lockItemsSorted(itemIds);
        if (lockedItems.size() != itemIds.size()) {
            throw new AuthFailure(409, "ITEM_ALREADY_RESERVED", "Một hoặc nhiều đồ vật trong tin không còn tồn tại.");
        }
        for (LockedItem item : lockedItems) {
            if (!item.ownerId().equals(sellerId)) {
                throw new AuthFailure(403, "FORBIDDEN", "Đồ vật trong tin không thuộc quyền sở hữu của người bán.");
            }
            if (!"KHA_DUNG".equals(item.status()) || hasActiveItemHold(item.id())) {
                throw new AuthFailure(
                        409,
                        "ITEM_ALREADY_RESERVED",
                        "Một hoặc nhiều đồ vật đã được giữ chỗ hoặc chuyển giao qua tin đăng khác. Không thể giữ một phần combo."
                );
            }
        }

        Timestamp tsNow = Timestamp.from(current);
        try {
            // 1. Mark all items DANG_GIU + bump version
            UUID[] itemArray = itemIds.toArray(new UUID[0]);
            db.update(con -> {
                PreparedStatement ps = con.prepareStatement(
                        "UPDATE do_vats SET trang_thai = 'DANG_GIU', version = version + 1, updated_at = ? WHERE ma_vat = ANY(?)"
                );
                ps.setTimestamp(1, tsNow);
                ps.setArray(2, con.createArrayOf("uuid", itemArray));
                return ps;
            });

            // 2. Mark listing GIU_CHO + bump version
            db.update(
                    "UPDATE tin_dangs SET trang_thai = 'GIU_CHO', version = version + 1, updated_at = ? WHERE ma_tin = ?",
                    tsNow,
                    listing.id()
            );

            // 3. Record active hold snapshot in giao_dich_do_vat (enforced by uq_giao_dich_do_vat_active_item)
            replaceOrderItems(orderId, itemIds, true);

            // 4. Transition order to GIU_CHO (enforced by uq_giao_dichs_active_listing)
            db.update(
                    """
                    UPDATE giao_dichs
                    SET trang_thai = 'GIU_CHO',
                        gia_thoa_thuan = ?,
                        thoi_diem_giu_cho = ?,
                        updated_at = ?,
                        version = version + 1
                    WHERE ma_giao_dich = ?
                    """,
                    finalPrice,
                    tsNow,
                    tsNow,
                    orderId
            );
        } catch (DataIntegrityViolationException ex) {
            throw new AuthFailure(
                    409,
                    "ITEM_ALREADY_RESERVED",
                    "Tin đăng hoặc đồ vật vừa được giữ chỗ bởi giao dịch đồng thời khác."
            );
        }

        // If buyer included both proposed time and location in UC-22, seed an initial pending proposal
        // (still CHO_XAC_NHAN — seller must confirm explicitly in UC-25; one-sided proposal is NOT confirmed).
        if (order.proposedMeetingTime() != null
                && order.proposedMeetingLocation() != null
                && !order.proposedMeetingLocation().isBlank()) {
            db.update(
                    """
                    INSERT INTO lich_hen_giao_dichs(
                        ma_giao_dich, nguoi_de_xuat_id, thoi_gian_de_xuat, dia_diem_de_xuat,
                        ghi_chu, trang_thai, created_at
                    ) VALUES (?, ?, ?, ?, ?, 'CHO_XAC_NHAN', ?)
                    """,
                    orderId,
                    order.buyerId(),
                    Timestamp.from(order.proposedMeetingTime()),
                    order.proposedMeetingLocation(),
                    order.note(),
                    tsNow
            );
        }

        notificationService.notifyUser(
                order.buyerId(),
                OrderDtos.NotificationType.RESERVATION_ACCEPTED,
                "Yêu cầu giữ chỗ đã được chấp nhận",
                "Người bán đã chấp nhận giữ chỗ cho tin \"" + listing.title() + "\". Hai bên có thể thống nhất thời gian và địa điểm giao nhận.",
                listing.id(),
                orderId
        );

        return loadOrderDetail(sellerId, orderId);
    }

    public OrderDtos.OrderDetailDto rejectReservation(UUID sellerId, UUID orderId, OrderDtos.RejectOrderRequest req) {
        Instant current = now();
        OrderLookup lookup = lookupOrderOrThrow(orderId);
        if (!lookup.sellerId().equals(sellerId)) {
            throw new AuthFailure(403, "FORBIDDEN", "Chỉ người bán của tin đăng mới có quyền từ chối yêu cầu giữ chỗ.");
        }

        String reason = req != null
                ? ListingValidation.optionalText(req.reason(), MAX_REASON_LENGTH, "Lý do từ chối không được vượt quá 1000 ký tự.")
                : null;

        lockAndVerifyActiveSeller(sellerId);
        LockedListing listing = lockListingForUpdate(lookup.listingId());
        LockedOrder order = lockOrderForUpdate(orderId);

        if (!OrderDtos.OrderStatus.YEU_CAU.name().equals(order.status())) {
            throw new AuthFailure(
                    409,
                    "ORDER_NOT_PENDING",
                    "Chỉ có thể từ chối yêu cầu đang ở trạng thái chờ phản hồi (hiện tại: " + order.status() + ")."
            );
        }
        if (req != null && req.expectedVersion() != null && req.expectedVersion() != order.version()) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Yêu cầu giữ chỗ vừa được cập nhật. Vui lòng tải lại.");
        }

        Timestamp tsNow = Timestamp.from(current);
        db.update(
                """
                UPDATE giao_dichs
                SET trang_thai = 'HUY',
                    nguoi_huy_id = ?,
                    ly_do_huy = ?,
                    thoi_diem_huy = ?,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_giao_dich = ?
                """,
                sellerId,
                reason != null ? reason : "Người bán từ chối yêu cầu giữ chỗ.",
                tsNow,
                tsNow,
                orderId
        );

        notificationService.notifyUser(
                order.buyerId(),
                OrderDtos.NotificationType.RESERVATION_REJECTED,
                "Yêu cầu giữ chỗ không được chấp nhận",
                "Người bán đã từ chối yêu cầu giữ chỗ cho tin \"" + listing.title() + "\"."
                        + (reason != null ? " Lý do: " + reason : ""),
                listing.id(),
                orderId
        );

        return loadOrderDetail(sellerId, orderId);
    }

    // =========================================================================
    // UC-24: Hủy giữ chỗ (trước mốc báo đã giao tại UC-27)
    // =========================================================================

    public OrderDtos.OrderDetailDto cancelReservation(UUID userId, UUID orderId, OrderDtos.CancelOrderRequest req) {
        Instant current = now();
        OrderLookup lookup = lookupOrderOrThrow(orderId);
        boolean isSeller = lookup.sellerId().equals(userId);
        boolean isBuyer = lookup.buyerId().equals(userId);
        if (!isSeller && !isBuyer) {
            throw new AuthFailure(403, "FORBIDDEN", "Bạn không thuộc giao dịch này nên không thể hủy giữ chỗ.");
        }

        String reason = req != null
                ? ListingValidation.optionalText(req.reason(), MAX_REASON_LENGTH, "Lý do hủy không được vượt quá 1000 ký tự.")
                : null;

        // Verify caller account status without breaking lock ordering
        if (isSeller) {
            lockAndVerifyActiveSeller(lookup.sellerId());
        } else {
            verifyActiveMemberReadOnly(userId);
            lockSellerRowOnly(lookup.sellerId());
        }

        LockedListing listing = lockListingForUpdate(lookup.listingId());
        LockedOrder order = lockOrderForUpdate(orderId);

        // UC-24 E2: Already cancelled -> return current state without releasing items again
        if (OrderDtos.OrderStatus.HUY.name().equals(order.status())) {
            return loadOrderDetail(userId, orderId);
        }

        // UC-24 E2: Already completed
        if (OrderDtos.OrderStatus.HOAN_TAT.name().equals(order.status())) {
            throw new AuthFailure(409, "ORDER_ALREADY_COMPLETED", "Giao dịch đã hoàn tất, không thể hủy giữ chỗ.");
        }

        // UC-24 A2 / E4: Post-delivery reported in UC-27 -> must use UC-28 flow!
        if (POST_DELIVERY_PENDING_STATUSES.contains(order.status()) || order.reportedDeliveredAt() != null) {
            throw new AuthFailure(
                    409,
                    "POST_DELIVERY_CANCELLATION_REQUIRED",
                    "Người bán đã báo đã giao kèm bằng chứng (UC-27). Không thể tự hủy giữ chỗ; vui lòng dùng luồng yêu cầu hủy sau báo giao (UC-28)."
            );
        }

        if (req != null && req.expectedVersion() != null && req.expectedVersion() != order.version()) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Giao dịch vừa được cập nhật. Vui lòng tải lại trước khi hủy.");
        }

        Timestamp tsNow = Timestamp.from(current);

        // Case 1: Buyer withdraws their own pending YEU_CAU (or seller cancels YEU_CAU) before acceptance
        if (OrderDtos.OrderStatus.YEU_CAU.name().equals(order.status())) {
            db.update(
                    """
                    UPDATE giao_dichs
                    SET trang_thai = 'HUY',
                        nguoi_huy_id = ?,
                        ly_do_huy = ?,
                        thoi_diem_huy = ?,
                        updated_at = ?,
                        version = version + 1
                    WHERE ma_giao_dich = ?
                    """,
                    userId,
                    reason != null ? reason : (isBuyer ? "Người mua rút yêu cầu giữ chỗ." : "Người bán hủy yêu cầu giữ chỗ."),
                    tsNow,
                    tsNow,
                    orderId
            );

            UUID recipientId = isBuyer ? order.sellerId() : order.buyerId();
            notificationService.notifyUser(
                    recipientId,
                    OrderDtos.NotificationType.RESERVATION_CANCELLED,
                    isBuyer ? "Người mua đã rút yêu cầu giữ chỗ" : "Yêu cầu giữ chỗ đã bị hủy",
                    (isBuyer ? "Người mua đã rút yêu cầu" : "Người bán đã hủy yêu cầu")
                            + " đối với tin \"" + listing.title() + "\".",
                    listing.id(),
                    orderId
            );

            return loadOrderDetail(userId, orderId);
        }

        // Case 2: Active pre-delivery reservation (GIU_CHO or DANG_GIAO with thoi_diem_bao_giao IS NULL — UC-24 A3)
        List<UUID> orderItemIds = findOrderItemIdsSorted(orderId, listing.id());
        List<LockedItem> lockedItems = lockItemsSorted(orderItemIds);

        // 1. Mark order HUY & deactivate its item holds
        db.update(
                """
                UPDATE giao_dichs
                SET trang_thai = 'HUY',
                    nguoi_huy_id = ?,
                    ly_do_huy = ?,
                    thoi_diem_huy = ?,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_giao_dich = ?
                """,
                userId,
                reason != null ? reason : "Hủy giữ chỗ trước khi bàn giao.",
                tsNow,
                tsNow,
                orderId
        );
        db.update(
                "UPDATE giao_dich_do_vat SET giu_hieu_luc = FALSE WHERE ma_giao_dich = ?",
                orderId
        );
        db.update(
                "UPDATE lich_hen_giao_dichs SET trang_thai = 'DA_THAY_THE' WHERE ma_giao_dich = ? AND trang_thai = 'CHO_XAC_NHAN'",
                orderId
        );

        // 2. UC-24 Step 6 & E3: Release each item to KHA_DUNG ONLY if currently DANG_GIU and no other active hold exists
        List<UUID> itemsToRelease = new ArrayList<>();
        for (LockedItem item : lockedItems) {
            if ("DANG_GIU".equals(item.status()) && !hasActiveItemHold(item.id())) {
                itemsToRelease.add(item.id());
            }
        }
        if (!itemsToRelease.isEmpty()) {
            UUID[] releaseArr = itemsToRelease.toArray(new UUID[0]);
            db.update(con -> {
                PreparedStatement ps = con.prepareStatement(
                        "UPDATE do_vats SET trang_thai = 'KHA_DUNG', version = version + 1, updated_at = ? WHERE ma_vat = ANY(?) AND trang_thai = 'DANG_GIU'"
                );
                ps.setTimestamp(1, tsNow);
                ps.setArray(2, con.createArrayOf("uuid", releaseArr));
                return ps;
            });
        }

        // 3. UC-24 Step 6: Update listing status only if currently GIU_CHO (respect FR-13 expiry & do not overwrite AN/KET_THUC)
        if (ListingDtos.ListingStatus.GIU_CHO.name().equals(listing.status())
                && countActiveReservationsForListing(listing.id()) == 0) {
            boolean expired = listing.expiresAt() != null && !current.isBefore(listing.expiresAt());
            if (expired) {
                db.update(
                        "UPDATE tin_dangs SET trang_thai = 'HET_HAN', closed_at = ?, updated_at = ?, version = version + 1 WHERE ma_tin = ?",
                        tsNow,
                        tsNow,
                        listing.id()
                );
            } else if (areAllListingItemsAvailable(listing.id())) {
                db.update(
                        "UPDATE tin_dangs SET trang_thai = 'CONG_KHAI', updated_at = ?, version = version + 1 WHERE ma_tin = ?",
                        tsNow,
                        listing.id()
                );
            }
        }

        UUID counterpartyId = isBuyer ? order.sellerId() : order.buyerId();
        String actorLabel = isBuyer ? "Người mua" : "Người bán";
        notificationService.notifyUser(
                counterpartyId,
                OrderDtos.NotificationType.RESERVATION_CANCELLED,
                "Giữ chỗ đã bị hủy",
                actorLabel + " đã hủy giữ chỗ cho tin \"" + listing.title() + "\"."
                        + (reason != null ? " Lý do: " + reason : ""),
                listing.id(),
                orderId
        );

        return loadOrderDetail(userId, orderId);
    }

    // =========================================================================
    // UC-25: Xác nhận thời gian, địa điểm giao dịch (đề xuất / xác nhận / từ chối)
    // =========================================================================

    public OrderDtos.OrderDetailDto proposeSchedule(UUID userId, UUID orderId, OrderDtos.ProposeScheduleRequest req) {
        if (req == null || req.proposedTime() == null || req.proposedLocation() == null || req.proposedLocation().isBlank()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Vui lòng nhập đầy đủ thời gian và địa điểm giao nhận.");
        }
        Instant current = now();
        if (req.proposedTime().isBefore(current)) {
            throw new AuthFailure(400, "INVALID_MEETING_TIME", "Thời gian hẹn giao nhận không được ở quá khứ.");
        }
        String location = ListingValidation.requiredText(
                req.proposedLocation(),
                MAX_LOCATION_LENGTH,
                "Địa điểm giao nhận không được để trống.",
                "Địa điểm giao nhận không được vượt quá 255 ký tự."
        );
        String note = ListingValidation.optionalText(
                req.note(),
                MAX_SCHEDULE_NOTE_LENGTH,
                "Ghi chú lịch hẹn không được vượt quá 500 ký tự."
        );

        OrderLookup lookup = lookupOrderOrThrow(orderId);
        boolean isBuyer = lookup.buyerId().equals(userId);
        boolean isSeller = lookup.sellerId().equals(userId);
        if (!isBuyer && !isSeller) {
            throw new AuthFailure(403, "FORBIDDEN", "Bạn không thuộc giao dịch này nên không thể đề xuất lịch hẹn.");
        }

        verifyActiveMemberReadOnly(userId);
        LockedOrder order = lockOrderForUpdate(orderId);

        // UC-25 E2: Must be active pre-delivery reservation (GIU_CHO or DANG_GIAO with thoi_diem_bao_giao IS NULL)
        if (!PRE_DELIVERY_RESERVED_STATUSES.contains(order.status()) || order.reportedDeliveredAt() != null) {
            throw new AuthFailure(
                    409,
                    "INVALID_ORDER_STATE",
                    "Chỉ có thể đề xuất hoặc đổi lịch hẹn khi giao dịch đang giữ chỗ và chưa báo đã giao."
            );
        }
        if (req.expectedVersion() != null && req.expectedVersion() != order.version()) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Giao dịch vừa được cập nhật. Vui lòng tải lại.");
        }

        Timestamp tsNow = Timestamp.from(current);
        // Supersede any existing pending proposal (UC-25 A1 / A3)
        db.update(
                "UPDATE lich_hen_giao_dichs SET trang_thai = 'DA_THAY_THE' WHERE ma_giao_dich = ? AND trang_thai = 'CHO_XAC_NHAN'",
                orderId
        );

        // Insert new proposal (CHO_XAC_NHAN — does NOT mark lich_hen_da_xac_nhan = TRUE until the other party confirms!)
        db.update(
                """
                INSERT INTO lich_hen_giao_dichs(
                    ma_giao_dich, nguoi_de_xuat_id, thoi_gian_de_xuat, dia_diem_de_xuat,
                    ghi_chu, trang_thai, created_at
                ) VALUES (?, ?, ?, ?, ?, 'CHO_XAC_NHAN', ?)
                """,
                orderId,
                userId,
                Timestamp.from(req.proposedTime()),
                location,
                note,
                tsNow
        );

        db.update(
                "UPDATE giao_dichs SET updated_at = ?, version = version + 1 WHERE ma_giao_dich = ?",
                tsNow,
                orderId
        );

        UUID counterpartyId = isBuyer ? order.sellerId() : order.buyerId();
        String proposerRole = isBuyer ? "Người mua" : "Người bán";
        notificationService.notifyUser(
                counterpartyId,
                OrderDtos.NotificationType.SCHEDULE_PROPOSED,
                order.scheduleConfirmed() ? "Có đề xuất đổi lịch giao nhận" : "Có đề xuất lịch giao nhận mới",
                proposerRole + " đề xuất giao nhận tại " + location + ". Vui lòng xem và xác nhận.",
                order.listingId(),
                orderId
        );

        return loadOrderDetail(userId, orderId);
    }

    public OrderDtos.OrderDetailDto confirmSchedule(UUID userId, UUID orderId, UUID proposalId) {
        Instant current = now();
        OrderLookup lookup = lookupOrderOrThrow(orderId);
        boolean isBuyer = lookup.buyerId().equals(userId);
        boolean isSeller = lookup.sellerId().equals(userId);
        if (!isBuyer && !isSeller) {
            throw new AuthFailure(403, "FORBIDDEN", "Bạn không thuộc giao dịch này nên không thể xác nhận lịch hẹn.");
        }

        verifyActiveMemberReadOnly(userId);
        LockedOrder order = lockOrderForUpdate(orderId);

        if (!PRE_DELIVERY_RESERVED_STATUSES.contains(order.status()) || order.reportedDeliveredAt() != null) {
            throw new AuthFailure(
                    409,
                    "INVALID_ORDER_STATE",
                    "Giao dịch không còn ở trạng thái cho phép xác nhận lịch hẹn trước khi giao."
            );
        }

        ScheduleProposalRow proposal = lockProposalForUpdate(orderId, proposalId);

        // UC-25 A1: Proposer cannot confirm their own proposal!
        if (proposal.proposedById().equals(userId)) {
            throw new AuthFailure(
                    403,
                    "CANNOT_CONFIRM_OWN_PROPOSAL",
                    "Bạn không thể tự xác nhận đề xuất lịch hẹn của chính mình. Vui lòng chờ bên còn lại xác nhận."
            );
        }

        // Idempotent replay if already confirmed by the counterparty
        if (OrderDtos.ScheduleProposalStatus.DA_XAC_NHAN.name().equals(proposal.status())) {
            return loadOrderDetail(userId, orderId);
        }

        // UC-25 E3: Stale or rejected proposal cannot be confirmed
        if (!OrderDtos.ScheduleProposalStatus.CHO_XAC_NHAN.name().equals(proposal.status())) {
            throw new AuthFailure(
                    409,
                    "PROPOSAL_STALE",
                    "Đề xuất lịch hẹn này đã bị thay thế hoặc từ chối. Vui lòng tải lại để xem đề xuất mới nhất."
            );
        }

        Timestamp tsNow = Timestamp.from(current);
        db.update(
                """
                UPDATE lich_hen_giao_dichs
                SET trang_thai = 'DA_XAC_NHAN',
                    nguoi_phan_hoi_id = ?,
                    thoi_diem_phan_hoi = ?
                WHERE id = ?
                """,
                userId,
                tsNow,
                proposalId
        );

        db.update(
                """
                UPDATE giao_dichs
                SET thoi_gian_hen = ?,
                    dia_diem_hen = ?,
                    lich_hen_da_xac_nhan = TRUE,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_giao_dich = ?
                """,
                Timestamp.from(proposal.proposedTime()),
                proposal.proposedLocation(),
                tsNow,
                orderId
        );

        notificationService.notifyUser(
                proposal.proposedById(),
                OrderDtos.NotificationType.SCHEDULE_CONFIRMED,
                "Lịch hẹn giao nhận đã được thống nhất",
                "Đối tác đã xác nhận lịch giao nhận tại " + proposal.proposedLocation() + ".",
                order.listingId(),
                orderId
        );

        return loadOrderDetail(userId, orderId);
    }

    public OrderDtos.OrderDetailDto rejectSchedule(
            UUID userId,
            UUID orderId,
            UUID proposalId,
            OrderDtos.RejectScheduleRequest req
    ) {
        Instant current = now();
        OrderLookup lookup = lookupOrderOrThrow(orderId);
        boolean isBuyer = lookup.buyerId().equals(userId);
        boolean isSeller = lookup.sellerId().equals(userId);
        if (!isBuyer && !isSeller) {
            throw new AuthFailure(403, "FORBIDDEN", "Bạn không thuộc giao dịch này.");
        }

        String reason = req != null
                ? ListingValidation.optionalText(req.reason(), MAX_SCHEDULE_NOTE_LENGTH, "Lý do không được vượt quá 500 ký tự.")
                : null;

        verifyActiveMemberReadOnly(userId);
        LockedOrder order = lockOrderForUpdate(orderId);

        if (!PRE_DELIVERY_RESERVED_STATUSES.contains(order.status()) || order.reportedDeliveredAt() != null) {
            throw new AuthFailure(409, "INVALID_ORDER_STATE", "Giao dịch không còn ở trạng thái cho phép phản hồi lịch hẹn.");
        }

        ScheduleProposalRow proposal = lockProposalForUpdate(orderId, proposalId);
        if (proposal.proposedById().equals(userId)) {
            throw new AuthFailure(403, "FORBIDDEN", "Bạn không thể tự từ chối đề xuất lịch hẹn của chính mình; hãy gửi đề xuất mới.");
        }
        if (!OrderDtos.ScheduleProposalStatus.CHO_XAC_NHAN.name().equals(proposal.status())) {
            throw new AuthFailure(409, "PROPOSAL_STALE", "Đề xuất lịch hẹn này không còn chờ phản hồi.");
        }

        Timestamp tsNow = Timestamp.from(current);
        db.update(
                """
                UPDATE lich_hen_giao_dichs
                SET trang_thai = 'TU_CHOI',
                    nguoi_phan_hoi_id = ?,
                    thoi_diem_phan_hoi = ?,
                    ly_do_tu_choi = ?
                WHERE id = ?
                """,
                userId,
                tsNow,
                reason,
                proposalId
        );
        db.update(
                "UPDATE giao_dichs SET updated_at = ?, version = version + 1 WHERE ma_giao_dich = ?",
                tsNow,
                orderId
        );

        notificationService.notifyUser(
                proposal.proposedById(),
                OrderDtos.NotificationType.SCHEDULE_REJECTED,
                "Đề xuất lịch hẹn chưa được đồng ý",
                "Đối tác chưa đồng ý với đề xuất lịch hẹn tại " + proposal.proposedLocation() + ". Hai bên có thể đề xuất thời gian/địa điểm khác.",
                order.listingId(),
                orderId
        );

        return loadOrderDetail(userId, orderId);
    }

    // =========================================================================
    // UC-26: Thông báo bắt đầu giao hàng
    // =========================================================================

    public OrderDtos.OrderDetailDto startDelivery(UUID sellerId, UUID orderId, OrderDtos.StartDeliveryRequest req) {
        Instant current = now();
        OrderLookup lookup = lookupOrderOrThrow(orderId);
        if (!lookup.sellerId().equals(sellerId)) {
            throw new AuthFailure(403, "FORBIDDEN", "Chỉ người bán của giao dịch mới có quyền thông báo bắt đầu giao hàng.");
        }

        // Strict lock order: thanh_viens(seller) -> tin_dangs -> giao_dichs
        lockAndVerifyActiveSeller(sellerId);
        LockedListing listing = lockListingForUpdate(lookup.listingId());
        LockedOrder order = lockOrderForUpdate(orderId);

        // UC-26 A2 / NFR-03: Idempotent replay if already in DANG_GIAO -> preserve original timestamp, no duplicate notification
        if (OrderDtos.OrderStatus.DANG_GIAO.name().equals(order.status()) && order.deliveryStartedAt() != null) {
            return loadOrderDetail(sellerId, orderId);
        }

        // UC-26 E2 / E3: Must be GIU_CHO (not HUY, HOAN_TAT, YEU_CAU, CHO_XAC_NHAN, CHO_XU_LY)
        if (!OrderDtos.OrderStatus.GIU_CHO.name().equals(order.status())) {
            throw new AuthFailure(
                    409,
                    "INVALID_ORDER_STATE",
                    "Chỉ có thể thông báo bắt đầu giao hàng khi giao dịch đang ở trạng thái giữ chỗ (hiện tại: " + order.status() + ")."
            );
        }

        // UC-26 Precondition & E2: Mutual schedule must be confirmed first!
        if (!order.scheduleConfirmed() || order.meetingTime() == null || order.meetingLocation() == null) {
            throw new AuthFailure(
                    409,
                    "SCHEDULE_NOT_CONFIRMED",
                    "Hai bên cần thống nhất thời gian và địa điểm giao nhận trước khi thông báo bắt đầu giao hàng."
            );
        }

        if (req != null && req.expectedVersion() != null && req.expectedVersion() != order.version()) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Giao dịch vừa được cập nhật. Vui lòng tải lại.");
        }

        Timestamp tsNow = Timestamp.from(current);
        // CRITICAL (UC-26): Only record thoi_diem_bat_dau_giao & DANG_GIAO.
        // Do NOT set thoi_diem_bao_giao, do NOT require anh_ban_giao, do NOT generate OTP (UC-27).
        db.update(
                """
                UPDATE giao_dichs
                SET trang_thai = 'DANG_GIAO',
                    thoi_diem_bat_dau_giao = ?,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_giao_dich = ?
                """,
                tsNow,
                tsNow,
                orderId
        );

        notificationService.notifyUser(
                order.buyerId(),
                OrderDtos.NotificationType.DELIVERY_STARTED,
                "Người bán đã bắt đầu giao hàng",
                "Người bán vừa thông báo bắt đầu giao hàng cho tin \"" + listing.title() + "\" theo lịch hẹn tại " + order.meetingLocation() + ".",
                listing.id(),
                orderId
        );

        return loadOrderDetail(sellerId, orderId);
    }

    // =========================================================================
    // Query APIs (NFR-01 strict participant access)
    // =========================================================================

    @Transactional(readOnly = true)
    public OrderDtos.OrderPageDto listOrders(
            UUID userId,
            String roleParam,
            String statusParam,
            UUID listingId,
            int page,
            int size
    ) {
        int validPage = ListingValidation.validatePage(page);
        int validSize = ListingValidation.validateSize(size);
        String role = normalizeRoleFilter(roleParam);
        String status = null;
        if (statusParam != null && !statusParam.isBlank()) {
            status = OrderDtos.OrderStatus.fromString(statusParam)
                    .map(Enum::name)
                    .orElseThrow(() -> new AuthFailure(400, "INVALID_INPUT", "Trạng thái giao dịch không hợp lệ."));
        }

        StringBuilder where = new StringBuilder(" WHERE ");
        List<Object> params = new ArrayList<>();
        switch (role) {
            case "BUYER" -> {
                where.append("g.nguoi_mua_id = ?");
                params.add(userId);
            }
            case "SELLER" -> {
                where.append("g.nguoi_ban_id = ?");
                params.add(userId);
            }
            default -> {
                where.append("(g.nguoi_mua_id = ? OR g.nguoi_ban_id = ?)");
                params.add(userId);
                params.add(userId);
            }
        }
        if (status != null) {
            where.append(" AND g.trang_thai = ?");
            params.add(status);
        }
        if (listingId != null) {
            where.append(" AND g.ma_tin = ?");
            params.add(listingId);
        }

        Long total = db.queryForObject(
                "SELECT COUNT(*) FROM giao_dichs g" + where,
                Long.class,
                params.toArray()
        );
        long totalElements = total != null ? total : 0L;

        List<Object> pageParams = new ArrayList<>(params);
        pageParams.add(validSize);
        pageParams.add((long) validPage * validSize);

        List<OrderDtos.OrderSummaryDto> items = db.query(
                """
                SELECT g.ma_giao_dich, g.ma_tin, g.nguoi_ban_id, g.nguoi_mua_id, g.gia_thoa_thuan,
                       g.trang_thai, g.lich_hen_da_xac_nhan, g.thoi_gian_hen, g.dia_diem_hen,
                       g.thoi_gian_hen_du_kien, g.dia_diem_hen_du_kien,
                       g.thoi_diem_tao, g.thoi_diem_giu_cho, g.thoi_diem_bat_dau_giao,
                       g.thoi_diem_bao_giao, g.thoi_diem_huy, g.version,
                       t.tieu_de, t.gia_vnd, t.hinh_thuc, t.trang_thai AS listing_status, t.hinh_anh,
                       COALESCE(k.ten, t.khu_vuc) AS location_name,
                       s.ho_ten AS seller_name, s.diem_uy_tin AS seller_score,
                       b.ho_ten AS buyer_name, b.diem_uy_tin AS buyer_score,
                       CASE
                           WHEN EXISTS (SELECT 1 FROM giao_dich_do_vat gdv WHERE gdv.ma_giao_dich = g.ma_giao_dich)
                           THEN (SELECT COUNT(*)::int FROM giao_dich_do_vat gdv WHERE gdv.ma_giao_dich = g.ma_giao_dich)
                           ELSE (SELECT COUNT(*)::int FROM tin_dang_do_vat tdv WHERE tdv.ma_tin = g.ma_tin)
                       END AS item_count,
                       EXISTS (
                           SELECT 1 FROM lich_hen_giao_dichs lh
                           WHERE lh.ma_giao_dich = g.ma_giao_dich AND lh.trang_thai = 'CHO_XAC_NHAN'
                       ) AS has_pending_schedule
                FROM giao_dichs g
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                LEFT JOIN khu_vucs k ON k.ma_khu_vuc = t.ma_khu_vuc
                JOIN thanh_viens s ON s.user_id = g.nguoi_ban_id
                JOIN thanh_viens b ON b.user_id = g.nguoi_mua_id
                """
                        + where
                        + " ORDER BY g.updated_at DESC, g.thoi_diem_tao DESC, g.ma_giao_dich DESC LIMIT ? OFFSET ?",
                (rs, rowNum) -> {
                    List<String> images = extractTextArray(rs, "hinh_anh");
                    int listedPrice = rs.getInt("gia_vnd");
                    String listingType = rs.getString("hinh_thuc");
                    int itemCount = Math.max(1, rs.getInt("item_count"));
                    boolean isCombo = ListingDtos.ListingType.BAN_COMBO.name().equals(listingType) || itemCount >= 2;
                    boolean isFree = listedPrice == 0;

                    return new OrderDtos.OrderSummaryDto(
                            rs.getObject("ma_giao_dich", UUID.class),
                            new OrderDtos.OrderListingSummaryDto(
                                    rs.getObject("ma_tin", UUID.class),
                                    rs.getString("tieu_de"),
                                    listedPrice,
                                    listingType,
                                    isCombo,
                                    isFree,
                                    rs.getString("listing_status"),
                                    images.isEmpty() ? null : images.getFirst(),
                                    rs.getString("location_name")
                            ),
                            new OrderDtos.PartySummaryDto(
                                    rs.getObject("nguoi_ban_id", UUID.class),
                                    rs.getString("seller_name"),
                                    rs.getInt("seller_score")
                            ),
                            new OrderDtos.PartySummaryDto(
                                    rs.getObject("nguoi_mua_id", UUID.class),
                                    rs.getString("buyer_name"),
                                    rs.getInt("buyer_score")
                            ),
                            rs.getInt("gia_thoa_thuan"),
                            rs.getString("trang_thai"),
                            rs.getBoolean("lich_hen_da_xac_nhan"),
                            toInstant(rs.getTimestamp("thoi_gian_hen")),
                            rs.getString("dia_diem_hen"),
                            toInstant(rs.getTimestamp("thoi_gian_hen_du_kien")),
                            rs.getString("dia_diem_hen_du_kien"),
                            rs.getBoolean("has_pending_schedule"),
                            itemCount,
                            toInstant(rs.getTimestamp("thoi_diem_tao")),
                            toInstant(rs.getTimestamp("thoi_diem_giu_cho")),
                            toInstant(rs.getTimestamp("thoi_diem_bat_dau_giao")),
                            toInstant(rs.getTimestamp("thoi_diem_bao_giao")),
                            toInstant(rs.getTimestamp("thoi_diem_huy")),
                            rs.getLong("version")
                    );
                },
                pageParams.toArray()
        );

        int totalPages = ListingValidation.calculateTotalPages(totalElements, validSize);
        return new OrderDtos.OrderPageDto(items, validPage, validSize, totalElements, totalPages);
    }

    @Transactional(readOnly = true)
    public OrderDtos.OrderDetailDto getOrderDetail(UUID userId, UUID orderId) {
        return loadOrderDetail(userId, orderId);
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    private OrderDtos.OrderDetailDto loadOrderDetail(UUID viewerId, UUID orderId) {
        List<OrderDetailRow> rows = db.query(
                """
                SELECT g.ma_giao_dich, g.ma_tin, g.nguoi_ban_id, g.nguoi_mua_id, g.gia_thoa_thuan,
                       g.trang_thai, g.ghi_chu, g.lich_hen_da_xac_nhan, g.thoi_gian_hen, g.dia_diem_hen,
                       g.thoi_gian_hen_du_kien, g.dia_diem_hen_du_kien,
                       g.nguoi_huy_id, g.ly_do_huy,
                       g.thoi_diem_tao, g.thoi_diem_giu_cho, g.thoi_diem_bat_dau_giao,
                       g.thoi_diem_bao_giao, g.thoi_diem_hoan_tat, g.thoi_diem_huy, g.updated_at, g.version,
                       t.tieu_de, t.gia_vnd, t.hinh_thuc, t.trang_thai AS listing_status, t.hinh_anh,
                       COALESCE(k.ten, t.khu_vuc) AS location_name,
                       s.ho_ten AS seller_name, s.diem_uy_tin AS seller_score,
                       b.ho_ten AS buyer_name, b.diem_uy_tin AS buyer_score
                FROM giao_dichs g
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                LEFT JOIN khu_vucs k ON k.ma_khu_vuc = t.ma_khu_vuc
                JOIN thanh_viens s ON s.user_id = g.nguoi_ban_id
                JOIN thanh_viens b ON b.user_id = g.nguoi_mua_id
                WHERE g.ma_giao_dich = ?
                """,
                (rs, rowNum) -> new OrderDetailRow(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getString("tieu_de"),
                        rs.getInt("gia_vnd"),
                        rs.getString("hinh_thuc"),
                        rs.getString("listing_status"),
                        extractTextArray(rs, "hinh_anh"),
                        rs.getString("location_name"),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getString("seller_name"),
                        rs.getInt("seller_score"),
                        rs.getObject("nguoi_mua_id", UUID.class),
                        rs.getString("buyer_name"),
                        rs.getInt("buyer_score"),
                        rs.getInt("gia_thoa_thuan"),
                        rs.getString("trang_thai"),
                        rs.getString("ghi_chu"),
                        rs.getBoolean("lich_hen_da_xac_nhan"),
                        toInstant(rs.getTimestamp("thoi_gian_hen")),
                        rs.getString("dia_diem_hen"),
                        toInstant(rs.getTimestamp("thoi_gian_hen_du_kien")),
                        rs.getString("dia_diem_hen_du_kien"),
                        rs.getObject("nguoi_huy_id", UUID.class),
                        rs.getString("ly_do_huy"),
                        toInstant(rs.getTimestamp("thoi_diem_tao")),
                        toInstant(rs.getTimestamp("thoi_diem_giu_cho")),
                        toInstant(rs.getTimestamp("thoi_diem_bat_dau_giao")),
                        toInstant(rs.getTimestamp("thoi_diem_bao_giao")),
                        toInstant(rs.getTimestamp("thoi_diem_hoan_tat")),
                        toInstant(rs.getTimestamp("thoi_diem_huy")),
                        toInstant(rs.getTimestamp("updated_at")),
                        rs.getLong("version")
                ),
                orderId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "ORDER_NOT_FOUND", "Không tìm thấy giao dịch.");
        }
        OrderDetailRow row = rows.getFirst();
        boolean isBuyer = row.buyerId().equals(viewerId);
        boolean isSeller = row.sellerId().equals(viewerId);
        if (!isBuyer && !isSeller) {
            throw new AuthFailure(403, "FORBIDDEN", "Bạn không có quyền xem thông tin giao dịch của người khác.");
        }

        List<OrderDtos.OrderItemDto> items = loadOrderItems(orderId, row.listingId());
        boolean isPreDeliveryActive = PRE_DELIVERY_RESERVED_STATUSES.contains(row.status()) && row.reportedDeliveredAt() == null;
        boolean isPostDeliveryPending = (POST_DELIVERY_PENDING_STATUSES.contains(row.status()) || row.reportedDeliveredAt() != null)
                && !OrderDtos.OrderStatus.HOAN_TAT.name().equals(row.status())
                && !OrderDtos.OrderStatus.HUY.name().equals(row.status());

        List<OrderDtos.ScheduleProposalDto> proposals = loadScheduleProposals(orderId, viewerId, isPreDeliveryActive);
        OrderDtos.ScheduleProposalDto pendingProposal = proposals.stream()
                .filter(p -> OrderDtos.ScheduleProposalStatus.CHO_XAC_NHAN.name().equals(p.status()))
                .findFirst()
                .orElse(null);

        OrderDtos.OrderViewerFlagsDto viewer = new OrderDtos.OrderViewerFlagsDto(
                isBuyer,
                isSeller,
                isSeller && OrderDtos.OrderStatus.YEU_CAU.name().equals(row.status()),
                isSeller && OrderDtos.OrderStatus.YEU_CAU.name().equals(row.status()),
                (isBuyer && OrderDtos.OrderStatus.YEU_CAU.name().equals(row.status())) || isPreDeliveryActive,
                isPreDeliveryActive,
                isSeller && OrderDtos.OrderStatus.GIU_CHO.name().equals(row.status())
                        && row.scheduleConfirmed()
                        && row.meetingTime() != null
                        && row.meetingLocation() != null,
                isPostDeliveryPending
        );

        boolean isCombo = ListingDtos.ListingType.BAN_COMBO.name().equals(row.listingType()) || items.size() >= 2;
        boolean isFree = row.listedPriceVnd() == 0;

        return new OrderDtos.OrderDetailDto(
                row.id(),
                new OrderDtos.OrderListingSummaryDto(
                        row.listingId(),
                        row.listingTitle(),
                        row.listedPriceVnd(),
                        row.listingType(),
                        isCombo,
                        isFree,
                        row.listingStatus(),
                        row.listingImages().isEmpty() ? null : row.listingImages().getFirst(),
                        row.locationName()
                ),
                new OrderDtos.PartySummaryDto(row.sellerId(), row.sellerName(), row.sellerScore()),
                new OrderDtos.PartySummaryDto(row.buyerId(), row.buyerName(), row.buyerScore()),
                row.agreedPriceVnd(),
                row.status(),
                row.note(),
                row.scheduleConfirmed(),
                row.meetingTime(),
                row.meetingLocation(),
                row.proposedMeetingTime(),
                row.proposedMeetingLocation(),
                items,
                pendingProposal,
                proposals,
                row.cancelledById(),
                row.cancelReason(),
                row.createdAt(),
                row.reservedAt(),
                row.deliveryStartedAt(),
                row.reportedDeliveredAt(),
                row.completedAt(),
                row.cancelledAt(),
                row.updatedAt(),
                row.version(),
                viewer
        );
    }

    private record OrderDetailRow(
            UUID id,
            UUID listingId,
            String listingTitle,
            int listedPriceVnd,
            String listingType,
            String listingStatus,
            List<String> listingImages,
            String locationName,
            UUID sellerId,
            String sellerName,
            int sellerScore,
            UUID buyerId,
            String buyerName,
            int buyerScore,
            int agreedPriceVnd,
            String status,
            String note,
            boolean scheduleConfirmed,
            Instant meetingTime,
            String meetingLocation,
            Instant proposedMeetingTime,
            String proposedMeetingLocation,
            UUID cancelledById,
            String cancelReason,
            Instant createdAt,
            Instant reservedAt,
            Instant deliveryStartedAt,
            Instant reportedDeliveredAt,
            Instant completedAt,
            Instant cancelledAt,
            Instant updatedAt,
            long version
    ) {
    }

    private List<OrderDtos.OrderItemDto> loadOrderItems(UUID orderId, UUID listingId) {
        List<OrderDtos.OrderItemDto> snapshot = db.query(
                """
                SELECT d.ma_vat, d.ten, d.tinh_trang, d.trang_thai, d.hinh_anh, gdv.giu_hieu_luc
                FROM giao_dich_do_vat gdv
                JOIN do_vats d ON d.ma_vat = gdv.ma_vat
                WHERE gdv.ma_giao_dich = ?
                ORDER BY d.ma_vat ASC
                """,
                (rs, rowNum) -> new OrderDtos.OrderItemDto(
                        rs.getObject("ma_vat", UUID.class),
                        rs.getString("ten"),
                        rs.getString("tinh_trang"),
                        rs.getString("trang_thai"),
                        extractTextArray(rs, "hinh_anh"),
                        rs.getBoolean("giu_hieu_luc")
                ),
                orderId
        );
        if (!snapshot.isEmpty()) {
            return snapshot;
        }
        return db.query(
                """
                SELECT d.ma_vat, d.ten, d.tinh_trang, d.trang_thai, d.hinh_anh
                FROM tin_dang_do_vat tdv
                JOIN do_vats d ON d.ma_vat = tdv.ma_vat
                WHERE tdv.ma_tin = ?
                ORDER BY d.ma_vat ASC
                """,
                (rs, rowNum) -> new OrderDtos.OrderItemDto(
                        rs.getObject("ma_vat", UUID.class),
                        rs.getString("ten"),
                        rs.getString("tinh_trang"),
                        rs.getString("trang_thai"),
                        extractTextArray(rs, "hinh_anh"),
                        false
                ),
                listingId
        );
    }

    private List<OrderDtos.ScheduleProposalDto> loadScheduleProposals(
            UUID orderId,
            UUID viewerId,
            boolean isPreDeliveryActive
    ) {
        return db.query(
                """
                SELECT lh.id, lh.ma_giao_dich, lh.nguoi_de_xuat_id, u.ho_ten AS proposer_name,
                       lh.thoi_gian_de_xuat, lh.dia_diem_de_xuat, lh.ghi_chu, lh.trang_thai,
                       lh.nguoi_phan_hoi_id, lh.thoi_diem_phan_hoi, lh.ly_do_tu_choi, lh.created_at
                FROM lich_hen_giao_dichs lh
                JOIN thanh_viens u ON u.user_id = lh.nguoi_de_xuat_id
                WHERE lh.ma_giao_dich = ?
                ORDER BY lh.created_at DESC, lh.id DESC
                """,
                (rs, rowNum) -> {
                    UUID proposedById = rs.getObject("nguoi_de_xuat_id", UUID.class);
                    String proposalStatus = rs.getString("trang_thai");
                    boolean isPendingForOther = isPreDeliveryActive
                            && OrderDtos.ScheduleProposalStatus.CHO_XAC_NHAN.name().equals(proposalStatus)
                            && !proposedById.equals(viewerId);
                    return new OrderDtos.ScheduleProposalDto(
                            rs.getObject("id", UUID.class),
                            rs.getObject("ma_giao_dich", UUID.class),
                            proposedById,
                            rs.getString("proposer_name"),
                            toInstant(rs.getTimestamp("thoi_gian_de_xuat")),
                            rs.getString("dia_diem_de_xuat"),
                            rs.getString("ghi_chu"),
                            proposalStatus,
                            rs.getObject("nguoi_phan_hoi_id", UUID.class),
                            toInstant(rs.getTimestamp("thoi_diem_phan_hoi")),
                            rs.getString("ly_do_tu_choi"),
                            toInstant(rs.getTimestamp("created_at")),
                            isPendingForOther,
                            isPendingForOther
                    );
                },
                orderId
        );
    }

    private OrderLookup lookupOrderOrThrow(UUID orderId) {
        List<OrderLookup> rows = db.query(
                "SELECT ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id FROM giao_dichs WHERE ma_giao_dich = ?",
                (rs, rowNum) -> new OrderLookup(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getObject("nguoi_mua_id", UUID.class)
                ),
                orderId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "ORDER_NOT_FOUND", "Không tìm thấy giao dịch.");
        }
        return rows.getFirst();
    }

    private void verifyActiveMemberReadOnly(UUID userId) {
        reputationLedger.reconcileExpiredTemporaryLock(userId);
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT user_id, diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved,
                       khoa_den_ngay, loai_han_che, ly_do_han_che, cho_phep_khieu_nai
                FROM thanh_viens
                WHERE user_id = ?
                """,
                userId
        );
        evaluateMemberRow(rows);
    }

    private void lockAndVerifyActiveSeller(UUID sellerId) {
        reputationLedger.reconcileExpiredTemporaryLock(sellerId);
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT user_id, diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved,
                       khoa_den_ngay, loai_han_che, ly_do_han_che, cho_phep_khieu_nai
                FROM thanh_viens
                WHERE user_id = ?
                FOR UPDATE
                """,
                sellerId
        );
        evaluateMemberRow(rows);
    }

    private void lockSellerRowOnly(UUID sellerId) {
        db.queryForList("SELECT user_id FROM thanh_viens WHERE user_id = ? FOR UPDATE", UUID.class, sellerId);
    }

    private void evaluateMemberRow(List<Map<String, Object>> rows) {
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
                    "Tài khoản cần được xác minh email và phê duyệt hồ sơ trước khi thực hiện giao dịch."
            );
        }
    }

    private LockedListing lockListingForUpdate(UUID listingId) {
        List<LockedListing> rows = db.query(
                """
                SELECT ma_tin, nguoi_dang_id, tieu_de, gia_vnd, hinh_thuc, trang_thai, expires_at, version
                FROM tin_dangs
                WHERE ma_tin = ?
                FOR UPDATE
                """,
                (rs, rowNum) -> new LockedListing(
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_dang_id", UUID.class),
                        rs.getString("tieu_de"),
                        rs.getInt("gia_vnd"),
                        rs.getString("hinh_thuc"),
                        rs.getString("trang_thai"),
                        toInstant(rs.getTimestamp("expires_at")),
                        rs.getLong("version")
                ),
                listingId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "LISTING_NOT_FOUND", "Không tìm thấy tin đăng.");
        }
        return rows.getFirst();
    }

    private LockedOrder lockOrderForUpdate(UUID orderId) {
        List<LockedOrder> rows = db.query(
                """
                SELECT ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai,
                       ghi_chu, lich_hen_da_xac_nhan, thoi_gian_hen, dia_diem_hen,
                       thoi_gian_hen_du_kien, dia_diem_hen_du_kien,
                       nguoi_huy_id, ly_do_huy,
                       thoi_diem_tao, thoi_diem_giu_cho, thoi_diem_bat_dau_giao,
                       thoi_diem_bao_giao, thoi_diem_hoan_tat, thoi_diem_huy, updated_at, version
                FROM giao_dichs
                WHERE ma_giao_dich = ?
                FOR UPDATE
                """,
                (rs, rowNum) -> new LockedOrder(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getObject("nguoi_mua_id", UUID.class),
                        rs.getInt("gia_thoa_thuan"),
                        rs.getString("trang_thai"),
                        rs.getString("ghi_chu"),
                        rs.getBoolean("lich_hen_da_xac_nhan"),
                        toInstant(rs.getTimestamp("thoi_gian_hen")),
                        rs.getString("dia_diem_hen"),
                        toInstant(rs.getTimestamp("thoi_gian_hen_du_kien")),
                        rs.getString("dia_diem_hen_du_kien"),
                        rs.getObject("nguoi_huy_id", UUID.class),
                        rs.getString("ly_do_huy"),
                        toInstant(rs.getTimestamp("thoi_diem_tao")),
                        toInstant(rs.getTimestamp("thoi_diem_giu_cho")),
                        toInstant(rs.getTimestamp("thoi_diem_bat_dau_giao")),
                        toInstant(rs.getTimestamp("thoi_diem_bao_giao")),
                        toInstant(rs.getTimestamp("thoi_diem_hoan_tat")),
                        toInstant(rs.getTimestamp("thoi_diem_huy")),
                        toInstant(rs.getTimestamp("updated_at")),
                        rs.getLong("version")
                ),
                orderId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "ORDER_NOT_FOUND", "Không tìm thấy giao dịch.");
        }
        return rows.getFirst();
    }

    private ScheduleProposalRow lockProposalForUpdate(UUID orderId, UUID proposalId) {
        List<ScheduleProposalRow> rows = db.query(
                """
                SELECT lh.id, lh.ma_giao_dich, lh.nguoi_de_xuat_id, u.ho_ten AS proposer_name,
                       lh.thoi_gian_de_xuat, lh.dia_diem_de_xuat, lh.ghi_chu, lh.trang_thai,
                       lh.nguoi_phan_hoi_id, lh.thoi_diem_phan_hoi, lh.ly_do_tu_choi, lh.created_at
                FROM lich_hen_giao_dichs lh
                JOIN thanh_viens u ON u.user_id = lh.nguoi_de_xuat_id
                WHERE lh.id = ? AND lh.ma_giao_dich = ?
                FOR UPDATE OF lh
                """,
                (rs, rowNum) -> new ScheduleProposalRow(
                        rs.getObject("id", UUID.class),
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("nguoi_de_xuat_id", UUID.class),
                        rs.getString("proposer_name"),
                        toInstant(rs.getTimestamp("thoi_gian_de_xuat")),
                        rs.getString("dia_diem_de_xuat"),
                        rs.getString("ghi_chu"),
                        rs.getString("trang_thai"),
                        rs.getObject("nguoi_phan_hoi_id", UUID.class),
                        toInstant(rs.getTimestamp("thoi_diem_phan_hoi")),
                        rs.getString("ly_do_tu_choi"),
                        toInstant(rs.getTimestamp("created_at"))
                ),
                proposalId,
                orderId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "SCHEDULE_PROPOSAL_NOT_FOUND", "Không tìm thấy đề xuất lịch hẹn.");
        }
        return rows.getFirst();
    }

    private List<UUID> findListingItemIdsSorted(UUID listingId) {
        return db.queryForList(
                "SELECT ma_vat FROM tin_dang_do_vat WHERE ma_tin = ? ORDER BY ma_vat ASC",
                UUID.class,
                listingId
        );
    }

    private List<UUID> findOrderItemIdsSorted(UUID orderId, UUID listingId) {
        LinkedHashSet<UUID> union = new LinkedHashSet<>();
        union.addAll(db.queryForList(
                "SELECT ma_vat FROM giao_dich_do_vat WHERE ma_giao_dich = ? ORDER BY ma_vat ASC",
                UUID.class,
                orderId
        ));
        if (union.isEmpty()) {
            union.addAll(findListingItemIdsSorted(listingId));
        }
        return union.stream().sorted(Comparator.comparing(UUID::toString)).toList();
    }

    private List<LockedItem> lockItemsSorted(Collection<UUID> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) {
            return List.of();
        }
        UUID[] sorted = itemIds.stream()
                .distinct()
                .sorted(Comparator.comparing(UUID::toString))
                .toArray(UUID[]::new);
        List<LockedItem> result = new ArrayList<>();
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
                    ps.setArray(1, con.createArrayOf("uuid", sorted));
                    return ps;
                },
                rs -> {
                    result.add(new LockedItem(
                            rs.getObject("ma_vat", UUID.class),
                            rs.getObject("user_id", UUID.class),
                            rs.getString("trang_thai"),
                            rs.getLong("version")
                    ));
                }
        );
        return result;
    }

    private void replaceOrderItems(UUID orderId, List<UUID> itemIds, boolean activeHold) {
        db.update("DELETE FROM giao_dich_do_vat WHERE ma_giao_dich = ?", orderId);
        for (UUID itemId : itemIds) {
            db.update(
                    "INSERT INTO giao_dich_do_vat(ma_giao_dich, ma_vat, giu_hieu_luc) VALUES (?, ?, ?)",
                    orderId,
                    itemId,
                    activeHold
            );
        }
    }

    private int countActiveReservationsForListing(UUID listingId) {
        Integer count = db.queryForObject(
                """
                SELECT COUNT(*)
                FROM giao_dichs
                WHERE ma_tin = ?
                  AND trang_thai IN ('GIU_CHO', 'DANG_GIAO', 'CHO_XAC_NHAN', 'CHO_XU_LY')
                """,
                Integer.class,
                listingId
        );
        return count != null ? count : 0;
    }

    private boolean hasActiveItemHold(UUID itemId) {
        Integer count = db.queryForObject(
                "SELECT COUNT(*) FROM giao_dich_do_vat WHERE ma_vat = ? AND giu_hieu_luc = TRUE",
                Integer.class,
                itemId
        );
        return count != null && count > 0;
    }

    private boolean areAllListingItemsAvailable(UUID listingId) {
        Integer unavailable = db.queryForObject(
                """
                SELECT COUNT(*)
                FROM tin_dang_do_vat tdv
                JOIN do_vats d ON d.ma_vat = tdv.ma_vat
                WHERE tdv.ma_tin = ?
                  AND d.trang_thai <> 'KHA_DUNG'
                """,
                Integer.class,
                listingId
        );
        return unavailable == null || unavailable == 0;
    }

    private String loadDisplayName(UUID userId) {
        List<String> names = db.queryForList(
                "SELECT ho_ten FROM thanh_viens WHERE user_id = ?",
                String.class,
                userId
        );
        return names.isEmpty() ? "Thành viên" : names.getFirst();
    }

    private static String normalizeRoleFilter(String rawRole) {
        if (rawRole == null || rawRole.isBlank()) {
            return "ALL";
        }
        String normalized = rawRole.strip().toUpperCase(Locale.ROOT);
        if (!"ALL".equals(normalized) && !"BUYER".equals(normalized) && !"SELLER".equals(normalized)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Bộ lọc vai trò không hợp lệ (chỉ chấp nhận ALL, BUYER, SELLER).");
        }
        return normalized;
    }

    private static Instant toInstant(Timestamp ts) {
        return ts != null ? ts.toInstant() : null;
    }

    private static List<String> extractTextArray(ResultSet rs, String column) throws SQLException {
        Array arr = rs.getArray(column);
        if (arr == null) {
            return List.of();
        }
        Object raw = arr.getArray();
        if (raw instanceof String[] strings) {
            List<String> result = new ArrayList<>(strings.length);
            for (String s : strings) {
                if (s != null) {
                    result.add(s);
                }
            }
            return List.copyOf(result);
        }
        return List.of();
    }
}
