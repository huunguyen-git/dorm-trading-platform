package com.dormtrading.order;

import com.dormtrading.catalog.ListingValidation;
import com.dormtrading.catalog.listing.ListingUpdatedWithPendingRequestsEvent;
import com.dormtrading.iam.auth.AuthFailure;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * In-app notification persistence for P2-04/P2-05 order lifecycle events and P2-01
 * {@link ListingUpdatedWithPendingRequestsEvent} consumer (UC-17 Alt 2).
 */
@Service
@Transactional
public class OrderNotificationService {

    private final JdbcTemplate db;
    private final Clock clock;

    public OrderNotificationService(JdbcTemplate db, Clock clock) {
        this.db = db;
        this.clock = clock != null ? clock : Clock.systemUTC();
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    public void notifyUser(
            UUID recipientId,
            OrderDtos.NotificationType type,
            String title,
            String message,
            UUID listingId,
            UUID orderId
    ) {
        if (recipientId == null || type == null) {
            return;
        }
        db.update(
                """
                INSERT INTO thong_baos(nguoi_nhan_id, loai, tieu_de, noi_dung, ma_tin, ma_giao_dich, da_doc, created_at)
                VALUES (?, ?, ?, ?, ?, ?, FALSE, ?)
                """,
                recipientId,
                type.name(),
                title,
                message,
                listingId,
                orderId,
                Timestamp.from(now())
        );
    }

    /**
     * Consumer for P2-01 {@link ListingUpdatedWithPendingRequestsEvent}: notifies every buyer
     * currently waiting on a pending YEU_CAU order for that listing so they can review updated terms.
     */
    @EventListener
    public void onListingUpdatedWithPendingRequests(ListingUpdatedWithPendingRequestsEvent event) {
        if (event == null || event.listingId() == null) {
            return;
        }
        List<String> titles = db.queryForList(
                "SELECT tieu_de FROM tin_dangs WHERE ma_tin = ?",
                String.class,
                event.listingId()
        );
        String listingTitle = titles.isEmpty() ? "Tin đăng" : titles.getFirst();

        List<PendingBuyerOrder> pendingOrders = db.query(
                """
                SELECT ma_giao_dich, nguoi_mua_id
                FROM giao_dichs
                WHERE ma_tin = ?
                  AND trang_thai = 'YEU_CAU'
                ORDER BY thoi_diem_tao ASC
                """,
                (rs, rowNum) -> new PendingBuyerOrder(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("nguoi_mua_id", UUID.class)
                ),
                event.listingId()
        );

        List<UUID> currentListingItems = db.queryForList(
                "SELECT ma_vat FROM tin_dang_do_vat WHERE ma_tin = ? ORDER BY ma_vat ASC",
                UUID.class,
                event.listingId()
        );

        Timestamp createdAt = Timestamp.from(event.occurredAt() != null ? event.occurredAt() : now());
        for (PendingBuyerOrder pending : pendingOrders) {
            // Keep pending YEU_CAU item snapshot synchronized with updated listing items (giu_hieu_luc remains FALSE)
            db.update(
                    "DELETE FROM giao_dich_do_vat WHERE ma_giao_dich = ? AND giu_hieu_luc = FALSE",
                    pending.orderId()
            );
            for (UUID itemId : currentListingItems) {
                db.update(
                        """
                        INSERT INTO giao_dich_do_vat(ma_giao_dich, ma_vat, ten_vat_snapshot, tinh_trang_snapshot, giu_hieu_luc)
                        SELECT ?, d.ma_vat, d.ten, d.tinh_trang, FALSE
                        FROM do_vats d
                        WHERE d.ma_vat = ?
                        ON CONFLICT DO NOTHING
                        """,
                        pending.orderId(),
                        itemId
                );
            }

            // Bump pending order version so stale /accept requests with old expectedVersion receive 409 VERSION_CONFLICT
            db.update(
                    """
                    UPDATE giao_dichs
                    SET version = version + 1,
                        updated_at = ?
                    WHERE ma_giao_dich = ?
                      AND trang_thai = 'YEU_CAU'
                    """,
                    createdAt,
                    pending.orderId()
            );

            db.update(
                    """
                    INSERT INTO thong_baos(nguoi_nhan_id, loai, tieu_de, noi_dung, ma_tin, ma_giao_dich, da_doc, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, FALSE, ?)
                    """,
                    pending.buyerId(),
                    OrderDtos.NotificationType.LISTING_UPDATED_WITH_PENDING_REQUEST.name(),
                    "Tin đăng bạn yêu cầu giữ chỗ vừa được cập nhật",
                    "Người bán vừa cập nhật thông tin tin \"" + listingTitle + "\". Vui lòng kiểm tra lại trước khi người bán xác nhận giữ chỗ.",
                    event.listingId(),
                    pending.orderId(),
                    createdAt
            );
        }
    }

    @Transactional(readOnly = true)
    public OrderDtos.NotificationsPageDto listNotifications(UUID userId, boolean unreadOnly, int page, int size) {
        int validPage = ListingValidation.validatePage(page);
        int validSize = ListingValidation.validateSize(size);

        String whereClause = unreadOnly ? "WHERE nguoi_nhan_id = ? AND da_doc = FALSE" : "WHERE nguoi_nhan_id = ?";
        Long total = db.queryForObject(
                "SELECT COUNT(*) FROM thong_baos " + whereClause,
                Long.class,
                userId
        );
        long totalElements = total != null ? total : 0L;

        Long unread = db.queryForObject(
                "SELECT COUNT(*) FROM thong_baos WHERE nguoi_nhan_id = ? AND da_doc = FALSE",
                Long.class,
                userId
        );
        long unreadCount = unread != null ? unread : 0L;

        List<OrderDtos.NotificationDto> items = db.query(
                "SELECT id, loai, tieu_de, noi_dung, ma_tin, ma_giao_dich, da_doc, created_at "
                        + "FROM thong_baos "
                        + whereClause
                        + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                (rs, rowNum) -> new OrderDtos.NotificationDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("loai"),
                        rs.getString("tieu_de"),
                        rs.getString("noi_dung"),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getBoolean("da_doc"),
                        rs.getTimestamp("created_at").toInstant()
                ),
                userId,
                validSize,
                (long) validPage * validSize
        );

        int totalPages = ListingValidation.calculateTotalPages(totalElements, validSize);
        return new OrderDtos.NotificationsPageDto(items, unreadCount, validPage, validSize, totalElements, totalPages);
    }

    public OrderDtos.NotificationDto markAsRead(UUID userId, UUID notificationId) {
        List<OrderDtos.NotificationDto> rows = db.query(
                """
                UPDATE thong_baos
                SET da_doc = TRUE
                WHERE id = ? AND nguoi_nhan_id = ?
                RETURNING id, loai, tieu_de, noi_dung, ma_tin, ma_giao_dich, da_doc, created_at
                """,
                (rs, rowNum) -> new OrderDtos.NotificationDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("loai"),
                        rs.getString("tieu_de"),
                        rs.getString("noi_dung"),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getBoolean("da_doc"),
                        rs.getTimestamp("created_at").toInstant()
                ),
                notificationId,
                userId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "NOTIFICATION_NOT_FOUND", "Không tìm thấy thông báo.");
        }
        return rows.getFirst();
    }

    public int markAllAsRead(UUID userId) {
        return db.update(
                "UPDATE thong_baos SET da_doc = TRUE WHERE nguoi_nhan_id = ? AND da_doc = FALSE",
                userId
        );
    }

    private record PendingBuyerOrder(UUID orderId, UUID buyerId) {
    }
}
