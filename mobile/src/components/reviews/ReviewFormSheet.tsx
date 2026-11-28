import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../auth/session';
import { isRestrictedError } from '../../listings/sellerApi';
import { formatOrderDateTime } from '../../orders/types';
import { extractReviewApiError } from '../../reviews/api';
import {
  formatDaysRemainingLabel,
  generateReviewIdempotencyKey,
  MAX_REVIEW_COMMENT_LENGTH,
  REVIEW_RATING_META,
  validateReviewFormInput,
  type CreateReviewPayload,
  type OrderReviewState,
  type ReviewEvidenceItem,
  type UpdateReviewPayload,
} from '../../reviews/types';
import { BottomSheet, FormField, Icon, InlineBanner } from '../ui';
import { ReviewEvidenceManager } from './ReviewEvidenceManager';
import { StarRatingRow } from './StarRatingRow';
import { component, primitive, semantic } from '../../theme';

export interface ReviewFormSheetProps {
  visible: boolean;
  mode: 'create' | 'edit';
  orderReviewState: OrderReviewState;
  submitting: boolean;
  onClose: () => void;
  onSubmitCreate: (payload: CreateReviewPayload) => Promise<void>;
  onSubmitEdit: (reviewId: string, payload: UpdateReviewPayload) => Promise<void>;
  onRefreshState: () => Promise<boolean>;
}

