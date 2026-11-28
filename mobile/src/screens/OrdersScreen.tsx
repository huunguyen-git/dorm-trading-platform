import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav, RootStack } from '../navigation';
import { resolveMediaUrl } from '../api/client';
import { resolveUserRestriction, useSession } from '../auth/session';
import { useOrders } from '../orders/store';
import { isOrderWithinReviewWindow } from '../reviews/types';
import {
  formatExactVnd,
  formatOrderDateTime,
  getNotificationTone,
  ORDER_STATUS_META,
  type OrderRoleFilter,
  type OrderStatus,
  type OrderSummary,
} from '../orders/types';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  CollapsibleAlert,
  EmptyState,
  HairlineDivider,
  Icon,
  InlineBanner,
  SectionHeading,
  SegmentedControl,
  StatusIndicator,
  UnderlineTabs,
  type UnderlineTabItem,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

const ROLE_OPTIONS: { value: OrderRoleFilter; label: string; testID: string }[] = [
  { value: 'ALL', label: 'Tất cả', testID: 'orders-role-all' },
  { value: 'BUYER', label: 'Tôi mua', testID: 'orders-role-buyer' },
  { value: 'SELLER', label: 'Tôi bán', testID: 'orders-role-seller' },
];

const STATUS_TABS: UnderlineTabItem<OrderStatus | 'ALL'>[] = [
  { value: 'ALL', label: 'Tất cả', testID: 'orders-status-ALL' },
  { value: 'YEU_CAU', label: 'Chờ duyệt', testID: 'orders-status-YEU_CAU' },
  { value: 'GIU_CHO', label: 'Đang giữ chỗ', testID: 'orders-status-GIU_CHO' },
  { value: 'DANG_GIAO', label: 'Đang giao', testID: 'orders-status-DANG_GIAO' },
  { value: 'CHO_XAC_NHAN', label: 'Chờ xác nhận', testID: 'orders-status-CHO_XAC_NHAN' },
  { value: 'CHO_XU_LY', label: 'Chờ xử lý', testID: 'orders-status-CHO_XU_LY' },
  { value: 'HOAN_TAT', label: 'Hoàn tất', testID: 'orders-status-HOAN_TAT' },
  { value: 'HUY', label: 'Đã hủy', testID: 'orders-status-HUY' },
];

