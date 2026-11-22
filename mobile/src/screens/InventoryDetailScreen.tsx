import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { Nav, RootStack } from '../navigation';
import { useInventory } from '../inventory/store';
import type { InventoryItem, InventoryItemStatus } from '../inventory/types';
import { Action, Notice, ui } from '../components/AuthUI';
import { colors, radius, space, text } from '../theme';

type RouteProps = RouteProp<RootStack, 'InventoryDetail'>;

export default function InventoryDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const { id } = route.params;

  const { items, selectedItem, loadItem, deleteItem, loading, error } = useInventory();
  const [localItem, setLocalItem] = useState<InventoryItem | null>(() => {
    return items.find((i) => i.id === id) || selectedItem || null;
  });
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    void loadItem(id)
      .then((item) => setLocalItem(item))
      .catch((err) => setActionError(err?.message || 'Không thể tải chi tiết đồ vật.'));
  }, [id, loadItem]);

  const item = localItem;

  const confirmDelete = () => {
    if (!item) return;
    setActionError('');
    if (!item.canDelete || item.trangThai !== 'KHA_DUNG' || item.linkedListingCount > 0) {
      setActionError('Đồ vật đang gắn với tin đăng hoặc không ở trạng thái khả dụng, không thể xóa.');
      return;
    }

    Alert.alert(
      'Xác nhận xóa',
      `Bạn có chắc chắn muốn xóa "${item.ten}" khỏi kho cá nhân?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: performDelete,
        },
      ],
    );
  };

  const performDelete = async () => {
    if (!item) return;
    setBusy(true);
    setActionError('');
    try {
      await deleteItem(item.id);
      navigation.goBack();
    } catch (err: any) {
      setActionError(err?.message || 'Không thể xóa đồ vật.');
    } finally {
      setBusy(false);
    }
  };

  const renderStatusBadge = (status: InventoryItemStatus) => {
    let label = 'Khả dụng';
    let bg = '#e6f4ea';
    let fg = '#137333';

    if (status === 'DANG_GIU') {
      label = 'Đang giữ';
      bg = '#fef7e0';
      fg = '#b06000';
    } else if (status === 'DA_CHUYEN_GIAO') {
      label = 'Đã chuyển giao';
      bg = '#f1f3f4';
      fg = '#5f6368';
    }

    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
      </View>
    );
  };

  if (loading && !item) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={[ui.caption, { marginTop: space.sm }]}>Đang tải chi tiết đồ vật…</Text>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Notice message={actionError || error || 'Không tìm thấy thông tin đồ vật.'} error />
        <View style={{ marginTop: space.md }}>
          <Action secondary title="Quay lại danh sách" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const isEditable = item.canEdit && item.trangThai === 'KHA_DUNG' && item.linkedListingCount === 0;
  const isDeletable = item.canDelete && item.trangThai === 'KHA_DUNG' && item.linkedListingCount === 0;
  const images = item.hinhAnh && item.hinhAnh.length > 0 ? item.hinhAnh : [];
  const screenWidth = Dimensions.get('window').width;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Image Carousel / Gallery */}
        <View style={styles.galleryContainer}>
          {images.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={(e) => {
                  const offset = e.nativeEvent.contentOffset.x;
                  const idx = Math.round(offset / (screenWidth - space.xl * 2));
                  setActiveImageIndex(idx);
                }}
                scrollEventThrottle={16}
              >
                {images.map((imgUri, index) => (
                  <Image
                    key={index}
                    source={{ uri: imgUri }}
                    style={[styles.carouselImage, { width: screenWidth - space.xl * 2 }]}
                    resizeMode="cover"
                    accessibilityLabel={`${item.ten} - ảnh ${index + 1}`}
                  />
                ))}
              </ScrollView>
              <View style={styles.counterBadge}>
                <Text style={styles.counterText}>
                  {activeImageIndex + 1} / {images.length}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.noImageBanner}>
              <Text style={ui.caption}>Đồ vật này chưa có ảnh đính kèm.</Text>
            </View>
          )}
        </View>

        {/* Notices */}
        {(actionError || error) ? (
          <Notice message={actionError || error || ''} error />
        ) : null}

        {/* Info Card */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{item.ten}</Text>
            {renderStatusBadge(item.trangThai)}
          </View>

          <View style={styles.fieldSection}>
            <Text style={ui.label}>Mô tả tình trạng</Text>
            <Text style={styles.description}>{item.tinhTrang}</Text>
          </View>

          <View style={styles.fieldSection}>
            <Text style={ui.label}>Trạng thái lưu trữ</Text>
            <Text style={ui.caption}>
              {item.linkedListingCount > 0
                ? `Đồ vật đang được liên kết trong ${item.linkedListingCount} tin đăng.`
                : 'Đồ vật chưa gắn vào bất kỳ tin đăng nào.'}
            </Text>
          </View>

          {/* Linked Listings */}
          <View style={styles.fieldSection}>
            <Text style={ui.label}>Tin đăng liên kết</Text>
            {item.linkedListings && item.linkedListings.length > 0 ? (
              <View style={{ gap: space.sm, marginTop: space.xs }}>
                {item.linkedListings.map((listing) => (
                  <View key={listing.id} style={styles.listingCard}>
                    <Text style={{ fontWeight: '600', color: colors.ink }}>
                      {listing.tieuDe || listing.title || `Tin đăng #${listing.id}`}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      Trạng thái: {listing.trangThai || listing.status || 'Đang mở'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={ui.caption}>Chưa có tin đăng liên kết.</Text>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            <Action
              title="Sửa đồ vật"
              secondary
              testID="detail-edit-button"
              disabled={!isEditable || busy}
              onPress={() => {
                if (!isEditable) {
                  setActionError('Đồ vật đang gắn với tin đăng hoặc không ở trạng thái khả dụng, không thể chỉnh sửa.');
                  return;
                }
                navigation.navigate('InventoryForm', { mode: 'edit', id: item.id, item });
              }}
            />
            <Action
              title="Xóa đồ vật"
              secondary
              testID="detail-delete-button"
              disabled={!isDeletable || busy}
              busy={busy}
              onPress={confirmDelete}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f4ef',
  },
  content: {
    padding: space.xl,
    gap: space.lg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
    backgroundColor: '#f5f4ef',
  },
  galleryContainer: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  carouselImage: {
    height: 240,
  },
  counterBadge: {
    position: 'absolute',
    bottom: space.sm,
    right: space.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  counterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  noImageBanner: {
    height: 180,
    backgroundColor: '#ecebe4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    padding: space.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    flex: 1,
  },
  fieldSection: {
    gap: space.xs,
  },
  description: {
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  listingCard: {
    padding: space.md,
    backgroundColor: '#f9f8f5',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 2,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