export function ReviewFormSheet({
  visible,
  mode,
  orderReviewState,
  submitting,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
  onRefreshState,
}: ReviewFormSheetProps) {
  const existingReview = orderReviewState.review;
  const wasVisibleRef = useRef(false);
  const mountedRef = useRef(true);
  const activeOrderIdRef = useRef(orderReviewState.orderId);
  activeOrderIdRef.current = orderReviewState.orderId;
  const submitGuardRef = useRef(false);

  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [evidence, setEvidence] = useState<ReviewEvidenceItem[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const [ratingError, setRatingError] = useState('');
  const [commentError, setCommentError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitErrorCode, setSubmitErrorCode] = useState<string | undefined>(undefined);
  const [refreshingConflict, setRefreshingConflict] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const syncFromSource = () => {
    setRatingError('');
    setCommentError('');
    setSubmitError('');
    setSubmitErrorCode(undefined);
    if (mode === 'edit' && existingReview) {
      setRating(existingReview.rating);
      setComment(existingReview.comment ?? '');
      setEvidence(existingReview.evidence);
      setIdempotencyKey('');
    } else {
      setRating(5);
      setComment('');
      setEvidence([]);
      setIdempotencyKey(generateReviewIdempotencyKey(orderReviewState.orderId));
    }
  };

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      syncFromSource();
    }
    wasVisibleRef.current = visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, orderReviewState.orderId, existingReview?.id, existingReview?.version]);

  const originalSnapshot = useMemo(() => {
    if (mode !== 'edit' || !existingReview) return undefined;
    return {
      rating: existingReview.rating,
      comment: existingReview.comment ?? '',
      evidenceIds: existingReview.evidence.map((ev) => ev.id),
    };
  }, [mode, existingReview]);

  const persistedEvidenceIds = useMemo<ReadonlySet<string>>(() => {
    if (mode !== 'edit' || !existingReview) return new Set<string>();
    return new Set(existingReview.evidence.map((ev) => ev.id));
  }, [mode, existingReview]);

  const ratingMeta = REVIEW_RATING_META[rating] ?? REVIEW_RATING_META[5];
  const requiresDetails = rating <= 3;
  const isBusy = submitting || uploadingEvidence || refreshingConflict;

  const editTransitionNote = useMemo(() => {
    if (mode !== 'edit' || !existingReview) return null;
    if (existingReview.status === 'CHAP_NHAN' && rating <= 3) {
      return 'Chuyển sang 1–3 sao sẽ tạm gỡ đánh giá khỏi hiển thị công khai, hoàn lại điểm đã cộng (nếu có) và đưa vào hàng chờ kiểm duyệt.';
    }
    if (existingReview.status === 'CHO_XET' && rating <= 3) {
      return 'Chỉnh sửa đánh giá đang chờ xét vẫn giữ nguyên vị trí ban đầu trong danh sách kiểm duyệt.';
    }
    if (existingReview.status === 'CHO_XET' && rating >= 4) {
      return 'Chuyển lên 4–5 sao sẽ chấp nhận và công khai đánh giá ngay trên hồ sơ người bán.';
    }
    return null;
  }, [mode, existingReview, rating]);

  const handleSubmit = async () => {
    if (submitGuardRef.current || isBusy) return;
    setRatingError('');
    setCommentError('');
    setSubmitError('');
    setSubmitErrorCode(undefined);

    const evidenceIds = evidence.map((ev) => ev.id);
    const validation = validateReviewFormInput({
      mode,
      rating,
      comment,
      evidenceIds,
      original: originalSnapshot,
    });

    if (!validation.valid) {
      if (validation.ratingError) setRatingError(validation.ratingError);
      if (validation.commentError) setCommentError(validation.commentError);
      if (validation.generalError) setSubmitError(validation.generalError);
      return;
    }

    const targetOrderId = orderReviewState.orderId;
    submitGuardRef.current = true;
    try {
      if (mode === 'create') {
        const key = idempotencyKey || generateReviewIdempotencyKey(targetOrderId);
        if (!idempotencyKey) setIdempotencyKey(key);
        await onSubmitCreate({
          rating,
          comment: comment.trim() || null,
          evidenceIds,
          idempotencyKey: key,
        });
      } else if (existingReview) {
        await onSubmitEdit(existingReview.id, {
          rating,
          comment: comment.trim() || null,
          evidenceIds,
          expectedVersion: existingReview.version,
        });
      }
      if (!mountedRef.current || activeOrderIdRef.current !== targetOrderId) return;
      onClose();
    } catch (err) {
      if (!mountedRef.current || activeOrderIdRef.current !== targetOrderId) return;
      // BI_KHOA (403 ACCOUNT_RESTRICTED): đóng sheet ngay để <RestrictedAccountNotice /> hiển thị rõ.
      if (isRestrictedError(err)) {
        if (!useSession.getState().restriction) {
          useSession.setState({ restriction: err.restriction, restrictionDismissed: false });
        }
        onClose();
        return;
      }
      // UC-30 E5 & UC-31 E5: preserve all entered form data on failure so buyer can retry.
      const parsed = extractReviewApiError(
        err,
        mode === 'create'
          ? 'Không thể gửi đánh giá lúc này. Dữ liệu đã nhập vẫn được giữ lại để bạn thử lại.'
          : 'Không thể lưu thay đổi đánh giá. Dữ liệu đã nhập vẫn được giữ lại để bạn thử lại.',
      );
      setSubmitError(parsed.message);
      setSubmitErrorCode(parsed.code);
    } finally {
      submitGuardRef.current = false;
    }
  };

  const handleRefreshAfterConflict = async () => {
    if (refreshingConflict) return;
    const targetOrderId = orderReviewState.orderId;
    setRefreshingConflict(true);
    try {
      const ok = await onRefreshState();
      if (!mountedRef.current || activeOrderIdRef.current !== targetOrderId) return;
      if (ok) {
        onClose();
      } else {
        setSubmitError(
          'Không thể tải lại trạng thái mới nhất do lỗi kết nối. Vui lòng thử lại.',
        );
      }
    } catch (err) {
      if (!mountedRef.current || activeOrderIdRef.current !== targetOrderId) return;
      if (isRestrictedError(err)) {
        if (!useSession.getState().restriction) {
          useSession.setState({ restriction: err.restriction, restrictionDismissed: false });
        }
        onClose();
        return;
      }
      const parsed = extractReviewApiError(
        err,
        'Không thể tải lại trạng thái mới nhất. Vui lòng thử lại.',
      );
      setSubmitError(parsed.message);
    } finally {
      if (mountedRef.current) {
        setRefreshingConflict(false);
      }
    }
  };

  const daysLabel = formatDaysRemainingLabel(
    orderReviewState.daysRemaining,
    orderReviewState.withinReviewWindow,
  );
  const isConflictOrAlreadyExists =
    submitErrorCode === 'VERSION_CONFLICT' ||
    submitErrorCode === 'REVIEW_ALREADY_EXISTS' ||
    submitErrorCode === 'REVIEW_MODERATED' ||
    submitErrorCode === 'REVIEW_COMPLAINT_LOCKED' ||
    submitErrorCode === 'NO_REVIEW_BONUS_ALREADY_APPLIED' ||
    submitErrorCode === 'NO_REVIEW_BONUS_APPLIED' ||
    submitErrorCode === 'REVIEW_WINDOW_EXPIRED' ||
    submitErrorCode === 'REVIEW_DELETED';

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        if (!isBusy) onClose();
      }}
      title={mode === 'create' ? 'Đánh giá người bán' : 'Chỉnh sửa đánh giá'}
      subtitle={
        mode === 'create'
          ? 'Chia sẻ trải nghiệm thực tế sau khi giao dịch hoàn tất.'
          : 'Không mở thêm thời hạn 15 ngày mới; hệ thống lưu lịch sử phiên bản.'
      }
      maxHeightRatio={0.92}
      testID={mode === 'create' ? 'create-review-sheet' : 'edit-review-sheet'}
      footerSlot={
        <View style={styles.footerRow}>
          <Pressable
            testID="review-form-cancel-button"
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Hủy"
            onPress={onClose}
            style={({ pressed }) => [
              styles.secondaryBtn,
              isBusy && styles.disabled,
              pressed && !isBusy && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryBtnText}>Hủy</Text>
          </Pressable>

          <Pressable
            testID="review-form-submit-button"
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={mode === 'create' ? 'Gửi đánh giá' : 'Lưu thay đổi'}
            accessibilityState={{ disabled: isBusy, busy: submitting }}
            onPress={() => void handleSubmit()}
            style={({ pressed }) => [
              styles.primaryBtn,
              styles.flex,
              isBusy && styles.disabled,
              pressed && !isBusy && styles.primaryBtnPressed,
            ]}
          >
            <Icon
              name={mode === 'create' ? 'send' : 'check'}
              size={15}
              color={component.button.primaryFg}
            />
            <Text style={styles.primaryBtnText}>
              {submitting
                ? mode === 'create'
                  ? 'Đang gửi…'
                  : 'Đang lưu…'
                : mode === 'create'
                  ? 'Gửi đánh giá'
                  : 'Lưu thay đổi'}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.body} testID="review-form-content">
        {/* Order Context Summary Card (UC-30 Step 2) */}
        <View style={styles.orderSummaryCard} testID="review-form-order-summary">
          <Text style={styles.orderListingTitle} numberOfLines={2}>
            {orderReviewState.listingTitle}
          </Text>
          <View style={styles.summaryMetaRow}>
            <Icon name="user" size={13} color={semantic.color.textSecondary} />
            <Text style={styles.summaryMetaText}>
              Người bán: {orderReviewState.seller.displayName}
            </Text>
          </View>
          {orderReviewState.completedAt ? (
            <View style={styles.summaryMetaRow}>
              <Icon name="check-circle" size={13} color={semantic.color.success} />
              <Text style={styles.summaryMetaText}>
                Hoàn tất: {formatOrderDateTime(orderReviewState.completedAt)}
              </Text>
            </View>
          ) : null}
          <View style={styles.windowBadgeRow}>
            <View
              style={[
                styles.windowPill,
                !orderReviewState.withinReviewWindow && styles.windowPillExpired,
              ]}
            >
              <Icon
                name="clock"
                size={12}
                color={
                  orderReviewState.withinReviewWindow
                    ? semantic.color.accent
                    : semantic.color.danger
                }
              />
              <Text
                style={[
                  styles.windowPillText,
                  !orderReviewState.withinReviewWindow && styles.windowPillTextExpired,
                ]}
              >
                {daysLabel}
              </Text>
            </View>
          </View>
        </View>

        {submitError ? (
          <InlineBanner
            testID="review-form-error"
            tone="danger"
            message={submitError}
            actionLabel={
              isConflictOrAlreadyExists ? 'Tải lại trạng thái mới nhất' : undefined
            }
            actionTestID={isConflictOrAlreadyExists ? 'review-form-refresh-conflict' : undefined}
            onActionPress={
              isConflictOrAlreadyExists ? () => void handleRefreshAfterConflict() : undefined
            }
          />
        ) : null}

        {/* Interactive 1-5 Star Picker */}
        <View style={styles.fieldGroup}>
          <View style={styles.ratingLabelRow}>
            <Text style={styles.fieldLabel}>Mức độ hài lòng *</Text>
            <Text style={styles.ratingReadableText} testID="review-selected-rating-label">
              {rating} sao · {ratingMeta.label}
            </Text>
          </View>

          <StarRatingRow
            value={rating}
            onChange={(next) => {
              setRating(next);
              setRatingError('');
              if (next >= 4 && commentError) setCommentError('');
              if (submitError) setSubmitError('');
            }}
            disabled={isBusy}
            size="md"
            testIDPrefix="review-star"
          />

          {ratingError ? (
            <Text style={styles.inlineErrorText} testID="review-rating-error">
              {ratingError}
            </Text>
          ) : null}

          <InlineBanner
            testID="review-rating-policy-hint"
            tone={ratingMeta.requiresModeration ? 'warning' : 'success'}
            icon={ratingMeta.requiresModeration ? 'shield' : 'check-circle'}
            message={ratingMeta.hint}
          />

          {editTransitionNote ? (
            <InlineBanner
              testID="review-edit-transition-note"
              tone="neutral"
              icon="info"
              message={editTransitionNote}
            />
          ) : null}
        </View>

        {/* Comment Input */}
        <View style={styles.fieldGroup}>
          <FormField
            testID="review-comment-input"
            label={
              requiresDetails
                ? 'Nhận xét chi tiết (bắt buộc nếu không có bằng chứng)'
                : 'Nhận xét (tùy chọn)'
            }
            required={requiresDetails && evidence.length === 0}
            placeholder={
              requiresDetails
                ? 'Mô tả cụ thể vấn đề gặp phải trong giao dịch…'
                : 'Chia sẻ thêm về chất lượng đồ vật và thái độ giao dịch…'
            }
            helperText={`${comment.trim().length}/${MAX_REVIEW_COMMENT_LENGTH} ký tự`}
            multiline
            maxLength={MAX_REVIEW_COMMENT_LENGTH}
            value={comment}
            onChangeText={(text) => {
              setComment(text);
              if (commentError) setCommentError('');
              if (submitError) setSubmitError('');
            }}
            error={commentError}
            editable={!isBusy}
          />
        </View>

        {/* Private Evidence Manager */}
        <ReviewEvidenceManager
          orderId={orderReviewState.orderId}
          items={evidence}
          onChange={(next) => {
            setEvidence(next);
            if (next.length > 0 && commentError) setCommentError('');
            if (submitError) setSubmitError('');
          }}
          required={requiresDetails}
          disabled={isBusy}
          resetSignal={visible}
          persistedEvidenceIds={persistedEvidenceIds}
          onUploadingChange={setUploadingEvidence}
          onRestricted={onClose}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: primitive.space[4],
  },
  orderSummaryCard: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.lg,
    padding: primitive.space[3],
    gap: primitive.space[1.5],
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  orderListingTitle: {
    ...semantic.type.cardTitle,
  },
  summaryMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  summaryMetaText: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    flex: 1,
  },
  windowBadgeRow: {
    flexDirection: 'row',
    marginTop: primitive.space[1],
  },
  windowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: 4,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
  },
  windowPillExpired: {
    backgroundColor: semantic.color.dangerSoft,
  },
  windowPillText: {
    ...semantic.type.micro,
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  windowPillTextExpired: {
    color: semantic.color.danger,
  },
  fieldGroup: {
    gap: primitive.space[2],
  },
  ratingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  fieldLabel: {
    ...semantic.type.label,
    color: semantic.color.textSecondary,
  },
  ratingReadableText: {
    ...semantic.type.label,
    color: semantic.color.ratingText,
  },
  inlineErrorText: {
    ...semantic.type.micro,
    color: semantic.color.danger,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  flex: {
    flex: 1,
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
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: primitive.space[4],
  },
  secondaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.secondaryFg,
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
