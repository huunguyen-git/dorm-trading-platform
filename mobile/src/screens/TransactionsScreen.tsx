import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav, RootStack } from '../navigation';
import { buildMediaImageSource } from '../api/client';
import { resolveUserRestriction, useSession } from '../auth/session';
import { formatVnd } from '../listings/types';
import { useTransactions } from '../transactions/store';
import {
  formatRelativeTime,
  formatTransactionDateTime,
  TRANSACTION_STATUS_META,
  type TransactionListStatusFilter,
  type TransactionRoleFilter,
  type TransactionSummary,
  type TransactionViewerRole,
} from '../transactions/types';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  EmptyState,
  HairlineDivider,
  Icon,
  InlineBanner,
  SegmentedControl,
  StatusIndicator,
  TransactionListSkeleton,
  UnderlineTabs,
  type SegmentedOption,
  type StatusTone,
  type UnderlineTabItem,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

const ROLE_OPTIONS: SegmentedOption<TransactionRoleFilter>[] = [
  { value: 'ALL', label: 'Tất cả', testID: 'tx-role-ALL' },
  { value: 'SELLER', label: 'Đơn bán', testID: 'tx-role-SELLER' },
  { value: 'BUYER', label: 'Đơn mua', testID: 'tx-role-BUYER' },
];

function getRoleBadgeMeta(viewerRole: TransactionViewerRole): { label: string; tone: StatusTone } {
  if (viewerRole === 'SELLER') return { label: 'Đơn bán', tone: 'accent' };
  if (viewerRole === 'BUYER') return { label: 'Đơn mua', tone: 'neutral' };
  if (viewerRole === 'SENIOR_ADMIN') return { label: 'Quản trị', tone: 'warning' };
  return { label: 'Kiểm duyệt', tone: 'warning' };
}

function getUrgentActionCue(item: TransactionSummary): string | null {
  if (item.hasPendingCancelRequest) {
    if (item.viewerRole === 'SELLER') {
      return item.needsViewerAction
        ? 'Có yêu cầu hủy chờ bạn phản hồi'
        : 'Đã gửi yêu cầu hủy · Chờ phản hồi';
    }
    return 'Có yêu cầu hủy đang chờ xác nhận';
  }
  if (item.status === 'DANG_GIAO' && item.viewerRole === 'SELLER') {
    return 'Chụp ảnh bàn giao & báo đã giao';
  }
  if (item.status === 'CHO_XAC_NHAN') {
    if (item.viewerRole === 'BUYER') {
      return 'Kiểm tra ảnh & xác nhận nhận hàng';
    }
    if (item.viewerRole === 'SELLER') {
      return 'Đã báo giao · Chờ người mua xác nhận';
    }
    return 'Chờ người mua xác nhận';
  }
  if (item.status === 'CHO_XU_LY') {
    return item.escalationReason === 'OVERDUE_24H'
      ? 'Quá 24 giờ · Chờ kiểm duyệt'
      : 'Chưa thống nhất hủy · Chờ kiểm duyệt';
  }
  return null;
}

function matchesClientSearch(item: TransactionSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystacks = [
    item.listingTitle,
    item.counterparty.displayName,
    item.appointmentLocation ?? '',
  ];
  return haystacks.some((value) => value.toLowerCase().includes(needle));
}

