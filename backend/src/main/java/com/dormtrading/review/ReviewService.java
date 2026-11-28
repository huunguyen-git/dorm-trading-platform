package com.dormtrading.review;

import com.dormtrading.catalog.ListingDtos;
import com.dormtrading.catalog.ListingValidation;
import com.dormtrading.iam.auth.AccountRestrictedFailure;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.order.OrderDtos;
import com.dormtrading.order.OrderNotificationService;
import com.dormtrading.review.reputation.ReputationLedgerEntry;
import com.dormtrading.review.reputation.ReputationLedgerService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Core service for P3-04 Reviews: Create (UC-30), Edit (UC-31), Soft-Delete (UC-32),
 * Order Review State, and Public Seller Reviews (FR-10, FR-12, NFR-01, NFR-03).
 *
 * <p>Enforces the platform-wide deadlock-free lock hierarchy compatible with
 * {@code OrderService}, {@code ListingService}, and {@code ReputationLedgerService}:
 * (1) {@code thanh_viens (canonical UUID ASC; seller FOR UPDATE, buyer FOR KEY SHARE)}
 * -> (2) {@code giao_dichs (FOR NO KEY UPDATE)}
 * -> (3) {@code danh_gias (FOR NO KEY UPDATE)}.
 */
@Service
@Transactional
public class ReviewService {

    public static final int MAX_SELLER_REVIEWS_PAGE_SIZE = 50;

    private final JdbcTemplate db;
    private final Clock clock;
    private final ReputationLedgerService reputationLedger;
    private final OrderNotificationService notificationService;
    private final ObjectMapper objectMapper;

