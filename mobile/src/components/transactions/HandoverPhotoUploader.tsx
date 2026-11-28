import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  pickImagesFromLibrary,
  takePhotoWithCamera,
  type PickableImageAsset,
} from '../../media/imagePicker';
import { MAX_HANDOVER_PHOTOS } from '../../transactions/api';
import { formatFileSize } from '../../transactions/types';
import { component, primitive, semantic } from '../../theme';
import { Icon, InlineBanner } from '../ui';

export interface HandoverPhotoUploaderProps {
  photos: PickableImageAsset[];
  onChange: (nextPhotos: PickableImageAsset[]) => void;
  disabled?: boolean;
  error?: string | null;
  maxPhotos?: number;
  isCombo?: boolean;
  onFeedback?: (message: string) => void;
}

export function HandoverPhotoUploader({
  photos,
  onChange,
  disabled = false,
  error,
  maxPhotos = MAX_HANDOVER_PHOTOS,
  isCombo = false,
  onFeedback,
}: HandoverPhotoUploaderProps) {
  const [localError, setLocalError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [picking, setPicking] = useState(false);

  const remaining = Math.max(0, maxPhotos - photos.length);
  const busy = disabled || picking;
  const safeIndex = photos.length > 0 ? Math.min(activeIndex, photos.length - 1) : 0;
  const activePhoto = photos[safeIndex] ?? null;
  const activeSizeLabel = formatFileSize(activePhoto?.fileSize ?? activePhoto?.file?.size);

  const appendUnique = (incoming: PickableImageAsset[], replaceIndex?: number) => {
    if (incoming.length === 0) return;
    if (typeof replaceIndex === 'number' && replaceIndex >= 0 && replaceIndex < photos.length) {
      const next = [...photos];
      next[replaceIndex] = incoming[0];
      onChange(next);
      setActiveIndex(replaceIndex);
      onFeedback?.(`Đã cập nhật ảnh ${replaceIndex + 1}.`);
      return;
    }
    const existingUris = new Set(photos.map((p) => p.uri));
    const merged = [...photos];
    let added = 0;
    for (const asset of incoming) {
      if (merged.length >= maxPhotos) break;
      if (!existingUris.has(asset.uri)) {
        existingUris.add(asset.uri);
        merged.push(asset);
        added += 1;
      }
    }
    onChange(merged);
    setActiveIndex(Math.max(0, merged.length - 1));
    if (added > 0) {
      onFeedback?.(`Đã thêm ${added} ảnh (${merged.length}/${maxPhotos}).`);
    }
  };

  const handleCamera = async (replaceIndex?: number) => {
    if (busy) return;
    if (replaceIndex === undefined && remaining <= 0) {
      setLocalError(`Tối đa ${maxPhotos} ảnh bàn giao.`);
      return;
    }
    setLocalError('');
    setPicking(true);
    try {
      const photo = await takePhotoWithCamera();
      if (photo) {
        appendUnique([photo], replaceIndex);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Không thể chụp ảnh.');
    } finally {
      setPicking(false);
    }
  };

  const handleLibrary = async (replaceIndex?: number) => {
    if (busy) return;
    const slots = replaceIndex !== undefined ? 1 : remaining;
    if (slots <= 0) {
      setLocalError(`Tối đa ${maxPhotos} ảnh bàn giao.`);
      return;
    }
    setLocalError('');
    setPicking(true);
    try {
      const picked = await pickImagesFromLibrary(slots);
      if (picked.length > 0) {
        appendUnique(picked, replaceIndex);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Không thể chọn ảnh từ thư viện.');
    } finally {
      setPicking(false);
    }
  };

  const handlePromoteCover = (index: number) => {
    if (busy || index <= 0 || index >= photos.length) return;
    setLocalError('');
    const next = [...photos];
    const [selected] = next.splice(index, 1);
    next.unshift(selected);
    onChange(next);
    setActiveIndex(0);
    onFeedback?.('Đã đặt làm ảnh chính.');
  };

  const handleRemove = (index: number) => {
    if (busy) return;
    setLocalError('');
    const next = photos.filter((_, idx) => idx !== index);
    onChange(next);
    setActiveIndex((prev) => Math.max(0, Math.min(prev, next.length - 1)));
  };

  const visibleError = localError || error || '';

  return (
    <View style={styles.container} testID="handover-photo-uploader">
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.sectionLabel}>Ảnh bàn giao</Text>
          <Text style={styles.requiredMark}>*</Text>
        </View>
        <Text style={styles.counterText} testID="handover-photo-count">
          {photos.length}/{maxPhotos}
        </Text>
      </View>

      {/* Compact 1-row 3-icon tip strip (keeps camera hero above the fold) */}
      <View style={styles.tipStrip} testID="handover-tip-strip">
        <View style={styles.tipChip}>
          <Icon name="package" size={12} color={semantic.color.accent} />
          <Text style={styles.tipChipText} numberOfLines={1}>
            {isCombo ? 'Đủ món combo' : 'Rõ đồ'}
          </Text>
        </View>
        <View style={styles.tipDivider} />
        <View style={styles.tipChip}>
          <Icon name="sun" size={12} color={semantic.color.accent} />
          <Text style={styles.tipChipText} numberOfLines={1}>
            Đủ sáng
          </Text>
        </View>
        <View style={styles.tipDivider} />
        <View style={styles.tipChip}>
          <Icon name="map-pin" size={12} color={semantic.color.accent} />
          <Text style={styles.tipChipText} numberOfLines={1}>
            Tại điểm hẹn
          </Text>
        </View>
      </View>

      {activePhoto ? (
        <View style={styles.previewWrap} testID="handover-photo-preview">
          <Image
            source={{ uri: activePhoto.uri }}
            style={styles.previewImage}
            resizeMode="cover"
            accessibilityLabel={`Ảnh bàn giao ${safeIndex + 1}`}
          />

          {/* Top overlay badges: Ảnh chính + File size + Privacy lock */}
          <View style={styles.topOverlayBar}>
            <View style={styles.topOverlayLeft}>
              {safeIndex === 0 ? (
                <View style={styles.coverBadge} testID="handover-cover-badge">
                  <Icon name="star" size={10} color={semantic.color.textInverse} />
                  <Text style={styles.badgeText}>Ảnh chính</Text>
                </View>
              ) : (
                <View style={styles.indexBadge}>
                  <Text style={styles.badgeText}>
                    Ảnh {safeIndex + 1}/{photos.length}
                  </Text>
                </View>
              )}

              {activeSizeLabel ? (
                <View style={styles.sizeBadge} testID="handover-photo-size">
                  <Text style={styles.badgeText}>{activeSizeLabel}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.privacyChip}>
              <Icon name="lock" size={10} color={semantic.color.textInverse} />
              <Text style={styles.badgeText}>Riêng tư</Text>
            </View>
          </View>

          {/* Bottom overlay actions: Promote cover (when index > 0), Replace, Delete */}
          <View style={styles.previewOverlayBar}>
            {safeIndex > 0 ? (
              <Pressable
                testID="handover-promote-cover"
                hitSlop={8}
                disabled={busy}
                onPress={() => handlePromoteCover(safeIndex)}
                accessibilityRole="button"
                accessibilityLabel="Đặt làm ảnh chính"
                style={({ pressed }) => [
                  styles.overlayBtn,
                  styles.overlayBtnAccent,
                  busy && styles.disabledState,
                  pressed && !busy && styles.pressedState,
                ]}
              >
                <Icon name="star" size={12} color={semantic.color.textInverse} />
                <Text style={styles.overlayBtnText}>Đặt làm ảnh chính</Text>
              </Pressable>
            ) : null}

            <Pressable
              testID="handover-replace-photo"
              hitSlop={8}
              disabled={busy}
              onPress={() => void handleCamera(safeIndex)}
              accessibilityRole="button"
              accessibilityLabel="Đổi ảnh này"
              style={({ pressed }) => [
                styles.overlayBtn,
                busy && styles.disabledState,
                pressed && !busy && styles.pressedState,
              ]}
            >
              <Icon name="camera" size={12} color={semantic.color.textInverse} />
              <Text style={styles.overlayBtnText}>Đổi ảnh</Text>
            </Pressable>

            <Pressable
              testID={`handover-remove-photo-${safeIndex}`}
              hitSlop={8}
              disabled={busy}
              onPress={() => handleRemove(safeIndex)}
              accessibilityRole="button"
              accessibilityLabel={`Xóa ảnh ${safeIndex + 1}`}
              style={({ pressed }) => [
                styles.overlayBtn,
                styles.overlayBtnDanger,
                busy && styles.disabledState,
                pressed && !busy && styles.pressedState,
              ]}
            >
              <Icon name="trash-2" size={12} color={semantic.color.textInverse} />
              <Text style={styles.overlayBtnText}>Xóa</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          testID="handover-photo-dropzone"
          disabled={busy}
          onPress={() => void handleCamera()}
          accessibilityRole="button"
          accessibilityLabel="Chụp ảnh ngay khi bàn giao"
          style={({ pressed }) => [
            styles.dropzone,
            busy && styles.disabledState,
            pressed && !busy && styles.pressedState,
          ]}
        >
          <View style={styles.dropzoneIconWrap}>
            <Icon name="camera" size={24} color={semantic.color.accent} />
          </View>
          <Text style={styles.dropzoneTitle}>Chụp ảnh bàn giao</Text>
          <Text style={styles.dropzoneSub}>
            JPEG, PNG, WebP · Tối đa 5MB/ảnh
          </Text>
        </Pressable>
      )}

      {/* Multi-photo thumbnail rail for combo / multi-angle proof */}
      {photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbRail}
        >
          {photos.map((item, index) => {
            const selected = index === safeIndex;
            return (
              <Pressable
                key={`${item.uri}-${index}`}
                testID={`handover-thumb-${index}`}
                onPress={() => setActiveIndex(index)}
                accessibilityRole="button"
                accessibilityLabel={
                  index === 0
                    ? 'Xem trước ảnh bàn giao chính'
                    : `Xem trước ảnh bàn giao ${index + 1}`
                }
                accessibilityState={{ selected }}
                style={[styles.thumbItem, selected && styles.thumbItemSelected]}
              >
                <Image source={{ uri: item.uri }} style={styles.thumbImage} resizeMode="cover" />
                {index === 0 ? (
                  <View style={styles.thumbCoverTag} testID="handover-thumb-cover-0">
                    <Text style={styles.thumbCoverTagText}>Chính</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Camera-first & Library action buttons */}
      <View style={styles.actionsRow}>
        <Pressable
          testID="handover-take-photo"
          disabled={busy || remaining <= 0}
          onPress={() => void handleCamera()}
          accessibilityRole="button"
          accessibilityLabel="Chụp ảnh bàn giao"
          accessibilityState={{ disabled: busy || remaining <= 0 }}
          style={({ pressed }) => [
            styles.cameraBtn,
            (busy || remaining <= 0) && styles.disabledState,
            pressed && !busy && remaining > 0 && styles.pressedState,
          ]}
        >
          <Icon name="camera" size={16} color={semantic.color.accent} />
          <Text style={styles.cameraBtnText}>
            {photos.length > 0 ? 'Chụp thêm' : 'Chụp ảnh'}
          </Text>
        </Pressable>

        <Pressable
          testID="handover-pick-library"
          disabled={busy || remaining <= 0}
          onPress={() => void handleLibrary()}
          accessibilityRole="button"
          accessibilityLabel="Chọn từ thư viện"
          accessibilityState={{ disabled: busy || remaining <= 0 }}
          style={({ pressed }) => [
            styles.libraryBtn,
            (busy || remaining <= 0) && styles.disabledState,
            pressed && !busy && remaining > 0 && styles.pressedState,
          ]}
        >
          <Icon name="image" size={16} color={semantic.color.textPrimary} />
          <Text style={styles.libraryBtnText}>Thư viện</Text>
        </Pressable>
      </View>

      {visibleError ? (
        <InlineBanner testID="handover-photo-error" tone="danger" message={visibleError} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: primitive.space[2.5],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sectionLabel: {
    ...semantic.type.label,
  },
  requiredMark: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  counterText: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  tipStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: semantic.color.bgWarmTint,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1.5],
    gap: primitive.space[1.5],
  },
  tipChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tipChipText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.accentDeep,
    flexShrink: 1,
  },
  tipDivider: {
    width: 1,
    height: 12,
    backgroundColor: semantic.color.accentBorder,
  },
  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: semantic.color.accentBorder,
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.bgWarmTint,
    paddingHorizontal: primitive.space[4],
    paddingVertical: primitive.space[5],
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
  },
  dropzoneIconWrap: {
    width: 48,
    height: 48,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropzoneTitle: {
    ...semantic.type.cardTitle,
    textAlign: 'center',
  },
  dropzoneSub: {
    ...semantic.type.micro,
    alignSelf: 'stretch',
    textAlign: 'center',
    lineHeight: 16,
  },
  previewWrap: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: primitive.radius.lg,
    overflow: 'hidden',
    backgroundColor: semantic.color.bgTrack,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  topOverlayBar: {
    position: 'absolute',
    top: primitive.space[2],
    left: primitive.space[2],
    right: primitive.space[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[1.5],
  },
  topOverlayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    flexShrink: 1,
  },
  coverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: primitive.space[2],
    paddingVertical: 3,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accent,
  },
  indexBadge: {
    paddingHorizontal: primitive.space[2],
    paddingVertical: 3,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
  },
  sizeBadge: {
    paddingHorizontal: primitive.space[2],
    paddingVertical: 3,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
  },
  privacyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: primitive.space[2],
    paddingVertical: 3,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textInverse,
  },
  previewOverlayBar: {
    position: 'absolute',
    bottom: primitive.space[2],
    left: primitive.space[2],
    right: primitive.space[2],
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: primitive.space[1.5],
  },
  overlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
  },
  overlayBtnAccent: {
    backgroundColor: semantic.color.accent,
  },
  overlayBtnDanger: {
    backgroundColor: semantic.color.danger,
  },
  overlayBtnText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textInverse,
  },
  thumbRail: {
    flexDirection: 'row',
    gap: primitive.space[2],
  },
  thumbItem: {
    width: 64,
    height: 64,
    borderRadius: primitive.radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: semantic.color.bgTrack,
    position: 'relative',
  },
  thumbItemSelected: {
    borderColor: semantic.color.accent,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbCoverTag: {
    position: 'absolute',
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
    alignItems: 'center',
    paddingVertical: 1,
  },
  thumbCoverTagText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textInverse,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  cameraBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    minHeight: component.button.minHeightSm + 6,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.accentSoft,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
    paddingHorizontal: primitive.space[3],
  },
  cameraBtnText: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  libraryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    minHeight: component.button.minHeightSm + 6,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderStrong,
    paddingHorizontal: primitive.space[3],
  },
  libraryBtnText: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  disabledState: {
    opacity: primitive.opacity.disabled,
  },
  pressedState: {
    opacity: primitive.opacity.pressed,
  },
});
