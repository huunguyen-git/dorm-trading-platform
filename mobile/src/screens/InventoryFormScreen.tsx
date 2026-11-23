import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { Nav, RootStack } from '../navigation';
import { useInventory } from '../inventory/store';
import { Action, AuthScreen, Field, Notice, ui } from '../components/AuthUI';
import { colors, radius, space, text } from '../theme';

type RouteProps = RouteProp<RootStack, 'InventoryForm'>;

export default function InventoryFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const mode = route.params?.mode || 'create';
  const existingItem = route.params?.item;
  const itemId = route.params?.id || existingItem?.id;

  // Editable check in edit mode
  const isBlocked =
    mode === 'edit' &&
    existingItem &&
    (!existingItem.canEdit ||
      existingItem.trangThai !== 'KHA_DUNG' ||
      existingItem.linkedListingCount > 0);

  const { addItem, updateItem } = useInventory();

  const [ten, setTen] = useState(existingItem?.ten || '');
  const [tinhTrang, setTinhTrang] = useState(existingItem?.tinhTrang || '');
  const [hinhAnh, setHinhAnh] = useState<string[]>(existingItem?.hinhAnh || []);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [error, setError] = useState(
    isBlocked
      ? 'Đồ vật này đang nằm trong tin đăng hoặc không ở trạng thái khả dụng, không thể chỉnh sửa.'
      : '',
  );
  const [busy, setBusy] = useState(false);

  const handleAddImage = (urlToAdd?: string) => {
    const targetUrl = (urlToAdd || newImageUrl).trim();
    if (!targetUrl) return;

    if (hinhAnh.length >= 5) {
      setError('Đã đạt tối đa 5 ảnh thực tế.');
      return;
    }

    if (hinhAnh.includes(targetUrl)) {
      setError('Ảnh này đã được thêm.');
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
    if (isBlocked) {
      setError('Đồ vật này đang nằm trong tin đăng hoặc không ở trạng thái khả dụng, không thể chỉnh sửa.');
      return;
    }

    if (!ten.trim()) {
      setError('Vui lòng nhập tên đồ vật.');
      return;
    }

    if (!tinhTrang.trim()) {
      setError('Vui lòng nhập mô tả tình trạng đồ vật.');
      return;
    }

    if (hinhAnh.length < 1) {
      setError('Vui lòng chọn ít nhất 1 ảnh thực tế.');
      return;
    }

    if (hinhAnh.length > 5) {
      setError('Chỉ được phép tối đa 5 ảnh thực tế.');
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
    } catch (err: any) {
      const msg = err?.message || 'Có lỗi xảy ra khi lưu đồ vật.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title={mode === 'edit' ? 'Sửa thông tin đồ vật' : 'Thêm đồ vật vào kho'}
      subtitle={
        mode === 'edit'
          ? 'Cập nhật tình trạng hoặc hình ảnh thực tế của đồ vật.'
          : 'Lưu đồ vật vào kho cá nhân với mô tả và ảnh thực tế trước khi đăng bán.'
      }
    >
      {error ? <Notice message={error} error /> : null}

      <Field
        label="Tên đồ vật"
        testID="input-item-name"
        placeholder="VD: Bàn học gấp gọn, Nồi cơm điện..."
        value={ten}
        onChangeText={setTen}
        editable={!busy && !isBlocked}
        hint="Tên ngắn gọn, rõ ràng của món đồ."
      />

      <View style={{ gap: space.sm }}>
        <Text style={ui.label}>Mô tả tình trạng</Text>
        <TextInput
          accessibilityLabel="Mô tả tình trạng"
          testID="input-item-condition"
          placeholder="VD: Còn mới 95%, chỉ dùng 1 học kỳ, không trầy xước, đầy đủ phụ kiện..."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={4}
          style={[
            ui.field,
            styles.textArea,
            (busy || isBlocked) && { backgroundColor: '#f5f4ef' },
          ]}
          value={tinhTrang}
          onChangeText={setTinhTrang}
          editable={!busy && !isBlocked}
        />
        <Text style={ui.caption}>
          Nêu rõ tình trạng hao mòn, khuyết điểm (nếu có) để tạo sự minh bạch.
        </Text>
      </View>

      {/* Images Section */}
      <View style={{ gap: space.sm }}>
        <View style={styles.imageHeaderRow}>
          <Text style={ui.label}>Ảnh thực tế ({hinhAnh.length}/5)</Text>
          <Text style={ui.caption}>Quy chuẩn: 1 đến 5 ảnh</Text>
        </View>

        {/* Existing Thumbnails */}
        {hinhAnh.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailList}>
            {hinhAnh.map((imgUri, idx) => (
              <View key={idx} style={styles.thumbWrapper} testID={`image-thumb-${idx}`}>
                <Image source={{ uri: imgUri }} style={styles.thumbImage} resizeMode="cover" />
                {!isBlocked && !busy && (
                  <Pressable
                    testID={`remove-image-${idx}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa ảnh ${idx + 1}`}
                    onPress={() => handleRemoveImage(idx)}
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyPhotoBox}>
            <Text style={ui.caption}>Chưa có ảnh nào được thêm. Vui lòng thêm ít nhất 1 ảnh.</Text>
          </View>
        )}

        {/* Add Image Inputs */}
        {!isBlocked && (
          <View style={{ gap: space.xs, marginTop: space.xs }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <TextInput
                accessibilityLabel="Đường dẫn ảnh"
                testID="input-image-url"
                placeholder="Nhập URL ảnh thực tế..."
                placeholderTextColor={colors.muted}
                style={[ui.field, { flex: 1, minHeight: 44, paddingVertical: space.xs }]}
                value={newImageUrl}
                onChangeText={setNewImageUrl}
                editable={!busy && hinhAnh.length < 5}
              />
              <Action
                secondary
                title="Thêm"
                testID="add-image-url-button"
                disabled={busy || hinhAnh.length >= 5 || !newImageUrl.trim()}
                onPress={() => handleAddImage()}
              />
            </View>
          </View>
        )}
      </View>

      <Action
        title={mode === 'edit' ? 'Cập nhật đồ vật' : 'Lưu đồ vật vào kho'}
        testID="submit-inventory-form"
        disabled={busy || isBlocked}
        busy={busy}
        onPress={handleSubmit}
      />

      <Action
        secondary
        title="Hủy thao tác"
        testID="cancel-inventory-form"
        disabled={busy}
        onPress={() => navigation.goBack()}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  imageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  thumbnailList: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  thumbWrapper: {
    position: 'relative',
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: 12,
  },
  emptyPhotoBox: {
    padding: space.md,
    backgroundColor: '#f2ede4',
    borderRadius: radius.md,
    alignItems: 'center',
  },
});
