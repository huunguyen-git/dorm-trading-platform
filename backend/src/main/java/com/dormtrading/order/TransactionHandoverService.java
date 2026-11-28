package com.dormtrading.order;

import com.dormtrading.catalog.ListingDtos;
import com.dormtrading.catalog.ListingLifecycleHelper;
import com.dormtrading.catalog.ListingValidation;
import com.dormtrading.catalog.media.MediaImageSanitizer;
import com.dormtrading.catalog.media.MediaMagicBytes;
import com.dormtrading.iam.auth.AccountRestrictedFailure;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.review.reputation.ReputationLedgerService;
import java.io.IOException;
import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
 * P3-02 Transaction Handover, 6-Digit OTP Completion & Post-Delivery Mutual Cancellation Service
 * (UC-27, UC-28; FR-04, FR-08, FR-09, FR-13, NFR-01, NFR-03).
 *
 * <p>Enforces strict global lock ordering (deadlock-free with {@code ListingService},
 * {@code InventoryService}, {@code ReputationLedgerService}, and PostgreSQL 16 FK locks):
 * <ol>
 *   <li>{@code thanh_viens} (canonical UUID ASC, {@code FOR NO KEY UPDATE})</li>
 *   <li>{@code tin_dangs} ({@code ma_tin}, {@code FOR NO KEY UPDATE})</li>
 *   <li>{@code giao_dichs} ({@code ma_giao_dich}, {@code FOR NO KEY UPDATE})</li>
 *   <li>Child row ({@code ma_xac_nhan_otp} or {@code yeu_cau_huy_giao_dichs}, {@code FOR NO KEY UPDATE})</li>
 *   <li>{@code do_vats} ({@code ORDER BY ma_vat ASC}, {@code FOR NO KEY UPDATE})</li>
 * </ol>
 */
@Service
public class TransactionHandoverService {

    public static final int MAX_PROOF_PHOTOS = 5;
    public static final long DEFAULT_MAX_PROOF_SIZE_BYTES = 5L * 1024 * 1024;
    public static final int MAX_NOTE_LENGTH = 500;
    public static final int DEFAULT_OTP_TTL_SECONDS = 600;
    public static final int DEFAULT_OTP_MAX_ATTEMPTS = 5;
    public static final int DEFAULT_CONFIRM_ESCALATION_HOURS = 24;

    private static final Set<String> POST_DELIVERY_PENDING_STATUSES = Set.of(
            TransactionDtos.TransactionStatus.CHO_XAC_NHAN.name(),
            TransactionDtos.TransactionStatus.CHO_XU_LY.name()
    );

    private static final Set<String> ACTIVE_HOLD_STATUSES = Set.of(
            TransactionDtos.TransactionStatus.GIU_CHO.name(),
            TransactionDtos.TransactionStatus.DANG_GIAO.name(),
            TransactionDtos.TransactionStatus.CHO_XAC_NHAN.name(),
            TransactionDtos.TransactionStatus.CHO_XU_LY.name()
    );

    private final JdbcTemplate db;
    private final HandoverProofStorage proofStorage;
    private final HandoverOtpCrypto otpCrypto;
    private final ReputationLedgerService reputationLedger;
    private final TransactionTemplate txTemplate;
    private final Clock clock;
    private final long maxProofSizeBytes;
    private final int otpTtlSeconds;
    private final int otpMaxAttempts;
    private final int confirmEscalationHours;

