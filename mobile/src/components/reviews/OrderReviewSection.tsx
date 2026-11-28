import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatOrderDateTime } from '../../orders/types';
import {
  formatAppliedScoreDelta,
  formatDaysRemainingLabel,
  formatEditDaysRemainingLabel,
  getReviewLockExplanation,
  REVIEW_RATING_META,
  REVIEW_STATUS_META,
  type OrderReviewState,
} from '../../reviews/types';
import { HairlineDivider, Icon, InlineBanner, SectionHeading, StatusIndicator } from '../ui';
import { AuthorizedEvidenceImage } from './AuthorizedEvidenceImage';
import { ReviewEvidenceLightbox } from './ReviewEvidenceLightbox';
import { StarRatingRow } from './StarRatingRow';
import { component, primitive, semantic } from '../../theme';

export interface OrderReviewSectionProps {
  reviewState: OrderReviewState | null;
  loading: boolean;
  error: string | null;
  isBuyer: boolean;
  isSeller: boolean;
  submitting: boolean;
  onRetry: () => void;
  onOpenCreate: () => void;
  onOpenEdit: () => void;
  onOpenDelete: () => void;
  onViewSellerReviews?: () => void;
}

export function OrderReviewSection({
  reviewState,
  loading,
  error,
  isBuyer,
  isSeller,
  submitting,
  onRetry,
  onOpenCreate,
  onOpenEdit,
  onOpenDelete,
  onViewSellerReviews,
}: OrderReviewSectionProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (loading && !reviewState) {
    return (
      <View style={styles.section} testID="order-review-loading">
        <SectionHeading title="Đánh giá giao dịch" />
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={semantic.color.accent} />
          <Text style={styles.caption}>Đang tải thông tin đánh giá…</Text>
        </View>
      </View>
    );
  }

  if (error && !reviewState) {
    return (
      <View style={styles.section} testID="order-review-error">
        <SectionHeading title="Đánh giá giao dịch" />
        <InlineBanner
          tone="danger"
          message={error}
          actionLabel="Thử lại"
          actionTestID="order-review-retry-button"
          onActionPress={onRetry}
        />
      </View>
    );
  }

  if (!reviewState) {
    return null;
  }

  const review = reviewState.review;
  const daysLabel = formatDaysRemainingLabel(
    reviewState.daysRemaining,
    reviewState.withinReviewWindow,
  );
  const editDaysLabel = formatEditDaysRemainingLabel(
    reviewState.daysRemaining,
    reviewState.withinReviewWindow,
  );
  const isAccountLocked =
    reviewState.lockReason === 'ACCOUNT_RESTRICTED' ||
    reviewState.lockReason === 'ACCOUNT_NOT_ACTIVE';
  const lockExplanation = getReviewLockExplanation(
    reviewState.lockReason,
    reviewState.lockMessage,
  );

  return (
    <View style={styles.section} testID="order-review-section">
      <SectionHeading
        title="Đánh giá giao dịch"
        subtitle={
          isBuyer
            ? 'Người mua đánh giá người bán trong vòng 15 ngày kể từ khi hoàn tất.'
            : 'Chỉ người mua có quyền gửi đánh giá sau khi giao dịch hoàn tất.'
        }
        actionLabel={onViewSellerReviews ? 'Hồ sơ đánh giá' : undefined}
        actionIcon={onViewSellerReviews ? 'chevron-right' : undefined}
        actionTestID="order-review-view-seller-reviews"
        onActionPress={onViewSellerReviews}
      />

      {error ? (
        <InlineBanner
          tone="danger"
          message={error}
          actionLabel="Tải lại"
          onActionPress={onRetry}
        />
      ) : null}

      {/* Case 1: Existing visible review (Buyer always sees own active review; Seller sees CHAP_NHAN / DA_GO) */}
      {review ? (
        <View style={styles.reviewCard} testID="order-review-card">
          <View style={styles.reviewHeaderRow}>
            <View style={styles.ratingCluster}>
              <StarRatingRow
                value={review.rating}
                readOnly
                size="sm"
                testIDPrefix="order-review-stars"
              />
              <Text style={styles.ratingWord} testID="order-review-rating-text">
                {review.rating} sao · {REVIEW_RATING_META[review.rating]?.label ?? ''}
              </Text>
            </View>
            <StatusIndicator
              testID="order-review-status-badge"
              variant="soft"
              tone={REVIEW_STATUS_META[review.status]?.tone ?? 'neutral'}
              label={REVIEW_STATUS_META[review.status]?.label ?? review.status}
            />
          </View>

          <View style={styles.metaChipsRow}>
            <View style={styles.metaChip}>
              <Icon name="award" size={12} color={semantic.color.textSecondary} />
              <Text style={styles.metaChipText} testID="order-review-score-delta">
                {formatAppliedScoreDelta(review.appliedScoreDelta, review.status)}
              </Text>
            </View>

            {review.currentVersionNo > 1 ? (
              <View style={styles.metaChip} testID="order-review-version-badge">
                <Icon name="edit-2" size={11} color={semantic.color.textSecondary} />
                <Text style={styles.metaChipText}>
                  Đã chỉnh sửa · Phiên bản {review.currentVersionNo}
                </Text>
              </View>
            ) : null}
          </View>

          {review.comment ? (
            <Text style={styles.commentText} testID="order-review-comment">
              {review.comment}
            </Text>
          ) : (
            <Text style={styles.emptyCommentText}>Không có nhận xét kèm theo.</Text>
          )}

          {review.evidence.length > 0 ? (
            <View style={styles.evidenceBlock} testID="order-review-evidence-list">
              <View style={styles.evidenceHeader}>
                <Icon name="lock" size={12} color={semantic.color.textSecondary} />
                <Text style={styles.evidenceLabel}>
                  Bằng chứng riêng tư ({review.evidence.length}) · Không hiển thị công khai
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.evidenceRail}
              >
                {review.evidence.map((ev, idx) => (
                  <Pressable
                    key={ev.id}
                    testID={`order-review-evidence-thumb-${idx}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Xem bằng chứng ${idx + 1}`}
                    onPress={() => setLightboxIndex(idx)}
                    style={({ pressed }) => [styles.evidenceThumbWrap, pressed && styles.pressed]}
                  >
                    <AuthorizedEvidenceImage
                      testID={`order-review-evidence-img-${idx}`}
                      evidence={ev}
                      style={styles.evidenceThumb}
                      resizeMode="cover"
                      compact
                    />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.timestampRow}>
            <Text style={styles.microText}>
              Gửi lúc {formatOrderDateTime(review.createdAt)}
              {review.updatedAt && review.currentVersionNo > 1
                ? ` · Cập nhật ${formatOrderDateTime(review.updatedAt)}`
                : ''}
            </Text>
          </View>

          {review.status === 'CHO_XET' ? (
            <InlineBanner
              testID="order-review-pending-moderation-banner"
              tone="warning"
              icon="clock"
              message="Đánh giá 1–3 sao đang chờ Kiểm duyệt viên xét duyệt. Đánh giá chưa công khai và chưa trừ điểm người bán."
            />
          ) : review.status === 'BI_BAC' ? (
            <InlineBanner
              testID="order-review-rejected-banner"
              tone="danger"
              icon="x-circle"
              message="Đánh giá đã bị Kiểm duyệt viên bác bỏ, không công khai và không trừ điểm người bán."
            />
          ) : review.status === 'DA_GO' ? (
            <InlineBanner
              testID="order-review-removed-banner"
              tone="neutral"
              icon="eye-off"
              message="Đánh giá đã được gỡ theo kết quả giải quyết khiếu nại và tác động điểm đã được hoàn lại."
            />
          ) : null}

          {/* Buyer edit / delete actions & lock reason messaging */}
          {isBuyer ? (
            <>
              {reviewState.canEdit || reviewState.canDelete ? (
                <>
                  <HairlineDivider />
                  {!reviewState.canEdit && lockExplanation ? (
                    <InlineBanner
                      testID="order-review-edit-lock-notice"
                      tone="neutral"
                      icon="lock"
                      message={lockExplanation}
                    />
                  ) : null}
                  {reviewState.canEdit && reviewState.withinReviewWindow ? (
                    <Text style={styles.windowHintText} testID="order-review-edit-window-hint">
                      {editDaysLabel}
                    </Text>
                  ) : null}
                  <View style={styles.actionsRow}>
                    {reviewState.canEdit ? (
                      <Pressable
                        testID="open-edit-review-button"
                        disabled={submitting}
                        accessibilityRole="button"
                        accessibilityLabel="Chỉnh sửa đánh giá"
                        onPress={onOpenEdit}
                        style={({ pressed }) => [
                          styles.secondaryBtn,
                          styles.flex,
                          submitting && styles.disabled,
                          pressed && !submitting && styles.pressed,
                        ]}
                      >
                        <Icon name="edit-2" size={14} color={semantic.color.textPrimary} />
                        <Text style={styles.secondaryBtnText}>Chỉnh sửa đánh giá</Text>
                      </Pressable>
                    ) : null}

                    {reviewState.canDelete ? (
                      <Pressable
                        testID="open-delete-review-button"
                        disabled={submitting}
                        accessibilityRole="button"
                        accessibilityLabel="Xóa đánh giá"
                        onPress={onOpenDelete}
                        style={({ pressed }) => [
                          styles.dangerSoftBtn,
                          !reviewState.canEdit && styles.flex,
                          submitting && styles.disabled,
                          pressed && !submitting && styles.pressed,
                        ]}
                      >
                        <Icon name="trash-2" size={14} color={semantic.color.danger} />
                        <Text style={styles.dangerSoftBtnText}>Xóa đánh giá</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </>
              ) : lockExplanation ? (
                <InlineBanner
                  testID="order-review-locked-banner"
                  tone="neutral"
                  icon="lock"
                  title="Đánh giá đã khóa chỉnh sửa & xóa"
                  message={lockExplanation}
                />
              ) : null}
            </>
          ) : null}

          <ReviewEvidenceLightbox
            items={review.evidence}
            activeIndex={lightboxIndex ?? 0}
            visible={lightboxIndex !== null}
            onChangeIndex={(next) => setLightboxIndex(next)}
            onClose={() => setLightboxIndex(null)}
          />
        </View>
      ) : isBuyer ? (
        /* Case 2: Buyer without active review */
        reviewState.canReview ? (
          <View style={styles.ctaCard} testID="order-review-eligible-card">
            <View style={styles.ctaHeaderRow}>
              <View style={styles.ctaIconBadge}>
                <Icon name="star" size={18} color={semantic.color.ratingStar} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.ctaTitle}>Bạn hài lòng với giao dịch này chứ?</Text>
                <Text style={styles.caption} testID="order-review-days-remaining">
                  {daysLabel}
                  {reviewState.reviewDeadlineAt
                    ? ` (hạn cuối ${formatOrderDateTime(reviewState.reviewDeadlineAt)})`
                    : ''}
                </Text>
              </View>
            </View>

            <Text style={styles.ctaBody}>
              Đánh giá 4–5 sao sẽ công khai ngay; đánh giá 1–3 sao được Kiểm duyệt viên xem xét
              trước khi áp dụng trừ điểm.
            </Text>

            <Pressable
              testID="open-create-review-button"
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Đánh giá người bán"
              onPress={onOpenCreate}
              style={({ pressed }) => [
                styles.primaryBtn,
                submitting && styles.disabled,
                pressed && !submitting && styles.primaryBtnPressed,
              ]}
            >
              <Icon name="star" size={16} color={component.button.primaryFg} />
              <Text style={styles.primaryBtnText}>Đánh giá người bán</Text>
            </Pressable>
          </View>
        ) : (
          <InlineBanner
            testID="order-review-expired-banner"
            tone={isAccountLocked ? 'danger' : 'neutral'}
            icon={isAccountLocked ? 'lock' : 'clock'}
            title={
              isAccountLocked
                ? 'Tài khoản đang bị hạn chế'
                : reviewState.noReviewBonusApplied
                  ? 'Đã đóng quyền đánh giá (+1 điểm cho người bán)'
                  : 'Đã hết thời hạn đánh giá'
            }
            message={
              lockExplanation ||
              'Giao dịch đã quá thời hạn 15 ngày kể từ lúc hoàn tất nên không thể gửi đánh giá mới.'
            }
          />
        )
      ) : isSeller ? (
        /* Case 3: Seller viewing HOAN_TAT order without public review */
        reviewState.hasPendingModerationReview ? (
          <InlineBanner
            testID="order-review-seller-pending-banner"
            tone="warning"
            icon="clock"
            title="Đánh giá đang được kiểm duyệt"
            message="Người mua đã gửi đánh giá và nội dung đang chờ Kiểm duyệt viên xem xét. Đánh giá chưa công khai và điểm uy tín của bạn chưa thay đổi."
          />
        ) : reviewState.noReviewBonusApplied ? (
          <InlineBanner
            testID="order-review-seller-bonus-banner"
            tone="success"
            icon="award"
            title="Đã cộng +1 điểm uy tín"
            message="Giao dịch hoàn tất quá 15 ngày không có đánh giá. Hệ thống đã cộng +1 điểm uy tín một lần cho bạn."
          />
        ) : (
          <InlineBanner
            testID="order-review-seller-empty-banner"
            tone="neutral"
            icon="info"
            message={
              reviewState.withinReviewWindow
                ? `Người mua chưa gửi đánh giá cho giao dịch này (${daysLabel}). Nếu hết 15 ngày không có đánh giá, bạn sẽ được cộng +1 điểm uy tín.`
                : 'Người mua không gửi đánh giá trong hạn 15 ngày.'
            }
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    paddingVertical: primitive.space[2],
  },
  caption: {
    ...semantic.type.caption,
  },
  microText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  flex: {
    flex: 1,
  },
  ctaCard: {
    backgroundColor: semantic.color.bgWarmTint,
    borderRadius: primitive.radius.lg,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
    padding: primitive.space[3.5 as keyof typeof primitive.space] ?? 14,
    gap: primitive.space[3],
  },
  ctaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  ctaIconBadge: {
    width: 40,
    height: 40,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.ratingBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTitle: {
    ...semantic.type.cardTitle,
  },
  ctaBody: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    lineHeight: 19,
  },
  reviewCard: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.lg,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    padding: primitive.space[3.5 as keyof typeof primitive.space] ?? 14,
    gap: primitive.space[2.5],
  },
  reviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
    flexWrap: 'wrap',
  },
  ratingCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  ratingWord: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  metaChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[1.5],
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: primitive.space[2],
    paddingVertical: 3,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  metaChipText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
  },
  commentText: {
    ...semantic.type.body,
    color: semantic.color.textPrimary,
  },
  emptyCommentText: {
    ...semantic.type.caption,
    fontStyle: 'italic',
  },
  evidenceBlock: {
    gap: primitive.space[2],
    paddingTop: primitive.space[1],
  },
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  evidenceLabel: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  evidenceRail: {
    flexDirection: 'row',
    gap: primitive.space[2],
  },
  evidenceThumbWrap: {
    width: 72,
    height: 72,
    borderRadius: primitive.radius.md,
    overflow: 'hidden',
    backgroundColor: semantic.color.bgTrack,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  evidenceThumb: {
    width: '100%',
    height: '100%',
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  windowHintText: {
    ...semantic.type.micro,
    color: semantic.color.accent,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.primaryBg,
    paddingHorizontal: component.button.paddingX,
  },
  primaryBtnPressed: {
    backgroundColor: component.button.primaryPressedBg,
  },
  primaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.primaryFg,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    minHeight: component.button.minHeightSm + 6,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    paddingHorizontal: primitive.space[3],
  },
  secondaryBtnText: {
    ...semantic.type.label,
    color: component.button.secondaryFg,
  },
  dangerSoftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    minHeight: component.button.minHeightSm + 6,
    borderRadius: component.button.radius,
    backgroundColor: component.button.destructiveSoftBg,
    paddingHorizontal: primitive.space[3],
  },
  dangerSoftBtnText: {
    ...semantic.type.label,
    color: component.button.destructiveFg,
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
