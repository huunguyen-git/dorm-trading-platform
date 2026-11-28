package com.dormtrading.review;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;

/**
 * Shared business rules for P3-04 (UC-30, UC-31, UC-32; FR-10) and forward compatibility with P3-05 (UC-33, UC-34).
 */
public final class ReviewPolicy {

    public static final int REVIEW_WINDOW_DAYS = 15;
    public static final Duration REVIEW_WINDOW_DURATION = Duration.ofDays(REVIEW_WINDOW_DAYS);
    public static final int MIN_RATING = 1;
    public static final int MAX_RATING = 5;
    public static final int AUTO_ACCEPT_MIN_RATING = 4;
    public static final int FIVE_STAR_BONUS_POINTS = 2;
    public static final int NO_REVIEW_BONUS_POINTS = 1;
    public static final int MAX_COMMENT_LENGTH = 2000;
    public static final int MAX_EVIDENCE_PER_REVIEW = 5;
    public static final int MAX_IDEMPOTENCY_KEY_LENGTH = 100;

    public static final Set<String> LOCKING_COMPLAINT_STATUSES = Set.of("CHO_XU_LY", "DA_XU_LY");

    private ReviewPolicy() {
    }

    public static Instant reviewDeadline(Instant completedAt) {
        return completedAt == null ? null : completedAt.plus(REVIEW_WINDOW_DURATION);
    }

    /**
     * Strictly complementary with the 15-day no-review bonus cutoff:
     * - {@code now < completedAt + 15d} => within review window (can create/edit).
     * - {@code now >= completedAt + 15d} => window expired, eligible for +1 bonus.
     */
    public static boolean isWithinReviewWindow(Instant completedAt, Instant now) {
        if (completedAt == null || now == null) {
            return false;
        }
        return now.isBefore(reviewDeadline(completedAt));
    }

    public static int daysRemaining(Instant completedAt, Instant now) {
        if (!isWithinReviewWindow(completedAt, now)) {
            return 0;
        }
        Duration remaining = Duration.between(now, reviewDeadline(completedAt));
        if (remaining.isZero() || remaining.isNegative()) {
            return 0;
        }
        long ceilSeconds = remaining.getSeconds() + (remaining.getNano() > 0 ? 1L : 0L);
        long days = (ceilSeconds + 86_399L) / 86_400L;
        return (int) Math.min(REVIEW_WINDOW_DAYS, Math.max(1L, days));
    }

    public static ReviewDtos.ReviewStatus statusForSubmittedRating(int rating) {
        return rating >= AUTO_ACCEPT_MIN_RATING
                ? ReviewDtos.ReviewStatus.CHAP_NHAN
                : ReviewDtos.ReviewStatus.CHO_XET;
    }

    public static int immediateScoreDeltaForRating(int rating) {
        return rating == 5 ? FIVE_STAR_BONUS_POINTS : 0;
    }

    public static boolean isModerated(String reviewStatus, Instant moderatedAt, Object moderatorId) {
        return moderatedAt != null
                || moderatorId != null
                || ReviewDtos.ReviewStatus.BI_BAC.name().equals(reviewStatus);
    }

    public static boolean isComplaintLocked(String reviewStatus, String activeOrResolvedComplaintStatus) {
        return ReviewDtos.ReviewStatus.DA_GO.name().equals(reviewStatus)
                || (activeOrResolvedComplaintStatus != null
                && LOCKING_COMPLAINT_STATUSES.contains(activeOrResolvedComplaintStatus));
    }

    public record Capabilities(
            Instant reviewDeadlineAt,
            int daysRemaining,
            boolean withinReviewWindow,
            boolean canReview,
            boolean canEdit,
            boolean canDelete,
            String lockReason,
            String lockMessage
    ) {
    }