    @Autowired
    public TransactionHandoverService(
            JdbcTemplate db,
            HandoverProofStorage proofStorage,
            HandoverOtpCrypto otpCrypto,
            ReputationLedgerService reputationLedger,
            TransactionTemplate txTemplate,
            Clock clock,
            @Value("${app.media.max-file-size-bytes:5242880}") long maxProofSizeBytes,
            @Value("${app.order.otp-ttl-seconds:600}") int otpTtlSeconds,
            @Value("${app.order.otp-max-attempts:5}") int otpMaxAttempts,
            @Value("${app.order.confirm-escalation-hours:24}") int confirmEscalationHours
    ) {
        this.db = db;
        this.proofStorage = proofStorage;
        this.otpCrypto = otpCrypto;
        this.reputationLedger = reputationLedger;
        this.txTemplate = txTemplate;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.maxProofSizeBytes = maxProofSizeBytes > 0 ? maxProofSizeBytes : DEFAULT_MAX_PROOF_SIZE_BYTES;
        this.otpTtlSeconds = otpTtlSeconds > 0 ? otpTtlSeconds : DEFAULT_OTP_TTL_SECONDS;
        this.otpMaxAttempts = otpMaxAttempts > 0 ? otpMaxAttempts : DEFAULT_OTP_MAX_ATTEMPTS;
        this.confirmEscalationHours = confirmEscalationHours > 0
                ? confirmEscalationHours
                : DEFAULT_CONFIRM_ESCALATION_HOURS;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    // =========================================================================
    // Read APIs (Zero-PII, strict NFR-01 authorization, readOnly transactions)
    // =========================================================================

    @Transactional(readOnly = true)
    public TransactionDtos.TransactionPageDto listTransactions(
            UUID viewerId,
            String roleParam,
            String statusParam,
            int page,
            int size
    ) {
        return listTransactions(viewerId, roleParam, statusParam, null, page, size);
    }

    @Transactional(readOnly = true)
    public TransactionDtos.TransactionPageDto listTransactions(
            UUID viewerId,
            String roleParam,
            String statusParam,
            String qParam,
            int page,
            int size
    ) {
        if (viewerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        int validPage = ListingValidation.validatePage(page);
        int validSize = ListingValidation.validateSize(size);
        String role = normalizeRoleFilter(roleParam);
        String statusFilter = normalizeStatusFilter(statusParam);
        String searchQuery = ListingValidation.optionalText(
                qParam,
                ListingValidation.MAX_SEARCH_QUERY_LENGTH,
                "Từ khóa tìm kiếm không được vượt quá " + ListingValidation.MAX_SEARCH_QUERY_LENGTH + " ký tự."
        );
        boolean viewerActive = requireReadableMemberAccount(viewerId);

        Instant current = now();
        Timestamp overdueCutoff = Timestamp.from(current.minus(confirmEscalationHours, ChronoUnit.HOURS));

        String effectiveStatusExpr = """
                CASE
                    WHEN g.trang_thai = 'CHO_XAC_NHAN'
                     AND g.thoi_diem_bao_giao IS NOT NULL
                     AND g.thoi_diem_bao_giao <= ?
                    THEN 'CHO_XU_LY'
                    ELSE g.trang_thai
                END
                """;

        String pendingActionExpr = """
                (
                    ? = TRUE AND (
                        (g.nguoi_ban_id = ? AND g.trang_thai = 'DANG_GIAO')
                        OR (g.nguoi_mua_id = ? AND g.trang_thai = 'CHO_XAC_NHAN'
                            AND (g.thoi_diem_bao_giao IS NULL OR g.thoi_diem_bao_giao > ?))
                        OR (
                            g.trang_thai IN ('CHO_XAC_NHAN', 'CHO_XU_LY')
                            AND EXISTS (
                                SELECT 1 FROM yeu_cau_huy_giao_dichs yc
                                WHERE yc.ma_giao_dich = g.ma_giao_dich
                                  AND yc.trang_thai = 'CHO_XAC_NHAN'
                                  AND yc.nguoi_yeu_cau_id <> ?
                            )
                        )
                    )
                )
                """;

        StringBuilder roleAndSearchWhere = new StringBuilder(" WHERE ");
        List<Object> roleAndSearchParams = new ArrayList<>();
        switch (role) {
            case "BUYER" -> {
                roleAndSearchWhere.append("g.nguoi_mua_id = ?");
                roleAndSearchParams.add(viewerId);
            }
            case "SELLER" -> {
                roleAndSearchWhere.append("g.nguoi_ban_id = ?");
                roleAndSearchParams.add(viewerId);
            }
            default -> {
                roleAndSearchWhere.append("(g.nguoi_ban_id = ? OR g.nguoi_mua_id = ?)");
                roleAndSearchParams.add(viewerId);
                roleAndSearchParams.add(viewerId);
            }
        }

        if (searchQuery != null) {
            String pattern = toContainsPattern(searchQuery);
            roleAndSearchWhere.append("""
                     AND (
                        t.tieu_de ILIKE ? ESCAPE '\\'
                        OR COALESCE(g.dia_diem_hen, '') ILIKE ? ESCAPE '\\'
                        OR (g.nguoi_ban_id = ? AND b.ho_ten ILIKE ? ESCAPE '\\')
                        OR (g.nguoi_mua_id = ? AND s.ho_ten ILIKE ? ESCAPE '\\')
                    )
                    """);
            roleAndSearchParams.add(pattern);
            roleAndSearchParams.add(pattern);
            roleAndSearchParams.add(viewerId);
            roleAndSearchParams.add(pattern);
            roleAndSearchParams.add(viewerId);
            roleAndSearchParams.add(pattern);
        }

        // Single-SQL status counts scoped to viewer's role (and optional search q), always populated even on empty pages
        List<Object> countsParams = new ArrayList<>();
        countsParams.add(overdueCutoff);
        countsParams.add(viewerActive);
        countsParams.add(viewerId);
        countsParams.add(viewerId);
        countsParams.add(overdueCutoff);
        countsParams.add(viewerId);
        countsParams.addAll(roleAndSearchParams);

        String countsSql = """
                SELECT
                    COUNT(*) AS cnt_all,
                    COUNT(*) FILTER (WHERE scoped.needs_action) AS cnt_action_required,
                    COUNT(*) FILTER (WHERE scoped.eff_status = 'YEU_CAU') AS cnt_yeu_cau,
                    COUNT(*) FILTER (WHERE scoped.eff_status = 'GIU_CHO') AS cnt_giu_cho,
                    COUNT(*) FILTER (WHERE scoped.eff_status = 'DANG_GIAO') AS cnt_dang_giao,
                    COUNT(*) FILTER (WHERE scoped.eff_status = 'CHO_XAC_NHAN') AS cnt_cho_xac_nhan,
                    COUNT(*) FILTER (WHERE scoped.eff_status = 'CHO_XU_LY') AS cnt_cho_xu_ly,
                    COUNT(*) FILTER (WHERE scoped.eff_status = 'HOAN_TAT') AS cnt_hoan_tat,
                    COUNT(*) FILTER (WHERE scoped.eff_status = 'HUY') AS cnt_huy
                FROM (
                    SELECT
                """
                + "(" + effectiveStatusExpr + ") AS eff_status,\n"
                + pendingActionExpr + " AS needs_action\n"
                + """
                    FROM giao_dichs g
                    JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                    JOIN thanh_viens s ON s.user_id = g.nguoi_ban_id
                    JOIN thanh_viens b ON b.user_id = g.nguoi_mua_id
                """
                + roleAndSearchWhere
                + ") scoped";

        TransactionDtos.TransactionStatusCountsDto counts = db.queryForObject(
                countsSql,
                (rs, rowNum) -> new TransactionDtos.TransactionStatusCountsDto(
                        rs.getLong("cnt_all"),
                        rs.getLong("cnt_action_required"),
                        rs.getLong("cnt_yeu_cau"),
                        rs.getLong("cnt_giu_cho"),
                        rs.getLong("cnt_dang_giao"),
                        rs.getLong("cnt_cho_xac_nhan"),
                        rs.getLong("cnt_cho_xu_ly"),
                        rs.getLong("cnt_hoan_tat"),
                        rs.getLong("cnt_huy")
                ),
                countsParams.toArray()
        );
        if (counts == null) {
            counts = TransactionDtos.TransactionStatusCountsDto.zero();
        }

        // Global pendingActionCount for the viewer across ALL roles (drives ProfileScreen badge)
        long pendingActionCount;
        if ("ALL".equals(role) && searchQuery == null) {
            pendingActionCount = counts.actionRequired();
        } else {
            Long pendingObj = db.queryForObject(
                    "SELECT COUNT(*) FROM giao_dichs g WHERE (g.nguoi_ban_id = ? OR g.nguoi_mua_id = ?) AND " + pendingActionExpr,
                    Long.class,
                    viewerId,
                    viewerId,
                    viewerActive,
                    viewerId,
                    viewerId,
                    overdueCutoff,
                    viewerId
            );
            pendingActionCount = pendingObj != null ? pendingObj : 0L;
        }

        long totalElements = resolveTotalElementsFromCounts(counts, statusFilter);
        if (totalElements == 0L) {
            return new TransactionDtos.TransactionPageDto(
                    List.of(),
                    pendingActionCount,
                    counts,
                    validPage,
                    validSize,
                    0L,
                    0
            );
        }

        StringBuilder where = new StringBuilder(roleAndSearchWhere);
        List<Object> whereParams = new ArrayList<>(roleAndSearchParams);
        if ("ACTION_REQUIRED".equals(statusFilter)) {
            where.append(" AND ").append(pendingActionExpr);
            whereParams.add(viewerActive);
            whereParams.add(viewerId);
            whereParams.add(viewerId);
            whereParams.add(overdueCutoff);
            whereParams.add(viewerId);
        } else if (statusFilter != null) {
            where.append(" AND (").append(effectiveStatusExpr).append(") = ?");
            whereParams.add(overdueCutoff);
            whereParams.add(statusFilter);
        }

        List<Object> dataParams = new ArrayList<>();
        dataParams.add(overdueCutoff); // effective_status
        dataParams.add(overdueCutoff); // effective_escalation_reason
        dataParams.add(viewerActive);  // needs_viewer_action
        dataParams.add(viewerId);
        dataParams.add(viewerId);
        dataParams.add(overdueCutoff);
        dataParams.add(viewerId);
        dataParams.addAll(whereParams);
        dataParams.add(validSize);
        dataParams.add((long) validPage * validSize);

        String selectSql = """
                SELECT g.ma_giao_dich, g.ma_tin, g.nguoi_ban_id, g.nguoi_mua_id, g.gia_thoa_thuan,
                       g.thoi_gian_hen, g.dia_diem_hen, g.thoi_diem_bao_giao, g.thoi_diem_hoan_tat,
                       g.thoi_diem_huy, g.updated_at, g.version,
                """
                + "(" + effectiveStatusExpr + ") AS effective_status,\n"
                + """
                       CASE
                           WHEN g.ly_do_cho_xu_ly IS NOT NULL THEN g.ly_do_cho_xu_ly
                           WHEN g.trang_thai = 'CHO_XAC_NHAN'
                            AND g.thoi_diem_bao_giao IS NOT NULL
                            AND g.thoi_diem_bao_giao <= ?
                           THEN 'OVERDUE_24H'
                           ELSE NULL
                       END AS effective_escalation_reason,
                """
                + pendingActionExpr + " AS needs_viewer_action,\n"
                + """
                       EXISTS (
                           SELECT 1 FROM yeu_cau_huy_giao_dichs yc
                           WHERE yc.ma_giao_dich = g.ma_giao_dich AND yc.trang_thai = 'CHO_XAC_NHAN'
                       ) AS has_pending_cancel,
                       t.tieu_de, t.gia_vnd, t.hinh_thuc, t.hinh_anh,
                       (SELECT COUNT(*)::int FROM tin_dang_do_vat tdv WHERE tdv.ma_tin = g.ma_tin) AS item_count,
                       s.ho_ten AS seller_name, s.diem_uy_tin AS seller_score,
                       b.ho_ten AS buyer_name, b.diem_uy_tin AS buyer_score
                FROM giao_dichs g
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                JOIN thanh_viens s ON s.user_id = g.nguoi_ban_id
                JOIN thanh_viens b ON b.user_id = g.nguoi_mua_id
                """
                + where
                + " ORDER BY needs_viewer_action DESC, g.updated_at DESC, g.thoi_diem_tao DESC, g.ma_giao_dich DESC LIMIT ? OFFSET ?";

        List<TransactionDtos.TransactionSummaryDto> items = db.query(
                selectSql,
                (rs, rowNum) -> {
                    UUID sellerId = rs.getObject("nguoi_ban_id", UUID.class);
                    UUID buyerId = rs.getObject("nguoi_mua_id", UUID.class);
                    boolean isSeller = sellerId.equals(viewerId);
                    String viewerRole = isSeller ? "SELLER" : "BUYER";

                    TransactionDtos.CounterpartySummaryDto counterparty = isSeller
                            ? new TransactionDtos.CounterpartySummaryDto(
                                    buyerId,
                                    rs.getString("buyer_name"),
                                    rs.getInt("buyer_score"))
                            : new TransactionDtos.CounterpartySummaryDto(
                                    sellerId,
                                    rs.getString("seller_name"),
                                    rs.getInt("seller_score"));

                    List<String> images = extractTextArray(rs, "hinh_anh");
                    int listedPrice = rs.getInt("gia_vnd");
                    String listingType = rs.getString("hinh_thuc");
                    int itemCount = Math.max(1, rs.getInt("item_count"));
                    boolean isCombo = ListingDtos.ListingType.BAN_COMBO.name().equals(listingType) || itemCount >= 2;
                    boolean isFree = listedPrice == 0;
                    Instant deliveredAt = toInstant(rs.getTimestamp("thoi_diem_bao_giao"));
                    Instant autoEscalateAt = deliveredAt != null
                            ? deliveredAt.plus(confirmEscalationHours, ChronoUnit.HOURS)
                            : null;

                    return new TransactionDtos.TransactionSummaryDto(
                            rs.getObject("ma_giao_dich", UUID.class),
                            rs.getObject("ma_tin", UUID.class),
                            rs.getString("tieu_de"),
                            images.isEmpty() ? null : images.getFirst(),
                            isCombo,
                            isFree,
                            itemCount,
                            rs.getInt("gia_thoa_thuan"),
                            rs.getString("effective_status"),
                            viewerRole,
                            counterparty,
                            toInstant(rs.getTimestamp("thoi_gian_hen")),
                            rs.getString("dia_diem_hen"),
                            deliveredAt,
                            autoEscalateAt,
                            toInstant(rs.getTimestamp("thoi_diem_hoan_tat")),
                            toInstant(rs.getTimestamp("thoi_diem_huy")),
                            rs.getBoolean("has_pending_cancel"),
                            rs.getBoolean("needs_viewer_action"),
                            rs.getString("effective_escalation_reason"),
                            toInstant(rs.getTimestamp("updated_at")),
                            rs.getLong("version")
                    );
                },
                dataParams.toArray()
        );

        int totalPages = ListingValidation.calculateTotalPages(totalElements, validSize);
        return new TransactionDtos.TransactionPageDto(
                List.copyOf(items),
                pendingActionCount,
                counts,
                validPage,
                validSize,
                totalElements,
                totalPages
        );
    }

    @Transactional(readOnly = true)
    public TransactionDtos.TransactionDetailDto getTransactionDetail(
            UUID viewerId,
            boolean isModeratorOrAdmin,
            UUID transactionId
    ) {
        return getTransactionDetail(
                viewerId,
                isModeratorOrAdmin ? TransactionDtos.AdminViewerRole.MODERATOR : TransactionDtos.AdminViewerRole.NONE,
                transactionId
        );
    }

    @Transactional(readOnly = true)
    public TransactionDtos.TransactionDetailDto getTransactionDetail(
            UUID viewerId,
            TransactionDtos.AdminViewerRole adminRole,
            UUID transactionId
    ) {
        if (viewerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (transactionId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã giao dịch không hợp lệ.");
        }
        return loadTransactionDetail(
                viewerId,
                adminRole != null ? adminRole : TransactionDtos.AdminViewerRole.NONE,
                transactionId
        );
    }

    @Transactional(readOnly = true)
    public TransactionDtos.HandoverPhotoContent loadHandoverPhoto(
            UUID viewerId,
            boolean isModeratorOrAdmin,
            UUID transactionId,
            UUID specificPhotoId
    ) {
        return loadHandoverPhoto(
                viewerId,
                isModeratorOrAdmin ? TransactionDtos.AdminViewerRole.MODERATOR : TransactionDtos.AdminViewerRole.NONE,
                transactionId,
                specificPhotoId
        );
    }

    @Transactional(readOnly = true)
    public TransactionDtos.HandoverPhotoContent loadHandoverPhoto(
            UUID viewerId,
            TransactionDtos.AdminViewerRole adminRole,
            UUID transactionId,
            UUID specificPhotoId
    ) {
        if (viewerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (transactionId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã giao dịch không hợp lệ.");
        }

        boolean isPrivilegedAdmin = adminRole != null && adminRole.isPrivileged();
        TransactionLookup lookup = lookupTransactionOrThrow(transactionId);
        boolean isParticipant = lookup.sellerId().equals(viewerId) || lookup.buyerId().equals(viewerId);
        if (!isParticipant && !isPrivilegedAdmin) {
            throw new AuthFailure(403, "TRANSACTION_FORBIDDEN", "Bạn không có quyền xem ảnh bàn giao của giao dịch này.");
        }
        if (!isPrivilegedAdmin) {
            requireReadableMemberAccount(viewerId);
        }

        List<ProofRow> rows;
        if (specificPhotoId != null) {
            rows = db.query(
                    """
                    SELECT id, storage_key, content_type, size_bytes, uploaded_at
                    FROM anh_ban_giao_giao_dichs
                    WHERE id = ? AND ma_giao_dich = ?
                    """,
                    this::mapProofRow,
                    specificPhotoId,
                    transactionId
            );
        } else {
            rows = db.query(
                    """
                    SELECT id, storage_key, content_type, size_bytes, uploaded_at
                    FROM anh_ban_giao_giao_dichs
                    WHERE ma_giao_dich = ?
                    ORDER BY thu_tu ASC, uploaded_at ASC, id ASC
                    LIMIT 1
                    """,
                    this::mapProofRow,
                    transactionId
            );
        }

        if (rows.isEmpty()) {
            throw new AuthFailure(404, "PROOF_NOT_FOUND", "Giao dịch chưa có ảnh bàn giao.");
        }

        ProofRow proof = rows.getFirst();
        Resource resource = proofStorage.loadAsResource(proof.storageKey());
        long resolvedSize;
        try {
            resolvedSize = resource.contentLength();
        } catch (IOException e) {
            resolvedSize = proof.sizeBytes();
        }

        return new TransactionDtos.HandoverPhotoContent(
                proof.id(),
                proof.contentType(),
                resolvedSize,
                resource
        );
    }

    // =========================================================================
    // UC-27 Steps 1-5: Seller uploads handover proof photo(s) & reports delivered
    // =========================================================================

    public TransactionDtos.TransactionDetailDto reportDelivered(
            UUID sellerId,
            UUID transactionId,
            List<MultipartFile> rawFiles,
            String rawNote,
            Long expectedVersion
    ) {
        if (sellerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (transactionId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã giao dịch không hợp lệ.");
        }

        String note = ListingValidation.optionalText(
                rawNote,
                MAX_NOTE_LENGTH,
                "Ghi chú bàn giao không được vượt quá " + MAX_NOTE_LENGTH + " ký tự."
        );

        // Phase 1 (No DB transaction or row locks): preflight transaction/seller check & in-memory image sanitization
        List<Map<String, Object>> preflightRows = db.queryForList(
                """
                SELECT g.ma_tin, g.nguoi_ban_id, g.trang_thai, g.thoi_diem_bao_giao, g.version,
                       tv.diem_uy_tin, tv.trang_thai_tai_khoan, tv.email_verified, tv.profile_approved,
                       tv.khoa_den_ngay, tv.loai_han_che, tv.ly_do_han_che, tv.cho_phep_khieu_nai
                FROM giao_dichs g
                JOIN thanh_viens tv ON tv.user_id = g.nguoi_ban_id
                WHERE g.ma_giao_dich = ?
                """,
                transactionId
        );
        if (preflightRows.isEmpty()) {
            throw new AuthFailure(404, "TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch.");
        }
        Map<String, Object> preflight = preflightRows.getFirst();
        UUID preflightSellerId = (UUID) preflight.get("nguoi_ban_id");
        if (!sellerId.equals(preflightSellerId)) {
            throw new AuthFailure(403, "TRANSACTION_FORBIDDEN", "Chỉ người bán mới có thể gửi ảnh và báo đã giao.");
        }
        UUID listingId = (UUID) preflight.get("ma_tin");

        preflightSellerMember(preflight);

        List<ValidatedProofPhoto> validatedPhotos = validateAndSanitizeProofs(transactionId, rawFiles);

        String preflightStatus = String.valueOf(preflight.get("trang_thai"));
        Timestamp preflightDeliveredAt = (Timestamp) preflight.get("thoi_diem_bao_giao");
        long preflightVersion = ((Number) preflight.get("version")).longValue();
        if (!TransactionDtos.TransactionStatus.DANG_GIAO.name().equals(preflightStatus)
                || preflightDeliveredAt != null) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Chỉ có thể báo đã giao khi giao dịch đang ở trạng thái đang giao."
            );
        }
        if (expectedVersion != null && expectedVersion != preflightVersion) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Giao dịch vừa được cập nhật. Vui lòng tải lại trước khi thao tác.");
        }

        // Phase 2 (No DB transaction or row locks): upload sanitized objects to storage before acquiring DB locks
        List<String> storedKeys = new ArrayList<>(validatedPhotos.size());
        try {
            for (ValidatedProofPhoto photo : validatedPhotos) {
                proofStorage.store(photo.storageKey(), photo.bytes(), photo.contentType());
                storedKeys.add(photo.storageKey());
            }
        } catch (RuntimeException e) {
            List<String> keysToClean = new ArrayList<>(storedKeys);
            storedKeys.clear();
            for (String key : keysToClean) {
                proofStorage.deleteQuietly(key);
            }
            throw e;
        }

        // Phase 3 (Short atomic transaction): lock rows, re-verify invariants, insert metadata/OTP, and commit
        AtomicBoolean rollbackCleanupRegistered = new AtomicBoolean(false);
        try {
            return txTemplate.execute(txStatus -> {
                if (TransactionSynchronizationManager.isActualTransactionActive()) {
                    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                        @Override
                        public void afterCompletion(int status) {
                            if (status != STATUS_COMMITTED) {
                                for (String key : storedKeys) {
                                    proofStorage.deleteQuietly(key);
                                }
                            }
                        }
                    });
                    rollbackCleanupRegistered.set(true);
                }

                // Strict lock order: (1) thanh_viens(seller) -> (2) tin_dangs -> (3) giao_dichs
                lockAndVerifyActiveMember(sellerId);
                lockListingForNoKeyUpdate(listingId);
                LockedTransaction tx = lockTransactionForNoKeyUpdate(transactionId);

                if (!TransactionDtos.TransactionStatus.DANG_GIAO.name().equals(tx.status())
                        || tx.reportedDeliveredAt() != null) {
                    throw new AuthFailure(
                            409,
                            "INVALID_STATE_TRANSITION",
                            "Chỉ có thể báo đã giao khi giao dịch đang ở trạng thái đang giao."
                    );
                }
                if (expectedVersion != null && expectedVersion != tx.version()) {
                    throw new AuthFailure(409, "VERSION_CONFLICT", "Giao dịch vừa được cập nhật. Vui lòng tải lại trước khi thao tác.");
                }

                Instant current = now();
                Timestamp tsNow = Timestamp.from(current);
                Timestamp otpExpiresAt = Timestamp.from(current.plusSeconds(otpTtlSeconds));

                for (int i = 0; i < validatedPhotos.size(); i++) {
                    ValidatedProofPhoto photo = validatedPhotos.get(i);
                    db.update(
                            """
                            INSERT INTO anh_ban_giao_giao_dichs(
                                id, ma_giao_dich, nguoi_tai_len_id, storage_key, original_filename,
                                content_type, size_bytes, sha256, thu_tu, uploaded_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            photo.id(),
                            transactionId,
                            sellerId,
                            photo.storageKey(),
                            photo.originalFilename(),
                            photo.contentType(),
                            photo.sizeBytes(),
                            photo.sha256(),
                            i,
                            tsNow
                    );
                }

                String primaryPhotoUrl = "/api/v1/transactions/" + transactionId + "/handover-photo";
                db.update(
                        """
                        UPDATE giao_dichs
                        SET trang_thai = 'CHO_XAC_NHAN',
                            anh_ban_giao = ?,
                            ghi_chu_ban_giao = ?,
                            thoi_diem_bao_giao = ?,
                            updated_at = ?,
                            version = version + 1
                        WHERE ma_giao_dich = ?
                        """,
                        primaryPhotoUrl,
                        note,
                        tsNow,
                        tsNow,
                        transactionId
                );

                // Invalidate any stale un-used OTP rows defensively before issuing the fresh 6-digit OTP
                db.update(
                        """
                        UPDATE ma_xac_nhan_otp
                        SET bi_vo_hieu = TRUE,
                            ly_do_vo_hieu = COALESCE(
                                ly_do_vo_hieu,
                                CASE WHEN thoi_diem_het_han <= ? THEN 'HET_HAN' ELSE 'CAP_LAI' END
                            ),
                            otp_ciphertext = NULL
                        WHERE ma_giao_dich = ? AND da_dung = FALSE AND bi_vo_hieu = FALSE
                        """,
                        tsNow,
                        transactionId
                );

                issueFreshOtpRow(transactionId, sellerId, tsNow, otpExpiresAt);

                recordTimelineEvent(
                        transactionId,
                        "REPORT_DELIVERED",
                        TransactionDtos.TransactionStatus.DANG_GIAO.name(),
                        TransactionDtos.TransactionStatus.CHO_XAC_NHAN.name(),
                        sellerId,
                        "SELLER",
                        note != null ? note : "Người bán đã gửi ảnh bàn giao và báo đã giao.",
                        tsNow
                );

                return loadTransactionDetail(sellerId, TransactionDtos.AdminViewerRole.NONE, transactionId);
            });
        } catch (RuntimeException e) {
            if (!rollbackCleanupRegistered.get()) {
                for (String key : storedKeys) {
                    proofStorage.deleteQuietly(key);
                }
            }
            throw e;
        }
    }

    private void preflightSellerMember(Map<String, Object> row) {
        String status = String.valueOf(row.get("trang_thai_tai_khoan"));
        if ("VO_HIEU_HOA".equals(status)) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Tài khoản đã bị vô hiệu hóa.");
        }
        if ("BI_KHOA".equals(status)) {
            Timestamp lockedUntilTs = (Timestamp) row.get("khoa_den_ngay");
            boolean expiredTempLock = "KHOA_TAM_THOI".equals(row.get("loai_han_che"))
                    && lockedUntilTs != null
                    && !lockedUntilTs.toInstant().isAfter(now());
            if (expiredTempLock) {
                // Allow expired temporary lock to reach Phase 3 where reconcileExpiredTemporaryLock unlocks it under lock
                return;
            }
            int score = ((Number) row.get("diem_uy_tin")).intValue();
            throw new AccountRestrictedFailure(new AccountRestrictedFailure.RestrictionPayload(
                    status,
                    (String) row.get("loai_han_che"),
                    (String) row.get("ly_do_han_che"),
                    lockedUntilTs != null ? lockedUntilTs.toInstant() : null,
                    Boolean.TRUE.equals(row.get("cho_phep_khieu_nai")),
                    score
            ));
        }
        boolean emailVerified = Boolean.TRUE.equals(row.get("email_verified"));
        boolean profileApproved = Boolean.TRUE.equals(row.get("profile_approved"));
        if (!"HOAT_DONG".equals(status) || !emailVerified || !profileApproved) {
            throw new AuthFailure(
                    403,
                    "FORBIDDEN",
                    "Tài khoản cần được xác minh email và phê duyệt hồ sơ trước khi thực hiện giao dịch."
            );
        }
    }

    // =========================================================================
    // UC-27 Steps 6-10: Buyer enters 6-digit OTP to complete transaction
    // =========================================================================

    @Transactional(noRollbackFor = HandoverOtpFailure.class)
    public TransactionDtos.TransactionDetailDto completeTransaction(
            UUID buyerId,
            UUID transactionId,
            TransactionDtos.CompleteTransactionRequest req
    ) {
        if (buyerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (transactionId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã giao dịch không hợp lệ.");
        }

        TransactionLookup lookup = lookupTransactionOrThrow(transactionId);
        if (!lookup.buyerId().equals(buyerId)) {
            throw new AuthFailure(403, "TRANSACTION_FORBIDDEN", "Chỉ người mua mới có thể xác nhận nhận hàng.");
        }

        // Validate 6-digit format before locking rows or burning an attempt
        String rawCode = req != null ? req.otp() : null;
        String normalizedCode = rawCode != null ? rawCode.strip() : "";
        if (!normalizedCode.matches("[0-9]{6}")) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã xác nhận phải gồm đúng 6 chữ số.");
        }

        // Strict lock order: (1) thanh_viens(buyer) -> (2) tin_dangs -> (3) giao_dichs -> (4) ma_xac_nhan_otp -> (5) do_vats
        lockAndVerifyActiveMember(buyerId);
        lockListingForNoKeyUpdate(lookup.listingId());
        LockedTransaction tx = lockTransactionForNoKeyUpdate(transactionId);

        // UC-27 E5 / E6 / NFR-03: Once completed, never complete again; OTP is strictly one-time use
        if (TransactionDtos.TransactionStatus.HOAN_TAT.name().equals(tx.status())) {
            throw new AuthFailure(
                    409,
                    "OTP_ALREADY_USED",
                    "Giao dịch này đã hoàn tất trước đó."
            );
        }
        if (TransactionDtos.TransactionStatus.HUY.name().equals(tx.status())) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Giao dịch đã bị hủy, không thể xác nhận hoàn tất."
            );
        }
        if (!POST_DELIVERY_PENDING_STATUSES.contains(tx.status()) || tx.reportedDeliveredAt() == null) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Người bán chưa báo đã giao cho giao dịch này."
            );
        }
        if (req != null && req.version() != null && req.version() != tx.version()) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Giao dịch vừa được cập nhật. Vui lòng tải lại trước khi xác nhận.");
        }

        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);

        OtpRow otp = lockLatestOtpForNoKeyUpdate(transactionId);
        if (otp == null) {
            throw new HandoverOtpFailure(
                    409,
                    "OTP_EXPIRED",
                    "Chưa có mã xác nhận. Hãy gửi lại mã mới để tiếp tục.",
                    0,
                    otpMaxAttempts,
                    0,
                    true,
                    null
            );
        }

        if (otp.used()) {
            throw new AuthFailure(
                    409,
                    "OTP_ALREADY_USED",
                    "Mã xác nhận này đã được sử dụng."
            );
        }

        if (otp.attemptsUsed() >= otp.maxAttempts() || "VUOT_SO_LAN_SAI".equals(otp.invalidationReason())) {
            wipeOtpCiphertextIfPresent(otp);
            throw new HandoverOtpFailure(
                    409,
                    "OTP_ATTEMPTS_EXCEEDED",
                    "Đã nhập sai " + otp.maxAttempts() + "/" + otp.maxAttempts()
                            + " lượt. Hãy yêu cầu gửi lại mã mới — đồ vật vẫn được giữ chỗ.",
                    otp.attemptsUsed(),
                    otp.maxAttempts(),
                    0,
                    true,
                    otp.expiresAt()
            );
        }

        if (otp.invalidated()) {
            wipeOtpCiphertextIfPresent(otp);
            if ("HET_HAN".equals(otp.invalidationReason())) {
                throw new HandoverOtpFailure(
                        409,
                        "OTP_EXPIRED",
                        "Mã xác nhận đã hết hạn. Hãy gửi lại mã mới để tiếp tục.",
                        otp.attemptsUsed(),
                        otp.maxAttempts(),
                        Math.max(0, otp.maxAttempts() - otp.attemptsUsed()),
                        false,
                        otp.expiresAt()
                );
            }
            throw new HandoverOtpFailure(
                    409,
                    "OTP_EXPIRED",
                    "Mã xác nhận không còn hiệu lực. Hãy gửi lại mã mới để tiếp tục.",
                    otp.attemptsUsed(),
                    otp.maxAttempts(),
                    Math.max(0, otp.maxAttempts() - otp.attemptsUsed()),
                    true,
                    otp.expiresAt()
            );
        }

        // Exact 10-minute expiry check (UC-27 E5 / FR-09: persists HET_HAN + wipes ciphertext, never cancels reservation!)
        if (!otp.expiresAt().isAfter(current)) {
            db.update(
                    """
                    UPDATE ma_xac_nhan_otp
                    SET bi_vo_hieu = TRUE,
                        ly_do_vo_hieu = COALESCE(ly_do_vo_hieu, 'HET_HAN'),
                        otp_ciphertext = NULL
                    WHERE id = ?
                    """,
                    otp.id()
            );
            throw new HandoverOtpFailure(
                    409,
                    "OTP_EXPIRED",
                    "Mã xác nhận đã hết hạn. Hãy gửi lại mã mới để tiếp tục.",
                    otp.attemptsUsed(),
                    otp.maxAttempts(),
                    Math.max(0, otp.maxAttempts() - otp.attemptsUsed()),
                    false,
                    otp.expiresAt()
            );
        }

        // Constant-time HMAC verification (never bumps giao_dichs.version on failed attempt)
        if (!otpCrypto.matches(otp.id(), transactionId, normalizedCode, otp.otpHash())) {
            int nextAttempts = otp.attemptsUsed() + 1;
            int remaining = Math.max(0, otp.maxAttempts() - nextAttempts);
            boolean nowLocked = nextAttempts >= otp.maxAttempts();

            db.update(
                    """
                    UPDATE ma_xac_nhan_otp
                    SET so_lan_thu_sai = ?,
                        bi_vo_hieu = CASE WHEN ? THEN TRUE ELSE bi_vo_hieu END,
                        ly_do_vo_hieu = CASE WHEN ? THEN 'VUOT_SO_LAN_SAI' ELSE ly_do_vo_hieu END,
                        otp_ciphertext = CASE WHEN ? THEN NULL ELSE otp_ciphertext END
                    WHERE id = ?
                    """,
                    nextAttempts,
                    nowLocked,
                    nowLocked,
                    nowLocked,
                    otp.id()
            );

            if (nowLocked) {
                recordTimelineEvent(
                        transactionId,
                        "OTP_LOCKED_MAX_ATTEMPTS",
                        tx.status(),
                        tx.status(),
                        buyerId,
                        "BUYER",
                        "Nhập sai mã xác nhận " + otp.maxAttempts() + " lần.",
                        tsNow
                );
                throw new HandoverOtpFailure(
                        409,
                        "OTP_ATTEMPTS_EXCEEDED",
                        "Đã nhập sai " + nextAttempts + "/" + otp.maxAttempts()
                                + " lượt. Hãy yêu cầu gửi lại mã mới — đồ vật vẫn được giữ chỗ.",
                        nextAttempts,
                        otp.maxAttempts(),
                        0,
                        true,
                        otp.expiresAt()
                );
            }

            throw new HandoverOtpFailure(
                    400,
                    "OTP_INVALID",
                    "Mã xác nhận không đúng. Còn " + remaining + "/" + otp.maxAttempts() + " lượt thử.",
                    nextAttempts,
                    otp.maxAttempts(),
                    remaining,
                    false,
                    otp.expiresAt()
            );
        }

        // Valid OTP! Lock step (5): do_vats ORDER BY ma_vat ASC FOR NO KEY UPDATE & verify combo item integrity
        List<UUID> itemIds = findListingItemIdsSorted(lookup.listingId());
        if (!itemIds.isEmpty()) {
            List<LockedItem> lockedItems = lockItemsSortedForNoKeyUpdate(itemIds);
            if (lockedItems.size() != itemIds.size()) {
                throw new AuthFailure(
                        409,
                        "INVALID_STATE_TRANSITION",
                        "Không tìm thấy đủ đồ vật của tin đăng, chưa thể hoàn tất giao dịch."
                );
            }
            for (LockedItem item : lockedItems) {
                if ("DA_CHUYEN_GIAO".equals(item.status())) {
                    throw new AuthFailure(
                            409,
                            "INVALID_STATE_TRANSITION",
                            "Một hoặc nhiều đồ vật đã được chuyển giao trong giao dịch khác."
                    );
                }
                if (!"DANG_GIU".equals(item.status())) {
                    throw new AuthFailure(
                            409,
                            "INVALID_STATE_TRANSITION",
                            "Đồ vật không còn ở trạng thái đang giữ chỗ cho giao dịch này."
                    );
                }
                if (hasOtherActiveOrderHoldingItem(item.id(), transactionId)) {
                    throw new AuthFailure(
                            409,
                            "INVALID_STATE_TRANSITION",
                            "Đồ vật đang được giữ chỗ trong một giao dịch khác."
                    );
                }
            }
        }

        String currentStatus = tx.status();

        // 1. Mark OTP used & wipe encrypted code immediately (NFR-01, NFR-03)
        db.update(
                """
                UPDATE ma_xac_nhan_otp
                SET da_dung = TRUE,
                    thoi_diem_dung = ?,
                    otp_ciphertext = NULL
                WHERE id = ?
                """,
                tsNow,
                otp.id()
        );

        // 2. Close any unresolved post-delivery cancellation request (UC-29 Alt 3)
        db.update(
                """
                UPDATE yeu_cau_huy_giao_dichs
                SET trang_thai = 'DA_DONG_DO_HOAN_TAT',
                    updated_at = ?
                WHERE ma_giao_dich = ?
                  AND trang_thai IN ('CHO_XAC_NHAN', 'TU_CHOI')
                """,
                tsNow,
                transactionId
        );

        // 3. Transition transaction to HOAN_TAT (one-time completion, reputation unchanged — UC-30 handles rating)
        db.update(
                """
                UPDATE giao_dichs
                SET trang_thai = 'HOAN_TAT',
                    thoi_diem_hoan_tat = ?,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_giao_dich = ?
                """,
                tsNow,
                tsNow,
                transactionId
        );

        // 4. Mark all listing items DA_CHUYEN_GIAO so no other listing can hold/sell them (UC-27 Step 9 / FR-04 / FR-08)
        if (!itemIds.isEmpty()) {
            UUID[] itemArray = itemIds.toArray(new UUID[0]);
            db.update(con -> {
                PreparedStatement ps = con.prepareStatement(
                        "UPDATE do_vats SET trang_thai = 'DA_CHUYEN_GIAO', version = version + 1, updated_at = ? WHERE ma_vat = ANY(?)"
                );
                ps.setTimestamp(1, tsNow);
                ps.setArray(2, con.createArrayOf("uuid", itemArray));
                return ps;
            });
        }

        // 5. Close listing as KET_THUC
        db.update(
                """
                UPDATE tin_dangs
                SET trang_thai = 'KET_THUC',
                    closed_at = ?,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_tin = ?
                """,
                tsNow,
                tsNow,
                lookup.listingId()
        );

        // 6. Immutable audit record
        recordTimelineEvent(
                transactionId,
                "COMPLETED_BY_OTP",
                currentStatus,
                TransactionDtos.TransactionStatus.HOAN_TAT.name(),
                buyerId,
                "BUYER",
                "Người mua đã xác nhận nhận hàng.",
                tsNow
        );

        return loadTransactionDetail(buyerId, TransactionDtos.AdminViewerRole.NONE, transactionId);
    }

    // =========================================================================
    // FR-09 / UC-27: Reissue 6-digit OTP (invalidates old OTP, preserves 24h anchor)
    // =========================================================================

    @Transactional
    public TransactionDtos.TransactionDetailDto reissueOtp(
            UUID callerId,
            UUID transactionId,
            TransactionDtos.ReissueOtpRequest req
    ) {
        if (callerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (transactionId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã giao dịch không hợp lệ.");
        }

        TransactionLookup lookup = lookupTransactionOrThrow(transactionId);
        boolean isBuyer = lookup.buyerId().equals(callerId);
        boolean isSeller = lookup.sellerId().equals(callerId);
        if (!isBuyer && !isSeller) {
            throw new AuthFailure(403, "TRANSACTION_FORBIDDEN", "Bạn không thuộc giao dịch này.");
        }

        // Strict lock order: (1) thanh_viens(caller) -> (2) tin_dangs -> (3) giao_dichs -> (4) ma_xac_nhan_otp
        lockAndVerifyActiveMember(callerId);
        lockListingForNoKeyUpdate(lookup.listingId());
        LockedTransaction tx = lockTransactionForNoKeyUpdate(transactionId);

        if (!POST_DELIVERY_PENDING_STATUSES.contains(tx.status()) || tx.reportedDeliveredAt() == null) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Chỉ có thể gửi lại mã xác nhận khi giao dịch đang chờ xác nhận."
            );
        }
        if (req != null && req.version() != null && req.version() != tx.version()) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Giao dịch vừa được cập nhật. Vui lòng tải lại.");
        }

        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);
        String currentStatus = escalateIfOverdue24hInPlace(tx, current, tsNow);

        OtpRow latest = lockLatestOtpForNoKeyUpdate(transactionId);
        if (isSeller && latest != null && isOtpActive(latest, current)) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Mã xác nhận hiện tại vẫn còn hiệu lực. Bạn chỉ có thể gửi lại khi mã đã hết hạn hoặc hết lượt thử."
            );
        }

        // FR-09: Reissuing strictly invalidates all prior un-used OTP rows (preserving HET_HAN vs CAP_LAI) & wipes ciphertext
        db.update(
                """
                UPDATE ma_xac_nhan_otp
                SET bi_vo_hieu = TRUE,
                    ly_do_vo_hieu = COALESCE(
                        ly_do_vo_hieu,
                        CASE WHEN thoi_diem_het_han <= ? THEN 'HET_HAN' ELSE 'CAP_LAI' END
                    ),
                    otp_ciphertext = NULL
                WHERE ma_giao_dich = ? AND da_dung = FALSE AND bi_vo_hieu = FALSE
                """,
                tsNow,
                transactionId
        );

        Timestamp otpExpiresAt = Timestamp.from(current.plusSeconds(otpTtlSeconds));
        issueFreshOtpRow(transactionId, callerId, tsNow, otpExpiresAt);

        // CRITICAL (UC-29 Assumption): Never modify thoi_diem_bao_giao so the 24h escalation anchor is preserved!
        db.update(
                "UPDATE giao_dichs SET updated_at = ?, version = version + 1 WHERE ma_giao_dich = ?",
                tsNow,
                transactionId
        );

        recordTimelineEvent(
                transactionId,
                "OTP_REISSUED",
                currentStatus,
                currentStatus,
                callerId,
                isBuyer ? "BUYER" : "SELLER",
                "Đã gửi lại mã xác nhận mới.",
                tsNow
        );

        return loadTransactionDetail(callerId, TransactionDtos.AdminViewerRole.NONE, transactionId);
    }

    // =========================================================================
    // UC-28 Steps 1-6: Request Post-Delivery Cancellation (does NOT release hold)
    // =========================================================================

    @Transactional
    public TransactionDtos.CancelRequestMutationResult createCancelRequest(
            UUID callerId,
            UUID transactionId,
            TransactionDtos.CreateCancelRequest req
    ) {
        if (callerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (transactionId == null || req == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thông tin yêu cầu hủy không hợp lệ.");
        }

        TransactionDtos.CancelReasonCode reasonCode = TransactionDtos.CancelReasonCode.fromString(req.reasonCode())
                .orElseThrow(() -> new AuthFailure(400, "INVALID_INPUT", "Vui lòng chọn lý do hủy giao dịch."));

        String reasonNote = ListingValidation.optionalText(
                req.reasonNote(),
                MAX_NOTE_LENGTH,
                "Chi tiết lý do hủy không được vượt quá " + MAX_NOTE_LENGTH + " ký tự."
        );
        if (reasonCode == TransactionDtos.CancelReasonCode.OTHER && (reasonNote == null || reasonNote.length() < 3)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Vui lòng nhập chi tiết lý do hủy (ít nhất 3 ký tự).");
        }

        TransactionLookup lookup = lookupTransactionOrThrow(transactionId);
        boolean isBuyer = lookup.buyerId().equals(callerId);
        boolean isSeller = lookup.sellerId().equals(callerId);
        if (!isBuyer && !isSeller) {
            throw new AuthFailure(403, "TRANSACTION_FORBIDDEN", "Bạn không thuộc giao dịch này nên không thể yêu cầu hủy.");
        }

        // Strict lock order: (1) thanh_viens(caller) -> (2) tin_dangs -> (3) giao_dichs -> (4) yeu_cau_huy_giao_dichs
        lockAndVerifyActiveMember(callerId);
        lockListingForNoKeyUpdate(lookup.listingId());
        LockedTransaction tx = lockTransactionForNoKeyUpdate(transactionId);

        // UC-28 E2: Finalized states cannot be reversed
        if (TransactionDtos.TransactionStatus.HOAN_TAT.name().equals(tx.status())
                || TransactionDtos.TransactionStatus.HUY.name().equals(tx.status())) {
            String endedMessage = TransactionDtos.TransactionStatus.HOAN_TAT.name().equals(tx.status())
                    ? "Giao dịch đã hoàn tất, không thể gửi yêu cầu hủy."
                    : "Giao dịch đã bị hủy trước đó.";
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    endedMessage
            );
        }

        // UC-28 A3: Pre-delivery must use UC-24, not UC-28
        if (!POST_DELIVERY_PENDING_STATUSES.contains(tx.status()) || tx.reportedDeliveredAt() == null) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Giao dịch chưa được báo giao — hãy dùng chức năng hủy giữ chỗ trước bàn giao."
            );
        }

        CancelRequestRow latest = lockLatestCancelRequestForNoKeyUpdate(transactionId);
        // UC-28 E3 / NFR-03: Idempotent replay by the SAME requester returns 200 with existing request, NEVER self-confirms!
        if (latest != null && "CHO_XAC_NHAN".equals(latest.status())) {
            if (latest.requestedById().equals(callerId)) {
                return new TransactionDtos.CancelRequestMutationResult(
                        loadTransactionDetail(callerId, TransactionDtos.AdminViewerRole.NONE, transactionId),
                        false
                );
            }
            throw new AuthFailure(
                    409,
                    "CANCEL_REQUEST_ALREADY_PENDING",
                    "Bên còn lại đã gửi yêu cầu hủy giao dịch. Vui lòng xem và chọn Đồng ý hoặc Từ chối."
            );
        }
        if (latest != null && "TU_CHOI".equals(latest.status())) {
            String message = latest.requestedById().equals(callerId)
                    ? "Yêu cầu hủy trước đó đã bị từ chối, giao dịch đang chờ đội kiểm duyệt xem xét."
                    : "Yêu cầu hủy trước đó đã bị từ chối. Nếu muốn hủy ngay, hãy chọn Đồng ý trên yêu cầu hiện có.";
            throw new AuthFailure(
                    409,
                    "CANCEL_REQUEST_ALREADY_PENDING",
                    message
            );
        }

        if (req.version() != null && req.version() != tx.version()) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Giao dịch vừa được cập nhật. Vui lòng tải lại.");
        }

        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);
        String currentStatus = escalateIfOverdue24hInPlace(tx, current, tsNow);

        UUID requestId = UUID.randomUUID();
        try {
            db.update(
                    """
                    INSERT INTO yeu_cau_huy_giao_dichs(
                        id, ma_giao_dich, nguoi_yeu_cau_id, ma_ly_do, ly_do,
                        trang_thai, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 'CHO_XAC_NHAN', ?, ?)
                    """,
                    requestId,
                    transactionId,
                    callerId,
                    reasonCode.name(),
                    reasonNote,
                    tsNow,
                    tsNow
            );
        } catch (DataIntegrityViolationException ex) {
            throw new AuthFailure(
                    409,
                    "CANCEL_REQUEST_ALREADY_PENDING",
                    "Giao dịch hiện đã có yêu cầu hủy đang chờ phản hồi."
            );
        }

        // UC-28 Step 5: Keep status (CHO_XAC_NHAN / CHO_XU_LY) and keep ALL items/listing held!
        db.update(
                "UPDATE giao_dichs SET updated_at = ?, version = version + 1 WHERE ma_giao_dich = ?",
                tsNow,
                transactionId
        );

        String auditNote = reasonCode.label() + (reasonNote != null ? ": " + reasonNote : "");
        recordTimelineEvent(
                transactionId,
                "CANCEL_REQUESTED",
                currentStatus,
                currentStatus,
                callerId,
                isBuyer ? "BUYER" : "SELLER",
                auditNote,
                tsNow
        );

        return new TransactionDtos.CancelRequestMutationResult(
                loadTransactionDetail(callerId, TransactionDtos.AdminViewerRole.NONE, transactionId),
                true
        );
    }

    // =========================================================================
    // UC-28 A1, A2, A4, E4, E5: Counterparty responds (AGREE or REJECT)
    // =========================================================================

    @Transactional
    public TransactionDtos.TransactionDetailDto respondCancelRequest(
            UUID responderId,
            UUID transactionId,
            UUID requestId,
            TransactionDtos.RespondCancelRequest req
    ) {
        if (responderId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (transactionId == null || requestId == null || req == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thông tin phản hồi yêu cầu hủy không hợp lệ.");
        }

        TransactionDtos.CancelDecision decision = TransactionDtos.CancelDecision.fromString(req.decision())
                .orElseThrow(() -> new AuthFailure(400, "INVALID_INPUT", "Vui lòng chọn Đồng ý hoặc Từ chối yêu cầu hủy."));

        String responseNote = ListingValidation.optionalText(
                req.responseNote(),
                MAX_NOTE_LENGTH,
                "Ghi chú phản hồi không được vượt quá " + MAX_NOTE_LENGTH + " ký tự."
        );

        TransactionLookup lookup = lookupTransactionOrThrow(transactionId);
        boolean isBuyer = lookup.buyerId().equals(responderId);
        boolean isSeller = lookup.sellerId().equals(responderId);
        if (!isBuyer && !isSeller) {
            throw new AuthFailure(403, "TRANSACTION_FORBIDDEN", "Bạn không thuộc giao dịch này.");
        }

        // Strict lock order:
        // (1) thanh_viens(buyer, seller canonical UUID ASC) -> (2) tin_dangs -> (3) giao_dichs -> (4) yeu_cau_huy_giao_dichs -> (5) do_vats ASC
        boolean sellerActiveForReopen = lockPartiesCanonicalAndVerifyCaller(responderId, lookup.sellerId(), lookup.buyerId());
        LockedListing listing = lockListingForNoKeyUpdate(lookup.listingId());
        LockedTransaction tx = lockTransactionForNoKeyUpdate(transactionId);
        CancelRequestRow cancelReq = lockCancelRequestByIdForNoKeyUpdate(transactionId, requestId);

        // UC-28: Requester can NEVER respond to their own cancellation request
        if (cancelReq.requestedById().equals(responderId)) {
            throw new AuthFailure(
                    403,
                    "TRANSACTION_FORBIDDEN",
                    "Bạn không thể tự phản hồi yêu cầu hủy của mình. Hãy chờ bên còn lại xác nhận."
            );
        }

        // UC-28 E2: Never reverse completed transaction
        if (TransactionDtos.TransactionStatus.HOAN_TAT.name().equals(tx.status())) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Giao dịch đã hoàn tất, không thể xử lý yêu cầu hủy."
            );
        }

        // NFR-03 idempotent replay on already-agreed cancellation
        if (TransactionDtos.TransactionStatus.HUY.name().equals(tx.status())) {
            if (decision == TransactionDtos.CancelDecision.AGREE && "DONG_Y".equals(cancelReq.status())) {
                return loadTransactionDetail(responderId, TransactionDtos.AdminViewerRole.NONE, transactionId);
            }
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Giao dịch đã bị hủy."
            );
        }

        if (!POST_DELIVERY_PENDING_STATUSES.contains(tx.status()) || tx.reportedDeliveredAt() == null) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Giao dịch hiện không thể phản hồi yêu cầu hủy."
            );
        }

        // Idempotent replay when rejecting an already-rejected request
        if (decision == TransactionDtos.CancelDecision.REJECT && "TU_CHOI".equals(cancelReq.status())) {
            return loadTransactionDetail(responderId, TransactionDtos.AdminViewerRole.NONE, transactionId);
        }

        if (req.version() != null && req.version() != tx.version()) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Giao dịch vừa được cập nhật. Vui lòng tải lại.");
        }

        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);
        String responderRole = isBuyer ? "BUYER" : "SELLER";

        if (decision == TransactionDtos.CancelDecision.AGREE) {
            // UC-28 A1 & UC-29 Alt 4: Counterparty may agree when CHO_XAC_NHAN or even later from TU_CHOI (before moderator decision)
            if (!"CHO_XAC_NHAN".equals(cancelReq.status()) && !"TU_CHOI".equals(cancelReq.status())) {
                throw new AuthFailure(
                        409,
                        "INVALID_STATE_TRANSITION",
                        "Yêu cầu hủy này đã kết thúc."
                );
            }

            // 1. Mark cancel request DONG_Y
            db.update(
                    """
                    UPDATE yeu_cau_huy_giao_dichs
                    SET trang_thai = 'DONG_Y',
                        nguoi_phan_hoi_id = ?,
                        phan_hoi_ghi_chu = ?,
                        thoi_diem_phan_hoi = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    responderId,
                    responseNote,
                    tsNow,
                    tsNow,
                    requestId
            );

            // 2. Invalidate ONLY active un-used OTP rows & clear ciphertext (preserve historical CAP_LAI / VUOT_SO_LAN_SAI / HET_HAN audit reasons)
            db.update(
                    """
                    UPDATE ma_xac_nhan_otp
                    SET bi_vo_hieu = TRUE,
                        ly_do_vo_hieu = COALESCE(
                            ly_do_vo_hieu,
                            CASE WHEN thoi_diem_het_han <= ? THEN 'HET_HAN' ELSE 'DA_HUY_GIAO_DICH' END
                        ),
                        otp_ciphertext = NULL
                    WHERE ma_giao_dich = ? AND da_dung = FALSE AND bi_vo_hieu = FALSE
                    """,
                    tsNow,
                    transactionId
            );

            // 3. Mark transaction HUY
            String reasonLabel = TransactionDtos.CancelReasonCode.fromString(cancelReq.reasonCode())
                    .map(TransactionDtos.CancelReasonCode::label)
                    .orElse(cancelReq.reasonCode());
            String finalReason = reasonLabel
                    + (cancelReq.reasonNote() != null ? ": " + cancelReq.reasonNote() : "");
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
                    cancelReq.requestedById(),
                    finalReason,
                    tsNow,
                    tsNow,
                    transactionId
            );

            // 4. Lock step (5): do_vats ORDER BY ma_vat ASC FOR NO KEY UPDATE
            List<UUID> itemIds = findListingItemIdsSorted(listing.id());
            List<LockedItem> lockedItems = lockItemsSortedForNoKeyUpdate(itemIds);

            // UC-28 A1 & E5: Release item to KHA_DUNG ONLY IF currently DANG_GIU AND no other active order holds it!
            List<UUID> itemsToRelease = new ArrayList<>();
            for (LockedItem item : lockedItems) {
                if ("DANG_GIU".equals(item.status()) && !hasOtherActiveOrderHoldingItem(item.id(), transactionId)) {
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

            // 5. Reopen listing ONLY if currently GIU_CHO & no other active order on this listing (respect FR-13 & seller status)
            if (ListingDtos.ListingStatus.GIU_CHO.name().equals(listing.status())
                    && countOtherActiveOrdersForListing(listing.id(), transactionId) == 0) {
                boolean expired = listing.expiresAt() != null && !current.isBefore(listing.expiresAt());
                if (expired) {
                    db.update(
                            "UPDATE tin_dangs SET trang_thai = 'HET_HAN', closed_at = ?, updated_at = ?, version = version + 1 WHERE ma_tin = ?",
                            tsNow,
                            tsNow,
                            listing.id()
                    );
                } else if (sellerActiveForReopen && areAllListingItemsAvailable(listing.id())) {
                    db.update(
                            "UPDATE tin_dangs SET trang_thai = 'CONG_KHAI', updated_at = ?, version = version + 1 WHERE ma_tin = ?",
                            tsNow,
                            listing.id()
                    );
                } else {
                    db.update(
                            "UPDATE tin_dangs SET trang_thai = 'DA_RUT', closed_at = ?, updated_at = ?, version = version + 1 WHERE ma_tin = ?",
                            tsNow,
                            tsNow,
                            listing.id()
                    );
                }
            }

            recordTimelineEvent(
                    transactionId,
                    "CANCEL_AGREED",
                    tx.status(),
                    TransactionDtos.TransactionStatus.HUY.name(),
                    responderId,
                    responderRole,
                    responseNote != null ? responseNote : "Hai bên đã đồng ý hủy giao dịch.",
                    tsNow
            );

            return loadTransactionDetail(responderId, TransactionDtos.AdminViewerRole.NONE, transactionId);
        }

        // Branch REJECT (UC-28 A2 / A4 / E4): Mark TU_CHOI & escalate to CHO_XU_LY (CANCEL_DISPUTE), keeping items strictly HELD!
        if (!"CHO_XAC_NHAN".equals(cancelReq.status())) {
            throw new AuthFailure(
                    409,
                    "INVALID_STATE_TRANSITION",
                    "Yêu cầu hủy này không còn ở trạng thái chờ phản hồi."
            );
        }

        db.update(
                """
                UPDATE yeu_cau_huy_giao_dichs
                SET trang_thai = 'TU_CHOI',
                    nguoi_phan_hoi_id = ?,
                    phan_hoi_ghi_chu = ?,
                    thoi_diem_phan_hoi = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                responderId,
                responseNote,
                tsNow,
                tsNow,
                requestId
        );

        db.update(
                """
                UPDATE giao_dichs
                SET trang_thai = 'CHO_XU_LY',
                    ly_do_cho_xu_ly = COALESCE(ly_do_cho_xu_ly, 'CANCEL_DISPUTE'),
                    thoi_diem_chuyen_xu_ly = COALESCE(thoi_diem_chuyen_xu_ly, ?),
                    updated_at = ?,
                    version = version + 1
                WHERE ma_giao_dich = ?
                """,
                tsNow,
                tsNow,
                transactionId
        );

        recordTimelineEvent(
                transactionId,
                "CANCEL_REJECTED",
                tx.status(),
                TransactionDtos.TransactionStatus.CHO_XU_LY.name(),
                responderId,
                responderRole,
                responseNote != null ? responseNote : "Từ chối yêu cầu hủy, chuyển đội kiểm duyệt xem xét.",
                tsNow
        );

        return loadTransactionDetail(responderId, TransactionDtos.AdminViewerRole.NONE, transactionId);
    }

    // =========================================================================
    // FR-09 / UC-27 E7: Scheduled 24-hour overdue escalation (CHO_XAC_NHAN -> CHO_XU_LY)
    // =========================================================================

    @Transactional
    public int reconcileOverdueDeliveries(int batchSize) {
        int safeBatch = batchSize > 0 ? Math.min(batchSize, 500) : 100;
        Instant current = now();
        Timestamp tsNow = Timestamp.from(current);
        Timestamp cutoff = Timestamp.from(current.minus(confirmEscalationHours, ChronoUnit.HOURS));

        List<UUID> overdueIds = db.queryForList(
                """
                SELECT ma_giao_dich
                FROM giao_dichs
                WHERE trang_thai = 'CHO_XAC_NHAN'
                  AND thoi_diem_bao_giao IS NOT NULL
                  AND thoi_diem_bao_giao <= ?
                ORDER BY ma_giao_dich ASC
                LIMIT ?
                FOR UPDATE SKIP LOCKED
                """,
                UUID.class,
                cutoff,
                safeBatch
        );
        if (overdueIds.isEmpty()) {
            return 0;
        }

        UUID[] idArray = overdueIds.toArray(new UUID[0]);
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                    UPDATE giao_dichs
                    SET trang_thai = 'CHO_XU_LY',
                        ly_do_cho_xu_ly = COALESCE(ly_do_cho_xu_ly, 'OVERDUE_24H'),
                        thoi_diem_chuyen_xu_ly = COALESCE(thoi_diem_chuyen_xu_ly, ?),
                        updated_at = ?,
                        version = version + 1
                    WHERE ma_giao_dich = ANY(?)
                      AND trang_thai = 'CHO_XAC_NHAN'
                    """
            );
            ps.setTimestamp(1, tsNow);
            ps.setTimestamp(2, tsNow);
            ps.setArray(3, con.createArrayOf("uuid", idArray));
            return ps;
        });

        for (UUID overdueId : overdueIds) {
            recordTimelineEvent(
                    overdueId,
                    "AUTO_ESCALATED_OVERDUE_24H",
                    TransactionDtos.TransactionStatus.CHO_XAC_NHAN.name(),
                    TransactionDtos.TransactionStatus.CHO_XU_LY.name(),
                    null,
                    "SYSTEM",
                    "Quá 24 giờ chưa xác nhận, chuyển đội kiểm duyệt xem xét.",
                    tsNow
            );
        }

        return overdueIds.size();
    }

    // =========================================================================
    // Internal detail assembly & helpers
    // =========================================================================

    private TransactionDtos.TransactionDetailDto loadTransactionDetail(
            UUID viewerId,
            TransactionDtos.AdminViewerRole adminRole,
            UUID transactionId
    ) {
        List<DetailRow> rows = db.query(
                """
                SELECT g.ma_giao_dich, g.ma_tin, g.nguoi_ban_id, g.nguoi_mua_id, g.gia_thoa_thuan,
                       g.trang_thai, g.thoi_gian_hen, g.dia_diem_hen, g.anh_ban_giao, g.ghi_chu_ban_giao,
                       g.ly_do_cho_xu_ly, g.thoi_diem_chuyen_xu_ly,
                       g.thoi_diem_bat_dau_giao, g.thoi_diem_bao_giao, g.thoi_diem_hoan_tat,
                       g.thoi_diem_huy, g.updated_at, g.version,
                       t.tieu_de, t.gia_vnd, t.hinh_thuc, t.trang_thai AS listing_status, t.hinh_anh,
                       s.ho_ten AS seller_name, s.diem_uy_tin AS seller_score,
                       b.ho_ten AS buyer_name, b.diem_uy_tin AS buyer_score
                FROM giao_dichs g
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                JOIN thanh_viens s ON s.user_id = g.nguoi_ban_id
                JOIN thanh_viens b ON b.user_id = g.nguoi_mua_id
                WHERE g.ma_giao_dich = ?
                """,
                (rs, rowNum) -> new DetailRow(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getString("tieu_de"),
                        rs.getInt("gia_vnd"),
                        rs.getString("hinh_thuc"),
                        rs.getString("listing_status"),
                        extractTextArray(rs, "hinh_anh"),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getString("seller_name"),
                        rs.getInt("seller_score"),
                        rs.getObject("nguoi_mua_id", UUID.class),
                        rs.getString("buyer_name"),
                        rs.getInt("buyer_score"),
                        rs.getInt("gia_thoa_thuan"),
                        rs.getString("trang_thai"),
                        toInstant(rs.getTimestamp("thoi_gian_hen")),
                        rs.getString("dia_diem_hen"),
                        rs.getString("ghi_chu_ban_giao"),
                        rs.getString("ly_do_cho_xu_ly"),
                        toInstant(rs.getTimestamp("thoi_diem_chuyen_xu_ly")),
                        toInstant(rs.getTimestamp("thoi_diem_bat_dau_giao")),
                        toInstant(rs.getTimestamp("thoi_diem_bao_giao")),
                        toInstant(rs.getTimestamp("thoi_diem_hoan_tat")),
                        toInstant(rs.getTimestamp("thoi_diem_huy")),
                        toInstant(rs.getTimestamp("updated_at")),
                        rs.getLong("version")
                ),
                transactionId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch.");
        }

        DetailRow row = rows.getFirst();
        boolean isSeller = row.sellerId().equals(viewerId);
        boolean isBuyer = row.buyerId().equals(viewerId);
        boolean isPrivilegedAdmin = adminRole != null && adminRole.isPrivileged();
        if (!isSeller && !isBuyer && !isPrivilegedAdmin) {
            throw new AuthFailure(403, "TRANSACTION_FORBIDDEN", "Bạn không có quyền xem thông tin giao dịch này.");
        }

        boolean viewerCanMutate = false;
        if (isSeller || isBuyer) {
            viewerCanMutate = requireReadableMemberAccount(viewerId);
        }

        Instant current = now();
        Instant autoEscalateAt = row.deliveredAt() != null
                ? row.deliveredAt().plus(confirmEscalationHours, ChronoUnit.HOURS)
                : null;
        boolean overdueNotYetPersisted = TransactionDtos.TransactionStatus.CHO_XAC_NHAN.name().equals(row.status())
                && autoEscalateAt != null
                && !current.isBefore(autoEscalateAt);

        String effectiveStatus = overdueNotYetPersisted
                ? TransactionDtos.TransactionStatus.CHO_XU_LY.name()
                : row.status();
        String effectiveEscalationReason = row.escalationReason() != null
                ? row.escalationReason()
                : (overdueNotYetPersisted ? "OVERDUE_24H" : null);
        Instant effectiveEscalatedAt = row.escalatedAt() != null
                ? row.escalatedAt()
                : (overdueNotYetPersisted ? autoEscalateAt : null);
        Long autoEscalateRemainingSeconds = (TransactionDtos.TransactionStatus.CHO_XAC_NHAN.name().equals(effectiveStatus)
                && autoEscalateAt != null)
                ? ceilingSecondsRemaining(current, autoEscalateAt)
                : null;

        List<TransactionDtos.TransactionItemDto> items = loadListingItems(row.listingId());
        boolean isCombo = ListingDtos.ListingType.BAN_COMBO.name().equals(row.listingType()) || items.size() >= 2;
        boolean isFree = row.listedPriceVnd() == 0;

        TransactionDtos.TransactionListingDto listingDto = new TransactionDtos.TransactionListingDto(
                row.listingId(),
                row.listingTitle(),
                row.listingImages().isEmpty() ? null : row.listingImages().getFirst(),
                isCombo,
                isFree,
                row.listingStatus()
        );

        String viewerRole = isSeller
                ? "SELLER"
                : (isBuyer
                        ? "BUYER"
                        : (adminRole == TransactionDtos.AdminViewerRole.SENIOR_ADMIN ? "SENIOR_ADMIN" : "MODERATOR"));
        TransactionDtos.CounterpartySummaryDto sellerDto = new TransactionDtos.CounterpartySummaryDto(
                row.sellerId(),
                row.sellerName(),
                row.sellerScore()
        );
        TransactionDtos.CounterpartySummaryDto buyerDto = new TransactionDtos.CounterpartySummaryDto(
                row.buyerId(),
                row.buyerName(),
                row.buyerScore()
        );
        TransactionDtos.CounterpartySummaryDto counterparty = isSeller ? buyerDto : sellerDto;

        // Handover proof photos
        List<ProofRow> proofRows = db.query(
                """
                SELECT id, storage_key, content_type, size_bytes, uploaded_at
                FROM anh_ban_giao_giao_dichs
                WHERE ma_giao_dich = ?
                ORDER BY thu_tu ASC, uploaded_at ASC, id ASC
                """,
                this::mapProofRow,
                transactionId
        );
        TransactionDtos.HandoverProofDto handoverProof = null;
        if (!proofRows.isEmpty()) {
            ProofRow primary = proofRows.getFirst();
            List<TransactionDtos.HandoverPhotoItemDto> photoDtos = proofRows.stream()
                    .map(p -> new TransactionDtos.HandoverPhotoItemDto(
                            p.id(),
                            "/api/v1/transactions/" + transactionId + "/handover-photos/" + p.id(),
                            p.contentType(),
                            p.sizeBytes(),
                            p.uploadedAt()
                    ))
                    .toList();
            handoverProof = new TransactionDtos.HandoverProofDto(
                    primary.id(),
                    "/api/v1/transactions/" + transactionId + "/handover-photo",
                    photoDtos,
                    primary.uploadedAt(),
                    row.deliveryNote(),
                    primary.contentType()
            );
        }

        // Latest OTP telemetry (inAppCode STRICTLY Buyer + HOAT_DONG + ACTIVE only!)
        OtpRow latestOtp = findLatestOtpReadOnly(transactionId);
        TransactionDtos.HandoverOtpDto otpDto = null;
        boolean otpIsActive = false;
        if (latestOtp != null) {
            Integer totalOtpObj = db.queryForObject(
                    "SELECT COUNT(*) FROM ma_xac_nhan_otp WHERE ma_giao_dich = ?",
                    Integer.class,
                    transactionId
            );
            int reissueCount = Math.max(0, (totalOtpObj != null ? totalOtpObj : 0) - 1);
            String otpStatus = computeOtpStatus(latestOtp, current);
            otpIsActive = "ACTIVE".equals(otpStatus);
            long remainingSeconds = otpIsActive
                    ? ceilingSecondsRemaining(current, latestOtp.expiresAt())
                    : 0L;
            int remainingAttempts = Math.max(0, latestOtp.maxAttempts() - latestOtp.attemptsUsed());
            String inAppCode = (isBuyer && viewerCanMutate && otpIsActive)
                    ? otpCrypto.decryptCode(latestOtp.id(), transactionId, latestOtp.otpCiphertext())
                    : null;

            otpDto = new TransactionDtos.HandoverOtpDto(
                    latestOtp.id(),
                    otpStatus,
                    latestOtp.issuedAt(),
                    latestOtp.expiresAt(),
                    remainingSeconds,
                    otpTtlSeconds,
                    reissueCount,
                    latestOtp.attemptsUsed(),
                    latestOtp.maxAttempts(),
                    remainingAttempts,
                    inAppCode
            );
        }

        // Latest post-delivery cancellation request
        CancelRequestRow latestCancel = findLatestCancelRequestReadOnly(transactionId);
        TransactionDtos.CancellationRequestDto cancelDto = null;
        if (latestCancel != null) {
            String requestedByRole = latestCancel.requestedById().equals(row.sellerId()) ? "SELLER" : "BUYER";
            boolean isViewerRequester = latestCancel.requestedById().equals(viewerId);
            String reasonLabel = TransactionDtos.CancelReasonCode.fromString(latestCancel.reasonCode())
                    .map(TransactionDtos.CancelReasonCode::label)
                    .orElse(latestCancel.reasonCode());
            cancelDto = new TransactionDtos.CancellationRequestDto(
                    latestCancel.id(),
                    latestCancel.status(),
                    requestedByRole,
                    isViewerRequester,
                    latestCancel.reasonCode(),
                    reasonLabel,
                    latestCancel.reasonNote(),
                    latestCancel.createdAt(),
                    latestCancel.respondedAt(),
                    latestCancel.responseNote()
            );
        }

        // Zero-PII chronological audit timeline
        List<TransactionDtos.TimelineEventDto> timeline = db.query(
                """
                SELECT id, hanh_dong, trang_thai_truoc, trang_thai_sau, vai_tro_thuc_hien, ghi_chu, created_at
                FROM lich_su_trang_thai_giao_dich
                WHERE ma_giao_dich = ?
                ORDER BY created_at ASC, id ASC
                """,
                (rs, rowNum) -> new TransactionDtos.TimelineEventDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("hanh_dong"),
                        rs.getString("trang_thai_truoc"),
                        rs.getString("trang_thai_sau"),
                        rs.getString("vai_tro_thuc_hien"),
                        rs.getString("ghi_chu"),
                        toInstant(rs.getTimestamp("created_at"))
                ),
                transactionId
        );

        boolean isPostDeliveryOpen = POST_DELIVERY_PENDING_STATUSES.contains(effectiveStatus) && row.deliveredAt() != null;
        boolean hasOpenOrDisputedCancel = latestCancel != null
                && ("CHO_XAC_NHAN".equals(latestCancel.status()) || "TU_CHOI".equals(latestCancel.status()));
        boolean canReportDelivered = viewerCanMutate
                && isSeller
                && TransactionDtos.TransactionStatus.DANG_GIAO.name().equals(effectiveStatus)
                && row.deliveredAt() == null;
        boolean canVerifyOtp = viewerCanMutate && isBuyer && isPostDeliveryOpen && otpIsActive;
        boolean canReissueOtp = viewerCanMutate
                && isPostDeliveryOpen
                && (isBuyer || (isSeller && !otpIsActive));
        boolean canRequestCancel = viewerCanMutate
                && (isBuyer || isSeller)
                && isPostDeliveryOpen
                && !hasOpenOrDisputedCancel;
        boolean canRespondCancel = viewerCanMutate
                && (isBuyer || isSeller)
                && isPostDeliveryOpen
                && latestCancel != null
                && !latestCancel.requestedById().equals(viewerId)
                && ("CHO_XAC_NHAN".equals(latestCancel.status()) || "TU_CHOI".equals(latestCancel.status()));
        boolean canViewHandoverPhoto = !proofRows.isEmpty();

        TransactionDtos.TransactionActionsDto actions = new TransactionDtos.TransactionActionsDto(
                canReportDelivered,
                canVerifyOtp,
                canReissueOtp,
                canRequestCancel,
                canRespondCancel,
                canViewHandoverPhoto
        );

        return new TransactionDtos.TransactionDetailDto(
                row.id(),
                row.version(),
                current,
                effectiveStatus,
                viewerRole,
                row.agreedPriceVnd(),
                isFree,
                row.appointmentAt(),
                row.appointmentLocation(),
                row.deliveryStartedAt(),
                row.deliveredAt(),
                autoEscalateAt,
                autoEscalateRemainingSeconds,
                row.completedAt(),
                row.cancelledAt(),
                effectiveEscalationReason,
                effectiveEscalatedAt,
                listingDto,
                items,
                counterparty,
                sellerDto,
                buyerDto,
                handoverProof,
                otpDto,
                cancelDto,
                List.copyOf(timeline),
                actions
        );
    }

    private List<ValidatedProofPhoto> validateAndSanitizeProofs(UUID transactionId, List<MultipartFile> rawFiles) {
        List<MultipartFile> files = new ArrayList<>();
        if (rawFiles != null) {
            for (MultipartFile f : rawFiles) {
                if (f != null) {
                    files.add(f);
                }
            }
        }
        if (files.isEmpty()) {
            throw new AuthFailure(400, "HANDOVER_PHOTO_REQUIRED", "Vui lòng chọn ít nhất 1 ảnh bàn giao.");
        }
        if (files.size() > MAX_PROOF_PHOTOS) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Chỉ được tải lên tối đa " + MAX_PROOF_PHOTOS + " ảnh bàn giao.");
        }

        List<ValidatedProofPhoto> result = new ArrayList<>(files.size());
        for (MultipartFile file : files) {
            if (file.isEmpty()) {
                throw new AuthFailure(400, "HANDOVER_PHOTO_REQUIRED", "Ảnh bàn giao không được để trống.");
            }
            if (file.getSize() > maxProofSizeBytes) {
                throw new AuthFailure(413, "FILE_TOO_LARGE", "Mỗi ảnh bàn giao tối đa 5MB.");
            }
            byte[] rawBytes;
            try {
                rawBytes = file.getBytes();
            } catch (IOException e) {
                throw new AuthFailure(400, "INVALID_MEDIA", "Không thể đọc ảnh bàn giao. Vui lòng thử lại.");
            }
            if (rawBytes.length == 0) {
                throw new AuthFailure(400, "HANDOVER_PHOTO_REQUIRED", "Ảnh bàn giao không được để trống.");
            }
            if (rawBytes.length > maxProofSizeBytes) {
                throw new AuthFailure(413, "FILE_TOO_LARGE", "Mỗi ảnh bàn giao tối đa 5MB.");
            }

            MediaMagicBytes.DetectedImageType detected = MediaMagicBytes.detect(rawBytes)
                    .orElseThrow(() -> new AuthFailure(
                            400,
                            "INVALID_MEDIA",
                            "Ảnh bàn giao chỉ hỗ trợ định dạng JPEG, PNG hoặc WebP."
                    ));

            byte[] sanitized = MediaImageSanitizer.sanitize(rawBytes, detected, maxProofSizeBytes);
            UUID proofId = UUID.randomUUID();
            String storageKey = transactionId + "/" + proofId + "." + detected.extension();

            result.add(new ValidatedProofPhoto(
                    proofId,
                    storageKey,
                    MediaMagicBytes.sanitizeFilename(file.getOriginalFilename()),
                    detected.contentType(),
                    sanitized.length,
                    MediaMagicBytes.sha256Hex(sanitized),
                    sanitized
            ));
        }
        return result;
    }

