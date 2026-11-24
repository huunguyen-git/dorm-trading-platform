import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { RestrictedAccountError } from '../api/client';
import { resolveUserRestriction, useSession } from '../auth/session';
import type { DiscoverySearchFilters } from '../listings/discoveryApi';
import { hasActiveDiscoveryFilters, useDiscovery } from '../listings/discoveryStore';
import { useListings } from '../listings/store';
import { normalizeListingSummary, type ListingSummary } from '../listings/types';
import { Action, Notice, ui } from '../components/AuthUI';
import { ListingCard } from '../components/ListingCard';
import { ListingFilterBar } from '../components/ListingFilterBar';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import { colors, radius, space, text } from '../theme';

const defaultLegacyLoad = useListings.getState().load;

export default function ListingsScreen() {
  const navigation = useNavigation<Nav>();
  const user = useSession((state) => state.user);
  const token = useSession((state) => state.token);
  const restriction = useSession((state) => state.restriction);
  const dismissed = useSession((state) => state.restrictionDismissed);
  const hasVisibleRestriction = Boolean(restriction ?? (dismissed ? null : resolveUserRestriction(user)));
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
        if (typeof RestrictedAccountError === 'function' && cause instanceof RestrictedAccountError) {
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

  const listHeader = (
    <View style={styles.header}>
      <Text style={ui.brand}>DORM TRADING</Text>
      <Text style={[text.title, { marginTop: space.xs }]}>Tin đăng</Text>
      <Text style={ui.caption}>
        Khám phá đồ dùng, giáo trình sinh viên đang sẵn sàng trao đổi tại ĐHQG-HCM.
      </Text>

      <View style={styles.actionsBar}>
        <Action
          secondary
          title="Đăng tin"
          disabled={!!token && !isMember}
          onPress={() => navigation.navigate(token ? 'CreateListing' : 'Login')}
        />
        {isMember ? (
          <Action
            secondary
            title="Tin của tôi"
            testID="nav-my-listings"
            onPress={() => navigation.navigate('MyListings')}
          />
        ) : null}
        <Action
          secondary
          title="Kho đồ"
          disabled={!!token && !isMember}
          onPress={() => navigation.navigate(token ? 'InventoryList' : 'Login')}
        />
        {token ? (
          <Action secondary title="Hồ sơ" onPress={() => navigation.navigate('Profile')} />
        ) : (
          <Action secondary title="Đăng nhập" onPress={() => navigation.navigate('Login')} />
        )}
      </View>

      {hasVisibleRestriction ? (
        <View style={{ marginBottom: space.sm }}>
          <RestrictedAccountNotice />
        </View>
      ) : null}

      {!!token && !isMember && user?.accountStatus !== 'BI_KHOA' ? (
        <Notice message="Tài khoản đang chờ hoàn tất xác minh hoặc duyệt hồ sơ. Bạn vẫn có thể xem các mặt hàng công khai." />
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
        <View style={styles.errorBlock} testID="listings-error-banner">
          <Notice message={effectiveError} error />
          <Action
            title="Thử lại"
            secondary
            testID="listings-retry-button"
            onPress={handleRetry}
          />
        </View>
      ) : null}

      {effectiveLoading && displayItems.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.brand} />
          <Text style={ui.caption}>Đang tải tin đăng…</Text>
        </View>
      ) : null}

      {!effectiveLoading && !effectiveError && (displayItems.length > 0 || filtersActive) ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText} testID="listings-result-count">
            Tìm thấy {shownTotal} tin đăng
          </Text>
        </View>
      ) : null}
    </View>
  );

  const listEmpty =
    !effectiveLoading && !effectiveError ? (
      filtersActive ? (
        <View style={styles.emptyCard} testID="filtered-empty-state">
          <Text style={styles.emptyTitle}>
            Không tìm thấy tin phù hợp. Thử nới lỏng bộ lọc.
          </Text>
          <Text style={ui.caption}>
            Bạn có thể đổi từ khóa, mở rộng mức giá hoặc đặt lại tất cả bộ lọc để xem toàn bộ tin
            mới nhất.
          </Text>
          <View style={{ marginTop: space.sm, width: '100%', maxWidth: 220 }}>
            <Action
              title="Xóa bộ lọc"
              secondary
              testID="empty-reset-filters-button"
              onPress={handleResetFilters}
            />
          </View>
        </View>
      ) : (
        <View style={ui.notice} testID="default-empty-state">
          <Text style={ui.label}>Chưa có tin đăng.</Text>
          <Text style={ui.caption}>Các mặt hàng đã được công khai sẽ xuất hiện tại đây.</Text>
        </View>
      )
    ) : null;

  const listFooter = hasMore ? (
    <View style={styles.footerContainer}>
      <Action
        title={loadingMore ? 'Đang tải thêm…' : `Tải thêm (${displayItems.length}/${shownTotal})`}
        secondary
        busy={loadingMore}
        testID="load-more-button"
        onPress={() => void loadMore()}
      />
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={displayItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        renderItem={({ item }) => <ListingCard listing={item} onPress={handleOpenListing} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f4ef',
  },
  listContent: {
    padding: space.lg,
    gap: space.md,
    flexGrow: 1,
  },
  header: {
    gap: space.sm,
    marginBottom: space.xs,
  },
  actionsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginVertical: space.xs,
  },
  errorBlock: {
    gap: space.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.xs,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  emptyCard: {
    padding: space.xl,
    borderRadius: radius.md,
    backgroundColor: '#f2ede4',
    alignItems: 'center',
    gap: space.sm,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  footerContainer: {
    paddingVertical: space.md,
  },
});