export default function TransactionsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStack, 'Transactions'>>();
  const insets = useContext(SafeAreaInsetsContext);

  const token = useSession((state) => state.token);
  const user = useSession((state) => state.user);
  const restriction = useSession((state) => state.restriction);
  const restrictionDismissed = useSession((state) => state.restrictionDismissed);

  const visibleRestriction =
    restriction ?? (restrictionDismissed ? null : resolveUserRestriction(user));
  const isLocked = Boolean(visibleRestriction) || user?.accountStatus === 'BI_KHOA';
  const isStaff = Boolean(
    user?.roles.includes('MODERATOR') || user?.roles.includes('SENIOR_ADMIN'),
  );
  const isPendingAccount = Boolean(
    token && !isLocked && !user?.roles.includes('MEMBER') && !isStaff,
  );
  // Per NFR-01 & P1-05: BI_KHOA accounts can still view existing own transactions read-only
  const canViewList = Boolean(token && (user?.roles.includes('MEMBER') || isStaff || isLocked));

  const {
    items,
    pendingActionCount,
    counts,
    page,
    totalPages,
    roleFilter,
    statusFilter,
    searchQuery,
    loading,
    error,
    loadTransactions,
    clearError,
  } = useTransactions();

  const [searchDraft, setSearchDraft] = useState(searchQuery);
  const initialAppliedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roleRef = useRef<TransactionRoleFilter>(roleFilter);
  const statusRef = useRef<TransactionListStatusFilter>(statusFilter);
  const queryRef = useRef<string>(searchQuery);
  roleRef.current = roleFilter;
  statusRef.current = statusFilter;
  queryRef.current = searchQuery;

  const topPad = (insets?.top ?? 0) + primitive.space[3];

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!canViewList) return;
      clearError();
      const targetRole =
        !initialAppliedRef.current && route.params?.initialRole
          ? route.params.initialRole
          : roleRef.current;
      const targetStatus =
        !initialAppliedRef.current && route.params?.initialStatus !== undefined
          ? route.params.initialStatus
          : statusRef.current;
      initialAppliedRef.current = true;
      void loadTransactions({
        role: targetRole,
        status: targetStatus,
        q: queryRef.current,
        page: 0,
      }).catch(() => {});
    }, [canViewList, clearError, loadTransactions, route.params?.initialRole, route.params?.initialStatus]),
  );

  const statusTabs = useMemo<UnderlineTabItem<TransactionListStatusFilter>[]>(() => {
    const fallbackActionCount = pendingActionCount > 0 ? pendingActionCount : undefined;
    return [
      { value: '', label: 'Tất cả', count: counts?.all, testID: 'tx-status-ALL' },
      {
        value: 'ACTION_REQUIRED',
        label: 'Cần xử lý',
        count: counts ? counts.actionRequired : fallbackActionCount,
        testID: 'tx-status-ACTION_REQUIRED',
      },
      { value: 'DANG_GIAO', label: 'Đang giao', count: counts?.dangGiao, testID: 'tx-status-DANG_GIAO' },
      {
        value: 'CHO_XAC_NHAN',
        label: 'Chờ xác nhận',
        count: counts?.choXacNhan,
        testID: 'tx-status-CHO_XAC_NHAN',
      },
      {
        value: 'CHO_XU_LY',
        label: 'Chờ kiểm duyệt',
        count: counts?.choXuLy,
        testID: 'tx-status-CHO_XU_LY',
      },
      { value: 'HOAN_TAT', label: 'Hoàn tất', count: counts?.hoanTat, testID: 'tx-status-HOAN_TAT' },
      { value: 'HUY', label: 'Đã hủy', count: counts?.huy, testID: 'tx-status-HUY' },
    ];
  }, [counts, pendingActionCount]);

  // Client-side fallback filter ensures instant response even when mock/offline payload ignores `q`
  const visibleItems = useMemo(() => {
    const trimmed = searchDraft.trim();
    if (!trimmed) return items;
    return items.filter((item) => matchesClientSearch(item, trimmed));
  }, [items, searchDraft]);

  const handleBack = () => {
    if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Profile');
  };

  const triggerLoad = useCallback(
    (overrides: {
      role?: TransactionRoleFilter;
      status?: TransactionListStatusFilter;
      q?: string;
      page?: number;
    }) => {
      clearError();
      void loadTransactions({
        role: overrides.role ?? roleRef.current,
        status: overrides.status !== undefined ? overrides.status : statusRef.current,
        q: overrides.q !== undefined ? overrides.q : searchDraft,
        page: overrides.page ?? 0,
      }).catch(() => {});
    },
    [clearError, loadTransactions, searchDraft],
  );

  const handleRoleChange = (nextRole: TransactionRoleFilter) => {
    triggerLoad({ role: nextRole, page: 0 });
  };

  const handleStatusChange = (nextStatus: TransactionListStatusFilter) => {
    triggerLoad({ status: nextStatus, page: 0 });
  };

  const handleSearchChange = (text: string) => {
    setSearchDraft(text);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      triggerLoad({ q: text, page: 0 });
    }, 300);
  };

  const handleSearchSubmit = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    triggerLoad({ q: searchDraft, page: 0 });
  };

  const handleClearSearch = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setSearchDraft('');
    triggerLoad({ q: '', page: 0 });
  };

  const handleRefresh = () => {
    if (!canViewList) return;
    triggerLoad({ page: 0 });
  };

  const handleLoadMore = () => {
    if (!canViewList || loading || page + 1 >= totalPages) return;
    triggerLoad({ page: page + 1 });
  };

  if (!token) {
    return (
      <View style={styles.screen} testID="transactions-screen">
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <Pressable
            testID="transactions-back-btn"
            onPress={handleBack}
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
        </View>
        <HairlineDivider />
        <View style={styles.gatedBody}>
          <EmptyState
            icon="log-in"
            title="Đăng nhập để theo dõi giao dịch"
            subtitle="Đăng nhập bằng tài khoản sinh viên để bàn giao, xác nhận nhận hàng và quản lý đơn."
            primaryActionLabel="Đăng nhập"
            primaryActionTestID="transactions-login-btn"
            onPrimaryAction={() => navigation.navigate('Login')}
          />
        </View>
      </View>
    );
  }

  if (isPendingAccount) {
    return (
      <View style={styles.screen} testID="transactions-screen">
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <Pressable
            testID="transactions-back-btn"
            onPress={handleBack}
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
        </View>
        <HairlineDivider />
        <View style={styles.gatedBody}>
          <EmptyState
            icon="shield"
            title="Tài khoản chưa kích hoạt"
            subtitle="Hoàn tất xác minh email và chờ duyệt hồ sơ để bắt đầu giao dịch trên sàn."
            primaryActionLabel="Về hồ sơ"
            onPrimaryAction={() => navigation.navigate('Profile')}
          />
        </View>
      </View>
    );
  }

  const hasActiveSearch = Boolean(searchDraft.trim());
  const isInitialSkeleton = loading && items.length === 0;
  const headerActionCount = counts ? counts.actionRequired : pendingActionCount;

  return (
    <View style={styles.screen} testID="transactions-screen">
      {/* Flat SafeArea Header (320px-safe flexShrink title) */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <Pressable
          testID="transactions-back-btn"
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Icon name="chevron-left" size={22} color={semantic.color.textPrimary} />
        </Pressable>

        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.screenTitle} numberOfLines={1}>
            Giao dịch của tôi
          </Text>
          {headerActionCount > 0 ? (
            <StatusIndicator
              testID="transactions-pending-badge"
              variant="urgent"
              tone="accent"
              label={`${headerActionCount} cần xử lý`}
            />
          ) : null}
        </View>
      </View>

      {/* Inline Editorial Search Bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Icon name="search" size={16} color={semantic.color.textSecondary} />
          <TextInput
            testID="transactions-search-input"
            value={searchDraft}
            onChangeText={handleSearchChange}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            placeholder="Tìm theo tên món hoặc người giao dịch…"
            placeholderTextColor={semantic.color.textSecondary}
            accessibilityLabel="Tìm giao dịch theo tên món hoặc người giao dịch"
            style={styles.searchInput}
          />
          {hasActiveSearch ? (
            <Pressable
              testID="transactions-search-clear"
              onPress={handleClearSearch}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Xóa từ khóa tìm kiếm"
              style={({ pressed }) => [styles.searchClearBtn, pressed && styles.pressed]}
            >
              <Icon name="x" size={14} color={semantic.color.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Role SegmentedControl */}
      <View style={styles.roleFilterWrap}>
        <SegmentedControl
          testID="transactions-role-filter"
          accessibilityLabel="Lọc theo vai trò giao dịch"
          options={ROLE_OPTIONS}
          value={roleFilter}
          onChange={handleRoleChange}
        />
      </View>

      {/* Status UnderlineTabs with Live Per-Tab Counts */}
      <UnderlineTabs
        testID="transactions-status-tabs"
        accessibilityLabel="Lọc theo trạng thái giao dịch"
        items={statusTabs}
        value={statusFilter}
        onChange={handleStatusChange}
      />

      {visibleRestriction || error ? (
        <View style={styles.alertsWrap}>
          {visibleRestriction ? <RestrictedAccountNotice /> : null}
          {error ? (
            <InlineBanner
              tone="danger"
              message={error}
              actionLabel="Thử lại"
              onActionPress={handleRefresh}
            />
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={loading && items.length > 0}
            onRefresh={handleRefresh}
            tintColor={semantic.color.accent}
            colors={[semantic.color.accent]}
          />
        }
        ItemSeparatorComponent={() => <HairlineDivider insetLeft={semantic.spacing.pageX} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          isInitialSkeleton ? (
            <TransactionListSkeleton testID="transactions-loading-skeleton" />
          ) : (
            <EmptyState
              testID="transactions-empty"
              icon={hasActiveSearch ? 'search' : 'shopping-bag'}
              title={hasActiveSearch ? 'Không tìm thấy giao dịch phù hợp' : 'Chưa có giao dịch nào'}
              subtitle={
                hasActiveSearch
                  ? `Không có giao dịch khớp với “${searchDraft.trim()}”. Thử từ khóa ngắn hơn hoặc bỏ bộ lọc.`
                  : statusFilter
                    ? 'Không tìm thấy giao dịch ở trạng thái này. Hãy thử chuyển sang mục Tất cả.'
                    : 'Các giao dịch mua, bán và cho tặng đồ dùng KTX sẽ hiển thị tại đây.'
              }
              primaryActionLabel={
                hasActiveSearch
                  ? 'Xóa từ khóa tìm kiếm'
                  : statusFilter
                    ? 'Xem tất cả giao dịch'
                    : 'Khám phá đồ dùng'
              }
              primaryActionTestID="transactions-empty-cta"
              onPrimaryAction={() => {
                if (hasActiveSearch) {
                  handleClearSearch();
                } else if (statusFilter) {
                  handleStatusChange('');
                } else {
                  navigation.navigate('Listings');
                }
              }}
            />
          )
        }
        ListFooterComponent={
          page + 1 < totalPages ? (
            <View style={styles.loadMoreWrap}>
              <Pressable
                testID="transactions-load-more"
                disabled={loading}
                onPress={handleLoadMore}
                accessibilityRole="button"
                accessibilityLabel="Tải thêm giao dịch"
                style={({ pressed }) => [
                  styles.loadMoreBtn,
                  loading && styles.disabled,
                  pressed && !loading && styles.pressed,
                ]}
              >
                <Text style={styles.loadMoreText}>
                  {loading ? 'Đang tải…' : 'Tải thêm giao dịch'}
                </Text>
              </Pressable>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => {
          const statusMeta = TRANSACTION_STATUS_META[item.status] ?? TRANSACTION_STATUS_META.GIU_CHO;
          const roleMeta = getRoleBadgeMeta(item.viewerRole);
          const isSeller = item.viewerRole === 'SELLER';
          const isBuyer = item.viewerRole === 'BUYER';
          const isFree = item.isFree || item.agreedPriceVnd === 0;
          const urgentCue = getUrgentActionCue(item);
          const isActiveStatus =
            item.status === 'YEU_CAU' ||
            item.status === 'GIU_CHO' ||
            item.status === 'DANG_GIAO' ||
            item.status === 'CHO_XAC_NHAN' ||
            item.status === 'CHO_XU_LY';
          const appointmentText = formatTransactionDateTime(item.appointmentAt);
          const relativeUpdated = formatRelativeTime(item.updatedAt);
          const counterpartyPrefix = isSeller ? 'Mua:' : isBuyer ? 'Bán:' : 'Đối tác:';

          return (
            <Pressable
              testID={`transaction-row-${item.id}`}
              onPress={() => navigation.navigate('TransactionDetail', { id: item.id })}
              accessibilityRole="button"
              accessibilityLabel={`Mở giao dịch ${item.listingTitle}`}
              style={({ pressed }) => [
                styles.row,
                item.needsViewerAction && styles.rowUrgent,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.rowTop}>
                {item.listingThumbnailUrl ? (
                  <Image
                    source={buildMediaImageSource(item.listingThumbnailUrl, null)}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Icon name="package" size={20} color={semantic.color.textSecondary} />
                  </View>
                )}

                <View style={styles.rowBody}>
                  <View style={styles.badgesRow}>
                    <StatusIndicator
                      variant="soft"
                      tone={roleMeta.tone}
                      label={roleMeta.label}
                    />
                    <StatusIndicator
                      testID={`transaction-status-${item.id}`}
                      variant={statusMeta.variant}
                      tone={statusMeta.tone}
                      label={statusMeta.shortLabel}
                    />
                    {item.isCombo ? (
                      <StatusIndicator
                        testID={`transaction-combo-${item.id}`}
                        variant="soft"
                        tone="neutral"
                        label={`Combo · ${item.itemCount} món`}
                      />
                    ) : null}
                  </View>

                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {item.listingTitle}
                  </Text>

                  <View style={styles.priceMetaRow}>
                    {isFree ? (
                      <View style={styles.freePricePill}>
                        <Text style={styles.priceFree}>{formatVnd(item.agreedPriceVnd)}</Text>
                      </View>
                    ) : (
                      <Text style={styles.priceText}>{formatVnd(item.agreedPriceVnd)}</Text>
                    )}
                    <Text style={styles.dotSep}>·</Text>
                    <Text style={styles.counterpartyText} numberOfLines={1}>
                      {counterpartyPrefix} {item.counterparty.displayName}
                    </Text>
                  </View>

                  <View style={styles.metaFooterRow}>
                    {isActiveStatus && (item.appointmentLocation || appointmentText) ? (
                      <View style={styles.metaSpotGroup}>
                        <Icon name="map-pin" size={11} color={semantic.color.textSecondary} />
                        <Text style={styles.metaText} numberOfLines={1}>
                          {[item.appointmentLocation, appointmentText].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    ) : null}

                    {relativeUpdated ? (
                      <Text style={styles.relativeTimeText} numberOfLines={1}>
                        {relativeUpdated}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <Icon name="chevron-right" size={18} color={semantic.color.textSecondary} />
              </View>

              {urgentCue ? (
                <View
                  style={[
                    styles.cueStrip,
                    item.needsViewerAction && styles.cueStripUrgent,
                  ]}
                  testID={`transaction-cue-${item.id}`}
                >
                  <Icon
                    name={item.hasPendingCancelRequest ? 'alert-triangle' : 'clock'}
                    size={13}
                    color={
                      item.needsViewerAction ? semantic.color.accent : semantic.color.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.cueText,
                      item.needsViewerAction && styles.cueTextUrgent,
                    ]}
                    numberOfLines={1}
                  >
                    {urgentCue}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[2.5],
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
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  screenTitle: {
    ...semantic.type.screenTitle,
    flexShrink: 1,
  },
  searchWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[2.5],
    backgroundColor: semantic.color.bgSurface,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    minHeight: 42,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    paddingHorizontal: primitive.space[3],
  },
  searchInput: {
    flex: 1,
    fontSize: primitive.fontSize.sm,
    color: semantic.color.textPrimary,
    paddingVertical: primitive.space[2],
  },
  searchClearBtn: {
    width: 24,
    height: 24,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleFilterWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[2],
    backgroundColor: semantic.color.bgSurface,
  },
  alertsWrap: {
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
  listContent: {
    flexGrow: 1,
    paddingBottom: primitive.space[6],
    backgroundColor: semantic.color.bgSurface,
  },
  row: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[3],
    backgroundColor: semantic.color.bgSurface,
    gap: primitive.space[2.5],
  },
  rowUrgent: {
    backgroundColor: semantic.color.bgWarmTint,
    borderLeftWidth: 3,
    borderLeftColor: semantic.color.accent,
    paddingLeft: semantic.spacing.pageX - 3,
  },
  rowPressed: {
    backgroundColor: semantic.color.bgSubtle,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgTrack,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  thumbPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[1.5],
  },
  rowTitle: {
    ...semantic.type.cardTitle,
  },
  priceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  priceText: {
    ...semantic.type.label,
    fontVariant: ['tabular-nums'],
    color: semantic.color.accent,
  },
  freePricePill: {
    paddingHorizontal: primitive.space[2],
    paddingVertical: 1,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.freeBg,
  },
  priceFree: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.freeFg,
  },
  dotSep: {
    ...semantic.type.micro,
  },
  counterpartyText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    flex: 1,
  },
  metaFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  metaSpotGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  metaText: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  relativeTimeText: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  cueStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1.5],
  },
  cueStripUrgent: {
    backgroundColor: semantic.color.accentSoft,
  },
  cueText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    flex: 1,
  },
  cueTextUrgent: {
    color: semantic.color.accentDeep,
    fontWeight: primitive.fontWeight.semibold,
  },
  loadMoreWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
  },
  loadMoreBtn: {
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
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
