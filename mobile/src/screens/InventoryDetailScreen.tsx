import { useCallback, useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav, RootStack } from '../navigation';
import { buildMediaImageSource } from '../api/client';
import { useSession } from '../auth/session';
import { useInventory } from '../inventory/store';
import type { InventoryItem, InventoryItemStatus } from '../inventory/types';
import { mapListingStatusLabel } from '../listings/types';
import { Action } from '../components/AuthUI';
import {
  HairlineDivider,
  Icon,
  InlineBanner,
  SectionHeading,
  StatusIndicator,
  type StatusTone,
  type StatusVariant,
} from '../components/ui';
import { primitive, semantic } from '../theme';

type RouteProps = RouteProp<RootStack, 'InventoryDetail'>;

function sanitizeDetailError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('API ')) {
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  }
  return trimmed;
}

function getItemStatusMeta(status: InventoryItemStatus): {
  label: string;
  tone: StatusTone;
  variant: StatusVariant;
} {
  if (status === 'DANG_GIU') {
    return { label: 'Đang giữ', tone: 'warning', variant: 'urgent' };
  }
  if (status === 'DA_CHUYEN_GIAO') {
    return { label: 'Đã chuyển giao', tone: 'neutral', variant: 'dot' };
  }
  return { label: 'Khả dụng', tone: 'success', variant: 'dot' };
}

