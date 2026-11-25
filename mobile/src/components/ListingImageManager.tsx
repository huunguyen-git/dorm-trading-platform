import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MAX_LISTING_IMAGES,
  pickImagesFromLibrary,
  takePhotoWithCamera,
  uploadListingImages,
  validateImageUrl,
} from '../media/imagePicker';
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import { useSession } from '../auth/session';
import { ActionSheet, Icon, InlineBanner, type ActionSheetOption } from './ui';
import { component, primitive, semantic } from '../theme';

export interface ListingImageManagerProps {
  images: string[];
  onChange: (nextImages: string[]) => void;
  disabled?: boolean;
  error?: string;
  maxImages?: number;
  onUploadingChange?: (uploading: boolean) => void;
}

export default function ListingImageManager({
  images,
  onChange,
  disabled = false,
  error,
  maxImages = MAX_LISTING_IMAGES,
  onUploadingChange,
}: ListingImageManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [sourceSheetVisible, setSourceSheetVisible] = useState(false);

  useEffect(() => {
    if (error) {
      setLocalError('');
    }
  }, [error]);

  const remainingSlots = Math.max(0, maxImages - images.length);
  const busyOrDisabled = disabled || uploading;
  const canAddMore = !busyOrDisabled && remainingSlots > 0;

  const setUploadFlag = (value: boolean) => {
    setUploading(value);
    onUploadingChange?.(value);
  };

  const handleUploadFailure = (err: unknown, fallback: string) => {
    if (isRestrictedError(err)) {
      if (!useSession.getState().restriction) {
        useSession.setState({ restriction: err.restriction, restrictionDismissed: false });
      }
      setLocalError('');
      return;
    }
    const parsed = extractApiError(err, fallback);
    setLocalError(parsed.message);
  };

  const appendUniqueUrls = (urls: string[]) => {
    const merged = [...images];
    for (const rawUrl of urls) {
      const cleaned = rawUrl.trim();
      if (!cleaned) continue;
      if (merged.length >= maxImages) break;
      if (!merged.includes(cleaned)) {
        merged.push(cleaned);
      }
    }
    onChange(merged);
  };

  const handlePickFromLibrary = async () => {
    setLocalError('');
    if (remainingSlots <= 0) {
      setLocalError(`Bạn chỉ có thể đính kèm tối đa ${maxImages} ảnh thực tế cho mỗi tin đăng.`);
      return;
    }

    try {
      const picked = await pickImagesFromLibrary(remainingSlots);
      if (picked.length === 0) return;

      setUploadFlag(true);
      const uploaded = await uploadListingImages(picked);
      if (uploaded.length === 0) {
        setLocalError('Không nhận được đường dẫn ảnh sau khi tải lên. Vui lòng thử lại.');
        return;
      }
      appendUniqueUrls(uploaded.map((item) => item.url));
    } catch (err) {
      handleUploadFailure(err, 'Không thể chọn hoặc tải ảnh từ thư viện lên máy chủ.');
    } finally {
      setUploadFlag(false);
    }
  };

  const handleTakePhoto = async () => {
    setLocalError('');
    if (remainingSlots <= 0) {
      setLocalError(`Bạn chỉ có thể đính kèm tối đa ${maxImages} ảnh thực tế cho mỗi tin đăng.`);
      return;
    }

    try {
      const photo = await takePhotoWithCamera();
      if (!photo) return;

      setUploadFlag(true);
      const uploaded = await uploadListingImages([photo]);
      if (uploaded.length === 0) {
        setLocalError('Không nhận được đường dẫn ảnh sau khi chụp. Vui lòng thử lại.');
        return;
      }
      appendUniqueUrls(uploaded.map((item) => item.url));
    } catch (err) {
      handleUploadFailure(err, 'Không thể chụp hoặc tải ảnh lên máy chủ.');
    } finally {
      setUploadFlag(false);
    }
  };

  const handleAddLink = () => {
    setLocalError('');
    if (remainingSlots <= 0) {
      setLocalError(`Bạn chỉ có thể đính kèm tối đa ${maxImages} ảnh thực tế cho mỗi tin đăng.`);
      return;
    }
    const validation = validateImageUrl(linkDraft);
    if (!validation.valid) {
      setLocalError(validation.error ?? 'Đường dẫn ảnh không hợp lệ.');
      return;
    }
    const cleaned = linkDraft.trim();
    if (images.includes(cleaned)) {
      setLocalError('Ảnh này đã có trong danh sách.');
      return;
    }
    onChange([...images, cleaned]);
    setLinkDraft('');
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    setLocalError('');
    const next = [...images];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
  };

  const handleRemove = (index: number) => {
    setLocalError('');
    onChange(images.filter((_, idx) => idx !== index));
  };

  const sourceSheetOptions: ActionSheetOption[] = [
    {
      key: 'gallery',
      label: 'Chọn từ thư viện',
      description: `Chọn tối đa ${remainingSlots} ảnh từ máy`,
      icon: 'image',
      disabled: !canAddMore,
      testID: 'pick-gallery-btn',
      onPress: () => void handlePickFromLibrary(),
    },
    {
      key: 'camera',
      label: 'Chụp ảnh mới',
      description: 'Chụp trực tiếp tình trạng đồ vật',
      icon: 'camera',
      disabled: !canAddMore,
      testID: 'take-photo-btn',
      onPress: () => void handleTakePhoto(),
    },
    {
      key: 'link',
      label: 'Dán liên kết ảnh',
      description: 'Nhập đường dẫn ảnh có sẵn',
      icon: 'link',
      disabled,
      testID: 'toggle-url-input-btn',
      onPress: () => {
        setLocalError('');
        setShowLinkInput(true);
      },
    },
  ];

  const visibleError = localError || error || '';

  return (
    <View style={styles.container} testID="listing-image-manager">
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Ảnh thực tế
          </Text>
          <Text style={styles.requiredMark}>*</Text>
        </View>
        <Text
          style={[styles.counterText, images.length > 0 && styles.counterTextActive]}
          testID="listing-image-count"
        >
          {images.length}/{maxImages} ảnh thực tế
        </Text>
      </View>

      <Text style={styles.caption}>
        Cần 1–{maxImages} ảnh thực tế khi công khai (JPEG, PNG, WebP, tối đa 5MB/ảnh). Ảnh đầu tiên là ảnh bìa.
      </Text>

      {uploading ? (
        <View style={styles.uploadingRow} testID="listing-image-uploading">
          <ActivityIndicator color={semantic.color.accent} size="small" />
          <Text style={styles.uploadingText}>Đang tải ảnh lên máy chủ...</Text>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
      >
        <Pressable
          testID="add-photo-tile"
          accessibilityRole="button"
          accessibilityLabel="Thêm ảnh thực tế"
          accessibilityState={{ disabled: !canAddMore }}
          disabled={!canAddMore}
          onPress={() => {
            setLocalError('');
            setSourceSheetVisible(true);
          }}
          style={({ pressed }) => [
            styles.addTile,
            !canAddMore && styles.disabledState,
            pressed && canAddMore && styles.pressedState,
          ]}
        >
          <Icon
            name="camera"
            size={20}
            color={canAddMore ? semantic.color.accent : semantic.color.textSecondary}
          />
          <Text style={styles.addTileLabel}>Thêm ảnh</Text>
          <Text style={styles.addTileCount}>
            {images.length}/{maxImages}
          </Text>
        </Pressable>

        {images.map((uri, index) => {
          const canMoveLeft = !busyOrDisabled && index > 0;
          const canMoveRight = !busyOrDisabled && index < images.length - 1;

          return (
            <View
              key={`${uri}-${index}`}
              style={styles.photoColumn}
              testID={`listing-image-card-${index}`}
            >
              <View style={styles.photoTile}>
                <Image
                  source={{ uri }}
                  style={styles.photoImage}
                  resizeMode="cover"
                  accessibilityLabel={`Ảnh tin đăng ${index + 1}`}
                />

                {index === 0 ? (
                  <View style={styles.coverPill} testID="listing-image-cover-badge">
                    <Text style={styles.coverPillText}>Ảnh bìa</Text>
                  </View>
                ) : null}

                <Pressable
                  testID={`remove-image-${index}`}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Xóa ảnh ${index + 1}`}
                  accessibilityState={{ disabled: busyOrDisabled }}
                  disabled={busyOrDisabled}
                  onPress={() => handleRemove(index)}
                  style={({ pressed }) => [
                    styles.removeBadge,
                    busyOrDisabled && styles.disabledState,
                    pressed && !busyOrDisabled && styles.pressedState,
                  ]}
                >
                  <Icon name="x" size={12} color={semantic.color.textInverse} />
                </Pressable>
              </View>

              {images.length > 1 ? (
                <View style={styles.reorderRow}>
                  <Pressable
                    testID={`listing-image-move-left-${index}`}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`Di chuyển ảnh ${index + 1} sang trái`}
                    accessibilityState={{ disabled: !canMoveLeft }}
                    disabled={!canMoveLeft}
                    onPress={() => handleMove(index, -1)}
                    style={({ pressed }) => [
                      styles.reorderBtn,
                      !canMoveLeft && styles.disabledState,
                      pressed && canMoveLeft && styles.pressedState,
                    ]}
                  >
                    <Icon name="chevron-left" size={14} color={semantic.color.textPrimary} />
                  </Pressable>
                  <Pressable
                    testID={`listing-image-move-right-${index}`}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`Di chuyển ảnh ${index + 1} sang phải`}
                    accessibilityState={{ disabled: !canMoveRight }}
                    disabled={!canMoveRight}
                    onPress={() => handleMove(index, 1)}
                    style={({ pressed }) => [
                      styles.reorderBtn,
                      !canMoveRight && styles.disabledState,
                      pressed && canMoveRight && styles.pressedState,
                    ]}
                  >
                    <Icon name="chevron-right" size={14} color={semantic.color.textPrimary} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {images.length === 0 ? (
        <Text style={styles.emptyHint} testID="listing-image-empty">
          Chưa có ảnh nào. Hãy chọn từ thư viện, chụp ảnh mới hoặc dán liên kết ảnh.
        </Text>
      ) : null}

      <View style={styles.quickActionBar}>
        <Pressable
          testID="listing-pick-library-btn"
          accessibilityRole="button"
          accessibilityLabel="Thư viện"
          accessibilityState={{ disabled: !canAddMore, busy: uploading }}
          disabled={!canAddMore}
          onPress={() => void handlePickFromLibrary()}
          style={({ pressed }) => [
            styles.quickActionBtn,
            !canAddMore && styles.disabledState,
            pressed && canAddMore && styles.pressedState,
          ]}
        >
          <Icon name="image" size={15} color={semantic.color.textPrimary} />
          <Text style={styles.quickActionText}>Thư viện</Text>
        </Pressable>

        <Pressable
          testID="listing-take-photo-btn"
          accessibilityRole="button"
          accessibilityLabel="Chụp ảnh"
          accessibilityState={{ disabled: !canAddMore }}
          disabled={!canAddMore}
          onPress={() => void handleTakePhoto()}
          style={({ pressed }) => [
            styles.quickActionBtn,
            !canAddMore && styles.disabledState,
            pressed && canAddMore && styles.pressedState,
          ]}
        >
          <Icon name="camera" size={15} color={semantic.color.textPrimary} />
          <Text style={styles.quickActionText}>Chụp ảnh</Text>
        </Pressable>

        <Pressable
          testID="listing-toggle-url-input"
          accessibilityRole="button"
          accessibilityLabel="Liên kết"
          accessibilityState={{ expanded: showLinkInput, disabled }}
          disabled={disabled}
          onPress={() => {
            setLocalError('');
            setShowLinkInput((prev) => !prev);
          }}
          style={({ pressed }) => [
            styles.quickActionBtn,
            showLinkInput && styles.quickActionBtnActive,
            disabled && styles.disabledState,
            pressed && !disabled && styles.pressedState,
          ]}
        >
          <Icon
            name="link"
            size={15}
            color={showLinkInput ? semantic.color.accent : semantic.color.textPrimary}
          />
          <Text
            style={[styles.quickActionText, showLinkInput && styles.quickActionTextActive]}
          >
            Liên kết
          </Text>
        </Pressable>
      </View>

      {showLinkInput ? (
        <View style={styles.linkInputRow}>
          <TextInput
            testID="listing-image-url-input"
            accessibilityLabel="Đường dẫn ảnh"
            placeholder="Dán liên kết ảnh (https://...)"
            placeholderTextColor={semantic.color.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            editable={canAddMore}
            value={linkDraft}
            onChangeText={(value) => {
              setLocalError('');
              setLinkDraft(value);
            }}
            style={[styles.linkInput, !canAddMore && styles.linkInputDisabled]}
          />
          <Pressable
            testID="listing-add-url-btn"
            accessibilityRole="button"
            accessibilityLabel="Thêm ảnh"
            accessibilityState={{ disabled: !canAddMore || !linkDraft.trim() }}
            disabled={!canAddMore || !linkDraft.trim()}
            onPress={handleAddLink}
            style={({ pressed }) => [
              styles.addLinkBtn,
              (!canAddMore || !linkDraft.trim()) && styles.disabledState,
              pressed && canAddMore && Boolean(linkDraft.trim()) && styles.pressedState,
            ]}
          >
            <Text style={styles.addLinkBtnText}>Thêm</Text>
          </Pressable>
        </View>
      ) : null}

      {visibleError ? <InlineBanner tone="danger" message={visibleError} /> : null}

      <ActionSheet
        visible={sourceSheetVisible}
        onClose={() => setSourceSheetVisible(false)}
        title="Thêm ảnh thực tế"
        subtitle={`Còn ${remainingSlots}/${maxImages} ảnh có thể thêm`}
        options={sourceSheetOptions}
        cancelLabel="Hủy"
        testID="photo-source-sheet"
      />
    </View>
  );
}

const TILE_SIZE = 84;
const TILE_RADIUS = 12;

const styles = StyleSheet.create({
  container: {
    gap: primitive.space[2.5],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: primitive.space[2],
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
  },
  sectionTitle: {
    ...semantic.type.sectionTitle,
  },
  requiredMark: {
    ...semantic.type.sectionTitle,
    color: semantic.color.accent,
  },
  counterText: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  counterTextActive: {
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  caption: {
    ...semantic.type.caption,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2.5],
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSubtle,
  },
  uploadingText: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.medium,
  },
  railContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[2.5],
    paddingVertical: primitive.space[1],
  },
  addTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_RADIUS,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: semantic.color.borderStrong,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: primitive.space[1.5],
  },
  addTileLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
  addTileCount: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.medium,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  photoColumn: {
    width: TILE_SIZE,
    gap: primitive.space[1.5],
  },
  photoTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_RADIUS,
    overflow: 'hidden',
    backgroundColor: semantic.color.bgTrack,
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  coverPill: {
    position: 'absolute',
    left: primitive.space[1],
    right: primitive.space[1],
    bottom: primitive.space[1],
    paddingHorizontal: primitive.space[1.5],
    paddingVertical: 2,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
    alignItems: 'center',
  },
  coverPillText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textInverse,
  },
  removeBadge: {
    position: 'absolute',
    top: primitive.space[1],
    right: primitive.space[1],
    width: 22,
    height: 22,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderRow: {
    flexDirection: 'row',
    gap: primitive.space[1],
  },
  reorderBtn: {
    flex: 1,
    height: 28,
    borderRadius: primitive.radius.sm,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHint: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  quickActionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    minHeight: component.button.minHeightSm,
    paddingHorizontal: primitive.space[3],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
  },
  quickActionBtnActive: {
    backgroundColor: semantic.color.accentSoft,
  },
  quickActionText: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  quickActionTextActive: {
    color: semantic.color.accent,
  },
  linkInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  linkInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: component.input.radius,
    borderWidth: 1,
    borderColor: component.input.border,
    backgroundColor: component.input.bg,
    paddingHorizontal: primitive.space[3],
    fontSize: primitive.fontSize.base,
    color: semantic.color.textPrimary,
  },
  linkInputDisabled: {
    backgroundColor: component.input.disabledBg,
    color: semantic.color.textSecondary,
  },
  addLinkBtn: {
    minHeight: 46,
    paddingHorizontal: primitive.space[4],
    borderRadius: component.button.radius,
    backgroundColor: component.button.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLinkBtnText: {
    ...semantic.type.label,
    color: component.button.primaryFg,
  },
  disabledState: {
    opacity: primitive.opacity.disabled,
  },
  pressedState: {
    opacity: primitive.opacity.pressed,
  },
});
