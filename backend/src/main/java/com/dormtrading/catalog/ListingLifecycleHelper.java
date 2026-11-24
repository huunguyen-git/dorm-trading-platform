package com.dormtrading.catalog;

import com.dormtrading.iam.auth.AuthFailure;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class ListingLifecycleHelper {

    public static final int HIGH_TIER_THRESHOLD = 120;
    public static final int STANDARD_LIMIT = 5;
    public static final int HIGH_TIER_LIMIT = 10;
    public static final int LISTING_LIFETIME_DAYS = 30;
    public static final int RENEWAL_REMINDER_DAYS = 7;

    public static final Set<String> QUOTA_ACTIVE_STATUSES = Set.of(
            ListingDtos.ListingStatus.CONG_KHAI.name(),
            ListingDtos.ListingStatus.GIU_CHO.name()
    );

    public static final Set<String> INVENTORY_ACTIVE_STATUSES = Set.of(
            ListingDtos.ListingStatus.NHAP.name(),
            ListingDtos.ListingStatus.CHO_DUYET.name(),
            ListingDtos.ListingStatus.CONG_KHAI.name(),
            ListingDtos.ListingStatus.GIU_CHO.name()
    );

    private final JdbcTemplate db;
    private final Clock clock;
    private final ListingDtos.ModerationMode moderationMode;

    public ListingLifecycleHelper(
            JdbcTemplate db,
            Clock clock,
            @Value("${app.catalog.moderation-mode:AUTO_PRECHECK}") String moderationMode
    ) {
        this.db = db;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.moderationMode = ListingDtos.ModerationMode.fromConfig(moderationMode);
    }

    public Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    public ListingDtos.ModerationMode moderationMode() {
        return moderationMode;
    }

    public String targetPublishStatus() {
        return moderationMode == ListingDtos.ModerationMode.MANUAL_QUEUE
                ? ListingDtos.ListingStatus.CHO_DUYET.name()
                : ListingDtos.ListingStatus.CONG_KHAI.name();
    }

    public static int calculateQuotaLimit(int reputationScore) {
        return reputationScore < HIGH_TIER_THRESHOLD ? STANDARD_LIMIT : HIGH_TIER_LIMIT;
    }

    public static String deriveListingType(int itemCount, int priceVnd) {
        if (itemCount >= 2) {
            return ListingDtos.ListingType.BAN_COMBO.name();
        }
        return priceVnd == 0
                ? ListingDtos.ListingType.CHO_TANG.name()
                : ListingDtos.ListingType.BAN_LE.name();
    }

    public static Instant calculateExpiresAt(Instant publishedAt) {
        if (publishedAt == null) {
            return null;
        }
        return publishedAt.plus(LISTING_LIFETIME_DAYS, ChronoUnit.DAYS);
    }

    public static boolean isExpired(String status, Instant expiresAt, Instant now) {
        return ListingDtos.ListingStatus.CONG_KHAI.name().equals(status)
                && expiresAt != null
                && now != null
                && !now.isBefore(expiresAt);
    }

    public static boolean isRenewalReminderDue(String status, Instant expiresAt, Instant now) {
        if (!ListingDtos.ListingStatus.CONG_KHAI.name().equals(status) || expiresAt == null || now == null) {
            return false;
        }
        Instant reminderStart = expiresAt.minus(RENEWAL_REMINDER_DAYS, ChronoUnit.DAYS);
        return !now.isBefore(reminderStart) && now.isBefore(expiresAt);
    }

    public static ListingDtos.ListingQuotaDto buildQuota(int reputationScore, int activeCount) {
        int safeActiveCount = Math.max(0, activeCount);
        int limit = calculateQuotaLimit(reputationScore);
        int remaining = Math.max(0, limit - safeActiveCount);
        boolean canPublish = safeActiveCount < limit;
        return new ListingDtos.ListingQuotaDto(
                reputationScore,
                safeActiveCount,
                limit,
                remaining,
                canPublish,
                HIGH_TIER_THRESHOLD,
                STANDARD_LIMIT,
                HIGH_TIER_LIMIT
        );
    }

    /**
     * FR-13 lazy expiry reconciliation for one seller: transitions CONG_KHAI listings whose
     * expires_at <= now to HET_HAN. Never closes GIU_CHO listings.
     */
    @Transactional
    public int reconcileExpiredListingsForSeller(UUID sellerId) {
        if (sellerId == null) {
            return 0;
        }
        Timestamp current = Timestamp.from(now());
        return db.update(
                "UPDATE tin_dangs " +
                        "SET trang_thai = 'HET_HAN', closed_at = ?, updated_at = ?, version = version + 1 " +
                        "WHERE nguoi_dang_id = ? " +
                        "  AND trang_thai = 'CONG_KHAI' " +
                        "  AND expires_at IS NOT NULL " +
                        "  AND expires_at <= ?",
                current,
                current,
                sellerId,
                current
        );
    }

    /**
     * FR-13 expiry reconciliation across all sellers: transitions CONG_KHAI listings whose
     * expires_at <= now to HET_HAN. Never closes GIU_CHO listings.
     */
    @Transactional
    public int reconcileAllExpiredListings() {
        Timestamp current = Timestamp.from(now());
        return db.update(
                "UPDATE tin_dangs " +
                        "SET trang_thai = 'HET_HAN', closed_at = ?, updated_at = ?, version = version + 1 " +
                        "WHERE trang_thai = 'CONG_KHAI' " +
                        "  AND expires_at IS NOT NULL " +
                        "  AND expires_at <= ?",
                current,
                current,
                current
        );
    }

    /**
     * FR-13 7-day renewal reminder marker: stamps renewal_reminded_at once per active cycle
     * during the final 7 days before expires_at without bumping optimistic lock version.
     */
    @Transactional
    public int markRenewalRemindersForSeller(UUID sellerId) {
        if (sellerId == null) {
            return 0;
        }
        Instant currentInstant = now();
        Timestamp current = Timestamp.from(currentInstant);
        Timestamp reminderCutoff = Timestamp.from(currentInstant.plus(RENEWAL_REMINDER_DAYS, ChronoUnit.DAYS));
        return db.update(
                "UPDATE tin_dangs " +
                        "SET renewal_reminded_at = ? " +
                        "WHERE nguoi_dang_id = ? " +
                        "  AND trang_thai = 'CONG_KHAI' " +
                        "  AND expires_at IS NOT NULL " +
                        "  AND expires_at > ? " +
                        "  AND expires_at <= ? " +
                        "  AND renewal_reminded_at IS NULL",
                current,
                sellerId,
                current,
                reminderCutoff
        );
    }

    /**
     * FR-05 quota computation: reconciles expired listings first, then counts only CONG_KHAI + GIU_CHO.
     */
    @Transactional
    public ListingDtos.ListingQuotaDto loadQuota(UUID sellerId) {
        if (sellerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        reconcileExpiredListingsForSeller(sellerId);
        List<Integer> scores = db.queryForList(
                "SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?",
                Integer.class,
                sellerId
        );
        if (scores.isEmpty()) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }
        return loadQuotaForScore(sellerId, scores.getFirst());
    }

    /**
     * Counts active quota usage (CONG_KHAI + GIU_CHO) when seller row is already locked and
     * expired listings have already been reconciled inside the caller's transaction.
     */
    public ListingDtos.ListingQuotaDto loadQuotaForScore(UUID sellerId, int reputationScore) {
        Integer activeCount = db.queryForObject(
                "SELECT COUNT(*) FROM tin_dangs WHERE nguoi_dang_id = ? AND trang_thai IN ('CONG_KHAI', 'GIU_CHO')",
                Integer.class,
                sellerId
        );
        return buildQuota(reputationScore, activeCount != null ? activeCount : 0);
    }
}
