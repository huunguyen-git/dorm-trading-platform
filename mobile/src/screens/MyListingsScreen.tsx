import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
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
import { buildMediaImageSource } from '../api/client';
import { resolveUserRestriction, useSession } from '../auth/session';
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import { useSellerListings } from '../listings/sellerStore';
import {
  formatShortDate,
  formatVnd,
  LISTING_STATUS_META,
  type ListingStatus,
  type ListingSummary,
} from '../listings/types';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  ActionSheet,
  BottomNavBar,
  EmptyState,
  HairlineDivider,
  Icon,
  InlineBanner,
  QuotaMeter,
  StatusIndicator,
  UnderlineTabs,
  type ActionSheetOption,
  type UnderlineTabItem,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

const STATUS_TABS: UnderlineTabItem<ListingStatus | ''>[] = [
  { value: '', label: 'Tất cả', testID: 'filter-status-ALL' },
  { value: 'CONG_KHAI', label: 'Đang hiển thị', testID: 'filter-status-CONG_KHAI' },
  { value: 'NHAP', label: 'Bản nháp', testID: 'filter-status-NHAP' },
  { value: 'GIU_CHO', label: 'Đang giữ chỗ', testID: 'filter-status-GIU_CHO' },
  { value: 'CHO_DUYET', label: 'Chờ duyệt', testID: 'filter-status-CHO_DUYET' },
  { value: 'HET_HAN', label: 'Hết hạn', testID: 'filter-status-HET_HAN' },
  { value: 'DA_RUT', label: 'Đã rút', testID: 'filter-status-DA_RUT' },
];

const EDITABLE_STATUSES: ReadonlySet<ListingStatus> = new Set([
  'NHAP',
  'CHO_DUYET',
  'CONG_KHAI',
  'DA_RUT',
  'HET_HAN',
]);

const DELETABLE_STATUSES: ReadonlySet<ListingStatus> = new Set([
  'NHAP',
  'CHO_DUYET',
  'CONG_KHAI',
  'DA_RUT',
  'HET_HAN',
]);

function formatExpiryMeta(item: ListingSummary): string {
  if (item.status === 'NHAP') {
    return 'Bản nháp · Chưa công khai';
  }
  if (item.status === 'GIU_CHO') {
    return 'Đang giữ chỗ cho giao dịch';
  }
  if (item.status === 'HET_HAN') {
    const dateStr = formatShortDate(item.expiresAt);
    return dateStr ? `Hết hạn ${dateStr}` : 'Đã hết hạn';
  }
  if (item.status === 'DA_RUT') {
    return 'Đã rút tin';
  }
  if (item.status === 'CONG_KHAI' && item.expiresAt) {
    const expiresMs = new Date(item.expiresAt).getTime();
    if (!Number.isNaN(expiresMs)) {
      const daysLeft = Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000));
      if (daysLeft <= 0) {
        return 'Hết hạn hôm nay';
      }
      return `Còn ${daysLeft} ngày`;
    }
  }
  if (item.createdAt) {
    return `Tạo ${formatShortDate(item.createdAt)}`;
  }
  return '';
}