export default function InventoryDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const insets = useContext(SafeAreaInsetsContext);
  const { width: windowWidth } = useWindowDimensions();
  const { id } = route.params;

  const token = useSession((state) => state.token);
  const user = useSession((state) => state.user);
  const isActiveMember = Boolean(
    token && user?.roles.includes('MEMBER') && user?.accountStatus !== 'BI_KHOA',
  );
  const { items, selectedItem, loadItem, deleteItem, clearError, loading, error } = useInventory();
  const [localItem, setLocalItem] = useState<InventoryItem | null>(() => {
    return (
      (selectedItem?.id === id ? selectedItem : null) ||
      items.find((i) => i.id === id) ||
      null
    );
  });
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setActionError('');
      clearError();
      void loadItem(id)
        .then((fetched) => setLocalItem(fetched))
        .catch((err) => setActionError(sanitizeDetailError(err, 'Không thể tải chi tiết đồ vật.')));
    }, [id, loadItem, clearError]),
  );

  useEffect(() => {
    const matched =
      (selectedItem?.id === id ? selectedItem : null) ||
      items.find((i) => i.id === id) ||
      null;
    if (matched) {
      setLocalItem(matched);
    }
  }, [id, items, selectedItem]);

  const item = localItem;

  const confirmDelete = () => {
    if (!item) return;
    setActionError('');
    if (!item.canDelete || item.trangThai !== 'KHA_DUNG' || item.linkedListingCount > 0) {
      setActionError(
        'Đồ vật đang gắn với tin đăng hoặc không ở trạng thái khả dụng, không thể xóa.',
      );
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
      await deleteItem(item.id, item.version);
      navigation.goBack();
    } catch (err: unknown) {
      setActionError(sanitizeDetailError(err, 'Không thể xóa đồ vật.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !item) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={semantic.color.accent} />
        <Text style={styles.loadingText}>Đang tải chi tiết đồ vật…</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centerContainer}>
        <InlineBanner
          tone="danger"
          message={actionError || error || 'Không tìm thấy thông tin đồ vật.'}
        />
        <View style={styles.notFoundAction}>
          <Action
            variant="secondary"
            title="Quay lại danh sách"
            onPress={() => navigation.goBack()}
          />
        </View>
      </View>
    );
  }

  const isEditable =
    item.canEdit && item.trangThai === 'KHA_DUNG' && item.linkedListingCount === 0;
  const isDeletable =
    item.canDelete && item.trangThai === 'KHA_DUNG' && item.linkedListingCount === 0;
  const canCreateListing = isActiveMember && item.trangThai === 'KHA_DUNG';
  const images = item.hinhAnh && item.hinhAnh.length > 0 ? item.hinhAnh : [];
  const carouselWidth = Math.max(windowWidth, 320);
  const carouselHeight = Math.min(Math.round(carouselWidth * 0.72), 320);
  const statusMeta = getItemStatusMeta(item.trangThai);
  const linkedListings = item.linkedListings ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Full-bleed Edge-to-Edge Photo Carousel */}
        <View style={[styles.galleryContainer, { height: carouselHeight }]}>
          {images.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={(e) => {
                  const offset = e.nativeEvent.contentOffset.x;
                  const idx = Math.max(
                    0,
                    Math.min(images.length - 1, Math.round(offset / carouselWidth)),
                  );
                  setActiveImageIndex(idx);
                }}
                scrollEventThrottle={16}
              >
                {images.map((imgUri, index) => (
                  <Image
                    key={`${imgUri}-${index}`}
                    source={buildMediaImageSource(imgUri, token)}
                    style={{ width: carouselWidth, height: carouselHeight }}
                    resizeMode="cover"
                    accessibilityLabel={`${item.ten} - ảnh ${index + 1}`}
                  />
                ))}
              </ScrollView>
              <View style={styles.counterPill}>
                <Text style={styles.counterText}>
                  {activeImageIndex + 1} / {images.length}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.noImageBanner}>
              <Icon name="image" size={32} color={semantic.color.textSecondary} />
              <Text style={styles.noImageText}>Đồ vật này chưa có ảnh đính kèm.</Text>
            </View>
          )}
        </View>

        {actionError || error ? (
          <View style={styles.bannerWrap}>
            <InlineBanner tone="danger" message={actionError || error || ''} />
          </View>
        ) : null}

        {/* Flush Title & Status Section */}
        <View style={styles.section}>
          <Text style={styles.title}>{item.ten}</Text>
          <StatusIndicator
            variant={statusMeta.variant}
            tone={statusMeta.tone}
            icon={item.trangThai === 'DANG_GIU' ? 'clock' : undefined}
            label={statusMeta.label}
          />
        </View>

        <HairlineDivider />

        {/* Flush Condition Section */}
        <View style={styles.section}>
          <SectionHeading title="Mô tả tình trạng" />
          <Text style={styles.description}>{item.tinhTrang}</Text>
        </View>

        <HairlineDivider />

        {/* Flush Linked Listings Section */}
        <View style={styles.section}>
          <SectionHeading
            title="Tin đăng liên kết"
            subtitle={
              item.linkedListingCount > 0
                ? `Đồ vật đang được liên kết trong ${item.linkedListingCount} tin đăng.`
                : 'Đồ vật chưa gắn vào tin đăng nào.'
            }
          />

          {linkedListings.length > 0 ? (
            <View style={styles.linkedList}>
              {linkedListings.map((listing, idx) => {
                const rawStatus = listing.trangThai || listing.status || 'CONG_KHAI';
                const statusLabel = mapListingStatusLabel(rawStatus);
                const listingTitle = listing.tieuDe || listing.title || 'Tin đăng liên kết';
                const hasListingId = Boolean(listing.id && listing.id.trim());

                return (
                  <View key={listing.id || String(idx)}>
                    {idx > 0 ? <HairlineDivider /> : null}
                    <Pressable
                      testID={hasListingId ? `linked-listing-${listing.id}` : undefined}
                      disabled={!hasListingId}
                      accessibilityRole={hasListingId ? 'button' : undefined}
                      accessibilityLabel={`Xem tin đăng ${listingTitle}`}
                      onPress={() => {
                        if (hasListingId) {
                          navigation.navigate('Listing', { id: listing.id });
                        }
                      }}
                      style={({ pressed }) => [
                        styles.linkedRow,
                        pressed && hasListingId && styles.linkedRowPressed,
                      ]}
                    >
                      <View style={styles.linkedIcon}>
                        <Icon name="tag" size={16} color={semantic.color.textSecondary} />
                      </View>
                      <View style={styles.linkedMeta}>
                        <Text style={styles.linkedTitle} numberOfLines={2}>
                          {listingTitle}
                        </Text>
                        <Text style={styles.linkedStatus}>Trạng thái: {statusLabel}</Text>
                      </View>
                      {hasListingId ? (
                        <Icon name="chevron-right" size={16} color={semantic.color.textSecondary} />
                      ) : null}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky Editorial Action Bar */}
      <View
        style={[
          styles.stickyFooterWrap,
          { paddingBottom: Math.max(insets?.bottom ?? 0, primitive.space[3]) },
        ]}
      >
        {canCreateListing ? (
          <Action
            title="Đăng tin từ đồ vật này"
            icon="plus"
            testID="detail-create-listing-button"
            disabled={busy}
            onPress={() =>
              navigation.navigate('CreateListing', { preselectedItemId: item.id })
            }
          />
        ) : null}
        <View style={styles.stickyFooterRow}>
          <View style={styles.footerBtnSlot}>
            <Action
              title="Sửa đồ vật"
              variant="secondary"
              icon="edit-2"
              testID="detail-edit-button"
              disabled={!isEditable || busy}
              onPress={() => {
                if (!isEditable) {
                  setActionError(
                    'Đồ vật đang gắn với tin đăng hoặc không ở trạng thái khả dụng, không thể chỉnh sửa.',
                  );
                  return;
                }
                navigation.navigate('InventoryForm', { mode: 'edit', id: item.id, item });
              }}
            />
          </View>
          <View style={styles.footerBtnSlot}>
            <Action
              title="Xóa đồ vật"
              variant="destructive"
              icon="trash-2"
              testID="detail-delete-button"
              disabled={!isDeletable || busy}
              busy={busy}
              onPress={confirmDelete}
            />
          </View>
        </View>
      </View>
    </View>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: primitive.space[6],
    backgroundColor: semantic.color.bgPage,
    gap: primitive.space[3],
  },
  loadingText: {
    ...semantic.type.caption,
  },
  notFoundAction: {
    width: '100%',
    maxWidth: 240,
  },
  galleryContainer: {
    width: '100%',
    backgroundColor: semantic.color.bgSubtle,
    position: 'relative',
  },
  counterPill: {
    position: 'absolute',
    bottom: primitive.space[3],
    right: primitive.space[4],
    backgroundColor: semantic.color.overlayDark,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1],
    borderRadius: primitive.radius.full,
  },
  counterText: {
    ...semantic.type.micro,
    color: semantic.color.textInverse,
    fontWeight: primitive.fontWeight.semibold,
  },
  noImageBanner: {
    flex: 1,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    paddingHorizontal: semantic.spacing.pageX,
  },
  noImageText: {
    ...semantic.type.caption,
  },
  bannerWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
  },
  section: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[5],
    gap: primitive.space[3],
  },
  title: {
    ...semantic.type.screenTitle,
  },
  description: {
    ...semantic.type.body,
  },
  linkedList: {
    marginTop: primitive.space[1],
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
    paddingVertical: primitive.space[3],
  },
  linkedRowPressed: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
  },
  linkedIcon: {
    width: 28,
    height: 28,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedMeta: {
    flex: 1,
    gap: 2,
  },
  linkedTitle: {
    ...semantic.type.cardTitle,
  },
  linkedStatus: {
    ...semantic.type.micro,
  },
  stickyFooterWrap: {
    gap: primitive.space[2.5],
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    backgroundColor: semantic.color.bgSurface,
    borderTopWidth: 1,
    borderTopColor: semantic.color.borderHairline,
  },
  stickyFooterRow: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  footerBtnSlot: {
    flex: 1,
  },
});