    private void issueFreshOtpRow(UUID transactionId, UUID issuerId, Timestamp issuedAt, Timestamp expiresAt) {
        UUID otpId = UUID.randomUUID();
        String code = otpCrypto.generateCode();
        String otpHash = otpCrypto.hashCode(otpId, transactionId, code);
        String otpCiphertext = otpCrypto.encryptCode(otpId, transactionId, code);

        db.update(
                """
                INSERT INTO ma_xac_nhan_otp(
                    id, ma_giao_dich, ma_otp, otp_hash, otp_ciphertext,
                    thoi_diem_phat, thoi_diem_het_han, so_lan_thu_sai, so_lan_thu_toi_da,
                    da_dung, bi_vo_hieu, nguoi_cap_id
                ) VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?, FALSE, FALSE, ?)
                """,
                otpId,
                transactionId,
                otpHash,
                otpCiphertext,
                issuedAt,
                expiresAt,
                otpMaxAttempts,
                issuerId
        );
    }

    private String escalateIfOverdue24hInPlace(LockedTransaction tx, Instant current, Timestamp tsNow) {
        if (TransactionDtos.TransactionStatus.CHO_XAC_NHAN.name().equals(tx.status())
                && tx.reportedDeliveredAt() != null
                && !current.isBefore(tx.reportedDeliveredAt().plus(confirmEscalationHours, ChronoUnit.HOURS))) {
            db.update(
                    """
                    UPDATE giao_dichs
                    SET trang_thai = 'CHO_XU_LY',
                        ly_do_cho_xu_ly = COALESCE(ly_do_cho_xu_ly, 'OVERDUE_24H'),
                        thoi_diem_chuyen_xu_ly = COALESCE(thoi_diem_chuyen_xu_ly, ?),
                        updated_at = ?,
                        version = version + 1
                    WHERE ma_giao_dich = ?
                      AND trang_thai = 'CHO_XAC_NHAN'
                    """,
                    tsNow,
                    tsNow,
                    tx.id()
            );
            recordTimelineEvent(
                    tx.id(),
                    "AUTO_ESCALATED_OVERDUE_24H",
                    TransactionDtos.TransactionStatus.CHO_XAC_NHAN.name(),
                    TransactionDtos.TransactionStatus.CHO_XU_LY.name(),
                    null,
                    "SYSTEM",
                    "Quá 24 giờ chưa xác nhận, chuyển đội kiểm duyệt xem xét.",
                    tsNow
            );
            return TransactionDtos.TransactionStatus.CHO_XU_LY.name();
        }
        return tx.status();
    }

