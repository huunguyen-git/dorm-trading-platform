import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { buildReviewEvidenceImageSource } from '../../api/client';
import { useSession } from '../../auth/session';
import { isRestrictedError } from '../../listings/sellerApi';
import { pickImagesFromLibrary, takePhotoWithCamera } from '../../media/imagePicker';
import { extractReviewApiError, uploadReviewEvidence } from '../../reviews/api';
import { MAX_REVIEW_EVIDENCE, type ReviewEvidenceItem } from '../../reviews/types';
import { Icon, InlineBanner } from '../ui';
import { ReviewEvidenceLightbox } from './ReviewEvidenceLightbox';
import { component, primitive, semantic } from '../../theme';

export interface ReviewEvidenceManagerProps {
  orderId: string;
  items: ReviewEvidenceItem[];
  onChange: (nextItems: ReviewEvidenceItem[]) => void;
  required?: boolean;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

export function ReviewEvidenceManager({
  orderId,
  items,
  onChange,
  required = false,
  disabled = false,
  onUploadingChange,
}: ReviewEvidenceManagerProps) {
  const token = useSession((s) => s.token);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const pickerInFlightRef = useRef(false);
  const latestItemsRef = useRef(items);
  latestItemsRef.current = items;

  const remainingSlots = Math.max(0, MAX_REVIEW_EVIDENCE - items.length);
  const busyOrDisabled = disabled || uploading;
  const canAddMore = !busyOrDisabled && remainingSlots > 0;

  const setUploadFlag = (next: boolean) => {
    setUploading(next);
    onUploadingChange?.(next);
  };

  const handleFailure = (err: unknown, fallback: string) => {
    if (isRestrictedError(err)) {
      if (!useSession.getState().restriction) {
        useSession.setState({ restriction: err.restriction, restrictionDismissed: false });
      }
      setError('');
      return;
    }
    const parsed = extractReviewApiError(err, fallback);
    setError(parsed.message);
  };

  const appendUploaded = (uploaded: ReviewEvidenceItem[]) => {
    const merged = [...latestItemsRef.current];
    const seen = new Set(merged.map((ev) => ev.id));
    for (const item of uploaded) {
      if (!item.id || seen.has(item.id)) continue;
      if (merged.length >= MAX_REVIEW_EVIDENCE) break;
      seen.add(item.id);
      merged.push(item);
    }
    onChange(merged);
  };

  const handlePickLibrary = async () => {
    if (pickerInFlightRef.current || busyOrDisabled) return;
    setError('');
    const slots = Math.max(0, MAX_REVIEW_EVIDENCE - latestItemsRef.current.length);
    if (slots <= 0) {
      setError(`Bạn chỉ có thể đính kèm tối đa ${MAX_REVIEW_EVIDENCE} ảnh bằng chứng.`);
      return;
    }

    pickerInFlightRef.current = true;
    try {
      const picked = await pickImagesFromLibrary(slots);
      if (picked.length === 0) return;

      setUploadFlag(true);
      const uploaded = await uploadReviewEvidence(orderId, picked);
      if (uploaded.length === 0) {
        setError('Không nhận được thông tin tệp bằng chứng sau khi tải lên. Vui lòng thử lại.');
        return;
      }
      appendUploaded(uploaded);
    } catch (err) {
      handleFailure(err, 'Không thể tải ảnh bằng chứng lên máy chủ. Vui lòng chọn lại tệp hợp lệ.');
    } finally {
      pickerInFlightRef.current = false;
      setUploadFlag(false);
    }
  };

  const handleTakePhoto = async () => {
    if (pickerInFlightRef.current || busyOrDisabled) return;
    setError('');
    const slots = Math.max(0, MAX_REVIEW_EVIDENCE - latestItemsRef.current.length);
    if (slots <= 0) {
      setError(`Bạn chỉ có thể đính kèm tối đa ${MAX_REVIEW_EVIDENCE} ảnh bằng chứng.`);
      return;
    }

    pickerInFlightRef.current = true;
    try {
      const photo = await takePhotoWithCamera();
      if (!photo) return;

      setUploadFlag(true);
      const uploaded = await uploadReviewEvidence(orderId, [photo]);
      if (uploaded.length === 0) {
        setError('Không nhận được thông tin ảnh sau khi chụp. Vui lòng thử lại.');
        return;
      }
      appendUploaded(uploaded);
    } catch (err) {
      handleFailure(err, 'Không thể chụp hoặc tải ảnh bằng chứng lên máy chủ.');
    } finally {
      pickerInFlightRef.current = false;
      setUploadFlag(false);
    }
  };

  const handleRemove = (id: string) => {
    if (busyOrDisabled) return;
    setError('');
    onChange(items.filter((ev) => ev.id !== id));
  };

  return (
    <View style={styles.container} testID="review-evidence-manager">
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Text style={styles.label}>
            Ảnh bằng chứng{required ? ' (hoặc nhập nhận xét)' : ' (tùy chọn)'}
          </Text>
        </View>
        <Text style={styles.counter} testID="review-evidence-count">
          {items.length}/{MAX_REVIEW_EVIDENCE}
        </Text>
      </View>

      <View style={styles.privacyRow}>
        <Icon name="lock" size={12} color={semantic.color.textSecondary} />
        <Text style={styles.privacyText}>
          Chỉ người bán bị đánh giá, kiểm duyệt viên và quản trị viên cấp cao được xem (JPEG, PNG,
          WebP · tối đa 5MB/ảnh).
        </Text>
      </View>

      {uploading ? (
        <View style={styles.uploadingRow} testID="review-evidence-uploading">
          <ActivityIndicator size="small" color={semantic.color.accent} />
          <Text style={styles.uploadingText}>Đang tải ảnh bằng chứng…</Text>
        </View>
      ) : null}

      {items.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railContent}
        >
          {items.map((item, idx) => (
            <View
              key={item.id}
              style={styles.thumbWrap}
              testID={`review-evidence-item-${item.id}`}
            >
              <Pressable
                testID={`review-evidence-preview-${idx}`}
                accessibilityRole="button"
                accessibilityLabel={`Xem bằng chứng ${idx + 1}`}
                onPress={() => setLightboxIndex(idx)}
                style={styles.thumbPress}
              >
                <Image
                  testID={`review-evidence-image-${idx}`}
                  source={buildReviewEvidenceImageSource(item.url, token)}
                  style={styles.thumbImage}
                  resizeMode="cover"
                />
              </Pressable>
              <Pressable
                testID={`review-evidence-remove-${item.id}`}
                disabled={busyOrDisabled}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Gỡ bằng chứng ${idx + 1}`}
                onPress={() => handleRemove(item.id)}
                style={({ pressed }) => [
                  styles.removeBtn,
                  busyOrDisabled && styles.disabled,
                  pressed && !busyOrDisabled && styles.pressed,
                ]}
              >
                <Icon name="x" size={12} color={semantic.color.textInverse} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          testID="review-evidence-pick-library"
          disabled={!canAddMore}
          accessibilityRole="button"
          accessibilityLabel="Chọn bằng chứng từ thư viện"
          accessibilityState={{ disabled: !canAddMore, busy: uploading }}
          onPress={() => void handlePickLibrary()}
          style={({ pressed }) => [
            styles.actionChip,
            !canAddMore && styles.disabled,
            pressed && canAddMore && styles.pressed,
          ]}
        >
          <Icon name="image" size={14} color={semantic.color.textPrimary} />
          <Text style={styles.actionChipText}>Chọn từ thư viện</Text>
        </Pressable>

        <Pressable
          testID="review-evidence-take-photo"
          disabled={!canAddMore}
          accessibilityRole="button"
          accessibilityLabel="Chụp ảnh bằng chứng"
          accessibilityState={{ disabled: !canAddMore, busy: uploading }}
          onPress={() => void handleTakePhoto()}
          style={({ pressed }) => [
            styles.actionChip,
            !canAddMore && styles.disabled,
            pressed && canAddMore && styles.pressed,
          ]}
        >
          <Icon name="camera" size={14} color={semantic.color.textPrimary} />
          <Text style={styles.actionChipText}>Chụp ảnh</Text>
        </Pressable>
      </View>

      {error ? (
        <InlineBanner testID="review-evidence-error" tone="danger" message={error} />
      ) : null}

      <ReviewEvidenceLightbox
        items={items}
        activeIndex={lightboxIndex ?? 0}
        visible={lightboxIndex !== null}
        onChangeIndex={(next) => setLightboxIndex(next)}
        onClose={() => setLightboxIndex(null)}
      />
    </View>
  );
}

const THUMB_SIZE = 76;

const styles = StyleSheet.create({
  container: {
    gap: primitive.space[2],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
  },
  label: {
    ...semantic.type.label,
    color: semantic.color.textSecondary,
  },
  counter: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[1.5],
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[2],
  },
  privacyText: {
    flex: 1,
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    lineHeight: 16,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSubtle,
  },
  uploadingText: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
  },
  railContent: {
    flexDirection: 'row',
    gap: primitive.space[2],
    paddingVertical: primitive.space[1],
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: primitive.radius.md,
    overflow: 'hidden',
    backgroundColor: semantic.color.bgTrack,
    position: 'relative',
  },
  thumbPress: {
    width: '100%',
    height: '100%',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    minHeight: component.button.minHeightSm,
    paddingHorizontal: primitive.space[3],
    borderRadius: primitive.radius.full,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSubtle,
  },
  actionChipText: {
    ...semantic.type.label,
    fontSize: primitive.fontSize.sm,
    color: semantic.color.textPrimary,
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