    public static Capabilities evaluateCapabilities(
            boolean viewerIsBuyer,
            String orderStatus,
            Instant completedAt,
            boolean noReviewBonusApplied,
            boolean hasActiveReview,
            String activeReviewStatus,
            Instant activeReviewModeratedAt,
            Object activeReviewModeratorId,
            String lockingComplaintStatus,
            Instant now
    ) {
        Instant deadline = reviewDeadline(completedAt);
        boolean withinWindow = isWithinReviewWindow(completedAt, now);
        int daysLeft = daysRemaining(completedAt, now);

        if (!"HOAN_TAT".equals(orderStatus) || completedAt == null) {
            return new Capabilities(
                    deadline,
                    0,
                    false,
                    false,
                    false,
                    false,
                    ReviewDtos.ReviewLockReason.ORDER_NOT_COMPLETED.name(),
                    "Chỉ có thể đánh giá sau khi giao dịch đã hoàn tất."
            );
        }

        if (!viewerIsBuyer) {
            return new Capabilities(
                    deadline,
                    daysLeft,
                    withinWindow,
                    false,
                    false,
                    false,
                    ReviewDtos.ReviewLockReason.NOT_BUYER.name(),
                    "Chỉ người mua của giao dịch mới có quyền gửi, sửa hoặc xóa đánh giá."
            );
        }

        // Case 1: No active (non-DA_XOA) review -> check UC-30 create eligibility
        if (!hasActiveReview) {
            if (noReviewBonusApplied) {
                return new Capabilities(
                        deadline,
                        0,
                        false,
                        false,
                        false,
                        false,
                        ReviewDtos.ReviewLockReason.NO_REVIEW_BONUS_APPLIED.name(),
                        "Giao dịch đã hết hạn đánh giá và đã áp dụng cộng +1 điểm uy tín cho người bán."
                );
            }
            if (!withinWindow) {
                return new Capabilities(
                        deadline,
                        0,
                        false,
                        false,
                        false,
                        false,
                        ReviewDtos.ReviewLockReason.REVIEW_WINDOW_EXPIRED.name(),
                        "Đã quá thời hạn 15 ngày kể từ khi giao dịch hoàn tất để gửi đánh giá."
                );
            }
            return new Capabilities(deadline, daysLeft, true, true, false, false, null, null);
        }

        // Case 2: Active review exists -> check complaint / moderation locks (UC-31, UC-32, UC-33, UC-34)
        if ("CHO_XU_LY".equals(lockingComplaintStatus)) {
            return new Capabilities(
                    deadline,
                    daysLeft,
                    withinWindow,
                    false,
                    false,
                    false,
                    ReviewDtos.ReviewLockReason.REVIEW_COMPLAINT_PENDING.name(),
                    "Đánh giá đang có khiếu nại chờ kiểm duyệt nên tạm khóa chỉnh sửa và xóa."
            );
        }

        if ("DA_XU_LY".equals(lockingComplaintStatus)
                || ReviewDtos.ReviewStatus.DA_GO.name().equals(activeReviewStatus)) {
            return new Capabilities(
                    deadline,
                    daysLeft,
                    withinWindow,
                    false,
                    false,
                    false,
                    ReviewDtos.ReviewLockReason.REVIEW_COMPLAINT_RESOLVED.name(),
                    "Đánh giá đã có kết luận khiếu nại hoặc đã bị gỡ nên không thể chỉnh sửa hay xóa."
            );
        }

        if (isModerated(activeReviewStatus, activeReviewModeratedAt, activeReviewModeratorId)) {
            return new Capabilities(
                    deadline,
                    daysLeft,
                    withinWindow,
                    false,
                    false,
                    false,
                    ReviewDtos.ReviewLockReason.REVIEW_MODERATED.name(),
                    "Đánh giá đã có quyết định xét duyệt của Kiểm duyệt viên nên không thể chỉnh sửa hay xóa."
            );
        }

        // Unmoderated CHAP_NHAN (4-5*) or unmoderated CHO_XET (1-3*) with no active/resolved complaint:
        // - UC-32: Buyer CAN still delete even past 15 days!
        // - UC-31: Buyer can edit ONLY within the original 15-day window!
        boolean mutableStatus = ReviewDtos.ReviewStatus.CHAP_NHAN.name().equals(activeReviewStatus)
                || ReviewDtos.ReviewStatus.CHO_XET.name().equals(activeReviewStatus);
        if (!mutableStatus) {
            return new Capabilities(
                    deadline,
                    daysLeft,
                    withinWindow,
                    false,
                    false,
                    false,
                    ReviewDtos.ReviewLockReason.REVIEW_MODERATED.name(),
                    "Trạng thái đánh giá hiện tại không cho phép chỉnh sửa hoặc xóa."
            );
        }

        if (!withinWindow) {
            return new Capabilities(
                    deadline,
                    0,
                    false,
                    false,
                    false,
                    true,
                    ReviewDtos.ReviewLockReason.REVIEW_WINDOW_EXPIRED.name(),
                    "Đã hết hạn 15 ngày để chỉnh sửa đánh giá. Bạn vẫn có thể xóa đánh giá nếu chưa có quyết định kiểm duyệt hoặc khiếu nại."
            );
        }

        return new Capabilities(deadline, daysLeft, true, false, true, true, null, null);
    }
}