    public ReviewService(
            JdbcTemplate db,
            Clock clock,
            ReputationLedgerService reputationLedger,
            OrderNotificationService notificationService,
            ObjectMapper objectMapper
    ) {
        this.db = db;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.reputationLedger = reputationLedger;
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private record OrderLookup(UUID orderId, UUID listingId, UUID sellerId, UUID buyerId) {
    }

    private record ReviewLookup(UUID reviewId, UUID orderId, UUID listingId, UUID buyerId, UUID sellerId) {
    }

    private record LockedOrder(
            UUID id,
            UUID listingId,
            String listingTitle,
            UUID sellerId,
            UUID buyerId,
            String status,
            Instant completedAt,
            boolean noReviewBonusApplied,
            Instant noReviewBonusAppliedAt
    ) {
    }

    private record LockedReview(
            UUID id,
            UUID orderId,
            UUID buyerId,
            UUID sellerId,
            int rating,
            String comment,
            String status,
            int currentVersionNo,
            int appliedScoreDelta,
            Instant createdAt,
            Instant queueEnteredAt,
            Instant publishedAt,
            Instant moderatedAt,
            UUID moderatorId,
            String createIdempotencyKey,
            Instant deletedAt,
            Instant updatedAt,
            long version
    ) {
    }

    private record EvidenceMeta(
            UUID id,
            UUID orderId,
            UUID reviewId,
            UUID uploaderId,
            String contentType,
            long sizeBytes,
            String originalFilename,
            String sha256,
            Instant createdAt
    ) {
    }

    // =========================================================================
    // UC-30: Đánh giá giao dịch (Create Review)
    // =========================================================================

    public ReviewDtos.ReviewMutationResponse createReview(
            UUID buyerId,
            UUID orderId,
            ReviewDtos.CreateReviewRequest req,
            String headerIdempotencyKey
    ) {
        if (buyerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (orderId == null || req == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thông tin đánh giá không hợp lệ.");
        }

        int rating = validateRating(req.rating());
        String comment = ListingValidation.optionalText(
                req.comment(),
                ReviewPolicy.MAX_COMMENT_LENGTH,
                "Nhận xét không được vượt quá " + ReviewPolicy.MAX_COMMENT_LENGTH + " ký tự."
        );
        List<UUID> evidenceIds = normalizeEvidenceIds(req.evidenceIds());
        validateRatingDetails(rating, comment, evidenceIds);

        String rawIdempKey = (req.idempotencyKey() != null && !req.idempotencyKey().isBlank())
                ? req.idempotencyKey()
                : headerIdempotencyKey;
        String idempotencyKey = ListingValidation.optionalText(
                rawIdempKey,
                ReviewPolicy.MAX_IDEMPOTENCY_KEY_LENGTH,
                "Khóa chống gửi lặp không được vượt quá " + ReviewPolicy.MAX_IDEMPOTENCY_KEY_LENGTH + " ký tự."
        );

        OrderLookup lookup = lookupOrderOrThrow(orderId);
        if (!lookup.buyerId().equals(buyerId)) {
            throw new AuthFailure(403, "FORBIDDEN", "Chỉ người mua của giao dịch mới có quyền gửi đánh giá.");
        }

        // Strict global lock order: (1) thanh_viens (canonical ASC) -> (2) giao_dichs
        lockSellerAndVerifyBuyerCanonical(buyerId, lookup.sellerId());
        LockedOrder order = lockOrderForUpdate(orderId);
        Instant current = now();

        if (!"HOAN_TAT".equals(order.status()) || order.completedAt() == null) {
            throw new AuthFailure(409, "ORDER_NOT_COMPLETED", "Chỉ có thể đánh giá sau khi giao dịch đã hoàn tất.");
        }

        // Check if an active (non-DA_XOA) review already exists for this order
        LockedReview existingActive = findActiveReviewForOrder(orderId);
        if (existingActive != null) {
            if (idempotencyKey != null
                    && existingActive.currentVersionNo() == 1
                    && idempotencyKey.equals(existingActive.createIdempotencyKey())) {
                ReviewDtos.ReviewDetailDto detail = loadReviewDetail(existingActive.id(), buyerId, false);
                ReviewDtos.OrderReviewStateDto state = loadOrderReviewState(orderId, buyerId, false);
                return new ReviewDtos.ReviewMutationResponse(detail, state, true);
            }
            throw new AuthFailure(
                    409,
                    "REVIEW_ALREADY_EXISTS",
                    "Mỗi giao dịch chỉ được đánh giá một lần. Bạn có thể chỉnh sửa đánh giá hiện có."
            );
        }

        if (order.noReviewBonusApplied()) {
            throw new AuthFailure(
                    409,
                    "NO_REVIEW_BONUS_ALREADY_APPLIED",
                    "Giao dịch đã hết hạn đánh giá và đã áp dụng cộng +1 điểm uy tín cho người bán."
            );
        }

        if (!ReviewPolicy.isWithinReviewWindow(order.completedAt(), current)) {
            throw new AuthFailure(
                    409,
                    "REVIEW_WINDOW_EXPIRED",
                    "Đã hết thời hạn 15 ngày kể từ khi giao dịch hoàn tất để gửi đánh giá."
            );
        }

        List<EvidenceMeta> evidenceList = validateAndLoadEvidenceForCreate(buyerId, orderId, evidenceIds);

        ReviewDtos.ReviewStatus initialStatus = ReviewPolicy.statusForSubmittedRating(rating);
        boolean autoAccepted = initialStatus == ReviewDtos.ReviewStatus.CHAP_NHAN;
        int targetDelta = ReviewPolicy.immediateScoreDeltaForRating(rating);

        UUID reviewId = UUID.randomUUID();
        Timestamp tsNow = Timestamp.from(current);
        Timestamp tsQueueEntered = autoAccepted ? null : tsNow;
        Timestamp tsPublished = autoAccepted ? tsNow : null;

        try {
            db.update(
                    """
                    INSERT INTO danh_gias(
                        ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id,
                        so_sao, nhan_xet, trang_thai, phien_ban_hien_tai, diem_da_ap_dung,
                        thoi_diem_tao, queue_entered_at, thoi_diem_cong_khai,
                        create_idempotency_key, updated_at, version
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, 0)
                    """,
                    reviewId,
                    orderId,
                    buyerId,
                    order.sellerId(),
                    rating,
                    comment,
                    initialStatus.name(),
                    tsNow,
                    tsQueueEntered,
                    tsPublished,
                    idempotencyKey,
                    tsNow
            );
        } catch (DataIntegrityViolationException ex) {
            throw new AuthFailure(
                    409,
                    "REVIEW_ALREADY_EXISTS",
                    "Mỗi giao dịch chỉ được đánh giá một lần. Bạn có thể chỉnh sửa đánh giá hiện có."
            );
        }

        attachEvidenceToReview(reviewId, evidenceIds);

        int appliedDelta = 0;
        UUID applyLedgerEntryId = null;
        if (targetDelta != 0) {
            ReputationLedgerEntry entry = reputationLedger.recordScoreChange(
                    order.sellerId(),
                    ReputationLedgerService.CHANGE_TRANSACTION_REVIEW,
                    targetDelta,
                    "Nhận đánh giá " + rating + " sao cho giao dịch hoàn tất \"" + order.listingTitle() + "\"",
                    "REVIEW_VERSION",
                    reviewId + ":v1",
                    "REVIEW_APPLY:" + reviewId + ":v1",
                    buyerId
            );
            appliedDelta = entry.delta();
            applyLedgerEntryId = entry.id();
            db.update(
                    "UPDATE danh_gias SET diem_da_ap_dung = ? WHERE ma_danh_gia = ?",
                    appliedDelta,
                    reviewId
            );
        }

        insertReviewVersion(
                reviewId,
                1,
                rating,
                comment,
                evidenceIds,
                evidenceList,
                initialStatus.name(),
                appliedDelta,
                applyLedgerEntryId,
                tsNow
        );

        if (autoAccepted) {
            notificationService.notifyUser(
                    order.sellerId(),
                    OrderDtos.NotificationType.REVIEW_RECEIVED,
                    "Bạn vừa nhận được đánh giá " + rating + " sao",
                    "Người mua vừa gửi đánh giá " + rating + " sao cho giao dịch \"" + order.listingTitle() + "\"."
                            + (appliedDelta > 0 ? " Điểm uy tín của bạn đã được cộng +" + appliedDelta + "." : ""),
                    order.listingId(),
                    orderId
            );
        } else {
            notificationService.notifyUser(
                    buyerId,
                    OrderDtos.NotificationType.REVIEW_PENDING_MODERATION,
                    "Đánh giá của bạn đang chờ kiểm duyệt",
                    "Đánh giá " + rating + " sao cho giao dịch \"" + order.listingTitle()
                            + "\" đã được ghi nhận và chuyển sang hàng chờ Kiểm duyệt viên xem xét trước khi công khai.",
                    order.listingId(),
                    orderId
            );
        }

        ReviewDtos.ReviewDetailDto detail = loadReviewDetail(reviewId, buyerId, false);
        ReviewDtos.OrderReviewStateDto state = loadOrderReviewState(orderId, buyerId, false);
        return new ReviewDtos.ReviewMutationResponse(detail, state, false);
    }

    // =========================================================================
    // UC-31: Chỉnh sửa đánh giá giao dịch (Edit Review)
    // =========================================================================

    public ReviewDtos.ReviewMutationResponse editReview(
            UUID buyerId,
            UUID reviewId,
            ReviewDtos.UpdateReviewRequest req
    ) {
        if (buyerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (reviewId == null || req == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thông tin chỉnh sửa đánh giá không hợp lệ.");
        }
        if (req.expectedVersion() == null || req.expectedVersion() < 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thiếu phiên bản đối chiếu (expectedVersion) hợp lệ.");
        }

        int newRating = validateRating(req.rating());
        String newComment = ListingValidation.optionalText(
                req.comment(),
                ReviewPolicy.MAX_COMMENT_LENGTH,
                "Nhận xét không được vượt quá " + ReviewPolicy.MAX_COMMENT_LENGTH + " ký tự."
        );
        List<UUID> newEvidenceIds = normalizeEvidenceIds(req.evidenceIds());
        validateRatingDetails(newRating, newComment, newEvidenceIds);

        ReviewLookup lookup = lookupReviewOrThrow(reviewId);
        if (!lookup.buyerId().equals(buyerId)) {
            throw new AuthFailure(403, "FORBIDDEN", "Chỉ người mua đã gửi đánh giá mới có quyền chỉnh sửa.");
        }

        // Strict global lock order: (1) thanh_viens -> (2) giao_dichs -> (3) danh_gias
        lockSellerAndVerifyBuyerCanonical(buyerId, lookup.sellerId());
        LockedOrder order = lockOrderForUpdate(lookup.orderId());
        LockedReview review = lockReviewForUpdate(reviewId);
        Instant current = now();

        if (ReviewDtos.ReviewStatus.DA_XOA.name().equals(review.status())) {
            throw new AuthFailure(409, "REVIEW_DELETED", "Đánh giá này đã bị xóa nên không thể chỉnh sửa.");
        }

        String complaintStatus = findLockingComplaintStatus(reviewId);
        if (ReviewPolicy.isComplaintLocked(review.status(), complaintStatus)) {
            throw new AuthFailure(
                    409,
                    "REVIEW_COMPLAINT_LOCKED",
                    "Đánh giá đang bị khiếu nại hoặc đã bị gỡ theo khiếu nại nên không thể chỉnh sửa."
            );
        }

        if (ReviewPolicy.isModerated(review.status(), review.moderatedAt(), review.moderatorId())) {
            throw new AuthFailure(
                    409,
                    "REVIEW_MODERATED",
                    "Đánh giá đã có quyết định xét duyệt của Kiểm duyệt viên nên không thể chỉnh sửa."
            );
        }

        if (!ReviewPolicy.isWithinReviewWindow(order.completedAt(), current)) {
            throw new AuthFailure(
                    409,
                    "REVIEW_WINDOW_EXPIRED",
                    "Đã hết thời hạn 15 ngày kể từ khi hoàn tất giao dịch để chỉnh sửa đánh giá."
            );
        }

        if (req.expectedVersion().longValue() != review.version()) {
            throw new AuthFailure(
                    409,
                    "VERSION_CONFLICT",
                    "Đánh giá vừa được cập nhật ở nơi khác. Vui lòng tải lại phiên bản mới nhất."
            );
        }

        List<EvidenceMeta> newEvidenceList = validateAndLoadEvidenceForEdit(buyerId, order.id(), reviewId, newEvidenceIds);
        List<UUID> currentActiveEvidenceIds = loadActiveEvidenceIds(reviewId);

        boolean sameRating = newRating == review.rating();
        boolean sameComment = Objects.equals(newComment, normalizeStoredComment(review.comment()));
        boolean sameEvidence = new HashSet<>(newEvidenceIds).equals(new HashSet<>(currentActiveEvidenceIds));
        if (sameRating && sameComment && sameEvidence) {
            throw new AuthFailure(
                    400,
                    "REVIEW_NO_CHANGES",
                    "Nội dung đánh giá chưa có thay đổi nào so với phiên bản hiện tại."
            );
        }

        ReviewDtos.ReviewStatus newStatusEnum = ReviewPolicy.statusForSubmittedRating(newRating);
        String newStatus = newStatusEnum.name();
        boolean wasAccepted = ReviewDtos.ReviewStatus.CHAP_NHAN.name().equals(review.status());
        boolean isAccepted = newStatusEnum == ReviewDtos.ReviewStatus.CHAP_NHAN;
        boolean isPending = newStatusEnum == ReviewDtos.ReviewStatus.CHO_XET;

        int oldVersionNo = review.currentVersionNo();
        int newVersionNo = oldVersionNo + 1;
        Timestamp tsNow = Timestamp.from(current);

        // UC-31 Alt 2: editing a CHO_XET review preserves its original queue_entered_at position!
        Instant nextQueueEnteredAt = isPending
                ? (review.queueEnteredAt() != null ? review.queueEnteredAt() : current)
                : null;
        // UC-33 forward-compat: refresh thoi_diem_cong_khai on every edit resulting in CHAP_NHAN
        // so buyer cannot bypass the 7-day seller complaint window by editing a review later.
        Instant nextPublishedAt = isAccepted ? current : null;

        int previousAppliedDelta = review.appliedScoreDelta();
        int targetDelta = ReviewPolicy.immediateScoreDeltaForRating(newRating);
        int nextAppliedDelta = previousAppliedDelta;
        UUID applyLedgerEntryId = null;

        // Atomic score delta transition:
        // - If targetDelta == previousAppliedDelta (e.g. 5* -> 5* comment edit), carry over previous
        //   apply_ledger_entry_id without ledger churn and eliminate any 0-score clamp inflation exploit.
        // - Otherwise reverse previousAppliedDelta (if != 0) and apply targetDelta (if != 0) in ONE tx!
        if (targetDelta == previousAppliedDelta) {
            if (previousAppliedDelta != 0) {
                List<UUID> carriedIds = db.queryForList(
                        "SELECT apply_ledger_entry_id FROM danh_gia_phien_bans WHERE ma_danh_gia = ? AND version_no = ?",
                        UUID.class,
                        reviewId,
                        oldVersionNo
                );
                if (!carriedIds.isEmpty()) {
                    applyLedgerEntryId = carriedIds.getFirst();
                }
            }
        } else {
            if (previousAppliedDelta != 0) {
                ReputationLedgerEntry reversal = reputationLedger.recordReviewReversal(
                        order.sellerId(),
                        -previousAppliedDelta,
                        "Hoàn tác điểm uy tín phiên bản v" + oldVersionNo + " do người mua chỉnh sửa đánh giá giao dịch \""
                                + order.listingTitle() + "\"",
                        "REVIEW_REVERSAL",
                        reviewId + ":v" + oldVersionNo,
                        "REVIEW_REVERSE:" + reviewId + ":v" + oldVersionNo,
                        buyerId
                );
                db.update(
                        """
                        UPDATE danh_gia_phien_bans
                        SET reverse_ledger_entry_id = ?, reversed_at = ?
                        WHERE ma_danh_gia = ? AND version_no = ?
                        """,
                        reversal.id(),
                        tsNow,
                        reviewId,
                        oldVersionNo
                );
                nextAppliedDelta = 0;
            }
            if (targetDelta != 0) {
                ReputationLedgerEntry applied = reputationLedger.recordScoreChange(
                        order.sellerId(),
                        ReputationLedgerService.CHANGE_TRANSACTION_REVIEW,
                        targetDelta,
                        "Áp dụng điểm uy tín từ đánh giá " + newRating + " sao (phiên bản v" + newVersionNo
                                + ") cho giao dịch \"" + order.listingTitle() + "\"",
                        "REVIEW_VERSION",
                        reviewId + ":v" + newVersionNo,
                        "REVIEW_APPLY:" + reviewId + ":v" + newVersionNo,
                        buyerId
                );
                applyLedgerEntryId = applied.id();
                nextAppliedDelta = applied.delta();
            }
        }

        // Preserve historical evidence rows on review (active=FALSE) and activate the new set
        db.update("UPDATE danh_gia_bang_chungs SET active = FALSE WHERE ma_danh_gia = ?", reviewId);
        attachEvidenceToReview(reviewId, newEvidenceIds);

        db.update(
                """
                UPDATE danh_gias
                SET so_sao = ?,
                    nhan_xet = ?,
                    trang_thai = ?,
                    phien_ban_hien_tai = ?,
                    diem_da_ap_dung = ?,
                    queue_entered_at = ?,
                    thoi_diem_cong_khai = ?,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_danh_gia = ?
                """,
                newRating,
                newComment,
                newStatus,
                newVersionNo,
                nextAppliedDelta,
                nextQueueEnteredAt != null ? Timestamp.from(nextQueueEnteredAt) : null,
                nextPublishedAt != null ? Timestamp.from(nextPublishedAt) : null,
                tsNow,
                reviewId
        );

        insertReviewVersion(
                reviewId,
                newVersionNo,
                newRating,
                newComment,
                newEvidenceIds,
                newEvidenceList,
                newStatus,
                nextAppliedDelta,
                applyLedgerEntryId,
                tsNow
        );

        if (wasAccepted || isAccepted) {
            String sellerMessage = isAccepted
                    ? "Người mua vừa chỉnh sửa đánh giá cho giao dịch \"" + order.listingTitle()
                            + "\" thành " + newRating + " sao."
                    : "Người mua vừa chỉnh sửa đánh giá cho giao dịch \"" + order.listingTitle()
                            + "\" và đánh giá đã được chuyển sang hàng chờ kiểm duyệt; tác động điểm trước đó (nếu có) đã được hoàn lại.";
            notificationService.notifyUser(
                    order.sellerId(),
                    OrderDtos.NotificationType.REVIEW_UPDATED,
                    "Đánh giá giao dịch đã được cập nhật",
                    sellerMessage,
                    order.listingId(),
                    order.id()
            );
        }
        if (isPending) {
            notificationService.notifyUser(
                    buyerId,
                    OrderDtos.NotificationType.REVIEW_PENDING_MODERATION,
                    "Bản chỉnh sửa đánh giá đang chờ kiểm duyệt",
                    "Phiên bản mới (" + newRating + " sao) của đánh giá cho giao dịch \"" + order.listingTitle()
                            + "\" đang chờ Kiểm duyệt viên xem xét.",
                    order.listingId(),
                    order.id()
            );
        }

        ReviewDtos.ReviewDetailDto detail = loadReviewDetail(reviewId, buyerId, false);
        ReviewDtos.OrderReviewStateDto state = loadOrderReviewState(order.id(), buyerId, false);
        return new ReviewDtos.ReviewMutationResponse(detail, state, false);
    }

    // =========================================================================
    // UC-32: Xóa đánh giá giao dịch (Soft-Delete Review)
    // =========================================================================

    public ReviewDtos.ReviewMutationResponse deleteReview(
            UUID buyerId,
            UUID reviewId,
            Long expectedVersion
    ) {
        if (buyerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (reviewId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã đánh giá không hợp lệ.");
        }
        if (expectedVersion != null && expectedVersion < 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Phiên bản đối chiếu (expectedVersion) không hợp lệ.");
        }

        ReviewLookup lookup = lookupReviewOrThrow(reviewId);
        if (!lookup.buyerId().equals(buyerId)) {
            throw new AuthFailure(
                    403,
                    "FORBIDDEN",
                    "Chỉ người mua đã gửi đánh giá mới có quyền xóa. Người bán muốn gỡ đánh giá vui lòng dùng chức năng khiếu nại."
            );
        }

        // Strict global lock order: (1) thanh_viens -> (2) giao_dichs -> (3) danh_gias
        lockSellerAndVerifyBuyerCanonical(buyerId, lookup.sellerId());
        LockedOrder order = lockOrderForUpdate(lookup.orderId());
        LockedReview review = lockReviewForUpdate(reviewId);
        Instant current = now();

        // UC-32 & NFR-03 idempotent replay: repeated delete on already DA_XOA review never reverses score twice
        if (ReviewDtos.ReviewStatus.DA_XOA.name().equals(review.status())) {
            ReviewDtos.ReviewDetailDto detail = loadReviewDetail(reviewId, buyerId, false);
            ReviewDtos.OrderReviewStateDto state = loadOrderReviewState(order.id(), buyerId, false);
            return new ReviewDtos.ReviewMutationResponse(detail, state, true);
        }

        String complaintStatus = findLockingComplaintStatus(reviewId);
        if (ReviewPolicy.isComplaintLocked(review.status(), complaintStatus)) {
            throw new AuthFailure(
                    409,
                    "REVIEW_COMPLAINT_LOCKED",
                    "Đánh giá đang bị khiếu nại hoặc đã bị gỡ theo khiếu nại nên không thể xóa."
            );
        }

        if (ReviewPolicy.isModerated(review.status(), review.moderatedAt(), review.moderatorId())) {
            throw new AuthFailure(
                    409,
                    "REVIEW_MODERATED",
                    "Đánh giá đã có quyết định xét duyệt của Kiểm duyệt viên nên không thể xóa."
            );
        }

        if (expectedVersion != null && expectedVersion.longValue() != review.version()) {
            throw new AuthFailure(
                    409,
                    "VERSION_CONFLICT",
                    "Đánh giá vừa được thay đổi đồng thời. Vui lòng tải lại trước khi xóa."
            );
        }

        Timestamp tsNow = Timestamp.from(current);
        int previousAppliedDelta = review.appliedScoreDelta();
        if (previousAppliedDelta != 0) {
            ReputationLedgerEntry reversal = reputationLedger.recordReviewReversal(
                    order.sellerId(),
                    -previousAppliedDelta,
                    "Hoàn tác điểm uy tín do người mua xóa đánh giá giao dịch \"" + order.listingTitle() + "\"",
                    "REVIEW_REVERSAL",
                    reviewId + ":v" + review.currentVersionNo(),
                    "REVIEW_REVERSE:" + reviewId + ":v" + review.currentVersionNo(),
                    buyerId
            );
            db.update(
                    """
                    UPDATE danh_gia_phien_bans
                    SET reverse_ledger_entry_id = ?, reversed_at = ?
                    WHERE ma_danh_gia = ? AND version_no = ?
                    """,
                    reversal.id(),
                    tsNow,
                    reviewId,
                    review.currentVersionNo()
            );
        }

        db.update(
                """
                UPDATE danh_gias
                SET trang_thai = 'DA_XOA',
                    diem_da_ap_dung = 0,
                    queue_entered_at = NULL,
                    thoi_diem_cong_khai = NULL,
                    deleted_at = ?,
                    updated_at = ?,
                    version = version + 1
                WHERE ma_danh_gia = ?
                """,
                tsNow,
                tsNow,
                reviewId
        );

        boolean wasAccepted = ReviewDtos.ReviewStatus.CHAP_NHAN.name().equals(review.status());
        if (wasAccepted) {
            notificationService.notifyUser(
                    order.sellerId(),
                    OrderDtos.NotificationType.REVIEW_DELETED,
                    "Đánh giá giao dịch đã bị gỡ bởi người mua",
                    "Người mua đã xóa đánh giá cho giao dịch \"" + order.listingTitle() + "\"."
                            + (previousAppliedDelta != 0 ? " Tác động điểm trước đó đã được hoàn lại." : ""),
                    order.listingId(),
                    order.id()
            );
        }

        ReviewDtos.ReviewDetailDto deletedDetail = loadReviewDetail(reviewId, buyerId, false);
        ReviewDtos.OrderReviewStateDto freshState = loadOrderReviewState(order.id(), buyerId, false);
        return new ReviewDtos.ReviewMutationResponse(deletedDetail, freshState, false);
    }

    // =========================================================================
    // Query: Order Review State & Capabilities (Buyer, Seller, Mod, Senior Admin)
    // =========================================================================

    @Transactional(readOnly = true)
    public ReviewDtos.OrderReviewStateDto getOrderReviewState(
            UUID orderId,
            UUID viewerId,
            boolean isModeratorOrSeniorAdmin
    ) {
        if (viewerId == null) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        if (orderId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã giao dịch không hợp lệ.");
        }
        return loadOrderReviewState(orderId, viewerId, isModeratorOrSeniorAdmin);
    }

    // =========================================================================
    // Query: Public Seller Reviews & Rating Summary (NFR-01 Zero-PII, Zero-Evidence)
    // =========================================================================

    @Transactional(readOnly = true)
    public ReviewDtos.SellerReviewsResponse getPublicSellerReviews(
            UUID sellerId,
            Integer ratingFilter,
            int page,
            int size
    ) {
        if (sellerId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã người bán không hợp lệ.");
        }
        if (ratingFilter != null && (ratingFilter < ReviewPolicy.MIN_RATING || ratingFilter > ReviewPolicy.MAX_RATING)) {
            throw new AuthFailure(400, "INVALID_INPUT", "Bộ lọc số sao phải từ 1 đến 5.");
        }
        int validPage = ListingValidation.validatePage(page);
        if (size < 1 || size > MAX_SELLER_REVIEWS_PAGE_SIZE) {
            throw new AuthFailure(
                    400,
                    "INVALID_INPUT",
                    "Kích thước trang phải từ 1 đến " + MAX_SELLER_REVIEWS_PAGE_SIZE + "."
            );
        }

        List<Map<String, Object>> sellerRows = db.queryForList(
                """
                SELECT user_id, ho_ten, diem_uy_tin, trang_thai_tai_khoan
                FROM thanh_viens
                WHERE user_id = ?
                """,
                sellerId
        );
        if (sellerRows.isEmpty()
                || "VO_HIEU_HOA".equals(sellerRows.getFirst().get("trang_thai_tai_khoan"))
                || "CHO_KICH_HOAT".equals(sellerRows.getFirst().get("trang_thai_tai_khoan"))) {
            throw new AuthFailure(404, "SELLER_NOT_FOUND", "Không tìm thấy hồ sơ người bán.");
        }
        Map<String, Object> sellerRow = sellerRows.getFirst();

        // Aggregate across ALL CHAP_NHAN reviews for this seller
        Map<Integer, Long> distribution = new LinkedHashMap<>();
        for (int star = 5; star >= 1; star--) {
            distribution.put(star, 0L);
        }

        List<Map<String, Object>> distRows = db.queryForList(
                """
                SELECT so_sao, COUNT(*)::bigint AS cnt
                FROM danh_gias
                WHERE nguoi_bi_danh_gia_id = ?
                  AND trang_thai = 'CHAP_NHAN'
                GROUP BY so_sao
                """,
                sellerId
        );
        long totalAccepted = 0L;
        long starSum = 0L;
        for (Map<String, Object> r : distRows) {
            int star = ((Number) r.get("so_sao")).intValue();
            long cnt = ((Number) r.get("cnt")).longValue();
            if (distribution.containsKey(star)) {
                distribution.put(star, cnt);
            }
            totalAccepted += cnt;
            starSum += (long) star * cnt;
        }
        Double averageRating = totalAccepted > 0
                ? Math.round(((double) starSum / totalAccepted) * 100.0) / 100.0
                : null;

        ListingDtos.SellerPublicSummaryDto sellerSummary = new ListingDtos.SellerPublicSummaryDto(
                sellerId,
                String.valueOf(sellerRow.get("ho_ten")),
                ((Number) sellerRow.get("diem_uy_tin")).intValue(),
                averageRating,
                (int) Math.min(Integer.MAX_VALUE, totalAccepted)
        );

        StringBuilder where = new StringBuilder(
                " WHERE d.nguoi_bi_danh_gia_id = ? AND d.trang_thai = 'CHAP_NHAN' "
        );
        List<Object> params = new ArrayList<>();
        params.add(sellerId);
        if (ratingFilter != null) {
            where.append(" AND d.so_sao = ? ");
            params.add(ratingFilter);
        }

        Long filteredTotalObj = db.queryForObject(
                "SELECT COUNT(*) FROM danh_gias d" + where,
                Long.class,
                params.toArray()
        );
        long filteredTotal = filteredTotalObj != null ? filteredTotalObj : 0L;

        List<Object> pageParams = new ArrayList<>(params);
        pageParams.add(size);
        pageParams.add((long) validPage * size);

        List<ReviewDtos.PublicSellerReviewItemDto> items = db.query(
                """
                SELECT d.ma_danh_gia, d.ma_giao_dich, g.ma_tin, t.tieu_de AS listing_title,
                       b.ho_ten AS buyer_name, d.so_sao, d.nhan_xet, d.phien_ban_hien_tai,
                       COALESCE(d.thoi_diem_cong_khai, d.thoi_diem_tao) AS published_at,
                       d.thoi_diem_tao, d.updated_at
                FROM danh_gias d
                JOIN giao_dichs g ON g.ma_giao_dich = d.ma_giao_dich
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                JOIN thanh_viens b ON b.user_id = d.nguoi_danh_gia_id
                """
                        + where
                        + " ORDER BY COALESCE(d.thoi_diem_cong_khai, d.thoi_diem_tao) DESC, d.ma_danh_gia DESC LIMIT ? OFFSET ?",
                (rs, rowNum) -> new ReviewDtos.PublicSellerReviewItemDto(
                        rs.getObject("ma_danh_gia", UUID.class),
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getString("listing_title"),
                        rs.getString("buyer_name"),
                        rs.getInt("so_sao"),
                        rs.getString("nhan_xet"),
                        rs.getInt("phien_ban_hien_tai") > 1,
                        toInstant(rs.getTimestamp("published_at")),
                        toInstant(rs.getTimestamp("thoi_diem_tao")),
                        toInstant(rs.getTimestamp("updated_at"))
                ),
                pageParams.toArray()
        );

        int totalPages = ListingValidation.calculateTotalPages(filteredTotal, size);
        return new ReviewDtos.SellerReviewsResponse(
                sellerSummary,
                distribution,
                List.copyOf(items),
                validPage,
                size,
                filteredTotal,
                totalPages
        );
    }

    // =========================================================================
    // Internal query & persistence helpers
    // =========================================================================

    private ReviewDtos.OrderReviewStateDto loadOrderReviewState(
            UUID orderId,
            UUID viewerId,
            boolean isModeratorOrSeniorAdmin
    ) {
        List<Map<String, Object>> orderRows = db.queryForList(
                """
                SELECT g.ma_giao_dich, g.ma_tin, t.tieu_de AS listing_title, g.trang_thai,
                       g.nguoi_ban_id, s.ho_ten AS seller_name, s.diem_uy_tin AS seller_score,
                       g.nguoi_mua_id, b.ho_ten AS buyer_name, b.diem_uy_tin AS buyer_score,
                       g.thoi_diem_hoan_tat, g.da_cong_diem_khong_danh_gia, g.thoi_diem_cong_diem_khong_danh_gia
                FROM giao_dichs g
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                JOIN thanh_viens s ON s.user_id = g.nguoi_ban_id
                JOIN thanh_viens b ON b.user_id = g.nguoi_mua_id
                WHERE g.ma_giao_dich = ?
                """,
                orderId
        );
        if (orderRows.isEmpty()) {
            throw new AuthFailure(404, "ORDER_NOT_FOUND", "Không tìm thấy giao dịch.");
        }
        Map<String, Object> order = orderRows.getFirst();
        UUID sellerId = (UUID) order.get("nguoi_ban_id");
        UUID buyerId = (UUID) order.get("nguoi_mua_id");
        boolean isBuyer = buyerId.equals(viewerId);
        boolean isSeller = sellerId.equals(viewerId);

        if (!isBuyer && !isSeller && !isModeratorOrSeniorAdmin) {
            throw new AuthFailure(403, "FORBIDDEN", "Bạn không có quyền xem thông tin đánh giá của giao dịch này.");
        }

        String orderStatus = String.valueOf(order.get("trang_thai"));
        Instant completedAt = toInstant((Timestamp) order.get("thoi_diem_hoan_tat"));
        boolean bonusApplied = Boolean.TRUE.equals(order.get("da_cong_diem_khong_danh_gia"));
        Instant bonusAppliedAt = toInstant((Timestamp) order.get("thoi_diem_cong_diem_khong_danh_gia"));

        LockedReview activeReview = findActiveReviewForOrder(orderId);
        String lockingComplaintStatus = activeReview != null ? findLockingComplaintStatus(activeReview.id()) : null;

        ReviewPolicy.Capabilities caps = ReviewPolicy.evaluateCapabilities(
                isBuyer,
                orderStatus,
                completedAt,
                bonusApplied,
                activeReview != null,
                activeReview != null ? activeReview.status() : null,
                activeReview != null ? activeReview.moderatedAt() : null,
                activeReview != null ? activeReview.moderatorId() : null,
                lockingComplaintStatus,
                now()
        );

        boolean hasPendingModeration = activeReview != null
                && ReviewDtos.ReviewStatus.CHO_XET.name().equals(activeReview.status());

        // Visibility rule:
        // - Buyer, MODERATOR, SENIOR_ADMIN see full active review regardless of status.
        // - Seller sees CHAP_NHAN or DA_GO reviews; CHO_XET / BI_BAC remain hidden from seller's review object.
        ReviewDtos.ReviewDetailDto visibleReview = null;
        if (activeReview != null) {
            boolean sellerCanSeeBody = ReviewDtos.ReviewStatus.CHAP_NHAN.name().equals(activeReview.status())
                    || ReviewDtos.ReviewStatus.DA_GO.name().equals(activeReview.status());
            if (isBuyer || isModeratorOrSeniorAdmin || sellerCanSeeBody) {
                visibleReview = loadReviewDetail(activeReview.id(), viewerId, isModeratorOrSeniorAdmin);
            }
        }

        return new ReviewDtos.OrderReviewStateDto(
                orderId,
                (UUID) order.get("ma_tin"),
                String.valueOf(order.get("listing_title")),
                orderStatus,
                new OrderDtos.PartySummaryDto(
                        sellerId,
                        String.valueOf(order.get("seller_name")),
                        ((Number) order.get("seller_score")).intValue()
                ),
                new OrderDtos.PartySummaryDto(
                        buyerId,
                        String.valueOf(order.get("buyer_name")),
                        ((Number) order.get("buyer_score")).intValue()
                ),
                completedAt,
                caps.reviewDeadlineAt(),
                caps.daysRemaining(),
                caps.withinReviewWindow(),
                bonusApplied,
                bonusAppliedAt,
                caps.canReview(),
                caps.canEdit(),
                caps.canDelete(),
                caps.lockReason(),
                caps.lockMessage(),
                hasPendingModeration,
                visibleReview
        );
    }

    private ReviewDtos.ReviewDetailDto loadReviewDetail(UUID reviewId, UUID viewerId, boolean isModeratorOrSeniorAdmin) {
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT d.ma_danh_gia, d.ma_giao_dich, g.ma_tin, t.tieu_de AS listing_title,
                       d.nguoi_danh_gia_id, b.ho_ten AS buyer_name,
                       d.nguoi_bi_danh_gia_id, s.ho_ten AS seller_name,
                       d.so_sao, d.nhan_xet, d.trang_thai, d.phien_ban_hien_tai, d.diem_da_ap_dung,
                       d.thoi_diem_tao, d.thoi_diem_xet, d.nguoi_xet_id, d.queue_entered_at,
                       d.thoi_diem_cong_khai, d.deleted_at, d.updated_at, d.version
                FROM danh_gias d
                JOIN giao_dichs g ON g.ma_giao_dich = d.ma_giao_dich
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                JOIN thanh_viens b ON b.user_id = d.nguoi_danh_gia_id
                JOIN thanh_viens s ON s.user_id = d.nguoi_bi_danh_gia_id
                WHERE d.ma_danh_gia = ?
                """,
                reviewId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "REVIEW_NOT_FOUND", "Không tìm thấy đánh giá.");
        }
        Map<String, Object> r = rows.getFirst();
        UUID reviewBuyerId = (UUID) r.get("nguoi_danh_gia_id");
        String status = String.valueOf(r.get("trang_thai"));
        Instant moderatedAt = toInstant((Timestamp) r.get("thoi_diem_xet"));
        Object moderatorId = r.get("nguoi_xet_id");
        String complaintStatus = findLatestComplaintStatus(reviewId);
        boolean canSeeUnmoderatedHistory = isModeratorOrSeniorAdmin || reviewBuyerId.equals(viewerId);

        List<ReviewDtos.EvidenceItemDto> evidence = loadActiveEvidenceItems(reviewId);
        List<ReviewDtos.ReviewVersionDto> versions = loadReviewVersions(reviewId, canSeeUnmoderatedHistory);

        return new ReviewDtos.ReviewDetailDto(
                reviewId,
                (UUID) r.get("ma_giao_dich"),
                (UUID) r.get("ma_tin"),
                String.valueOf(r.get("listing_title")),
                reviewBuyerId,
                String.valueOf(r.get("buyer_name")),
                (UUID) r.get("nguoi_bi_danh_gia_id"),
                String.valueOf(r.get("seller_name")),
                ((Number) r.get("so_sao")).intValue(),
                (String) r.get("nhan_xet"),
                status,
                ReviewDtos.ReviewStatus.CHAP_NHAN.name().equals(status),
                ((Number) r.get("phien_ban_hien_tai")).intValue(),
                ((Number) r.get("diem_da_ap_dung")).intValue(),
                ReviewPolicy.isModerated(status, moderatedAt, moderatorId),
                moderatedAt,
                complaintStatus,
                toInstant((Timestamp) r.get("queue_entered_at")),
                toInstant((Timestamp) r.get("thoi_diem_cong_khai")),
                toInstant((Timestamp) r.get("thoi_diem_tao")),
                toInstant((Timestamp) r.get("updated_at")),
                toInstant((Timestamp) r.get("deleted_at")),
                ((Number) r.get("version")).longValue(),
                evidence,
                versions
        );
    }

    private List<ReviewDtos.EvidenceItemDto> loadActiveEvidenceItems(UUID reviewId) {
        return db.query(
                """
                SELECT id, content_type, size_bytes, original_filename, created_at
                FROM danh_gia_bang_chungs
                WHERE ma_danh_gia = ? AND active = TRUE
                ORDER BY created_at ASC, id ASC
                """,
                (rs, rowNum) -> {
                    UUID id = rs.getObject("id", UUID.class);
                    return new ReviewDtos.EvidenceItemDto(
                            id,
                            ReviewEvidenceService.buildEvidenceUrl(id),
                            rs.getString("content_type"),
                            rs.getLong("size_bytes"),
                            rs.getString("original_filename"),
                            toInstant(rs.getTimestamp("created_at"))
                    );
                },
                reviewId
        );
    }

    private List<UUID> loadActiveEvidenceIds(UUID reviewId) {
        return db.queryForList(
                """
                SELECT id
                FROM danh_gia_bang_chungs
                WHERE ma_danh_gia = ? AND active = TRUE
                ORDER BY created_at ASC, id ASC
                """,
                UUID.class,
                reviewId
        );
    }

    private List<ReviewDtos.ReviewVersionDto> loadReviewVersions(UUID reviewId, boolean includeUnmoderatedHistory) {
        String sql = includeUnmoderatedHistory
                ? """
                  SELECT version_no, so_sao, nhan_xet, evidence_ids, trang_thai,
                         score_delta_applied, reversed_at, created_at
                  FROM danh_gia_phien_bans
                  WHERE ma_danh_gia = ?
                  ORDER BY version_no DESC
                  """
                : """
                  SELECT version_no, so_sao, nhan_xet, evidence_ids, trang_thai,
                         score_delta_applied, reversed_at, created_at
                  FROM danh_gia_phien_bans
                  WHERE ma_danh_gia = ?
                    AND trang_thai IN ('CHAP_NHAN', 'DA_GO')
                  ORDER BY version_no DESC
                  """;
        return db.query(
                sql,
                (rs, rowNum) -> {
                    List<UUID> ids = extractUuidArray(rs, "evidence_ids");
                    return new ReviewDtos.ReviewVersionDto(
                            rs.getInt("version_no"),
                            rs.getInt("so_sao"),
                            rs.getString("nhan_xet"),
                            rs.getString("trang_thai"),
                            rs.getInt("score_delta_applied"),
                            ids.size(),
                            ids,
                            toInstant(rs.getTimestamp("reversed_at")),
                            toInstant(rs.getTimestamp("created_at"))
                    );
                },
                reviewId
        );
    }

    private void insertReviewVersion(
            UUID reviewId,
            int versionNo,
            int rating,
            String comment,
            List<UUID> evidenceIds,
            List<EvidenceMeta> evidenceList,
            String status,
            int scoreDeltaApplied,
            UUID applyLedgerEntryId,
            Timestamp createdAt
    ) {
        UUID[] idArray = evidenceIds.toArray(new UUID[0]);
        String snapshotJson = serializeEvidenceSnapshot(evidenceList);
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                    INSERT INTO danh_gia_phien_bans(
                        ma_danh_gia, version_no, so_sao, nhan_xet, evidence_ids, evidence_snapshot,
                        trang_thai, score_delta_applied, apply_ledger_entry_id, created_at
                    ) VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, ?)
                    """
            );
            ps.setObject(1, reviewId);
            ps.setInt(2, versionNo);
            ps.setInt(3, rating);
            ps.setString(4, comment);
            ps.setArray(5, con.createArrayOf("uuid", idArray));
            ps.setString(6, snapshotJson);
            ps.setString(7, status);
            ps.setInt(8, scoreDeltaApplied);
            ps.setObject(9, applyLedgerEntryId);
            ps.setTimestamp(10, createdAt);
            return ps;
        });
    }

    private String serializeEvidenceSnapshot(List<EvidenceMeta> evidenceList) {
        List<Map<String, Object>> list = new ArrayList<>(evidenceList.size());
        for (EvidenceMeta ev : evidenceList) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", ev.id().toString());
            m.put("contentType", ev.contentType());
            m.put("sizeBytes", ev.sizeBytes());
            if (ev.originalFilename() != null) {
                m.put("originalFilename", ev.originalFilename());
            }
            m.put("sha256", ev.sha256());
            list.add(m);
        }
        try {
            return objectMapper.writeValueAsString(list);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize review evidence snapshot", e);
        }
    }