export default function OrdersScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStack, 'Orders'>>();
  const insets = useContext(SafeAreaInsetsContext);

  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const restriction = useSession((s) => s.restriction);
  const restrictionDismissed = useSession((s) => s.restrictionDismissed);

  const visibleRestriction =
    restriction ?? (restrictionDismissed ? null : resolveUserRestriction(user));
  const isLocked = Boolean(visibleRestriction) || user?.accountStatus === 'BI_KHOA';
  const isActiveMember = Boolean(
    token &&
      user?.roles.includes('MEMBER') &&
      user?.accountStatus === 'HOAT_DONG' &&
      user?.emailVerified &&
      user?.profileApproved &&
      !restriction,
  );

  const {
    orders,
    page,
    totalPages,
    roleFilter,
    statusFilter,
    listingIdFilter,
    listingTitleFilter,
    loading,
    refreshing,
    error,
    notifications,
    unreadCount,
    loadOrders,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useOrders();

  const initialRole = route.params?.initialRole;
  const initialStatus = route.params?.initialStatus;
  const routeListingId = route.params?.listingId;
  const routeListingTitle = route.params?.listingTitle;

  const skipInitialFocusRef = useRef(true);

  const fetchWithRouteOrCurrent = useCallback(
    (isInitialMount: boolean) => {
      if (!isActiveMember) return;
      if (isInitialMount) {
        void loadOrders({
          role: initialRole ?? 'ALL',
          status: initialStatus ?? 'ALL',
          listingId: routeListingId ?? null,
          listingTitle: routeListingTitle ?? null,
          page: 0,
        });
      } else {
        void loadOrders({ page: 0 });
      }
      void loadNotifications();
    },
    [
      isActiveMember,
      initialRole,
      initialStatus,
      routeListingId,
      routeListingTitle,
      loadOrders,
      loadNotifications,
    ],
  );

  useEffect(() => {
    fetchWithRouteOrCurrent(true);
  }, [fetchWithRouteOrCurrent]);

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') return;
    const unsubBlur = navigation.addListener('blur', () => {
      skipInitialFocusRef.current = false;
    });
    const unsubFocus = navigation.addListener('focus', () => {
      if (skipInitialFocusRef.current) {
        skipInitialFocusRef.current = false;
        return;
      }
      fetchWithRouteOrCurrent(false);
    });
    return () => {
      unsubBlur?.();
      unsubFocus?.();
    };
  }, [navigation, fetchWithRouteOrCurrent]);

  const handleGoBack = () => {
    if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Listings');
    }
  };

  const handleRefresh = () => {
    if (!isActiveMember) return;
    void loadOrders({ page: 0, refresh: true });
    void loadNotifications();
  };

  const handleLoadMore = () => {
    if (!isActiveMember || loading || page + 1 >= totalPages) return;
    void loadOrders({ page: page + 1 });
  };

  const [showAllNotifications, setShowAllNotifications] = useState(false);

  const topPad = (insets?.top ?? 0) + primitive.space[3];
  const bottomPad = Math.max(insets?.bottom ?? 0, primitive.space[6]);
  const allUnreadNotifications = notifications.filter((n) => !n.read);
  const unreadNotifications = showAllNotifications
    ? allUnreadNotifications
    : allUnreadNotifications.slice(0, 3);
  const hasActiveFilters = Boolean(
    listingIdFilter || statusFilter !== 'ALL' || roleFilter !== 'ALL',
  );

  const renderHeaderBar = (showUnreadBadge: boolean) => (
    <View style={[styles.topBar, { paddingTop: topPad }]}>
      <Pressable
        testID="orders-back-btn"
        onPress={handleGoBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
        style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
      >
        <Icon name="chevron-left" size={22} color={semantic.color.textPrimary} />
      </Pressable>

      <Text accessibilityRole="header" style={styles.screenTitle} numberOfLines={1}>
        Giao dịch của tôi
      </Text>

      {showUnreadBadge && unreadCount > 0 ? (
        <View style={styles.unreadHeaderPill} testID="orders-unread-pill">
          <Icon name="bell" size={13} color={semantic.color.accent} />
          <Text style={styles.unreadHeaderText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : (
        <View style={styles.topBarSpacer} />
      )}
    </View>
  );

  if (!token) {
    return (
      <View style={styles.screen}>
        {renderHeaderBar(false)}
        <HairlineDivider />
        <View style={styles.gatedBody}>
          <EmptyState
            icon="log-in"
            title="Đăng nhập để theo dõi giao dịch"
            subtitle="Vui lòng đăng nhập tài khoản sinh viên ĐHQG-HCM để quản lý yêu cầu giữ chỗ và lịch giao nhận."
            primaryActionLabel="Đăng nhập"
            primaryActionTestID="orders-login-btn"
            onPrimaryAction={() => navigation.navigate('Login')}
          />
        </View>
      </View>
    );
  }

  if (isLocked) {
    return (
      <View style={styles.screen}>
        {renderHeaderBar(false)}
        <HairlineDivider />
        <View style={styles.lockedBody}>
          <RestrictedAccountNotice />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại tin công khai"
            onPress={() => navigation.navigate('Listings')}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryBtnText}>Quay lại tin công khai</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!isActiveMember) {
    return (
      <View style={styles.screen}>
        {renderHeaderBar(false)}
        <HairlineDivider />
        <View style={styles.gatedBody}>
          <EmptyState
            icon="shield"
            title="Tài khoản chưa kích hoạt"
            subtitle="Hoàn tất xác minh email và duyệt hồ sơ trước khi gửi yêu cầu giữ chỗ hoặc quản lý giao dịch."
            primaryActionLabel="Quay lại tin công khai"
            onPrimaryAction={() => navigation.navigate('Listings')}
          />
        </View>
      </View>
    );
  }

  const renderOrderRow = ({ item: order }: { item: OrderSummary }) => {
    const meta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.YEU_CAU;
    const isSeller = user?.id === order.seller.id;
    const counterparty = isSeller ? order.buyer : order.seller;
    const isFreeListing = Boolean(order.listing.isFree || order.listing.listedPriceVnd === 0);
    const hasPriceDiff = order.agreedPriceVnd !== order.listing.listedPriceVnd;
    const thumbUri = order.listing.thumbnailUrl
      ? resolveMediaUrl(order.listing.thumbnailUrl)
      : null;

    return (
      <Pressable
        testID={`order-card-${order.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${order.listing.title}, ${meta.label}`}
        onPress={() => navigation.navigate('OrderDetail', { id: order.id })}
        style={({ pressed }) => [styles.rowContainer, pressed && styles.rowPressed]}
      >
        <View style={styles.rowMain}>
          <View style={styles.thumbWrap}>
            {thumbUri ? (
              <Image
                source={{ uri: thumbUri }}
                style={styles.thumb}
                resizeMode="cover"
                accessibilityLabel={order.listing.title}
              />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <Icon name="shopping-bag" size={22} color={semantic.color.textSecondary} />
              </View>
            )}
            {order.listing.isCombo ? (
              <View style={styles.comboCornerTag}>
                <Text style={styles.comboCornerText}>{order.itemCount} món</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.rowInfo}>
            <View style={styles.rowHeader}>
              <StatusIndicator variant={meta.tier} tone={meta.tone} label={meta.label} />
              <View style={[styles.rolePill, isSeller && styles.rolePillSeller]}>
                <Text style={[styles.rolePillText, isSeller && styles.rolePillTextSeller]}>
                  {isSeller ? 'Bán' : 'Mua'}
                </Text>
              </View>
            </View>

            <Text style={styles.rowTitle} numberOfLines={2}>
              {order.listing.title}
            </Text>

            <View style={styles.metaRow}>
              <Text
                testID={`order-price-${order.id}`}
                style={[styles.priceText, isFreeListing && !hasPriceDiff && styles.priceFreeText]}
              >
                {isFreeListing && !hasPriceDiff
                  ? '0đ · Cho tặng'
                  : hasPriceDiff
                    ? `Giá thỏa thuận: ${formatExactVnd(order.agreedPriceVnd)}`
                    : formatExactVnd(order.agreedPriceVnd)}
              </Text>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.metaText}>
                {order.listing.isCombo ? `Combo ${order.itemCount} món` : '1 món'}
              </Text>
            </View>
            {hasPriceDiff ? (
              <Text testID={`order-listed-price-${order.id}`} style={styles.listedPriceText}>
                {`Giá niêm yết: ${isFreeListing ? '0đ · Cho tặng' : formatExactVnd(order.listing.listedPriceVnd)}`}
              </Text>
            ) : null}

            <Text style={styles.metaText} numberOfLines={1}>
              {isSeller ? 'Người mua' : 'Người bán'}: {counterparty.displayName} · Uy tín{' '}
              {counterparty.reputationScore}
            </Text>

            {order.status === 'HOAN_TAT' ? (
              order.reviewStatus === 'CHAP_NHAN' ? (
                <View style={styles.cueLine}>
                  <Icon name="star" size={13} color={semantic.color.ratingStar} />
                  <Text style={styles.scheduleConfirmedText} numberOfLines={1}>
                    Đã đánh giá giao dịch
                  </Text>
                </View>
              ) : order.reviewStatus === 'CHO_XET' ? (
                <View style={styles.cueLine}>
                  <Icon name="clock" size={13} color={semantic.color.warning} />
                  <Text style={styles.schedulePendingText} numberOfLines={1}>
                    Đánh giá đang chờ kiểm duyệt
                  </Text>
                </View>
              ) : !isSeller &&
                !order.reviewStatus &&
                isOrderWithinReviewWindow(order.completedAt) ? (
                <View style={styles.cueLine}>
                  <Icon name="star" size={13} color={semantic.color.accent} />
                  <Text style={styles.actionNeededText} numberOfLines={1}>
                    Chạm để đánh giá người bán
                  </Text>
                </View>
              ) : null
            ) : order.scheduleConfirmed && order.meetingTime && order.meetingLocation ? (
              <View style={styles.cueLine}>
                <Icon name="calendar" size={13} color={semantic.color.freeFg} />
                <Text style={styles.scheduleConfirmedText} numberOfLines={1}>
                  Đã hẹn: {formatOrderDateTime(order.meetingTime)} · {order.meetingLocation}
                </Text>
              </View>
            ) : order.hasPendingScheduleProposal ? (
              <View style={styles.cueLine}>
                <Icon name="clock" size={13} color={semantic.color.warning} />
                <Text style={styles.schedulePendingText} numberOfLines={1}>
                  Có đề xuất lịch hẹn đang chờ xác nhận
                </Text>
              </View>
            ) : isSeller && order.status === 'YEU_CAU' ? (
              <View style={styles.cueLine}>
                <Icon name="inbox" size={13} color={semantic.color.accent} />
                <Text style={styles.actionNeededText} numberOfLines={1}>
                  Nhấn để xem và phản hồi yêu cầu giữ chỗ
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.chevronWrap}>
            <Icon name="chevron-right" size={16} color={semantic.color.textSecondary} />
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      {renderHeaderBar(true)}

      {/* Role Filter Strip (Lucian #416 SegmentedControl) */}
      <View style={styles.controlsStrip}>
        <SegmentedControl
          testID="orders-role-segmented"
          options={ROLE_OPTIONS}
          value={roleFilter}
          onChange={(nextRole) => void loadOrders({ role: nextRole, status: statusFilter, page: 0 })}
          accessibilityLabel="Lọc theo vai trò giao dịch"
        />

        {listingIdFilter ? (
          <View style={styles.listingFilterRow} testID="orders-listing-filter-chip">
            <View style={styles.listingFilterPill}>
              <Icon name="tag" size={12} color={semantic.color.accent} />
              <Text style={styles.listingFilterText} numberOfLines={1}>
                Tin: {listingTitleFilter || listingIdFilter}
              </Text>
              <Pressable
                testID="orders-clear-listing-filter"
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Bỏ lọc theo tin đăng"
                onPress={() =>
                  void loadOrders({
                    role: roleFilter,
                    status: statusFilter,
                    listingId: null,
                    listingTitle: null,
                    page: 0,
                  })
                }
              >
                <Icon name="x" size={13} color={semantic.color.accent} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {/* Status Filter Tabs (Lucian #048 UnderlineTabs) */}
      <UnderlineTabs
        testID="orders-status-tabs"
        items={STATUS_TABS}
        value={statusFilter}
        onChange={(nextStatus) => void loadOrders({ role: roleFilter, status: nextStatus, page: 0 })}
        accessibilityLabel="Lọc trạng thái giao dịch"
      />

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrderRow}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={semantic.color.accent}
          />
        }
        ItemSeparatorComponent={() => <HairlineDivider insetLeft={semantic.spacing.pageX} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        ListHeaderComponent={
          <View>
            {visibleRestriction ? (
              <View style={styles.alertPadding}>
                <RestrictedAccountNotice />
              </View>
            ) : null}

            {error ? (
              <View style={styles.alertPadding}>
                <InlineBanner
                  testID="orders-error-banner"
                  tone="danger"
                  message={error}
                  actionLabel="Thử lại"
                  onActionPress={handleRefresh}
                />
              </View>
            ) : null}

            {/* Unread Notifications via Lucian #072 CollapsibleAlert */}
            {unreadNotifications.length > 0 ? (
              <View style={styles.notifSection} testID="orders-notifications-section">
                <SectionHeading
                  style={styles.notifHeading}
                  title={`Thông báo mới (${unreadCount})`}
                  actionLabel="Đánh dấu đã đọc"
                  actionTestID="mark-all-notifications-read"
                  onActionPress={() => void markAllNotificationsRead()}
                />
                <View style={styles.notifList}>
                  {unreadNotifications.map((notif) => (
                    <CollapsibleAlert
                      key={notif.id}
                      testID={`notification-item-${notif.id}`}
                      tone={getNotificationTone(notif.type)}
                      title={notif.title}
                      message={notif.message}
                      meta={formatOrderDateTime(notif.createdAt)}
                      dismissLabel="Đánh dấu đã đọc"
                      dismissTestID={`notification-dismiss-${notif.id}`}
                      onDismiss={() => void markNotificationRead(notif.id)}
                      onPress={() => {
                        void markNotificationRead(notif.id);
                        if (notif.orderId) {
                          navigation.navigate('OrderDetail', { id: notif.orderId });
                        }
                      }}
                    />
                  ))}
                  {allUnreadNotifications.length > 3 ? (
                    <Pressable
                      testID="toggle-all-notifications"
                      accessibilityRole="button"
                      onPress={() => setShowAllNotifications((prev) => !prev)}
                      style={({ pressed }) => [styles.showMoreNotifBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.showMoreNotifText}>
                        {showAllNotifications
                          ? 'Thu gọn thông báo'
                          : `Xem tất cả ${allUnreadNotifications.length} thông báo chưa đọc`}
                      </Text>
                      <Icon
                        name={showAllNotifications ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={semantic.color.accent}
                      />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.sectionGap} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={semantic.color.accent} />
              <Text style={styles.loadingText}>Đang tải danh sách giao dịch…</Text>
            </View>
          ) : (
            <EmptyState
              testID="orders-empty-state"
              icon="shopping-bag"
              title={
                listingIdFilter
                  ? 'Tin đăng này chưa có giao dịch phù hợp'
                  : hasActiveFilters
                    ? 'Không có giao dịch khớp bộ lọc'
                    : 'Chưa có giao dịch nào'
              }
              subtitle={
                hasActiveFilters
                  ? 'Thử xóa bộ lọc để xem toàn bộ giao dịch mua và bán của bạn.'
                  : 'Khi bạn gửi yêu cầu giữ chỗ hoặc nhận được yêu cầu từ người mua, giao dịch sẽ hiển thị tại đây.'
              }
              primaryActionLabel={hasActiveFilters ? 'Xóa bộ lọc' : 'Khám phá tin đăng'}
              primaryActionTestID={
                hasActiveFilters ? 'orders-empty-reset-filters' : 'orders-empty-explore'
              }
              onPrimaryAction={
                hasActiveFilters
                  ? () =>
                      void loadOrders({
                        role: 'ALL',
                        status: 'ALL',
                        listingId: null,
                        listingTitle: null,
                        page: 0,
                      })
                  : () => navigation.navigate('Listings')
              }
              secondaryActionLabel={hasActiveFilters ? 'Khám phá tin đăng' : undefined}
              onSecondaryAction={
                hasActiveFilters ? () => navigation.navigate('Listings') : undefined
              }
            />
          )
        }
        ListFooterComponent={
          page + 1 < totalPages ? (
            <View style={styles.loadMoreWrap}>
              <Pressable
                testID="orders-load-more"
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Tải thêm giao dịch"
                onPress={handleLoadMore}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  loading && styles.disabled,
                  pressed && !loading && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryBtnText}>
                  {loading ? 'Đang tải…' : 'Tải thêm giao dịch'}
                </Text>
              </Pressable>
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const THUMB_SIZE = 76;

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
    gap: primitive.space[2],
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    flex: 1,
    ...semantic.type.screenTitle,
    fontSize: primitive.fontSize.xl,
  },
  topBarSpacer: {
    width: 36,
  },
  unreadHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
  },
  unreadHeaderText: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.accent,
  },
  controlsStrip: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[2.5],
    backgroundColor: semantic.color.bgSurface,
    gap: primitive.space[2],
  },
  listingFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listingFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    maxWidth: '100%',
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
  },
  listingFilterText: {
    ...semantic.type.micro,
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
    flexShrink: 1,
  },
  listContent: {
    flexGrow: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  alertPadding: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
  },
  notifSection: {
    paddingTop: primitive.space[3],
    gap: primitive.space[2.5],
    backgroundColor: semantic.color.bgSurface,
  },
  notifHeading: {
    paddingHorizontal: semantic.spacing.pageX,
  },
  notifList: {
    paddingHorizontal: semantic.spacing.pageX,
    gap: primitive.space[2],
    paddingBottom: primitive.space[2],
  },
  showMoreNotifBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    paddingVertical: primitive.space[2],
  },
  showMoreNotifText: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  sectionGap: {
    height: primitive.space[2],
    backgroundColor: semantic.color.bgCanvas,
  },
  center: {
    paddingVertical: primitive.space[10],
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  loadingText: {
    ...semantic.type.caption,
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
  rowContainer: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[3.5 as keyof typeof primitive.space] ?? 14,
    backgroundColor: semantic.color.bgSurface,
  },
  rowPressed: {
    backgroundColor: semantic.color.bgSubtle,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[3],
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
  comboCornerTag: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: semantic.color.overlayDark,
    borderRadius: primitive.radius.xs,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  comboCornerText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textInverse,
  },
  rowInfo: {
    flex: 1,
    gap: primitive.space[1],
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  rolePill: {
    paddingHorizontal: primitive.space[2],
    paddingVertical: 2,
    borderRadius: primitive.radius.sm,
    backgroundColor: semantic.color.bgSubtle,
  },
  rolePillSeller: {
    backgroundColor: semantic.color.accentSoft,
  },
  rolePillText: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textSecondary,
  },
  rolePillTextSeller: {
    color: semantic.color.accent,
  },
  rowTitle: {
    ...semantic.type.cardTitle,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[1.5],
  },
  priceText: {
    ...semantic.type.price,
    fontSize: primitive.fontSize.base,
    color: semantic.color.accent,
  },
  priceFreeText: {
    color: semantic.color.freeFg,
  },
  listedPriceText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  dot: {
    ...semantic.type.micro,
  },
  metaText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  cueLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    marginTop: 2,
  },
  scheduleConfirmedText: {
    flex: 1,
    ...semantic.type.micro,
    color: semantic.color.freeFg,
    fontWeight: primitive.fontWeight.semibold,
  },
  schedulePendingText: {
    flex: 1,
    ...semantic.type.micro,
    color: semantic.color.warning,
    fontWeight: primitive.fontWeight.semibold,
  },
  actionNeededText: {
    flex: 1,
    ...semantic.type.micro,
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  chevronWrap: {
    paddingTop: primitive.space[1],
  },
  loadMoreWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
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
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
