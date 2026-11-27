import { useContext, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav, RootStack } from '../navigation';
import { buildMediaImageSource, RestrictedAccountError, toPersistableMediaUrl } from '../api/client';
import { useSession } from '../auth/session';
import { useInventory } from '../inventory/store';
import {
  MAX_LISTING_IMAGES,
  pickImagesFromLibrary,
  takePhotoWithCamera,
  uploadListingImages,
  validateImageUrl,
} from '../media/imagePicker';
import { Action, Field, ui } from '../components/AuthUI';
import { HairlineDivider, Icon, InlineBanner, SectionHeading } from '../components/ui';
import { component, primitive, semantic } from '../theme';

type RouteProps = RouteProp<RootStack, 'InventoryForm'>;

function sanitizeFormError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('API ')) {
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  }
  return trimmed;
}

export default function InventoryFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const insets = useContext(SafeAreaInsetsContext);
  const token = useSession((s) => s.token);
  const mode = route.params?.mode || 'create';
  const existingItem = route.params?.item;
  const itemId = route.params?.id || existingItem?.id;

  const isBlocked = Boolean(
    mode === 'edit' &&
      existingItem &&
      (!existingItem.canEdit ||
        existingItem.trangThai !== 'KHA_DUNG' ||
        existingItem.linkedListingCount > 0),
  );

  const { addItem, updateItem, clearError } = useInventory();

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const scrollViewRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const pickerInFlightRef = useRef(false);
  const [ten, setTen] = useState(existingItem?.ten || '');
  const [tinhTrang, setTinhTrang] = useState(existingItem?.tinhTrang || '');
  const [hinhAnh, setHinhAnh] = useState<string[]>(existingItem?.hinhAnh || []);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [conditionFocused, setConditionFocused] = useState(false);
  const [imageInputFocused, setImageInputFocused] = useState(false);
  const [error, setError] = useState(
    isBlocked
      ? 'Đồ vật này đang nằm trong tin đăng hoặc không ở trạng thái khả dụng, không thể chỉnh sửa.'
      : '',
  );
  const [busy, setBusy] = useState(false);

  const reportError = (message: string) => {
    setError(message);
    if (message) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const appendUniqueImages = (urls: string[]) => {
    setHinhAnh((prev) => {
      const next = [...prev];
      const existingCanonical = new Set(next.map(toPersistableMediaUrl));
      for (const rawUrl of urls) {
        const cleaned = rawUrl.trim();
        if (!cleaned || next.length >= MAX_LISTING_IMAGES) continue;
        const canonical = toPersistableMediaUrl(cleaned);
        if (!existingCanonical.has(canonical)) {
          existingCanonical.add(canonical);
          next.push(cleaned);
        }
      }
      return next;
    });
  };

  const handleUploadFailure = (err: unknown, fallback: string) => {
    if (typeof RestrictedAccountError === 'function' && err instanceof RestrictedAccountError) {
      if (!useSession.getState().restriction) {
        useSession.setState({ restriction: err.restriction, restrictionDismissed: false });
      }
      setError('');
      return;
    }
    reportError(sanitizeFormError(err, fallback));
  };

  const handlePickFromLibrary = async () => {
    if (pickerInFlightRef.current || uploadingImage || busy || isBlocked) return;
    const remainingSlots = Math.max(0, MAX_LISTING_IMAGES - hinhAnh.length);
    if (remainingSlots <= 0) {
      reportError(`Đã đạt tối đa ${MAX_LISTING_IMAGES} ảnh thực tế.`);
      return;
    }
    pickerInFlightRef.current = true;
    setError('');
    try {
      const picked = await pickImagesFromLibrary(remainingSlots);
      if (picked.length === 0) return;
      setUploadingImage(true);
      const uploaded = await uploadListingImages(picked);
      if (uploaded.length === 0) {
        reportError('Không nhận được đường dẫn ảnh sau khi tải lên. Vui lòng thử lại.');
        return;
      }
      appendUniqueImages(uploaded.map((item) => item.url));
    } catch (err: unknown) {
      handleUploadFailure(err, 'Không thể chọn hoặc tải ảnh từ thư viện lên máy chủ.');
    } finally {
      pickerInFlightRef.current = false;
      setUploadingImage(false);
    }
  };

  const handleTakePhoto = async () => {
    if (pickerInFlightRef.current || uploadingImage || busy || isBlocked) return;
    const remainingSlots = Math.max(0, MAX_LISTING_IMAGES - hinhAnh.length);
    if (remainingSlots <= 0) {
      reportError(`Đã đạt tối đa ${MAX_LISTING_IMAGES} ảnh thực tế.`);
      return;
    }
    pickerInFlightRef.current = true;
    setError('');
    try {
      const photo = await takePhotoWithCamera();
      if (!photo) return;
      setUploadingImage(true);
      const uploaded = await uploadListingImages([photo]);
      if (uploaded.length === 0) {
        reportError('Không nhận được đường dẫn ảnh sau khi chụp. Vui lòng thử lại.');
        return;
      }
      appendUniqueImages(uploaded.map((item) => item.url));
    } catch (err: unknown) {
      handleUploadFailure(err, 'Không thể chụp hoặc tải ảnh lên máy chủ.');
    } finally {
      pickerInFlightRef.current = false;
      setUploadingImage(false);
    }
  };

  const handleAddImage = (urlToAdd?: string) => {
    const targetUrl = (urlToAdd || newImageUrl).trim();
    if (!targetUrl) return;

    if (hinhAnh.length >= MAX_LISTING_IMAGES) {
      reportError('Đã đạt tối đa 5 ảnh thực tế.');
      return;
    }

    const validation = validateImageUrl(targetUrl);
    if (!validation.valid) {
      reportError(validation.error ?? 'Đường dẫn ảnh không hợp lệ.');
      return;
    }

    const targetCanonical = toPersistableMediaUrl(targetUrl);
    if (hinhAnh.some((existing) => toPersistableMediaUrl(existing) === targetCanonical)) {
      reportError('Ảnh này đã được thêm.');
      return;
    }

    setError('');
    setHinhAnh([...hinhAnh, targetUrl]);
    setNewImageUrl('');
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setError('');
    setHinhAnh(hinhAnh.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async () => {
    if (uploadingImage) return;
    if (isBlocked) {
      reportError(
        'Đồ vật này đang nằm trong tin đăng hoặc không ở trạng thái khả dụng, không thể chỉnh sửa.',
      );
      return;
    }

    if (!ten.trim()) {
      reportError('Vui lòng nhập tên đồ vật.');
      return;
    }

    if (!tinhTrang.trim()) {
      reportError('Vui lòng nhập mô tả tình trạng đồ vật.');
      return;
    }

    if (hinhAnh.length < 1) {
      reportError('Vui lòng chọn ít nhất 1 ảnh thực tế.');
      return;
    }

    if (hinhAnh.length > MAX_LISTING_IMAGES) {
      reportError('Chỉ được phép tối đa 5 ảnh thực tế.');
      return;
    }

    setError('');
    setBusy(true);

    try {
      if (mode === 'create') {
        await addItem({
          ten: ten.trim(),
          tinhTrang: tinhTrang.trim(),
          hinhAnh,
        });
      } else {
        if (!itemId) throw new Error('Không tìm thấy mã đồ vật cần sửa.');
        await updateItem(itemId, {
          ten: ten.trim(),
          tinhTrang: tinhTrang.trim(),
          hinhAnh,
          version: existingItem?.version,
        });
      }
      navigation.goBack();
    } catch (err: unknown) {
      reportError(sanitizeFormError(err, 'Có lỗi xảy ra khi lưu đồ vật.'));
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = busy || uploadingImage || isBlocked;
  const canAddMoreImages = !isDisabled && hinhAnh.length < MAX_LISTING_IMAGES;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.leadStrip}>
          <Text style={styles.leadText}>
            {mode === 'edit'
              ? 'Cập nhật tình trạng hoặc hình ảnh thực tế của đồ vật.'
              : 'Lưu đồ vật vào kho cá nhân với mô tả và ảnh thực tế trước khi đăng bán.'}
          </Text>
          {error ? <InlineBanner tone="danger" message={error} /> : null}
        </View>

        {/* Section 1: Item Details */}
        <View style={styles.section}>
          <SectionHeading title="Thông tin đồ vật" />

          <Field
            label="Tên đồ vật"
            testID="input-item-name"
            placeholder="VD: Bàn học gấp gọn, Nồi cơm điện..."
            value={ten}
            onChangeText={setTen}
            editable={!isDisabled}
            hint="Tên ngắn gọn, rõ ràng của món đồ."
          />

          <View style={styles.fieldGroup}>
            <Text style={[ui.label, isDisabled && styles.labelDisabled]}>Mô tả tình trạng</Text>
            <TextInput
              accessibilityLabel="Mô tả tình trạng"
              testID="input-item-condition"
              placeholder="VD: Còn mới 95%, chỉ dùng 1 học kỳ, không trầy xước, đầy đủ phụ kiện..."
              placeholderTextColor={semantic.color.textSecondary}
              multiline
              numberOfLines={4}
              onFocus={() => setConditionFocused(true)}
              onBlur={() => setConditionFocused(false)}
              style={[
                ui.field,
                styles.textArea,
                conditionFocused && !isDisabled && styles.inputFocused,
                isDisabled && styles.inputDisabled,
              ]}
              value={tinhTrang}
              onChangeText={setTinhTrang}
              editable={!isDisabled}
            />
            <Text style={styles.hintText}>
              Nêu rõ tình trạng hao mòn, khuyết điểm (nếu có) để tạo sự minh bạch.
            </Text>
          </View>
        </View>

        <HairlineDivider />

        {/* Section 2: Real Photos */}
        <View style={styles.section}>
          <View style={styles.imageHeaderRow}>
            <Text style={styles.imageHeading}>Ảnh thực tế ({hinhAnh.length}/5)</Text>
            <Text style={styles.imageSubHint}>Từ 1 đến 5 ảnh</Text>
          </View>

          {hinhAnh.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailList}
            >
              {hinhAnh.map((imgUri, idx) => (
                <View key={`${imgUri}-${idx}`} style={styles.thumbWrapper} testID={`image-thumb-${idx}`}>
                  <Image source={buildMediaImageSource(imgUri, token)} style={styles.thumbImage} resizeMode="cover" />
                  {!isDisabled ? (
                    <Pressable
                      testID={`remove-image-${idx}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Xóa ảnh ${idx + 1}`}
                      onPress={() => handleRemoveImage(idx)}
                      hitSlop={6}
                      style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
                    >
                      <Icon name="x" size={12} color={semantic.color.textInverse} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyPhotoBox}>
              <Icon name="image" size={20} color={semantic.color.textSecondary} />
              <Text style={styles.emptyPhotoText}>
                Chưa có ảnh nào được thêm. Vui lòng thêm ít nhất 1 ảnh.
              </Text>
            </View>
          )}

          {uploadingImage ? (
            <View style={styles.uploadingRow} testID="inventory-image-uploading">
              <ActivityIndicator color={semantic.color.accent} size="small" />
              <Text style={styles.uploadingText}>Đang tải ảnh lên máy chủ…</Text>
            </View>
          ) : null}

          {!isBlocked ? (
            <>
              <View style={styles.quickActionBar}>
                <Pressable
                  testID="inventory-pick-library-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Chọn ảnh từ thư viện"
                  accessibilityState={{ disabled: !canAddMoreImages, busy: uploadingImage }}
                  disabled={!canAddMoreImages}
                  onPress={() => void handlePickFromLibrary()}
                  style={({ pressed }) => [
                    styles.quickActionBtn,
                    !canAddMoreImages && styles.disabledControl,
                    pressed && canAddMoreImages && styles.pressed,
                  ]}
                >
                  <Icon name="image" size={15} color={semantic.color.textPrimary} />
                  <Text style={styles.quickActionText}>Thư viện</Text>
                </Pressable>

                <Pressable
                  testID="inventory-take-photo-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Chụp ảnh mới"
                  accessibilityState={{ disabled: !canAddMoreImages, busy: uploadingImage }}
                  disabled={!canAddMoreImages}
                  onPress={() => void handleTakePhoto()}
                  style={({ pressed }) => [
                    styles.quickActionBtn,
                    !canAddMoreImages && styles.disabledControl,
                    pressed && canAddMoreImages && styles.pressed,
                  ]}
                >
                  <Icon name="camera" size={15} color={semantic.color.textPrimary} />
                  <Text style={styles.quickActionText}>Chụp ảnh</Text>
                </Pressable>
              </View>

              <View style={styles.addImageRow}>
                <TextInput
                  accessibilityLabel="Đường dẫn ảnh"
                  testID="input-image-url"
                  placeholder="Hoặc dán liên kết ảnh (https://...)"
                  placeholderTextColor={semantic.color.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setImageInputFocused(true)}
                  onBlur={() => setImageInputFocused(false)}
                  style={[
                    ui.field,
                    styles.imageInput,
                    imageInputFocused && canAddMoreImages && styles.inputFocused,
                    !canAddMoreImages && styles.inputDisabled,
                  ]}
                  value={newImageUrl}
                  onChangeText={setNewImageUrl}
                  editable={canAddMoreImages}
                />
                <Action
                  variant="secondary"
                  compact
                  icon="plus"
                  title="Thêm"
                  testID="add-image-url-button"
                  disabled={!canAddMoreImages || !newImageUrl.trim()}
                  onPress={() => handleAddImage()}
                />
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Flush Bottom Actions */}
      <View
        style={[
          styles.footerBar,
          { paddingBottom: Math.max(insets?.bottom ?? 0, primitive.space[3]) },
        ]}
      >
        <Action
          title={mode === 'edit' ? 'Cập nhật đồ vật' : 'Lưu đồ vật vào kho'}
          testID="submit-inventory-form"
          disabled={isDisabled}
          busy={busy}
          onPress={() => void handleSubmit()}
        />
        <Action
          variant="ghost"
          compact
          title="Hủy"
          testID="cancel-inventory-form"
          disabled={busy}
          onPress={() => {
            clearError();
            navigation.goBack();
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.color.bgPage,
  },
  scrollContent: {
    paddingBottom: primitive.space[8],
  },
  leadStrip: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
  },
  leadText: {
    ...semantic.type.caption,
  },
  section: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[5],
    gap: primitive.space[4],
  },
  fieldGroup: {
    gap: primitive.space[1.5],
  },
  labelDisabled: {
    opacity: primitive.opacity.disabled,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputFocused: {
    borderColor: component.input.focusBorder,
    borderWidth: 1.5,
  },
  inputDisabled: {
    backgroundColor: component.input.disabledBg,
    borderColor: semantic.color.borderHairline,
    color: semantic.color.textSecondary,
  },
  hintText: {
    ...semantic.type.micro,
  },
  imageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  imageHeading: {
    ...semantic.type.sectionTitle,
  },
  imageSubHint: {
    ...semantic.type.micro,
  },
  thumbnailList: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
    paddingVertical: primitive.space[1],
  },
  thumbWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: primitive.radius.md,
    overflow: 'hidden',
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: primitive.space[1],
    right: primitive.space[1],
    backgroundColor: semantic.color.overlayDark,
    width: 22,
    height: 22,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPhotoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
    paddingHorizontal: primitive.space[4],
    paddingVertical: primitive.space[3],
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.lg,
  },
  emptyPhotoText: {
    ...semantic.type.caption,
    flex: 1,
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
  quickActionText: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  disabledControl: {
    opacity: primitive.opacity.disabled,
  },
  addImageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  imageInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: primitive.space[2],
  },
  footerBar: {
    backgroundColor: semantic.color.bgSurface,
    borderTopWidth: 1,
    borderTopColor: semantic.color.borderHairline,
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    gap: primitive.space[1.5],
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
