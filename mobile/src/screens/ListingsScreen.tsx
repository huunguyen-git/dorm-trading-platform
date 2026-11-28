import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav } from '../navigation';
import { buildMediaImageSource, RestrictedAccountError } from '../api/client';
import { resolveUserRestriction, useSession } from '../auth/session';
import {
  normalizeSearchTypeParam,
  type DiscoverySearchFilters,
} from '../listings/discoveryApi';
import {
  countActiveDiscoveryFilters,
  hasActiveDiscoveryFilters,
  useDiscovery,
} from '../listings/discoveryStore';
import { useListings } from '../listings/store';
import {
  formatVnd,
  normalizeListingSummary,
  type ListingSummary,
  type LocationZone,
  type LocationZoneGroup,
} from '../listings/types';
import { ListingCard, type ListingCardVariant } from '../components/ListingCard';
import { ListingFilterBar } from '../components/ListingFilterBar';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  BottomNavBar,
  BottomSheet,
  EmptyState,
  HairlineDivider,
  Icon,
  InlineBanner,
  type AppIconName,
  type BottomNavTab,
  type FilterLoosenSuggestion,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

const defaultLegacyLoad = useListings.getState().load;

interface HeroSlide {
  key: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  icon: AppIconName;
  bgColor: string;
  ringColor: string;
  action: 'textbooks' | 'free' | 'combo';
}

const HERO_SLIDES: HeroSlide[] = [
  {
    key: 'textbooks',
    eyebrow: 'HỌC TẬP ĐHQG-HCM',
    title: 'Tìm nhanh giáo trình theo mã môn',
    subtitle: 'Sách in rõ nét từ anh chị khóa trên tại UIT, Bách Khoa, KHTN & UEL.',
    ctaLabel: 'Xem giáo trình',
    icon: 'book-open',
    bgColor: semantic.color.heroEspresso,
    ringColor: semantic.color.heroEspressoAccent,
    action: 'textbooks',
  },
  {
    key: 'free',
    eyebrow: 'CỘNG ĐỒNG KÝ TÚC XÁ',
    title: 'Góc sẻ chia 0 đồng cho sinh viên',
    subtitle: 'Nhận sách vở, đèn học và đồ dùng phòng trọ miễn phí ngay trong làng Đại học.',
    ctaLabel: 'Khám phá 0đ',
    icon: 'gift',
    bgColor: semantic.color.heroEmerald,
    ringColor: 'rgba(255, 255, 255, 0.14)',
    action: 'free',
  },
  {
    key: 'combo',
    eyebrow: 'TIẾT KIỆM PHÒNG TRỌ',
    title: 'Combo nguyên bộ, giao ngay tại sảnh',
    subtitle: 'Mua trọn bộ đồ học tập và thiết bị phòng trọ đồng bộ với mức giá sinh viên.',
    ctaLabel: 'Xem bộ Combo',
    icon: 'layers',
    bgColor: semantic.color.heroTerracotta,
    ringColor: 'rgba(255, 255, 255, 0.16)',
    action: 'combo',
  },
];

const ZONE_GROUP_TITLES: Record<LocationZoneGroup, string> = {
  KTX: 'Ký túc xá ĐHQG-HCM',
  TRUONG: 'Trường thành viên',
  LAN_CAN: 'Khu vực lân cận',
};

const ZONE_GROUP_ORDER: LocationZoneGroup[] = ['KTX', 'TRUONG', 'LAN_CAN'];

function shortZoneLabel(zone: LocationZone | null): string {
  if (!zone) return 'Toàn ĐHQG-HCM';
  if (zone.code === 'KTX_KHU_A') return 'KTX Khu A';
  if (zone.code === 'KTX_KHU_B') return 'KTX Khu B';
  if (zone.code === 'UIT') return 'ĐH CNTT (UIT)';
  if (zone.code === 'BACH_KHOA_CS2') return 'Bách Khoa CS2';
  if (zone.code === 'KHTN') return 'ĐH KHTN';
  if (zone.code === 'KHXH_NV') return 'ĐH KHXH & NV';
  if (zone.code === 'UEL') return 'ĐH KT-Luật';
  if (zone.code === 'IU') return 'ĐH Quốc tế';
  if (zone.code === 'NVH_SV') return 'NVH Sinh viên';
  return zone.name;
}