    private void attachEvidenceToReview(UUID reviewId, List<UUID> evidenceIds) {
        if (evidenceIds.isEmpty()) {
            return;
        }
        UUID[] arr = evidenceIds.toArray(new UUID[0]);
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "UPDATE danh_gia_bang_chungs SET ma_danh_gia = ?, active = TRUE WHERE id = ANY(?)"
            );
            ps.setObject(1, reviewId);
            ps.setArray(2, con.createArrayOf("uuid", arr));
            return ps;
        });
    }

    private List<EvidenceMeta> validateAndLoadEvidenceForCreate(UUID buyerId, UUID orderId, List<UUID> evidenceIds) {
        if (evidenceIds.isEmpty()) {
            return List.of();
        }
        List<EvidenceMeta> rows = loadEvidenceMetaByIds(evidenceIds);
        if (rows.size() != evidenceIds.size()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Một hoặc nhiều tệp bằng chứng không tồn tại.");
        }
        for (EvidenceMeta ev : rows) {
            if (!buyerId.equals(ev.uploaderId())
                    || !orderId.equals(ev.orderId())
                    || ev.reviewId() != null) {
                throw new AuthFailure(
                        400,
                        "INVALID_INPUT",
                        "Tệp bằng chứng không hợp lệ, không thuộc giao dịch này hoặc đã gắn cho đánh giá khác."
                );
            }
        }
        return orderByRequestedIds(evidenceIds, rows);
    }

    private List<EvidenceMeta> validateAndLoadEvidenceForEdit(
            UUID buyerId,
            UUID orderId,
            UUID reviewId,
            List<UUID> evidenceIds
    ) {
        if (evidenceIds.isEmpty()) {
            return List.of();
        }
        List<EvidenceMeta> rows = loadEvidenceMetaByIds(evidenceIds);
        if (rows.size() != evidenceIds.size()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Một hoặc nhiều tệp bằng chứng không tồn tại.");
        }
        for (EvidenceMeta ev : rows) {
            boolean ownedAndSameOrder = buyerId.equals(ev.uploaderId()) && orderId.equals(ev.orderId());
            boolean unattachedOrSameReview = ev.reviewId() == null || reviewId.equals(ev.reviewId());
            if (!ownedAndSameOrder || !unattachedOrSameReview) {
                throw new AuthFailure(
                        400,
                        "INVALID_INPUT",
                        "Tệp bằng chứng không hợp lệ, không thuộc giao dịch này hoặc đã gắn cho đánh giá khác."
                );
            }
        }
        return orderByRequestedIds(evidenceIds, rows);
    }

    private List<EvidenceMeta> loadEvidenceMetaByIds(List<UUID> evidenceIds) {
        UUID[] arr = evidenceIds.toArray(new UUID[0]);
        List<EvidenceMeta> rows = new ArrayList<>(evidenceIds.size());
        db.query(
                con -> {
                    PreparedStatement ps = con.prepareStatement(
                            """
                            SELECT id, ma_giao_dich, ma_danh_gia, nguoi_tai_len_id,
                                   content_type, size_bytes, original_filename, sha256, created_at
                            FROM danh_gia_bang_chungs
                            WHERE id = ANY(?)
                            FOR NO KEY UPDATE
                            """
                    );
                    ps.setArray(1, con.createArrayOf("uuid", arr));
                    return ps;
                },
                rs -> {
                    rows.add(new EvidenceMeta(
                            rs.getObject("id", UUID.class),
                            rs.getObject("ma_giao_dich", UUID.class),
                            rs.getObject("ma_danh_gia", UUID.class),
                            rs.getObject("nguoi_tai_len_id", UUID.class),
                            rs.getString("content_type"),
                            rs.getLong("size_bytes"),
                            rs.getString("original_filename"),
                            rs.getString("sha256").strip(),
                            toInstant(rs.getTimestamp("created_at"))
                    ));
                }
        );
        return rows;
    }

    private static List<EvidenceMeta> orderByRequestedIds(List<UUID> requestedIds, List<EvidenceMeta> loaded) {
        Map<UUID, EvidenceMeta> byId = new LinkedHashMap<>();
        for (EvidenceMeta ev : loaded) {
            byId.put(ev.id(), ev);
        }
        List<EvidenceMeta> ordered = new ArrayList<>(requestedIds.size());
        for (UUID id : requestedIds) {
            EvidenceMeta ev = byId.get(id);
            if (ev != null) {
                ordered.add(ev);
            }
        }
        return List.copyOf(ordered);
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

    private ReviewLookup lookupReviewOrThrow(UUID reviewId) {
        List<ReviewLookup> rows = db.query(
                """
                SELECT d.ma_danh_gia, d.ma_giao_dich, g.ma_tin, d.nguoi_danh_gia_id, d.nguoi_bi_danh_gia_id
                FROM danh_gias d
                JOIN giao_dichs g ON g.ma_giao_dich = d.ma_giao_dich
                WHERE d.ma_danh_gia = ?
                """,
                (rs, rowNum) -> new ReviewLookup(
                        rs.getObject("ma_danh_gia", UUID.class),
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_danh_gia_id", UUID.class),
                        rs.getObject("nguoi_bi_danh_gia_id", UUID.class)
                ),
                reviewId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "REVIEW_NOT_FOUND", "Không tìm thấy đánh giá.");
        }
        return rows.getFirst();
    }

    /**
     * Acquires row locks on {@code thanh_viens} in canonical ascending UUID order BEFORE any
     * {@code giao_dichs} or {@code danh_gias} lock:
     * - Seller receives {@code FOR UPDATE} (matches {@link ReputationLedgerService#recordScoreChange}
     *   so no lock upgrade occurs mid-transaction).
     * - Buyer receives {@code FOR KEY SHARE} and active-account verification.
     */
    private void lockSellerAndVerifyBuyerCanonical(UUID buyerId, UUID sellerId) {
        reputationLedger.reconcileExpiredTemporaryLock(buyerId);
        if (buyerId.toString().compareTo(sellerId.toString()) < 0) {
            List<Map<String, Object>> buyerRows = lockBuyerForKeyShare(buyerId);
            evaluateActiveBuyer(buyerRows);
            lockSellerForUpdate(sellerId);
        } else {
            lockSellerForUpdate(sellerId);
            List<Map<String, Object>> buyerRows = lockBuyerForKeyShare(buyerId);
            evaluateActiveBuyer(buyerRows);
        }
    }

    private List<Map<String, Object>> lockBuyerForKeyShare(UUID buyerId) {
        return db.queryForList(
                """
                SELECT user_id, diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved,
                       khoa_den_ngay, loai_han_che, ly_do_han_che, cho_phep_khieu_nai
                FROM thanh_viens
                WHERE user_id = ?
                FOR KEY SHARE
                """,
                buyerId
        );
    }

    private void lockSellerForUpdate(UUID sellerId) {
        List<UUID> rows = db.queryForList(
                "SELECT user_id FROM thanh_viens WHERE user_id = ? FOR UPDATE",
                UUID.class,
                sellerId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "SELLER_NOT_FOUND", "Không tìm thấy người bán của giao dịch.");
        }
    }

    private void evaluateActiveBuyer(List<Map<String, Object>> rows) {
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
                    "Tài khoản cần được xác minh email và phê duyệt hồ sơ trước khi thực hiện đánh giá."
            );
        }
    }

    private LockedOrder lockOrderForUpdate(UUID orderId) {
        List<LockedOrder> rows = db.query(
                """
                SELECT g.ma_giao_dich, g.ma_tin, t.tieu_de AS listing_title,
                       g.nguoi_ban_id, g.nguoi_mua_id, g.trang_thai,
                       g.thoi_diem_hoan_tat, g.da_cong_diem_khong_danh_gia,
                       g.thoi_diem_cong_diem_khong_danh_gia
                FROM giao_dichs g
                JOIN tin_dangs t ON t.ma_tin = g.ma_tin
                WHERE g.ma_giao_dich = ?
                FOR NO KEY UPDATE OF g
                """,
                (rs, rowNum) -> new LockedOrder(
                        rs.getObject("ma_giao_dich", UUID.class),
                        rs.getObject("ma_tin", UUID.class),
                        rs.getString("listing_title"),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getObject("nguoi_mua_id", UUID.class),
                        rs.getString("trang_thai"),
                        toInstant(rs.getTimestamp("thoi_diem_hoan_tat")),
                        rs.getBoolean("da_cong_diem_khong_danh_gia"),
                        toInstant(rs.getTimestamp("thoi_diem_cong_diem_khong_danh_gia"))
                ),
                orderId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "ORDER_NOT_FOUND", "Không tìm thấy giao dịch.");
        }
        return rows.getFirst();
    }

    private LockedReview lockReviewForUpdate(UUID reviewId) {
        List<LockedReview> rows = db.query(
                """
                SELECT ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id,
                       so_sao, nhan_xet, trang_thai, phien_ban_hien_tai, diem_da_ap_dung,
                       thoi_diem_tao, queue_entered_at, thoi_diem_cong_khai,
                       thoi_diem_xet, nguoi_xet_id, create_idempotency_key,
                       deleted_at, updated_at, version
                FROM danh_gias
                WHERE ma_danh_gia = ?
                FOR NO KEY UPDATE
                """,
                (rs, rowNum) -> mapLockedReview(rs),
                reviewId
        );
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "REVIEW_NOT_FOUND", "Không tìm thấy đánh giá.");
        }
        return rows.getFirst();
    }

    private LockedReview findActiveReviewForOrder(UUID orderId) {
        List<LockedReview> rows = db.query(
                """
                SELECT ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id,
                       so_sao, nhan_xet, trang_thai, phien_ban_hien_tai, diem_da_ap_dung,
                       thoi_diem_tao, queue_entered_at, thoi_diem_cong_khai,
                       thoi_diem_xet, nguoi_xet_id, create_idempotency_key,
                       deleted_at, updated_at, version
                FROM danh_gias
                WHERE ma_giao_dich = ?
                  AND trang_thai <> 'DA_XOA'
                LIMIT 1
                """,
                (rs, rowNum) -> mapLockedReview(rs),
                orderId
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private LockedReview mapLockedReview(ResultSet rs) throws SQLException {
        return new LockedReview(
                rs.getObject("ma_danh_gia", UUID.class),
                rs.getObject("ma_giao_dich", UUID.class),
                rs.getObject("nguoi_danh_gia_id", UUID.class),
                rs.getObject("nguoi_bi_danh_gia_id", UUID.class),
                rs.getInt("so_sao"),
                rs.getString("nhan_xet"),
                rs.getString("trang_thai"),
                rs.getInt("phien_ban_hien_tai"),
                rs.getInt("diem_da_ap_dung"),
                toInstant(rs.getTimestamp("thoi_diem_tao")),
                toInstant(rs.getTimestamp("queue_entered_at")),
                toInstant(rs.getTimestamp("thoi_diem_cong_khai")),
                toInstant(rs.getTimestamp("thoi_diem_xet")),
                rs.getObject("nguoi_xet_id", UUID.class),
                rs.getString("create_idempotency_key"),
                toInstant(rs.getTimestamp("deleted_at")),
                toInstant(rs.getTimestamp("updated_at")),
                rs.getLong("version")
        );
    }

    /**
     * Checks P3-05 forward-compatibility lock:
     * - Returns CHO_XU_LY or DA_XU_LY if an active/resolved complaint (or linked decision) exists.
     * - Returns null if no complaint exists OR if the complaint was withdrawn (DA_RUT per UC-33 Alt 3).
     */
    private String findLockingComplaintStatus(UUID reviewId) {
        List<String> rows = db.queryForList(
                """
                SELECT CASE
                           WHEN k.trang_thai = 'CHO_XU_LY' THEN 'CHO_XU_LY'
                           ELSE 'DA_XU_LY'
                       END AS lock_status
                FROM khieu_nais k
                WHERE k.ma_danh_gia = ?
                  AND (
                      k.trang_thai IN ('CHO_XU_LY', 'DA_XU_LY')
                      OR EXISTS (SELECT 1 FROM quyet_dinhs q WHERE q.ma_khieu_nai = k.ma_khieu_nai)
                  )
                ORDER BY CASE WHEN k.trang_thai = 'CHO_XU_LY' THEN 0 ELSE 1 END, k.thoi_diem_tao DESC
                LIMIT 1
                """,
                String.class,
                reviewId
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private String findLatestComplaintStatus(UUID reviewId) {
        List<String> rows = db.queryForList(
                """
                SELECT trang_thai
                FROM khieu_nais
                WHERE ma_danh_gia = ?
                ORDER BY thoi_diem_tao DESC
                LIMIT 1
                """,
                String.class,
                reviewId
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private static int validateRating(Integer rating) {
        if (rating == null || rating < ReviewPolicy.MIN_RATING || rating > ReviewPolicy.MAX_RATING) {
            throw new AuthFailure(400, "INVALID_INPUT", "Số sao đánh giá phải từ 1 đến 5.");
        }
        return rating;
    }

    private static void validateRatingDetails(int rating, String comment, List<UUID> evidenceIds) {
        if (rating <= 3 && (comment == null || comment.isBlank()) && evidenceIds.isEmpty()) {
            throw new AuthFailure(
                    400,
                    "REVIEW_DETAILS_REQUIRED",
                    "Đánh giá từ 1 đến 3 sao bắt buộc nhập nhận xét hoặc đính kèm ít nhất 1 bằng chứng."
            );
        }
    }

    private static List<UUID> normalizeEvidenceIds(List<UUID> rawIds) {
        if (rawIds == null || rawIds.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<UUID> deduped = new LinkedHashSet<>();
        for (UUID id : rawIds) {
            if (id == null) {
                throw new AuthFailure(400, "INVALID_INPUT", "Danh sách bằng chứng chứa mã không hợp lệ.");
            }
            if (!deduped.add(id)) {
                throw new AuthFailure(400, "INVALID_INPUT", "Danh sách bằng chứng chứa mã bị trùng lặp.");
            }
        }
        if (deduped.size() > ReviewPolicy.MAX_EVIDENCE_PER_REVIEW) {
            throw new AuthFailure(
                    400,
                    "INVALID_INPUT",
                    "Mỗi đánh giá chỉ được đính kèm tối đa " + ReviewPolicy.MAX_EVIDENCE_PER_REVIEW + " bằng chứng."
            );
        }
        return List.copyOf(deduped);
    }

    private static String normalizeStoredComment(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return raw.strip();
    }

    private static Instant toInstant(Timestamp ts) {
        return ts != null ? ts.toInstant() : null;
    }

    private static List<UUID> extractUuidArray(ResultSet rs, String column) throws SQLException {
        Array arr = rs.getArray(column);
        if (arr == null) {
            return List.of();
        }
        Object raw = arr.getArray();
        if (raw instanceof UUID[] uuids) {
            List<UUID> result = new ArrayList<>(uuids.length);
            for (UUID u : uuids) {
                if (u != null) {
                    result.add(u);
                }
            }
            return List.copyOf(result);
        }
        if (raw instanceof Object[] objs) {
            List<UUID> result = new ArrayList<>(objs.length);
            for (Object o : objs) {
                if (o instanceof UUID u) {
                    result.add(u);
                } else if (o != null) {
                    result.add(UUID.fromString(o.toString()));
                }
            }
            return List.copyOf(result);
        }
        return List.of();
    }
}
