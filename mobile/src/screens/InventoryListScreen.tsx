import { useCallback, useContext, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav } from '../navigation';
import { useSession } from '../auth/session';
import { useInventory } from '../inventory/store';
import type { InventoryItem, InventoryItemStatus } from '../inventory/types';
import {
  BottomNavBar,
  EmptyState,
  HairlineDivider,
  Icon,
  InlineBanner,
  StatusIndicator,
  type BottomNavTab,
  type StatusTone,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

function getItemStatusPresentation(status: InventoryItemStatus): {
  label: string;
  tone: StatusTone;
} {
  if (status === 'DANG_GIU') {
    return { label: 'Đang giữ', tone: 'warning' };
  }
  if (status === 'DA_CHUYEN_GIAO') {
    return { label: 'Đã chuyển giao', tone: 'neutral' };
  }
  return { label: 'Khả dụng', tone: 'success' };
}

export default function InventoryListScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useContext(SafeAreaInsetsContext);
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);

  const { items, loading, error, loadItems, deleteItem, clearError } = useInventory();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>('');

  const canCreate = Boolean(token) && !(user && !user.roles.includes('MEMBER'));

  useFocusEffect(
    useCallback(() => {
      setActionError('');
      clearError();
      void loadItems().catch(() => {});
    }, [loadItems, clearError]),
  );

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setActionError(message || 'Không thể xóa đồ vật.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleBottomNav = (target: BottomNavTab) => {
    if (target === 'InventoryList') return;
    if (target === 'CreateListing') {
      navigation.navigate('CreateListing');
      return;
    }
    navigation.navigate(target);
  };

  return (
    <View style={styles.screen}>
      {/* SafeArea Flat Top Bar */}
      <View style={[styles.topBar, { paddingTop: (insets?.top ?? 0) + primitive.space[3] }]}>
        <View style={styles.topBarTitleWrap}>
          <Text accessibilityRole="header" style={styles.topBarTitle}>
            Kho đồ cá nhân
          </Text>
          {items.length > 0 ? (
            <Text style={styles.topBarSubtitle}>{items.length} đồ vật trong kho</Text>
          ) : null}
        </View>

        <Pressable
          testID="add-inventory-item-button"
          accessibilityRole="button"
          accessibilityLabel="Thêm đồ vật"
          accessibilityState={{ disabled: !canCreate }}
          disabled={!canCreate}
          onPress={() => navigation.navigate('InventoryForm', { mode: 'create' })}
          style={({ pressed }) => [
            styles.addButton,
            !canCreate && styles.disabled,
            pressed && canCreate && styles.addButtonPressed,
          ]}
        >
          <Icon name="plus" size={16} color={component.button.primaryFg} />
          <Text style={styles.addButtonText}>Thêm đồ vật</Text>
        </Pressable>
      </View>

      {error || actionError ? (
        <View style={styles.bannerWrap}>
          <InlineBanner tone="danger" message={actionError || error || ''} />
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={handleRefresh}
            tintColor={semantic.color.accent}
            colors={[semantic.color.accent]}
          />
        }
        ItemSeparatorComponent={() => (
          <View style={styles.separatorHost}>
            <HairlineDivider insetLeft={semantic.spacing.pageX + 80 + primitive.space[3]} />
          </View>
        )}
        contentContainerStyle={[
          styles.listContent,
          items.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              testID="inventory-empty-state"
              icon="package"
              title="Kho đồ trống"
              subtitle="Bạn chưa có món đồ nào trong kho cá nhân. Hãy thêm đồ vật để sẵn sàng đăng tin thanh lý!"
              primaryActionLabel={canCreate ? 'Thêm đồ vật ngay' : undefined}
              onPrimaryAction={
                canCreate
                  ? () => navigation.navigate('InventoryForm', { mode: 'create' })
                  : undefined
              }
              primaryActionTestID="empty-add-inventory-item-button"
            />
          ) : null
        }
        renderItem={({ item }) => {
          const isEditable =
            item.canEdit && item.trangThai === 'KHA_DUNG' && item.linkedListingCount === 0;
          const isDeletable =
            item.canDelete && item.trangThai === 'KHA_DUNG' && item.linkedListingCount === 0;
          const isDeleting = deletingId === item.id;
          const statusMeta = getItemStatusPresentation(item.trangThai);

          return (
            <View style={styles.itemSurface} testID={`inventory-item-${item.id}`}>
              <Pressable
                testID={`view-detail-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Xem chi tiết ${item.ten}`}
                onPress={() => navigation.navigate('InventoryDetail', { id: item.id })}
                style={({ pressed }) => [
                  styles.itemMainRow,
                  pressed && styles.itemMainRowPressed,
                ]}
              >
                {item.hinhAnh && item.hinhAnh.length > 0 ? (
                  <Image
                    source={{ uri: item.hinhAnh[0] }}
                    style={styles.thumbnail}
                    accessibilityLabel={item.ten}
                  />
                ) : (
                  <View style={styles.thumbnailPlaceholder}>
                    <Icon name="image" size={22} color={semantic.color.textSecondary} />
                  </View>
                )}

                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.ten}
                  </Text>

                  <Text style={styles.itemCondition} numberOfLines={2}>
                    {item.tinhTrang}
                  </Text>

                  <View style={styles.metaRow}>
                    <StatusIndicator
                      variant="dot"
                      tone={statusMeta.tone}
                      label={statusMeta.label}
                    />
                    <Text style={styles.metaDot} accessibilityElementsHidden>
                      ·
                    </Text>
                    <Text style={styles.listingCount} numberOfLines={1}>
                      {item.linkedListingCount > 0
                        ? `Đang gắn với ${item.linkedListingCount} tin đăng`
                        : 'Chưa gắn tin đăng'}
                    </Text>
                  </View>
                </View>

                <View style={styles.chevronWrap}>
                  <Icon name="chevron-right" size={16} color={semantic.color.textSecondary} />
                </View>
              </Pressable>

              <View style={styles.rowActions}>
                <Pressable
                  testID={`edit-item-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel="Sửa"
                  accessibilityState={{ disabled: !isEditable }}
                  disabled={!isEditable}
                  hitSlop={4}
                  onPress={() => {
                    if (!isEditable) {
                      setActionError(
                        'Đồ vật đang gắn với tin đăng hoặc không ở trạng thái khả dụng, không thể chỉnh sửa.',
                      );
                      return;
                    }
                    navigation.navigate('InventoryForm', { mode: 'edit', id: item.id, item });
                  }}
                  style={({ pressed }) => [
                    styles.inlineActionBtn,
                    !isEditable && styles.disabled,
                    pressed && isEditable && styles.pressed,
                  ]}
                >
                  <Icon name="edit-2" size={14} color={semantic.color.textPrimary} />
                  <Text style={styles.inlineActionText}>Sửa</Text>
                </Pressable>

                <Pressable
                  testID={`delete-item-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel="Xóa"
                  accessibilityState={{ disabled: !isDeletable || isDeleting, busy: isDeleting }}
                  disabled={!isDeletable || isDeleting}
                  hitSlop={4}
                  onPress={() => {
                    if (!isDeletable || isDeleting) return;
                    confirmDelete(item);
                  }}
                  style={({ pressed }) => [
                    styles.inlineActionBtn,
                    (!isDeletable || isDeleting) && styles.disabled,
                    pressed && isDeletable && !isDeleting && styles.pressed,
                  ]}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={semantic.color.danger} />
                  ) : (
                    <Icon name="trash-2" size={14} color={semantic.color.danger} />
                  )}
                  <Text style={styles.inlineActionDangerText}>Xóa</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <BottomNavBar activeTab="InventoryList" onNavigate={handleBottomNav} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.color.bgPage,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[3],
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[3],
    borderBottomWidth: 1,
    borderBottomColor: semantic.color.borderHairline,
  },
  topBarTitleWrap: {
    flex: 1,
    gap: 2,
  },
  topBarTitle: {
    ...semantic.type.screenTitle,
  },
  topBarSubtitle: {
    ...semantic.type.micro,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    minHeight: component.button.minHeightSm,
    paddingHorizontal: primitive.space[3],
    borderRadius: primitive.radius.md,
    backgroundColor: component.button.primaryBg,
  },
  addButtonPressed: {
    backgroundColor: component.button.primaryPressedBg,
  },
  addButtonText: {
    fontSize: primitive.fontSize.sm,
    lineHeight: 18,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.primaryFg,
  },
  bannerWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
  },
  listContent: {
    paddingBottom: primitive.space[6],
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  separatorHost: {
    backgroundColor: semantic.color.bgSurface,
  },
  itemSurface: {
    backgroundColor: semantic.color.bgSurface,
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    paddingBottom: primitive.space[2],
    gap: primitive.space[3],
  },
  itemMainRowPressed: {
    backgroundColor: semantic.color.bgSubtle,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  thumbnailPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: primitive.space[1],
  },
  itemName: {
    ...semantic.type.cardTitle,
  },
  itemCondition: {
    ...semantic.type.caption,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[1.5],
    marginTop: 2,
  },
  metaDot: {
    ...semantic.type.micro,
  },
  listingCount: {
    ...semantic.type.micro,
    flexShrink: 1,
  },
  chevronWrap: {
    paddingLeft: primitive.space[1],
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
    paddingLeft: semantic.spacing.pageX + 80 + primitive.space[3],
    paddingRight: semantic.spacing.pageX,
    paddingBottom: primitive.space[3],
  },
  inlineActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    minHeight: 34,
    paddingHorizontal: primitive.space[2.5],
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSubtle,
  },
  inlineActionText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  inlineActionDangerText: {
    ...semantic.type.micro,
    color: semantic.color.danger,
    fontWeight: primitive.fontWeight.semibold,
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
