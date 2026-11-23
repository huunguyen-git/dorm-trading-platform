import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { useSession } from '../auth/session';
import { useInventory } from '../inventory/store';
import type { InventoryItem, InventoryItemStatus } from '../inventory/types';
import { Action, Notice, ui } from '../components/AuthUI';
import { colors, radius, space, text } from '../theme';

export default function InventoryListScreen() {
  const navigation = useNavigation<Nav>();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);

  const { items, loading, error, loadItems, deleteItem, clearError } = useInventory();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>('');

  useEffect(() => {
    clearError();
    void loadItems().catch(() => {});
  }, [loadItems, clearError]);

  const handleRefresh = async () => {
    setActionError('');
    clearError();
    try {
      await loadItems();
    } catch {
      // error handled in store
    }
  };

  const confirmDelete = (item: InventoryItem) => {
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
          onPress: () => performDelete(item.id, item.version),
        },
      ],
    );
  };

  const performDelete = async (id: string, version?: number) => {
    setDeletingId(id);
    setActionError('');
    try {
      await deleteItem(id, version);
    } catch (err: any) {
      setActionError(err?.message || 'Không thể xóa đồ vật.');
    } finally {
      setDeletingId(null);
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={ui.brand}>DORM TRADING</Text>
        <Text style={[text.title, { marginTop: space.xs }]}>Kho đồ cá nhân</Text>
        <Text style={ui.caption}>
          Quản lý đồ vật bạn sở hữu để đăng tin thanh lý hoặc theo dõi trạng thái giao dịch.
        </Text>
        <View style={styles.actionsBar}>
          <Action
            title="+ Thêm đồ vật"
            testID="add-inventory-item-button"
            disabled={!token || Boolean(user && !user.roles.includes('MEMBER'))}
            onPress={() => navigation.navigate('InventoryForm', { mode: 'create' })}
          />
          <Action
            secondary
            title="Tin đăng công khai"
            onPress={() => navigation.navigate('Listings')}
          />
        </View>
      </View>

      {(error || actionError) ? (
        <View style={{ marginHorizontal: space.lg, marginBottom: space.sm }}>
          <Notice message={actionError || error || ''} error />
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer} testID="inventory-empty-state">
              <Text style={styles.emptyTitle}>Kho đồ trống</Text>
              <Text style={ui.caption}>
                Bạn chưa có món đồ nào trong kho cá nhân. Hãy thêm đồ vật để sẵn sàng đăng tin thanh lý!
              </Text>
              <View style={{ marginTop: space.md, width: '100%', maxWidth: 260 }}>
                <Action
                  title="+ Thêm đồ vật ngay"
                  disabled={!token || Boolean(user && !user.roles.includes('MEMBER'))}
                  onPress={() => navigation.navigate('InventoryForm', { mode: 'create' })}
                />
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isEditable = item.canEdit && item.trangThai === 'KHA_DUNG' && item.linkedListingCount === 0;
          const isDeletable = item.canDelete && item.trangThai === 'KHA_DUNG' && item.linkedListingCount === 0;
          const isDeleting = deletingId === item.id;

          return (
            <View style={styles.itemCard} testID={`inventory-item-${item.id}`}>
              <View style={styles.itemRow}>
                {item.hinhAnh && item.hinhAnh.length > 0 ? (
                  <Image
                    source={{ uri: item.hinhAnh[0] }}
                    style={styles.thumbnail}
                    accessibilityLabel={item.ten}
                  />
                ) : (
                  <View style={styles.thumbnailPlaceholder}>
                    <Text style={styles.placeholderText}>Chưa có ảnh</Text>
                  </View>
                )}

                <View style={styles.itemInfo}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.ten}
                    </Text>
                    {renderStatusBadge(item.trangThai)}
                  </View>

                  <Text style={styles.itemDesc} numberOfLines={2}>
                    {item.tinhTrang}
                  </Text>

                  <Text style={styles.itemListingCount}>
                    {item.linkedListingCount > 0
                      ? `Đang gắn với ${item.linkedListingCount} tin đăng`
                      : 'Chưa gắn tin đăng'}
                  </Text>
                </View>
              </View>

              <View style={styles.cardActions}>
                <Action
                  secondary
                  title="Chi tiết"
                  testID={`view-detail-${item.id}`}
                  onPress={() => navigation.navigate('InventoryDetail', { id: item.id })}
                />
                <Action
                  secondary
                  title="Sửa"
                  testID={`edit-item-${item.id}`}
                  disabled={!isEditable}
                  onPress={() => {
                    if (!isEditable) {
                      setActionError('Đồ vật đang gắn với tin đăng hoặc không ở trạng thái khả dụng, không thể chỉnh sửa.');
                      return;
                    }
                    navigation.navigate('InventoryForm', { mode: 'edit', id: item.id, item });
                  }}
                />
                <Action
                  secondary
                  title="Xóa"
                  testID={`delete-item-${item.id}`}
                  disabled={!isDeletable || isDeleting}
                  busy={isDeleting}
                  onPress={() => confirmDelete(item)}
                />
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f4ef',
  },
  header: {
    padding: space.lg,
    paddingBottom: space.sm,
  },
  actionsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  listContent: {
    padding: space.lg,
    gap: space.md,
    flexGrow: 1,
  },
  itemCard: {
    backgroundColor: colors.surface,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space.md,
  },
  itemRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: '#eee',
  },
  thumbnailPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: '#ecebe4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xs,
  },
  placeholderText: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'space-between',
    gap: space.xs,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    flex: 1,
    marginRight: space.xs,
  },
  itemDesc: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  itemListingCount: {
    fontSize: 12,
    color: colors.brand,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.sm,
  },
  emptyContainer: {
    padding: space.xl,
    borderRadius: radius.md,
    backgroundColor: '#f2ede4',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
});
