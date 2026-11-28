package com.dormtrading.order.dispute;

import com.dormtrading.catalog.ListingDtos;
import com.dormtrading.catalog.ListingLifecycleHelper;
import com.dormtrading.catalog.media.MediaImageSanitizer;
import com.dormtrading.catalog.media.MediaMagicBytes;
import com.dormtrading.iam.auth.AccountRestrictedFailure;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.order.OrderDtos;
import com.dormtrading.order.OrderNotificationService;
import com.dormtrading.review.reputation.ReputationLedgerService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * Core service for P3-03 (UC-29: Xử lý giao dịch quá hạn / tranh chấp).
 *
 * <p>Enforces:
 * <ul>
 *   <li>Strict conflict-of-interest guard (UC-29 §4): moderators who are buyer or seller on an
 *       order are excluded from queue listings and counts, and receive 403 SELF_DISPUTE_FORBIDDEN
 *       on detail, evidence downloads, and actions.</li>
 *   <li>Global deadlock-free row lock order aligned with {@code OrderService} and
 *       {@code ListingService}: {@code thanh_viens -> tin_dangs -> giao_dichs -> do_vats (ORDER BY ma_vat ASC)}.</li>
 *   <li>Zero reputation mutation: UC-29 NEVER touches {@code thanh_viens.diem_uy_tin} or
 *       {@code lich_su_diem_uy_tin}.</li>
 *   <li>Zero-PII responses &amp; isolated private evidence storage (NFR-01).</li>
 *   <li>Single immutable decision per transaction enforced both by row locks and DB
 *       {@code UNIQUE(ma_giao_dich)} (NFR-02 / NFR-03).</li>
 * </ul>
 */
@Service
public class DisputeService {

    public static final ZoneId VIETNAM_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    public static final int SLA_RESPONSE_BUSINESS_DAYS = 3;
    public static final int REVIEW_WINDOW_DAYS = 15;
    public static final int OVERDUE_CONFIRM_HOURS = 24;
    public static final int MIN_BASIS_LENGTH = 10;
    public static final int MAX_BASIS_LENGTH = 2000;
    public static final int MIN_INSTRUCTION_LENGTH = 5;
    public static final int MAX_INSTRUCTION_LENGTH = 2000;
    public static final int MIN_RESPONSE_NOTE_LENGTH = 3;
    public static final int MAX_RESPONSE_NOTE_LENGTH = 2000;
    public static final int DEFAULT_EVIDENCE_DUE_HOURS = 48;
    public static final int MIN_EVIDENCE_DUE_HOURS = 1;
    public static final int MAX_EVIDENCE_DUE_HOURS = 168;
    public static final int MAX_EVIDENCE_FILES = 5;
    public static final long MAX_EVIDENCE_FILE_BYTES = 5L * 1024 * 1024;
    public static final int MAX_ADMIN_PAGE = 500;
    public static final int MAX_ADMIN_PAGE_SIZE = 50;

    private static final Set<String> VALID_REASONS = Set.of("ALL", "OVERDUE_24H", "CANCEL_DISPUTE");
    private static final Set<String> VALID_QUEUE_STATES = Set.of("ALL", "READY", "WAITING_EVIDENCE", "RESOLVED");
    private static final Set<String> VALID_TARGET_PARTIES = Set.of("BUYER", "SELLER", "BOTH");

    private final JdbcTemplate db;
    private final Clock clock;
    private final ReputationLedgerService reputationLedger;
    private final OrderNotificationService notificationService;
    private final DisputeEvidenceStorage evidenceStorage;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    public DisputeService(
            JdbcTemplate db,
            Clock clock,
            ReputationLedgerService reputationLedger,
            OrderNotificationService notificationService,
            DisputeEvidenceStorage evidenceStorage,
            ObjectMapper objectMapper,
            TransactionTemplate transactionTemplate
    ) {
        this.db = db;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.reputationLedger = reputationLedger;
        this.notificationService = notificationService;
        this.evidenceStorage = evidenceStorage;
        this.objectMapper = objectMapper;
        this.transactionTemplate = transactionTemplate;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    /**
     * Computes SLA response deadline adding {@code businessDays} weekdays (skipping Saturday &amp; Sunday)
     * in {@code Asia/Ho_Chi_Minh} timezone (UC-29 §4).
     */
    public static Instant addBusinessDays(Instant start, int businessDays) {
        ZonedDateTime cursor = start.atZone(VIETNAM_ZONE);
        int added = 0;
        while (added < businessDays) {
            cursor = cursor.plusDays(1);
            DayOfWeek dow = cursor.getDayOfWeek();
            if (dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY) {
                added++;
            }
        }
        return cursor.toInstant().truncatedTo(ChronoUnit.MILLIS);
    }

    static UUID legacyHandoverPhotoId(UUID orderId) {
        return UUID.nameUUIDFromBytes(("legacy-handover:" + orderId).getBytes(StandardCharsets.UTF_8));
    }

    // =========================================================================
    // Admin Dispute Queue & Detail APIs (ROLE_MODERATOR)
    // =========================================================================

    @Transactional(readOnly = true)
    public DisputeDtos.DisputePageDto listAdminDisputes(
            UUID moderatorId,
            String reasonParam,
            String queueStateParam,
            String q,
            int page,
            int size
    ) {
        String reason = normalizeFilter(reasonParam, VALID_REASONS, "ALL", "Bộ lọc lý do không hợp lệ.");
        String queueState = normalizeFilter(queueStateParam, VALID_QUEUE_STATES, "ALL", "Bộ lọc trạng thái hàng đợi không hợp lệ.");
        if (page < 0 || page > MAX_ADMIN_PAGE) {
            throw new AuthFailure(400, "INVALID_INPUT", "Số trang không hợp lệ.");
        }
        int safeSize = Math.clamp(size, 1, MAX_ADMIN_PAGE_SIZE);
        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);

        // Compute counts across all visible non-self disputes for this moderator
        DisputeDtos.DisputeCountsDto counts = loadAdminCounts(moderatorId, tsNow);

        StringBuilder where = new StringBuilder();
        List<Object> params = new ArrayList<>();
        // Conflict of interest (UC-29 §4): ALWAYS exclude orders where moderator is buyer or seller
        where.append(" WHERE g.nguoi_ban_id <> ? AND g.nguoi_mua_id <> ? ");
        params.add(moderatorId);
        params.add(moderatorId);

        // Dispute universe: currently CHO_XU_LY, or resolved (HOAN_TAT/HUY) that went through dispute/escalation
        where.append("""
                 AND (
                     g.trang_thai = 'CHO_XU_LY'
                     OR (
                         g.trang_thai IN ('HOAN_TAT', 'HUY')
                         AND (qd.id IS NOT NULL OR g.thoi_diem_chuyen_xu_ly IS NOT NULL)
                     )
                 )
                """);

        if (!"ALL".equals(reason)) {
            where.append(" AND g.ly_do_cho_xu_ly = ? ");
            params.add(reason);
        }

        switch (queueState) {
            case "READY" -> {
                where.append("""
                         AND g.trang_thai = 'CHO_XU_LY'
                         AND NOT EXISTS (
                             SELECT 1 FROM yeu_cau_bo_sung_giao_dichs yc
                             WHERE yc.ma_giao_dich = g.ma_giao_dich
                               AND yc.trang_thai = 'CHO_BO_SUNG'
                               AND yc.han_bo_sung > ?
                         )
                        """);
                params.add(tsNow);
            }
            case "WAITING_EVIDENCE" -> {
                where.append("""
                         AND g.trang_thai = 'CHO_XU_LY'
                         AND EXISTS (
                             SELECT 1 FROM yeu_cau_bo_sung_giao_dichs yc
                             WHERE yc.ma_giao_dich = g.ma_giao_dich
                               AND yc.trang_thai = 'CHO_BO_SUNG'
                               AND yc.han_bo_sung > ?
                         )
                        """);
                params.add(tsNow);
            }
            case "RESOLVED" -> where.append(" AND g.trang_thai IN ('HOAN_TAT', 'HUY') ");
            default -> {
                // ALL
            }
        }

        if (q != null && !q.isBlank()) {
            String trimmedQ = q.strip();
            if (trimmedQ.length() > 200) {
                throw new AuthFailure(400, "INVALID_INPUT", "Từ khóa tìm kiếm không được vượt quá 200 ký tự.");
            }
            String pattern = "%" + escapeLike(trimmedQ) + "%";
            where.append("""
                     AND (
                         CAST(g.ma_giao_dich AS TEXT) ILIKE ? ESCAPE '\\'
                         OR t.tieu_de ILIKE ? ESCAPE '\\'
                         OR b.ho_ten ILIKE ? ESCAPE '\\'
                         OR s.ho_ten ILIKE ? ESCAPE '\\'
                     )
                    """);
            params.add(pattern);
            params.add(pattern);
            params.add(pattern);
            params.add(pattern);
        }

        String fromJoins = """
                FROM giao_dichs g
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                JOIN thanh_viens s ON s.user_id = g.nguoi_ban_id
                JOIN thanh_viens b ON b.user_id = g.nguoi_mua_id
                LEFT JOIN quyet_dinh_giao_dichs qd ON qd.ma_giao_dich = g.ma_giao_dich
                LEFT JOIN thanh_viens decider ON decider.user_id = qd.nguoi_quyet_dinh_id
                """;

        Long totalObj = db.queryForObject(
                "SELECT COUNT(*) " + fromJoins + where,
                Long.class,
                params.toArray()
        );
        long totalElements = totalObj != null ? totalObj : 0L;

        List<Object> pageParams = new ArrayList<>();
        pageParams.add(tsNow); // has_active_evidence_request in SELECT
        pageParams.addAll(params);
        pageParams.add(tsNow); // ORDER BY queueState priority
        pageParams.add(safeSize);
        pageParams.add((long) page * safeSize);

        List<DisputeDtos.DisputeSummaryDto> items = db.query(
                """
                SELECT g.ma_giao_dich, g.version, g.trang_thai, g.ly_do_cho_xu_ly,
                       g.thoi_diem_chuyen_xu_ly, g.han_phan_hoi_kdv, g.gia_thoa_thuan,
                       g.thoi_diem_bao_giao,
                       t.ma_tin, t.tieu_de, t.gia_vnd, t.hinh_thuc, t.trang_thai AS listing_status, t.hinh_anh,
                       CASE
                           WHEN EXISTS (SELECT 1 FROM giao_dich_do_vat gdv WHERE gdv.ma_giao_dich = g.ma_giao_dich)
                           THEN (SELECT COUNT(*)::int FROM giao_dich_do_vat gdv WHERE gdv.ma_giao_dich = g.ma_giao_dich)
                           ELSE (SELECT COUNT(*)::int FROM tin_dang_do_vat tdv WHERE tdv.ma_tin = g.ma_tin)
                       END AS item_count,
                       b.user_id AS buyer_id, b.ho_ten AS buyer_name, b.diem_uy_tin AS buyer_score,
                       s.user_id AS seller_id, s.ho_ten AS seller_name, s.diem_uy_tin AS seller_score,
                       EXISTS (
                           SELECT 1 FROM yeu_cau_bo_sung_giao_dichs yc
                           WHERE yc.ma_giao_dich = g.ma_giao_dich
                             AND yc.trang_thai = 'CHO_BO_SUNG'
                             AND yc.han_bo_sung > ?
                       ) AS has_active_evidence_request,
                       qd.ket_luan AS decision_conclusion,
                       decider.ho_ten AS decided_by_name,
                       qd.thoi_diem AS decided_at
                """
                        + fromJoins
                        + where
                        + """
                         ORDER BY
                             CASE
                                 WHEN g.trang_thai = 'CHO_XU_LY' AND NOT EXISTS (
                                     SELECT 1 FROM yeu_cau_bo_sung_giao_dichs yc2
                                     WHERE yc2.ma_giao_dich = g.ma_giao_dich
                                       AND yc2.trang_thai = 'CHO_BO_SUNG'
                                       AND yc2.han_bo_sung > ?
                                 ) THEN 0
                                 WHEN g.trang_thai = 'CHO_XU_LY' THEN 1
                                 ELSE 2
                             END ASC,
                             CASE WHEN g.trang_thai = 'CHO_XU_LY' THEN g.han_phan_hoi_kdv END ASC NULLS LAST,
                             CASE WHEN g.trang_thai = 'CHO_XU_LY' THEN g.thoi_diem_chuyen_xu_ly END ASC NULLS LAST,
                             COALESCE(qd.thoi_diem, g.updated_at) DESC,
                             g.ma_giao_dich DESC
                         LIMIT ? OFFSET ?
                        """,
                (rs, rowNum) -> mapSummaryRow(rs, current),
                pageParams.toArray()
        );

        int totalPages = totalElements == 0 ? 0 : (int) ((totalElements + safeSize - 1) / safeSize);
        return new DisputeDtos.DisputePageDto(items, counts, page, safeSize, totalElements, totalPages);
    }

    @Transactional(readOnly = true)
    public DisputeDtos.DisputeDetailDto getAdminDisputeDetail(UUID moderatorId, UUID orderId) {
        return loadAdminDisputeDetail(moderatorId, orderId);
    }

