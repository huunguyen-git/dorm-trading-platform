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
import { Action, Notice, ui } from './AuthUI';
import { colors, radius, space } from '../theme';

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
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');

  useEffect(() => {
    if (error) {
      setLocalError('');
    }
  }, [error]);

  const remainingSlots = Math.max(0, maxImages - images.length);
  const busyOrDisabled = disabled || uploading;

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

  const handleAddUrl = () => {
    setLocalError('');
    if (remainingSlots <= 0) {
      setLocalError(`Bạn chỉ có thể đính kèm tối đa ${maxImages} ảnh thực tế cho mỗi tin đăng.`);
      return;
    }
    const validation = validateImageUrl(urlDraft);
    if (!validation.valid) {
      setLocalError(validation.error ?? 'Đường dẫn ảnh không hợp lệ.');
      return;
    }
    const cleaned = urlDraft.trim();
    if (images.includes(cleaned)) {
      setLocalError('Ảnh này đã có trong danh sách.');
      return;
    }
    onChange([...images, cleaned]);
    setUrlDraft('');
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

  const visibleError = localError || error || '';

  return (
    <View style={styles.container} testID="listing-image-manager">
      <View style={styles.headerRow}>
        <Text style={ui.label}>Ảnh thực tế *</Text>
        <View style={styles.countBadge} testID="listing-image-count">
          <Text style={styles.countBadgeText}>
            {images.length}/{maxImages} ảnh thực tế
          </Text>
        </View>
      </View>

      <Text style={ui.caption}>
        Cần 1–{maxImages} ảnh thực tế khi công khai (JPEG, PNG, WebP, tối đa 5MB/ảnh). Ảnh đầu tiên là ảnh bìa.
      </Text>

      {uploading ? (
        <View style={styles.uploadingBanner} testID="listing-image-uploading">
          <ActivityIndicator color={colors.brand} size="small" />
          <Text style={styles.uploadingText}>Đang tải ảnh lên máy chủ…</Text>
        </View>
      ) : null}

      {images.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbRow}
        >
          {images.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.thumbCard} testID={`listing-image-card-${index}`}>
              <View style={styles.thumbImageWrap}>
                <Image
                  source={{ uri }}
                  style={styles.thumbImage}
                  resizeMode="cover"
                  accessibilityLabel={`Ảnh tin đăng ${index + 1}`}
                />
                {index === 0 ? (
                  <View style={styles.coverBadge} testID="listing-image-cover-badge">
                    <Text style={styles.coverBadgeText}>Ảnh bìa</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.thumbControls}>
                <Pressable
                  testID={`listing-image-move-left-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Di chuyển ảnh ${index + 1} sang trái`}
                  accessibilityState={{ disabled: busyOrDisabled || index === 0 }}
                  disabled={busyOrDisabled || index === 0}
                  onPress={() => handleMove(index, -1)}
                  style={[
                    styles.miniBtn,
                    (busyOrDisabled || index === 0) && styles.miniBtnDisabled,
                  ]}
                >
                  <Text style={styles.miniBtnText}>←</Text>
                </Pressable>
                <Pressable
                  testID={`listing-image-move-right-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Di chuyển ảnh ${index + 1} sang phải`}
                  accessibilityState={{ disabled: busyOrDisabled || index === images.length - 1 }}
                  disabled={busyOrDisabled || index === images.length - 1}
                  onPress={() => handleMove(index, 1)}
                  style={[
                    styles.miniBtn,
                    (busyOrDisabled || index === images.length - 1) && styles.miniBtnDisabled,
                  ]}
                >
                  <Text style={styles.miniBtnText}>→</Text>
                </Pressable>
                <Pressable
                  testID={`listing-image-remove-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Xóa ảnh ${index + 1}`}
                  accessibilityState={{ disabled: busyOrDisabled }}
                  disabled={busyOrDisabled}
                  onPress={() => handleRemove(index)}
                  style={[styles.removeMiniBtn, busyOrDisabled && styles.miniBtnDisabled]}
                >
                  <Text style={styles.removeMiniBtnText}>Xóa</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyBox} testID="listing-image-empty">
          <Text style={styles.emptyText}>
            Chưa có ảnh nào. Hãy chọn từ thư viện, chụp ảnh trực tiếp hoặc nhập URL ảnh.
          </Text>
        </View>
      )}

      <View style={styles.actionButtonsRow}>
        <View style={styles.flexBtn}>
          <Action
            secondary
            title="Chọn từ thư viện"
            testID="listing-pick-library-btn"
            disabled={busyOrDisabled || remainingSlots <= 0}
            busy={uploading}
            onPress={() => void handlePickFromLibrary()}
          />
        </View>
        <View style={styles.flexBtn}>
          <Action
            secondary
            title="Chụp ảnh"
            testID="listing-take-photo-btn"
            disabled={busyOrDisabled || remainingSlots <= 0}
            onPress={() => void handleTakePhoto()}
          />
        </View>
      </View>

      <Pressable
        testID="listing-toggle-url-input"
        accessibilityRole="button"
        accessibilityState={{ expanded: showUrlInput, disabled }}
        disabled={disabled}
        onPress={() => {
          setLocalError('');
          setShowUrlInput((prev) => !prev);
        }}
        style={styles.urlToggle}
      >
        <Text style={styles.urlToggleText}>
          {showUrlInput ? 'Ẩn nhập URL ảnh ▲' : 'Hoặc nhập URL ảnh ▼'}
        </Text>
      </Pressable>

      {showUrlInput ? (
        <View style={styles.urlInputBox}>
          <TextInput
            testID="listing-image-url-input"
            accessibilityLabel="Đường dẫn URL ảnh"
            placeholder="https://example.com/anh-thuc-te.jpg"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busyOrDisabled && remainingSlots > 0}
            value={urlDraft}
            onChangeText={(value) => {
              setLocalError('');
              setUrlDraft(value);
            }}
            style={[ui.field, styles.urlInputField]}
          />
          <Action
            secondary
            title="Thêm ảnh"
            testID="listing-add-url-btn"
            disabled={busyOrDisabled || remainingSlots <= 0 || !urlDraft.trim()}
            onPress={handleAddUrl}
          />
        </View>
      ) : null}

      {visibleError ? <Notice message={visibleError} error /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  countBadge: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: 16,
    backgroundColor: '#f2ede4',
    borderWidth: 1,
    borderColor: colors.line,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  uploadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: '#f2ede4',
  },
  uploadingText: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: 13,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.xs,
  },
  thumbCard: {
    width: 132,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#f9f8f5',
    overflow: 'hidden',
  },
  thumbImageWrap: {
    position: 'relative',
    width: '100%',
    height: 98,
    backgroundColor: '#ecebe4',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.brand,
  },
  coverBadgeText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: '700',
  },
  thumbControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.xs,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  miniBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBtnDisabled: {
    opacity: 0.4,
  },
  miniBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  removeMiniBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fff0ec',
    borderWidth: 1,
    borderColor: '#e5b8af',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMiniBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
  },
  emptyBox: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: '#f2ede4',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 13,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  flexBtn: {
    flex: 1,
  },
  urlToggle: {
    alignSelf: 'flex-start',
    paddingVertical: space.xs,
  },
  urlToggleText: {
    color: colors.brand,
    fontWeight: '600',
    fontSize: 13,
  },
  urlInputBox: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
  },
  urlInputField: {
    flex: 1,
    minHeight: 44,
    paddingVertical: space.xs,
  },
});
