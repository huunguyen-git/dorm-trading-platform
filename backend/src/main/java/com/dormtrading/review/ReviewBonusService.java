package com.dormtrading.review;

import com.dormtrading.order.OrderDtos;
import com.dormtrading.order.OrderNotificationService;
import com.dormtrading.review.reputation.ReputationLedgerService;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * FR-10 & NFR-03 15-day no-review +1 bonus processor.
 *
 * <p>Rules:
 * - Completed orders ({@code HOAN_TAT}) whose {@code thoi_diem_hoan_tat <= now - 15 days}
 *   with NO non-{@code DA_XOA} review receive {@code +1} reputation point for the seller ONCE.
 * - {@code CHO_XET}, {@code BI_BAC}, {@code CHAP_NHAN}, and {@code DA_GO} reviews ALL suppress the +1 bonus.
 * - Soft-deleted ({@code DA_XOA}) reviews return the order to unreviewed state, restoring +1 eligibility once past 15 days.
 * - Acquires locks in the exact global order {@code thanh_viens(seller) FOR UPDATE -> giao_dichs(order) FOR NO KEY UPDATE}
 *   so concurrent review submission and +1 bonus execution are strictly mutually exclusive and deadlock-free.
 */
@Service
public class ReviewBonusService {

    private final JdbcTemplate db;
    private final Clock clock;
    private final ReputationLedgerService reputationLedger;
    private final OrderNotificationService notificationService;
    private final TransactionTemplate requiresNewTx;
    private final int batchSize;