    @Transactional(readOnly = true)
    public DisputeDtos.EvidenceBinaryContent loadAdminHandoverPhoto(UUID moderatorId, UUID orderId, UUID photoId) {
        OrderLookup lookup = lookupOrderOrThrow(orderId);
        enforceNotSelfDispute(moderatorId, lookup.buyerId(), lookup.sellerId());

        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT id, storage_key, content_type, size_bytes
                FROM anh_ban_giao_giao_dichs
                WHERE id = ? AND ma_giao_dich = ?
                """,
                photoId,
                orderId
        );
        if (!rows.isEmpty()) {
            Map<String, Object> row = rows.getFirst();
            String storageKey = (String) row.get("storage_key");
            String contentType = (String) row.get("content_type");
            long dbSize = ((Number) row.get("size_bytes")).longValue();
            Resource resource = evidenceStorage.loadHandoverAsResource(storageKey);
            return new DisputeDtos.EvidenceBinaryContent(photoId, contentType, resolveSize(resource, dbSize), resource);
        }

        // Graceful fallback for legacy giao_dichs.anh_ban_giao stored as a relative storage key
        if (photoId.equals(legacyHandoverPhotoId(orderId))) {
            List<String> legacy = db.queryForList(
                    "SELECT anh_ban_giao FROM giao_dichs WHERE ma_giao_dich = ?",
                    String.class,
                    orderId
            );
            if (!legacy.isEmpty() && legacy.getFirst() != null && !legacy.getFirst().isBlank()) {
                String rawKey = legacy.getFirst().strip();
                if (!rawKey.startsWith("http://") && !rawKey.startsWith("https://") && !rawKey.startsWith("/")) {
                    Resource resource = evidenceStorage.loadHandoverAsResource(rawKey);
                    long size = resolveSize(resource, 0L);
                    String contentType = guessImageContentType(rawKey);
                    return new DisputeDtos.EvidenceBinaryContent(photoId, contentType, size, resource);
                }
            }
        }

        throw new AuthFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy ảnh bàn giao của giao dịch.");
    }

    @Transactional(readOnly = true)
    public DisputeDtos.EvidenceBinaryContent loadAdminSupplementaryAttachment(UUID moderatorId, UUID orderId, UUID attachmentId) {
        OrderLookup lookup = lookupOrderOrThrow(orderId);
        enforceNotSelfDispute(moderatorId, lookup.buyerId(), lookup.sellerId());
        return loadSupplementaryAttachmentBinary(orderId, attachmentId);
    }

    // =========================================================================
    // Admin Dispute Actions (Complete, Cancel, Request Supplementary Evidence)
    // =========================================================================

    @Transactional
    public DisputeDtos.DisputeDetailDto completeDispute(
            UUID moderatorId,
            UUID orderId,
            DisputeDtos.ResolveDisputeRequest req
    ) {
        String basis = validateBasis(req != null ? req.basis() : null);
        Long expectedVersion = validateExpectedVersion(req != null ? req.expectedVersion() : null);
        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);

        OrderLookup lookup = lookupOrderOrThrow(orderId);
        enforceNotSelfDispute(moderatorId, lookup.buyerId(), lookup.sellerId());

        // Strict global lock order: (1) thanh_viens -> (2) tin_dangs -> (3) giao_dichs -> (4) do_vats ASC
        lockMemberForKeyShare(lookup.sellerId());
        LockedListing listing = lockListingForNoKeyUpdate(lookup.listingId());
        LockedOrder order = lockOrderForNoKeyUpdate(orderId);

        enforceNotSelfDispute(moderatorId, order.buyerId(), order.sellerId());
        validateModerationOrderState(order, expectedVersion);

        List<UUID> orderItemIds = findOrderItemIdsSorted(orderId, listing.id());
        lockItemsSorted(orderItemIds);

        Instant reviewDeadline = current.plus(REVIEW_WINDOW_DAYS, ChronoUnit.DAYS);
        Timestamp tsReviewDeadline = Timestamp.from(reviewDeadline);

        // 1. Transition giao_dichs -> HOAN_TAT + 15-day review window (UC-29 / FR-10 / UC-30)
        db.update(
                """
                UPDATE giao_dichs
                SET trang_thai = 'HOAN_TAT',
                    thoi_diem_hoan_tat = ?,
                    han_danh_gia_den = ?,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_giao_dich = ?
                """,
                tsNow,
                tsReviewDeadline,
                tsNow,
                orderId
        );

        // 2. Release active hold flags & mark items DA_CHUYEN_GIAO
        db.update("UPDATE giao_dich_do_vat SET giu_hieu_luc = FALSE WHERE ma_giao_dich = ?", orderId);
        if (!orderItemIds.isEmpty()) {
            UUID[] itemArray = orderItemIds.toArray(new UUID[0]);
            db.update(con -> {
                PreparedStatement ps = con.prepareStatement(
                        "UPDATE do_vats SET trang_thai = 'DA_CHUYEN_GIAO', version = version + 1, updated_at = ? WHERE ma_vat = ANY(?)"
                );
                ps.setTimestamp(1, tsNow);
                ps.setArray(2, con.createArrayOf("uuid", itemArray));
                return ps;
            });
        }

        // 3. Archive listing -> KET_THUC
        db.update(
                """
                UPDATE tin_dangs
                SET trang_thai = 'KET_THUC',
                    closed_at = COALESCE(closed_at, ?),
                    updated_at = ?,
                    version = version + 1
                WHERE ma_tin = ?
                """,
                tsNow,
                tsNow,
                listing.id()
        );

        // 4. Invalidate active OTP codes & close open evidence/cancel/schedule requests
        invalidateActiveOtps(orderId);
        db.update(
                "UPDATE yeu_cau_bo_sung_giao_dichs SET trang_thai = 'DA_DONG' WHERE ma_giao_dich = ? AND trang_thai = 'CHO_BO_SUNG'",
                orderId
        );
        db.update(
                "UPDATE yeu_cau_huy_giao_dichs SET trang_thai = 'DA_DONG_DO_HOAN_TAT', updated_at = ? WHERE ma_giao_dich = ? AND trang_thai = 'CHO_XAC_NHAN'",
                tsNow,
                orderId
        );
        db.update(
                "UPDATE lich_hen_giao_dichs SET trang_thai = 'DA_THAY_THE' WHERE ma_giao_dich = ? AND trang_thai = 'CHO_XAC_NHAN'",
                orderId
        );

        // 5. Record immutable 1-1 dispute decision (DB UNIQUE enforces NFR-03 even under race)
        insertDecisionOrConflict(orderId, moderatorId, "HOAN_TAT", basis, "KET_THUC", null, tsNow);

        // 6. Audit logs: lich_su_trang_thai_giao_dich + nhat_ky_kiem_duyet (NEVER touch diem_uy_tin!)
        insertTimeline(orderId, "MODERATOR_DECIDED_COMPLETE", "CHO_XU_LY", "HOAN_TAT", moderatorId, "MODERATOR", basis, tsNow);
        Map<String, Object> auditDetails = new LinkedHashMap<>();
        auditDetails.put("orderId", orderId.toString());
        auditDetails.put("listingId", listing.id().toString());
        auditDetails.put("buyerId", order.buyerId().toString());
        auditDetails.put("sellerId", order.sellerId().toString());
        auditDetails.put("conclusion", "HOAN_TAT");
        auditDetails.put("listingStatusAfter", "KET_THUC");
        auditDetails.put("reviewDeadlineAt", reviewDeadline.toString());
        insertModerationAudit(
                order.sellerId(),
                moderatorId,
                "DISPUTE_DECIDED_COMPLETE",
                basis,
                "CHO_XU_LY",
                "HOAN_TAT",
                auditDetails,
                tsNow
        );

        // 7. Notify BOTH buyer and seller
        notificationService.notifyUser(
                order.buyerId(),
                OrderDtos.NotificationType.DISPUTE_RESOLVED_COMPLETED,
                "Giao dịch đã được Kiểm duyệt viên xác nhận hoàn tất",
                "Kiểm duyệt viên đã xác nhận hoàn tất giao dịch cho tin \"" + listing.title()
                        + "\". Căn cứ: " + basis
                        + ". Bạn có 15 ngày để đánh giá giao dịch (điểm uy tín không thay đổi từ quyết định này).",
                listing.id(),
                orderId
        );
        notificationService.notifyUser(
                order.sellerId(),
                OrderDtos.NotificationType.DISPUTE_RESOLVED_COMPLETED,
                "Giao dịch đã được Kiểm duyệt viên xác nhận hoàn tất",
                "Kiểm duyệt viên đã xác nhận hoàn tất giao dịch cho tin \"" + listing.title()
                        + "\". Căn cứ: " + basis
                        + ". Tin đăng đã được lưu trữ (điểm uy tín không thay đổi từ quyết định này).",
                listing.id(),
                orderId
        );

        return loadAdminDisputeDetail(moderatorId, orderId);
    }

    @Transactional
    public DisputeDtos.DisputeDetailDto cancelDispute(
            UUID moderatorId,
            UUID orderId,
            DisputeDtos.ResolveDisputeRequest req
    ) {
        String basis = validateBasis(req != null ? req.basis() : null);
        Long expectedVersion = validateExpectedVersion(req != null ? req.expectedVersion() : null);
        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);

        OrderLookup lookup = lookupOrderOrThrow(orderId);
        enforceNotSelfDispute(moderatorId, lookup.buyerId(), lookup.sellerId());

        // Strict global lock order: (1) thanh_viens(seller) -> (2) tin_dangs -> (3) giao_dichs -> (4) do_vats ASC
        // Reconcile expired 14-day temporary lock per FR-12 before checking seller reopen eligibility
        LockedSeller seller = lockSellerForReopenEvaluation(lookup.sellerId());
        LockedListing listing = lockListingForNoKeyUpdate(lookup.listingId());
        LockedOrder order = lockOrderForNoKeyUpdate(orderId);

        enforceNotSelfDispute(moderatorId, order.buyerId(), order.sellerId());
        validateModerationOrderState(order, expectedVersion);

        // Lock union of order snapshot items and current listing items in canonical UUID ASC order
        List<UUID> orderItemIds = findOrderItemIdsSorted(orderId, listing.id());
        List<UUID> listingItemIds = findListingItemIdsSorted(listing.id());
        LinkedHashSet<UUID> allItemIds = new LinkedHashSet<>(orderItemIds);
        allItemIds.addAll(listingItemIds);
        List<LockedItem> lockedItems = lockItemsSorted(allItemIds);

        // 1. Transition giao_dichs -> HUY
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
                moderatorId,
                basis,
                tsNow,
                tsNow,
                orderId
        );

        // 2. Invalidate active OTP codes & close open evidence/schedule requests
        invalidateActiveOtps(orderId);
        db.update(
                "UPDATE yeu_cau_bo_sung_giao_dichs SET trang_thai = 'DA_DONG' WHERE ma_giao_dich = ? AND trang_thai = 'CHO_BO_SUNG'",
                orderId
        );
        db.update(
                "UPDATE lich_hen_giao_dichs SET trang_thai = 'DA_THAY_THE' WHERE ma_giao_dich = ? AND trang_thai = 'CHO_XAC_NHAN'",
                orderId
        );

        // 3. Deactivate item holds & release order items to KHA_DUNG safely (never overwrite DA_CHUYEN_GIAO or other holds)
        db.update("UPDATE giao_dich_do_vat SET giu_hieu_luc = FALSE WHERE ma_giao_dich = ?", orderId);
        Set<UUID> orderItemIdSet = Set.copyOf(orderItemIds);
        List<UUID> itemsToRelease = new ArrayList<>();
        for (LockedItem item : lockedItems) {
            if (!orderItemIdSet.contains(item.id())) {
                continue;
            }
            if (!"DA_CHUYEN_GIAO".equals(item.status())
                    && !"KHA_DUNG".equals(item.status())
                    && !hasActiveItemHold(item.id())) {
                itemsToRelease.add(item.id());
            }
        }
        if (!itemsToRelease.isEmpty()) {
            UUID[] releaseArr = itemsToRelease.toArray(new UUID[0]);
            db.update(con -> {
                PreparedStatement ps = con.prepareStatement(
                        """
                        UPDATE do_vats
                        SET trang_thai = 'KHA_DUNG',
                            version = version + 1,
                            updated_at = ?
                        WHERE ma_vat = ANY(?)
                          AND trang_thai <> 'DA_CHUYEN_GIAO'
                        """
                );
                ps.setTimestamp(1, tsNow);
                ps.setArray(2, con.createArrayOf("uuid", releaseArr));
                return ps;
            });
        }

        // 4. Listing reopen eligibility check (UC-29 Exception 4 + FR-05 + FR-12 + FR-13)
        String listingStatusAfter = listing.status();
        String listingHiddenReason = "AN".equals(listing.status()) ? listing.hiddenReason() : null;

        if (ListingDtos.ListingStatus.GIU_CHO.name().equals(listing.status())) {
            String ineligibleReason = evaluateListingReopenIneligibility(seller, listing, current);
            if (ineligibleReason == null && countActiveReservationsForListing(listing.id()) == 0) {
                listingStatusAfter = ListingDtos.ListingStatus.CONG_KHAI.name();
                listingHiddenReason = null;
                db.update(
                        """
                        UPDATE tin_dangs
                        SET trang_thai = 'CONG_KHAI',
                            updated_at = ?,
                            version = version + 1
                        WHERE ma_tin = ?
                        """,
                        tsNow,
                        listing.id()
                );
            } else {
                listingStatusAfter = ListingDtos.ListingStatus.AN.name();
                listingHiddenReason = ineligibleReason != null
                        ? ineligibleReason
                        : "Tin đăng vẫn còn giao dịch khác đang giữ chỗ nên được chuyển sang trạng thái Ẩn.";
                db.update(
                        """
                        UPDATE tin_dangs
                        SET trang_thai = 'AN',
                            ly_do_an = ?,
                            updated_at = ?,
                            version = version + 1
                        WHERE ma_tin = ?
                        """,
                        listingHiddenReason,
                        tsNow,
                        listing.id()
                );
            }
        }

        // 5. Record immutable 1-1 dispute decision
        insertDecisionOrConflict(orderId, moderatorId, "HUY", basis, listingStatusAfter, listingHiddenReason, tsNow);

        // 6. Audit logs (NEVER touch diem_uy_tin!)
        insertTimeline(orderId, "MODERATOR_DECIDED_CANCEL", "CHO_XU_LY", "HUY", moderatorId, "MODERATOR", basis, tsNow);
        Map<String, Object> auditDetails = new LinkedHashMap<>();
        auditDetails.put("orderId", orderId.toString());
        auditDetails.put("listingId", listing.id().toString());
        auditDetails.put("buyerId", order.buyerId().toString());
        auditDetails.put("sellerId", order.sellerId().toString());
        auditDetails.put("conclusion", "HUY");
        auditDetails.put("listingStatusAfter", listingStatusAfter);
        if (listingHiddenReason != null) {
            auditDetails.put("listingHiddenReason", listingHiddenReason);
        }
        insertModerationAudit(
                order.sellerId(),
                moderatorId,
                "DISPUTE_DECIDED_CANCEL",
                basis,
                "CHO_XU_LY",
                "HUY",
                auditDetails,
                tsNow
        );

        // 7. Notify BOTH buyer and seller (explicitly state hidden reason to seller per UC-29 Exception 4!)
        notificationService.notifyUser(
                order.buyerId(),
                OrderDtos.NotificationType.DISPUTE_RESOLVED_CANCELLED,
                "Giao dịch đã bị hủy theo quyết định của Kiểm duyệt viên",
                "Kiểm duyệt viên đã quyết định hủy giao dịch cho tin \"" + listing.title()
                        + "\". Căn cứ: " + basis
                        + " (điểm uy tín không thay đổi từ quyết định này).",
                listing.id(),
                orderId
        );

        String sellerMessage;
        if (ListingDtos.ListingStatus.AN.name().equals(listingStatusAfter) && listingHiddenReason != null) {
            sellerMessage = "Kiểm duyệt viên đã quyết định hủy giao dịch cho tin \"" + listing.title()
                    + "\". Căn cứ: " + basis
                    + ". Đồ vật đã được trả về trạng thái Còn hàng (Khả dụng), nhưng tin đăng được giữ ở trạng thái Ẩn vì: "
                    + listingHiddenReason
                    + " (điểm uy tín không thay đổi từ quyết định này).";
        } else if (ListingDtos.ListingStatus.CONG_KHAI.name().equals(listingStatusAfter)) {
            sellerMessage = "Kiểm duyệt viên đã quyết định hủy giao dịch cho tin \"" + listing.title()
                    + "\". Căn cứ: " + basis
                    + ". Đồ vật đã được trả về trạng thái Khả dụng và tin đăng đã được công khai lại"
                    + " (điểm uy tín không thay đổi từ quyết định này).";
        } else {
            sellerMessage = "Kiểm duyệt viên đã quyết định hủy giao dịch cho tin \"" + listing.title()
                    + "\". Căn cứ: " + basis
                    + ". Đồ vật đã được giải phóng về trạng thái Khả dụng"
                    + " (điểm uy tín không thay đổi từ quyết định này).";
        }
        notificationService.notifyUser(
                order.sellerId(),
                OrderDtos.NotificationType.DISPUTE_RESOLVED_CANCELLED,
                "Giao dịch đã bị hủy theo quyết định của Kiểm duyệt viên",
                sellerMessage,
                listing.id(),
                orderId
        );

        return loadAdminDisputeDetail(moderatorId, orderId);
    }

    @Transactional
    public DisputeDtos.DisputeDetailDto requestEvidence(
            UUID moderatorId,
            UUID orderId,
            DisputeDtos.RequestEvidenceBody req
    ) {
        if (req == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Vui lòng cung cấp đầy đủ thông tin yêu cầu bổ sung bằng chứng.");
        }
        String targetParty = req.targetParty() == null ? "" : req.targetParty().strip().toUpperCase(Locale.ROOT);
        if (!VALID_TARGET_PARTIES.contains(targetParty)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Bên cần bổ sung chỉ được chọn BUYER, SELLER hoặc BOTH.");
        }
        String instruction = validateLengthText(
                req.instruction(),
                MIN_INSTRUCTION_LENGTH,
                MAX_INSTRUCTION_LENGTH,
                "INVALID_INPUT",
                "Nội dung yêu cầu bổ sung phải có từ " + MIN_INSTRUCTION_LENGTH + " đến " + MAX_INSTRUCTION_LENGTH + " ký tự."
        );
        int dueInHours = req.dueInHours() != null ? req.dueInHours() : DEFAULT_EVIDENCE_DUE_HOURS;
        if (dueInHours < MIN_EVIDENCE_DUE_HOURS || dueInHours > MAX_EVIDENCE_DUE_HOURS) {
            throw new AuthFailure(
                    400,
                    "INVALID_INPUT",
                    "Thời hạn bổ sung bằng chứng phải từ " + MIN_EVIDENCE_DUE_HOURS + " đến " + MAX_EVIDENCE_DUE_HOURS + " giờ."
            );
        }
        Long expectedVersion = validateExpectedVersion(req.expectedVersion());

        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);

        OrderLookup lookup = lookupOrderOrThrow(orderId);
        enforceNotSelfDispute(moderatorId, lookup.buyerId(), lookup.sellerId());

        LockedOrder order = lockOrderForNoKeyUpdate(orderId);
        enforceNotSelfDispute(moderatorId, order.buyerId(), order.sellerId());
        validateModerationOrderState(order, expectedVersion);

        // Lazily expire any already-overdue open evidence request on this order before checking conflict
        int expired = db.update(
                """
                UPDATE yeu_cau_bo_sung_giao_dichs
                SET trang_thai = 'QUA_HAN'
                WHERE ma_giao_dich = ?
                  AND trang_thai = 'CHO_BO_SUNG'
                  AND han_bo_sung <= ?
                """,
                orderId,
                tsNow
        );
        if (expired > 0) {
            insertTimeline(
                    orderId,
                    "EVIDENCE_REQUEST_EXPIRED",
                    "CHO_XU_LY",
                    "CHO_XU_LY",
                    null,
                    "SYSTEM",
                    "Yêu cầu bổ sung bằng chứng trước đó đã hết hạn.",
                    tsNow
            );
        }

        Integer openCount = db.queryForObject(
                "SELECT COUNT(*) FROM yeu_cau_bo_sung_giao_dichs WHERE ma_giao_dich = ? AND trang_thai = 'CHO_BO_SUNG'",
                Integer.class,
                orderId
        );
        if (openCount != null && openCount > 0) {
            throw new AuthFailure(
                    409,
                    "EVIDENCE_REQUEST_ALREADY_OPEN",
                    "Giao dịch này đang có một yêu cầu bổ sung bằng chứng chờ phản hồi."
            );
        }

        Instant dueAt = current.plus(dueInHours, ChronoUnit.HOURS);
        Timestamp tsDueAt = Timestamp.from(dueAt);
        UUID requestId = UUID.randomUUID();
        try {
            db.update(
                    """
                    INSERT INTO yeu_cau_bo_sung_giao_dichs(
                        id, ma_giao_dich, nguoi_yeu_cau_id, ben_duoc_yeu_cau,
                        noi_dung, han_bo_sung, trang_thai, thoi_diem_tao
                    ) VALUES (?, ?, ?, ?, ?, ?, 'CHO_BO_SUNG', ?)
                    """,
                    requestId,
                    orderId,
                    moderatorId,
                    targetParty,
                    instruction,
                    tsDueAt,
                    tsNow
            );
        } catch (DataIntegrityViolationException ex) {
            throw new AuthFailure(
                    409,
                    "EVIDENCE_REQUEST_ALREADY_OPEN",
                    "Giao dịch này đang có một yêu cầu bổ sung bằng chứng chờ phản hồi."
            );
        }

        db.update(
                "UPDATE giao_dichs SET updated_at = ?, version = version + 1 WHERE ma_giao_dich = ?",
                tsNow,
                orderId
        );

        insertTimeline(
                orderId,
                "MODERATOR_REQUESTED_EVIDENCE",
                "CHO_XU_LY",
                "CHO_XU_LY",
                moderatorId,
                "MODERATOR",
                "[" + targetParty + "] " + instruction,
                tsNow
        );

        Map<String, Object> auditDetails = new LinkedHashMap<>();
        auditDetails.put("orderId", orderId.toString());
        auditDetails.put("evidenceRequestId", requestId.toString());
        auditDetails.put("targetParty", targetParty);
        auditDetails.put("dueAt", dueAt.toString());
        UUID auditTargetUser = "BUYER".equals(targetParty) ? order.buyerId() : order.sellerId();
        insertModerationAudit(
                auditTargetUser,
                moderatorId,
                "DISPUTE_EVIDENCE_REQUESTED",
                instruction,
                "CHO_XU_LY",
                "CHO_XU_LY",
                auditDetails,
                tsNow
        );

        String listingTitle = loadListingTitle(order.listingId());
        if ("BUYER".equals(targetParty) || "BOTH".equals(targetParty)) {
            notificationService.notifyUser(
                    order.buyerId(),
                    OrderDtos.NotificationType.DISPUTE_EVIDENCE_REQUESTED,
                    "Kiểm duyệt viên yêu cầu bổ sung bằng chứng",
                    "Vui lòng bổ sung bằng chứng cho giao dịch tin \"" + listingTitle
                            + "\" trong vòng " + dueInHours + " giờ. Nội dung yêu cầu: " + instruction,
                    order.listingId(),
                    orderId
            );
        }
        if ("SELLER".equals(targetParty) || "BOTH".equals(targetParty)) {
            notificationService.notifyUser(
                    order.sellerId(),
                    OrderDtos.NotificationType.DISPUTE_EVIDENCE_REQUESTED,
                    "Kiểm duyệt viên yêu cầu bổ sung bằng chứng",
                    "Vui lòng bổ sung bằng chứng cho giao dịch tin \"" + listingTitle
                            + "\" trong vòng " + dueInHours + " giờ. Nội dung yêu cầu: " + instruction,
                    order.listingId(),
                    orderId
            );
        }

        return loadAdminDisputeDetail(moderatorId, orderId);
    }

    // =========================================================================
    // Member Dispute APIs (Buyer / Seller — read-only for BI_KHOA, write for MEMBER)
    // =========================================================================

    @Transactional(readOnly = true)
    public DisputeDtos.MemberDisputeDto getMemberDispute(UUID viewerId, UUID orderId) {
        return loadMemberDispute(viewerId, orderId);
    }

    @Transactional(readOnly = true)
    public DisputeDtos.EvidenceBinaryContent loadMemberSupplementaryAttachment(UUID viewerId, UUID orderId, UUID attachmentId) {
        OrderLookup lookup = lookupOrderOrThrow(orderId);
        if (!viewerId.equals(lookup.buyerId()) && !viewerId.equals(lookup.sellerId())) {
            throw new AuthFailure(403, "DISPUTE_FORBIDDEN", "Chỉ người mua hoặc người bán của giao dịch mới được xem bằng chứng này.");
        }
        return loadSupplementaryAttachmentBinary(orderId, attachmentId);
    }

    /**
     * Submits supplementary evidence response from buyer or seller.
     * Validates and sanitizes images (magic bytes + EXIF strip) BEFORE opening DB transaction or acquiring locks,
     * and cleans up stored files automatically on transaction rollback.
     */
    public DisputeDtos.MemberDisputeDto submitEvidenceResponse(
            UUID senderId,
            UUID orderId,
            UUID requestId,
            String rawNote,
            List<MultipartFile> files
    ) {
        String note = validateLengthText(
                rawNote,
                MIN_RESPONSE_NOTE_LENGTH,
                MAX_RESPONSE_NOTE_LENGTH,
                "INVALID_INPUT",
                "Nội dung giải trình bổ sung phải có từ " + MIN_RESPONSE_NOTE_LENGTH + " đến " + MAX_RESPONSE_NOTE_LENGTH + " ký tự."
        );

        // Validate & sanitize images outside DB transaction/locks (NFR-01 / performance)
        List<SanitizedEvidenceFile> preparedFiles = validateAndSanitizeEvidenceFiles(orderId, files);

        DisputeDtos.MemberDisputeDto result = transactionTemplate.execute(status -> {
            Instant current = now();
            Timestamp tsNow = Timestamp.from(current);

            OrderLookup lookup = lookupOrderOrThrow(orderId);
            boolean isBuyer = lookup.buyerId().equals(senderId);
            boolean isSeller = lookup.sellerId().equals(senderId);
            if (!isBuyer && !isSeller) {
                throw new AuthFailure(403, "DISPUTE_FORBIDDEN", "Bạn không thuộc giao dịch này nên không thể bổ sung bằng chứng.");
            }
            String senderRole = isBuyer ? "BUYER" : "SELLER";

            verifyActiveMemberForWrite(senderId);

            LockedOrder order = lockOrderForNoKeyUpdate(orderId);
            if ("HOAN_TAT".equals(order.status()) || "HUY".equals(order.status())) {
                throw new AuthFailure(409, "DISPUTE_ALREADY_RESOLVED", "Giao dịch đã có kết quả xử lý nên không thể gửi thêm bằng chứng.");
            }
            if (!"CHO_XU_LY".equals(order.status())) {
                throw new AuthFailure(409, "INVALID_STATE_TRANSITION", "Giao dịch hiện không ở trạng thái Chờ xử lý tranh chấp.");
            }

            LockedEvidenceRequest evReq = lockEvidenceRequestForNoKeyUpdate(orderId, requestId);
            if (!"BOTH".equals(evReq.targetParty()) && !senderRole.equals(evReq.targetParty())) {
                throw new AuthFailure(403, "DISPUTE_FORBIDDEN", "Yêu cầu bổ sung bằng chứng này không dành cho vai trò của bạn.");
            }
            if (!"CHO_BO_SUNG".equals(evReq.status())) {
                throw new AuthFailure(409, "EVIDENCE_REQUEST_CLOSED", "Yêu cầu bổ sung bằng chứng đã đóng hoặc đã được phản hồi.");
            }
            if (!evReq.dueAt().isAfter(current)) {
                throw new AuthFailure(409, "EVIDENCE_REQUEST_EXPIRED", "Yêu cầu bổ sung bằng chứng đã quá thời hạn nộp.");
            }

            Integer existingResp = db.queryForObject(
                    "SELECT COUNT(*) FROM phan_hoi_bo_sung_giao_dichs WHERE yeu_cau_id = ? AND vai_tro_gui = ?",
                    Integer.class,
                    requestId,
                    senderRole
            );
            if (existingResp != null && existingResp > 0) {
                throw new AuthFailure(409, "EVIDENCE_ALREADY_SUBMITTED", "Bạn đã gửi phản hồi bổ sung cho yêu cầu này.");
            }

            List<String> storedKeys = new ArrayList<>(preparedFiles.size());
            if (TransactionSynchronizationManager.isActualTransactionActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCompletion(int completionStatus) {
                        if (completionStatus != STATUS_COMMITTED) {
                            for (String key : storedKeys) {
                                evidenceStorage.deleteQuietly(key);
                            }
                        }
                    }
                });
            }

            UUID responseId = UUID.randomUUID();
            try {
                db.update(
                        """
                        INSERT INTO phan_hoi_bo_sung_giao_dichs(
                            id, yeu_cau_id, ma_giao_dich, nguoi_gui_id, vai_tro_gui, noi_dung, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        responseId,
                        requestId,
                        orderId,
                        senderId,
                        senderRole,
                        note,
                        tsNow
                );
            } catch (DataIntegrityViolationException ex) {
                throw new AuthFailure(409, "EVIDENCE_ALREADY_SUBMITTED", "Bạn đã gửi phản hồi bổ sung cho yêu cầu này.");
            }

