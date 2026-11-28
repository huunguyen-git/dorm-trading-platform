package com.dormtrading.review;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ReviewPolicyUnitTest {

    @Test
    void fifteenDayWindowAndDaysRemainingBoundaryMath() {
        Instant completedAt = Instant.parse("2026-11-01T10:00:00Z");
        Instant deadline = ReviewPolicy.reviewDeadline(completedAt);
        assertThat(deadline).isEqualTo(Instant.parse("2026-11-16T10:00:00Z"));

        // Right after completion: 15 days remaining
        assertThat(ReviewPolicy.isWithinReviewWindow(completedAt, completedAt)).isTrue();
        assertThat(ReviewPolicy.daysRemaining(completedAt, completedAt)).isEqualTo(15);

        // 1 second after completion: still 15 days remaining (ceil)
        assertThat(ReviewPolicy.daysRemaining(completedAt, completedAt.plusSeconds(1))).isEqualTo(15);

        // 1 day and 1 second elapsed: 14 days remaining (ceil)
        assertThat(ReviewPolicy.daysRemaining(completedAt, completedAt.plus(Duration.ofDays(1)).plusSeconds(1))).isEqualTo(14);

        // 1 second before deadline: within window, 1 day remaining (ceil)
        assertThat(ReviewPolicy.isWithinReviewWindow(completedAt, deadline.minusSeconds(1))).isTrue();
        assertThat(ReviewPolicy.daysRemaining(completedAt, deadline.minusSeconds(1))).isEqualTo(1);

        // Sub-second before deadline (500ms and 1ns): still within window -> MUST ceil to 1 day remaining
        assertThat(ReviewPolicy.isWithinReviewWindow(completedAt, deadline.minusMillis(500))).isTrue();
        assertThat(ReviewPolicy.daysRemaining(completedAt, deadline.minusMillis(500))).isEqualTo(1);
        assertThat(ReviewPolicy.isWithinReviewWindow(completedAt, deadline.minusNanos(1))).isTrue();
        assertThat(ReviewPolicy.daysRemaining(completedAt, deadline.minusNanos(1))).isEqualTo(1);

        // Exactly at deadline (15d 0h 0m 0s): expired, 0 days remaining (strictly complementary with +1 bonus)
        assertThat(ReviewPolicy.isWithinReviewWindow(completedAt, deadline)).isFalse();
        assertThat(ReviewPolicy.daysRemaining(completedAt, deadline)).isEqualTo(0);
    }

    @Test
    void evaluateCapabilitiesCoversPost15DayDeleteAndComplaintModerationLocks() {
        Instant completedAt = Instant.parse("2026-11-01T10:00:00Z");
        Instant day5 = completedAt.plus(Duration.ofDays(5));
        Instant day20 = completedAt.plus(Duration.ofDays(20));

        // 1) Active unmoderated CHAP_NHAN past 15d -> canEdit=false, canDelete=true (UC-32!)
        ReviewPolicy.Capabilities post15d = ReviewPolicy.evaluateCapabilities(
                true, "HOAN_TAT", completedAt, false, true, "CHAP_NHAN", null, null, null, day20
        );
        assertThat(post15d.withinReviewWindow()).isFalse();
        assertThat(post15d.canReview()).isFalse();
        assertThat(post15d.canEdit()).isFalse();
        assertThat(post15d.canDelete()).isTrue();
        assertThat(post15d.lockReason()).isEqualTo("REVIEW_WINDOW_EXPIRED");

        // 2) Active complaint CHO_XU_LY -> locks both edit and delete
        ReviewPolicy.Capabilities pendingComplaint = ReviewPolicy.evaluateCapabilities(
                true, "HOAN_TAT", completedAt, false, true, "CHAP_NHAN", null, null, "CHO_XU_LY", day5
        );
        assertThat(pendingComplaint.canEdit()).isFalse();
        assertThat(pendingComplaint.canDelete()).isFalse();
        assertThat(pendingComplaint.lockReason()).isEqualTo("REVIEW_COMPLAINT_PENDING");

        // 3) Moderated review (thoi_diem_xet != null) -> locks both edit and delete
        ReviewPolicy.Capabilities moderated = ReviewPolicy.evaluateCapabilities(
                true, "HOAN_TAT", completedAt, false, true, "CHAP_NHAN", day5, UUID.randomUUID(), null, day5
        );
        assertThat(moderated.canEdit()).isFalse();
        assertThat(moderated.canDelete()).isFalse();
        assertThat(moderated.lockReason()).isEqualTo("REVIEW_MODERATED");

        // 4) Unreviewed completed order within window -> canReview=true
        ReviewPolicy.Capabilities unreviewed = ReviewPolicy.evaluateCapabilities(
                true, "HOAN_TAT", completedAt, false, false, null, null, null, null, day5
        );
        assertThat(unreviewed.canReview()).isTrue();
        assertThat(unreviewed.canEdit()).isFalse();
        assertThat(unreviewed.canDelete()).isFalse();
        assertThat(unreviewed.lockReason()).isNull();

        // 5) Seller viewer -> NOT_BUYER
        ReviewPolicy.Capabilities sellerView = ReviewPolicy.evaluateCapabilities(
                false, "HOAN_TAT", completedAt, false, false, null, null, null, null, day5
        );
        assertThat(sellerView.canReview()).isFalse();
        assertThat(sellerView.lockReason()).isEqualTo("NOT_BUYER");

        // 6) BI_KHOA buyer -> ACCOUNT_RESTRICTED (all mutations disabled)
        ReviewPolicy.Capabilities restrictedBuyer = ReviewPolicy.evaluateCapabilities(
                true, true, false, "HOAN_TAT", completedAt, false, true, "CHAP_NHAN", null, null, null, day5
        );
        assertThat(restrictedBuyer.canReview()).isFalse();
        assertThat(restrictedBuyer.canEdit()).isFalse();
        assertThat(restrictedBuyer.canDelete()).isFalse();
        assertThat(restrictedBuyer.lockReason()).isEqualTo("ACCOUNT_RESTRICTED");

        // 7) CHO_KICH_HOAT / non-active buyer -> ACCOUNT_NOT_ACTIVE
        ReviewPolicy.Capabilities inactiveBuyer = ReviewPolicy.evaluateCapabilities(
                true, false, false, "HOAN_TAT", completedAt, false, false, null, null, null, null, day5
        );
        assertThat(inactiveBuyer.canReview()).isFalse();
        assertThat(inactiveBuyer.canEdit()).isFalse();
        assertThat(inactiveBuyer.canDelete()).isFalse();
        assertThat(inactiveBuyer.lockReason()).isEqualTo("ACCOUNT_NOT_ACTIVE");
    }

    @Test
    void ratingStatusAndImmediateDeltaMapping() {
        assertThat(ReviewPolicy.statusForSubmittedRating(5)).isEqualTo(ReviewDtos.ReviewStatus.CHAP_NHAN);
        assertThat(ReviewPolicy.statusForSubmittedRating(4)).isEqualTo(ReviewDtos.ReviewStatus.CHAP_NHAN);
        assertThat(ReviewPolicy.statusForSubmittedRating(3)).isEqualTo(ReviewDtos.ReviewStatus.CHO_XET);
        assertThat(ReviewPolicy.statusForSubmittedRating(2)).isEqualTo(ReviewDtos.ReviewStatus.CHO_XET);
        assertThat(ReviewPolicy.statusForSubmittedRating(1)).isEqualTo(ReviewDtos.ReviewStatus.CHO_XET);

        assertThat(ReviewPolicy.immediateScoreDeltaForRating(5)).isEqualTo(2);
        assertThat(ReviewPolicy.immediateScoreDeltaForRating(4)).isEqualTo(0);
        assertThat(ReviewPolicy.immediateScoreDeltaForRating(3)).isEqualTo(0);
        assertThat(ReviewPolicy.immediateScoreDeltaForRating(2)).isEqualTo(0);
        assertThat(ReviewPolicy.immediateScoreDeltaForRating(1)).isEqualTo(0);
    }
}
