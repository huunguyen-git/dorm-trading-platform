package com.dormtrading.catalog;

import com.dormtrading.iam.auth.AuthFailure;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
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
     * FR-13 lazy expiry reconciliation for one seller: selects overdue CONG_KHAI listings with
     * ORDER BY ma_tin ASC FOR UPDATE SKIP LOCKED, transitions them to HET_HAN, and bumps
     * do_vats.version for all linked items locked in ascending ma_vat order. Never closes GIU_CHO.
     */
    @Transactional
    public int reconcileExpiredListingsForSeller(UUID sellerId) {
        Instant currentInstant = now();
        List<UUID> expiredIds = expireOverdueListingsForSeller(sellerId, currentInstant);
        if (!expiredIds.isEmpty()) {
            List<UUID> linkedItemIds = findLinkedItemIdsSorted(expiredIds);
            lockAndBumpItemsVersion(linkedItemIds, List.of(), currentInstant);
        }
        return expiredIds.size();
    }

    /**
     * Step (2) helper for write flows that must lock target tin_dangs before locking do_vats:
     * expires overdue CONG_KHAI rows for seller using ORDER BY ma_tin ASC FOR UPDATE SKIP LOCKED
     * and returns expired listing IDs so the caller can lock and bump all linked do_vats in step (3).
     */
    @Transactional
    public List<UUID> expireOverdueListingsForSeller(UUID sellerId, Instant currentInstant) {
        if (sellerId == null) {
            return List.of();
        }
        Instant effectiveNow = currentInstant != null ? currentInstant : now();
        Timestamp current = Timestamp.from(effectiveNow);
        List<UUID> expiredIds = db.queryForList(
                """
                SELECT ma_tin
                FROM tin_dangs
                WHERE nguoi_dang_id = ?
                  AND trang_thai = 'CONG_KHAI'
                  AND expires_at IS NOT NULL
                  AND expires_at <= ?
                ORDER BY ma_tin ASC
                FOR UPDATE SKIP LOCKED
                """,
                UUID.class,
                sellerId,
                current
        );
        if (expiredIds.isEmpty()) {
            return List.of();
        }
        markListingsExpired(expiredIds, current);
        return expiredIds;
    }

    /**
     * Same as {@link #expireOverdueListingsForSeller(UUID, Instant)} but excludes one target listing
     * ID so the caller can inspect and transition that target listing in-place without tripping
     * self-inflicted optimistic version conflict before committing.
     */
    @Transactional
    public List<UUID> expireOverdueListingsForSellerExcluding(
            UUID sellerId,
            UUID excludedListingId,
            Instant currentInstant
    ) {
        if (sellerId == null) {
            return List.of();
        }
        if (excludedListingId == null) {
            return expireOverdueListingsForSeller(sellerId, currentInstant);
        }
        Instant effectiveNow = currentInstant != null ? currentInstant : now();
        Timestamp current = Timestamp.from(effectiveNow);
        List<UUID> expiredIds = db.queryForList(
                """
                SELECT ma_tin
                FROM tin_dangs
                WHERE nguoi_dang_id = ?
                  AND ma_tin <> ?
                  AND trang_thai = 'CONG_KHAI'
                  AND expires_at IS NOT NULL
                  AND expires_at <= ?
                ORDER BY ma_tin ASC
                FOR UPDATE SKIP LOCKED
                """,
                UUID.class,
                sellerId,
                excludedListingId,
                current
        );
        if (expiredIds.isEmpty()) {
            return List.of();
        }
        markListingsExpired(expiredIds, current);
        return expiredIds;
    }

    /**
     * FR-13 lazy expiry reconciliation for a single listing ID: selects if overdue CONG_KHAI with
     * ORDER BY ma_tin ASC FOR UPDATE SKIP LOCKED, flips to HET_HAN, and bumps linked do_vats.version.
     */
    @Transactional
    public int reconcileExpiredListingById(UUID listingId) {
        if (listingId == null) {
            return 0;
        }
        Instant currentInstant = now();
        Timestamp current = Timestamp.from(currentInstant);
        List<UUID> expiredIds = db.queryForList(
                """
                SELECT ma_tin
                FROM tin_dangs
                WHERE ma_tin = ?
                  AND trang_thai = 'CONG_KHAI'
                  AND expires_at IS NOT NULL
                  AND expires_at <= ?
                ORDER BY ma_tin ASC
                FOR UPDATE SKIP LOCKED
                """,
                UUID.class,
                listingId,
                current
        );
        if (expiredIds.isEmpty()) {
            return 0;
        }
        markListingsExpired(expiredIds, current);
        List<UUID> linkedItemIds = findLinkedItemIdsSorted(expiredIds);
        lockAndBumpItemsVersion(linkedItemIds, List.of(), currentInstant);
        return expiredIds.size();
    }

    /**
     * FR-13 expiry reconciliation across all sellers: selects overdue CONG_KHAI listings with
     * ORDER BY ma_tin ASC FOR UPDATE SKIP LOCKED, transitions them to HET_HAN, and bumps
     * do_vats.version for all linked items locked in ascending ma_vat order. Never closes GIU_CHO.
     */
    @Transactional
    public int reconcileAllExpiredListings() {
        Instant currentInstant = now();
        Timestamp current = Timestamp.from(currentInstant);
        List<UUID> expiredIds = db.queryForList(
                """
                SELECT ma_tin
                FROM tin_dangs
                WHERE trang_thai = 'CONG_KHAI'
                  AND expires_at IS NOT NULL
                  AND expires_at <= ?
                ORDER BY ma_tin ASC
                FOR UPDATE SKIP LOCKED
                """,
                UUID.class,
                current
        );
        if (expiredIds.isEmpty()) {
            return 0;
        }
        markListingsExpired(expiredIds, current);
        List<UUID> linkedItemIds = findLinkedItemIdsSorted(expiredIds);
        lockAndBumpItemsVersion(linkedItemIds, List.of(), currentInstant);
        return expiredIds.size();
    }

    public List<UUID> findLinkedItemIdsSorted(Collection<UUID> listingIds) {
        if (listingIds == null || listingIds.isEmpty()) {
            return List.of();
        }
        UUID[] ids = listingIds.stream().distinct().toArray(UUID[]::new);
        List<UUID> itemIds = new ArrayList<>();
        db.query(
                con -> {
                    PreparedStatement ps = con.prepareStatement(
                            """
                            SELECT DISTINCT ma_vat
                            FROM tin_dang_do_vat
                            WHERE ma_tin = ANY(?)
                            ORDER BY ma_vat ASC
                            """
                    );
                    ps.setArray(1, con.createArrayOf("uuid", ids));
                    return ps;
                },
                rs -> {
                    itemIds.add(rs.getObject("ma_vat", UUID.class));
                }
        );
        return List.copyOf(itemIds);
    }

    /**
     * Locks union(itemIdsToBump, extraItemIdsToLock) in ascending ma_vat order and bumps version
     * for itemIdsToBump without mutating do_vats.trang_thai.
     */
    public void lockAndBumpItemsVersion(
            Collection<UUID> itemIdsToBump,
            Collection<UUID> extraItemIdsToLock,
            Instant currentInstant
    ) {
        LinkedHashSet<UUID> allToLock = new LinkedHashSet<>();
        if (itemIdsToBump != null) {
            allToLock.addAll(itemIdsToBump);
        }
        if (extraItemIdsToLock != null) {
            allToLock.addAll(extraItemIdsToLock);
        }
        if (allToLock.isEmpty()) {
            return;
        }
        UUID[] sortedToLock = allToLock.stream()
                .sorted(Comparator.comparing(UUID::toString))
                .toArray(UUID[]::new);
        db.query(
                con -> {
                    PreparedStatement ps = con.prepareStatement(
                            """
                            SELECT ma_vat
                            FROM do_vats
                            WHERE ma_vat = ANY(?)
                            ORDER BY ma_vat ASC
                            FOR UPDATE
                            """
                    );
                    ps.setArray(1, con.createArrayOf("uuid", sortedToLock));
                    return ps;
                },
                rs -> {
                }
        );
        if (itemIdsToBump == null || itemIdsToBump.isEmpty()) {
            return;
        }
        UUID[] sortedToBump = itemIdsToBump.stream()
                .distinct()
                .sorted(Comparator.comparing(UUID::toString))
                .toArray(UUID[]::new);
        Timestamp current = Timestamp.from(currentInstant != null ? currentInstant : now());
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "UPDATE do_vats SET version = version + 1, updated_at = ? WHERE ma_vat = ANY(?)"
            );
            ps.setTimestamp(1, current);
            ps.setArray(2, con.createArrayOf("uuid", sortedToBump));
            return ps;
        });
    }

    private void markListingsExpired(List<UUID> expiredIds, Timestamp current) {
        UUID[] ids = expiredIds.toArray(new UUID[0]);
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                    UPDATE tin_dangs
                    SET trang_thai = 'HET_HAN',
                        closed_at = ?,
                        updated_at = ?,
                        version = version + 1
                    WHERE ma_tin = ANY(?)
                      AND trang_thai = 'CONG_KHAI'
                    """
            );
            ps.setTimestamp(1, current);
            ps.setTimestamp(2, current);
            ps.setArray(3, con.createArrayOf("uuid", ids));
            return ps;
        });
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
        List<UUID> dueIds = db.queryForList(
                """
                SELECT ma_tin
                FROM tin_dangs
                WHERE nguoi_dang_id = ?
                  AND trang_thai = 'CONG_KHAI'
                  AND expires_at IS NOT NULL
                  AND expires_at > ?
                  AND expires_at <= ?
                  AND renewal_reminded_at IS NULL
                ORDER BY ma_tin ASC
                FOR UPDATE SKIP LOCKED
                """,
                UUID.class,
                sellerId,
                current,
                reminderCutoff
        );
        if (dueIds.isEmpty()) {
            return 0;
        }
        UUID[] ids = dueIds.toArray(new UUID[0]);
        return db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "UPDATE tin_dangs SET renewal_reminded_at = ? WHERE ma_tin = ANY(?) AND renewal_reminded_at IS NULL"
            );
            ps.setTimestamp(1, current);
            ps.setArray(2, con.createArrayOf("uuid", ids));
            return ps;
        });
    }

    /**
     * FR-05 quota computation: reconciles expired listings first, then counts only active CONG_KHAI + GIU_CHO.
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
     * Read-only active quota count (non-expired CONG_KHAI + GIU_CHO) when seller row is already
     * locked and expired listings have already been reconciled inside the caller's transaction.
     */
    public ListingDtos.ListingQuotaDto loadQuotaForScore(UUID sellerId, int reputationScore) {
        Timestamp current = Timestamp.from(now());
        Integer activeCount = db.queryForObject(
                """
                SELECT COUNT(*)
                FROM tin_dangs
                WHERE nguoi_dang_id = ?
                  AND (
                      trang_thai = 'GIU_CHO'
                      OR (trang_thai = 'CONG_KHAI' AND (expires_at IS NULL OR expires_at > ?))
                  )
                """,
                Integer.class,
                sellerId,
                current
        );
        return buildQuota(reputationScore, activeCount != null ? activeCount : 0);
    }
}
