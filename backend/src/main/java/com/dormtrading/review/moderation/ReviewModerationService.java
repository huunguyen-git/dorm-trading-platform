package com.dormtrading.review.moderation;

import com.dormtrading.catalog.media.MediaImageSanitizer;
import com.dormtrading.catalog.media.MediaMagicBytes;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.review.reputation.ReputationLedgerEntry;
import com.dormtrading.review.reputation.ReputationLedgerService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class ReviewModerationService {

    public static final Duration COMPLAINT_WINDOW = Duration.ofDays(7);
    public static final int MAX_DESCRIPTION_LENGTH = 2000;
    public static final int MAX_RATIONALE_LENGTH = 2000;
    public static final int MAX_CLIENT_REQUEST_ID_LENGTH = 100;
    public static final int MAX_CHAT_MESSAGES = 30;
    public static final int MAX_CHAT_OPTIONS_MESSAGES = 50;
    public static final long DEFAULT_MAX_EVIDENCE_SIZE_BYTES = 5L * 1024 * 1024;
    public static final int DEFAULT_MAX_EVIDENCE_PER_COMPLAINT = 5;
    public static final int DEFAULT_MAX_EVIDENCE_FILES_PER_USER = 50;
    public static final long DEFAULT_MAX_EVIDENCE_BYTES_PER_USER = 50L * 1024 * 1024;

    public static final String CASE_COMPLAINT = "COMPLAINT";
    public static final String CASE_LOW_STAR_REVIEW = "LOW_STAR_REVIEW";
    public static final String EVIDENCE_IMAGE = "HINH_ANH";
    public static final String EVIDENCE_CHAT_LOG = "NHAT_KY_CHAT";

    private static final List<ReviewModerationDtos.ComplaintReasonDto> COMPLAINT_REASONS = List.of(
            new ReviewModerationDtos.ComplaintReasonDto(
                    "SAI_SU_THAT",
                    "Nội dung đánh giá sai sự thật",
                    "Nhận xét không đúng với tình trạng đồ vật hoặc diễn biến bàn giao thực tế."
            ),
            new ReviewModerationDtos.ComplaintReasonDto(
                    "AC_Y_XUC_PHAM",
                    "Đánh giá ác ý / Ngôn từ xúc phạm",
                    "Nội dung mang tính công kích cá nhân, vu khống hoặc xúc phạm."
            ),
            new ReviewModerationDtos.ComplaintReasonDto(
                    "KHONG_LIEN_QUAN_GIAO_DICH",
                    "Không liên quan đến giao dịch",
                    "Nhận xét đề cập nội dung ngoài phạm vi giao dịch đã hoàn tất."
            ),
            new ReviewModerationDtos.ComplaintReasonDto(
                    "KHAC",
                    "Lý do khác",
                    "Lý do khiếu nại khác kèm mô tả hoặc bằng chứng cụ thể."
            )
    );

    private static final Map<String, ReviewModerationDtos.ComplaintReasonDto> REASON_BY_CODE = buildReasonMap();

    private final JdbcTemplate db;
    private final ReputationLedgerService reputationLedger;
    private final ReviewEvidenceStorage storage;
    private final ObjectMapper json;
    private final Clock clock;
    private final long maxEvidenceSizeBytes;
    private final int maxEvidencePerComplaint;
    private final int maxEvidenceFilesPerUser;
    private final long maxEvidenceBytesPerUser;

    @Autowired
    public ReviewModerationService(
            JdbcTemplate db,
            ReputationLedgerService reputationLedger,
            ReviewEvidenceStorage storage,
            ObjectMapper json,
            Clock clock,
            @Value("${app.reviews.max-evidence-size-bytes:5242880}") long maxEvidenceSizeBytes,
            @Value("${app.reviews.max-evidence-per-complaint:5}") int maxEvidencePerComplaint,
            @Value("${app.reviews.max-evidence-files-per-user:50}") int maxEvidenceFilesPerUser,
            @Value("${app.reviews.max-evidence-bytes-per-user:52428800}") long maxEvidenceBytesPerUser
    ) {
        this.db = db;
        this.reputationLedger = reputationLedger;
        this.storage = storage;
        this.json = json;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.maxEvidenceSizeBytes = maxEvidenceSizeBytes > 0 ? maxEvidenceSizeBytes : DEFAULT_MAX_EVIDENCE_SIZE_BYTES;
        this.maxEvidencePerComplaint = maxEvidencePerComplaint > 0 ? maxEvidencePerComplaint : DEFAULT_MAX_EVIDENCE_PER_COMPLAINT;
        this.maxEvidenceFilesPerUser = maxEvidenceFilesPerUser > 0 ? maxEvidenceFilesPerUser : DEFAULT_MAX_EVIDENCE_FILES_PER_USER;
        this.maxEvidenceBytesPerUser = maxEvidenceBytesPerUser > 0 ? maxEvidenceBytesPerUser : DEFAULT_MAX_EVIDENCE_BYTES_PER_USER;
    }

    private static Map<String, ReviewModerationDtos.ComplaintReasonDto> buildReasonMap() {
        Map<String, ReviewModerationDtos.ComplaintReasonDto> map = new LinkedHashMap<>();
        for (var r : COMPLAINT_REASONS) {
            map.put(r.code(), r);
        }
        return Map.copyOf(map);
    }

    /** FR-10 exact star -> reputation delta mapping: 5:+2, 4:0, 3:-1, 2:-3, 1:-5 */
    public static int reputationDeltaForStars(int stars) {
        return switch (stars) {
            case 5 -> 2;
            case 4 -> 0;
            case 3 -> -1;
            case 2 -> -3;
            case 1 -> -5;
            default -> throw new ReviewModerationFailure(400, "INVALID_INPUT", "Số sao đánh giá phải từ 1 đến 5.");
        };
    }

    private record ValidatedEvidenceUpload(
            UUID id,
            String storageKey,
            String originalFilename,
            String contentType,
            long sizeBytes,
            String sha256,
            byte[] bytes
    ) {}

    private record ResolvedChatSnapshot(UUID conversationId, String snapshotJson) {}

    private record ReviewerEligibility(boolean canDecide, String reason, boolean singleModeratorOverride) {}

    // =========================================================================
    // UC-33: SELLER COMPLAINT ENDPOINTS
    // =========================================================================

    @Transactional(readOnly = true)
    public ReviewModerationDtos.ComplaintReasonListResponse listComplaintReasons() {
        return new ReviewModerationDtos.ComplaintReasonListResponse(COMPLAINT_REASONS);
    }

    @Transactional(readOnly = true)
    public ReviewModerationDtos.SellerReceivedReviewsResponse listSellerReceivedReviews(Jwt jwt) {
        UUID sellerId = requireUserId(jwt);
        Instant now = now();

        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT d.ma_danh_gia, d.ma_giao_dich, d.nguoi_danh_gia_id, d.nguoi_bi_danh_gia_id,
                       d.so_sao, d.nhan_xet, d.trang_thai, d.thoi_diem_tao, d.thoi_diem_xet,
                       d.thoi_diem_cong_khai, d.diem_tac_dong, d.khoa_chinh_sua, d.version,
                       g.ma_tin, t.tieu_de AS listing_title, u.ho_ten AS buyer_name
                FROM danh_gias d
                JOIN giao_dichs g ON g.ma_giao_dich = d.ma_giao_dich
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                JOIN thanh_viens u ON u.user_id = d.nguoi_danh_gia_id
                WHERE d.nguoi_bi_danh_gia_id = ?
                  AND d.trang_thai IN ('CHAP_NHAN', 'DA_GO')
                ORDER BY COALESCE(d.thoi_diem_cong_khai, d.thoi_diem_xet, d.thoi_diem_tao) DESC, d.ma_danh_gia DESC
                """,
                sellerId
        );

        List<ReviewModerationDtos.SellerReceivedReviewDto> items = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            UUID reviewId = (UUID) row.get("ma_danh_gia");
            String status = String.valueOf(row.get("trang_thai"));
            Instant createdAt = toInstant(row.get("thoi_diem_tao"));
            Instant publishedAt = resolvePublishedAt(row);
            Instant deadline = publishedAt.plus(COMPLAINT_WINDOW);
            long remainingSeconds = Duration.between(now, deadline).getSeconds();
            int daysRemaining = remainingSeconds <= 0 ? 0 : (int) Math.ceil(remainingSeconds / 86400.0);

            ReviewModerationDtos.ComplaintSummaryDto complaint = findComplaintSummaryByReview(reviewId);
            boolean canComplain = "CHAP_NHAN".equals(status) && !now.isAfter(deadline) && complaint == null;

            List<ReviewModerationDtos.SupplementalRequestDto> pendingRequests = loadPendingSupplementalForUser(
                    sellerId, reviewId, complaint != null ? complaint.id() : null
            );

            Object deltaObj = row.get("diem_tac_dong");
            Integer appliedDelta = deltaObj == null ? null : ((Number) deltaObj).intValue();

            items.add(new ReviewModerationDtos.SellerReceivedReviewDto(
                    reviewId,
                    (UUID) row.get("ma_giao_dich"),
                    (UUID) row.get("ma_tin"),
                    String.valueOf(row.get("listing_title")),
                    (UUID) row.get("nguoi_danh_gia_id"),
                    String.valueOf(row.get("buyer_name")),
                    ((Number) row.get("so_sao")).intValue(),
                    (String) row.get("nhan_xet"),
                    status,
                    ((Number) row.get("version")).longValue(),
                    Boolean.TRUE.equals(row.get("khoa_chinh_sua")),
                    appliedDelta,
                    createdAt,
                    publishedAt,
                    deadline,
                    daysRemaining,
                    canComplain,
                    complaint,
                    pendingRequests
            ));
        }

        return new ReviewModerationDtos.SellerReceivedReviewsResponse(List.copyOf(items));
    }

    @Transactional(readOnly = true)
    public ReviewModerationDtos.ReviewNotificationsResponse listMyNotifications(Jwt jwt) {
        UUID userId = requireUserId(jwt);
        List<ReviewModerationDtos.ReviewNotificationDto> items = db.query(
                """
                SELECT id, loai, ma_danh_gia, ma_khieu_nai, tieu_de, noi_dung, da_doc, thoi_diem_tao
                FROM thong_bao_danh_gias
                WHERE user_id = ?
                ORDER BY thoi_diem_tao DESC, id DESC
                LIMIT 50
                """,
                (rs, n) -> new ReviewModerationDtos.ReviewNotificationDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("loai"),
                        rs.getObject("ma_danh_gia", UUID.class),
                        rs.getObject("ma_khieu_nai", UUID.class),
                        rs.getString("tieu_de"),
                        rs.getString("noi_dung"),
                        rs.getBoolean("da_doc"),
                        rs.getTimestamp("thoi_diem_tao").toInstant()
                ),
                userId
        );
        return new ReviewModerationDtos.ReviewNotificationsResponse(List.copyOf(items));
    }

    public ReviewModerationDtos.EvidenceUploadResponse uploadEvidence(Jwt jwt, List<MultipartFile> files) {
        UUID uploaderId = requireUserId(jwt);
        if (files == null || files.isEmpty()) {
            throw new ReviewModerationFailure(400, "INVALID_MEDIA",
                    "Vui lòng chọn từ 1 đến " + maxEvidencePerComplaint + " ảnh bằng chứng.");
        }
        if (files.size() > maxEvidencePerComplaint) {
            throw new ReviewModerationFailure(400, "INVALID_MEDIA",
                    "Chỉ được tải lên tối đa " + maxEvidencePerComplaint + " ảnh bằng chứng mỗi lần.");
        }

        Instant createdAt = now();
        ZonedDateTime utcTime = createdAt.atZone(ZoneOffset.UTC);

        List<ValidatedEvidenceUpload> validated = new ArrayList<>(files.size());
        long batchBytes = 0L;
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                throw new ReviewModerationFailure(400, "INVALID_MEDIA", "Tệp bằng chứng trống hoặc không hợp lệ.");
            }
            if (file.getSize() > maxEvidenceSizeBytes) {
                throw new ReviewModerationFailure(413, "FILE_TOO_LARGE",
                        "Kích thước mỗi tệp bằng chứng không được vượt quá 5MB.");
            }
            byte[] rawBytes;
            try {
                rawBytes = file.getBytes();
            } catch (IOException e) {
                throw new ReviewModerationFailure(400, "INVALID_MEDIA", "Không thể đọc dữ liệu tệp bằng chứng.");
            }
            if (rawBytes.length == 0) {
                throw new ReviewModerationFailure(400, "INVALID_MEDIA", "Tệp bằng chứng trống hoặc không hợp lệ.");
            }
            if (rawBytes.length > maxEvidenceSizeBytes) {
                throw new ReviewModerationFailure(413, "FILE_TOO_LARGE",
                        "Kích thước mỗi tệp bằng chứng không được vượt quá 5MB.");
            }

            MediaMagicBytes.DetectedImageType detected = MediaMagicBytes.detect(rawBytes)
                    .orElseThrow(() -> new ReviewModerationFailure(
                            400,
                            "INVALID_MEDIA",
                            "Tệp bằng chứng sai định dạng. Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP."
                    ));

            byte[] sanitizedBytes;
            try {
                sanitizedBytes = MediaImageSanitizer.sanitize(rawBytes, detected, maxEvidenceSizeBytes);
            } catch (AuthFailure e) {
                throw new ReviewModerationFailure(e.status, e.code, e.getMessage());
            }
            batchBytes += sanitizedBytes.length;

            UUID evidenceId = UUID.randomUUID();
            String storageKey = String.format(
                    "%04d/%02d/%s.%s",
                    utcTime.getYear(),
                    utcTime.getMonthValue(),
                    evidenceId,
                    detected.extension()
            );

            validated.add(new ValidatedEvidenceUpload(
                    evidenceId,
                    storageKey,
                    MediaMagicBytes.sanitizeFilename(file.getOriginalFilename()),
                    detected.contentType(),
                    sanitizedBytes.length,
                    MediaMagicBytes.sha256Hex(sanitizedBytes),
                    sanitizedBytes
            ));
        }

        lockAndVerifyEvidenceQuota(uploaderId, validated.size(), batchBytes);

        List<String> storedKeys = new ArrayList<>(validated.size());
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        for (String key : storedKeys) {
                            storage.deleteQuietly(key);
                        }
                    }
                }
            });
        }

        List<ReviewModerationDtos.UploadedReviewEvidenceDto> result = new ArrayList<>(validated.size());
        try {
            Timestamp createdTs = Timestamp.from(createdAt);
            for (ValidatedEvidenceUpload item : validated) {
                storage.store(item.storageKey(), item.bytes());
                storedKeys.add(item.storageKey());

                db.update(
                        """
                        INSERT INTO danh_gia_bang_chungs(
                            id, ma_khieu_nai, ma_danh_gia, uploader_id, nguon_bang_chung,
                            loai_bang_chung, storage_key, original_filename, content_type,
                            size_bytes, sha256, created_at
                        ) VALUES (?, NULL, NULL, ?, 'KHIEU_NAI_NGUOI_BAN', 'HINH_ANH', ?, ?, ?, ?, ?, ?)
                        """,
                        item.id(),
                        uploaderId,
                        item.storageKey(),
                        item.originalFilename(),
                        item.contentType(),
                        item.sizeBytes(),
                        item.sha256(),
                        createdTs
                );

                result.add(new ReviewModerationDtos.UploadedReviewEvidenceDto(
                        item.id(),
                        item.originalFilename(),
                        item.contentType(),
                        item.sizeBytes()
                ));
            }
        } catch (RuntimeException e) {
            for (String key : storedKeys) {
                storage.deleteQuietly(key);
            }
            throw e;
        }

        return new ReviewModerationDtos.EvidenceUploadResponse(List.copyOf(result));
    }

    @Transactional(readOnly = true)
    public ReviewModerationDtos.ChatEvidenceOptionsResponse listChatEvidenceOptionsForReview(Jwt jwt, UUID reviewId) {
        UUID sellerId = requireUserId(jwt);
        if (reviewId == null) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Thiếu mã đánh giá.");
        }

        List<Map<String, Object>> reviewRows = db.queryForList(
                """
                SELECT d.nguoi_danh_gia_id, d.nguoi_bi_danh_gia_id, g.ma_tin
                FROM danh_gias d
                JOIN giao_dichs g ON g.ma_giao_dich = d.ma_giao_dich
                WHERE d.ma_danh_gia = ?
                """,
                reviewId
        );
        if (reviewRows.isEmpty()) {
            throw new ReviewModerationFailure(404, "REVIEW_NOT_FOUND", "Không tìm thấy đánh giá.");
        }
        Map<String, Object> review = reviewRows.getFirst();
        if (!sellerId.equals(review.get("nguoi_bi_danh_gia_id"))) {
            throw new ReviewModerationFailure(403, "FORBIDDEN", "Chỉ người bán bị đánh giá mới có quyền khiếu nại đánh giá này.");
        }
        UUID buyerId = (UUID) review.get("nguoi_danh_gia_id");

        List<Map<String, Object>> convRows = db.queryForList(
                """
                SELECT h.ma_hoi_thoai, h.ma_tin, t.tieu_de AS listing_title,
                       u.user_id AS counterparty_id, u.ho_ten AS counterparty_name
                FROM hoi_thoais h
                LEFT JOIN tin_dangs t ON t.ma_tin = h.ma_tin
                JOIN thanh_viens u ON u.user_id = ?
                WHERE (h.nguoi_mua_id = ? AND h.nguoi_ban_id = ?)
                   OR (h.nguoi_ban_id = ? AND h.nguoi_mua_id = ?)
                ORDER BY CASE WHEN h.ma_tin = ? THEN 0 ELSE 1 END, h.thoi_diem_tao DESC
                LIMIT 10
                """,
                buyerId, buyerId, sellerId, buyerId, sellerId, review.get("ma_tin")
        );

        List<ReviewModerationDtos.ChatConversationOptionDto> result = new ArrayList<>(convRows.size());
        for (Map<String, Object> row : convRows) {
            UUID convId = (UUID) row.get("ma_hoi_thoai");
            List<ReviewModerationDtos.ChatMessageOptionDto> newest = db.query(
                    """
                    SELECT m.ma_tin_nhan, m.nguoi_gui_id, u.ho_ten AS sender_name,
                           m.noi_dung, m.gia_de_nghi, m.thoi_diem_gui
                    FROM tin_nhans m
                    JOIN thanh_viens u ON u.user_id = m.nguoi_gui_id
                    WHERE m.ma_hoi_thoai = ?
                    ORDER BY m.thoi_diem_gui DESC, m.ma_tin_nhan DESC
                    LIMIT ?
                    """,
                    (rs, n) -> {
                        Object priceObj = rs.getObject("gia_de_nghi");
                        Integer price = priceObj == null ? null : ((Number) priceObj).intValue();
                        return new ReviewModerationDtos.ChatMessageOptionDto(
                                rs.getObject("ma_tin_nhan", UUID.class),
                                rs.getObject("nguoi_gui_id", UUID.class),
                                rs.getString("sender_name"),
                                rs.getString("noi_dung"),
                                price,
                                rs.getTimestamp("thoi_diem_gui").toInstant()
                        );
                    },
                    convId,
                    MAX_CHAT_OPTIONS_MESSAGES
            );
            List<ReviewModerationDtos.ChatMessageOptionDto> chronological = new ArrayList<>(newest);
            chronological.sort(Comparator.comparing(ReviewModerationDtos.ChatMessageOptionDto::sentAt)
                    .thenComparing(ReviewModerationDtos.ChatMessageOptionDto::id));
            if (chronological.isEmpty()) {
                continue;
            }
            result.add(new ReviewModerationDtos.ChatConversationOptionDto(
                    convId,
                    (UUID) row.get("ma_tin"),
                    (String) row.get("listing_title"),
                    (UUID) row.get("counterparty_id"),
                    String.valueOf(row.get("counterparty_name")),
                    List.copyOf(chronological)
            ));
        }

        return new ReviewModerationDtos.ChatEvidenceOptionsResponse(List.copyOf(result));
    }

    /**
     * UC-33: Seller submits complaint against an accepted review within 7 days.
     */
    public ReviewModerationDtos.ComplaintSummaryDto submitComplaint(Jwt jwt, ReviewModerationDtos.CreateComplaintRequest input) {
        UUID sellerId = requireUserId(jwt);
        if (input == null || input.reviewId() == null) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Thiếu thông tin đánh giá cần khiếu nại.");
        }

        String reasonCode = normalizeReasonCode(input.reasonCode());
        if (reasonCode == null) {
            throw new ReviewModerationFailure(400, "MISSING_REASON", "Vui lòng chọn lý do khiếu nại.");
        }
        ReviewModerationDtos.ComplaintReasonDto reason = REASON_BY_CODE.get(reasonCode);
        if (reason == null) {
            throw new ReviewModerationFailure(400, "INVALID_REASON", "Lý do khiếu nại không hợp lệ.");
        }

        String description = normalizeText(input.description(), MAX_DESCRIPTION_LENGTH, "DESCRIPTION_TOO_LONG",
                "Mô tả khiếu nại không được vượt quá " + MAX_DESCRIPTION_LENGTH + " ký tự.");
        String clientRequestId = normalizeClientRequestId(input.clientRequestId());

        List<UUID> evidenceIds = deduplicateIds(input.evidenceIds());
        if (evidenceIds.size() > maxEvidencePerComplaint) {
            throw new ReviewModerationFailure(400, "TOO_MANY_EVIDENCE",
                    "Chỉ được đính kèm tối đa " + maxEvidencePerComplaint + " ảnh bằng chứng cho mỗi khiếu nại.");
        }

        List<UUID> chatMessageIds = deduplicateIds(input.chatMessageIds());
        if (!chatMessageIds.isEmpty() && input.chatConversationId() == null) {
            throw new ReviewModerationFailure(400, "INVALID_CHAT_EVIDENCE",
                    "Thiếu mã cuộc hội thoại khi đính kèm tin nhắn làm bằng chứng.");
        }
        if (chatMessageIds.size() > MAX_CHAT_MESSAGES) {
            throw new ReviewModerationFailure(400, "INVALID_CHAT_EVIDENCE",
                    "Chỉ được chọn tối đa " + MAX_CHAT_MESSAGES + " tin nhắn trong nhật ký chat.");
        }

        boolean wantsChatLog = input.chatConversationId() != null
                && (Boolean.TRUE.equals(input.attachChatLog()) || !chatMessageIds.isEmpty());

        if (description.isEmpty() && evidenceIds.isEmpty() && !wantsChatLog) {
            throw new ReviewModerationFailure(400, "MISSING_CONTENT_OR_EVIDENCE",
                    "Vui lòng nhập mô tả khiếu nại hoặc đính kèm ít nhất một bằng chứng.");
        }

        // Deterministic advisory locks: review first, then clientRequestId
        advisoryLock("review:complaint:" + input.reviewId());
        if (clientRequestId != null) {
            advisoryLock("review:complaint:req:" + sellerId + ":" + clientRequestId);
        }

        ensureMemberActive(sellerId);

        // Idempotent replay check (UC-33 §4, NFR-03)
        if (clientRequestId != null) {
            ReviewModerationDtos.ComplaintSummaryDto replay = findComplaintReplay(sellerId, clientRequestId, input.reviewId());
            if (replay != null) {
                return replay;
            }
        }

        // Lock review row
        List<Map<String, Object>> reviewRows = db.queryForList(
                "SELECT * FROM danh_gias WHERE ma_danh_gia = ? FOR UPDATE",
                input.reviewId()
        );
        if (reviewRows.isEmpty()) {
            throw new ReviewModerationFailure(404, "REVIEW_NOT_FOUND", "Không tìm thấy đánh giá cần khiếu nại.");
        }
        Map<String, Object> review = reviewRows.getFirst();
        UUID reviewedSellerId = (UUID) review.get("nguoi_bi_danh_gia_id");
        UUID buyerId = (UUID) review.get("nguoi_danh_gia_id");
        if (!sellerId.equals(reviewedSellerId)) {
            throw new ReviewModerationFailure(403, "FORBIDDEN",
                    "Chỉ người bán bị đánh giá mới có quyền khiếu nại đánh giá này.");
        }

        String reviewStatus = String.valueOf(review.get("trang_thai"));
        long currentVersion = ((Number) review.get("version")).longValue();

        // Check if buyer edited or deleted the review while seller was drafting complaint (UC-33 §3.3)
        if ("DA_XOA".equals(reviewStatus)
                || (input.expectedReviewVersion() != null && !input.expectedReviewVersion().equals(currentVersion))) {
            throw new ReviewModerationFailure(409, "REVIEW_CHANGED",
                    "Đánh giá đã bị người mua chỉnh sửa hoặc xóa. Vui lòng tải lại phiên bản hiện tại.");
        }
        if (!"CHAP_NHAN".equals(reviewStatus)) {
            throw new ReviewModerationFailure(409, "REVIEW_NOT_COMPLAINABLE",
                    "Chỉ có thể khiếu nại đánh giá đang ở trạng thái Đã chấp nhận.");
        }

        // Duplicate / prior complaint check (UC-33 §2, §3.2, §3.3)
        ReviewModerationDtos.ComplaintSummaryDto existingComplaint = findComplaintSummaryByReview(input.reviewId());
        if (existingComplaint != null) {
            String stateDesc = switch (existingComplaint.status()) {
                case "CHO_XU_LY" -> "đang chờ xử lý";
                case "DA_RUT" -> "đã được rút trước đó và không thể gửi lại";
                default -> "đã được giải quyết";
            };
            throw new ReviewModerationFailure(409, "COMPLAINT_ALREADY_EXISTS",
                    "Đánh giá này đã có khiếu nại (" + stateDesc + ").");
        }

        // 7-day complaint window check (UC-33 §2 & §3.3)
        Instant now = now();
        Instant publishedAt = resolvePublishedAt(review);
        if (now.isAfter(publishedAt.plus(COMPLAINT_WINDOW))) {
            throw new ReviewModerationFailure(409, "COMPLAINT_WINDOW_EXPIRED",
                    "Đã hết thời hạn 7 ngày để khiếu nại đánh giá này.");
        }

        // Validate uploaded image evidences
        validatePendingImageEvidences(sellerId, evidenceIds);

        // Validate & snapshot chat log if requested
        ResolvedChatSnapshot chatSnapshot = wantsChatLog
                ? buildValidatedChatSnapshot(sellerId, buyerId, input.chatConversationId(), chatMessageIds, now)
                : null;

        if (description.isEmpty() && evidenceIds.isEmpty() && chatSnapshot == null) {
            throw new ReviewModerationFailure(400, "MISSING_CONTENT_OR_EVIDENCE",
                    "Vui lòng nhập mô tả khiếu nại hoặc đính kèm ít nhất một bằng chứng.");
        }

        // Build immutable review version snapshot (UC-33 §4)
        String snapshotJson = buildReviewSnapshotJson(review, publishedAt);

        UUID complaintId = UUID.randomUUID();
        UUID chatEvidenceId = chatSnapshot != null ? UUID.randomUUID() : null;
        List<String> evidenceRefs = new ArrayList<>(evidenceIds.size() + (chatEvidenceId != null ? 1 : 0));
        for (UUID eid : evidenceIds) {
            evidenceRefs.add("evidence:" + eid);
        }
        if (chatEvidenceId != null) {
            evidenceRefs.add("chat-log:" + chatEvidenceId);
        }
        Timestamp nowTs = Timestamp.from(now);

        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                    INSERT INTO khieu_nais(
                        ma_khieu_nai, ma_danh_gia, nguoi_khieu_nai_id, ly_do, bang_chung,
                        trang_thai, thoi_diem_tao, ma_ly_do, mo_ta, phien_ban_danh_gia,
                        noi_dung_danh_gia_snapshot, client_request_id, version
                    ) VALUES (?, ?, ?, ?, ?, 'CHO_XU_LY', ?, ?, ?, ?, CAST(? AS JSONB), ?, 0)
                    """
            );
            ps.setObject(1, complaintId);
            ps.setObject(2, input.reviewId());
            ps.setObject(3, sellerId);
            ps.setString(4, reason.label());
            ps.setArray(5, con.createArrayOf("text", evidenceRefs.toArray(new String[0])));
            ps.setTimestamp(6, nowTs);
            ps.setString(7, reasonCode);
            ps.setString(8, description);
            ps.setLong(9, currentVersion);
            ps.setString(10, snapshotJson);
            ps.setString(11, clientRequestId);
            return ps;
        });

        // Lock buyer edit/delete while complaint is pending; review remains public & reputation unchanged (UC-33 §2)
        db.update("UPDATE danh_gias SET khoa_chinh_sua = TRUE WHERE ma_danh_gia = ?", input.reviewId());

        // Attach uploaded image evidences
        for (UUID eid : evidenceIds) {
            int updated = db.update(
                    """
                    UPDATE danh_gia_bang_chungs
                    SET ma_khieu_nai = ?, ma_danh_gia = ?
                    WHERE id = ? AND uploader_id = ? AND ma_khieu_nai IS NULL AND loai_bang_chung = 'HINH_ANH'
                    """,
                    complaintId,
                    input.reviewId(),
                    eid,
                    sellerId
            );
            if (updated != 1) {
                throw new ReviewModerationFailure(400, "INVALID_EVIDENCE",
                        "Tệp bằng chứng không hợp lệ hoặc đã được sử dụng.");
            }
        }

        // Persist immutable chat log snapshot
        if (chatSnapshot != null && chatEvidenceId != null) {
            db.update(
                    """
                    INSERT INTO danh_gia_bang_chungs(
                        id, ma_khieu_nai, ma_danh_gia, uploader_id, nguon_bang_chung,
                        loai_bang_chung, ma_hoi_thoai, chat_log_snapshot, created_at
                    ) VALUES (?, ?, ?, ?, 'KHIEU_NAI_NGUOI_BAN', 'NHAT_KY_CHAT', ?, CAST(? AS JSONB), ?)
                    """,
                    chatEvidenceId,
                    complaintId,
                    input.reviewId(),
                    sellerId,
                    chatSnapshot.conversationId(),
                    chatSnapshot.snapshotJson(),
                    nowTs
            );
        }

        return new ReviewModerationDtos.ComplaintSummaryDto(
                complaintId,
                input.reviewId(),
                currentVersion,
                reasonCode,
                reason.label(),
                description,
                "CHO_XU_LY",
                null,
                null,
                evidenceIds.size(),
                chatSnapshot != null,
                null,
                now,
                null,
                null,
                false
        );
    }

    /**
     * UC-33 §3.2: Seller withdraws a pending complaint.
     * Unlocks buyer edit/delete and permanently prevents filing another complaint for the same review.
     */
    public ReviewModerationDtos.ComplaintSummaryDto withdrawComplaint(Jwt jwt, UUID complaintId) {
        UUID sellerId = requireUserId(jwt);
        if (complaintId == null) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Thiếu mã khiếu nại.");
        }

        List<Map<String, Object>> rows = db.queryForList(
                "SELECT * FROM khieu_nais WHERE ma_khieu_nai = ? FOR UPDATE",
                complaintId
        );
        if (rows.isEmpty()) {
            throw new ReviewModerationFailure(404, "COMPLAINT_NOT_FOUND", "Không tìm thấy khiếu nại.");
        }
        Map<String, Object> complaint = rows.getFirst();
        if (!sellerId.equals(complaint.get("nguoi_khieu_nai_id"))) {
            throw new ReviewModerationFailure(403, "FORBIDDEN", "Bạn không có quyền rút khiếu nại này.");
        }
        if (!"CHO_XU_LY".equals(complaint.get("trang_thai"))) {
            throw new ReviewModerationFailure(409, "COMPLAINT_NOT_WITHDRAWABLE",
                    "Chỉ có thể rút khiếu nại đang ở trạng thái Chờ xử lý.");
        }

        UUID reviewId = (UUID) complaint.get("ma_danh_gia");
        Instant now = now();
        Timestamp nowTs = Timestamp.from(now);

        db.update(
                """
                UPDATE khieu_nais
                SET trang_thai = 'DA_RUT', thoi_diem_rut = ?, version = version + 1
                WHERE ma_khieu_nai = ?
                """,
                nowTs,
                complaintId
        );
        db.update("UPDATE danh_gias SET khoa_chinh_sua = FALSE WHERE ma_danh_gia = ?", reviewId);

        return findComplaintSummaryById(complaintId, false);
    }

    /**
     * UC-34 §3.2: Seller or buyer responds to a moderator's supplemental evidence request.
     */
    public ReviewModerationDtos.SupplementalRequestDto respondToSupplementalRequest(
            Jwt jwt,
            UUID requestId,
            ReviewModerationDtos.RespondSupplementalRequest input
    ) {
        UUID userId = requireUserId(jwt);
        if (requestId == null || input == null) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Thiếu nội dung phản hồi bổ sung.");
        }
        String note = normalizeText(input.responseNote(), MAX_DESCRIPTION_LENGTH, "DESCRIPTION_TOO_LONG",
                "Nội dung bổ sung không được vượt quá " + MAX_DESCRIPTION_LENGTH + " ký tự.");
        List<UUID> evidenceIds = deduplicateIds(input.evidenceIds());
        if (evidenceIds.size() > maxEvidencePerComplaint) {
            throw new ReviewModerationFailure(400, "TOO_MANY_EVIDENCE",
                    "Chỉ được đính kèm tối đa " + maxEvidencePerComplaint + " ảnh bổ sung.");
        }
        if (note.isEmpty() && evidenceIds.isEmpty()) {
            throw new ReviewModerationFailure(400, "MISSING_CONTENT_OR_EVIDENCE",
                    "Vui lòng nhập phản hồi hoặc đính kèm ít nhất một ảnh bổ sung.");
        }

        List<Map<String, Object>> reqRows = db.queryForList(
                "SELECT * FROM yeu_cau_bo_sung_danh_gia WHERE id = ? FOR UPDATE",
                requestId
        );
        if (reqRows.isEmpty()) {
            throw new ReviewModerationFailure(404, "REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu bổ sung.");
        }
        Map<String, Object> req = reqRows.getFirst();
        if (!userId.equals(req.get("doi_tuong_nhan_id"))) {
            throw new ReviewModerationFailure(403, "FORBIDDEN", "Bạn không phải người được yêu cầu bổ sung.");
        }
        if (!"CHO_PHAN_HOI".equals(req.get("trang_thai"))) {
            throw new ReviewModerationFailure(409, "ALREADY_RESPONDED", "Yêu cầu bổ sung này đã được phản hồi.");
        }

        validatePendingImageEvidences(userId, evidenceIds);

        String caseType = String.valueOf(req.get("loai_ho_so"));
        UUID caseId = (UUID) req.get("ho_so_id");
        UUID complaintId = "KHIEU_NAI".equals(caseType) ? caseId : null;
        UUID reviewId;
        if (complaintId != null) {
            reviewId = db.queryForObject("SELECT ma_danh_gia FROM khieu_nais WHERE ma_khieu_nai = ?", UUID.class, complaintId);
        } else {
            reviewId = caseId;
        }

        for (UUID eid : evidenceIds) {
            int updated = db.update(
                    """
                    UPDATE danh_gia_bang_chungs
                    SET ma_khieu_nai = ?, ma_danh_gia = ?, nguon_bang_chung = 'BO_SUNG'
                    WHERE id = ? AND uploader_id = ? AND ma_khieu_nai IS NULL AND ma_danh_gia IS NULL AND loai_bang_chung = 'HINH_ANH'
                    """,
                    complaintId,
                    reviewId,
                    eid,
                    userId
            );
            if (updated != 1) {
                throw new ReviewModerationFailure(400, "INVALID_EVIDENCE",
                        "Tệp bằng chứng bổ sung không hợp lệ hoặc đã được sử dụng.");
            }
        }

        Instant now = now();
        Timestamp nowTs = Timestamp.from(now);
        db.update(
                """
                UPDATE yeu_cau_bo_sung_danh_gia
                SET phan_hoi = ?, trang_thai = 'DA_PHAN_HOI', thoi_diem_phan_hoi = ?
                WHERE id = ?
                """,
                note,
                nowTs,
                requestId
        );

        if ("KHIEU_NAI".equals(caseType)) {
            db.update("UPDATE khieu_nais SET yeu_cau_bo_sung_trang_thai = 'DA_BO_SUNG' WHERE ma_khieu_nai = ?", caseId);
        } else {
            db.update("UPDATE danh_gias SET yeu_cau_bo_sung_trang_thai = 'DA_BO_SUNG' WHERE ma_danh_gia = ?", caseId);
        }

        return new ReviewModerationDtos.SupplementalRequestDto(
                requestId,
                caseType,
                caseId,
                userId,
                String.valueOf(req.get("vai_tro_nhan")),
                String.valueOf(req.get("noi_dung_yeu_cau")),
                note,
                "DA_PHAN_HOI",
                toInstant(req.get("thoi_diem_tao")),
                now
        );
    }

    // =========================================================================
    // UC-34: MODERATOR REVIEW & COMPLAINT MODERATION ENDPOINTS
    // =========================================================================

    @Transactional(readOnly = true)
    public ReviewModerationDtos.Page<ReviewModerationDtos.ModerationQueueItemDto> listModerationQueue(
            Jwt actor,
            boolean isSeniorAdmin,
            String rawType,
            String rawStatus,
            int page,
            int size
    ) {
        UUID actorId = requireUserId(actor);
        validatePageBounds(page, size);

        String typeFilter = normalizeQueueType(rawType);
        String statusFilter = normalizeQueueStatus(rawStatus);

        List<ReviewModerationDtos.ModerationQueueItemDto> combined = new ArrayList<>();

        if ("ALL".equals(typeFilter) || CASE_COMPLAINT.equals(typeFilter)) {
            String statusCondition = "PROCESSED".equals(statusFilter)
                    ? "k.trang_thai IN ('DA_XU_LY', 'DA_RUT')"
                    : "k.trang_thai = 'CHO_XU_LY'";
            String conflictCondition = isSeniorAdmin
                    ? ""
                    : " AND d.nguoi_danh_gia_id <> ? AND d.nguoi_bi_danh_gia_id <> ?";
            List<Object> args = isSeniorAdmin ? List.of() : List.of(actorId, actorId);

            List<Map<String, Object>> complaintRows = db.queryForList(
                    """
                    SELECT k.ma_khieu_nai, k.ma_danh_gia, k.trang_thai AS complaint_status,
                           k.ly_do, k.ket_luan, k.thoi_diem_tao AS submitted_at, k.thoi_diem_xu_ly,
                           k.yeu_cau_bo_sung_trang_thai,
                           d.ma_giao_dich, d.nguoi_danh_gia_id, d.nguoi_bi_danh_gia_id,
                           d.so_sao, d.trang_thai AS review_status, d.nguoi_xet_id,
                           t.tieu_de AS listing_title,
                           ub.ho_ten AS buyer_name, us.ho_ten AS seller_name
                    FROM khieu_nais k
                    JOIN danh_gias d ON d.ma_danh_gia = k.ma_danh_gia
                    JOIN giao_dichs g ON g.ma_giao_dich = d.ma_giao_dich
                    JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                    JOIN thanh_viens ub ON ub.user_id = d.nguoi_danh_gia_id
                    JOIN thanh_viens us ON us.user_id = d.nguoi_bi_danh_gia_id
                    WHERE """ + statusCondition + conflictCondition,
                    args.toArray()
            );

            for (Map<String, Object> r : complaintRows) {
                UUID priorReviewer = (UUID) r.get("nguoi_xet_id");
                combined.add(new ReviewModerationDtos.ModerationQueueItemDto(
                        CASE_COMPLAINT,
                        (UUID) r.get("ma_khieu_nai"),
                        (UUID) r.get("ma_danh_gia"),
                        (UUID) r.get("ma_giao_dich"),
                        String.valueOf(r.get("listing_title")),
                        (UUID) r.get("nguoi_danh_gia_id"),
                        String.valueOf(r.get("buyer_name")),
                        (UUID) r.get("nguoi_bi_danh_gia_id"),
                        String.valueOf(r.get("seller_name")),
                        ((Number) r.get("so_sao")).intValue(),
                        String.valueOf(r.get("review_status")),
                        String.valueOf(r.get("complaint_status")),
                        String.valueOf(r.get("ly_do")),
                        (String) r.get("yeu_cau_bo_sung_trang_thai"),
                        toInstant(r.get("submitted_at")),
                        toInstant(r.get("thoi_diem_xu_ly")),
                        (String) r.get("ket_luan"),
                        actorId.equals(priorReviewer)
                ));
            }
        }

        if ("ALL".equals(typeFilter) || CASE_LOW_STAR_REVIEW.equals(typeFilter)) {
            String statusCondition = "PROCESSED".equals(statusFilter)
                    ? "d.so_sao <= 3 AND d.trang_thai IN ('CHAP_NHAN', 'BI_BAC', 'DA_GO') AND d.thoi_diem_xet IS NOT NULL"
                    : "d.trang_thai = 'CHO_XET'";
            String conflictCondition = isSeniorAdmin
                    ? ""
                    : " AND d.nguoi_danh_gia_id <> ? AND d.nguoi_bi_danh_gia_id <> ?";
            List<Object> args = isSeniorAdmin ? List.of() : List.of(actorId, actorId);

            List<Map<String, Object>> reviewRows = db.queryForList(
                    """
                    SELECT d.ma_danh_gia, d.ma_giao_dich, d.nguoi_danh_gia_id, d.nguoi_bi_danh_gia_id,
                           d.so_sao, d.trang_thai AS review_status, d.thoi_diem_tao AS submitted_at,
                           d.thoi_diem_xet, d.yeu_cau_bo_sung_trang_thai,
                           t.tieu_de AS listing_title,
                           ub.ho_ten AS buyer_name, us.ho_ten AS seller_name
                    FROM danh_gias d
                    JOIN giao_dichs g ON g.ma_giao_dich = d.ma_giao_dich
                    JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                    JOIN thanh_viens ub ON ub.user_id = d.nguoi_danh_gia_id
                    JOIN thanh_viens us ON us.user_id = d.nguoi_bi_danh_gia_id
                    WHERE """ + statusCondition + conflictCondition,
                    args.toArray()
            );

            for (Map<String, Object> r : reviewRows) {
                String reviewStatus = String.valueOf(r.get("review_status"));
                String conclusion = "CHAP_NHAN".equals(reviewStatus) ? "CHAP_NHAN_DANH_GIA"
                        : "BI_BAC".equals(reviewStatus) ? "BAC_DANH_GIA"
                        : "DA_GO".equals(reviewStatus) ? "DA_GO"
                        : null;
                combined.add(new ReviewModerationDtos.ModerationQueueItemDto(
                        CASE_LOW_STAR_REVIEW,
                        (UUID) r.get("ma_danh_gia"),
                        (UUID) r.get("ma_danh_gia"),
                        (UUID) r.get("ma_giao_dich"),
                        String.valueOf(r.get("listing_title")),
                        (UUID) r.get("nguoi_danh_gia_id"),
                        String.valueOf(r.get("buyer_name")),
                        (UUID) r.get("nguoi_bi_danh_gia_id"),
                        String.valueOf(r.get("seller_name")),
                        ((Number) r.get("so_sao")).intValue(),
                        reviewStatus,
                        null,
                        "Đánh giá " + r.get("so_sao") + " sao chờ kiểm duyệt",
                        (String) r.get("yeu_cau_bo_sung_trang_thai"),
                        toInstant(r.get("submitted_at")),
                        toInstant(r.get("thoi_diem_xet")),
                        conclusion,
                        false
                ));
            }
        }

        combined.sort(Comparator.comparing(ReviewModerationDtos.ModerationQueueItemDto::submittedAt).reversed()
                .thenComparing(item -> item.caseId().toString()));

        long total = combined.size();
        int from = Math.min(page * size, combined.size());
        int to = Math.min(from + size, combined.size());
        return new ReviewModerationDtos.Page<>(List.copyOf(combined.subList(from, to)), page, size, total);
    }

    @Transactional(readOnly = true)
    public ReviewModerationDtos.ModerationCaseDetailDto getModerationCaseDetail(
            Jwt actor,
            boolean isSeniorAdmin,
            String rawCaseType,
            UUID caseId
    ) {
        UUID actorId = requireUserId(actor);
        String caseType = requireCaseType(rawCaseType);
        if (caseId == null) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Thiếu mã hồ sơ kiểm duyệt.");
        }

        Map<String, Object> complaintRow = null;
        UUID reviewId;
        if (CASE_COMPLAINT.equals(caseType)) {
            List<Map<String, Object>> cRows = db.queryForList(
                    "SELECT *, noi_dung_danh_gia_snapshot::text AS snapshot_text FROM khieu_nais WHERE ma_khieu_nai = ?",
                    caseId
            );
            if (cRows.isEmpty()) {
                throw new ReviewModerationFailure(404, "COMPLAINT_NOT_FOUND", "Không tìm thấy hồ sơ khiếu nại.");
            }
            complaintRow = cRows.getFirst();
            reviewId = (UUID) complaintRow.get("ma_danh_gia");
        } else {
            reviewId = caseId;
        }

        List<Map<String, Object>> rRows = db.queryForList(
                """
                SELECT d.*, g.ma_tin, g.gia_thoa_thuan, g.anh_ban_giao, g.thoi_diem_hoan_tat,
                       t.tieu_de AS listing_title,
                       ub.ho_ten AS buyer_name,
                       us.ho_ten AS seller_name, us.diem_uy_tin AS seller_score, us.trang_thai_tai_khoan AS seller_status
                FROM danh_gias d
                JOIN giao_dichs g ON g.ma_giao_dich = d.ma_giao_dich
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                JOIN thanh_viens ub ON ub.user_id = d.nguoi_danh_gia_id
                JOIN thanh_viens us ON us.user_id = d.nguoi_bi_danh_gia_id
                WHERE d.ma_danh_gia = ?
                """,
                reviewId
        );
        if (rRows.isEmpty()) {
            throw new ReviewModerationFailure(404, "REVIEW_NOT_FOUND", "Không tìm thấy đánh giá.");
        }
        Map<String, Object> r = rRows.getFirst();

        UUID buyerId = (UUID) r.get("nguoi_danh_gia_id");
        UUID sellerId = (UUID) r.get("nguoi_bi_danh_gia_id");
        if (!isSeniorAdmin && (actorId.equals(buyerId) || actorId.equals(sellerId))) {
            throw new ReviewModerationFailure(403, "CONFLICT_OF_INTEREST",
                    "Bạn không có quyền xem hoặc xử lý hồ sơ đánh giá liên quan đến chính mình.");
        }

        ReviewerEligibility eligibility = evaluateModeratorEligibility(
                actorId,
                buyerId,
                sellerId,
                CASE_COMPLAINT.equals(caseType) ? (UUID) r.get("nguoi_xet_id") : null,
                isSeniorAdmin
        );

        UUID complaintId = complaintRow != null ? (UUID) complaintRow.get("ma_khieu_nai") : null;
        List<ReviewModerationDtos.AdminEvidenceItemDto> evidences = loadAdminEvidences(reviewId, complaintId);
        List<ReviewModerationDtos.SupplementalRequestDto> supplemental = loadSupplementalRequests(
                CASE_COMPLAINT.equals(caseType) ? "KHIEU_NAI" : "DANH_GIA",
                caseId
        );
        List<ReviewModerationDtos.ModerationDecisionHistoryDto> decisions = loadDecisionHistory(reviewId, complaintId);

        Object deltaObj = r.get("diem_tac_dong");
        Integer appliedDelta = deltaObj == null ? null : ((Number) deltaObj).intValue();

        return new ReviewModerationDtos.ModerationCaseDetailDto(
                caseType,
                caseId,
                reviewId,
                ((Number) r.get("version")).longValue(),
                String.valueOf(r.get("trang_thai")),
                ((Number) r.get("so_sao")).intValue(),
                (String) r.get("nhan_xet"),
                complaintRow != null ? (String) complaintRow.get("snapshot_text") : null,
                appliedDelta,
                toInstant(r.get("thoi_diem_tao")),
                resolvePublishedAt(r),
                (UUID) r.get("ma_giao_dich"),
                (UUID) r.get("ma_tin"),
                String.valueOf(r.get("listing_title")),
                ((Number) r.get("gia_thoa_thuan")).intValue(),
                (String) r.get("anh_ban_giao"),
                toInstant(r.get("thoi_diem_hoan_tat")),
                buyerId,
                String.valueOf(r.get("buyer_name")),
                sellerId,
                String.valueOf(r.get("seller_name")),
                ((Number) r.get("seller_score")).intValue(),
                String.valueOf(r.get("seller_status")),
                complaintRow != null ? String.valueOf(complaintRow.get("trang_thai")) : null,
                complaintRow != null ? (String) complaintRow.get("ma_ly_do") : null,
                complaintRow != null ? String.valueOf(complaintRow.get("ly_do")) : null,
                complaintRow != null ? (String) complaintRow.get("mo_ta") : null,
                complaintRow != null ? toInstant(complaintRow.get("thoi_diem_tao")) : null,
                complaintRow != null ? (String) complaintRow.get("ket_luan") : null,
                complaintRow != null ? (String) complaintRow.get("can_cu_xu_ly") : null,
                complaintRow != null ? ((Number) complaintRow.get("version")).longValue() : null,
                complaintRow != null
                        ? (String) complaintRow.get("yeu_cau_bo_sung_trang_thai")
                        : (String) r.get("yeu_cau_bo_sung_trang_thai"),
                eligibility.canDecide(),
                eligibility.reason(),
                eligibility.singleModeratorOverride(),
                evidences,
                supplemental,
                decisions
        );
    }

    /**
     * UC-34 §3.2: Moderator decides a 1-3 star pending review (APPROVE / REJECT / REQUEST_MORE_INFO).
     */
    public ReviewModerationDtos.ModerationDecisionResponse decideLowStarReview(
            Jwt actor,
            boolean isSeniorAdmin,
            UUID reviewId,
            ReviewModerationDtos.DecideReviewRequest input
    ) {
        UUID actorId = requireUserId(actor);
        if (reviewId == null || input == null) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Thiếu thông tin quyết định kiểm duyệt.");
        }
        String action = normalizeAction(input.action(), Set.of("APPROVE", "REJECT", "REQUEST_MORE_INFO"));
        String rationale = normalizeText(input.rationale(), MAX_RATIONALE_LENGTH, "RATIONALE_TOO_LONG",
                "Căn cứ quyết định không được vượt quá " + MAX_RATIONALE_LENGTH + " ký tự.");
        if (rationale.isEmpty()) {
            throw new ReviewModerationFailure(400, "MISSING_RATIONALE", "Vui lòng nhập căn cứ quyết định.");
        }

        List<Map<String, Object>> rows = db.queryForList(
                "SELECT * FROM danh_gias WHERE ma_danh_gia = ? FOR UPDATE",
                reviewId
        );
        if (rows.isEmpty()) {
            throw new ReviewModerationFailure(404, "REVIEW_NOT_FOUND", "Không tìm thấy đánh giá.");
        }
        Map<String, Object> review = rows.getFirst();
        UUID buyerId = (UUID) review.get("nguoi_danh_gia_id");
        UUID sellerId = (UUID) review.get("nguoi_bi_danh_gia_id");

        if (!isSeniorAdmin && (actorId.equals(buyerId) || actorId.equals(sellerId))) {
            throw new ReviewModerationFailure(403, "CONFLICT_OF_INTEREST",
                    "Bạn không có quyền xét duyệt đánh giá liên quan đến chính mình.");
        }

        String currentStatus = String.valueOf(review.get("trang_thai"));
        long currentVersion = ((Number) review.get("version")).longValue();
        if ("DA_XOA".equals(currentStatus)) {
            throw new ReviewModerationFailure(409, "REVIEW_DELETED",
                    "Đánh giá đã bị người mua xóa trước khi xét duyệt.");
        }
        if (!"CHO_XET".equals(currentStatus)) {
            throw new ReviewModerationFailure(409, "ALREADY_DECIDED",
                    "Đánh giá này đã được kiểm duyệt viên khác xử lý. Vui lòng làm mới danh sách.");
        }
        if (input.expectedVersion() != null && !input.expectedVersion().equals(currentVersion)) {
            throw new ReviewModerationFailure(409, "CONCURRENT_CHANGE",
                    "Hồ sơ đánh giá vừa thay đổi. Vui lòng tải lại trước khi quyết định.");
        }

        int stars = ((Number) review.get("so_sao")).intValue();
        Instant now = now();
        Timestamp nowTs = Timestamp.from(now);

        if ("REQUEST_MORE_INFO".equals(action)) {
            String targetParty = normalizeTargetParty(input.targetParty(), "BUYER");
            UUID recipientId = "SELLER".equals(targetParty) ? sellerId : buyerId;
            String recipientRole = "SELLER".equals(targetParty) ? "NGUOI_BAN" : "NGUOI_MUA";
            insertSupplementalRequest("DANH_GIA", reviewId, actorId, recipientId, recipientRole, rationale, nowTs);
            db.update("UPDATE danh_gias SET yeu_cau_bo_sung_trang_thai = 'CHO_BO_SUNG' WHERE ma_danh_gia = ?", reviewId);
            insertNotification(recipientId, "YEU_CAU_BO_SUNG_DANH_GIA", reviewId, null,
                    "Yêu cầu bổ sung thông tin đánh giá",
                    "Kiểm duyệt viên yêu cầu bổ sung: " + rationale, nowTs);
            return new ReviewModerationDtos.ModerationDecisionResponse(
                    CASE_LOW_STAR_REVIEW, reviewId, reviewId, action, "CHO_XET", null,
                    0, null, null, false, now
            );
        }

        if ("APPROVE".equals(action)) {
            int requestedDelta = reputationDeltaForStars(stars);
            ReputationLedgerEntry entry = reputationLedger.recordScoreChange(
                    sellerId,
                    ReputationLedgerService.CHANGE_TRANSACTION_REVIEW,
                    requestedDelta,
                    "Duyệt đánh giá " + stars + " sao: " + rationale,
                    "REVIEW_MODERATION",
                    reviewId.toString(),
                    "REVIEW_APPROVAL:" + reviewId,
                    actorId
            );

            db.update(
                    """
                    UPDATE danh_gias
                    SET trang_thai = 'CHAP_NHAN',
                        thoi_diem_xet = ?,
                        thoi_diem_cong_khai = ?,
                        nguoi_xet_id = ?,
                        can_cu_xet = ?,
                        diem_tac_dong = ?,
                        yeu_cau_bo_sung_trang_thai = NULL,
                        version = version + 1
                    WHERE ma_danh_gia = ?
                    """,
                    nowTs, nowTs, actorId, rationale, entry.delta(), reviewId
            );

            insertDecisionRecord(actorId, null, reviewId, "CHAP_NHAN_DANH_GIA", rationale, entry.delta(), nowTs);
            insertNotification(sellerId, "DANH_GIA_DUOC_DUYET", reviewId, null,
                    "Đánh giá " + stars + " sao đã được công khai",
                    "Đánh giá đã qua kiểm duyệt (tác động " + entry.delta() + " điểm uy tín). Bạn có 7 ngày để gửi khiếu nại nếu thấy không chính xác.",
                    nowTs);
            insertNotification(buyerId, "DANH_GIA_DUOC_DUYET", reviewId, null,
                    "Đánh giá của bạn đã được chấp nhận",
                    "Đánh giá " + stars + " sao của bạn đã được kiểm duyệt và công khai.", nowTs);

            return new ReviewModerationDtos.ModerationDecisionResponse(
                    CASE_LOW_STAR_REVIEW, reviewId, reviewId, action, "CHAP_NHAN", null,
                    entry.delta(), entry.scoreAfter(), entry.triggeredLockType(), false, now
            );
        }

        // REJECT
        db.update(
                """
                UPDATE danh_gias
                SET trang_thai = 'BI_BAC',
                    thoi_diem_xet = ?,
                    nguoi_xet_id = ?,
                    can_cu_xet = ?,
                    diem_tac_dong = 0,
                    yeu_cau_bo_sung_trang_thai = NULL,
                    version = version + 1
                WHERE ma_danh_gia = ?
                """,
                nowTs, actorId, rationale, reviewId
        );
        insertDecisionRecord(actorId, null, reviewId, "BAC_DANH_GIA", rationale, 0, nowTs);
        insertNotification(buyerId, "DANH_GIA_BI_BAC", reviewId, null,
                "Đánh giá của bạn không được chấp nhận",
                "Đánh giá " + stars + " sao bị bác với căn cứ: " + rationale, nowTs);

        return new ReviewModerationDtos.ModerationDecisionResponse(
                CASE_LOW_STAR_REVIEW, reviewId, reviewId, action, "BI_BAC", null,
                0, null, null, false, now
        );
    }

    /**
     * UC-34 §3.1 & §3.2: Moderator decides a seller complaint (UPHOLD / DISMISS / REQUEST_MORE_INFO).
     */
    public ReviewModerationDtos.ModerationDecisionResponse decideComplaint(
            Jwt actor,
            boolean isSeniorAdmin,
            UUID complaintId,
            ReviewModerationDtos.DecideComplaintRequest input
    ) {
        UUID actorId = requireUserId(actor);
        if (complaintId == null || input == null) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Thiếu thông tin quyết định kiểm duyệt khiếu nại.");
        }
        String action = normalizeAction(input.action(), Set.of("UPHOLD", "DISMISS", "REQUEST_MORE_INFO"));
        String rationale = normalizeText(input.rationale(), MAX_RATIONALE_LENGTH, "RATIONALE_TOO_LONG",
                "Căn cứ quyết định không được vượt quá " + MAX_RATIONALE_LENGTH + " ký tự.");
        if (rationale.isEmpty()) {
            throw new ReviewModerationFailure(400, "MISSING_RATIONALE", "Vui lòng nhập căn cứ quyết định.");
        }

        // Lock complaint first, then review (consistent lock order prevents deadlocks)
        List<Map<String, Object>> cRows = db.queryForList(
                "SELECT * FROM khieu_nais WHERE ma_khieu_nai = ? FOR UPDATE",
                complaintId
        );
        if (cRows.isEmpty()) {
            throw new ReviewModerationFailure(404, "COMPLAINT_NOT_FOUND", "Không tìm thấy hồ sơ khiếu nại.");
        }
        Map<String, Object> complaint = cRows.getFirst();
        UUID reviewId = (UUID) complaint.get("ma_danh_gia");

        List<Map<String, Object>> rRows = db.queryForList(
                "SELECT * FROM danh_gias WHERE ma_danh_gia = ? FOR UPDATE",
                reviewId
        );
        if (rRows.isEmpty()) {
            throw new ReviewModerationFailure(404, "REVIEW_NOT_FOUND", "Không tìm thấy đánh giá liên quan.");
        }
        Map<String, Object> review = rRows.getFirst();

        UUID buyerId = (UUID) review.get("nguoi_danh_gia_id");
        UUID sellerId = (UUID) review.get("nguoi_bi_danh_gia_id");
        UUID priorReviewerId = (UUID) review.get("nguoi_xet_id");

        ReviewerEligibility eligibility = evaluateModeratorEligibility(
                actorId, buyerId, sellerId, priorReviewerId, isSeniorAdmin
        );
        if (!eligibility.canDecide()) {
            String code = actorId.equals(priorReviewerId) ? "PRIOR_REVIEWER_CONFLICT" : "CONFLICT_OF_INTEREST";
            throw new ReviewModerationFailure(403, code, eligibility.reason());
        }

        if (!"CHO_XU_LY".equals(complaint.get("trang_thai"))) {
            throw new ReviewModerationFailure(409, "ALREADY_DECIDED",
                    "Khiếu nại này đã được xử lý hoặc đã rút. Vui lòng làm mới danh sách.");
        }
        long currentVersion = ((Number) complaint.get("version")).longValue();
        if (input.expectedVersion() != null && !input.expectedVersion().equals(currentVersion)) {
            throw new ReviewModerationFailure(409, "CONCURRENT_CHANGE",
                    "Hồ sơ khiếu nại vừa thay đổi. Vui lòng tải lại trước khi quyết định.");
        }

        Instant now = now();
        Timestamp nowTs = Timestamp.from(now);
        String effectiveRationale = eligibility.singleModeratorOverride()
                ? rationale + " [Ghi nhận: hệ thống chỉ còn duy nhất kiểm duyệt viên này hiệu lực]"
                : rationale;

        if ("REQUEST_MORE_INFO".equals(action)) {
            String targetParty = normalizeTargetParty(input.targetParty(), "SELLER");
            UUID recipientId = "BUYER".equals(targetParty) ? buyerId : sellerId;
            String recipientRole = "BUYER".equals(targetParty) ? "NGUOI_MUA" : "NGUOI_BAN";
            insertSupplementalRequest("KHIEU_NAI", complaintId, actorId, recipientId, recipientRole, rationale, nowTs);
            db.update("UPDATE khieu_nais SET yeu_cau_bo_sung_trang_thai = 'CHO_BO_SUNG' WHERE ma_khieu_nai = ?", complaintId);
            insertNotification(recipientId, "YEU_CAU_BO_SUNG_KHIEU_NAI", reviewId, complaintId,
                    "Yêu cầu bổ sung bằng chứng khiếu nại",
                    "Kiểm duyệt viên yêu cầu bổ sung: " + rationale, nowTs);
            return new ReviewModerationDtos.ModerationDecisionResponse(
                    CASE_COMPLAINT, complaintId, reviewId, action,
                    String.valueOf(review.get("trang_thai")), "CHO_XU_LY",
                    0, null, null, eligibility.singleModeratorOverride(), now
            );
        }

        if ("UPHOLD".equals(action)) {
            int originalDelta = resolveOriginalReviewDelta(review, reviewId);
            int reversalDelta = -originalDelta;
            Integer sellerScoreAfter = null;
            String restrictionChange = null;

            if (reversalDelta != 0) {
                ReputationLedgerEntry entry = reputationLedger.recordScoreChange(
                        sellerId,
                        ReputationLedgerService.CHANGE_COMPLAINT_RESTORE,
                        reversalDelta,
                        "Đảo tác động điểm do chấp nhận khiếu nại đánh giá: " + effectiveRationale,
                        "REVIEW_COMPLAINT",
                        complaintId.toString(),
                        "COMPLAINT_REVERSAL:" + complaintId,
                        actorId
                );
                sellerScoreAfter = entry.scoreAfter();
                if (reversalDelta > 0) {
                    restrictionChange = reviewRestrictionAfterReversal(
                            sellerId, reviewId, complaintId, entry.scoreAfter(), actorId, effectiveRationale, nowTs
                    );
                } else {
                    restrictionChange = entry.triggeredLockType();
                }
            } else {
                sellerScoreAfter = db.queryForObject(
                        "SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, sellerId
                );
            }

            db.update(
                    """
                    UPDATE khieu_nais
                    SET trang_thai = 'DA_XU_LY',
                        ket_luan = 'CHAP_NHAN_KHIEU_NAI',
                        can_cu_xu_ly = ?,
                        nguoi_xu_ly_id = ?,
                        thoi_diem_xu_ly = ?,
                        yeu_cau_bo_sung_trang_thai = NULL,
                        version = version + 1
                    WHERE ma_khieu_nai = ?
                    """,
                    effectiveRationale, actorId, nowTs, complaintId
            );
            db.update(
                    """
                    UPDATE danh_gias
                    SET trang_thai = 'DA_GO',
                        khoa_chinh_sua = TRUE,
                        version = version + 1
                    WHERE ma_danh_gia = ?
                    """,
                    reviewId
            );

            insertDecisionRecord(actorId, complaintId, reviewId, "CHAP_NHAN_KHIEU_NAI", effectiveRationale, reversalDelta, nowTs);
            insertNotification(sellerId, "KHIEU_NAI_DUOC_CHAP_NHAN", reviewId, complaintId,
                    "Khiếu nại đánh giá được chấp nhận",
                    "Đánh giá đã bị gỡ khỏi hồ sơ"
                            + (reversalDelta != 0 ? " và tác động điểm (" + (reversalDelta > 0 ? "+" : "") + reversalDelta + ") đã được đảo lại." : ".")
                            + " Căn cứ: " + effectiveRationale,
                    nowTs);
            insertNotification(buyerId, "DANH_GIA_BI_GO", reviewId, complaintId,
                    "Đánh giá của bạn đã bị gỡ sau khiếu nại",
                    "Kiểm duyệt viên đã chấp nhận khiếu nại của người bán. Căn cứ: " + effectiveRationale,
                    nowTs);

            return new ReviewModerationDtos.ModerationDecisionResponse(
                    CASE_COMPLAINT, complaintId, reviewId, action, "DA_GO", "DA_XU_LY",
                    reversalDelta, sellerScoreAfter, restrictionChange, eligibility.singleModeratorOverride(), now
            );
        }

        // DISMISS
        db.update(
                """
                UPDATE khieu_nais
                SET trang_thai = 'DA_XU_LY',
                    ket_luan = 'BAC_KHIEU_NAI',
                    can_cu_xu_ly = ?,
                    nguoi_xu_ly_id = ?,
                    thoi_diem_xu_ly = ?,
                    yeu_cau_bo_sung_trang_thai = NULL,
                    version = version + 1
                WHERE ma_khieu_nai = ?
                """,
                effectiveRationale, actorId, nowTs, complaintId
        );
        db.update("UPDATE danh_gias SET khoa_chinh_sua = FALSE WHERE ma_danh_gia = ?", reviewId);

        insertDecisionRecord(actorId, complaintId, reviewId, "BAC_KHIEU_NAI", effectiveRationale, 0, nowTs);
        insertNotification(sellerId, "KHIEU_NAI_BI_BAC", reviewId, complaintId,
                "Khiếu nại đánh giá bị bác",
                "Đánh giá và điểm uy tín được giữ nguyên. Căn cứ: " + effectiveRationale, nowTs);
        insertNotification(buyerId, "KHIEU_NAI_BI_BAC", reviewId, complaintId,
                "Khiếu nại đối với đánh giá của bạn đã bị bác",
                "Đánh giá của bạn vẫn được giữ công khai. Căn cứ: " + effectiveRationale, nowTs);

        Integer currentScore = db.queryForObject(
                "SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", Integer.class, sellerId
        );
        return new ReviewModerationDtos.ModerationDecisionResponse(
                CASE_COMPLAINT, complaintId, reviewId, action, "CHAP_NHAN", "DA_XU_LY",
                0, currentScore, null, eligibility.singleModeratorOverride(), now
        );
    }

    /**
     * NFR-01 / UC-33 §4 / UC-34 §4: Strictly restricted to Moderators and Senior Admins on admin-web.
     */
    @Transactional(readOnly = true)
    public ReviewModerationDtos.EvidenceDownloadResult loadEvidenceForAdmin(
            Jwt actor,
            boolean isSeniorAdmin,
            UUID evidenceId
    ) {
        UUID actorId = requireUserId(actor);
        if (evidenceId == null) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Mã bằng chứng không hợp lệ.");
        }

        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT e.id, e.ma_khieu_nai, e.ma_danh_gia, e.loai_bang_chung,
                       e.storage_key, e.content_type, e.size_bytes,
                       e.chat_log_snapshot::text AS chat_log_json,
                       d.nguoi_danh_gia_id, d.nguoi_bi_danh_gia_id
                FROM danh_gia_bang_chungs e
                LEFT JOIN danh_gias d ON d.ma_danh_gia = e.ma_danh_gia
                WHERE e.id = ?
                """,
                evidenceId
        );
        if (rows.isEmpty()) {
            throw new ReviewModerationFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy tệp bằng chứng.");
        }
        Map<String, Object> row = rows.getFirst();
        if (row.get("ma_khieu_nai") == null && row.get("ma_danh_gia") == null) {
            throw new ReviewModerationFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy tệp bằng chứng.");
        }

        if (!isSeniorAdmin) {
            UUID buyerId = (UUID) row.get("nguoi_danh_gia_id");
            UUID sellerId = (UUID) row.get("nguoi_bi_danh_gia_id");
            if (actorId.equals(buyerId) || actorId.equals(sellerId)) {
                throw new ReviewModerationFailure(403, "CONFLICT_OF_INTEREST",
                        "Bạn không có quyền xem bằng chứng của đánh giá liên quan đến chính mình.");
            }
        }

        String evidenceType = String.valueOf(row.get("loai_bang_chung"));
        if (EVIDENCE_CHAT_LOG.equals(evidenceType)) {
            String chatJson = String.valueOf(row.get("chat_log_json"));
            return new ReviewModerationDtos.EvidenceDownloadResult(
                    evidenceId,
                    EVIDENCE_CHAT_LOG,
                    "application/json",
                    chatJson.getBytes(StandardCharsets.UTF_8).length,
                    null,
                    chatJson
            );
        }

        String storageKey = (String) row.get("storage_key");
        String contentType = (String) row.get("content_type");
        long dbSize = ((Number) row.get("size_bytes")).longValue();
        Resource resource = storage.loadAsResource(storageKey);
        long resolvedSize;
        try {
            resolvedSize = resource.contentLength();
        } catch (IOException e) {
            resolvedSize = dbSize;
        }
        return new ReviewModerationDtos.EvidenceDownloadResult(
                evidenceId,
                EVIDENCE_IMAGE,
                contentType,
                resolvedSize,
                resource,
                null
        );
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * UC-34 §2: Reviews account restriction if it was triggered by the exact review score impact just reversed.
     * Independent penalty-scale locks (UC-37 / FR-12) are never altered.
     */
    private String reviewRestrictionAfterReversal(
            UUID sellerId,
            UUID reviewId,
            UUID complaintId,
            int restoredScore,
            UUID actorId,
            String rationale,
            Timestamp nowTs
    ) {
        List<Map<String, Object>> userRows = db.queryForList(
                "SELECT * FROM thanh_viens WHERE user_id = ? FOR UPDATE",
                sellerId
        );
        if (userRows.isEmpty()) {
            return null;
        }
        Map<String, Object> user = userRows.getFirst();
        if (!"BI_KHOA".equals(user.get("trang_thai_tai_khoan"))) {
            return null;
        }
        String lockType = (String) user.get("loai_han_che");

        // Verify the latest threshold lock audit originated from this exact review (not an unrelated report penalty)
        List<Map<String, Object>> lockAudits = db.queryForList(
                """
                SELECT action_type, details->>'referenceId' AS ref_id, details->>'referenceSource' AS ref_src
                FROM nhat_ky_kiem_duyet
                WHERE target_user_id = ?
                  AND action_type IN (
                      'LOCK_TEMPORARY', 'LOCK_PERMANENT',
                      'THRESHOLD_LOCK_TEMPORARY', 'THRESHOLD_LOCK_PERMANENT',
                      'UNLOCK_MANUAL', 'UNLOCK_EXPIRED_TEMP'
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                sellerId
        );
        if (lockAudits.isEmpty()) {
            return null;
        }
        Map<String, Object> latestLock = lockAudits.getFirst();
        String latestAction = String.valueOf(latestLock.get("action_type"));
        boolean triggeredByThisReview = ("THRESHOLD_LOCK_TEMPORARY".equals(latestAction)
                || "THRESHOLD_LOCK_PERMANENT".equals(latestAction))
                && reviewId.toString().equals(latestLock.get("ref_id"));

        if (!triggeredByThisReview) {
            return null;
        }

        if (restoredScore > ReputationLedgerService.TEMPORARY_LOCK_MAX_SCORE) {
            boolean verified = Boolean.TRUE.equals(user.get("email_verified"))
                    && Boolean.TRUE.equals(user.get("profile_approved"));
            String restoredStatus = verified ? "HOAT_DONG" : "CHO_KICH_HOAT";
            db.update(
                    """
                    UPDATE thanh_viens
                    SET trang_thai_tai_khoan = ?,
                        loai_han_che = NULL,
                        khoa_den_ngay = NULL,
                        ly_do_han_che = NULL,
                        cho_phep_khieu_nai = FALSE,
                        updated_at = ?,
                        version = version + 1
                    WHERE user_id = ?
                    """,
                    restoredStatus,
                    nowTs,
                    sellerId
            );
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("trigger", "COMPLAINT_REVERSAL");
            details.put("complaintId", complaintId.toString());
            details.put("reviewId", reviewId.toString());
            details.put("restoredScore", restoredScore);
            db.update(
                    """
                    INSERT INTO nhat_ky_kiem_duyet(
                        id, target_user_id, actor_user_id, action_type, reason,
                        previous_status, new_status, lock_type, locked_until, appealable, details, created_at
                    ) VALUES (?, ?, ?, 'UNLOCK_MANUAL', ?, 'BI_KHOA', ?, NULL, NULL, FALSE, CAST(? AS jsonb), ?)
                    """,
                    UUID.randomUUID(),
                    sellerId,
                    actorId,
                    "Mở khóa tự động sau khi đảo điểm từ chấp nhận khiếu nại đánh giá: " + rationale,
                    restoredStatus,
                    toJson(details),
                    nowTs
            );
            return "UNLOCKED";
        }

        if ("KHOA_VINH_VIEN".equals(lockType) && restoredScore > ReputationLedgerService.PERMANENT_LOCK_MAX_SCORE) {
            Instant tempUntil = nowTs.toInstant().plus(ReputationLedgerService.TEMPORARY_LOCK_DURATION);
            String reason = "Chuyển từ khóa vĩnh viễn sang khóa tạm 14 ngày sau khi đảo điểm khiếu nại (điểm = " + restoredScore + ").";
            db.update(
                    """
                    UPDATE thanh_viens
                    SET loai_han_che = 'KHOA_TAM_THOI',
                        khoa_den_ngay = ?,
                        ly_do_han_che = ?,
                        diem_da_khoa_tam = ?,
                        updated_at = ?,
                        version = version + 1
                    WHERE user_id = ?
                    """,
                    Timestamp.from(tempUntil),
                    reason,
                    restoredScore,
                    nowTs,
                    sellerId
            );
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("trigger", "COMPLAINT_REVERSAL_DOWNGRADE");
            details.put("complaintId", complaintId.toString());
            details.put("reviewId", reviewId.toString());
            details.put("restoredScore", restoredScore);
            db.update(
                    """
                    INSERT INTO nhat_ky_kiem_duyet(
                        id, target_user_id, actor_user_id, action_type, reason,
                        previous_status, new_status, lock_type, locked_until, appealable, details, created_at
                    ) VALUES (?, ?, ?, 'THRESHOLD_LOCK_TEMPORARY', ?, 'BI_KHOA', 'BI_KHOA', 'KHOA_TAM_THOI', ?, FALSE, CAST(? AS jsonb), ?)
                    """,
                    UUID.randomUUID(),
                    sellerId,
                    actorId,
                    reason,
                    Timestamp.from(tempUntil),
                    toJson(details),
                    nowTs
            );
            return "DOWNGRADED_TO_TEMPORARY_LOCK";
        }

        return null;
    }

    private int resolveOriginalReviewDelta(Map<String, Object> review, UUID reviewId) {
        Object stored = review.get("diem_tac_dong");
        if (stored != null) {
            return ((Number) stored).intValue();
        }
        List<Integer> ledgerDeltas = db.queryForList(
                """
                SELECT diem_thay_doi
                FROM lich_su_diem_uy_tin
                WHERE loai_bien_dong = 'DANH_GIA_GIAO_DICH' AND ma_tham_chieu = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                Integer.class,
                reviewId.toString()
        );
        if (!ledgerDeltas.isEmpty()) {
            return ledgerDeltas.getFirst();
        }
        return reputationDeltaForStars(((Number) review.get("so_sao")).intValue());
    }

    private ReviewerEligibility evaluateModeratorEligibility(
            UUID actorId,
            UUID buyerId,
            UUID sellerId,
            UUID priorReviewerId,
            boolean isSeniorAdmin
    ) {
        if (!isSeniorAdmin && (actorId.equals(buyerId) || actorId.equals(sellerId))) {
            return new ReviewerEligibility(false,
                    "Bạn không thể kiểm duyệt hồ sơ mà chính mình là người mua hoặc người bán.", false);
        }
        if (priorReviewerId != null && actorId.equals(priorReviewerId)) {
            Timestamp nowTs = Timestamp.from(now());
            Integer otherModerators = db.queryForObject(
                    """
                    SELECT COUNT(DISTINCT r.user_id)
                    FROM vai_tro_quan_tri r
                    JOIN thanh_viens u ON u.user_id = r.user_id
                    WHERE r.trang_thai_hieu_luc = TRUE
                      AND r.bat_dau <= ?
                      AND (r.ket_thuc IS NULL OR r.ket_thuc > ?)
                      AND r.loai_vai_tro IN ('KIEM_DUYET_VIEN', 'QUAN_TRI_VIEN_CAP_CAO')
                      AND u.trang_thai_tai_khoan = 'HOAT_DONG'
                      AND r.user_id NOT IN (?, ?, ?)
                    """,
                    Integer.class,
                    nowTs, nowTs, actorId, buyerId, sellerId
            );
            if (otherModerators != null && otherModerators > 0) {
                return new ReviewerEligibility(false,
                        "Kiểm duyệt viên đã xét đánh giá 1–3 sao không được xét khiếu nại về chính đánh giá đó.", false);
            }
            // UC-34 §4: if no other eligible moderator exists, allow and record the situation
            return new ReviewerEligibility(true, null, true);
        }
        return new ReviewerEligibility(true, null, false);
    }

    private ReviewModerationDtos.ComplaintSummaryDto findComplaintSummaryByReview(UUID reviewId) {
        List<UUID> ids = db.queryForList(
                "SELECT ma_khieu_nai FROM khieu_nais WHERE ma_danh_gia = ? LIMIT 1",
                UUID.class,
                reviewId
        );
        return ids.isEmpty() ? null : findComplaintSummaryById(ids.getFirst(), false);
    }

    private ReviewModerationDtos.ComplaintSummaryDto findComplaintReplay(UUID sellerId, String clientRequestId, UUID reviewId) {
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT ma_khieu_nai, ma_danh_gia FROM khieu_nais WHERE nguoi_khieu_nai_id = ? AND client_request_id = ? LIMIT 1",
                sellerId,
                clientRequestId
        );
        if (rows.isEmpty()) {
            return null;
        }
        Map<String, Object> existing = rows.getFirst();
        if (!reviewId.equals(existing.get("ma_danh_gia"))) {
            throw new ReviewModerationFailure(409, "CLIENT_REQUEST_ID_CONFLICT",
                    "Mã yêu cầu khiếu nại này đã được sử dụng cho một đánh giá khác.");
        }
        return findComplaintSummaryById((UUID) existing.get("ma_khieu_nai"), true);
    }

    private ReviewModerationDtos.ComplaintSummaryDto findComplaintSummaryById(UUID complaintId, boolean idempotentReplay) {
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT k.ma_khieu_nai, k.ma_danh_gia, k.phien_ban_danh_gia, k.ma_ly_do, k.ly_do,
                       k.mo_ta, k.trang_thai, k.ket_luan, k.can_cu_xu_ly, k.yeu_cau_bo_sung_trang_thai,
                       k.thoi_diem_tao, k.thoi_diem_xu_ly, k.thoi_diem_rut,
                       (SELECT COUNT(*) FROM danh_gia_bang_chungs e
                        WHERE e.ma_khieu_nai = k.ma_khieu_nai AND e.loai_bang_chung = 'HINH_ANH')::int AS img_count,
                       EXISTS (SELECT 1 FROM danh_gia_bang_chungs e
                        WHERE e.ma_khieu_nai = k.ma_khieu_nai AND e.loai_bang_chung = 'NHAT_KY_CHAT') AS has_chat
                FROM khieu_nais k
                WHERE k.ma_khieu_nai = ?
                """,
                complaintId
        );
        if (rows.isEmpty()) {
            return null;
        }
        Map<String, Object> r = rows.getFirst();
        return new ReviewModerationDtos.ComplaintSummaryDto(
                (UUID) r.get("ma_khieu_nai"),
                (UUID) r.get("ma_danh_gia"),
                ((Number) r.get("phien_ban_danh_gia")).longValue(),
                (String) r.get("ma_ly_do"),
                String.valueOf(r.get("ly_do")),
                String.valueOf(r.get("mo_ta")),
                String.valueOf(r.get("trang_thai")),
                (String) r.get("ket_luan"),
                (String) r.get("can_cu_xu_ly"),
                ((Number) r.get("img_count")).intValue(),
                Boolean.TRUE.equals(r.get("has_chat")),
                (String) r.get("yeu_cau_bo_sung_trang_thai"),
                toInstant(r.get("thoi_diem_tao")),
                toInstant(r.get("thoi_diem_xu_ly")),
                toInstant(r.get("thoi_diem_rut")),
                idempotentReplay
        );
    }

    private List<ReviewModerationDtos.SupplementalRequestDto> loadPendingSupplementalForUser(
            UUID userId, UUID reviewId, UUID complaintId
    ) {
        if (complaintId != null) {
            return db.query(
                    """
                    SELECT * FROM yeu_cau_bo_sung_danh_gia
                    WHERE doi_tuong_nhan_id = ? AND trang_thai = 'CHO_PHAN_HOI'
                      AND ((loai_ho_so = 'KHIEU_NAI' AND ho_so_id = ?) OR (loai_ho_so = 'DANH_GIA' AND ho_so_id = ?))
                    ORDER BY thoi_diem_tao DESC
                    """,
                    this::mapSupplementalRow,
                    userId, complaintId, reviewId
            );
        }
        return db.query(
                """
                SELECT * FROM yeu_cau_bo_sung_danh_gia
                WHERE doi_tuong_nhan_id = ? AND trang_thai = 'CHO_PHAN_HOI'
                  AND loai_ho_so = 'DANH_GIA' AND ho_so_id = ?
                ORDER BY thoi_diem_tao DESC
                """,
                this::mapSupplementalRow,
                userId, reviewId
        );
    }

    private List<ReviewModerationDtos.SupplementalRequestDto> loadSupplementalRequests(String caseType, UUID caseId) {
        return db.query(
                """
                SELECT * FROM yeu_cau_bo_sung_danh_gia
                WHERE loai_ho_so = ? AND ho_so_id = ?
                ORDER BY thoi_diem_tao DESC
                """,
                this::mapSupplementalRow,
                caseType, caseId
        );
    }

    private ReviewModerationDtos.SupplementalRequestDto mapSupplementalRow(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        Timestamp responded = rs.getTimestamp("thoi_diem_phan_hoi");
        return new ReviewModerationDtos.SupplementalRequestDto(
                rs.getObject("id", UUID.class),
                rs.getString("loai_ho_so"),
                rs.getObject("ho_so_id", UUID.class),
                rs.getObject("doi_tuong_nhan_id", UUID.class),
                rs.getString("vai_tro_nhan"),
                rs.getString("noi_dung_yeu_cau"),
                rs.getString("phan_hoi"),
                rs.getString("trang_thai"),
                rs.getTimestamp("thoi_diem_tao").toInstant(),
                responded == null ? null : responded.toInstant()
        );
    }

    private List<ReviewModerationDtos.AdminEvidenceItemDto> loadAdminEvidences(UUID reviewId, UUID complaintId) {
        String sql = complaintId != null
                ? """
                  SELECT id, nguon_bang_chung, loai_bang_chung, original_filename, content_type,
                         size_bytes, ma_hoi_thoai, created_at
                  FROM danh_gia_bang_chungs
                  WHERE ma_danh_gia = ? OR ma_khieu_nai = ?
                  ORDER BY created_at ASC, id ASC
                  """
                : """
                  SELECT id, nguon_bang_chung, loai_bang_chung, original_filename, content_type,
                         size_bytes, ma_hoi_thoai, created_at
                  FROM danh_gia_bang_chungs
                  WHERE ma_danh_gia = ?
                  ORDER BY created_at ASC, id ASC
                  """;
        Object[] args = complaintId != null ? new Object[]{reviewId, complaintId} : new Object[]{reviewId};
        return db.query(sql, (rs, n) -> {
            Object sizeObj = rs.getObject("size_bytes");
            Long sizeVal = sizeObj == null ? null : ((Number) sizeObj).longValue();
            return new ReviewModerationDtos.AdminEvidenceItemDto(
                    rs.getObject("id", UUID.class),
                    rs.getString("nguon_bang_chung"),
                    rs.getString("loai_bang_chung"),
                    rs.getString("original_filename"),
                    rs.getString("content_type"),
                    sizeVal,
                    rs.getObject("ma_hoi_thoai", UUID.class),
                    rs.getTimestamp("created_at").toInstant()
            );
        }, args);
    }

    private List<ReviewModerationDtos.ModerationDecisionHistoryDto> loadDecisionHistory(UUID reviewId, UUID complaintId) {
        String sql = complaintId != null
                ? """
                  SELECT q.ma_quyet_dinh, q.nguoi_ra_quyet_dinh_id, u.ho_ten AS moderator_name,
                         q.ket_luan, q.can_cu, q.diem_tac_dong, q.thoi_diem
                  FROM quyet_dinhs q
                  JOIN thanh_viens u ON u.user_id = q.nguoi_ra_quyet_dinh_id
                  WHERE q.ma_danh_gia = ? OR q.ma_khieu_nai = ?
                  ORDER BY q.thoi_diem DESC, q.ma_quyet_dinh DESC
                  """
                : """
                  SELECT q.ma_quyet_dinh, q.nguoi_ra_quyet_dinh_id, u.ho_ten AS moderator_name,
                         q.ket_luan, q.can_cu, q.diem_tac_dong, q.thoi_diem
                  FROM quyet_dinhs q
                  JOIN thanh_viens u ON u.user_id = q.nguoi_ra_quyet_dinh_id
                  WHERE q.ma_danh_gia = ?
                  ORDER BY q.thoi_diem DESC, q.ma_quyet_dinh DESC
                  """;
        Object[] args = complaintId != null ? new Object[]{reviewId, complaintId} : new Object[]{reviewId};
        return db.query(sql, (rs, n) -> {
            Object deltaObj = rs.getObject("diem_tac_dong");
            Integer delta = deltaObj == null ? null : ((Number) deltaObj).intValue();
            return new ReviewModerationDtos.ModerationDecisionHistoryDto(
                    rs.getObject("ma_quyet_dinh", UUID.class),
                    rs.getObject("nguoi_ra_quyet_dinh_id", UUID.class),
                    rs.getString("moderator_name"),
                    rs.getString("ket_luan"),
                    rs.getString("can_cu"),
                    delta,
                    rs.getTimestamp("thoi_diem").toInstant()
            );
        }, args);
    }

    private void insertSupplementalRequest(
            String caseType, UUID caseId, UUID actorId, UUID recipientId,
            String recipientRole, String note, Timestamp nowTs
    ) {
        db.update(
                """
                INSERT INTO yeu_cau_bo_sung_danh_gia(
                    id, loai_ho_so, ho_so_id, nguoi_yeu_cau_id, doi_tuong_nhan_id,
                    vai_tro_nhan, noi_dung_yeu_cau, trang_thai, thoi_diem_tao
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CHO_PHAN_HOI', ?)
                """,
                UUID.randomUUID(), caseType, caseId, actorId, recipientId, recipientRole, note, nowTs
        );
    }

    private void insertDecisionRecord(
            UUID actorId, UUID complaintId, UUID reviewId, String conclusion,
            String rationale, int scoreDelta, Timestamp nowTs
    ) {
        db.update(
                """
                INSERT INTO quyet_dinhs(
                    ma_quyet_dinh, nguoi_ra_quyet_dinh_id, ma_bao_cao, ma_khieu_nai,
                    ma_danh_gia, ma_thang_phat, ket_luan, can_cu, diem_tac_dong, thoi_diem
                ) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?)
                """,
                UUID.randomUUID(), actorId, complaintId, reviewId, conclusion, rationale, scoreDelta, nowTs
        );
    }

    private void insertNotification(
            UUID userId, String type, UUID reviewId, UUID complaintId,
            String title, String body, Timestamp nowTs
    ) {
        db.update(
                """
                INSERT INTO thong_bao_danh_gias(
                    id, user_id, loai, ma_danh_gia, ma_khieu_nai, tieu_de, noi_dung, da_doc, thoi_diem_tao
                ) VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, ?)
                """,
                UUID.randomUUID(), userId, type, reviewId, complaintId, title, body, nowTs
        );
    }

    private void validatePendingImageEvidences(UUID uploaderId, List<UUID> evidenceIds) {
        for (UUID eid : evidenceIds) {
            List<Map<String, Object>> rows = db.queryForList(
                    """
                    SELECT id, uploader_id, ma_khieu_nai, ma_danh_gia, loai_bang_chung
                    FROM danh_gia_bang_chungs
                    WHERE id = ?
                    FOR UPDATE
                    """,
                    eid
            );
            if (rows.isEmpty()) {
                throw new ReviewModerationFailure(400, "INVALID_EVIDENCE",
                        "Tệp bằng chứng không tồn tại hoặc đã bị xóa.");
            }
            Map<String, Object> row = rows.getFirst();
            if (!EVIDENCE_IMAGE.equals(row.get("loai_bang_chung"))
                    || !uploaderId.equals(row.get("uploader_id"))
                    || row.get("ma_khieu_nai") != null
                    || row.get("ma_danh_gia") != null) {
                throw new ReviewModerationFailure(400, "INVALID_EVIDENCE",
                        "Tệp bằng chứng không hợp lệ hoặc đã được sử dụng.");
            }
        }
    }

    private ResolvedChatSnapshot buildValidatedChatSnapshot(
            UUID sellerId,
            UUID buyerId,
            UUID conversationId,
            List<UUID> requestedMessageIds,
            Instant capturedAt
    ) {
        List<Map<String, Object>> convRows = db.queryForList(
                "SELECT ma_hoi_thoai, ma_tin, nguoi_mua_id, nguoi_ban_id FROM hoi_thoais WHERE ma_hoi_thoai = ?",
                conversationId
        );
        if (convRows.isEmpty()) {
            throw new ReviewModerationFailure(400, "INVALID_CHAT_EVIDENCE",
                    "Cuộc hội thoại đính kèm không tồn tại.");
        }
        Map<String, Object> conv = convRows.getFirst();
        UUID convBuyer = (UUID) conv.get("nguoi_mua_id");
        UUID convSeller = (UUID) conv.get("nguoi_ban_id");
        boolean matchingPair = (sellerId.equals(convSeller) && buyerId.equals(convBuyer))
                || (sellerId.equals(convBuyer) && buyerId.equals(convSeller));
        if (!matchingPair) {
            throw new ReviewModerationFailure(403, "FORBIDDEN",
                    "Cuộc hội thoại không thuộc hai bên của giao dịch bị đánh giá.");
        }

        List<Map<String, Object>> messageRows;
        if (requestedMessageIds.isEmpty()) {
            messageRows = db.queryForList(
                    """
                    SELECT m.ma_tin_nhan, m.nguoi_gui_id, u.ho_ten AS sender_name,
                           m.noi_dung, m.gia_de_nghi, m.thoi_diem_gui
                    FROM tin_nhans m
                    JOIN thanh_viens u ON u.user_id = m.nguoi_gui_id
                    WHERE m.ma_hoi_thoai = ?
                    ORDER BY m.thoi_diem_gui DESC, m.ma_tin_nhan DESC
                    LIMIT ?
                    """,
                    conversationId,
                    MAX_CHAT_MESSAGES
            );
        } else {
            UUID[] idArray = requestedMessageIds.toArray(new UUID[0]);
            messageRows = db.query(
                    con -> {
                        PreparedStatement ps = con.prepareStatement(
                                """
                                SELECT m.ma_tin_nhan, m.nguoi_gui_id, u.ho_ten AS sender_name,
                                       m.noi_dung, m.gia_de_nghi, m.thoi_diem_gui
                                FROM tin_nhans m
                                JOIN thanh_viens u ON u.user_id = m.nguoi_gui_id
                                WHERE m.ma_hoi_thoai = ? AND m.ma_tin_nhan = ANY(?)
                                ORDER BY m.thoi_diem_gui ASC, m.ma_tin_nhan ASC
                                """
                        );
                        ps.setObject(1, conversationId);
                        ps.setArray(2, con.createArrayOf("uuid", idArray));
                        return ps;
                    },
                    (rs, n) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("ma_tin_nhan", rs.getObject("ma_tin_nhan", UUID.class));
                        m.put("nguoi_gui_id", rs.getObject("nguoi_gui_id", UUID.class));
                        m.put("sender_name", rs.getString("sender_name"));
                        m.put("noi_dung", rs.getString("noi_dung"));
                        m.put("gia_de_nghi", rs.getObject("gia_de_nghi"));
                        m.put("thoi_diem_gui", rs.getTimestamp("thoi_diem_gui"));
                        return m;
                    }
            );
            if (messageRows.size() != requestedMessageIds.size()) {
                throw new ReviewModerationFailure(400, "INVALID_CHAT_EVIDENCE",
                        "Một hoặc nhiều tin nhắn được chọn không thuộc cuộc hội thoại này.");
            }
        }

        if (messageRows.isEmpty()) {
            throw new ReviewModerationFailure(400, "INVALID_CHAT_EVIDENCE",
                    "Cuộc hội thoại chưa có tin nhắn nào để đính kèm làm bằng chứng.");
        }

        List<Map<String, Object>> normalizedMessages = new ArrayList<>(messageRows.size());
        messageRows.stream()
                .sorted(Comparator
                        .comparing((Map<String, Object> m) -> ((Timestamp) m.get("thoi_diem_gui")).toInstant())
                        .thenComparing(m -> ((UUID) m.get("ma_tin_nhan")).toString()))
                .forEach(m -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("id", m.get("ma_tin_nhan").toString());
                    entry.put("senderId", m.get("nguoi_gui_id").toString());
                    entry.put("senderName", m.get("sender_name"));
                    entry.put("content", m.get("noi_dung"));
                    Object priceObj = m.get("gia_de_nghi");
                    entry.put("offeredPrice", priceObj == null ? null : ((Number) priceObj).intValue());
                    entry.put("sentAt", ((Timestamp) m.get("thoi_diem_gui")).toInstant().toString());
                    normalizedMessages.add(entry);
                });

        UUID listingId = (UUID) conv.get("ma_tin");
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("conversationId", conversationId.toString());
        snapshot.put("listingId", listingId != null ? listingId.toString() : null);
        snapshot.put("capturedAt", capturedAt.toString());
        snapshot.put("messageCount", normalizedMessages.size());
        snapshot.put("messages", normalizedMessages);

        return new ResolvedChatSnapshot(conversationId, toJson(snapshot));
    }

    private String buildReviewSnapshotJson(Map<String, Object> review, Instant publishedAt) {
        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("reviewId", review.get("ma_danh_gia").toString());
        snap.put("stars", ((Number) review.get("so_sao")).intValue());
        snap.put("comment", review.get("nhan_xet"));
        snap.put("status", review.get("trang_thai"));
        snap.put("version", ((Number) review.get("version")).longValue());
        snap.put("createdAt", toInstant(review.get("thoi_diem_tao")).toString());
        snap.put("publishedAt", publishedAt.toString());
        return toJson(snap);
    }

    private void lockAndVerifyEvidenceQuota(UUID uploaderId, int incomingFiles, long incomingBytes) {
        List<String> statuses = db.queryForList(
                "SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ? FOR UPDATE",
                String.class,
                uploaderId
        );
        if (statuses.isEmpty()) {
            throw new ReviewModerationFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }
        if (!"HOAT_DONG".equals(statuses.getFirst())) {
            throw new ReviewModerationFailure(403, "FORBIDDEN",
                    "Tài khoản không ở trạng thái hoạt động để tải bằng chứng.");
        }
        Map<String, Object> usage = db.queryForMap(
                """
                SELECT COUNT(*)::int AS file_count, COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes
                FROM danh_gia_bang_chungs
                WHERE uploader_id = ? AND loai_bang_chung = 'HINH_ANH'
                """,
                uploaderId
        );
        int existingCount = ((Number) usage.get("file_count")).intValue();
        long existingBytes = ((Number) usage.get("total_bytes")).longValue();
        if (existingCount + incomingFiles > maxEvidenceFilesPerUser
                || existingBytes + incomingBytes > maxEvidenceBytesPerUser) {
            throw new ReviewModerationFailure(413, "EVIDENCE_QUOTA_EXCEEDED",
                    "Bạn đã vượt giới hạn lưu trữ tệp bằng chứng cho phép.");
        }
    }

    private void ensureMemberActive(UUID userId) {
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT trang_thai_tai_khoan, email_verified, profile_approved FROM thanh_viens WHERE user_id = ?",
                userId
        );
        if (rows.isEmpty()) {
            throw new ReviewModerationFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }
        Map<String, Object> row = rows.getFirst();
        if (!"HOAT_DONG".equals(row.get("trang_thai_tai_khoan"))
                || !Boolean.TRUE.equals(row.get("email_verified"))
                || !Boolean.TRUE.equals(row.get("profile_approved"))) {
            throw new ReviewModerationFailure(403, "FORBIDDEN",
                    "Tài khoản phải đang hoạt động và đã được kích hoạt.");
        }
    }

    private void advisoryLock(String key) {
        db.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> {}, key);
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private String toJson(Map<String, Object> map) {
        try {
            return json.writeValueAsString(map);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize JSON payload", e);
        }
    }

    private static Instant toInstant(Object ts) {
        return ts == null ? null : ((Timestamp) ts).toInstant();
    }

    private static Instant resolvePublishedAt(Map<String, Object> reviewRow) {
        Instant pub = toInstant(reviewRow.get("thoi_diem_cong_khai"));
        if (pub != null) return pub;
        Instant reviewed = toInstant(reviewRow.get("thoi_diem_xet"));
        if (reviewed != null) return reviewed;
        return toInstant(reviewRow.get("thoi_diem_tao"));
    }

    static UUID requireUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null) {
            throw new ReviewModerationFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException e) {
            throw new ReviewModerationFailure(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ.");
        }
    }

    static String normalizeReasonCode(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return raw.strip().toUpperCase(Locale.ROOT);
    }

    static String normalizeText(String raw, int maxLen, String code, String tooLongMsg) {
        if (raw == null) return "";
        String stripped = raw.strip();
        if (stripped.length() > maxLen) {
            throw new ReviewModerationFailure(400, code, tooLongMsg);
        }
        return stripped;
    }

    static String normalizeClientRequestId(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String stripped = raw.strip();
        if (stripped.length() > MAX_CLIENT_REQUEST_ID_LENGTH || stripped.chars().anyMatch(Character::isISOControl)) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Mã yêu cầu không hợp lệ.");
        }
        return stripped;
    }

    static List<UUID> deduplicateIds(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        Set<UUID> unique = new LinkedHashSet<>();
        for (UUID id : ids) {
            if (id == null) {
                throw new ReviewModerationFailure(400, "INVALID_INPUT", "Danh sách mã đính kèm chứa giá trị rỗng.");
            }
            unique.add(id);
        }
        return List.copyOf(unique);
    }

    static String normalizeQueueType(String raw) {
        if (raw == null || raw.isBlank()) return "ALL";
        String val = raw.strip().toUpperCase(Locale.ROOT);
        if (!Set.of("ALL", CASE_COMPLAINT, CASE_LOW_STAR_REVIEW).contains(val)) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Bộ lọc loại hồ sơ không hợp lệ.");
        }
        return val;
    }

    static String normalizeQueueStatus(String raw) {
        if (raw == null || raw.isBlank()) return "PENDING";
        String val = raw.strip().toUpperCase(Locale.ROOT);
        if (!Set.of("PENDING", "PROCESSED").contains(val)) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Bộ lọc trạng thái hàng chờ không hợp lệ.");
        }
        return val;
    }

    static String requireCaseType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Loại hồ sơ không hợp lệ.");
        }
        String val = raw.strip().toUpperCase(Locale.ROOT);
        if (!Set.of(CASE_COMPLAINT, CASE_LOW_STAR_REVIEW).contains(val)) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Loại hồ sơ phải là COMPLAINT hoặc LOW_STAR_REVIEW.");
        }
        return val;
    }

    static String normalizeAction(String raw, Set<String> allowed) {
        if (raw == null || raw.isBlank()) {
            throw new ReviewModerationFailure(400, "INVALID_ACTION", "Vui lòng chọn hành động kiểm duyệt.");
        }
        String val = raw.strip().toUpperCase(Locale.ROOT);
        if (!allowed.contains(val)) {
            throw new ReviewModerationFailure(400, "INVALID_ACTION", "Hành động kiểm duyệt không hợp lệ.");
        }
        return val;
    }

    static String normalizeTargetParty(String raw, String defaultParty) {
        if (raw == null || raw.isBlank()) return defaultParty;
        String val = raw.strip().toUpperCase(Locale.ROOT);
        if (!Set.of("BUYER", "SELLER").contains(val)) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Đối tượng yêu cầu bổ sung phải là BUYER hoặc SELLER.");
        }
        return val;
    }

    private static void validatePageBounds(int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > 1_000_000L) {
            throw new ReviewModerationFailure(400, "INVALID_INPUT", "Tham số phân trang không hợp lệ.");
        }
    }
}