    private void recordTimelineEvent(
            UUID transactionId,
            String action,
            String fromStatus,
            String toStatus,
            UUID actorId,
            String actorRole,
            String note,
            Timestamp createdAt
    ) {
        db.update(
                """
                INSERT INTO lich_su_trang_thai_giao_dich(
                    id, ma_giao_dich, hanh_dong, trang_thai_truoc, trang_thai_sau,
                    nguoi_thuc_hien_id, vai_tro_thuc_hien, ghi_chu, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                UUID.randomUUID(),
                transactionId,
                action,
                fromStatus,
                toStatus,
                actorId,
                actorRole,
                note,
                createdAt
        );
    }

    private void wipeOtpCiphertextIfPresent(OtpRow otp) {
        if (otp != null && otp.otpCiphertext() != null) {
            db.update("UPDATE ma_xac_nhan_otp SET otp_ciphertext = NULL WHERE id = ?", otp.id());
        }
    }

    private boolean isOtpActive(OtpRow otp, Instant current) {
        return "ACTIVE".equals(computeOtpStatus(otp, current));
    }

    private static String computeOtpStatus(OtpRow otp, Instant current) {
        if (otp.used()) {
            return "USED";
        }
        if (otp.attemptsUsed() >= otp.maxAttempts() || "VUOT_SO_LAN_SAI".equals(otp.invalidationReason())) {
            return "EXHAUSTED";
        }
        if ("HET_HAN".equals(otp.invalidationReason())) {
            return "EXPIRED";
        }
        if (otp.invalidated()) {
            return "INVALIDATED";
        }
        if (!otp.expiresAt().isAfter(current)) {
            return "EXPIRED";
        }
        return "ACTIVE";
    }

    private TransactionLookup lookupTransactionOrThrow(UUID transactionId) {
        List<TransactionLookup> rows = db.query(
                "SELECT ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id FROM giao_dichs WHERE ma_giao_dich = ?",
                (rs, rowNum) -> new TransactionLookup(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getObject("nguoi_mua_id", UUID.class)
                ),
                transactionId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch.");
        }
        return rows.getFirst();
    }

    /**
     * Verifies account may read its own transactions (HOAT_DONG or BI_KHOA).
     * Returns {@code true} if the account is actively mutable (HOAT_DONG + verified + approved),
     * {@code false} if read-only (BI_KHOA).
     */
    private boolean requireReadableMemberAccount(UUID userId) {
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT trang_thai_tai_khoan, email_verified, profile_approved, loai_han_che, khoa_den_ngay
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
        if ("VO_HIEU_HOA".equals(status)) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Tài khoản đã bị vô hiệu hóa.");
        }
        if ("CHO_KICH_HOAT".equals(status)) {
            throw new AuthFailure(403, "FORBIDDEN", "Tài khoản chưa được kích hoạt để xem giao dịch.");
        }
        boolean verified = Boolean.TRUE.equals(row.get("email_verified"))
                && Boolean.TRUE.equals(row.get("profile_approved"));
        if ("HOAT_DONG".equals(status)) {
            return verified;
        }
        if ("BI_KHOA".equals(status)) {
            Timestamp lockedUntilTs = (Timestamp) row.get("khoa_den_ngay");
            boolean expiredTempLock = "KHOA_TAM_THOI".equals(row.get("loai_han_che"))
                    && lockedUntilTs != null
                    && !lockedUntilTs.toInstant().isAfter(now());
            return expiredTempLock && verified;
        }
        return false;
    }

    private void lockAndVerifyActiveMember(UUID userId) {
        List<Map<String, Object>> rows = lockMemberRowForNoKeyUpdate(userId);
        evaluateActiveMemberRow(rows);
    }

    private boolean lockPartiesCanonicalAndVerifyCaller(UUID callerId, UUID sellerId, UUID buyerId) {
        if (buyerId.toString().compareTo(sellerId.toString()) < 0) {
            List<Map<String, Object>> buyerRows = lockMemberRowForNoKeyUpdate(buyerId);
            if (callerId.equals(buyerId)) {
                evaluateActiveMemberRow(buyerRows);
            }
            List<Map<String, Object>> sellerRows = lockMemberRowForNoKeyUpdate(sellerId);
            if (callerId.equals(sellerId)) {
                evaluateActiveMemberRow(sellerRows);
                return true;
            }
            return isMemberRowActive(sellerRows);
        }
        List<Map<String, Object>> sellerRows = lockMemberRowForNoKeyUpdate(sellerId);
        boolean sellerActive;
        if (callerId.equals(sellerId)) {
            evaluateActiveMemberRow(sellerRows);
            sellerActive = true;
        } else {
            sellerActive = isMemberRowActive(sellerRows);
        }
        List<Map<String, Object>> buyerRows = lockMemberRowForNoKeyUpdate(buyerId);
        if (callerId.equals(buyerId)) {
            evaluateActiveMemberRow(buyerRows);
        }
        return sellerActive;
    }

    private List<Map<String, Object>> lockMemberRowForNoKeyUpdate(UUID userId) {
        reputationLedger.reconcileExpiredTemporaryLock(userId);
        return db.queryForList(
                """
                SELECT user_id, diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved,
                       khoa_den_ngay, loai_han_che, ly_do_han_che, cho_phep_khieu_nai
                FROM thanh_viens
                WHERE user_id = ?
                FOR NO KEY UPDATE
                """,
                userId
        );
    }

    private void evaluateActiveMemberRow(List<Map<String, Object>> rows) {
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

    private boolean isMemberRowActive(List<Map<String, Object>> rows) {
        if (rows.isEmpty()) {
            return false;
        }
        Map<String, Object> row = rows.getFirst();
        return "HOAT_DONG".equals(String.valueOf(row.get("trang_thai_tai_khoan")))
                && Boolean.TRUE.equals(row.get("email_verified"))
                && Boolean.TRUE.equals(row.get("profile_approved"));
    }

    private LockedListing lockListingForNoKeyUpdate(UUID listingId) {
        List<LockedListing> rows = db.query(
                """
                SELECT ma_tin, nguoi_dang_id, trang_thai, expires_at, version
                FROM tin_dangs
                WHERE ma_tin = ?
                FOR NO KEY UPDATE
                """,
                (rs, rowNum) -> new LockedListing(
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_dang_id", UUID.class),
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

    private LockedTransaction lockTransactionForNoKeyUpdate(UUID transactionId) {
        List<LockedTransaction> rows = db.query(
                """
                SELECT ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, trang_thai,
                       thoi_diem_bao_giao, ly_do_cho_xu_ly, version
                FROM giao_dichs
                WHERE ma_giao_dich = ?
                FOR NO KEY UPDATE
                """,
                (rs, rowNum) -> new LockedTransaction(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getObject("nguoi_mua_id", UUID.class),
                        rs.getString("trang_thai"),
                        toInstant(rs.getTimestamp("thoi_diem_bao_giao")),
                        rs.getString("ly_do_cho_xu_ly"),
                        rs.getLong("version")
                ),
                transactionId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch.");
        }
        return rows.getFirst();
    }

    private OtpRow lockLatestOtpForNoKeyUpdate(UUID transactionId) {
        List<OtpRow> rows = db.query(
                """
                SELECT id, ma_giao_dich, otp_hash, otp_ciphertext, thoi_diem_phat, thoi_diem_het_han,
                       so_lan_thu_sai, so_lan_thu_toi_da, da_dung, bi_vo_hieu, ly_do_vo_hieu
                FROM ma_xac_nhan_otp
                WHERE ma_giao_dich = ?
                ORDER BY (NOT da_dung AND NOT bi_vo_hieu) DESC, thoi_diem_phat DESC, id DESC
                LIMIT 1
                FOR NO KEY UPDATE
                """,
                this::mapOtpRow,
                transactionId
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private OtpRow findLatestOtpReadOnly(UUID transactionId) {
        List<OtpRow> rows = db.query(
                """
                SELECT id, ma_giao_dich, otp_hash, otp_ciphertext, thoi_diem_phat, thoi_diem_het_han,
                       so_lan_thu_sai, so_lan_thu_toi_da, da_dung, bi_vo_hieu, ly_do_vo_hieu
                FROM ma_xac_nhan_otp
                WHERE ma_giao_dich = ?
                ORDER BY (NOT da_dung AND NOT bi_vo_hieu) DESC, thoi_diem_phat DESC, id DESC
                LIMIT 1
                """,
                this::mapOtpRow,
                transactionId
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private CancelRequestRow lockLatestCancelRequestForNoKeyUpdate(UUID transactionId) {
        List<CancelRequestRow> rows = db.query(
                """
                SELECT id, ma_giao_dich, nguoi_yeu_cau_id, ma_ly_do, ly_do, trang_thai,
                       nguoi_phan_hoi_id, phan_hoi_ghi_chu, thoi_diem_phan_hoi, created_at
                FROM yeu_cau_huy_giao_dichs
                WHERE ma_giao_dich = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                FOR NO KEY UPDATE
                """,
                this::mapCancelRequestRow,
                transactionId
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private CancelRequestRow findLatestCancelRequestReadOnly(UUID transactionId) {
        List<CancelRequestRow> rows = db.query(
                """
                SELECT id, ma_giao_dich, nguoi_yeu_cau_id, ma_ly_do, ly_do, trang_thai,
                       nguoi_phan_hoi_id, phan_hoi_ghi_chu, thoi_diem_phan_hoi, created_at
                FROM yeu_cau_huy_giao_dichs
                WHERE ma_giao_dich = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                this::mapCancelRequestRow,
                transactionId
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private CancelRequestRow lockCancelRequestByIdForNoKeyUpdate(UUID transactionId, UUID requestId) {
        List<CancelRequestRow> rows = db.query(
                """
                SELECT id, ma_giao_dich, nguoi_yeu_cau_id, ma_ly_do, ly_do, trang_thai,
                       nguoi_phan_hoi_id, phan_hoi_ghi_chu, thoi_diem_phan_hoi, created_at
                FROM yeu_cau_huy_giao_dichs
                WHERE id = ? AND ma_giao_dich = ?
                FOR NO KEY UPDATE
                """,
                this::mapCancelRequestRow,
                requestId,
                transactionId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "CANCEL_REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu hủy giao dịch.");
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

    private List<LockedItem> lockItemsSortedForNoKeyUpdate(Collection<UUID> itemIds) {
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
                            FOR NO KEY UPDATE
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

    private boolean hasOtherActiveOrderHoldingItem(UUID itemId, UUID excludedTransactionId) {
        Integer count = db.queryForObject(
                """
                SELECT COUNT(*)
                FROM giao_dichs g
                JOIN tin_dang_do_vat tdv ON tdv.ma_tin = g.ma_tin
                WHERE tdv.ma_vat = ?
                  AND g.ma_giao_dich <> ?
                  AND g.trang_thai IN ('GIU_CHO', 'DANG_GIAO', 'CHO_XAC_NHAN', 'CHO_XU_LY')
                """,
                Integer.class,
                itemId,
                excludedTransactionId
        );
        return count != null && count > 0;
    }

    private int countOtherActiveOrdersForListing(UUID listingId, UUID excludedTransactionId) {
        Integer count = db.queryForObject(
                """
                SELECT COUNT(*)
                FROM giao_dichs
                WHERE ma_tin = ?
                  AND ma_giao_dich <> ?
                  AND trang_thai IN ('GIU_CHO', 'DANG_GIAO', 'CHO_XAC_NHAN', 'CHO_XU_LY')
                """,
                Integer.class,
                listingId,
                excludedTransactionId
        );
        return count != null ? count : 0;
    }

    private boolean areAllListingItemsAvailable(UUID listingId) {
        Integer totalItems = db.queryForObject(
                "SELECT COUNT(*) FROM tin_dang_do_vat WHERE ma_tin = ?",
                Integer.class,
                listingId
        );
        if (totalItems == null || totalItems == 0) {
            return false;
        }
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

    private List<TransactionDtos.TransactionItemDto> loadListingItems(UUID listingId) {
        return db.query(
                """
                SELECT d.ma_vat, d.ten, d.tinh_trang, d.trang_thai, d.hinh_anh
                FROM tin_dang_do_vat tdv
                JOIN do_vats d ON d.ma_vat = tdv.ma_vat
                WHERE tdv.ma_tin = ?
                ORDER BY d.created_at ASC, d.ma_vat ASC
                """,
                (rs, rowNum) -> {
                    List<String> imgs = extractTextArray(rs, "hinh_anh");
                    return new TransactionDtos.TransactionItemDto(
                            rs.getObject("ma_vat", UUID.class),
                            rs.getString("ten"),
                            rs.getString("tinh_trang"),
                            rs.getString("trang_thai"),
                            imgs.isEmpty() ? null : imgs.getFirst()
                    );
                },
                listingId
        );
    }

    private ProofRow mapProofRow(ResultSet rs, int rowNum) throws SQLException {
        return new ProofRow(
                rs.getObject("id", UUID.class),
                rs.getString("storage_key"),
                rs.getString("content_type"),
                rs.getLong("size_bytes"),
                toInstant(rs.getTimestamp("uploaded_at"))
        );
    }

    private OtpRow mapOtpRow(ResultSet rs, int rowNum) throws SQLException {
        return new OtpRow(
                rs.getObject("id", UUID.class),
                rs.getObject("ma_giao_dich", UUID.class),
                rs.getString("otp_hash"),
                rs.getString("otp_ciphertext"),
                toInstant(rs.getTimestamp("thoi_diem_phat")),
                toInstant(rs.getTimestamp("thoi_diem_het_han")),
                rs.getInt("so_lan_thu_sai"),
                rs.getInt("so_lan_thu_toi_da"),
                rs.getBoolean("da_dung"),
                rs.getBoolean("bi_vo_hieu"),
                rs.getString("ly_do_vo_hieu")
        );
    }

    private CancelRequestRow mapCancelRequestRow(ResultSet rs, int rowNum) throws SQLException {
        return new CancelRequestRow(
                rs.getObject("id", UUID.class),
                rs.getObject("ma_giao_dich", UUID.class),
                rs.getObject("nguoi_yeu_cau_id", UUID.class),
                rs.getString("ma_ly_do"),
                rs.getString("ly_do"),
                rs.getString("trang_thai"),
                rs.getObject("nguoi_phan_hoi_id", UUID.class),
                rs.getString("phan_hoi_ghi_chu"),
                toInstant(rs.getTimestamp("thoi_diem_phan_hoi")),
                toInstant(rs.getTimestamp("created_at"))
        );
    }

    private static String normalizeRoleFilter(String rawRole) {
        if (rawRole == null || rawRole.isBlank()) {
            return "ALL";
        }
        String normalized = rawRole.strip().toUpperCase(Locale.ROOT);
        if (!"ALL".equals(normalized) && !"SELLER".equals(normalized) && !"BUYER".equals(normalized)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Bộ lọc vai trò không hợp lệ.");
        }
        return normalized;
    }

    private static String normalizeStatusFilter(String rawStatus) {
        if (rawStatus == null || rawStatus.isBlank()) {
            return null;
        }
        String normalized = rawStatus.strip().toUpperCase(Locale.ROOT);
        if ("ALL".equals(normalized)) {
            return null;
        }
        if ("ACTION_REQUIRED".equals(normalized)) {
            return "ACTION_REQUIRED";
        }
        return TransactionDtos.TransactionStatus.fromString(normalized)
                .map(Enum::name)
                .orElseThrow(() -> new AuthFailure(400, "INVALID_INPUT", "Trạng thái giao dịch không hợp lệ."));
    }

    private static Instant toInstant(Timestamp ts) {
        return ts != null ? ts.toInstant() : null;
    }

    private static long ceilingSecondsRemaining(Instant from, Instant to) {
        if (from == null || to == null || !to.isAfter(from)) {
            return 0L;
        }
        Duration diff = Duration.between(from, to);
        return diff.getSeconds() + (diff.getNano() > 0 ? 1L : 0L);
    }

    private static String toContainsPattern(String raw) {
        String escaped = raw
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }

    private static long resolveTotalElementsFromCounts(
            TransactionDtos.TransactionStatusCountsDto counts,
            String statusFilter
    ) {
        if (statusFilter == null) {
            return counts.all();
        }
        return switch (statusFilter) {
            case "ACTION_REQUIRED" -> counts.actionRequired();
            case "YEU_CAU" -> counts.yeuCau();
            case "GIU_CHO" -> counts.giuCho();
            case "DANG_GIAO" -> counts.dangGiao();
            case "CHO_XAC_NHAN" -> counts.choXacNhan();
            case "CHO_XU_LY" -> counts.choXuLy();
            case "HOAN_TAT" -> counts.hoanTat();
            case "HUY" -> counts.huy();
            default -> counts.all();
        };
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

    private record TransactionLookup(UUID id, UUID listingId, UUID sellerId, UUID buyerId) {
    }

    private record LockedListing(UUID id, UUID sellerId, String status, Instant expiresAt, long version) {
    }

    private record LockedTransaction(
            UUID id,
            UUID listingId,
            UUID sellerId,
            UUID buyerId,
            String status,
            Instant reportedDeliveredAt,
            String escalationReason,
            long version
    ) {
    }

    private record LockedItem(UUID id, UUID ownerId, String status, long version) {
    }

    private record ProofRow(UUID id, String storageKey, String contentType, long sizeBytes, Instant uploadedAt) {
    }

    private record ValidatedProofPhoto(
            UUID id,
            String storageKey,
            String originalFilename,
            String contentType,
            long sizeBytes,
            String sha256,
            byte[] bytes
    ) {
    }

    private record OtpRow(
            UUID id,
            UUID orderId,
            String otpHash,
            String otpCiphertext,
            Instant issuedAt,
            Instant expiresAt,
            int attemptsUsed,
            int maxAttempts,
            boolean used,
            boolean invalidated,
            String invalidationReason
    ) {
    }

    private record CancelRequestRow(
            UUID id,
            UUID orderId,
            UUID requestedById,
            String reasonCode,
            String reasonNote,
            String status,
            UUID respondedById,
            String responseNote,
            Instant respondedAt,
            Instant createdAt
    ) {
    }

    private record DetailRow(
            UUID id,
            UUID listingId,
            String listingTitle,
            int listedPriceVnd,
            String listingType,
            String listingStatus,
            List<String> listingImages,
            UUID sellerId,
            String sellerName,
            int sellerScore,
            UUID buyerId,
            String buyerName,
            int buyerScore,
            int agreedPriceVnd,
            String status,
            Instant appointmentAt,
            String appointmentLocation,
            String deliveryNote,
            String escalationReason,
            Instant escalatedAt,
            Instant deliveryStartedAt,
            Instant deliveredAt,
            Instant completedAt,
            Instant cancelledAt,
            Instant updatedAt,
            long version
    ) {
    }
}
