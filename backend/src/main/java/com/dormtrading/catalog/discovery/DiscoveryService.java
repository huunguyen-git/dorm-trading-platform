package com.dormtrading.catalog.discovery;

import com.dormtrading.catalog.ListingDtos;
import com.dormtrading.catalog.ListingLifecycleHelper;
import com.dormtrading.catalog.ListingValidation;
import com.dormtrading.iam.auth.AuthFailure;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DiscoveryService {

    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_DISCOVERY_PAGE_SIZE = 50;
    public static final int MAX_LEGACY_OFFSET = 10000;

    private final JdbcTemplate db;
    private final ListingLifecycleHelper lifecycleHelper;

    public DiscoveryService(JdbcTemplate db, ListingLifecycleHelper lifecycleHelper) {
        this.db = db;
        this.lifecycleHelper = lifecycleHelper;
    }

    public record SearchCriteria(
            String q,
            String categoryId,
            String courseCode,
            Integer minPrice,
            Integer maxPrice,
            Boolean freeOnly,
            String type,
            String locationCode,
            String location,
            Double lat,
            Double lng,
            Double radiusKm,
            String sort,
            Integer page,
            Integer size,
            Integer offset
    ) {
    }

    @Transactional(readOnly = true)
    public ListingDtos.CategoriesResponse getCategories() {
        List<ListingDtos.ListingCategoryDto> items = db.query(
                """
                SELECT ma_danh_muc, ten, danh_muc_cha_id, mo_ta
                FROM danh_mucs
                WHERE hien_thi = TRUE
                ORDER BY danh_muc_cha_id NULLS FIRST, ma_danh_muc ASC
                """,
                (rs, rowNum) -> new ListingDtos.ListingCategoryDto(
                        rs.getString("ma_danh_muc"),
                        rs.getString("ten"),
                        rs.getString("danh_muc_cha_id"),
                        rs.getString("mo_ta")
                )
        );

        Map<String, ListingDtos.ListingCategoryDto> byId = new LinkedHashMap<>();
        for (ListingDtos.ListingCategoryDto item : items) {
            byId.put(item.id(), item);
        }

        Map<String, List<ListingDtos.ListingCategoryDto>> childrenByParent = new LinkedHashMap<>();
        List<ListingDtos.ListingCategoryDto> roots = new ArrayList<>();
        for (ListingDtos.ListingCategoryDto item : items) {
            if (item.parentId() != null && byId.containsKey(item.parentId())) {
                childrenByParent.computeIfAbsent(item.parentId(), k -> new ArrayList<>()).add(item);
            } else {
                roots.add(item);
            }
        }

        List<ListingDtos.CategoryTreeNodeDto> tree = new ArrayList<>(roots.size());
        for (ListingDtos.ListingCategoryDto root : roots) {
            tree.add(buildTreeNode(root, childrenByParent, new HashSet<>()));
        }

        return new ListingDtos.CategoriesResponse(List.copyOf(items), List.copyOf(tree));
    }

    @Transactional(readOnly = true)
    public ListingDtos.LocationsResponse getLocations() {
        List<ListingDtos.LocationZoneDto> items = db.query(
                """
                SELECT ma_khu_vuc, ten, nhom, vi_do, kinh_do
                FROM khu_vucs
                WHERE hien_thi = TRUE
                ORDER BY thu_tu ASC, ma_khu_vuc ASC
                """,
                (rs, rowNum) -> new ListingDtos.LocationZoneDto(
                        rs.getString("ma_khu_vuc"),
                        rs.getString("ten"),
                        rs.getString("nhom"),
                        rs.getDouble("vi_do"),
                        rs.getDouble("kinh_do")
                )
        );
        return new ListingDtos.LocationsResponse(List.copyOf(items));
    }

    @Transactional
    public ListingDtos.ListingPageDto searchListings(SearchCriteria criteria) {
        SearchCriteria input = criteria != null
                ? criteria
                : new SearchCriteria(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);

        ListingValidation.validatePriceRange(input.minPrice(), input.maxPrice());

        int resolvedSize = input.size() != null ? input.size() : DEFAULT_PAGE_SIZE;
        if (resolvedSize < 1 || resolvedSize > MAX_DISCOVERY_PAGE_SIZE) {
            throw new AuthFailure(400, "INVALID_INPUT", "Kích thước trang phải từ 1 đến " + MAX_DISCOVERY_PAGE_SIZE + ".");
        }

        if (input.offset() != null && (input.offset() < 0 || input.offset() > MAX_LEGACY_OFFSET)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Vị trí trang không hợp lệ.");
        }

        int resolvedPage;
        if (input.page() != null) {
            resolvedPage = ListingValidation.validatePage(input.page());
        } else if (input.offset() != null) {
            resolvedPage = input.offset() / resolvedSize;
        } else {
            resolvedPage = 0;
        }

        String resolvedType = normalizeType(input.type());
        String resolvedSort = normalizeSort(input.sort());

        String trimmedQ = trimToNull(input.q());
        String trimmedCategoryId = trimToNull(input.categoryId());
        String trimmedCourseCode = trimToNull(input.courseCode());
        String trimmedLocationCode = trimToNull(input.locationCode());
        String trimmedLocation = trimToNull(input.location());

        if (input.lat() != null || input.lng() != null) {
            ListingValidation.validateCoordinates(input.lat(), input.lng());
        }
        if (input.radiusKm() != null) {
            if (Double.isNaN(input.radiusKm()) || Double.isInfinite(input.radiusKm()) || input.radiusKm() <= 0.0) {
                throw new AuthFailure(400, "INVALID_LOCATION", "Bán kính tìm kiếm phải lớn hơn 0 km.");
            }
        }

        Double originLat = null;
        Double originLng = null;
        boolean applyExactLocationCodeFilter;
        boolean needsOriginCoords = input.radiusKm() != null || "distance_asc".equals(resolvedSort);

        if (input.lat() != null && input.lng() != null) {
            originLat = input.lat();
            originLng = input.lng();
            applyExactLocationCodeFilter = trimmedLocationCode != null;
        } else if (needsOriginCoords) {
            if (trimmedLocationCode == null) {
                throw new AuthFailure(
                        400,
                        "INVALID_LOCATION",
                        "Cần cung cấp đầy đủ tọa độ (lat, lng) hoặc mã khu vực (locationCode) hợp lệ."
                );
            }
            Coordinates zoneCoords = findLocationCoordinates(trimmedLocationCode);
            if (zoneCoords == null) {
                throw new AuthFailure(
                        400,
                        "INVALID_LOCATION",
                        "Mã khu vực không tồn tại hoặc không khả dụng để tính khoảng cách."
                );
            }
            originLat = zoneCoords.latitude();
            originLng = zoneCoords.longitude();
            applyExactLocationCodeFilter = false;
        } else {
            applyExactLocationCodeFilter = trimmedLocationCode != null;
        }

        // Lazily expire overdue CONG_KHAI listings before running public discovery
        lifecycleHelper.reconcileAllExpiredListings();
        Instant now = lifecycleHelper.now();
        Timestamp nowTs = Timestamp.from(now);

        StringBuilder cteSql = new StringBuilder();
        List<Object> cteParams = new ArrayList<>();

        if (trimmedCategoryId != null) {
            cteSql.append("""
                    WITH RECURSIVE cat_tree AS (
                        SELECT ma_danh_muc
                        FROM danh_mucs
                        WHERE ma_danh_muc = ? AND hien_thi = TRUE
                        UNION
                        SELECT c.ma_danh_muc
                        FROM danh_mucs c
                        JOIN cat_tree ct ON c.danh_muc_cha_id = ct.ma_danh_muc
                        WHERE c.hien_thi = TRUE
                    ),
                    candidate_listings AS (
                    """);
            cteParams.add(trimmedCategoryId);
        } else {
            cteSql.append("WITH candidate_listings AS (\n");
        }

        cteSql.append("""
                    SELECT
                        t.ma_tin,
                        t.nguoi_dang_id,
                        t.tieu_de,
                        t.mo_ta,
                        t.tinh_trang,
                        t.gia_vnd,
                        t.hinh_thuc,
                        t.trang_thai,
                        t.ma_danh_muc,
                        dm.ten AS category_name,
                        t.ma_mon_hoc,
                        t.ten_mon_hoc,
                        t.tac_gia,
                        t.ma_khu_vuc,
                        k.ten AS location_name,
                        t.khu_vuc,
                        COALESCE(t.vi_do, k.vi_do) AS resolved_lat,
                        COALESCE(t.kinh_do, k.kinh_do) AS resolved_lng,
                """);

        if (originLat != null && originLng != null) {
            cteSql.append("""
                        CASE
                            WHEN COALESCE(t.vi_do, k.vi_do) IS NOT NULL
                             AND COALESCE(t.kinh_do, k.kinh_do) IS NOT NULL
                            THEN 2.0 * 6371.0 * asin(sqrt(LEAST(1.0, GREATEST(0.0,
                                power(sin(radians(COALESCE(t.vi_do, k.vi_do) - ?) / 2.0), 2)
                                + cos(radians(?)) * cos(radians(COALESCE(t.vi_do, k.vi_do)))
                                  * power(sin(radians(COALESCE(t.kinh_do, k.kinh_do) - ?) / 2.0), 2)
                            ))))
                            ELSE NULL
                        END AS distance_km,
                    """);
            cteParams.add(originLat);
            cteParams.add(originLat);
            cteParams.add(originLng);
        } else {
            cteSql.append("        CAST(NULL AS DOUBLE PRECISION) AS distance_km,\n");
        }

        cteSql.append("""
                        t.hinh_anh,
                        t.published_at,
                        t.expires_at,
                        t.so_lan_gia_han,
                        t.created_at,
                        t.updated_at,
                        t.version,
                        u.ho_ten AS seller_display_name,
                        u.diem_uy_tin AS seller_reputation_score
                    FROM tin_dangs t
                    JOIN thanh_viens u ON u.user_id = t.nguoi_dang_id
                    LEFT JOIN danh_mucs dm ON dm.ma_danh_muc = t.ma_danh_muc
                    LEFT JOIN khu_vucs k ON k.ma_khu_vuc = t.ma_khu_vuc
                    WHERE t.trang_thai = 'CONG_KHAI'
                      AND (t.expires_at IS NULL OR t.expires_at > ?)
                      AND NOT EXISTS (
                          SELECT 1
                          FROM tin_dang_do_vat tdv_u
                          JOIN do_vats dv_u ON dv_u.ma_vat = tdv_u.ma_vat
                          WHERE tdv_u.ma_tin = t.ma_tin
                            AND dv_u.trang_thai <> 'KHA_DUNG'
                      )
                """);
        cteParams.add(nowTs);

        if (trimmedQ != null) {
            String pattern = toContainsPattern(trimmedQ);
            cteSql.append("""
                      AND (
                          t.tieu_de ILIKE ? ESCAPE '\\'
                          OR t.mo_ta ILIKE ? ESCAPE '\\'
                          OR t.ma_mon_hoc ILIKE ? ESCAPE '\\'
                          OR t.ten_mon_hoc ILIKE ? ESCAPE '\\'
                          OR t.tac_gia ILIKE ? ESCAPE '\\'
                          OR EXISTS (
                              SELECT 1
                              FROM tin_dang_do_vat tdv_q
                              JOIN do_vats dv_q ON dv_q.ma_vat = tdv_q.ma_vat
                              WHERE tdv_q.ma_tin = t.ma_tin
                                AND dv_q.ten ILIKE ? ESCAPE '\\'
                          )
                      )
                    """);
            for (int i = 0; i < 6; i++) {
                cteParams.add(pattern);
            }
        }

        if (trimmedCategoryId != null) {
            cteSql.append("      AND t.ma_danh_muc IN (SELECT ma_danh_muc FROM cat_tree)\n");
        }

        if (trimmedCourseCode != null) {
            cteSql.append("      AND t.ma_mon_hoc ILIKE ? ESCAPE '\\'\n");
            cteParams.add(toContainsPattern(trimmedCourseCode));
        }

        if (input.minPrice() != null) {
            cteSql.append("      AND t.gia_vnd >= ?\n");
            cteParams.add(input.minPrice());
        }

        if (input.maxPrice() != null) {
            cteSql.append("      AND t.gia_vnd <= ?\n");
            cteParams.add(input.maxPrice());
        }

        if (Boolean.TRUE.equals(input.freeOnly())) {
            cteSql.append("      AND t.gia_vnd = 0\n");
        }

        if (resolvedType != null) {
            switch (resolvedType) {
                case "SINGLE" -> cteSql.append("      AND t.hinh_thuc <> 'BAN_COMBO'\n");
                case "COMBO" -> cteSql.append("      AND t.hinh_thuc = 'BAN_COMBO'\n");
                case "FREE" -> cteSql.append("      AND t.gia_vnd = 0\n");
                default -> throw new AuthFailure(400, "INVALID_INPUT", "Loại tin đăng không hợp lệ.");
            }
        }

        if (applyExactLocationCodeFilter) {
            cteSql.append("      AND t.ma_khu_vuc = ?\n");
            cteParams.add(trimmedLocationCode);
        }

        if (trimmedLocation != null) {
            String locPattern = toContainsPattern(trimmedLocation);
            cteSql.append("      AND (t.khu_vuc ILIKE ? ESCAPE '\\' OR k.ten ILIKE ? ESCAPE '\\')\n");
            cteParams.add(locPattern);
            cteParams.add(locPattern);
        }

        cteSql.append(")\n");

        String radiusFilterClause = input.radiusKm() != null
                ? "WHERE distance_km IS NOT NULL AND distance_km <= ?\n"
                : "";

        StringBuilder countSql = new StringBuilder(cteSql);
        countSql.append("SELECT COUNT(*) FROM candidate_listings\n");
        countSql.append(radiusFilterClause);

        List<Object> countParams = new ArrayList<>(cteParams);
        if (input.radiusKm() != null) {
            countParams.add(input.radiusKm());
        }

        Long totalObj = db.queryForObject(countSql.toString(), Long.class, countParams.toArray());
        long totalElements = totalObj != null ? totalObj : 0L;
        if (totalElements == 0L) {
            return new ListingDtos.ListingPageDto(List.of(), resolvedPage, resolvedSize, 0L, 0);
        }

        String innerOrderBy = buildOrderByClause(resolvedSort, "");
        String outerOrderBy = buildOrderByClause(resolvedSort, "p.");

        StringBuilder dataSql = new StringBuilder(cteSql);
        dataSql.append(", paged_listings AS (\n");
        dataSql.append("    SELECT * FROM candidate_listings\n");
        if (!radiusFilterClause.isEmpty()) {
            dataSql.append("    ").append(radiusFilterClause);
        }
        dataSql.append("    ORDER BY ").append(innerOrderBy).append("\n");
        dataSql.append("    LIMIT ? OFFSET ?\n");
        dataSql.append(")\n");
        dataSql.append("""
                SELECT
                    p.*,
                    COALESCE(ic.item_count, 0) AS item_count,
                    seller_stats.avg_rating AS seller_avg_rating,
                    COALESCE(seller_stats.review_count, 0) AS seller_review_count
                FROM paged_listings p
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::int AS item_count
                    FROM tin_dang_do_vat tdv
                    WHERE tdv.ma_tin = p.ma_tin
                ) ic ON TRUE
                LEFT JOIN LATERAL (
                    SELECT
                        AVG(dg.so_sao)::double precision AS avg_rating,
                        COUNT(*)::int AS review_count
                    FROM danh_gias dg
                    WHERE dg.nguoi_bi_danh_gia_id = p.nguoi_dang_id
                      AND dg.trang_thai = 'CHAP_NHAN'
                ) seller_stats ON TRUE
                ORDER BY\s""").append(outerOrderBy);

        List<Object> dataParams = new ArrayList<>(cteParams);
        if (input.radiusKm() != null) {
            dataParams.add(input.radiusKm());
        }
        dataParams.add(resolvedSize);
        dataParams.add((long) resolvedPage * resolvedSize);

        List<ListingDtos.ListingSummaryDto> items = db.query(
                dataSql.toString(),
                (rs, rowNum) -> mapSummaryRow(rs, now, false),
                dataParams.toArray()
        );

        int totalPages = ListingValidation.calculateTotalPages(totalElements, resolvedSize);
        return new ListingDtos.ListingPageDto(List.copyOf(items), resolvedPage, resolvedSize, totalElements, totalPages);
    }

    @Transactional
    public ListingDtos.ListingDetailDto getListingDetail(
            UUID listingId,
            Jwt jwt,
            boolean isActiveMember,
            Double lat,
            Double lng
    ) {
        if (listingId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã tin đăng không hợp lệ.");
        }
        if (lat != null || lng != null) {
            ListingValidation.validateCoordinates(lat, lng);
        }

        Instant now = lifecycleHelper.now();
        Timestamp nowTs = Timestamp.from(now);

        // Lazily expire this specific CONG_KHAI listing if expires_at <= now (never closes GIU_CHO)
        db.update(
                """
                UPDATE tin_dangs
                SET trang_thai = 'HET_HAN', closed_at = ?, updated_at = ?, version = version + 1
                WHERE ma_tin = ?
                  AND trang_thai = 'CONG_KHAI'
                  AND expires_at IS NOT NULL
                  AND expires_at <= ?
                """,
                nowTs,
                nowTs,
                listingId,
                nowTs
        );

        List<DetailRow> rows = db.query(
                """
                SELECT
                    t.ma_tin,
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
                    k.ten AS location_name,
                    t.khu_vuc,
                    COALESCE(t.vi_do, k.vi_do) AS resolved_lat,
                    COALESCE(t.kinh_do, k.kinh_do) AS resolved_lng,
                    t.hinh_anh,
                    t.published_at,
                    t.expires_at,
                    t.so_lan_gia_han,
                    t.closed_at,
                    t.ly_do_an,
                    t.created_at,
                    t.updated_at,
                    t.version,
                    u.ho_ten AS seller_display_name,
                    u.diem_uy_tin AS seller_reputation_score,
                    seller_stats.avg_rating AS seller_avg_rating,
                    COALESCE(seller_stats.review_count, 0) AS seller_review_count
                FROM tin_dangs t
                JOIN thanh_viens u ON u.user_id = t.nguoi_dang_id
                LEFT JOIN danh_mucs dm ON dm.ma_danh_muc = t.ma_danh_muc
                LEFT JOIN khu_vucs k ON k.ma_khu_vuc = t.ma_khu_vuc
                LEFT JOIN LATERAL (
                    SELECT
                        AVG(dg.so_sao)::double precision AS avg_rating,
                        COUNT(*)::int AS review_count
                    FROM danh_gias dg
                    WHERE dg.nguoi_bi_danh_gia_id = t.nguoi_dang_id
                      AND dg.trang_thai = 'CHAP_NHAN'
                ) seller_stats ON TRUE
                WHERE t.ma_tin = ?
                """,
                (rs, rowNum) -> mapDetailRow(rs),
                listingId
        );

        if (rows.isEmpty()) {
            throw new AuthFailure(404, "LISTING_NOT_FOUND", "Tin đăng không tồn tại hoặc đã bị gỡ bỏ.");
        }

        DetailRow row = rows.getFirst();
        UUID viewerId = ListingValidation.optionalUserId(jwt);
        boolean isOwner = viewerId != null && viewerId.equals(row.sellerId());

        if (!isOwner) {
            boolean publiclyVisible = ListingDtos.ListingStatus.isPubliclyVisible(row.status());
            boolean expiredPublic = ListingLifecycleHelper.isExpired(row.status(), row.expiresAt(), now);
            if (!publiclyVisible || expiredPublic) {
                throw new AuthFailure(404, "LISTING_NOT_FOUND", "Tin đăng không tồn tại hoặc đã bị gỡ bỏ.");
            }
        }

        List<ListingDtos.ListingItemSummaryDto> linkedItems = db.query(
                """
                SELECT dv.ma_vat, dv.ten, dv.tinh_trang, dv.trang_thai, dv.hinh_anh
                FROM tin_dang_do_vat tdv
                JOIN do_vats dv ON dv.ma_vat = tdv.ma_vat
                WHERE tdv.ma_tin = ?
                ORDER BY dv.created_at ASC, dv.ma_vat ASC
                """,
                (rs, rowNum) -> new ListingDtos.ListingItemSummaryDto(
                        rs.getObject("ma_vat", UUID.class),
                        rs.getString("ten"),
                        rs.getString("tinh_trang"),
                        rs.getString("trang_thai"),
                        extractStringArray(rs, "hinh_anh")
                ),
                listingId
        );

        boolean hasUnavailableItems = linkedItems.stream()
                .anyMatch(item -> !"KHA_DUNG".equals(item.status()));

        TransactionStats txStats = db.queryForObject(
                """
                SELECT
                    COUNT(*) FILTER (WHERE trang_thai = 'YEU_CAU')::int AS pending_request_count,
                    COUNT(*) FILTER (WHERE trang_thai IN ('GIU_CHO', 'DANG_GIAO', 'CHO_XAC_NHAN', 'CHO_XU_LY'))::int AS active_tx_count,
                    COUNT(*)::int AS total_tx_count
                FROM giao_dichs
                WHERE ma_tin = ?
                """,
                (rs, rowNum) -> new TransactionStats(
                        rs.getInt("pending_request_count"),
                        rs.getInt("active_tx_count"),
                        rs.getInt("total_tx_count")
                ),
                listingId
        );
        int pendingRequestCount = txStats != null ? txStats.pendingRequestCount() : 0;
        boolean hasActiveTx = txStats != null && txStats.activeTxCount() > 0;
        int totalTxCount = txStats != null ? txStats.totalTxCount() : 0;

        Double distanceKm = null;
        if (lat != null && lng != null && row.latitude() != null && row.longitude() != null) {
            distanceKm = ListingValidation.roundDistanceKm(
                    ListingValidation.haversineKm(lat, lng, row.latitude(), row.longitude())
            );
        }

        int itemCount = linkedItems.size();
        boolean isCombo = ListingDtos.ListingType.BAN_COMBO.name().equals(row.listingType()) || itemCount >= 2;
        boolean isFree = row.priceVnd() == 0;
        boolean renewalReminderDue = ListingLifecycleHelper.isRenewalReminderDue(row.status(), row.expiresAt(), now);

        ListingDtos.ListingSummaryDto summary = new ListingDtos.ListingSummaryDto(
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
                distanceKm,
                row.images().isEmpty() ? null : row.images().getFirst(),
                row.images(),
                itemCount,
                row.seller(),
                hasUnavailableItems,
                row.publishedAt(),
                row.expiresAt(),
                renewalReminderDue,
                row.renewalCount(),
                row.createdAt(),
                row.updatedAt(),
                row.version()
        );

        ListingDtos.ListingCategoryDto category = row.categoryId() != null
                ? new ListingDtos.ListingCategoryDto(
                        row.categoryId(),
                        row.categoryName(),
                        row.categoryParentId(),
                        row.categoryDescription()
                )
                : null;

        boolean isPublic = ListingDtos.ListingStatus.CONG_KHAI.name().equals(row.status());
        boolean isReserved = ListingDtos.ListingStatus.GIU_CHO.name().equals(row.status());
        boolean isDraft = ListingDtos.ListingStatus.NHAP.name().equals(row.status());
        boolean isPendingModeration = ListingDtos.ListingStatus.CHO_DUYET.name().equals(row.status());
        boolean isWithdrawn = ListingDtos.ListingStatus.DA_RUT.name().equals(row.status());
        boolean isExpired = ListingDtos.ListingStatus.HET_HAN.name().equals(row.status());
        boolean isLockedStatus = isReserved
                || ListingDtos.ListingStatus.KET_THUC.name().equals(row.status())
                || ListingDtos.ListingStatus.AN.name().equals(row.status());
        boolean ownerCanMutate = isOwner && isActiveMember;

        ListingDtos.ListingViewerContextDto viewer = new ListingDtos.ListingViewerContextDto(
                isOwner,
                ownerCanMutate && !isLockedStatus && !hasActiveTx,
                ownerCanMutate && (isPublic || isPendingModeration) && !hasActiveTx,
                ownerCanMutate && !isLockedStatus && !hasActiveTx && totalTxCount == 0,
                ownerCanMutate && (isDraft || isWithdrawn || isExpired),
                ownerCanMutate && (isPublic || isExpired),
                !isOwner && isPublic && !isFree && !hasUnavailableItems,
                !isOwner && isPublic && !hasUnavailableItems,
                !isOwner && (isPublic || isReserved)
        );

        String hiddenReason = isOwner ? row.hiddenReason() : null;

        return ListingDtos.ListingDetailDto.fromSummary(
                summary,
                category,
                linkedItems,
                viewer,
                pendingRequestCount,
                row.closedAt(),
                hiddenReason
        );
    }

    private ListingDtos.CategoryTreeNodeDto buildTreeNode(
            ListingDtos.ListingCategoryDto node,
            Map<String, List<ListingDtos.ListingCategoryDto>> childrenByParent,
            Set<String> visiting
    ) {
        if (!visiting.add(node.id())) {
            return new ListingDtos.CategoryTreeNodeDto(
                    node.id(),
                    node.name(),
                    node.parentId(),
                    node.description(),
                    List.of()
            );
        }
        List<ListingDtos.ListingCategoryDto> directChildren = childrenByParent.getOrDefault(node.id(), List.of());
        List<ListingDtos.CategoryTreeNodeDto> childNodes = new ArrayList<>(directChildren.size());
        for (ListingDtos.ListingCategoryDto child : directChildren) {
            childNodes.add(buildTreeNode(child, childrenByParent, visiting));
        }
        visiting.remove(node.id());
        return new ListingDtos.CategoryTreeNodeDto(
                node.id(),
                node.name(),
                node.parentId(),
                node.description(),
                List.copyOf(childNodes)
        );
    }

    private Coordinates findLocationCoordinates(String locationCode) {
        List<Coordinates> rows = db.query(
                "SELECT vi_do, kinh_do FROM khu_vucs WHERE ma_khu_vuc = ? AND hien_thi = TRUE",
                (rs, rowNum) -> new Coordinates(rs.getDouble("vi_do"), rs.getDouble("kinh_do")),
                locationCode
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private ListingDtos.ListingSummaryDto mapSummaryRow(
            ResultSet rs,
            Instant now,
            boolean hasUnavailableItems
    ) throws SQLException {
        List<String> images = extractStringArray(rs, "hinh_anh");
        String listingType = rs.getString("hinh_thuc");
        int priceVnd = rs.getInt("gia_vnd");
        int itemCount = rs.getInt("item_count");
        boolean isCombo = ListingDtos.ListingType.BAN_COMBO.name().equals(listingType) || itemCount >= 2;
        boolean isFree = priceVnd == 0;
        String status = rs.getString("trang_thai");
        Instant publishedAt = getOptionalInstant(rs, "published_at");
        Instant expiresAt = getOptionalInstant(rs, "expires_at");
        Double rawDistance = getOptionalDouble(rs, "distance_km");
        Double roundedDistance = rawDistance != null ? ListingValidation.roundDistanceKm(rawDistance) : null;

        int reviewCount = rs.getInt("seller_review_count");
        Double rawAvgRating = getOptionalDouble(rs, "seller_avg_rating");
        Double roundedAvgRating = (reviewCount > 0 && rawAvgRating != null)
                ? roundTwoDecimals(rawAvgRating)
                : null;

        ListingDtos.SellerPublicSummaryDto seller = new ListingDtos.SellerPublicSummaryDto(
                rs.getObject("nguoi_dang_id", UUID.class),
                rs.getString("seller_display_name"),
                rs.getInt("seller_reputation_score"),
                roundedAvgRating,
                reviewCount
        );

        return new ListingDtos.ListingSummaryDto(
                rs.getObject("ma_tin", UUID.class),
                rs.getString("tieu_de"),
                rs.getString("mo_ta"),
                rs.getString("tinh_trang"),
                priceVnd,
                listingType,
                isCombo,
                isFree,
                status,
                rs.getString("ma_danh_muc"),
                rs.getString("category_name"),
                rs.getString("ma_mon_hoc"),
                rs.getString("ten_mon_hoc"),
                rs.getString("tac_gia"),
                rs.getString("ma_khu_vuc"),
                rs.getString("location_name"),
                rs.getString("khu_vuc"),
                getOptionalDouble(rs, "resolved_lat"),
                getOptionalDouble(rs, "resolved_lng"),
                roundedDistance,
                images.isEmpty() ? null : images.getFirst(),
                images,
                itemCount,
                seller,
                hasUnavailableItems,
                publishedAt,
                expiresAt,
                ListingLifecycleHelper.isRenewalReminderDue(status, expiresAt, now),
                rs.getInt("so_lan_gia_han"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getLong("version")
        );
    }

    private DetailRow mapDetailRow(ResultSet rs) throws SQLException {
        int reviewCount = rs.getInt("seller_review_count");
        Double rawAvgRating = getOptionalDouble(rs, "seller_avg_rating");
        Double roundedAvgRating = (reviewCount > 0 && rawAvgRating != null)
                ? roundTwoDecimals(rawAvgRating)
                : null;

        UUID sellerId = rs.getObject("nguoi_dang_id", UUID.class);
        ListingDtos.SellerPublicSummaryDto seller = new ListingDtos.SellerPublicSummaryDto(
                sellerId,
                rs.getString("seller_display_name"),
                rs.getInt("seller_reputation_score"),
                roundedAvgRating,
                reviewCount
        );

        return new DetailRow(
                rs.getObject("ma_tin", UUID.class),
                sellerId,
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
                getOptionalDouble(rs, "resolved_lat"),
                getOptionalDouble(rs, "resolved_lng"),
                extractStringArray(rs, "hinh_anh"),
                getOptionalInstant(rs, "published_at"),
                getOptionalInstant(rs, "expires_at"),
                rs.getInt("so_lan_gia_han"),
                getOptionalInstant(rs, "closed_at"),
                rs.getString("ly_do_an"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getLong("version"),
                seller
        );
    }

    private static String normalizeType(String type) {
        String trimmed = trimToNull(type);
        if (trimmed == null) {
            return null;
        }
        String upper = trimmed.toUpperCase(Locale.ROOT);
        if (!"SINGLE".equals(upper) && !"COMBO".equals(upper) && !"FREE".equals(upper)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Loại tin đăng không hợp lệ. Giá trị hợp lệ: SINGLE, COMBO, FREE.");
        }
        return upper;
    }

    private static String normalizeSort(String sort) {
        String trimmed = trimToNull(sort);
        if (trimmed == null) {
            return "newest";
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (!"newest".equals(lower)
                && !"price_asc".equals(lower)
                && !"price_desc".equals(lower)
                && !"distance_asc".equals(lower)) {
            throw new AuthFailure(
                    400,
                    "INVALID_INPUT",
                    "Tiêu chí sắp xếp không hợp lệ. Giá trị hợp lệ: newest, price_asc, price_desc, distance_asc."
            );
        }
        return lower;
    }

    private static String buildOrderByClause(String sort, String prefix) {
        return switch (sort) {
            case "price_asc" ->
                    prefix + "gia_vnd ASC, COALESCE(" + prefix + "published_at, " + prefix + "created_at) DESC, " + prefix + "ma_tin DESC";
            case "price_desc" ->
                    prefix + "gia_vnd DESC, COALESCE(" + prefix + "published_at, " + prefix + "created_at) DESC, " + prefix + "ma_tin DESC";
            case "distance_asc" ->
                    prefix + "distance_km ASC NULLS LAST, COALESCE(" + prefix + "published_at, " + prefix + "created_at) DESC, " + prefix + "ma_tin DESC";
            default ->
                    "COALESCE(" + prefix + "published_at, " + prefix + "created_at) DESC, " + prefix + "ma_tin DESC";
        };
    }

    private static String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.strip();
    }

    private static String toContainsPattern(String raw) {
        String escaped = raw
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }

    private static List<String> extractStringArray(ResultSet rs, String column) throws SQLException {
        Array sqlArray = rs.getArray(column);
        if (sqlArray == null) {
            return List.of();
        }
        Object obj = sqlArray.getArray();
        if (obj instanceof String[] arr) {
            List<String> list = new ArrayList<>(arr.length);
            for (String item : arr) {
                if (item != null) {
                    list.add(item);
                }
            }
            return List.copyOf(list);
        }
        if (obj instanceof Object[] arr) {
            List<String> list = new ArrayList<>(arr.length);
            for (Object item : arr) {
                if (item != null) {
                    list.add(item.toString());
                }
            }
            return List.copyOf(list);
        }
        return List.of();
    }

    private static Instant getOptionalInstant(ResultSet rs, String column) throws SQLException {
        Timestamp ts = rs.getTimestamp(column);
        return ts != null ? ts.toInstant() : null;
    }

    private static Double getOptionalDouble(ResultSet rs, String column) throws SQLException {
        double value = rs.getDouble(column);
        return rs.wasNull() ? null : value;
    }

    private static double roundTwoDecimals(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private record Coordinates(double latitude, double longitude) {
    }

    private record TransactionStats(int pendingRequestCount, int activeTxCount, int totalTxCount) {
    }

    private record DetailRow(
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
            int renewalCount,
            Instant closedAt,
            String hiddenReason,
            Instant createdAt,
            Instant updatedAt,
            long version,
            ListingDtos.SellerPublicSummaryDto seller
    ) {
    }
}