export default function MyListingsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useContext(SafeAreaInsetsContext);
  const token = useSession((state) => state.token);
  const user = useSession((state) => state.user);
  const restriction = useSession((state) => state.restriction);
  const restrictionDismissed = useSession((state) => state.restrictionDismissed);

  const visibleRestriction =
    restriction ?? (restrictionDismissed ? null : resolveUserRestriction(user));
  const isLocked = Boolean(visibleRestriction) || user?.accountStatus === 'BI_KHOA';
  const isActiveMember = Boolean(
    token && user?.roles.includes('MEMBER') && user?.accountStatus !== 'BI_KHOA',
  );

  const {
    myListings,
    page,
    totalElements,
    totalPages,
    statusFilter,
    quota,
    loading,
    error,
    loadMyListings,
    publish,
    withdraw,
    renew,
    remove,
    clearError,
  } = useSellerListings();

  const statusFilterRef = useRef<ListingStatus | ''>(statusFilter);
  statusFilterRef.current = statusFilter;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionSheetItem, setActionSheetItem] = useState<ListingSummary | null>(null);

  const topPad = (insets?.top ?? 0) + primitive.space[3];

  useFocusEffect(
    useCallback(() => {
      if (!isActiveMember) return;
      setActionError('');
      clearError();
      void loadMyListings({ status: statusFilterRef.current, page: 0 }).catch(() => {});
    }, [isActiveMember, loadMyListings, clearError]),
  );

  const handleSelectFilter = (nextStatus: ListingStatus | '') => {
    setActionError('');
    setActionSuccess('');
    clearError();
    void loadMyListings({ status: nextStatus, page: 0 }).catch(() => {});
  };

  const handleRefresh = () => {
    if (!isActiveMember) return;
    setActionError('');
    setActionSuccess('');
    clearError();
    void loadMyListings({ status: statusFilter, page: 0 }).catch(() => {});
  };

  const handleLoadMore = () => {
    if (!isActiveMember || loading || page + 1 >= totalPages) return;
    void loadMyListings({ status: statusFilter, page: page + 1 }).catch(() => {});
  };

  const handleMutationError = useCallback((err: unknown, fallback: string) => {
    if (isRestrictedError(err)) {
      setActionError('');
      return;
    }
    const parsed = extractApiError(err, fallback);
    setActionError(parsed.message);
  }, []);

  const handlePublish = useCallback(
    async (item: ListingSummary) => {
      setBusyId(item.id);
      setActionError('');
      setActionSuccess('');
      try {
        await publish(item.id, item.version);
        setActionSuccess(`Đã công khai tin "${item.title}".`);
      } catch (err) {
        handleMutationError(err, 'Không thể công khai tin đăng.');
      } finally {
        setBusyId(null);
      }
    },
    [publish, handleMutationError],
  );

  const handleRenew = useCallback(
    async (item: ListingSummary) => {
      setBusyId(item.id);
      setActionError('');
      setActionSuccess('');
      try {
        await renew(item.id, item.version);
        setActionSuccess(`Đã gia hạn tin "${item.title}" thêm 30 ngày.`);
      } catch (err) {
        handleMutationError(err, 'Không thể gia hạn tin đăng.');
      } finally {
        setBusyId(null);
      }
    },
    [renew, handleMutationError],
  );

  const performWithdraw = useCallback(
    async (item: ListingSummary) => {
      setBusyId(item.id);
      setActionError('');
      setActionSuccess('');
      try {
        await withdraw(item.id, item.version);
        setActionSuccess(
          `Đã rút tin "${item.title}" khỏi hiển thị công khai và giải phóng liên kết đồ vật.`,
        );
      } catch (err) {
        handleMutationError(err, 'Không thể rút tin đăng.');
      } finally {
        setBusyId(null);
      }
    },
    [withdraw, handleMutationError],
  );

  const confirmWithdraw = useCallback(
    (item: ListingSummary) => {
      setActionError('');
      setActionSuccess('');
      const comboNote = item.isCombo
        ? `Toàn bộ ${item.itemCount} đồ vật trong combo sẽ được giải phóng liên kết khỏi tin này.`
        : 'Đồ vật gắn với tin sẽ được giải phóng liên kết khỏi tin này.';
      Alert.alert(
        'Xác nhận rút tin',
        `Rút tin "${item.title}" sẽ ngừng hiển thị tin với người mua và hoàn lại 1 suất hạn mức (nếu đang công khai). ${comboNote}`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Rút tin',
            style: 'destructive',
            onPress: () => void performWithdraw(item),
          },
        ],
      );
    },
    [performWithdraw],
  );

  const performDelete = useCallback(
    async (item: ListingSummary) => {
      setBusyId(item.id);
      setActionError('');
      setActionSuccess('');
      try {
        await remove(item.id, item.version);
        setActionSuccess(`Đã xóa tin "${item.title}".`);
      } catch (err) {
        handleMutationError(err, 'Không thể xóa tin đăng.');
      } finally {
        setBusyId(null);
      }
    },
    [remove, handleMutationError],
  );

  const confirmDelete = useCallback(
    (item: ListingSummary) => {
      setActionError('');
      setActionSuccess('');
      Alert.alert(
        'Xác nhận xóa tin',
        `Bạn có chắc chắn muốn xóa vĩnh viễn tin "${item.title}"? Các liên kết với Kho đồ cá nhân sẽ được gỡ bỏ (nếu tin đã có lịch sử giao dịch, vui lòng dùng nút "Rút tin").`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Xóa tin',
            style: 'destructive',
            onPress: () => void performDelete(item),
          },
        ],
      );
    },
    [performDelete],
  );

  const actionSheetOptions = useMemo<ActionSheetOption[]>(() => {
    if (!actionSheetItem) return [];
    const item = actionSheetItem;
    const isBusy = busyId === item.id;
    const canEdit = EDITABLE_STATUSES.has(item.status);
    const canPublish =
      item.status === 'NHAP' || item.status === 'DA_RUT' || item.status === 'HET_HAN';
    const canWithdraw = item.status === 'CONG_KHAI' || item.status === 'CHO_DUYET';
    const canRenew =
      (item.status === 'CONG_KHAI' && item.renewalReminderDue) || item.status === 'HET_HAN';
    const canDelete = DELETABLE_STATUSES.has(item.status);

    const options: ActionSheetOption[] = [
      {
        key: 'view',
        label: 'Xem chi tiết',
        icon: 'eye',
        testID: `action-sheet-view-${item.id}`,
        onPress: () => navigation.navigate('Listing', { id: item.id, listing: item }),
      },
      {
        key: 'orders',
        label: 'Giao dịch của tin này',
        icon: 'shopping-bag',
        testID: `action-sheet-orders-${item.id}`,
        onPress: () =>
          navigation.navigate('Orders', {
            initialRole: 'SELLER',
            initialStatus: 'ALL',
            listingId: item.id,
            listingTitle: item.title,
          }),
      },
    ];

    if (canEdit) {
      options.push({
        key: 'edit',
        label: 'Sửa tin',
        icon: 'edit-2',
        disabled: isBusy,
        testID: `action-sheet-edit-${item.id}`,
        onPress: () => navigation.navigate('EditListing', { id: item.id }),
      });
    }

    if (canPublish) {
      options.push({
        key: 'publish',
        label: item.status === 'NHAP' ? 'Công khai' : 'Công khai lại',
        icon: 'send',
        disabled: isBusy || Boolean(quota && !quota.canPublish),
        testID: `action-sheet-publish-${item.id}`,
        onPress: () => void handlePublish(item),
      });
    }

    if (canRenew) {
      const renewBlockedByQuota =
        item.status === 'HET_HAN' && Boolean(quota && !quota.canPublish);
      options.push({
        key: 'renew',
        label: 'Gia hạn +30 ngày',
        icon: 'refresh-cw',
        disabled: isBusy || renewBlockedByQuota,
        testID: `action-sheet-renew-${item.id}`,
        onPress: () => void handleRenew(item),
      });
    }

    if (canWithdraw) {
      options.push({
        key: 'withdraw',
        label: 'Rút tin',
        icon: 'eye-off',
        disabled: isBusy,
        testID: `my-listing-withdraw-${item.id}`,
        onPress: () => confirmWithdraw(item),
      });
    }

    if (canDelete) {
      options.push({
        key: 'delete',
        label: 'Xóa tin',
        icon: 'trash-2',
        destructive: true,
        disabled: isBusy,
        testID: `my-listing-delete-${item.id}`,
        onPress: () => confirmDelete(item),
      });
    }

    return options;
  }, [
    actionSheetItem,
    busyId,
    quota,
    navigation,
    handlePublish,
    handleRenew,
    confirmWithdraw,
    confirmDelete,
  ]);

  if (!token) {
    return (
      <View style={styles.screen}>
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <Text accessibilityRole="header" style={styles.screenTitle}>
            Tin của tôi
          </Text>
        </View>
        <HairlineDivider />
        <View style={styles.gatedBody}>
          <EmptyState
            icon="log-in"
            title="Đăng nhập để quản lý tin"
            subtitle="Vui lòng đăng nhập bằng tài khoản sinh viên để quản lý tin đăng cá nhân."
            primaryActionLabel="Đăng nhập"
            primaryActionTestID="my-listings-login-btn"
            onPrimaryAction={() => navigation.navigate('Login')}
          />
        </View>
        <BottomNavBar activeTab="MyListings" />
      </View>
    );
  }

  if (isLocked) {
    return (
      <View style={styles.screen}>
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <Text accessibilityRole="header" style={styles.screenTitle}>
            Tin của tôi
          </Text>
        </View>
        <HairlineDivider />
        <View style={styles.lockedBody}>
          <RestrictedAccountNotice />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại tin công khai"
            onPress={() => navigation.navigate('Listings')}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressedState]}
          >
            <Text style={styles.secondaryBtnText}>Quay lại tin công khai</Text>
          </Pressable>
        </View>
        <BottomNavBar activeTab="MyListings" />
      </View>
    );
  }

  if (!isActiveMember) {
    return (
      <View style={styles.screen}>
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <Text accessibilityRole="header" style={styles.screenTitle}>
            Tin của tôi
          </Text>
        </View>
        <HairlineDivider />
        <View style={styles.gatedBody}>
          <EmptyState
            icon="shield"
            title="Tài khoản chưa kích hoạt"
            subtitle="Tài khoản đang chờ hoàn tất xác minh email hoặc duyệt hồ sơ. Bạn chưa thể quản lý tin đăng."
            primaryActionLabel="Quay lại tin công khai"
            onPrimaryAction={() => navigation.navigate('Listings')}
          />
        </View>
        <BottomNavBar activeTab="MyListings" />
      </View>
    );
  }

  const visibleError = actionError || error || '';

  return (
    <View style={styles.screen}>
      {/* Top SafeArea Header */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <Text accessibilityRole="header" style={styles.screenTitle}>
          Tin của tôi
        </Text>
        <View style={styles.topBarActions}>
          <Pressable
            testID="my-listings-orders-btn"
            accessibilityRole="button"
            accessibilityLabel="Giao dịch của tôi"
            onPress={() => navigation.navigate('Orders', { initialRole: 'SELLER' })}
            style={({ pressed }) => [styles.ordersBtn, pressed && styles.pressedState]}
          >
            <Icon name="shopping-bag" size={15} color={semantic.color.textPrimary} />
            <Text style={styles.ordersBtnText}>Giao dịch</Text>
          </Pressable>
          <Pressable
            testID="my-listings-create-btn"
            accessibilityRole="button"
            accessibilityLabel="Tạo tin"
            onPress={() => navigation.navigate('CreateListing')}
            style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}
          >
            <Icon name="plus" size={16} color={component.button.primaryFg} />
            <Text style={styles.createBtnText}>Tạo tin</Text>
          </Pressable>
        </View>
      </View>

      {/* Flush Seller Summary + Lucian #299 QuotaMeter */}
      {quota ? (
        <View style={styles.quotaStrip} testID="my-listings-quota-card">
          <View style={styles.metricsRow} testID="seller-summary-metrics">
            <View style={styles.metricTile}>
              <Text style={styles.metricValue}>
                {quota.activeCount}/{quota.limit}
              </Text>
              <Text style={styles.metricLabel}>Đang mở</Text>
            </View>
            <View style={styles.metricTile}>
              <Text style={styles.metricValue}>{totalElements}</Text>
              <Text style={styles.metricLabel}>
                {statusFilter ? 'Trong mục này' : 'Tổng tin'}
              </Text>
            </View>
            <View style={styles.metricTile}>
              <Text
                style={[
                  styles.metricValue,
                  quota.reputationScore >= quota.highTierThreshold && styles.metricValueHighTrust,
                ]}
              >
                {quota.reputationScore}
              </Text>
              <Text style={styles.metricLabel}>Điểm uy tín</Text>
            </View>
          </View>

          <QuotaMeter
            activeCount={quota.activeCount}
            limit={quota.limit}
            reputationScore={quota.reputationScore}
            highTierThreshold={quota.highTierThreshold}
            standardLimit={quota.standardLimit}
            highTierLimit={quota.highTierLimit}
            label="Hạn mức tin đang mở"
            showUnlockCue={false}
            warningMessage={
              quota.remaining === 0
                ? 'Đã dùng hết hạn mức công khai. Bạn vẫn có thể lưu Bản nháp hoặc rút bớt tin cũ.'
                : undefined
            }
            style={styles.quotaMeterFlush}
          />
          <View style={styles.quotaSubRow}>
            <Text style={styles.quotaCountText}>
              Đang mở/giữ chỗ: {quota.activeCount} / {quota.limit} tin
            </Text>
            <Text style={styles.quotaRepText}>Uy tín: {quota.reputationScore}</Text>
          </View>
        </View>
      ) : null}

      {/* Lucian #048 UnderlineTabs */}
      <UnderlineTabs
        items={STATUS_TABS}
        value={statusFilter}
        onChange={handleSelectFilter}
        accessibilityLabel="Lọc trạng thái tin đăng"
        testID="my-listings-status-tabs"
      />

      {visibleRestriction || visibleError || actionSuccess ? (
        <View style={styles.alertsStack}>
          {visibleRestriction ? <RestrictedAccountNotice /> : null}
          {visibleError ? <InlineBanner tone="danger" message={visibleError} /> : null}
          {actionSuccess ? <InlineBanner tone="success" message={actionSuccess} /> : null}
        </View>
      ) : null}

      <FlatList
        data={myListings}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={handleRefresh}
            tintColor={semantic.color.accent}
          />
        }
        ItemSeparatorComponent={() => <HairlineDivider insetLeft={semantic.spacing.pageX} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              testID="my-listings-empty"
              icon="tag"
              title={
                statusFilter ? 'Không có tin đăng ở trạng thái này' : 'Bạn chưa có tin đăng nào'
              }
              subtitle={
                statusFilter
                  ? 'Hãy thử chuyển sang mục khác hoặc tạo tin đăng mới từ Kho đồ cá nhân.'
                  : 'Bắt đầu đăng bán hoặc cho tặng đồ dùng KTX ngay từ Kho đồ cá nhân của bạn.'
              }
              primaryActionLabel="Tạo tin mới"
              primaryActionTestID="my-listings-empty-create-btn"
              onPrimaryAction={() => navigation.navigate('CreateListing')}
            />
          ) : undefined
        }
        ListFooterComponent={
          page + 1 < totalPages ? (
            <View style={styles.loadMoreWrap}>
              <Pressable
                testID="my-listings-load-more"
                accessibilityRole="button"
                accessibilityLabel="Tải thêm tin"
                accessibilityState={{ disabled: loading, busy: loading }}
                disabled={loading}
                onPress={handleLoadMore}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  loading && styles.disabledState,
                  pressed && !loading && styles.pressedState,
                ]}
              >
                <Text style={styles.secondaryBtnText}>
                  {loading ? 'Đang tải...' : 'Tải thêm tin'}
                </Text>
              </Pressable>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => {
          const statusMeta = LISTING_STATUS_META[item.status];
          const isBusy = busyId === item.id;
          const isReserved = item.status === 'GIU_CHO';
          const canEdit = EDITABLE_STATUSES.has(item.status);
          const canPublish = item.status === 'NHAP' || item.status === 'DA_RUT';
          const canRenewExpired = item.status === 'HET_HAN';
          const thumb = item.thumbnailUrl ?? item.images[0] ?? null;
          const expiryMeta = formatExpiryMeta(item);
          const locationLabel = item.locationName || item.locationText || '';
          const metaLine = [locationLabel, expiryMeta, item.courseCode].filter(Boolean).join(' · ');
          const publishDisabled = isBusy || Boolean(quota && !quota.canPublish);
          const renewExpiredDisabled = isBusy || Boolean(quota && !quota.canPublish);

          return (
            <View style={styles.rowContainer} testID={`my-listing-card-${item.id}`}>
              <Pressable
                testID={`my-listing-view-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Xem ${item.title}`}
                onPress={() => navigation.navigate('Listing', { id: item.id, listing: item })}
                style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
              >
                <View style={styles.thumbWrap}>
                  {thumb ? (
                    <Image
                      source={buildMediaImageSource(
                        thumb,
                        item.status === 'CONG_KHAI' || item.status === 'GIU_CHO' ? null : token,
                      )}
                      style={styles.thumb}
                      resizeMode="cover"
                      accessibilityLabel={item.title}
                    />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Icon name="image" size={22} color={semantic.color.textSecondary} />
                    </View>
                  )}
                  {item.images.length > 1 ? (
                    <View style={styles.thumbCountBadge}>
                      <Icon name="camera" size={10} color={semantic.color.textInverse} />
                      <Text style={styles.thumbCountText}>{item.images.length}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {item.title}
                  </Text>

                  <View style={styles.priceRow}>
                    <Text style={[styles.priceText, item.isFree && styles.priceFreeText]}>
                      {formatVnd(item.priceVnd)}
                    </Text>
                    {item.isCombo ? (
                      <StatusIndicator
                        label={`Combo · ${item.itemCount} món`}
                        tone="neutral"
                        variant="soft"
                      />
                    ) : null}
                  </View>

                  {metaLine ? (
                    <Text style={styles.metaLine} numberOfLines={1}>
                      {metaLine}
                    </Text>
                  ) : null}

                  <StatusIndicator
                    testID={`my-listing-status-${item.id}`}
                    label={statusMeta.label}
                    tone={statusMeta.tone}
                    variant={statusMeta.tier}
                  />
                </View>
              </Pressable>

              {item.hasUnavailableItems ? (
                <InlineBanner
                  tone="warning"
                  testID={`unavailable-items-${item.id}`}
                  message="Một đồ vật trong tin hiện đang được giữ hoặc đã chuyển giao ở tin khác."
                />
              ) : null}

              {item.renewalReminderDue && item.status === 'CONG_KHAI' ? (
                <InlineBanner
                  tone="warning"
                  testID={`renewal-banner-${item.id}`}
                  message="Tin sắp hết hạn trong 7 ngày tới. Gia hạn để tiếp tục hiển thị thêm 30 ngày."
                  actionLabel={isBusy ? 'Đang gia hạn...' : 'Gia hạn +30 ngày'}
                  actionTestID={`renew-banner-btn-${item.id}`}
                  onActionPress={() => {
                    if (!isBusy) {
                      void handleRenew(item);
                    }
                  }}
                />
              ) : null}

              {isReserved ? (
                <InlineBanner
                  tone="warning"
                  icon="lock"
                  testID={`locked-badge-${item.id}`}
                  message="Tin đang được giữ chỗ cho giao dịch — không thể sửa, rút tin hoặc xóa lúc này."
                  actionLabel="Xem giao dịch"
                  actionTestID={`my-listing-view-order-${item.id}`}
                  onActionPress={() =>
                    navigation.navigate('Orders', {
                      initialRole: 'SELLER',
                      initialStatus: 'ALL',
                      listingId: item.id,
                      listingTitle: item.title,
                    })
                  }
                />
              ) : null}

              {/* Compact Row Actions: max 1 primary contextual action + overflow trigger */}
              <View style={styles.rowActions}>
                <View style={styles.primaryActionSlot}>
                  {canPublish ? (
                    <Pressable
                      testID={`my-listing-publish-${item.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Công khai ${item.title}`}
                      accessibilityState={{ disabled: publishDisabled }}
                      disabled={publishDisabled}
                      onPress={() => void handlePublish(item)}
                      style={({ pressed }) => [
                        styles.inlinePrimaryBtn,
                        publishDisabled && styles.disabledState,
                        pressed && !publishDisabled && styles.pressedState,
                      ]}
                    >
                      <Text style={styles.inlinePrimaryText}>Công khai</Text>
                    </Pressable>
                  ) : canRenewExpired ? (
                    <Pressable
                      testID={`my-listing-renew-${item.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Gia hạn ${item.title}`}
                      accessibilityState={{ disabled: renewExpiredDisabled }}
                      disabled={renewExpiredDisabled}
                      onPress={() => void handleRenew(item)}
                      style={({ pressed }) => [
                        styles.inlinePrimaryBtn,
                        renewExpiredDisabled && styles.disabledState,
                        pressed && !renewExpiredDisabled && styles.pressedState,
                      ]}
                    >
                      <Text style={styles.inlinePrimaryText}>Gia hạn</Text>
                    </Pressable>
                  ) : canEdit ? (
                    <Pressable
                      testID={`my-listing-edit-${item.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Sửa ${item.title}`}
                      accessibilityState={{ disabled: isBusy }}
                      disabled={isBusy}
                      onPress={() => navigation.navigate('EditListing', { id: item.id })}
                      style={({ pressed }) => [
                        styles.inlineSecondaryBtn,
                        isBusy && styles.disabledState,
                        pressed && !isBusy && styles.pressedState,
                      ]}
                    >
                      <Icon name="edit-2" size={14} color={semantic.color.textPrimary} />
                      <Text style={styles.inlineSecondaryText}>Sửa</Text>
                    </Pressable>
                  ) : null}
                </View>

                <Pressable
                  testID={`my-listing-more-${item.id}`}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Tùy chọn ${item.title}`}
                  accessibilityState={{ disabled: isBusy }}
                  disabled={isBusy}
                  onPress={() => setActionSheetItem(item)}
                  style={({ pressed }) => [
                    styles.moreBtn,
                    isBusy && styles.disabledState,
                    pressed && !isBusy && styles.pressedState,
                  ]}
                >
                  <Icon name="more-horizontal" size={16} color={semantic.color.textSecondary} />
                  <Text style={styles.moreBtnText}>Tùy chọn</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <ActionSheet
        visible={Boolean(actionSheetItem)}
        onClose={() => setActionSheetItem(null)}
        title={actionSheetItem?.title}
        subtitle={actionSheetItem ? LISTING_STATUS_META[actionSheetItem.status].label : undefined}
        options={actionSheetOptions}
        cancelLabel="Hủy"
        testID="my-listing-action-sheet"
      />

      <BottomNavBar activeTab="MyListings" />
    </View>
  );
}

const THUMB_SIZE = 88;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[3],
    backgroundColor: semantic.color.bgSurface,
    gap: primitive.space[3],
  },
  screenTitle: {
    ...semantic.type.screenTitle,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  ordersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    minHeight: component.button.minHeightSm,
    paddingHorizontal: primitive.space[3],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
  },
  ordersBtnText: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    minHeight: component.button.minHeightSm,
    paddingHorizontal: primitive.space[3],
    borderRadius: primitive.radius.full,
    backgroundColor: component.button.primaryBg,
  },
  createBtnPressed: {
    backgroundColor: component.button.primaryPressedBg,
  },
  createBtnText: {
    ...semantic.type.label,
    color: component.button.primaryFg,
  },
  quotaStrip: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[3],
    backgroundColor: semantic.color.bgSurface,
    gap: primitive.space[2],
  },
  metricsRow: {
    flexDirection: 'row',
    gap: primitive.space[2],
  },
  metricTile: {
    flex: 1,
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[2],
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    fontSize: primitive.fontSize.lg,
    lineHeight: 22,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textPrimary,
  },
  metricValueHighTrust: {
    color: semantic.color.freeFg,
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
  },
  quotaMeterFlush: {
    paddingVertical: 0,
  },
  quotaSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  quotaCountText: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  quotaRepText: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  alertsStack: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    gap: primitive.space[2],
    backgroundColor: semantic.color.bgSurface,
  },
  gatedBody: {
    flex: 1,
    backgroundColor: semantic.color.bgPage,
    justifyContent: 'center',
  },
  lockedBody: {
    flex: 1,
    backgroundColor: semantic.color.bgPage,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[6],
    gap: primitive.space[4],
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: primitive.space[4],
    backgroundColor: semantic.color.bgSurface,
  },
  loadMoreWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
  },
  rowContainer: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[3],
    backgroundColor: semantic.color.bgSurface,
    gap: primitive.space[2.5],
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[3],
  },
  rowPressed: {
    opacity: primitive.opacity.pressed,
  },
  thumbWrap: {
    position: 'relative',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgTrack,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  thumbPlaceholder: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCountBadge: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: semantic.color.overlayDark,
    borderRadius: primitive.radius.xs,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  thumbCountText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textInverse,
  },
  rowInfo: {
    flex: 1,
    gap: primitive.space[1],
  },
  rowTitle: {
    ...semantic.type.cardTitle,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  priceText: {
    ...semantic.type.price,
    color: semantic.color.accent,
  },
  priceFreeText: {
    color: semantic.color.freeFg,
  },
  metaLine: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
    paddingTop: primitive.space[1],
  },
  primaryActionSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  inlinePrimaryBtn: {
    minHeight: 34,
    paddingHorizontal: primitive.space[3],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlinePrimaryText: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  inlineSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    minHeight: 34,
    paddingHorizontal: primitive.space[3],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
  },
  inlineSecondaryText: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
    minHeight: 34,
    paddingHorizontal: primitive.space[2.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
  },
  moreBtnText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  secondaryBtn: {
    minHeight: component.button.minHeight,
    paddingHorizontal: component.button.paddingX,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
  disabledState: {
    opacity: primitive.opacity.disabled,
  },
  pressedState: {
    opacity: primitive.opacity.pressed,
  },
});