            try {
                for (SanitizedEvidenceFile file : preparedFiles) {
                    evidenceStorage.store(file.storageKey(), file.bytes());
                    storedKeys.add(file.storageKey());

                    db.update(
                            """
                            INSERT INTO bang_chung_bo_sung_giao_dichs(
                                id, phan_hoi_id, ma_giao_dich, nguoi_tai_len_id,
                                storage_key, original_filename, content_type, size_bytes, sha256, uploaded_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            file.id(),
                            responseId,
                            orderId,
                            senderId,
                            file.storageKey(),
                            file.originalFilename(),
                            file.contentType(),
                            file.sizeBytes(),
                            file.sha256(),
                            tsNow
                    );
                }
            } catch (RuntimeException e) {
                for (String key : storedKeys) {
                    evidenceStorage.deleteQuietly(key);
                }
                throw e;
            }

            // Transition evidence request to DA_PHAN_HOI once all targeted parties have responded
            boolean allResponded;
            if ("BOTH".equals(evReq.targetParty())) {
                Integer distinctRoles = db.queryForObject(
                        "SELECT COUNT(DISTINCT vai_tro_gui) FROM phan_hoi_bo_sung_giao_dichs WHERE yeu_cau_id = ?",
                        Integer.class,
                        requestId
                );
                allResponded = distinctRoles != null && distinctRoles >= 2;
            } else {
                allResponded = true;
            }

            if (allResponded) {
                db.update(
                        """
                        UPDATE yeu_cau_bo_sung_giao_dichs
                        SET trang_thai = 'DA_PHAN_HOI',
                            thoi_diem_phan_hoi = ?
                        WHERE id = ?
                        """,
                        tsNow,
                        requestId
                );
            }

            db.update(
                    "UPDATE giao_dichs SET updated_at = ?, version = version + 1 WHERE ma_giao_dich = ?",
                    tsNow,
                    orderId
            );

            String timelineNote = preparedFiles.isEmpty()
                    ? note
                    : note + " (đính kèm " + preparedFiles.size() + " ảnh)";
            insertTimeline(orderId, "EVIDENCE_SUBMITTED", "CHO_XU_LY", "CHO_XU_LY", senderId, senderRole, timelineNote, tsNow);

            String senderRoleLabel = isBuyer ? "Người mua" : "Người bán";
            String listingTitle = loadListingTitle(order.listingId());
            notificationService.notifyUser(
                    evReq.requestedById(),
                    OrderDtos.NotificationType.DISPUTE_EVIDENCE_SUBMITTED,
                    senderRoleLabel + " đã bổ sung bằng chứng tranh chấp",
                    senderRoleLabel + " đã gửi phản hồi bổ sung"
                            + (preparedFiles.isEmpty() ? "" : " kèm " + preparedFiles.size() + " ảnh bằng chứng")
                            + " cho giao dịch tin \"" + listingTitle + "\".",
                    order.listingId(),
                    orderId
            );

            return loadMemberDispute(senderId, orderId);
        });
        return result;
    }

    // =========================================================================
    // Scheduled Batch Workers (invoked by DisputeEscalationScheduler)
    // =========================================================================

    /**
     * FR-09 / UC-29: Auto-escalates CHO_XAC_NHAN orders whose {@code thoi_diem_bao_giao <= now - 24h}
     * to {@code CHO_XU_LY} with reason {@code OVERDUE_24H} and 3-business-day SLA.
     * NEVER auto-completes or releases items (do_vats stay DANG_GIU, tin_dangs stay GIU_CHO).
     */
    @Transactional
    public int escalateOverdueTransactionsBatch(int batchSize) {
        int safeBatchSize = Math.clamp(batchSize, 1, 500);
        Instant current = now();
        Instant cutoff = current.minus(OVERDUE_CONFIRM_HOURS, ChronoUnit.HOURS);
        Instant responseDeadline = addBusinessDays(current, SLA_RESPONSE_BUSINESS_DAYS);
        Timestamp tsNow = Timestamp.from(current);
        Timestamp tsCutoff = Timestamp.from(cutoff);
        Timestamp tsDeadline = Timestamp.from(responseDeadline);

        List<OverdueOrderRow> overdueOrders = db.query(
                """
                SELECT g.ma_giao_dich, g.ma_tin, g.nguoi_mua_id, g.nguoi_ban_id, t.tieu_de
                FROM giao_dichs g
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                WHERE g.trang_thai = 'CHO_XAC_NHAN'
                  AND g.thoi_diem_bao_giao IS NOT NULL
                  AND g.thoi_diem_bao_giao <= ?
                ORDER BY g.thoi_diem_bao_giao ASC, g.ma_giao_dich ASC
                LIMIT ?
                FOR UPDATE OF g SKIP LOCKED
                """,
                (rs, rowNum) -> new OverdueOrderRow(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_mua_id", UUID.class),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getString("tieu_de")
                ),
                tsCutoff,
                safeBatchSize
        );

        for (OverdueOrderRow row : overdueOrders) {
            db.update(
                    """
                    UPDATE giao_dichs
                    SET trang_thai = 'CHO_XU_LY',
                        ly_do_cho_xu_ly = 'OVERDUE_24H',
                        thoi_diem_chuyen_xu_ly = ?,
                        han_phan_hoi_kdv = ?,
                        updated_at = ?,
                        version = version + 1
                    WHERE ma_giao_dich = ?
                      AND trang_thai = 'CHO_XAC_NHAN'
                    """,
                    tsNow,
                    tsDeadline,
                    tsNow,
                    row.orderId()
            );

            insertTimeline(
                    row.orderId(),
                    "AUTO_ESCALATED_OVERDUE_24H",
                    "CHO_XAC_NHAN",
                    "CHO_XU_LY",
                    null,
                    "SYSTEM",
                    "Quá 24 giờ kể từ lúc người bán báo đã giao nhưng người mua chưa xác nhận hoàn tất. Hệ thống tự động chuyển Kiểm duyệt viên xem xét (hạn phản hồi 3 ngày làm việc).",
                    tsNow
            );

            notificationService.notifyUser(
                    row.buyerId(),
                    OrderDtos.NotificationType.ORDER_ESCALATED_OVERDUE_24H,
                    "Giao dịch đã chuyển Kiểm duyệt viên do quá hạn 24 giờ",
                    "Giao dịch cho tin \"" + row.listingTitle()
                            + "\" đã quá 24 giờ kể từ khi người bán báo đã giao và được chuyển Kiểm duyệt viên xem xét (phản hồi trong 3 ngày làm việc).",
                    row.listingId(),
                    row.orderId()
            );
            notificationService.notifyUser(
                    row.sellerId(),
                    OrderDtos.NotificationType.ORDER_ESCALATED_OVERDUE_24H,
                    "Giao dịch đã chuyển Kiểm duyệt viên do quá hạn 24 giờ",
                    "Giao dịch cho tin \"" + row.listingTitle()
                            + "\" đã quá 24 giờ chưa được người mua xác nhận nên hệ thống chuyển Kiểm duyệt viên xem xét (phản hồi trong 3 ngày làm việc).",
                    row.listingId(),
                    row.orderId()
            );
        }

        return overdueOrders.size();
    }

    /**
     * UC-29 Alt 2: Expires overdue supplementary evidence requests ({@code han_bo_sung <= now})
     * to {@code QUA_HAN} so the dispute automatically returns to the READY queue.
     */
    @Transactional
    public int expireOverdueEvidenceRequestsBatch(int batchSize) {
        int safeBatchSize = Math.clamp(batchSize, 1, 500);
        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);

        List<ExpiredEvidenceRow> expired = db.query(
                """
                SELECT id, ma_giao_dich
                FROM yeu_cau_bo_sung_giao_dichs
                WHERE trang_thai = 'CHO_BO_SUNG'
                  AND han_bo_sung <= ?
                ORDER BY han_bo_sung ASC, id ASC
                LIMIT ?
                FOR UPDATE SKIP LOCKED
                """,
                (rs, rowNum) -> new ExpiredEvidenceRow(
                        rs.getObject("id", UUID.class),
                        rs.getObject("ma_giao_dich", UUID.class)
                ),
                tsNow,
                safeBatchSize
        );

        for (ExpiredEvidenceRow row : expired) {
            db.update(
                    "UPDATE yeu_cau_bo_sung_giao_dichs SET trang_thai = 'QUA_HAN' WHERE id = ? AND trang_thai = 'CHO_BO_SUNG'",
                    row.requestId()
            );
            db.update(
                    "UPDATE giao_dichs SET updated_at = ?, version = version + 1 WHERE ma_giao_dich = ? AND trang_thai = 'CHO_XU_LY'",
                    tsNow,
                    row.orderId()
            );
            insertTimeline(
                    row.orderId(),
                    "EVIDENCE_REQUEST_EXPIRED",
                    "CHO_XU_LY",
                    "CHO_XU_LY",
                    null,
                    "SYSTEM",
                    "Yêu cầu bổ sung bằng chứng đã hết thời hạn nộp. Hồ sơ quay lại hàng đợi sẵn sàng xử lý.",
                    tsNow
            );
        }

        return expired.size();
    }

    // =========================================================================
    // Internal Loaders & Helpers
    // =========================================================================

    private DisputeDtos.DisputeCountsDto loadAdminCounts(UUID moderatorId, Timestamp tsNow) {
        Map<String, Object> row = db.queryForMap(
                """
                SELECT
                    COUNT(*)::bigint AS total_all,
                    COUNT(*) FILTER (
                        WHERE g.trang_thai = 'CHO_XU_LY'
                          AND NOT EXISTS (
                              SELECT 1 FROM yeu_cau_bo_sung_giao_dichs yc
                              WHERE yc.ma_giao_dich = g.ma_giao_dich
                                AND yc.trang_thai = 'CHO_BO_SUNG'
                                AND yc.han_bo_sung > ?
                          )
                    )::bigint AS total_ready,
                    COUNT(*) FILTER (
                        WHERE g.trang_thai = 'CHO_XU_LY'
                          AND EXISTS (
                              SELECT 1 FROM yeu_cau_bo_sung_giao_dichs yc
                              WHERE yc.ma_giao_dich = g.ma_giao_dich
                                AND yc.trang_thai = 'CHO_BO_SUNG'
                                AND yc.han_bo_sung > ?
                          )
                    )::bigint AS total_waiting,
                    COUNT(*) FILTER (
                        WHERE g.trang_thai IN ('HOAN_TAT', 'HUY')
                    )::bigint AS total_resolved,
                    COUNT(*) FILTER (
                        WHERE g.ly_do_cho_xu_ly = 'OVERDUE_24H'
                    )::bigint AS total_overdue_24h,
                    COUNT(*) FILTER (
                        WHERE g.ly_do_cho_xu_ly = 'CANCEL_DISPUTE'
                    )::bigint AS total_cancel_dispute
                FROM giao_dichs g
                LEFT JOIN quyet_dinh_giao_dichs qd ON qd.ma_giao_dich = g.ma_giao_dich
                WHERE g.nguoi_ban_id <> ?
                  AND g.nguoi_mua_id <> ?
                  AND (
                      g.trang_thai = 'CHO_XU_LY'
                      OR (
                          g.trang_thai IN ('HOAN_TAT', 'HUY')
                          AND (qd.id IS NOT NULL OR g.thoi_diem_chuyen_xu_ly IS NOT NULL)
                      )
                  )
                """,
                tsNow,
                tsNow,
                moderatorId,
                moderatorId
        );

        return new DisputeDtos.DisputeCountsDto(
                ((Number) row.get("total_all")).longValue(),
                ((Number) row.get("total_ready")).longValue(),
                ((Number) row.get("total_waiting")).longValue(),
                ((Number) row.get("total_resolved")).longValue(),
                ((Number) row.get("total_overdue_24h")).longValue(),
                ((Number) row.get("total_cancel_dispute")).longValue()
        );
    }

    private DisputeDtos.DisputeDetailDto loadAdminDisputeDetail(UUID moderatorId, UUID orderId) {
        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);

        List<AdminDetailRow> rows = db.query(
                """
                SELECT g.ma_giao_dich, g.version, g.trang_thai, g.ly_do_cho_xu_ly,
                       g.thoi_diem_chuyen_xu_ly, g.han_phan_hoi_kdv, g.gia_thoa_thuan,
                       g.thoi_gian_hen, g.dia_diem_hen, g.thoi_diem_bat_dau_giao,
                       g.thoi_diem_bao_giao, g.ghi_chu_ban_giao, g.anh_ban_giao,
                       g.thoi_diem_hoan_tat, g.thoi_diem_huy, g.han_danh_gia_den,
                       t.ma_tin, t.tieu_de, t.gia_vnd, t.hinh_thuc, t.trang_thai AS listing_status, t.hinh_anh,
                       b.user_id AS buyer_id, b.ho_ten AS buyer_name, b.diem_uy_tin AS buyer_score,
                       s.user_id AS seller_id, s.ho_ten AS seller_name, s.diem_uy_tin AS seller_score,
                       EXISTS (
                           SELECT 1 FROM yeu_cau_bo_sung_giao_dichs yc
                           WHERE yc.ma_giao_dich = g.ma_giao_dich
                             AND yc.trang_thai = 'CHO_BO_SUNG'
                             AND yc.han_bo_sung > ?
                       ) AS has_active_evidence_request,
                       qd.id AS decision_id, qd.ket_luan AS decision_conclusion, qd.can_cu AS decision_basis,
                       qd.nguoi_quyet_dinh_id AS decided_by_id, decider.ho_ten AS decided_by_name,
                       qd.thoi_diem AS decided_at, qd.tin_dang_trang_thai_sau, qd.ly_do_an_tin
                FROM giao_dichs g
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                JOIN thanh_viens s ON s.user_id = g.nguoi_ban_id
                JOIN thanh_viens b ON b.user_id = g.nguoi_mua_id
                LEFT JOIN quyet_dinh_giao_dichs qd ON qd.ma_giao_dich = g.ma_giao_dich
                LEFT JOIN thanh_viens decider ON decider.user_id = qd.nguoi_quyet_dinh_id
                WHERE g.ma_giao_dich = ?
                """,
                (rs, rowNum) -> new AdminDetailRow(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getLong("version"),
                        rs.getString("trang_thai"),
                        rs.getString("ly_do_cho_xu_ly"),
                        toInstant(rs.getTimestamp("thoi_diem_chuyen_xu_ly")),
                        toInstant(rs.getTimestamp("han_phan_hoi_kdv")),
                        rs.getInt("gia_thoa_thuan"),
                        toInstant(rs.getTimestamp("thoi_gian_hen")),
                        rs.getString("dia_diem_hen"),
                        toInstant(rs.getTimestamp("thoi_diem_bat_dau_giao")),
                        toInstant(rs.getTimestamp("thoi_diem_bao_giao")),
                        rs.getString("ghi_chu_ban_giao"),
                        rs.getString("anh_ban_giao"),
                        toInstant(rs.getTimestamp("thoi_diem_hoan_tat")),
                        toInstant(rs.getTimestamp("thoi_diem_huy")),
                        toInstant(rs.getTimestamp("han_danh_gia_den")),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getString("tieu_de"),
                        rs.getInt("gia_vnd"),
                        rs.getString("hinh_thuc"),
                        rs.getString("listing_status"),
                        extractTextArray(rs, "hinh_anh"),
                        rs.getObject("buyer_id", UUID.class),
                        rs.getString("buyer_name"),
                        rs.getInt("buyer_score"),
                        rs.getObject("seller_id", UUID.class),
                        rs.getString("seller_name"),
                        rs.getInt("seller_score"),
                        rs.getBoolean("has_active_evidence_request"),
                        rs.getObject("decision_id", UUID.class),
                        rs.getString("decision_conclusion"),
                        rs.getString("decision_basis"),
                        rs.getObject("decided_by_id", UUID.class),
                        rs.getString("decided_by_name"),
                        toInstant(rs.getTimestamp("decided_at")),
                        rs.getString("tin_dang_trang_thai_sau"),
                        rs.getString("ly_do_an_tin")
                ),
                tsNow,
                orderId
        );

        if (rows.isEmpty()) {
            throw new AuthFailure(404, "DISPUTE_NOT_FOUND", "Không tìm thấy hồ sơ giao dịch tranh chấp.");
        }
        AdminDetailRow row = rows.getFirst();
        enforceNotSelfDispute(moderatorId, row.buyerId(), row.sellerId());

        List<DisputeDtos.DisputeItemDto> items = loadOrderItems(orderId, row.listingId());
        boolean isCombo = ListingDtos.ListingType.BAN_COMBO.name().equals(row.listingType()) || items.size() >= 2;
        boolean isFree = row.listedPriceVnd() == 0;
        String queueState = computeQueueState(row.status(), row.hasActiveEvidenceRequest());
        boolean overdueSla = computeOverdueSla(row.status(), row.responseDeadlineAt(), current);

        DisputeDtos.DecisionSummaryDto decisionSummary = row.decisionId() != null
                ? new DisputeDtos.DecisionSummaryDto(row.decisionConclusion(), row.decidedByName(), row.decidedAt())
                : null;
        DisputeDtos.DisputeDecisionDto decision = row.decisionId() != null
                ? new DisputeDtos.DisputeDecisionDto(
                        row.decisionId(),
                        row.decisionConclusion(),
                        row.decisionBasis(),
                        row.decidedById(),
                        row.decidedByName(),
                        row.decidedAt(),
                        row.listingStatusAfter(),
                        row.listingHiddenReason()
                )
                : null;

        List<DisputeDtos.HandoverPhotoDto> handoverPhotos = loadHandoverPhotos(orderId, row.legacyHandoverPhoto(), row.reportedDeliveredAt());
        List<DisputeDtos.DisputeScheduleProposalDto> scheduleProposals = loadScheduleProposals(orderId);
        List<DisputeDtos.DisputeCancelRequestDto> cancelRequests = loadCancelRequests(orderId, row.buyerId());
        List<DisputeDtos.AdminEvidenceRequestDto> evidenceRequests = loadAdminEvidenceRequests(orderId);
        List<DisputeDtos.DisputeChatMessageDto> chatMessages = loadChatMessages(row.listingId(), row.buyerId(), row.sellerId());
        List<DisputeDtos.DisputeTimelineEntryDto> timeline = loadTimeline(orderId);

        return new DisputeDtos.DisputeDetailDto(
                row.orderId(),
                row.version(),
                row.status(),
                row.escalationReason(),
                row.escalatedAt(),
                row.responseDeadlineAt(),
                overdueSla,
                queueState,
                new DisputeDtos.DisputeListingSummaryDto(
                        row.listingId(),
                        row.listingTitle(),
                        row.listedPriceVnd(),
                        isCombo,
                        isFree,
                        row.listingStatus(),
                        row.listingImages().isEmpty() ? null : row.listingImages().getFirst()
                ),
                row.agreedPriceVnd(),
                new DisputeDtos.DisputePartySummaryDto(row.buyerId(), row.buyerName(), row.buyerScore()),
                new DisputeDtos.DisputePartySummaryDto(row.sellerId(), row.sellerName(), row.sellerScore()),
                row.reportedDeliveredAt(),
                row.hasActiveEvidenceRequest(),
                decisionSummary,
                items,
                row.meetingTime(),
                row.meetingLocation(),
                row.deliveryStartedAt(),
                row.deliveryNote(),
                row.completedAt(),
                row.cancelledAt(),
                row.reviewDeadlineAt(),
                handoverPhotos,
                scheduleProposals,
                cancelRequests,
                evidenceRequests,
                chatMessages,
                timeline,
                decision,
                "CHO_XU_LY".equals(row.status())
        );
    }

    private DisputeDtos.MemberDisputeDto loadMemberDispute(UUID viewerId, UUID orderId) {
        Instant current = now();
        List<MemberOrderRow> rows = db.query(
                """
                SELECT g.ma_giao_dich, g.trang_thai, g.version, g.nguoi_mua_id, g.nguoi_ban_id,
                       g.ly_do_cho_xu_ly, g.thoi_diem_chuyen_xu_ly, g.han_phan_hoi_kdv, g.han_danh_gia_den,
                       qd.id AS decision_id, qd.ket_luan AS decision_conclusion, qd.can_cu AS decision_basis,
                       qd.thoi_diem AS decided_at, qd.tin_dang_trang_thai_sau, qd.ly_do_an_tin
                FROM giao_dichs g
                LEFT JOIN quyet_dinh_giao_dichs qd ON qd.ma_giao_dich = g.ma_giao_dich
                WHERE g.ma_giao_dich = ?
                """,
                (rs, rowNum) -> new MemberOrderRow(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getString("trang_thai"),
                        rs.getLong("version"),
                        rs.getObject("nguoi_mua_id", UUID.class),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getString("ly_do_cho_xu_ly"),
                        toInstant(rs.getTimestamp("thoi_diem_chuyen_xu_ly")),
                        toInstant(rs.getTimestamp("han_phan_hoi_kdv")),
                        toInstant(rs.getTimestamp("han_danh_gia_den")),
                        rs.getObject("decision_id", UUID.class),
                        rs.getString("decision_conclusion"),
                        rs.getString("decision_basis"),
                        toInstant(rs.getTimestamp("decided_at")),
                        rs.getString("tin_dang_trang_thai_sau"),
                        rs.getString("ly_do_an_tin")
                ),
                orderId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "DISPUTE_NOT_FOUND", "Không tìm thấy thông tin tranh chấp của giao dịch.");
        }
        MemberOrderRow row = rows.getFirst();
        boolean isBuyer = row.buyerId().equals(viewerId);
        boolean isSeller = row.sellerId().equals(viewerId);
        if (!isBuyer && !isSeller) {
            throw new AuthFailure(403, "DISPUTE_FORBIDDEN", "Bạn không có quyền xem thông tin tranh chấp của giao dịch này.");
        }
        String viewerRole = isBuyer ? "BUYER" : "SELLER";
        boolean viewerActive = isAccountActivelyAvailableReadOnly(viewerId, current);

        DisputeDtos.MemberDisputeDecisionDto decision = row.decisionId() != null
                ? new DisputeDtos.MemberDisputeDecisionDto(
                        row.decisionId(),
                        row.decisionConclusion(),
                        row.decisionBasis(),
                        row.decidedAt(),
                        row.listingStatusAfter(),
                        row.listingHiddenReason()
                )
                : null;

        List<DisputeDtos.MemberEvidenceRequestDto> evidenceRequests = loadMemberEvidenceRequests(
                orderId,
                row.status(),
                viewerRole,
                viewerActive,
                current
        );
        List<DisputeDtos.DisputeTimelineEntryDto> timeline = loadTimeline(orderId);

        return new DisputeDtos.MemberDisputeDto(
                row.orderId(),
                row.status(),
                row.version(),
                viewerRole,
                row.escalationReason(),
                row.escalatedAt(),
                row.responseDeadlineAt(),
                row.reviewDeadlineAt(),
                decision,
                evidenceRequests,
                timeline
        );
    }

    private DisputeDtos.DisputeSummaryDto mapSummaryRow(ResultSet rs, Instant current) throws SQLException {
        String status = rs.getString("trang_thai");
        boolean hasActiveEvidence = rs.getBoolean("has_active_evidence_request");
        Instant responseDeadlineAt = toInstant(rs.getTimestamp("han_phan_hoi_kdv"));
        List<String> images = extractTextArray(rs, "hinh_anh");
        int listedPrice = rs.getInt("gia_vnd");
        String listingType = rs.getString("hinh_thuc");
        int itemCount = Math.max(1, rs.getInt("item_count"));
        boolean isCombo = ListingDtos.ListingType.BAN_COMBO.name().equals(listingType) || itemCount >= 2;
        boolean isFree = listedPrice == 0;

        String conclusion = rs.getString("decision_conclusion");
        DisputeDtos.DecisionSummaryDto decisionSummary = conclusion != null
                ? new DisputeDtos.DecisionSummaryDto(
                        conclusion,
                        rs.getString("decided_by_name"),
                        toInstant(rs.getTimestamp("decided_at"))
                )
                : null;

        return new DisputeDtos.DisputeSummaryDto(
                rs.getObject("ma_giao_dich", UUID.class),
                rs.getLong("version"),
                status,
                rs.getString("ly_do_cho_xu_ly"),
                toInstant(rs.getTimestamp("thoi_diem_chuyen_xu_ly")),
                responseDeadlineAt,
                computeOverdueSla(status, responseDeadlineAt, current),
                computeQueueState(status, hasActiveEvidence),
                new DisputeDtos.DisputeListingSummaryDto(
                        rs.getObject("ma_tin", UUID.class),
                        rs.getString("tieu_de"),
                        listedPrice,
                        isCombo,
                        isFree,
                        rs.getString("listing_status"),
                        images.isEmpty() ? null : images.getFirst()
                ),
                rs.getInt("gia_thoa_thuan"),
                new DisputeDtos.DisputePartySummaryDto(
                        rs.getObject("buyer_id", UUID.class),
                        rs.getString("buyer_name"),
                        rs.getInt("buyer_score")
                ),
                new DisputeDtos.DisputePartySummaryDto(
                        rs.getObject("seller_id", UUID.class),
                        rs.getString("seller_name"),
                        rs.getInt("seller_score")
                ),
                toInstant(rs.getTimestamp("thoi_diem_bao_giao")),
                hasActiveEvidence,
                decisionSummary
        );
    }

    private List<DisputeDtos.DisputeItemDto> loadOrderItems(UUID orderId, UUID listingId) {
        List<DisputeDtos.DisputeItemDto> snapshot = db.query(
                """
                SELECT COALESCE(d.ma_vat, gdv.id) AS item_id,
                       COALESCE(d.ten, gdv.ten_vat_snapshot) AS item_name,
                       COALESCE(d.tinh_trang, gdv.tinh_trang_snapshot) AS item_condition,
                       COALESCE(d.trang_thai, 'DA_XOA') AS item_status,
                       gdv.giu_hieu_luc
                FROM giao_dich_do_vat gdv
                LEFT JOIN do_vats d ON d.ma_vat = gdv.ma_vat
                WHERE gdv.ma_giao_dich = ?
                ORDER BY COALESCE(d.ma_vat, gdv.id) ASC
                """,
                (rs, rowNum) -> new DisputeDtos.DisputeItemDto(
                        rs.getObject("item_id", UUID.class),
                        rs.getString("item_name"),
                        rs.getString("item_condition"),
                        rs.getString("item_status"),
                        rs.getBoolean("giu_hieu_luc")
                ),
                orderId
        );
        if (!snapshot.isEmpty()) {
            return snapshot;
        }
        return db.query(
                """
                SELECT d.ma_vat, d.ten, d.tinh_trang, d.trang_thai
                FROM tin_dang_do_vat tdv
                JOIN do_vats d ON d.ma_vat = tdv.ma_vat
                WHERE tdv.ma_tin = ?
                ORDER BY d.ma_vat ASC
                """,
                (rs, rowNum) -> new DisputeDtos.DisputeItemDto(
                        rs.getObject("ma_vat", UUID.class),
                        rs.getString("ten"),
                        rs.getString("tinh_trang"),
                        rs.getString("trang_thai"),
                        false
                ),
                listingId
        );
    }

    private List<DisputeDtos.HandoverPhotoDto> loadHandoverPhotos(
            UUID orderId,
            String legacyHandoverPhoto,
            Instant reportedDeliveredAt
    ) {
        List<DisputeDtos.HandoverPhotoDto> photos = db.query(
                """
                SELECT id, content_type, size_bytes, uploaded_at
                FROM anh_ban_giao_giao_dichs
                WHERE ma_giao_dich = ?
                ORDER BY thu_tu ASC, uploaded_at ASC, id ASC
                """,
                (rs, rowNum) -> {
                    UUID photoId = rs.getObject("id", UUID.class);
                    return new DisputeDtos.HandoverPhotoDto(
                            photoId,
                            "/api/v1/admin/disputes/" + orderId + "/evidence/handover/" + photoId,
                            rs.getString("content_type"),
                            rs.getLong("size_bytes"),
                            toInstant(rs.getTimestamp("uploaded_at"))
                    );
                },
                orderId
        );
        if (!photos.isEmpty()) {
            return photos;
        }
        if (legacyHandoverPhoto != null && !legacyHandoverPhoto.isBlank()) {
            String trimmed = legacyHandoverPhoto.strip();
            UUID legacyId = legacyHandoverPhotoId(orderId);
            String url = (trimmed.startsWith("/") || trimmed.startsWith("http://") || trimmed.startsWith("https://"))
                    ? trimmed
                    : "/api/v1/admin/disputes/" + orderId + "/evidence/handover/" + legacyId;
            return List.of(new DisputeDtos.HandoverPhotoDto(
                    legacyId,
                    url,
                    guessImageContentType(trimmed),
                    0L,
                    reportedDeliveredAt
            ));
        }
        return List.of();
    }

    private List<DisputeDtos.DisputeScheduleProposalDto> loadScheduleProposals(UUID orderId) {
        return db.query(
                """
                SELECT lh.id, u.ho_ten AS proposer_name, lh.thoi_gian_de_xuat, lh.dia_diem_de_xuat,
                       lh.ghi_chu, lh.trang_thai, lh.thoi_diem_phan_hoi, lh.ly_do_tu_choi, lh.created_at
                FROM lich_hen_giao_dichs lh
                JOIN thanh_viens u ON u.user_id = lh.nguoi_de_xuat_id
                WHERE lh.ma_giao_dich = ?
                ORDER BY lh.created_at DESC, lh.id DESC
                """,
                (rs, rowNum) -> new DisputeDtos.DisputeScheduleProposalDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("proposer_name"),
                        toInstant(rs.getTimestamp("thoi_gian_de_xuat")),
                        rs.getString("dia_diem_de_xuat"),
                        rs.getString("ghi_chu"),
                        rs.getString("trang_thai"),
                        toInstant(rs.getTimestamp("thoi_diem_phan_hoi")),
                        rs.getString("ly_do_tu_choi"),
                        toInstant(rs.getTimestamp("created_at"))
                ),
                orderId
        );
    }

    private List<DisputeDtos.DisputeCancelRequestDto> loadCancelRequests(UUID orderId, UUID buyerId) {
        return db.query(
                """
                SELECT yc.id, yc.nguoi_yeu_cau_id, req.ho_ten AS requester_name,
                       yc.ma_ly_do, yc.ly_do, yc.trang_thai,
                       resp.ho_ten AS responder_name, yc.phan_hoi_ghi_chu,
                       yc.thoi_diem_phan_hoi, yc.created_at
                FROM yeu_cau_huy_giao_dichs yc
                JOIN thanh_viens req ON req.user_id = yc.nguoi_yeu_cau_id
                LEFT JOIN thanh_viens resp ON resp.user_id = yc.nguoi_phan_hoi_id
                WHERE yc.ma_giao_dich = ?
                ORDER BY yc.created_at DESC, yc.id DESC
                """,
                (rs, rowNum) -> {
                    UUID requesterId = rs.getObject("nguoi_yeu_cau_id", UUID.class);
                    return new DisputeDtos.DisputeCancelRequestDto(
                            rs.getObject("id", UUID.class),
                            requesterId,
                            buyerId.equals(requesterId) ? "BUYER" : "SELLER",
                            rs.getString("requester_name"),
                            rs.getString("ma_ly_do"),
                            rs.getString("ly_do"),
                            rs.getString("trang_thai"),
                            rs.getString("responder_name"),
                            rs.getString("phan_hoi_ghi_chu"),
                            toInstant(rs.getTimestamp("thoi_diem_phan_hoi")),
                            toInstant(rs.getTimestamp("created_at"))
                    );
                },
                orderId
        );
    }

    private List<DisputeDtos.AdminEvidenceRequestDto> loadAdminEvidenceRequests(UUID orderId) {
        List<RawEvidenceRequest> requests = loadRawEvidenceRequests(orderId);
        if (requests.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<RawEvidenceResponse>> responsesByReq = loadResponsesByRequest(orderId);
        Map<UUID, List<DisputeDtos.EvidenceAttachmentDto>> attachmentsByResp = loadAttachmentsByResponse(
                orderId,
                "/api/v1/admin/disputes/" + orderId + "/evidence/supplementary/"
        );

        List<DisputeDtos.AdminEvidenceRequestDto> result = new ArrayList<>(requests.size());
        for (RawEvidenceRequest req : requests) {
            List<RawEvidenceResponse> rawResps = responsesByReq.getOrDefault(req.id(), List.of());
            List<DisputeDtos.AdminEvidenceResponseDto> mappedResps = rawResps.stream()
                    .map(r -> new DisputeDtos.AdminEvidenceResponseDto(
                            r.id(),
                            r.senderId(),
                            r.senderRole(),
                            r.senderName(),
                            r.note(),
                            r.createdAt(),
                            attachmentsByResp.getOrDefault(r.id(), List.of())
                    ))
                    .toList();
            result.add(new DisputeDtos.AdminEvidenceRequestDto(
                    req.id(),
                    req.targetParty(),
                    req.instruction(),
                    req.dueAt(),
                    req.status(),
                    req.requestedByName(),
                    req.createdAt(),
                    req.respondedAt(),
                    mappedResps
            ));
        }
        return List.copyOf(result);
    }

    private List<DisputeDtos.MemberEvidenceRequestDto> loadMemberEvidenceRequests(
            UUID orderId,
            String orderStatus,
            String viewerRole,
            boolean viewerActive,
            Instant current
    ) {
        List<RawEvidenceRequest> requests = loadRawEvidenceRequests(orderId);
        if (requests.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<RawEvidenceResponse>> responsesByReq = loadResponsesByRequest(orderId);
        Map<UUID, List<DisputeDtos.EvidenceAttachmentDto>> attachmentsByResp = loadAttachmentsByResponse(
                orderId,
                "/api/v1/orders/" + orderId + "/dispute/evidence/"
        );

        List<DisputeDtos.MemberEvidenceRequestDto> result = new ArrayList<>(requests.size());
        for (RawEvidenceRequest req : requests) {
            List<RawEvidenceResponse> rawResps = responsesByReq.getOrDefault(req.id(), List.of());
            boolean hasViewerResponded = rawResps.stream().anyMatch(r -> viewerRole.equals(r.senderRole()));
            boolean isTargeted = "BOTH".equals(req.targetParty()) || viewerRole.equals(req.targetParty());
            boolean canSubmit = viewerActive
                    && "CHO_XU_LY".equals(orderStatus)
                    && "CHO_BO_SUNG".equals(req.status())
                    && req.dueAt() != null
                    && req.dueAt().isAfter(current)
                    && isTargeted
                    && !hasViewerResponded;

            List<DisputeDtos.MemberEvidenceResponseDto> mappedResps = rawResps.stream()
                    .map(r -> new DisputeDtos.MemberEvidenceResponseDto(
                            r.id(),
                            r.senderRole(),
                            r.senderName(),
                            r.note(),
                            r.createdAt(),
                            attachmentsByResp.getOrDefault(r.id(), List.of())
                    ))
                    .toList();
            result.add(new DisputeDtos.MemberEvidenceRequestDto(
                    req.id(),
                    req.targetParty(),
                    req.instruction(),
                    req.dueAt(),
                    req.status(),
                    req.createdAt(),
                    canSubmit,
                    hasViewerResponded,
                    mappedResps
            ));
        }
        return List.copyOf(result);
    }

    private List<RawEvidenceRequest> loadRawEvidenceRequests(UUID orderId) {
        return db.query(
                """
                SELECT yc.id, yc.ben_duoc_yeu_cau, yc.noi_dung, yc.han_bo_sung, yc.trang_thai,
                       u.ho_ten AS requester_name, yc.thoi_diem_tao, yc.thoi_diem_phan_hoi
                FROM yeu_cau_bo_sung_giao_dichs yc
                JOIN thanh_viens u ON u.user_id = yc.nguoi_yeu_cau_id
                WHERE yc.ma_giao_dich = ?
                ORDER BY yc.thoi_diem_tao DESC, yc.id DESC
                """,
                (rs, rowNum) -> new RawEvidenceRequest(
                        rs.getObject("id", UUID.class),
                        rs.getString("ben_duoc_yeu_cau"),
                        rs.getString("noi_dung"),
                        toInstant(rs.getTimestamp("han_bo_sung")),
                        rs.getString("trang_thai"),
                        rs.getString("requester_name"),
                        toInstant(rs.getTimestamp("thoi_diem_tao")),
                        toInstant(rs.getTimestamp("thoi_diem_phan_hoi"))
                ),
                orderId
        );
    }

    private Map<UUID, List<RawEvidenceResponse>> loadResponsesByRequest(UUID orderId) {
        Map<UUID, List<RawEvidenceResponse>> grouped = new LinkedHashMap<>();
        db.query(
                """
                SELECT ph.id, ph.yeu_cau_id, ph.nguoi_gui_id, ph.vai_tro_gui,
                       u.ho_ten AS sender_name, ph.noi_dung, ph.created_at
                FROM phan_hoi_bo_sung_giao_dichs ph
                JOIN thanh_viens u ON u.user_id = ph.nguoi_gui_id
                WHERE ph.ma_giao_dich = ?
                ORDER BY ph.created_at ASC, ph.id ASC
                """,
                rs -> {
                    UUID reqId = rs.getObject("yeu_cau_id", UUID.class);
                    grouped.computeIfAbsent(reqId, k -> new ArrayList<>()).add(new RawEvidenceResponse(
                            rs.getObject("id", UUID.class),
                            reqId,
                            rs.getObject("nguoi_gui_id", UUID.class),
                            rs.getString("vai_tro_gui"),
                            rs.getString("sender_name"),
                            rs.getString("noi_dung"),
                            toInstant(rs.getTimestamp("created_at"))
                    ));
                },
                orderId
        );
        return grouped;
    }

    private Map<UUID, List<DisputeDtos.EvidenceAttachmentDto>> loadAttachmentsByResponse(UUID orderId, String urlPrefix) {
        Map<UUID, List<DisputeDtos.EvidenceAttachmentDto>> grouped = new LinkedHashMap<>();
        db.query(
                """
                SELECT id, phan_hoi_id, original_filename, content_type, size_bytes, uploaded_at
                FROM bang_chung_bo_sung_giao_dichs
                WHERE ma_giao_dich = ?
                ORDER BY uploaded_at ASC, id ASC
                """,
                rs -> {
                    UUID attachmentId = rs.getObject("id", UUID.class);
                    UUID respId = rs.getObject("phan_hoi_id", UUID.class);
                    grouped.computeIfAbsent(respId, k -> new ArrayList<>()).add(new DisputeDtos.EvidenceAttachmentDto(
                            attachmentId,
                            urlPrefix + attachmentId,
                            rs.getString("original_filename"),
                            rs.getString("content_type"),
                            rs.getLong("size_bytes"),
                            toInstant(rs.getTimestamp("uploaded_at"))
                    ));
                },
                orderId
        );
        return grouped;
    }

    private List<DisputeDtos.DisputeChatMessageDto> loadChatMessages(UUID listingId, UUID buyerId, UUID sellerId) {
        return db.query(
                """
                SELECT tn.ma_tin_nhan, tn.nguoi_gui_id, u.ho_ten AS sender_name,
                       tn.noi_dung, tn.gia_de_nghi, tn.thoi_diem_gui
                FROM hoi_thoais ht
                JOIN tin_nhans tn ON tn.ma_hoi_thoai = ht.ma_hoi_thoai
                JOIN thanh_viens u ON u.user_id = tn.nguoi_gui_id
                WHERE ht.ma_tin = ?
                  AND ht.nguoi_mua_id = ?
                  AND ht.nguoi_ban_id = ?
                ORDER BY tn.thoi_diem_gui ASC, tn.ma_tin_nhan ASC
                """,
                (rs, rowNum) -> {
                    UUID senderId = rs.getObject("nguoi_gui_id", UUID.class);
                    Integer proposedPrice = rs.getObject("gia_de_nghi") != null
                            ? ((Number) rs.getObject("gia_de_nghi")).intValue()
                            : null;
                    return new DisputeDtos.DisputeChatMessageDto(
                            rs.getObject("ma_tin_nhan", UUID.class),
                            senderId,
                            buyerId.equals(senderId) ? "BUYER" : "SELLER",
                            rs.getString("sender_name"),
                            rs.getString("noi_dung"),
                            proposedPrice,
                            toInstant(rs.getTimestamp("thoi_diem_gui"))
                    );
                },
                listingId,
                buyerId,
                sellerId
        );
    }

    private List<DisputeDtos.DisputeTimelineEntryDto> loadTimeline(UUID orderId) {
        return db.query(
                """
                SELECT id, hanh_dong, trang_thai_truoc, trang_thai_sau, vai_tro_thuc_hien, ghi_chu, created_at
                FROM lich_su_trang_thai_giao_dich
                WHERE ma_giao_dich = ?
                ORDER BY created_at ASC, id ASC
                """,
                (rs, rowNum) -> new DisputeDtos.DisputeTimelineEntryDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("hanh_dong"),
                        rs.getString("trang_thai_truoc"),
                        rs.getString("trang_thai_sau"),
                        rs.getString("vai_tro_thuc_hien"),
                        rs.getString("ghi_chu"),
                        toInstant(rs.getTimestamp("created_at"))
                ),
                orderId
        );
    }

    private DisputeDtos.EvidenceBinaryContent loadSupplementaryAttachmentBinary(UUID orderId, UUID attachmentId) {
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT id, storage_key, content_type, size_bytes
                FROM bang_chung_bo_sung_giao_dichs
                WHERE id = ? AND ma_giao_dich = ?
                """,
                attachmentId,
                orderId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy tệp bằng chứng bổ sung.");
        }
        Map<String, Object> row = rows.getFirst();
        String storageKey = (String) row.get("storage_key");
        String contentType = (String) row.get("content_type");
        long dbSize = ((Number) row.get("size_bytes")).longValue();
        Resource resource = evidenceStorage.loadAsResource(storageKey);
        return new DisputeDtos.EvidenceBinaryContent(attachmentId, contentType, resolveSize(resource, dbSize), resource);
    }

    private List<SanitizedEvidenceFile> validateAndSanitizeEvidenceFiles(UUID orderId, List<MultipartFile> files) {
        if (files == null || files.isEmpty()) {
            return List.of();
        }
        if (files.size() > MAX_EVIDENCE_FILES) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Chỉ được đính kèm tối đa " + MAX_EVIDENCE_FILES + " ảnh bằng chứng.");
        }
        List<SanitizedEvidenceFile> prepared = new ArrayList<>(files.size());
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Tệp ảnh bằng chứng trống hoặc không hợp lệ.");
            }
            if (file.getSize() > MAX_EVIDENCE_FILE_BYTES) {
                throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi ảnh bằng chứng không được vượt quá 5MB.");
            }
            byte[] rawBytes;
            try {
                rawBytes = file.getBytes();
            } catch (IOException e) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Không thể đọc tệp ảnh bằng chứng.");
            }
            if (rawBytes.length == 0) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Tệp ảnh bằng chứng trống hoặc không hợp lệ.");
            }
            if (rawBytes.length > MAX_EVIDENCE_FILE_BYTES) {
                throw new AuthFailure(413, "FILE_TOO_LARGE", "Kích thước mỗi ảnh bằng chứng không được vượt quá 5MB.");
            }
            MediaMagicBytes.DetectedImageType detected = MediaMagicBytes.detect(rawBytes)
                    .orElseThrow(() -> new AuthFailure(
                            400,
                            "INVALID_MEDIA",
                            "Chỉ chấp nhận ảnh bằng chứng định dạng JPEG, PNG hoặc WebP hợp lệ."
                    ));
            byte[] sanitized = MediaImageSanitizer.sanitize(rawBytes, detected, MAX_EVIDENCE_FILE_BYTES);
            UUID attachmentId = UUID.randomUUID();
            String storageKey = "supplementary/" + orderId + "/" + attachmentId + "." + detected.extension();
            prepared.add(new SanitizedEvidenceFile(
                    attachmentId,
                    storageKey,
                    MediaMagicBytes.sanitizeFilename(file.getOriginalFilename()),
                    detected.contentType(),
                    sanitized.length,
                    MediaMagicBytes.sha256Hex(sanitized),
                    sanitized
            ));
        }
        return List.copyOf(prepared);
    }

    private String evaluateListingReopenIneligibility(LockedSeller seller, LockedListing listing, Instant current) {
        if (!seller.isActive()) {
            return "Tài khoản người bán hiện không ở trạng thái hoạt động nên tin đăng không thể công khai lại.";
        }
        boolean expiredByExpiresAt = listing.expiresAt() != null && !current.isBefore(listing.expiresAt());
        boolean expiredByPublishedAt = listing.expiresAt() == null
                && listing.publishedAt() != null
                && !current.isBefore(listing.publishedAt().plus(ListingLifecycleHelper.LISTING_LIFETIME_DAYS, ChronoUnit.DAYS));
        if (expiredByExpiresAt || expiredByPublishedAt) {
            return "Tin đăng đã hết thời hạn hiển thị 30 ngày nên được giữ ở trạng thái Ẩn.";
        }
        if (!areAllListingItemsAvailable(listing.id())) {
            return "Một hoặc nhiều đồ vật thuộc tin đăng không còn ở trạng thái Khả dụng nên tin đăng được giữ ở trạng thái Ẩn.";
        }
        int quotaLimit = ListingLifecycleHelper.calculateQuotaLimit(seller.reputationScore());
        int otherActiveCount = countOtherActiveOrReservedListings(seller.userId(), listing.id(), current);
        if (otherActiveCount >= quotaLimit) {
            return "Người bán đã đạt hạn mức tin đăng đang mở/giữ chỗ (" + otherActiveCount + "/" + quotaLimit
                    + ") nên tin đăng được giữ ở trạng thái Ẩn.";
        }
        return null;
    }

    private int countOtherActiveOrReservedListings(UUID sellerId, UUID excludedListingId, Instant current) {
        Integer count = db.queryForObject(
                """
                SELECT COUNT(*)
                FROM tin_dangs
                WHERE nguoi_dang_id = ?
                  AND ma_tin <> ?
                  AND (
                      trang_thai = 'GIU_CHO'
                      OR (trang_thai = 'CONG_KHAI' AND (expires_at IS NULL OR expires_at > ?))
                  )
                """,
                Integer.class,
                sellerId,
                excludedListingId,
                Timestamp.from(current)
        );
        return count != null ? count : 0;
    }

    private boolean areAllListingItemsAvailable(UUID listingId) {
        Integer total = db.queryForObject(
                "SELECT COUNT(*) FROM tin_dang_do_vat WHERE ma_tin = ?",
                Integer.class,
                listingId
        );
        if (total == null || total == 0) {
            return false;
        }
        Integer unavailable = db.queryForObject(
                """
                SELECT COUNT(*)
                FROM tin_dang_do_vat tdv
                JOIN do_vats d ON d.ma_vat = tdv.ma_vat
                WHERE tdv.ma_tin = ?
                  AND (
                      d.trang_thai <> 'KHA_DUNG'
                      OR EXISTS (
                          SELECT 1 FROM giao_dich_do_vat gdv
                          WHERE gdv.ma_vat = d.ma_vat AND gdv.giu_hieu_luc = TRUE
                      )
                  )
                """,
                Integer.class,
                listingId
        );
        return unavailable == null || unavailable == 0;
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

    private void invalidateActiveOtps(UUID orderId) {
        db.update(
                """
                UPDATE ma_xac_nhan_otp
                SET bi_vo_hieu = TRUE,
                    ly_do_vo_hieu = 'QUYET_DINH_KIEM_DUYET',
                    otp_ciphertext = NULL
                WHERE ma_giao_dich = ?
                  AND da_dung = FALSE
                  AND bi_vo_hieu = FALSE
                """,
                orderId
        );
    }

    private void insertDecisionOrConflict(
            UUID orderId,
            UUID moderatorId,
            String conclusion,
            String basis,
            String listingStatusAfter,
            String listingHiddenReason,
            Timestamp tsNow
    ) {
        try {
            db.update(
                    """
                    INSERT INTO quyet_dinh_giao_dichs(
                        id, ma_giao_dich, nguoi_quyet_dinh_id, ket_luan, can_cu,
                        tin_dang_trang_thai_sau, ly_do_an_tin, thoi_diem
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    UUID.randomUUID(),
                    orderId,
                    moderatorId,
                    conclusion,
                    basis,
                    listingStatusAfter,
                    listingHiddenReason,
                    tsNow
            );
        } catch (DataIntegrityViolationException ex) {
            throw new AuthFailure(
                    409,
                    "DISPUTE_ALREADY_RESOLVED",
                    "Giao dịch này đã được Kiểm duyệt viên khác quyết định. Vui lòng làm mới danh sách."
            );
        }
    }

    private void insertTimeline(
            UUID orderId,
            String action,
            String fromStatus,
            String toStatus,
            UUID actorId,
            String actorRole,
            String note,
            Timestamp tsNow
    ) {
        db.update(
                """
                INSERT INTO lich_su_trang_thai_giao_dich(
                    id, ma_giao_dich, hanh_dong, trang_thai_truoc, trang_thai_sau,
                    nguoi_thuc_hien_id, vai_tro_thuc_hien, ghi_chu, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                UUID.randomUUID(),
                orderId,
                action,
                fromStatus,
                toStatus,
                actorId,
                actorRole,
                note,
                tsNow
        );
    }

    private void insertModerationAudit(
            UUID targetUserId,
            UUID actorUserId,
            String actionType,
            String reason,
            String previousStatus,
            String newStatus,
            Map<String, Object> details,
            Timestamp tsNow
    ) {
        db.update(
                """
                INSERT INTO nhat_ky_kiem_duyet(
                    id, target_user_id, actor_user_id, action_type, reason,
                    previous_status, new_status, lock_type, locked_until, appealable, details, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, FALSE, CAST(? AS jsonb), ?)
                """,
                UUID.randomUUID(),
                targetUserId,
                actorUserId,
                actionType,
                reason,
                previousStatus,
                newStatus,
                toJson(details),
                tsNow
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
            throw new AuthFailure(404, "DISPUTE_NOT_FOUND", "Không tìm thấy hồ sơ giao dịch tranh chấp.");
        }
        return rows.getFirst();
    }

    private void lockMemberForKeyShare(UUID userId) {
        db.query("SELECT user_id FROM thanh_viens WHERE user_id = ? FOR KEY SHARE", rs -> {
        }, userId);
    }

    private LockedSeller lockSellerForReopenEvaluation(UUID sellerId) {
        reputationLedger.reconcileExpiredTemporaryLock(sellerId);
        List<LockedSeller> rows = db.query(
                """
                SELECT user_id, diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved
                FROM thanh_viens
                WHERE user_id = ?
                FOR NO KEY UPDATE
                """,
                (rs, rowNum) -> new LockedSeller(
                        rs.getObject("user_id", UUID.class),
                        rs.getInt("diem_uy_tin"),
                        rs.getString("trang_thai_tai_khoan"),
                        rs.getBoolean("email_verified"),
                        rs.getBoolean("profile_approved")
                ),
                sellerId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "DISPUTE_NOT_FOUND", "Không tìm thấy tài khoản người bán.");
        }
        return rows.getFirst();
    }

    private LockedListing lockListingForNoKeyUpdate(UUID listingId) {
        List<LockedListing> rows = db.query(
                """
                SELECT ma_tin, nguoi_dang_id, tieu_de, trang_thai, published_at, expires_at, ly_do_an, version
                FROM tin_dangs
                WHERE ma_tin = ?
                FOR NO KEY UPDATE
                """,
                (rs, rowNum) -> new LockedListing(
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_dang_id", UUID.class),
                        rs.getString("tieu_de"),
                        rs.getString("trang_thai"),
                        toInstant(rs.getTimestamp("published_at")),
                        toInstant(rs.getTimestamp("expires_at")),
                        rs.getString("ly_do_an"),
                        rs.getLong("version")
                ),
                listingId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "DISPUTE_NOT_FOUND", "Không tìm thấy tin đăng của giao dịch.");
        }
        return rows.getFirst();
    }

    private LockedOrder lockOrderForNoKeyUpdate(UUID orderId) {
        List<LockedOrder> rows = db.query(
                """
                SELECT ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, trang_thai, version
                FROM giao_dichs
                WHERE ma_giao_dich = ?
                FOR NO KEY UPDATE
                """,
                (rs, rowNum) -> new LockedOrder(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getObject("nguoi_mua_id", UUID.class),
                        rs.getString("trang_thai"),
                        rs.getLong("version")
                ),
                orderId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "DISPUTE_NOT_FOUND", "Không tìm thấy hồ sơ giao dịch tranh chấp.");
        }
        return rows.getFirst();
    }

    private LockedEvidenceRequest lockEvidenceRequestForNoKeyUpdate(UUID orderId, UUID requestId) {
        List<LockedEvidenceRequest> rows = db.query(
                """
                SELECT id, ma_giao_dich, nguoi_yeu_cau_id, ben_duoc_yeu_cau, han_bo_sung, trang_thai
                FROM yeu_cau_bo_sung_giao_dichs
                WHERE id = ? AND ma_giao_dich = ?
                FOR NO KEY UPDATE
                """,
                (rs, rowNum) -> new LockedEvidenceRequest(
                        rs.getObject("id", UUID.class),
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("nguoi_yeu_cau_id", UUID.class),
                        rs.getString("ben_duoc_yeu_cau"),
                        toInstant(rs.getTimestamp("han_bo_sung")),
                        rs.getString("trang_thai")
                ),
                requestId,
                orderId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "EVIDENCE_REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu bổ sung bằng chứng.");
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
        LinkedHashSet<UUID> ids = new LinkedHashSet<>(db.queryForList(
                "SELECT ma_vat FROM giao_dich_do_vat WHERE ma_giao_dich = ? AND ma_vat IS NOT NULL ORDER BY ma_vat ASC",
                UUID.class,
                orderId
        ));
        if (ids.isEmpty()) {
            ids.addAll(findListingItemIdsSorted(listingId));
        }
        return ids.stream().sorted(Comparator.comparing(UUID::toString)).toList();
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
                            SELECT ma_vat, trang_thai, version
                            FROM do_vats
                            WHERE ma_vat = ANY(?)
                            ORDER BY ma_vat ASC
                            FOR NO KEY UPDATE
                            """
                    );
                    ps.setArray(1, con.createArrayOf("uuid", sorted));
                    return ps;
                },
                rs -> {
                    result.add(new LockedItem(
                            rs.getObject("ma_vat", UUID.class),
                            rs.getString("trang_thai"),
                            rs.getLong("version")
                    ));
                }
        );
        return result;
    }

    private void verifyActiveMemberForWrite(UUID userId) {
        reputationLedger.reconcileExpiredTemporaryLock(userId);
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved,
                       khoa_den_ngay, loai_han_che, ly_do_han_che, cho_phep_khieu_nai
                FROM thanh_viens
                WHERE user_id = ?
                """,
                userId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }
        Map<String, Object> row = rows.getFirst();
        String status = String.valueOf(row.get("trang_thai_tai_khoan"));
        int score = ((Number) row.get("diem_uy_tin")).intValue();
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
        if (!"HOAT_DONG".equals(status)
                || !Boolean.TRUE.equals(row.get("email_verified"))
                || !Boolean.TRUE.equals(row.get("profile_approved"))) {
            throw new AuthFailure(403, "DISPUTE_FORBIDDEN", "Tài khoản không ở trạng thái hoạt động để gửi bổ sung bằng chứng.");
        }
    }

    private boolean isAccountActivelyAvailableReadOnly(UUID userId, Instant current) {
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT trang_thai_tai_khoan, email_verified, profile_approved, loai_han_che, khoa_den_ngay
                FROM thanh_viens
                WHERE user_id = ?
                """,
                userId
        );
        if (rows.isEmpty()) {
            return false;
        }
        Map<String, Object> row = rows.getFirst();
        if (!Boolean.TRUE.equals(row.get("email_verified")) || !Boolean.TRUE.equals(row.get("profile_approved"))) {
            return false;
        }
        String status = String.valueOf(row.get("trang_thai_tai_khoan"));
        if ("HOAT_DONG".equals(status)) {
            return true;
        }
        if ("BI_KHOA".equals(status)) {
            String lockType = (String) row.get("loai_han_che");
            Timestamp lockedUntil = (Timestamp) row.get("khoa_den_ngay");
            return "KHOA_TAM_THOI".equals(lockType)
                    && lockedUntil != null
                    && !lockedUntil.toInstant().isAfter(current);
        }
        return false;
    }

    private String loadListingTitle(UUID listingId) {
        List<String> rows = db.queryForList("SELECT tieu_de FROM tin_dangs WHERE ma_tin = ?", String.class, listingId);
        return rows.isEmpty() ? "Tin đăng" : rows.getFirst();
    }

    private static void enforceNotSelfDispute(UUID moderatorId, UUID buyerId, UUID sellerId) {
        if (moderatorId.equals(buyerId) || moderatorId.equals(sellerId)) {
            throw new AuthFailure(
                    403,
                    "SELF_DISPUTE_FORBIDDEN",
                    "Kiểm duyệt viên không được xem hoặc ra quyết định trên giao dịch mà chính mình là người mua hoặc người bán."
            );
        }
    }

    private static void validateModerationOrderState(LockedOrder order, Long expectedVersion) {
        if ("HOAN_TAT".equals(order.status()) || "HUY".equals(order.status())) {
            throw new AuthFailure(
                    409,
                    "DISPUTE_ALREADY_RESOLVED",
                    "Giao dịch đã kết thúc (" + order.status() + ") trước đó. Vui lòng làm mới danh sách."
            );
        }
        if (!"CHO_XU_LY".equals(order.status())) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Chỉ có thể xử lý giao dịch đang ở trạng thái Chờ xử lý (hiện tại: " + order.status() + ")."
            );
        }
        if (expectedVersion != null && expectedVersion.longValue() != order.version()) {
            throw new AuthFailure(
                    409,
                    "VERSION_CONFLICT",
                    "Hồ sơ giao dịch vừa được cập nhật. Vui lòng tải lại trước khi xác nhận quyết định."
            );
        }
    }

    private static String validateBasis(String raw) {
        return validateLengthText(
                raw,
                MIN_BASIS_LENGTH,
                MAX_BASIS_LENGTH,
                "INVALID_BASIS",
                "Vui lòng nhập căn cứ quyết định rõ ràng (từ " + MIN_BASIS_LENGTH + " đến " + MAX_BASIS_LENGTH + " ký tự)."
        );
    }

    private static String validateLengthText(String raw, int minLen, int maxLen, String code, String message) {
        if (raw == null || raw.isBlank()) {
            throw new AuthFailure(400, code, message);
        }
        String trimmed = raw.strip();
        if (trimmed.length() < minLen || trimmed.length() > maxLen) {
            throw new AuthFailure(400, code, message);
        }
        return trimmed;
    }

    private static Long validateExpectedVersion(Long expectedVersion) {
        if (expectedVersion != null && expectedVersion < 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Phiên bản đối chiếu (expectedVersion) không hợp lệ.");
        }
        return expectedVersion;
    }

    private static String normalizeFilter(String raw, Set<String> allowed, String defaultVal, String errorMsg) {
        if (raw == null || raw.isBlank()) {
            return defaultVal;
        }
        String normalized = raw.strip().toUpperCase(Locale.ROOT);
        if (!allowed.contains(normalized)) {
            throw new AuthFailure(400, "INVALID_INPUT", errorMsg);
        }
        return normalized;
    }

    private static String computeQueueState(String status, boolean hasActiveEvidence) {
        if ("HOAN_TAT".equals(status) || "HUY".equals(status)) {
            return "RESOLVED";
        }
        return hasActiveEvidence ? "WAITING_EVIDENCE" : "READY";
    }

    private static boolean computeOverdueSla(String status, Instant responseDeadlineAt, Instant current) {
        return "CHO_XU_LY".equals(status)
                && responseDeadlineAt != null
                && !responseDeadlineAt.isAfter(current);
    }

    private static String escapeLike(String raw) {
        return raw.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }

    private static long resolveSize(Resource resource, long fallback) {
        try {
            return resource.contentLength();
        } catch (IOException e) {
            return fallback;
        }
    }

    private static String guessImageContentType(String keyOrUrl) {
        String lower = keyOrUrl.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".webp")) {
            return "image/webp";
        }
        return "image/jpeg";
    }

    private String toJson(Map<String, Object> details) {
        try {
            return objectMapper.writeValueAsString(details);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize moderation audit details", e);
        }
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

    // Internal row records
    private record OrderLookup(UUID orderId, UUID listingId, UUID sellerId, UUID buyerId) {
    }

    private record LockedSeller(
            UUID userId,
            int reputationScore,
            String accountStatus,
            boolean emailVerified,
            boolean profileApproved
    ) {
        boolean isActive() {
            return "HOAT_DONG".equals(accountStatus) && emailVerified && profileApproved;
        }
    }

    private record LockedListing(
            UUID id,
            UUID sellerId,
            String title,
            String status,
            Instant publishedAt,
            Instant expiresAt,
            String hiddenReason,
            long version
    ) {
    }

    private record LockedOrder(
            UUID id,
            UUID listingId,
            UUID sellerId,
            UUID buyerId,
            String status,
            long version
    ) {
    }

    private record LockedItem(UUID id, String status, long version) {
    }

    private record LockedEvidenceRequest(
            UUID id,
            UUID orderId,
            UUID requestedById,
            String targetParty,
            Instant dueAt,
            String status
    ) {
    }

    private record SanitizedEvidenceFile(
            UUID id,
            String storageKey,
            String originalFilename,
            String contentType,
            long sizeBytes,
            String sha256,
            byte[] bytes
    ) {
    }

    private record OverdueOrderRow(UUID orderId, UUID listingId, UUID buyerId, UUID sellerId, String listingTitle) {
    }

    private record ExpiredEvidenceRow(UUID requestId, UUID orderId) {
    }

    private record RawEvidenceRequest(
            UUID id,
            String targetParty,
            String instruction,
            Instant dueAt,
            String status,
            String requestedByName,
            Instant createdAt,
            Instant respondedAt
    ) {
    }

    private record RawEvidenceResponse(
            UUID id,
            UUID requestId,
            UUID senderId,
            String senderRole,
            String senderName,
            String note,
            Instant createdAt
    ) {
    }

    private record AdminDetailRow(
            UUID orderId,
            long version,
            String status,
            String escalationReason,
            Instant escalatedAt,
            Instant responseDeadlineAt,
            int agreedPriceVnd,
            Instant meetingTime,
            String meetingLocation,
            Instant deliveryStartedAt,
            Instant reportedDeliveredAt,
            String deliveryNote,
            String legacyHandoverPhoto,
            Instant completedAt,
            Instant cancelledAt,
            Instant reviewDeadlineAt,
            UUID listingId,
            String listingTitle,
            int listedPriceVnd,
            String listingType,
            String listingStatus,
            List<String> listingImages,
            UUID buyerId,
            String buyerName,
            int buyerScore,
            UUID sellerId,
            String sellerName,
            int sellerScore,
            boolean hasActiveEvidenceRequest,
            UUID decisionId,
            String decisionConclusion,
            String decisionBasis,
            UUID decidedById,
            String decidedByName,
            Instant decidedAt,
            String listingStatusAfter,
            String listingHiddenReason
    ) {
    }

    private record MemberOrderRow(
            UUID orderId,
            String status,
            long version,
            UUID buyerId,
            UUID sellerId,
            String escalationReason,
            Instant escalatedAt,
            Instant responseDeadlineAt,
            Instant reviewDeadlineAt,
            UUID decisionId,
            String decisionConclusion,
            String decisionBasis,
            Instant decidedAt,
            String listingStatusAfter,
            String listingHiddenReason
    ) {
    }
}