    public ReviewBonusService(
            JdbcTemplate db,
            Clock clock,
            ReputationLedgerService reputationLedger,
            OrderNotificationService notificationService,
            PlatformTransactionManager transactionManager,
            @Value("${app.review.no-review-bonus-batch-size:50}") int batchSize
    ) {
        this.db = db;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.reputationLedger = reputationLedger;
        this.notificationService = notificationService;
        this.requiresNewTx = new TransactionTemplate(transactionManager);
        this.requiresNewTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.batchSize = batchSize > 0 ? Math.min(batchSize, 500) : 50;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    /**
     * Scans and awards +1 reputation bonus for up to {@code batchSize} overdue completed orders.
     *
     * @return count of orders that received the +1 bonus in this batch
     */
    public int processDueNoReviewBonuses() {
        Instant cutoff = now().minus(ReviewPolicy.REVIEW_WINDOW_DURATION);
        List<UUID> candidateOrderIds = db.queryForList(
                """
                SELECT g.ma_giao_dich
                FROM giao_dichs g
                JOIN thanh_viens s ON s.user_id = g.nguoi_ban_id
                WHERE g.trang_thai = 'HOAN_TAT'
                  AND g.thoi_diem_hoan_tat IS NOT NULL
                  AND g.thoi_diem_hoan_tat <= ?
                  AND g.da_cong_diem_khong_danh_gia = FALSE
                  AND s.trang_thai_tai_khoan <> 'VO_HIEU_HOA'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM danh_gias d
                      WHERE d.ma_giao_dich = g.ma_giao_dich
                        AND d.trang_thai <> 'DA_XOA'
                  )
                ORDER BY g.thoi_diem_hoan_tat ASC, g.ma_giao_dich ASC
                LIMIT ?
                """,
                UUID.class,
                Timestamp.from(cutoff),
                batchSize
        );

        int awarded = 0;
        for (UUID orderId : candidateOrderIds) {
            if (awardNoReviewBonusForOrder(orderId)) {
                awarded++;
            }
        }
        return awarded;
    }

    /**
     * Atomically evaluates and awards the FR-10 +1 no-review bonus for a single order in a
     * {@code REQUIRES_NEW} transaction using strict lock ordering {@code thanh_viens -> giao_dichs}.
     *
     * @return {@code true} if +1 bonus was awarded on this call; {@code false} if ineligible or already awarded
     */
    public boolean awardNoReviewBonusForOrder(UUID orderId) {
        if (orderId == null) {
            return false;
        }
        List<UUID> sellers = db.queryForList(
                "SELECT nguoi_ban_id FROM giao_dichs WHERE ma_giao_dich = ?",
                UUID.class,
                orderId
        );
        if (sellers.isEmpty()) {
            return false;
        }
        UUID sellerId = sellers.getFirst();

        Boolean result = requiresNewTx.execute(status -> {
            // Strict global lock order: (1) thanh_viens(seller) FOR UPDATE -> (2) giao_dichs(order) FOR NO KEY UPDATE
            List<String> sellerStatuses = db.queryForList(
                    "SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ? FOR UPDATE",
                    String.class,
                    sellerId
            );
            if (sellerStatuses.isEmpty() || "VO_HIEU_HOA".equals(sellerStatuses.getFirst())) {
                return false;
            }

            List<Map<String, Object>> orderRows = db.queryForList(
                    """
                    SELECT g.ma_giao_dich, g.ma_tin, t.tieu_de AS listing_title, g.nguoi_ban_id,
                           g.trang_thai, g.thoi_diem_hoan_tat, g.da_cong_diem_khong_danh_gia
                    FROM giao_dichs g
                    JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                    WHERE g.ma_giao_dich = ?
                    FOR NO KEY UPDATE OF g
                    """,
                    orderId
            );
            if (orderRows.isEmpty()) {
                return false;
            }
            Map<String, Object> order = orderRows.getFirst();
            if (!"HOAN_TAT".equals(order.get("trang_thai"))) {
                return false;
            }
            if (Boolean.TRUE.equals(order.get("da_cong_diem_khong_danh_gia"))) {
                return false;
            }
            Timestamp completedTs = (Timestamp) order.get("thoi_diem_hoan_tat");
            if (completedTs == null) {
                return false;
            }
            Instant current = now();
            if (ReviewPolicy.isWithinReviewWindow(completedTs.toInstant(), current)) {
                return false;
            }

            // Re-verify under lock that NO active/non-DA_XOA review exists (CHO_XET, BI_BAC, CHAP_NHAN, DA_GO suppress +1)
            Integer activeReviewCount = db.queryForObject(
                    "SELECT COUNT(*) FROM danh_gias WHERE ma_giao_dich = ? AND trang_thai <> 'DA_XOA'",
                    Integer.class,
                    orderId
            );
            if (activeReviewCount != null && activeReviewCount > 0) {
                return false;
            }

            String listingTitle = String.valueOf(order.get("listing_title"));
            UUID listingId = (UUID) order.get("ma_tin");
            String idempotencyKey = "ORDER_NO_REVIEW_BONUS:" + orderId;

            var entry = reputationLedger.recordScoreChange(
                    sellerId,
                    ReputationLedgerService.CHANGE_TRANSACTION_REVIEW,
                    ReviewPolicy.NO_REVIEW_BONUS_POINTS,
                    "Cộng +1 điểm uy tín sau 15 ngày không có đánh giá cho giao dịch hoàn tất \"" + listingTitle + "\"",
                    "ORDER_NO_REVIEW_BONUS",
                    orderId.toString(),
                    idempotencyKey,
                    null
            );

            Timestamp tsNow = Timestamp.from(current);
            db.update(
                    """
                    UPDATE giao_dichs
                    SET da_cong_diem_khong_danh_gia = TRUE,
                        thoi_diem_cong_diem_khong_danh_gia = ?,
                        updated_at = ?,
                        version = version + 1
                    WHERE ma_giao_dich = ?
                    """,
                    tsNow,
                    tsNow,
                    orderId
            );

            if (!entry.idempotentReplay()) {
                notificationService.notifyUser(
                        sellerId,
                        OrderDtos.NotificationType.ORDER_NO_REVIEW_BONUS,
                        "Cộng +1 điểm uy tín cho giao dịch hoàn tất",
                        "Giao dịch \"" + listingTitle
                                + "\" đã quá 15 ngày không phát sinh đánh giá. Hệ thống đã cộng +1 điểm uy tín cho bạn.",
                        listingId,
                        orderId
                );
                return true;
            }
            return false;
        });

        return Boolean.TRUE.equals(result);
    }
}
