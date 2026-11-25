import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav } from '../navigation';
import { RestrictedAccountError } from '../api/client';
import { resolveUserRestriction, useSession } from '../auth/session';
import {
  normalizeSearchTypeParam,
  type DiscoverySearchFilters,
} from '../listings/discoveryApi';
import { hasActiveDiscoveryFilters, useDiscovery } from '../listings/discoveryStore';
import { useListings } from '../listings/store';
import {
  formatVnd,
  normalizeListingSummary,
  type ListingSummary,
} from '../listings/types';
import { ListingCard } from '../components/ListingCard';
import { ListingFilterBar } from '../components/ListingFilterBar';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  BottomNavBar,
  EmptyState,
  HairlineDivider,
  Icon,
  InlineBanner,
  type BottomNavTab,
  type FilterLoosenSuggestion,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

const defaultLegacyLoad = useListings.getState().load;

export default function ListingsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useContext(SafeAreaInsetsContext);
  const user = useSession((state) => state.user);
  const token = useSession((state) => state.token);
  const restriction = useSession((state) => state.restriction);
  const dismissed = useSession((state) => state.restrictionDismissed);
  const hasVisibleRestriction = Boolean(
    restriction ?? (dismissed ? null : resolveUserRestriction(user)),
  );
  const isMember = Boolean(token && user?.roles.includes('MEMBER'));

  const legacyLoad = useListings((state) => state.load);
  const legacyListings = useListings((state) => state.listings);
  const legacyLoading = useListings((state) => state.loading);
  const isLegacyStubbed = legacyLoad !== defaultLegacyLoad;

  const {
    items,
    page,
    totalElements,
    totalPages,
    filters,
    categories,
    categoryTree,
    locations,
    loading,
    loadingMore,
    refreshing,
    error,
    loadReferences,
    search,
    loadMore,
    resetFilters,
  } = useDiscovery();

  const [legacyError, setLegacyError] = useState('');

  useEffect(() => {
    if (isLegacyStubbed) {
      void legacyLoad().catch((cause: Error) => {
        if (
          typeof RestrictedAccountError === 'function' &&
          cause instanceof RestrictedAccountError
        ) {
          if (!useSession.getState().restriction) {
            useSession.setState({ restriction: cause.restriction, restrictionDismissed: false });
          }
          return;
        }
        setLegacyError(cause.message);
      });
      return;
    }
    void loadReferences();
    void search(true);
  }, [isLegacyStubbed, legacyLoad, loadReferences, search]);

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') return;
    return navigation.addListener('focus', () => {
      if (isLegacyStubbed) return;
      const { stale, loading: isLoading } = useDiscovery.getState();
      if (stale && !isLoading) {
        void search({ resetPage: true });
      }
    });
  }, [navigation, isLegacyStubbed, search]);

  const displayItems = useMemo<ListingSummary[]>(() => {
    if (items.length > 0) return items;
    if (isLegacyStubbed && legacyListings.length > 0) {
      return legacyListings.map(normalizeListingSummary);
    }
    return items;
  }, [isLegacyStubbed, items, legacyListings]);

  const effectiveLoading = isLegacyStubbed ? legacyLoading : loading;
  const effectiveError = error || legacyError;
  const filtersActive = hasActiveDiscoveryFilters(filters);
  const hasMore = page + 1 < totalPages && displayItems.length > 0;
  const shownTotal = totalElements > 0 ? totalElements : displayItems.length;

  const handleApplyFilters = useCallback(
    (nextFilters: DiscoverySearchFilters) => {
      setLegacyError('');
      void search({ resetPage: true, filters: nextFilters });
    },
    [search],
  );

  const handleResetFilters = useCallback(() => {
    setLegacyError('');
    void resetFilters();
  }, [resetFilters]);

  const handleRefresh = useCallback(() => {
    setLegacyError('');
    if (isLegacyStubbed) {
      void legacyLoad().catch((e: Error) => setLegacyError(e.message));
      return;
    }
    void loadReferences(true);
    void search({ resetPage: true, refreshing: true });
  }, [isLegacyStubbed, legacyLoad, loadReferences, search]);

  const handleRetry = useCallback(() => {
    setLegacyError('');
    if (isLegacyStubbed) {
      void legacyLoad().catch((e: Error) => {
        if (typeof RestrictedAccountError === 'function' && e instanceof RestrictedAccountError) {
          if (!useSession.getState().restriction) {
            useSession.setState({ restriction: e.restriction, restrictionDismissed: false });
          }
          return;
        }
        setLegacyError(e.message);
      });
      return;
    }
    void loadReferences();
    void search(true);
  }, [isLegacyStubbed, legacyLoad, loadReferences, search]);

  const handleOpenListing = useCallback(
    (listing: ListingSummary) => {
      navigation.navigate('Listing', { id: listing.id, listing });
    },
    [navigation],
  );

  const handleBottomNavigate = useCallback(
    (route: BottomNavTab) => {
      if (route === 'CreateListing') {
        navigation.navigate('CreateListing');
      } else {
        navigation.navigate(route);
      }
    },
    [navigation],
  );

  const loosenSuggestions = useMemo<FilterLoosenSuggestion[]>(() => {
    if (!filtersActive) return [];
    const list: FilterLoosenSuggestion[] = [];

    if (filters.q?.trim()) {
      list.push({
        key: 'q',
        activeLabel: `"${filters.q.trim()}"`,
        actionLabel: 'Bỏ từ khóa tìm kiếm',
        onPress: () => handleApplyFilters({ ...filters, q: undefined, page: 0 }),
        testID: 'loosen-filter-q',
      });
    }

    if (filters.courseCode?.trim()) {
      list.push({
        key: 'courseCode',
        activeLabel: `Môn ${filters.courseCode.trim()}`,
        actionLabel: 'Bỏ lọc mã môn học',
        onPress: () => handleApplyFilters({ ...filters, courseCode: undefined, page: 0 }),
        testID: 'loosen-filter-courseCode',
      });
    }

    if (filters.freeOnly === true) {
      list.push({
        key: 'freeOnly',
        activeLabel: 'Chỉ tin miễn phí',
        actionLabel: 'Xem cả tin có giá bán',
        onPress: () => handleApplyFilters({ ...filters, freeOnly: undefined, page: 0 }),
        testID: 'loosen-filter-freeOnly',
      });
    } else if (typeof filters.maxPrice === 'number' && Number.isFinite(filters.maxPrice)) {
      list.push({
        key: 'maxPrice',
        activeLabel: `Tối đa ${formatVnd(filters.maxPrice)}`,
        actionLabel: 'Bỏ giới hạn mức giá',
        onPress: () => handleApplyFilters({ ...filters, maxPrice: undefined, page: 0 }),
        testID: 'loosen-filter-maxPrice',
      });
    }

    if (
      typeof filters.radiusKm === 'number' &&
      Number.isFinite(filters.radiusKm) &&
      filters.radiusKm > 0
    ) {
      list.push({
        key: 'radiusKm',
        activeLabel: `Trong ${filters.radiusKm} km`,
        actionLabel: 'Mở rộng khoảng cách',
        onPress: () => handleApplyFilters({ ...filters, radiusKm: undefined, page: 0 }),
        testID: 'loosen-filter-radiusKm',
      });
    }

    if (filters.locationCode?.trim() || filters.location?.trim()) {
      const zoneName =
        locations.find((z) => z.code === filters.locationCode)?.name ??
        filters.location?.trim() ??
        filters.locationCode ??
        'Khu vực';
      list.push({
        key: 'location',
        activeLabel: zoneName,
        actionLabel: 'Mở rộng ra toàn ĐHQG-HCM',
        onPress: () =>
          handleApplyFilters({
            ...filters,
            locationCode: undefined,
            location: undefined,
            lat: undefined,
            lng: undefined,
            radiusKm: undefined,
            sort: filters.sort === 'distance_asc' ? 'newest' : filters.sort,
            page: 0,
          }),
        testID: 'loosen-filter-location',
      });
    }

    if (filters.categoryId?.trim()) {
      const catName =
        categories.find((c) => c.id === filters.categoryId)?.name ?? filters.categoryId;
      list.push({
        key: 'categoryId',
        activeLabel: catName,
        actionLabel: 'Xem tất cả danh mục',
        onPress: () => handleApplyFilters({ ...filters, categoryId: undefined, page: 0 }),
        testID: 'loosen-filter-categoryId',
      });
    }

    const activeType = normalizeSearchTypeParam(filters.type);
    if (activeType) {
      const typeLabel =
        activeType === 'COMBO' ? 'Combo' : activeType === 'SINGLE' ? 'Tin đơn' : 'Cho tặng';
      list.push({
        key: 'type',
        activeLabel: typeLabel,
        actionLabel: 'Xem tất cả loại tin',
        onPress: () => handleApplyFilters({ ...filters, type: undefined, page: 0 }),
        testID: 'loosen-filter-type',
      });
    }

    return list.slice(0, 4);
  }, [categories, filters, filtersActive, handleApplyFilters, locations]);

  const showPendingNotice = Boolean(token && !isMember && user?.accountStatus !== 'BI_KHOA');
  const androidTopInset = Platform.OS === 'android' ? (insets?.top ?? 0) : 0;

  const listHeader = (
    <View style={styles.listHeader}>
      {hasVisibleRestriction || showPendingNotice ? (
        <View style={styles.noticesWrap}>
          {hasVisibleRestriction ? <RestrictedAccountNotice /> : null}
          {showPendingNotice ? (
            <InlineBanner
              tone="neutral"
              message="Tài khoản đang chờ hoàn tất xác minh hoặc duyệt hồ sơ. Bạn vẫn có thể xem các mặt hàng công khai."
            />
          ) : null}
        </View>
      ) : null}

      <ListingFilterBar
        filters={filters}
        categories={categories}
        categoryTree={categoryTree}
        locations={locations}
        loading={effectiveLoading}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />

      {effectiveError ? (
        <View style={styles.bannerWrap} testID="listings-error-banner">
          <InlineBanner
            tone="danger"
            message={effectiveError}
            actionLabel="Thử lại"
            onActionPress={handleRetry}
            actionTestID="listings-retry-button"
          />
        </View>
      ) : null}

      {effectiveLoading && displayItems.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={semantic.color.accent} />
          <Text style={styles.loadingText}>Đang tải tin đăng…</Text>
        </View>
      ) : null}

      {!effectiveLoading && !effectiveError && (displayItems.length > 0 || filtersActive) ? (
        <View style={styles.summaryBlock}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText} testID="listings-result-count">
              Tìm thấy {shownTotal} tin đăng
            </Text>
          </View>
          {displayItems.length > 0 ? <HairlineDivider /> : null}
        </View>
      ) : null}
    </View>
  );

  const listEmpty =
    !effectiveLoading && !effectiveError ? (
      filtersActive ? (
        <EmptyState
          testID="filtered-empty-state"
          icon="search"
          title="Không tìm thấy tin phù hợp. Thử nới lỏng bộ lọc."
          subtitle="Bỏ bớt một tiêu chí bên dưới hoặc đặt lại toàn bộ bộ lọc để xem thêm tin mới nhất."
          suggestions={loosenSuggestions}
          primaryActionLabel="Xóa bộ lọc"
          onPrimaryAction={handleResetFilters}
          primaryActionTestID="empty-reset-filters-button"
        />
      ) : (
        <EmptyState
          testID="default-empty-state"
          icon="inbox"
          title="Chưa có tin đăng."
          subtitle="Các mặt hàng sinh viên đã được công khai sẽ xuất hiện tại đây."
          primaryActionLabel={isMember ? 'Đăng tin đầu tiên' : undefined}
          onPrimaryAction={isMember ? () => navigation.navigate('CreateListing') : undefined}
          primaryActionTestID="empty-create-listing-button"
        />
      )
    ) : null;

  const listFooter = hasMore ? (
    <View style={styles.footerContainer}>
      <Pressable
        testID="load-more-button"
        disabled={loadingMore}
        onPress={() => void loadMore()}
        accessibilityRole="button"
        accessibilityLabel={
          loadingMore ? 'Đang tải thêm tin đăng' : `Tải thêm (${displayItems.length}/${shownTotal})`
        }
        accessibilityState={{ disabled: loadingMore, busy: loadingMore }}
        style={({ pressed }) => [
          styles.loadMoreBtn,
          loadingMore && styles.loadMoreBtnDisabled,
          pressed && !loadingMore && styles.loadMoreBtnPressed,
        ]}
      >
        {loadingMore ? <ActivityIndicator size="small" color={semantic.color.accent} /> : null}
        <Text style={styles.loadMoreText}>
          {loadingMore ? 'Đang tải thêm…' : `Tải thêm (${displayItems.length}/${shownTotal})`}
        </Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <SafeAreaView style={[styles.container, androidTopInset > 0 && { paddingTop: androidTopInset }]}>
      {/* Slim Editorial Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.brandGroup}>
          <Text style={styles.brandTitle} accessibilityRole="header">
            Chợ KTX
          </Text>
          <View style={styles.locationTag}>
            <Icon name="map-pin" size={12} color={semantic.color.accent} />
            <Text style={styles.locationSubtitle}>ĐHQG-HCM</Text>
          </View>
        </View>

        <Pressable
          testID="listings-refresh-button"
          onPress={handleRefresh}
          disabled={effectiveLoading || refreshing}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Làm mới danh sách tin đăng"
          style={({ pressed }) => [
            styles.refreshBtn,
            pressed && styles.refreshBtnPressed,
            (effectiveLoading || refreshing) && styles.refreshBtnDisabled,
          ]}
        >
          <Icon name="refresh-cw" size={17} color={semantic.color.textSecondary} />
        </Pressable>
      </View>

      <FlatList
        data={displayItems}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={semantic.color.accent}
            colors={[semantic.color.accent]}
          />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        renderItem={({ item }) => <ListingCard listing={item} onPress={handleOpenListing} />}
      />

      <BottomNavBar activeTab="Listings" onNavigate={handleBottomNavigate} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  topHeader: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: semantic.spacing.pageX,
    backgroundColor: semantic.color.bgSurface,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: primitive.space[2],
  },
  brandTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: primitive.fontWeight.bold,
    letterSpacing: -0.3,
    color: semantic.color.textPrimary,
  },
  locationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
  },
  locationSubtitle: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnPressed: {
    backgroundColor: semantic.color.bgSubtle,
  },
  refreshBtnDisabled: {
    opacity: primitive.opacity.disabled,
  },
  list: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: primitive.space[4],
  },
  listHeader: {
    backgroundColor: semantic.color.bgSurface,
  },
  noticesWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[2.5],
    gap: primitive.space[2],
  },
  bannerWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    paddingVertical: primitive.space[6],
    paddingHorizontal: semantic.spacing.pageX,
  },
  loadingText: {
    ...semantic.type.caption,
  },
  summaryBlock: {
    backgroundColor: semantic.color.bgSurface,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    paddingBottom: primitive.space[2],
  },
  summaryText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontWeight: primitive.fontWeight.semibold,
  },
  footerContainer: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
  },
  loadMoreBtn: {
    minHeight: component.button.minHeightSm,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    paddingHorizontal: component.button.paddingX,
  },
  loadMoreBtnPressed: {
    opacity: primitive.opacity.pressed,
  },
  loadMoreBtnDisabled: {
    opacity: primitive.opacity.disabled,
  },
  loadMoreText: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
});