export default function ListingsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useContext(SafeAreaInsetsContext);
  const { width: windowWidth } = useWindowDimensions();
  const heroCardWidth = Math.max((windowWidth || 375) - semantic.spacing.pageX * 2, 280);

  const user = useSession((state) => state.user);
  const token = useSession((state) => state.token);
  const restriction = useSession((state) => state.restriction);
  const dismissed = useSession((state) => state.restrictionDismissed);
  const hasVisibleRestriction = Boolean(
    restriction ?? (dismissed ? null : resolveUserRestriction(user)),
  );
  const isMember = Boolean(token && user?.roles.includes('MEMBER'));
  const inboxDisabled = Boolean(token && !isMember);

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
  const [viewMode, setViewMode] = useState<ListingCardVariant>('grid');
  const [heroIndex, setHeroIndex] = useState(0);
  const [zoneSheetOpen, setZoneSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState(filters.q ?? '');
  const prevFilterQRef = useRef<string | undefined>(filters.q);
  const heroScrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);

  useEffect(() => {
    if (filters.q !== prevFilterQRef.current) {
      prevFilterQRef.current = filters.q;
      setSearchText(filters.q ?? '');
    }
  }, [filters.q]);

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
  const activeFilterCount = useMemo(() => countActiveDiscoveryFilters(filters), [filters]);
  const filtersActive = hasActiveDiscoveryFilters(filters);
  const hasMore = page + 1 < totalPages && displayItems.length > 0;
  const shownTotal = totalElements > 0 ? totalElements : displayItems.length;

  const heroMetaByAction = useMemo(() => {
    const textbooks = displayItems.filter(
      (item) =>
        Boolean(item.courseCode) ||
        item.categoryId === 'GIAO_TRINH' ||
        item.categoryId?.startsWith('GT_'),
    );
    const freeItems = displayItems.filter((item) => item.isFree || item.priceVnd === 0);
    const comboItems = displayItems.filter((item) => item.isCombo);
    const firstThumb = (list: ListingSummary[]) =>
      list.find((entry) => entry.thumbnailUrl || entry.images[0])?.thumbnailUrl ??
      list.find((entry) => entry.images[0])?.images[0] ??
      null;
    return {
      textbooks: { count: textbooks.length, thumb: firstThumb(textbooks) },
      free: { count: freeItems.length, thumb: firstThumb(freeItems) },
      combo: { count: comboItems.length, thumb: firstThumb(comboItems) },
    };
  }, [displayItems]);

  const activeZone = useMemo(
    () => locations.find((z) => z.code === filters.locationCode) ?? null,
    [locations, filters.locationCode],
  );

  const groupedLocations = useMemo(() => {
    const map = new Map<LocationZoneGroup, LocationZone[]>();
    ZONE_GROUP_ORDER.forEach((group) => map.set(group, []));
    locations.forEach((zone) => {
      const bucket = map.get(zone.group) ?? [];
      bucket.push(zone);
      map.set(zone.group, bucket);
    });
    return ZONE_GROUP_ORDER.map((group) => ({
      group,
      title: ZONE_GROUP_TITLES[group],
      zones: map.get(group) ?? [],
    })).filter((entry) => entry.zones.length > 0);
  }, [locations]);

  // Curated horizontal spotlight picks — shown ONLY on populated unfiltered home (>= 4 items)
  // so small test lists (1–2 items) never duplicate text nodes.
  const spotlightItems = useMemo<ListingSummary[]>(() => {
    if (filtersActive || displayItems.length < 4) return [];
    const prioritized = [...displayItems].sort((a, b) => {
      const scoreA =
        (a.isFree ? 3 : 0) +
        (a.isCombo ? 2 : 0) +
        (a.seller.reputationScore >= 120 ? 2 : 0) +
        (a.images.length > 1 ? 1 : 0);
      const scoreB =
        (b.isFree ? 3 : 0) +
        (b.isCombo ? 2 : 0) +
        (b.seller.reputationScore >= 120 ? 2 : 0) +
        (b.images.length > 1 ? 1 : 0);
      return scoreB - scoreA;
    });
    return prioritized.slice(0, 6);
  }, [displayItems, filtersActive]);

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

  const handleHeroAction = useCallback(
    (action: HeroSlide['action']) => {
      if (action === 'textbooks') {
        handleApplyFilters({ ...filters, categoryId: 'GIAO_TRINH', page: 0 });
      } else if (action === 'free') {
        handleApplyFilters({
          ...filters,
          freeOnly: true,
          maxPrice: undefined,
          minPrice: undefined,
          page: 0,
        });
      } else {
        handleApplyFilters({ ...filters, type: 'COMBO', page: 0 });
      }
    },
    [filters, handleApplyFilters],
  );

  const handleHeroScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const slideStep = heroCardWidth + primitive.space[3];
      if (slideStep <= 0) return;
      const offsetX = event.nativeEvent.contentOffset.x;
      const idx = Math.max(0, Math.min(HERO_SLIDES.length - 1, Math.round(offsetX / slideStep)));
      setHeroIndex(idx);
    },
    [heroCardWidth],
  );

  const handleStickySearchSubmit = useCallback(() => {
    setLegacyError('');
    handleApplyFilters({
      ...filters,
      q: searchText.trim() || undefined,
      page: 0,
    });
  }, [filters, handleApplyFilters, searchText]);

  const handleClearStickySearch = useCallback(() => {
    setSearchText('');
    if (filters.q) {
      handleApplyFilters({
        ...filters,
        q: undefined,
        page: 0,
      });
    }
  }, [filters, handleApplyFilters]);

  const handleQuickZoneSelect = useCallback(
    (zone: LocationZone | null) => {
      setZoneSheetOpen(false);
      if (!zone) {
        handleApplyFilters({
          ...filters,
          q: searchText.trim() || undefined,
          locationCode: undefined,
          location: undefined,
          lat: undefined,
          lng: undefined,
          radiusKm: undefined,
          sort: filters.sort === 'distance_asc' ? 'newest' : filters.sort,
          page: 0,
        });
        return;
      }
      handleApplyFilters({
        ...filters,
        q: searchText.trim() || undefined,
        locationCode: zone.code,
        lat: zone.latitude,
        lng: zone.longitude,
        page: 0,
      });
    },
    [filters, handleApplyFilters, searchText],
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
  const showDiscoveryShowcase = !filtersActive && !effectiveError && displayItems.length >= 4;

  const listHeader = (
    <View style={styles.listHeader}>
      <ListingFilterBar
        filters={filters}
        categories={categories}
        categoryTree={categoryTree}
        locations={locations}
        loading={effectiveLoading}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        sheetOpen={filterSheetOpen}
        onSheetOpenChange={setFilterSheetOpen}
        hideSearchDock
        onRequestZonePicker={() => setZoneSheetOpen(true)}
      />

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

      {/* Hero Campus Discovery Banner Carousel (FR-06 filters with live photo preview) */}
      {showDiscoveryShowcase ? (
        <View style={styles.heroSection} testID="discovery-hero-carousel">
          <ScrollView
            ref={heroScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={heroCardWidth + primitive.space[3]}
            snapToAlignment="start"
            onMomentumScrollEnd={handleHeroScrollEnd}
            contentContainerStyle={styles.heroScrollContent}
          >
            {HERO_SLIDES.map((slide) => {
              const meta = heroMetaByAction[slide.action];
              const countCaption =
                meta.count > 0
                  ? slide.action === 'textbooks'
                    ? `${meta.count} giáo trình`
                    : slide.action === 'free'
                      ? `${meta.count} món 0đ`
                      : `${meta.count} bộ combo`
                  : null;
              return (
                <Pressable
                  key={slide.key}
                  testID={`hero-slide-${slide.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${slide.title}. ${slide.ctaLabel}`}
                  onPress={() => handleHeroAction(slide.action)}
                  style={({ pressed }) => [
                    styles.heroCard,
                    { width: heroCardWidth, backgroundColor: slide.bgColor },
                    pressed && styles.heroCardPressed,
                  ]}
                >
                  {/* Decorative soft tonal rings */}
                  <View style={[styles.heroDecorCircleLg, { backgroundColor: slide.ringColor }]} />
                  <View style={[styles.heroDecorCircleSm, { backgroundColor: slide.ringColor }]} />

                  <View style={styles.heroCardInner}>
                    <View style={styles.heroTextCol}>
                      <View style={styles.heroEyebrowRow}>
                        <Text style={styles.heroEyebrow}>{slide.eyebrow}</Text>
                        {countCaption ? (
                          <View style={styles.heroLivePill}>
                            <Text style={styles.heroLivePillText}>{countCaption}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.heroTitle} numberOfLines={2}>
                        {slide.title}
                      </Text>
                      <Text style={styles.heroSubtitle} numberOfLines={1}>
                        {slide.subtitle}
                      </Text>
                      <View style={styles.heroCtaPill}>
                        <Text style={styles.heroCtaText}>{slide.ctaLabel}</Text>
                        <Icon name="arrow-right" size={13} color={semantic.color.textPrimary} />
                      </View>
                    </View>

                    {meta.thumb ? (
                      <View style={styles.heroPhotoFrame}>
                        <Image
                          source={buildMediaImageSource(meta.thumb, null)}
                          style={styles.heroPhoto}
                          resizeMode="cover"
                        />
                        <View style={styles.heroPhotoIconChip}>
                          <Icon name={slide.icon} size={12} color={semantic.color.textInverse} />
                        </View>
                      </View>
                    ) : (
                      <View style={styles.heroIconBadge}>
                        <Icon name={slide.icon} size={26} color={semantic.color.textInverse} />
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.heroDotsRow}>
            {HERO_SLIDES.map((slide, idx) => (
              <View
                key={slide.key}
                style={[styles.heroDot, idx === heroIndex && styles.heroDotActive]}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Curated Horizontal Spotlight Shelf ("Nổi bật quanh KTX") */}
      {spotlightItems.length > 0 ? (
        <View style={styles.spotlightSection} testID="discovery-spotlight-shelf">
          <View style={styles.spotlightHeader}>
            <View style={styles.spotlightTitleGroup}>
              <Icon name="zap" size={16} color={semantic.color.accent} />
              <Text style={styles.spotlightTitle}>Nổi bật quanh KTX</Text>
            </View>
            <Text style={styles.spotlightCaption}>Tin cậy cao · Mới đăng</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.spotlightScrollContent}
          >
            {spotlightItems.map((item) => {
              const thumb = item.thumbnailUrl ?? item.images[0] ?? null;
              const isFree = item.isFree || item.priceVnd === 0;
              const loc = item.locationName ?? item.locationCode ?? 'ĐHQG-HCM';
              return (
                <Pressable
                  key={`spot-${item.id}`}
                  testID={`spotlight-card-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Tin nổi bật ${item.title}`}
                  onPress={() => handleOpenListing(item)}
                  style={({ pressed }) => [
                    styles.spotlightCard,
                    pressed && styles.heroCardPressed,
                  ]}
                >
                  <View style={styles.spotlightPhotoWrap}>
                    {thumb ? (
                      <Image
                        source={buildMediaImageSource(thumb, null)}
                        style={styles.spotlightPhoto}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.spotlightPhotoEmpty}>
                        <Icon name="image" size={22} color={semantic.color.textSecondary} />
                      </View>
                    )}
                    {isFree ? (
                      <View style={styles.spotlightFreeTag}>
                        <Text style={styles.spotlightTagText}>Tặng 0đ</Text>
                      </View>
                    ) : item.isCombo ? (
                      <View style={styles.spotlightComboTag}>
                        <Text style={styles.spotlightTagText}>Combo</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.spotlightBody}>
                    <Text style={styles.spotlightItemTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text
                      style={[styles.spotlightPrice, isFree && styles.spotlightPriceFree]}
                      numberOfLines={1}
                    >
                      {formatVnd(item.priceVnd)}
                    </Text>
                    <Text style={styles.spotlightLoc} numberOfLines={1}>
                      {loc}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {effectiveLoading && displayItems.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={semantic.color.accent} />
          <Text style={styles.loadingText}>Đang tải tin đăng…</Text>
        </View>
      ) : null}

      {/* Feed Section Header with Result Count & 2-Col Grid / 1-Col List Switcher */}
      {!effectiveLoading && !effectiveError && (displayItems.length > 0 || filtersActive) ? (
        <View style={styles.summaryBlock}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryTitleGroup}>
              <Text style={styles.feedHeading}>
                {filtersActive ? 'Kết quả tìm kiếm' : 'Gợi ý hôm nay'}
              </Text>
              <Text style={styles.summaryText} testID="listings-result-count">
                Tìm thấy {shownTotal} tin đăng
              </Text>
            </View>

            {displayItems.length > 0 ? (
              <View style={styles.viewToggleWrap}>
                <Pressable
                  testID="view-mode-grid"
                  accessibilityRole="button"
                  accessibilityLabel="Xem dạng lưới 2 cột"
                  accessibilityState={{ selected: viewMode === 'grid' }}
                  onPress={() => setViewMode('grid')}
                  style={[
                    styles.viewToggleBtn,
                    viewMode === 'grid' && styles.viewToggleBtnActive,
                  ]}
                >
                  <Icon
                    name="grid"
                    size={15}
                    color={
                      viewMode === 'grid' ? semantic.color.accent : semantic.color.textSecondary
                    }
                  />
                </Pressable>
                <Pressable
                  testID="view-mode-list"
                  accessibilityRole="button"
                  accessibilityLabel="Xem dạng danh sách"
                  accessibilityState={{ selected: viewMode === 'list' }}
                  onPress={() => setViewMode('list')}
                  style={[
                    styles.viewToggleBtn,
                    viewMode === 'list' && styles.viewToggleBtnActive,
                  ]}
                >
                  <Icon
                    name="list"
                    size={15}
                    color={
                      viewMode === 'list' ? semantic.color.accent : semantic.color.textSecondary
                    }
                  />
                </Pressable>
              </View>
            ) : null}
          </View>
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
          subtitle="Bỏ bớt một tiêu chí bên dưới hoặc đặt lại tất cả bộ lọc để xem thêm tin mới nhất."
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
    ) : undefined;

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
  ) : undefined;

  const isGridMode = viewMode === 'grid';
  const isFilterTriggerActive = filterSheetOpen || activeFilterCount > 0;

  return (
    <SafeAreaView
      style={[styles.container, androidTopInset > 0 && { paddingTop: androidTopInset }]}
    >
      {/* Signature Pinned Terracotta Commerce Header (Shopee / Tiki / Lazada sticky dock) */}
      <View style={styles.stickyHeaderShell}>
        <View style={styles.topHeader}>
          <View style={styles.brandGroup}>
            <View style={styles.brandMark}>
              <Icon name="shopping-bag" size={15} color={semantic.color.accent} />
            </View>
            <Text style={styles.brandTitle} accessibilityRole="header">
              Chợ KTX
            </Text>
          </View>

          <View style={styles.headerRightGroup}>
            <Pressable
              testID="header-zone-picker"
              onPress={() => setZoneSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Chọn khu vực ĐHQG-HCM, hiện tại ${shortZoneLabel(activeZone)}`}
              style={({ pressed }) => [styles.zonePill, pressed && styles.zonePillPressed]}
            >
              <Icon name="map-pin" size={12} color={semantic.color.textInverse} />
              <Text style={styles.zonePillText} numberOfLines={1}>
                {shortZoneLabel(activeZone)}
              </Text>
              <Icon name="chevron-down" size={13} color={semantic.color.textInverseMuted} />
            </Pressable>

            <Pressable
              testID="open-inbox-button"
              disabled={inboxDisabled}
              onPress={() => {
                if (inboxDisabled) return;
                navigation.navigate(token ? 'Conversations' : 'Login');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Hộp thư cá nhân"
              accessibilityState={{ disabled: inboxDisabled }}
              style={({ pressed }) => [
                styles.refreshBtn,
                pressed && !inboxDisabled && styles.refreshBtnPressed,
                inboxDisabled && styles.refreshBtnDisabled,
              ]}
            >
              <Icon name="message-circle" size={16} color={semantic.color.textInverse} />
            </Pressable>

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
              <Icon name="refresh-cw" size={16} color={semantic.color.textInverse} />
            </Pressable>
          </View>
        </View>

        <View style={styles.stickySearchRow} testID="sticky-search-dock">
          <View style={styles.stickySearchField}>
            <Pressable
              testID="search-submit-button"
              accessibilityRole="button"
              accessibilityLabel="Tìm kiếm"
              disabled={effectiveLoading}
              hitSlop={6}
              onPress={handleStickySearchSubmit}
              style={({ pressed }) => [
                styles.stickySearchIconBtn,
                pressed && styles.zonePillPressed,
                effectiveLoading && styles.refreshBtnDisabled,
              ]}
            >
              <Icon name="search" size={16} color={semantic.color.accent} />
            </Pressable>

            <TextInput
              testID="search-input"
              accessibilityLabel="Tìm kiếm tin đăng"
              placeholder="Tìm giáo trình, mã môn SE100, quạt, đèn..."
              placeholderTextColor={semantic.color.textSecondary}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
              onSubmitEditing={handleStickySearchSubmit}
              style={styles.stickySearchInput}
            />

            {searchText.length > 0 ? (
              <Pressable
                testID="clear-search-input"
                accessibilityRole="button"
                accessibilityLabel="Xóa từ khóa tìm kiếm"
                hitSlop={8}
                onPress={handleClearStickySearch}
                style={({ pressed }) => [styles.stickyClearBtn, pressed && styles.zonePillPressed]}
              >
                <Icon name="x" size={13} color={semantic.color.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            testID="toggle-advanced-filters"
            accessibilityRole="button"
            accessibilityLabel={
              activeFilterCount > 0 ? `Lọc (${activeFilterCount} bộ lọc đang áp dụng)` : 'Lọc'
            }
            accessibilityState={{ expanded: filterSheetOpen }}
            onPress={() => setFilterSheetOpen((prev) => !prev)}
            style={({ pressed }) => [
              styles.stickyFilterBtn,
              isFilterTriggerActive && styles.stickyFilterBtnActive,
              pressed && styles.zonePillPressed,
            ]}
          >
            <Icon
              name="sliders"
              size={15}
              color={isFilterTriggerActive ? semantic.color.accent : semantic.color.textInverse}
            />
            <Text
              style={[
                styles.stickyFilterLabel,
                isFilterTriggerActive && styles.stickyFilterLabelActive,
              ]}
            >
              Lọc
            </Text>
            {activeFilterCount > 0 ? (
              <View style={styles.stickyFilterBadge} testID="active-filter-count-badge">
                <Text style={styles.stickyFilterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <FlatList
        key={viewMode}
        numColumns={isGridMode ? 2 : 1}
        data={displayItems}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={isGridMode ? styles.gridRow : undefined}
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
        renderItem={({ item, index }) => {
          if (!isGridMode) {
            return <ListingCard listing={item} variant="list" onPress={handleOpenListing} />;
          }
          const isLastSingleOdd =
            displayItems.length % 2 === 1 && index === displayItems.length - 1;
          return (
            <View style={[styles.gridItemCell, isLastSingleOdd && styles.gridItemCellHalf]}>
              <ListingCard listing={item} variant="grid" onPress={handleOpenListing} />
            </View>
          );
        }}
      />

      {/* Quick Campus Zone Selector BottomSheet */}
      <BottomSheet
        visible={zoneSheetOpen}
        onClose={() => setZoneSheetOpen(false)}
        title="Chọn khu vực ĐHQG-HCM"
        testID="campus-zone-sheet"
        contentStyle={styles.zoneSheetBody}
      >
        <Pressable
          testID="quick-zone-ALL"
          accessibilityRole="radio"
          accessibilityState={{ selected: !filters.locationCode, checked: !filters.locationCode }}
          onPress={() => handleQuickZoneSelect(null)}
          style={({ pressed }) => [styles.zoneSheetRow, pressed && styles.zoneSheetRowPressed]}
        >
          <View style={styles.zoneSheetRowLeft}>
            <Icon name="compass" size={17} color={semantic.color.accent} />
            <View style={styles.zoneSheetTextCol}>
              <Text style={styles.zoneSheetName}>Toàn bộ khu vực ĐHQG-HCM</Text>
              <Text style={styles.zoneSheetSub}>Hiển thị tất cả KTX và các trường thành viên</Text>
            </View>
          </View>
          {!filters.locationCode ? (
            <Icon name="check" size={18} color={semantic.color.accent} />
          ) : null}
        </Pressable>

        {groupedLocations.map((group) => (
          <View key={group.group} style={styles.zoneSheetGroup}>
            <HairlineDivider />
            <Text style={styles.zoneSheetGroupLabel}>{group.title}</Text>
            {group.zones.map((zone) => {
              const selected = filters.locationCode === zone.code;
              return (
                <Pressable
                  key={zone.code}
                  testID={`quick-zone-${zone.code}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  onPress={() => handleQuickZoneSelect(zone)}
                  style={({ pressed }) => [
                    styles.zoneSheetRow,
                    selected && styles.zoneSheetRowSelected,
                    pressed && styles.zoneSheetRowPressed,
                  ]}
                >
                  <View style={styles.zoneSheetRowLeft}>
                    <Icon
                      name="map-pin"
                      size={16}
                      color={selected ? semantic.color.accent : semantic.color.textSecondary}
                    />
                    <Text
                      style={[
                        styles.zoneSheetName,
                        selected && styles.zoneSheetNameSelected,
                      ]}
                    >
                      {zone.name}
                    </Text>
                  </View>
                  {selected ? (
                    <Icon name="check" size={18} color={semantic.color.accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </BottomSheet>

      <BottomNavBar activeTab="Listings" onNavigate={handleBottomNavigate} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semantic.color.accent,
  },
  stickyHeaderShell: {
    backgroundColor: semantic.color.accent,
    paddingBottom: primitive.space[2.5],
  },
  topHeader: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: semantic.spacing.pageX,
    backgroundColor: semantic.color.accent,
    gap: primitive.space[2],
  },
  stickySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[1],
    gap: primitive.space[2],
  },
  stickySearchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: primitive.space[2],
    gap: primitive.space[1.5],
    ...primitive.elevation.thumb,
  },
  stickySearchIconBtn: {
    width: 28,
    height: 28,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickySearchInput: {
    flex: 1,
    minHeight: 38,
    fontSize: 13.5,
    color: semantic.color.textPrimary,
    paddingVertical: primitive.space[1],
  },
  stickyClearBtn: {
    width: 24,
    height: 24,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: primitive.space[2.5],
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.inversePillBg,
    borderWidth: 1,
    borderColor: semantic.color.inversePillBorder,
    gap: primitive.space[1.5],
  },
  stickyFilterBtnActive: {
    backgroundColor: semantic.color.bgSurface,
    borderColor: semantic.color.bgSurface,
  },
  stickyFilterLabel: {
    ...semantic.type.label,
    fontSize: 13,
    color: semantic.color.textInverse,
  },
  stickyFilterLabelActive: {
    color: semantic.color.accent,
  },
  stickyFilterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accent,
    paddingHorizontal: primitive.space[1],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyFilterBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textInverse,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: primitive.fontWeight.bold,
    letterSpacing: -0.3,
    color: semantic.color.textInverse,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    flexShrink: 1,
  },
  zonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    maxWidth: 168,
    paddingHorizontal: primitive.space[2.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.inversePillBg,
    borderWidth: 1,
    borderColor: semantic.color.inversePillBorder,
  },
  zonePillPressed: {
    opacity: primitive.opacity.pressed,
  },
  zonePillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textInverse,
    flexShrink: 1,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.inversePillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnPressed: {
    opacity: primitive.opacity.pressed,
  },
  refreshBtnDisabled: {
    opacity: primitive.opacity.disabled,
  },
  list: {
    flex: 1,
    backgroundColor: semantic.color.bgCanvas,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: primitive.space[5],
  },
  listHeader: {
    backgroundColor: semantic.color.bgCanvas,
  },
  noticesWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    gap: primitive.space[2],
  },
  bannerWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
  },

  // Hero Discovery Carousel
  heroSection: {
    paddingTop: primitive.space[2.5],
    paddingBottom: primitive.space[1],
  },
  heroScrollContent: {
    paddingHorizontal: semantic.spacing.pageX,
    gap: primitive.space[3],
  },
  heroCard: {
    borderRadius: primitive.radius.xl,
    paddingHorizontal: primitive.space[4],
    paddingVertical: primitive.space[3],
    overflow: 'hidden',
    position: 'relative',
    minHeight: 118,
    justifyContent: 'center',
    ...primitive.elevation.floating,
  },
  heroCardPressed: {
    opacity: 0.92,
  },
  heroDecorCircleLg: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    right: -28,
    top: -36,
  },
  heroDecorCircleSm: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    right: 36,
    bottom: -36,
  },
  heroCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[3],
  },
  heroTextCol: {
    flex: 1,
    gap: 3,
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  heroEyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.bold,
    letterSpacing: 1.0,
    color: semantic.color.textInverseMuted,
  },
  heroLivePill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.inversePillBg,
    borderWidth: 1,
    borderColor: semantic.color.inversePillBorder,
  },
  heroLivePillText: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textInverse,
    fontVariant: ['tabular-nums'],
  },
  heroTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textInverse,
    letterSpacing: -0.2,
  },
  heroSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: semantic.color.textInverseMuted,
  },
  heroCtaPill: {
    alignSelf: 'flex-start',
    marginTop: primitive.space[1],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: 4,
    borderRadius: primitive.radius.full,
  },
  heroCtaText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textPrimary,
  },
  heroPhotoFrame: {
    width: 74,
    height: 74,
    borderRadius: primitive.radius.lg,
    borderWidth: 2,
    borderColor: semantic.color.inversePillBorder,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: semantic.color.inversePillBg,
    ...primitive.elevation.thumb,
  },
  heroPhoto: {
    width: '100%',
    height: '100%',
  },
  heroPhotoIconChip: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 22,
    height: 22,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconBadge: {
    width: 52,
    height: 52,
    borderRadius: primitive.radius.xl,
    backgroundColor: semantic.color.inversePillBg,
    borderWidth: 1,
    borderColor: semantic.color.inversePillBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: primitive.space[1.5],
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: semantic.color.borderStrong,
  },
  heroDotActive: {
    width: 18,
    backgroundColor: semantic.color.accent,
  },

  // Horizontal Spotlight Shelf
  spotlightSection: {
    marginTop: primitive.space[2],
    backgroundColor: semantic.color.bgSurface,
    paddingVertical: primitive.space[2.5],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semantic.color.borderHairline,
  },
  spotlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: semantic.spacing.pageX,
    marginBottom: primitive.space[2],
  },
  spotlightTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  spotlightTitle: {
    ...semantic.type.sectionTitle,
    fontSize: 15,
  },
  spotlightCaption: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  spotlightScrollContent: {
    paddingHorizontal: semantic.spacing.pageX,
    gap: primitive.space[2],
  },
  spotlightCard: {
    width: 136,
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    overflow: 'hidden',
  },
  spotlightPhotoWrap: {
    width: '100%',
    height: 92,
    backgroundColor: semantic.color.bgSubtle,
    position: 'relative',
  },
  spotlightPhoto: {
    width: '100%',
    height: '100%',
  },
  spotlightPhotoEmpty: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.color.bgTrack,
  },
  spotlightFreeTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: primitive.radius.sm,
    backgroundColor: semantic.color.freeFg,
  },
  spotlightComboTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: primitive.radius.sm,
    backgroundColor: semantic.color.overlayDark,
  },
  spotlightTagText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textInverse,
  },
  spotlightBody: {
    padding: primitive.space[2],
    gap: 2,
  },
  spotlightItemTitle: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
  spotlightPrice: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.accent,
  },
  spotlightPriceFree: {
    color: semantic.color.freeFg,
  },
  spotlightLoc: {
    fontSize: 11,
    lineHeight: 14,
    color: semantic.color.textSecondary,
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

  // Feed Section Header & Grid Layout
  summaryBlock: {
    paddingTop: primitive.space[3],
    paddingBottom: primitive.space[2],
    paddingHorizontal: semantic.spacing.pageX,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  summaryTitleGroup: {
    gap: 2,
  },
  feedHeading: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textPrimary,
    letterSpacing: -0.2,
  },
  summaryText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontWeight: primitive.fontWeight.medium,
  },
  viewToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: semantic.color.bgSurface,
    borderRadius: primitive.radius.md,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    padding: 2,
  },
  viewToggleBtn: {
    width: 32,
    height: 28,
    borderRadius: primitive.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleBtnActive: {
    backgroundColor: semantic.color.accentSoft,
  },
  gridRow: {
    paddingHorizontal: semantic.spacing.pageX,
    gap: primitive.space[2.5],
    marginBottom: primitive.space[2.5],
  },
  gridItemCell: {
    flex: 1,
  },
  gridItemCellHalf: {
    flex: 0.5,
    paddingRight: primitive.space[1.5],
  },

  footerContainer: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
  },
  loadMoreBtn: {
    minHeight: component.button.minHeightSm,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.borderStrong,
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

  // Quick Zone Picker Sheet
  zoneSheetBody: {
    paddingBottom: primitive.space[5],
  },
  zoneSheetGroup: {
    paddingTop: primitive.space[2],
  },
  zoneSheetGroupLabel: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: semantic.color.textSecondary,
    paddingTop: primitive.space[3],
    paddingBottom: primitive.space[1],
  },
  zoneSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: primitive.space[3],
    paddingHorizontal: primitive.space[2],
    borderRadius: primitive.radius.md,
    gap: primitive.space[2],
  },
  zoneSheetRowSelected: {
    backgroundColor: semantic.color.accentSoft,
  },
  zoneSheetRowPressed: {
    opacity: primitive.opacity.pressed,
  },
  zoneSheetRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
    flex: 1,
  },
  zoneSheetTextCol: {
    flex: 1,
    gap: 2,
  },
  zoneSheetName: {
    ...semantic.type.body,
    fontWeight: primitive.fontWeight.medium,
  },
  zoneSheetNameSelected: {
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  zoneSheetSub: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
});
