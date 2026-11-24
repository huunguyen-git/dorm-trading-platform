package com.dormtrading.catalog.listing;

import com.dormtrading.catalog.ListingDtos;
import com.dormtrading.catalog.ListingLifecycleHelper;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class ListingAssembler {

    static final Set<String> LOCKED_LISTING_STATUSES = Set.of(
            ListingDtos.ListingStatus.GIU_CHO.name(),
            ListingDtos.ListingStatus.KET_THUC.name(),
            ListingDtos.ListingStatus.AN.name()
    );

    private final JdbcTemplate db;

    ListingAssembler(JdbcTemplate db) {
        this.db = db;
    }

    record ListingRow(
            UUID id,
            UUID sellerId,
            String title,
            String description,
            String condition,
            int priceVnd,
            String listingType,
            String status,
            String categoryId,
            String categoryName,
            String categoryParentId,
            String categoryDescription,
            String courseCode,
            String courseName,
            String author,
            String locationCode,
            String locationName,
            String locationText,
            Double latitude,
            Double longitude,
            List<String> images,
            Instant publishedAt,
            Instant expiresAt,
            Instant renewalRemindedAt,
            Instant closedAt,
            int renewalCount,
            String hiddenReason,
            Instant createdAt,
            Instant updatedAt,
            long version
    ) {
    }

    record ItemStats(int itemCount, boolean hasUnavailableItems) {
    }

    ListingRow mapListingRow(ResultSet rs, int rowNum) throws SQLException {
        return new ListingRow(
                rs.getObject("ma_tin", UUID.class),
                rs.getObject("nguoi_dang_id", UUID.class),
                rs.getString("tieu_de"),
                rs.getString("mo_ta"),
                rs.getString("tinh_trang"),
                rs.getInt("gia_vnd"),
                rs.getString("hinh_thuc"),
                rs.getString("trang_thai"),
                rs.getString("ma_danh_muc"),
                rs.getString("category_name"),
                rs.getString("category_parent_id"),
                rs.getString("category_description"),
                rs.getString("ma_mon_hoc"),
                rs.getString("ten_mon_hoc"),
                rs.getString("tac_gia"),
                rs.getString("ma_khu_vuc"),
                rs.getString("location_name"),
                rs.getString("khu_vuc"),
                getNullableDouble(rs, "vi_do"),
                getNullableDouble(rs, "kinh_do"),
                extractTextArray(rs, "hinh_anh"),
                toInstant(rs.getTimestamp("published_at")),
                toInstant(rs.getTimestamp("expires_at")),
                toInstant(rs.getTimestamp("renewal_reminded_at")),
                toInstant(rs.getTimestamp("closed_at")),
                rs.getInt("so_lan_gia_han"),
                rs.getString("ly_do_an"),
                toInstant(rs.getTimestamp("created_at")),
                toInstant(rs.getTimestamp("updated_at")),
                rs.getLong("version")
        );
    }

    ListingDtos.SellerPublicSummaryDto loadSellerPublicSummary(UUID sellerId) {
        List<ListingDtos.SellerPublicSummaryDto> rows = db.query(
                """
                SELECT u.user_id,
                       u.ho_ten,
                       u.diem_uy_tin,
                       COALESCE(r.review_count, 0) AS review_count,
                       r.avg_rating
                FROM thanh_viens u
                LEFT JOIN (
                    SELECT nguoi_bi_danh_gia_id,
                           COUNT(*)::int AS review_count,
                           AVG(so_sao)::double precision AS avg_rating
                    FROM danh_gias
                    WHERE trang_thai = 'CHAP_NHAN'
                    GROUP BY nguoi_bi_danh_gia_id
                ) r ON r.nguoi_bi_danh_gia_id = u.user_id
                WHERE u.user_id = ?
                """,
                (rs, rowNum) -> {
                    int reviewCount = rs.getInt("review_count");
                    Double rawAvg = getNullableDouble(rs, "avg_rating");
                    Double roundedAvg = (reviewCount > 0 && rawAvg != null)
                            ? Math.round(rawAvg * 100.0) / 100.0
                            : null;
                    return new ListingDtos.SellerPublicSummaryDto(
                            rs.getObject("user_id", UUID.class),
                            rs.getString("ho_ten"),
                            rs.getInt("diem_uy_tin"),
                            roundedAvg,
                            reviewCount
                    );
                },
                sellerId
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    ListingDtos.ListingDetailDto loadDetailForOwner(UUID listingId, Instant now) {
        List<ListingRow> rows = db.query(
                """
                SELECT t.ma_tin,
                       t.nguoi_dang_id,
                       t.tieu_de,
                       t.mo_ta,
                       t.tinh_trang,
                       t.gia_vnd,
                       t.hinh_thuc,
                       t.trang_thai,
                       t.ma_danh_muc,
                       dm.ten AS category_name,
                       dm.danh_muc_cha_id AS category_parent_id,
                       dm.mo_ta AS category_description,
                       t.ma_mon_hoc,
                       t.ten_mon_hoc,
                       t.tac_gia,
                       t.ma_khu_vuc,
                       kv.ten AS location_name,
                       t.khu_vuc,
                       t.vi_do,
                       t.kinh_do,
                       t.hinh_anh,
                       t.published_at,
                       t.expires_at,
                       t.renewal_reminded_at,
                       t.closed_at,
                       t.so_lan_gia_han,
                       t.ly_do_an,
                       t.created_at,
                       t.updated_at,
                       t.version
                FROM tin_dangs t
                LEFT JOIN danh_mucs dm ON dm.ma_danh_muc = t.ma_danh_muc
                LEFT JOIN khu_vucs kv ON kv.ma_khu_vuc = t.ma_khu_vuc
                WHERE t.ma_tin = ?
                """,
                this::mapListingRow,
                listingId
        );
        if (rows.isEmpty()) {
            return null;
        }
        ListingRow row = rows.getFirst();
        List<ListingDtos.ListingItemSummaryDto> items = loadListingItems(listingId);
        boolean hasUnavailableItems = items.stream().anyMatch(item -> !"KHA_DUNG".equals(item.status()));
        ListingDtos.SellerPublicSummaryDto seller = loadSellerPublicSummary(row.sellerId());
        ListingDtos.ListingSummaryDto summary = toSummary(row, new ItemStats(items.size(), hasUnavailableItems), seller, now);

        ListingDtos.ListingCategoryDto category = row.categoryId() == null
                ? null
                : new ListingDtos.ListingCategoryDto(
                        row.categoryId(),
                        row.categoryName(),
                        row.categoryParentId(),
                        row.categoryDescription()
                );

        int activeTxCount = countActiveTransactions(listingId);
        int anyTxCount = countAllTransactions(listingId);
        int pendingRequestCount = countPendingRequests(listingId);

        ListingDtos.ListingViewerContextDto viewer = buildOwnerViewerContext(row.status(), activeTxCount > 0, anyTxCount > 0);
        return ListingDtos.ListingDetailDto.fromSummary(
                summary,
                category,
                items,
                viewer,
                pendingRequestCount,
                row.closedAt(),
                row.hiddenReason()
        );
    }

    List<ListingDtos.ListingSummaryDto> loadPagedSummariesForSeller(
            UUID sellerId,
            String statusFilter,
            int page,
            int size,
            ListingDtos.SellerPublicSummaryDto seller,
            Instant now
    ) {
        StringBuilder sql = new StringBuilder(
                """
                SELECT t.ma_tin,
                       t.nguoi_dang_id,
                       t.tieu_de,
                       t.mo_ta,
                       t.tinh_trang,
                       t.gia_vnd,
                       t.hinh_thuc,
                       t.trang_thai,
                       t.ma_danh_muc,
                       dm.ten AS category_name,
                       dm.danh_muc_cha_id AS category_parent_id,
                       dm.mo_ta AS category_description,
                       t.ma_mon_hoc,
                       t.ten_mon_hoc,
                       t.tac_gia,
                       t.ma_khu_vuc,
                       kv.ten AS location_name,
                       t.khu_vuc,
                       t.vi_do,
                       t.kinh_do,
                       t.hinh_anh,
                       t.published_at,
                       t.expires_at,
                       t.renewal_reminded_at,
                       t.closed_at,
                       t.so_lan_gia_han,
                       t.ly_do_an,
                       t.created_at,
                       t.updated_at,
                       t.version
                FROM tin_dangs t
                LEFT JOIN danh_mucs dm ON dm.ma_danh_muc = t.ma_danh_muc
                LEFT JOIN khu_vucs kv ON kv.ma_khu_vuc = t.ma_khu_vuc
                WHERE t.nguoi_dang_id = ?
                """
        );
        List<Object> params = new ArrayList<>();
        params.add(sellerId);
        if (statusFilter != null) {
            sql.append(" AND t.trang_thai = ? ");
            params.add(statusFilter);
        }
        sql.append(" ORDER BY t.updated_at DESC, t.created_at DESC, t.ma_tin ASC LIMIT ? OFFSET ? ");
        params.add(size);
        params.add((long) page * size);

        List<ListingRow> rows = db.query(sql.toString(), this::mapListingRow, params.toArray());
        if (rows.isEmpty()) {
            return List.of();
        }

        List<UUID> listingIds = rows.stream().map(ListingRow::id).toList();
        Map<UUID, ItemStats> statsByListing = loadItemStatsBatch(listingIds);

        List<ListingDtos.ListingSummaryDto> summaries = new ArrayList<>(rows.size());
        for (ListingRow row : rows) {
            ItemStats stats = statsByListing.getOrDefault(row.id(), new ItemStats(0, false));
            summaries.add(toSummary(row, stats, seller, now));
        }
        return summaries;
    }

    ListingDtos.ListingSummaryDto toSummary(
            ListingRow row,
            ItemStats stats,
            ListingDtos.SellerPublicSummaryDto seller,
            Instant now
    ) {
        int itemCount = stats.itemCount();
        boolean isCombo = itemCount >= 2 || ListingDtos.ListingType.BAN_COMBO.name().equals(row.listingType());
        boolean isFree = row.priceVnd() == 0;
        String thumbnailUrl = row.images().isEmpty() ? null : row.images().getFirst();
        boolean renewalReminderDue = ListingLifecycleHelper.isRenewalReminderDue(row.status(), row.expiresAt(), now);

        return new ListingDtos.ListingSummaryDto(
                row.id(),
                row.title(),
                row.description(),
                row.condition(),
                row.priceVnd(),
                row.listingType(),
                isCombo,
                isFree,
                row.status(),
                row.categoryId(),
                row.categoryName(),
                row.courseCode(),
                row.courseName(),
                row.author(),
                row.locationCode(),
                row.locationName(),
                row.locationText(),
                row.latitude(),
                row.longitude(),
                null,
                thumbnailUrl,
                row.images(),
                itemCount,
                seller,
                stats.hasUnavailableItems(),
                row.publishedAt(),
                row.expiresAt(),
                renewalReminderDue,
                row.renewalCount(),
                row.createdAt(),
                row.updatedAt(),
                row.version()
        );
    }

    List<ListingDtos.ListingItemSummaryDto> loadListingItems(UUID listingId) {
        return db.query(
                """
                SELECT dv.ma_vat, dv.ten, dv.tinh_trang, dv.trang_thai, dv.hinh_anh
                FROM tin_dang_do_vat td
                JOIN do_vats dv ON dv.ma_vat = td.ma_vat
                WHERE td.ma_tin = ?
                ORDER BY dv.created_at ASC, dv.ma_vat ASC
                """,
                (rs, rowNum) -> new ListingDtos.ListingItemSummaryDto(
                        rs.getObject("ma_vat", UUID.class),
                        rs.getString("ten"),
                        rs.getString("tinh_trang"),
                        rs.getString("trang_thai"),
                        extractTextArray(rs, "hinh_anh")
                ),
                listingId
        );
    }

    Map<UUID, ItemStats> loadItemStatsBatch(List<UUID> listingIds) {
        if (listingIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, ItemStats> stats = new HashMap<>();
        db.query(
                con -> {
                    var ps = con.prepareStatement(
                            """
                            SELECT td.ma_tin,
                                   COUNT(dv.ma_vat)::int AS item_count,
                                   BOOL_OR(dv.trang_thai <> 'KHA_DUNG') AS has_unavailable
                            FROM tin_dang_do_vat td
                            JOIN do_vats dv ON dv.ma_vat = td.ma_vat
                            WHERE td.ma_tin = ANY(?)
                            GROUP BY td.ma_tin
                            """
                    );
                    ps.setArray(1, con.createArrayOf("uuid", listingIds.toArray(new UUID[0])));
                    return ps;
                },
                rs -> {
                    UUID listingId = rs.getObject("ma_tin", UUID.class);
                    int itemCount = rs.getInt("item_count");
                    boolean hasUnavailable = rs.getBoolean("has_unavailable");
                    stats.put(listingId, new ItemStats(itemCount, hasUnavailable));
                }
        );
        return stats;
    }

    int countActiveTransactions(UUID listingId) {
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

    int countAllTransactions(UUID listingId) {
        Integer count = db.queryForObject(
                "SELECT COUNT(*) FROM giao_dichs WHERE ma_tin = ?",
                Integer.class,
                listingId
        );
        return count != null ? count : 0;
    }

    int countPendingRequests(UUID listingId) {
        Integer count = db.queryForObject(
                "SELECT COUNT(*) FROM giao_dichs WHERE ma_tin = ? AND trang_thai = 'YEU_CAU'",
                Integer.class,
                listingId
        );
        return count != null ? count : 0;
    }

    ListingDtos.ListingViewerContextDto buildOwnerViewerContext(
            String status,
            boolean hasActiveTransactions,
            boolean hasAnyTransactions
    ) {
        boolean locked = LOCKED_LISTING_STATUSES.contains(status) || hasActiveTransactions;
        boolean canEdit = !locked;
        boolean canWithdraw = !locked
                && (ListingDtos.ListingStatus.CONG_KHAI.name().equals(status)
                || ListingDtos.ListingStatus.CHO_DUYET.name().equals(status));
        boolean canDelete = !locked && !hasAnyTransactions;
        boolean canPublish = !locked
                && (ListingDtos.ListingStatus.NHAP.name().equals(status)
                || ListingDtos.ListingStatus.DA_RUT.name().equals(status)
                || ListingDtos.ListingStatus.HET_HAN.name().equals(status));
        boolean canRenew = !locked
                && (ListingDtos.ListingStatus.CONG_KHAI.name().equals(status)
                || ListingDtos.ListingStatus.HET_HAN.name().equals(status));

        return new ListingDtos.ListingViewerContextDto(
                true,
                canEdit,
                canWithdraw,
                canDelete,
                canPublish,
                canRenew,
                false,
                false,
                false
        );
    }

    static List<String> extractTextArray(ResultSet rs, String column) throws SQLException {
        Array sqlArray = rs.getArray(column);
        if (sqlArray == null) {
            return List.of();
        }
        Object raw = sqlArray.getArray();
        if (raw instanceof String[] values) {
            return List.of(values);
        }
        return List.of();
    }

    static Double getNullableDouble(ResultSet rs, String column) throws SQLException {
        double value = rs.getDouble(column);
        return rs.wasNull() ? null : value;
    }

    static Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }
}
