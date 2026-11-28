import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../auth/session';
import { isRestrictedError } from '../../listings/sellerApi';
import { extractReviewApiError } from '../../reviews/api';
import {
  formatAppliedScoreDelta,
  formatDaysRemainingLabel,
  type ReviewDetail,
} from '../../reviews/types';
import { BottomSheet, Icon, InlineBanner } from '../ui';
import { component, primitive, semantic } from '../../theme';

export interface DeleteReviewSheetProps {
  visible: boolean;
  review: ReviewDetail;
  withinReviewWindow: boolean;
  daysRemaining: number;
  submitting: boolean;
  onClose: () => void;
  onConfirmDelete: (reviewId: string, expectedVersion: number) => Promise<void>;
  onRefreshState: () => Promise<boolean>;
}

export function DeleteReviewSheet({
  visible,
  review,
  withinReviewWindow,
  daysRemaining,
  submitting,
  onClose,
  onConfirmDelete,
  onRefreshState,
}: DeleteReviewSheetProps) {
  const mountedRef = useRef(true);
  const activeReviewIdRef = useRef(review.id);
  activeReviewIdRef.current = review.id;
  const submitGuardRef = useRef(false);
  const [deleteError, setDeleteError] = useState('');
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (visible) {
      setDeleteError('');
      setErrorCode(undefined);
    }
  }, [visible, review.id]);

  const isBusy = submitting || refreshing;

  const handleConfirm = async () => {
    if (submitGuardRef.current || isBusy) return;
    setDeleteError('');
    setErrorCode(undefined);
    const targetReviewId = review.id;
    submitGuardRef.current = true;
    try {
      await onConfirmDelete(targetReviewId, review.version);
      if (!mountedRef.current || activeReviewIdRef.current !== targetReviewId) return;
      onClose();
    } catch (err) {
      if (!mountedRef.current || activeReviewIdRef.current !== targetReviewId) return;
      // BI_KHOA (403 ACCOUNT_RESTRICTED): đóng sheet để <RestrictedAccountNotice /> hiển thị rõ.
      if (isRestrictedError(err)) {
        if (!useSession.getState().restriction) {
          useSession.setState({ restriction: err.restriction, restrictionDismissed: false });
        }
        onClose();
        return;
      }
      const parsed = extractReviewApiError(
        err,
        'Không thể xóa đánh giá lúc này. Đánh giá và điểm uy tín vẫn được giữ nguyên để bạn thử lại.',
      );
      setDeleteError(parsed.message);
      setErrorCode(parsed.code);
    } finally {
      submitGuardRef.current = false;
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    const targetReviewId = review.id;
    setRefreshing(true);
    try {
      const ok = await onRefreshState();
      if (!mountedRef.current || activeReviewIdRef.current !== targetReviewId) return;
      if (ok) {
        onClose();
      } else {
        setDeleteError(
          'Không thể tải lại trạng thái mới nhất do lỗi kết nối. Vui lòng thử lại.',
        );
      }
    } catch (err) {
      if (!mountedRef.current || activeReviewIdRef.current !== targetReviewId) return;
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
      setDeleteError(parsed.message);
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  };

  const canRefreshFromError =
    errorCode === 'VERSION_CONFLICT' ||
    errorCode === 'REVIEW_MODERATED' ||
    errorCode === 'REVIEW_COMPLAINT_LOCKED' ||
    errorCode === 'REVIEW_DELETED';

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        if (!isBusy) onClose();
      }}
      title="Xác nhận xóa đánh giá"
      subtitle="Hành động này sẽ gỡ đánh giá hiện tại khỏi giao dịch."
      testID="delete-review-sheet"
      footerSlot={
        <View style={styles.footerRow}>
          <Pressable
            testID="delete-review-cancel-button"
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Hủy xóa đánh giá"
            onPress={onClose}
            style={({ pressed }) => [
              styles.secondaryBtn,
              styles.flex,
              isBusy && styles.disabled,
              pressed && !isBusy && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryBtnText}>Hủy</Text>
          </Pressable>

          <Pressable
            testID="delete-review-confirm-button"
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Xác nhận xóa đánh giá"
            accessibilityState={{ disabled: isBusy, busy: submitting }}
            onPress={() => void handleConfirm()}
            style={({ pressed }) => [
              styles.dangerBtn,
              styles.flex,
              isBusy && styles.disabled,
              pressed && !isBusy && styles.pressed,
            ]}
          >
            <Icon name="trash-2" size={15} color={semantic.color.textInverse} />
            <Text style={styles.dangerBtnText}>
              {submitting ? 'Đang xóa…' : 'Xác nhận xóa'}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        {deleteError ? (
          <InlineBanner
            testID="delete-review-error"
            tone="danger"
            message={deleteError}
            actionLabel={canRefreshFromError ? 'Tải lại trạng thái' : undefined}
            actionTestID={canRefreshFromError ? 'delete-review-refresh-conflict' : undefined}
            onActionPress={canRefreshFromError ? () => void handleRefresh() : undefined}
          />
        ) : null}

        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>
            Đánh giá {review.rating} sao ·{' '}
            {formatAppliedScoreDelta(review.appliedScoreDelta, review.status)}
          </Text>
          {review.comment ? (
            <Text style={styles.previewComment} numberOfLines={3}>
              “{review.comment}”
            </Text>
          ) : null}
        </View>

        <View style={styles.consequencesBox} testID="delete-review-consequences">
          <Text style={styles.consequencesHeading}>Hệ quả khi xóa đánh giá (UC-32)</Text>

          <View style={styles.bulletRow}>
            <Icon name="eye-off" size={15} color={semantic.color.danger} />
            <Text style={styles.bulletText}>
              Đánh giá bị gỡ khỏi hiển thị công khai (và rút khỏi danh sách chờ kiểm duyệt nếu đang
              chờ xét). Bản ghi vẫn được lưu mềm trong lịch sử để truy vết.
            </Text>
          </View>

          <View style={styles.bulletRow}>
            <Icon name="refresh-cw" size={15} color={semantic.color.warning} />
            <Text style={styles.bulletText}>
              Tác động điểm uy tín đã áp dụng cho người bán (nếu có) sẽ được hoàn lại chính xác.
            </Text>
          </View>

          <View style={styles.bulletRow}>
            <Icon
              name={withinReviewWindow ? 'check-circle' : 'clock'}
              size={15}
              color={withinReviewWindow ? semantic.color.success : semantic.color.textSecondary}
            />
            <Text style={styles.bulletText}>
              {withinReviewWindow
                ? `Giao dịch trở lại trạng thái chưa đánh giá — bạn vẫn có thể đánh giá lại trong hạn 15 ngày (${formatDaysRemainingLabel(daysRemaining, true)}).`
                : 'Giao dịch trở lại trạng thái chưa đánh giá, nhưng đã quá thời hạn 15 ngày nên bạn không thể gửi đánh giá mới.'}
            </Text>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: primitive.space[3],
  },
  previewBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    padding: primitive.space[3],
    gap: primitive.space[1.5],
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  previewTitle: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  previewComment: {
    ...semantic.type.caption,
    color: semantic.color.textSecondary,
  },
  consequencesBox: {
    backgroundColor: semantic.color.dangerSoft,
    borderRadius: primitive.radius.lg,
    padding: primitive.space[3],
    gap: primitive.space[2.5],
  },
  consequencesHeading: {
    ...semantic.type.label,
    color: semantic.color.danger,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[2],
  },
  bulletText: {
    flex: 1,
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    lineHeight: 19,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  flex: {
    flex: 1,
  },
  secondaryBtn: {
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: component.button.paddingX,
  },
  secondaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.secondaryFg,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.destructiveBg,
    paddingHorizontal: component.button.paddingX,
  },
  dangerBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textInverse,
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
