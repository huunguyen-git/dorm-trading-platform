import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  normalizeSearchTypeParam,
  type DiscoveryListingTypeFilter,
  type DiscoverySearchFilters,
} from '../listings/discoveryApi';
import { countActiveDiscoveryFilters } from '../listings/discoveryStore';
import {
  formatVnd,
  type CategoryTreeNode,
  type ListingCategory,
  type ListingSortOption,
  type LocationZone,
} from '../listings/types';
import { component, primitive, semantic } from '../theme';
import {
  BottomSheet,
  FormField,
  HairlineDivider,
  Icon,
  InlineBanner,
  SegmentedControl,
  SwitchRow,
  type AppIconName,
  type SegmentedOption,
} from './ui';

export interface ListingFilterBarProps {
  filters: DiscoverySearchFilters;
  categories: ListingCategory[];
  categoryTree: CategoryTreeNode[];
  locations: LocationZone[];
  loading?: boolean;
  onApply: (nextFilters: DiscoverySearchFilters) => void;
  onReset: () => void;
  searchText?: string;
  onSearchTextChange?: (text: string) => void;
  sheetOpen?: boolean;
  onSheetOpenChange?: (open: boolean) => void;
  hideSearchDock?: boolean;
  onRequestZonePicker?: () => void;
}

type TypeSegmentValue = 'ALL' | 'SINGLE' | 'COMBO';

const ALL_CATEGORY_VALUE = '__ALL__';

const TYPE_SEGMENT_OPTIONS: SegmentedOption<TypeSegmentValue>[] = [
  { value: 'ALL', label: 'Tất cả', testID: 'filter-type-all' },
  { value: 'SINGLE', label: 'Tin đơn', testID: 'filter-type-single' },
  { value: 'COMBO', label: 'Combo', testID: 'filter-type-combo' },
];

const SORT_OPTIONS: Array<{
  value: ListingSortOption;
  label: string;
  shortLabel: string;
  requiresLocation?: boolean;
}> = [
  { value: 'newest', label: 'Mới nhất', shortLabel: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá thấp đến cao', shortLabel: 'Giá tăng' },
  { value: 'price_desc', label: 'Giá cao đến thấp', shortLabel: 'Giá giảm' },
  { value: 'distance_asc', label: 'Gần nhất', shortLabel: 'Gần nhất', requiresLocation: true },
];

const QUICK_PRICE_RANGES: Array<{ label: string; min: string; max: string }> = [
  { label: 'Dưới 50k', min: '', max: '50000' },
  { label: '50k – 200k', min: '50000', max: '200000' },
  { label: '200k – 500k', min: '200000', max: '500000' },
  { label: 'Trên 500k', min: '500000', max: '' },
];

const QUICK_COURSE_PRESETS = ['SE100', 'IT003', 'MA006'];
const QUICK_RADIUS_PRESETS = ['1', '2', '5'];

interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

function getCategoryIcon(categoryId: string): AppIconName {
  switch (categoryId) {
    case ALL_CATEGORY_VALUE:
      return 'grid';
    case 'GIAO_TRINH':
    case 'GT_CNTT':
    case 'GT_DAI_CUONG':
    case 'GT_KINH_TE':
    case 'GT_NGOAI_NGU':
      return 'book-open';
    case 'DO_CHO_TANG':
      return 'gift';
    case 'DO_GIA_DUNG':
      return 'coffee';
    case 'NOI_THAT_TRO':
      return 'home';
    case 'THIET_BI_DIEN':
    case 'TB_DIEN_TU':
      return 'cpu';
    default:
      return 'tag';
  }
}

function getShortCategoryLabel(id: string, name: string): string {
  switch (id) {
    case 'GIAO_TRINH':
      return 'Giáo trình';
    case 'DO_CHO_TANG':
      return 'Cho tặng';
    case 'DO_GIA_DUNG':
      return 'Gia dụng';
    case 'NOI_THAT_TRO':
      return 'Nội thất';
    case 'THIET_BI_DIEN':
      return 'Điện tử';
    default:
      return name;
  }
}

function findRootForCategory(
  tree: CategoryTreeNode[],
  categoryId: string | undefined,
): CategoryTreeNode | null {
  if (!categoryId) return null;
  for (const root of tree) {
    if (root.id === categoryId) return root;
    if (root.children.some((child) => child.id === categoryId)) {
      return root;
    }
  }
  return null;
}

function findCategoryName(
  categories: ListingCategory[],
  tree: CategoryTreeNode[],
  categoryId: string,
): string {
  const flatMatch = categories.find((cat) => cat.id === categoryId);
  if (flatMatch?.name) return flatMatch.name;
  for (const root of tree) {
    if (root.id === categoryId) return root.name;
    const child = root.children.find((item) => item.id === categoryId);
    if (child) return child.name;
  }
  return categoryId;
}

function parseFilterPriceInput(raw: string): number {
  const digitsOnly = raw.replace(/[.,\s]/g, '');
  if (!digitsOnly || !/^-?\d+$/.test(digitsOnly)) {
    return Number.NaN;
  }
  return Number(digitsOnly);
}

export function ListingFilterBar({
  filters,
  categories,
  categoryTree,
  locations,
  loading = false,
  onApply,
  onReset,
  searchText,
  onSearchTextChange,
  sheetOpen,
  onSheetOpenChange,
  hideSearchDock = false,
  onRequestZonePicker,
}: ListingFilterBarProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [internalQueryText, setInternalQueryText] = useState(filters.q ?? '');
  const [courseCode, setCourseCode] = useState(filters.courseCode ?? '');
  const [minPriceText, setMinPriceText] = useState(
    filters.minPrice !== undefined ? String(filters.minPrice) : '',
  );
  const [maxPriceText, setMaxPriceText] = useState(
    filters.maxPrice !== undefined ? String(filters.maxPrice) : '',
  );
  const [freeOnly, setFreeOnly] = useState(Boolean(filters.freeOnly));
  const [listingType, setListingType] = useState<DiscoveryListingTypeFilter | undefined>(
    normalizeSearchTypeParam(filters.type),
  );
  const [locationCode, setLocationCode] = useState<string | undefined>(filters.locationCode);
  const [radiusText, setRadiusText] = useState(
    filters.radiusKm !== undefined ? String(filters.radiusKm) : '',
  );
  const [sort, setSort] = useState<ListingSortOption>(filters.sort ?? 'newest');
  const [validationError, setValidationError] = useState('');

  const expanded = sheetOpen !== undefined ? sheetOpen : internalExpanded;
  const setExpanded = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(expanded) : next;
    if (onSheetOpenChange) {
      onSheetOpenChange(resolved);
    } else {
      setInternalExpanded(resolved);
    }
  };

  const queryText = searchText !== undefined ? searchText : internalQueryText;
  const setQueryText = (next: string) => {
    if (onSearchTextChange) {
      onSearchTextChange(next);
    } else {
      setInternalQueryText(next);
    }
  };

  const prevFilterQRef = useRef<string | undefined>(filters.q);

  useEffect(() => {
    if (filters.q !== prevFilterQRef.current) {
      prevFilterQRef.current = filters.q;
      if (searchText === undefined) {
        setInternalQueryText(filters.q ?? '');
      }
    }
    setCourseCode(filters.courseCode ?? '');
    setMinPriceText(filters.minPrice !== undefined ? String(filters.minPrice) : '');
    setMaxPriceText(filters.maxPrice !== undefined ? String(filters.maxPrice) : '');
    setFreeOnly(Boolean(filters.freeOnly));
    setListingType(normalizeSearchTypeParam(filters.type));
    setLocationCode(filters.locationCode);
    setRadiusText(filters.radiusKm !== undefined ? String(filters.radiusKm) : '');
    setSort(filters.sort ?? 'newest');
    setValidationError('');
  }, [filters, searchText]);

  const rootCategories = useMemo<CategoryTreeNode[]>(() => {
    if (categoryTree.length > 0) return categoryTree;
    return categories
      .filter((category) => !category.parentId)
      .map((category) => ({
        ...category,
        children: categories
          .filter((child) => child.parentId === category.id)
          .map((child) => ({ ...child, children: [] })),
      }));
  }, [categories, categoryTree]);

  const activeRoot = useMemo(
    () => findRootForCategory(rootCategories, filters.categoryId),
    [rootCategories, filters.categoryId],
  );

  const selectedZone = useMemo(
    () => locations.find((zone) => zone.code === locationCode) ?? null,
    [locations, locationCode],
  );

  const activeFilterCount = useMemo(() => countActiveDiscoveryFilters(filters), [filters]);
  const hasOriginZone = Boolean(
    filters.locationCode || (typeof filters.lat === 'number' && typeof filters.lng === 'number'),
  );

  const resolvedQuery = () => queryText.trim() || undefined;

  const handleSearchSubmit = () => {
    setValidationError('');
    onApply({
      ...filters,
      q: resolvedQuery(),
      page: 0,
    });
  };

  const handleClearSearchText = () => {
    setQueryText('');
    if (filters.q) {
      onApply({
        ...filters,
        q: undefined,
        page: 0,
      });
    }
  };

  const handleSelectCategory = (categoryId: string | undefined) => {
    setValidationError('');
    onApply({
      ...filters,
      q: resolvedQuery(),
      categoryId,
      page: 0,
    });
  };

  const handleQuickSort = (nextSort: ListingSortOption) => {
    setValidationError('');
    if (nextSort === 'distance_asc' && !hasOriginZone) {
      onRequestZonePicker?.();
      return;
    }
    onApply({
      ...filters,
      q: resolvedQuery(),
      sort: nextSort,
      page: 0,
    });
  };

  const handleQuickToggleFree = () => {
    setValidationError('');
    const nextFree = !filters.freeOnly;
    onApply({
      ...filters,
      q: resolvedQuery(),
      freeOnly: nextFree ? true : undefined,
      maxPrice: nextFree ? undefined : filters.maxPrice,
      minPrice: nextFree ? undefined : filters.minPrice,
      page: 0,
    });
  };

  const handleQuickToggleCombo = () => {
    setValidationError('');
    const isComboActive = normalizeSearchTypeParam(filters.type) === 'COMBO';
    onApply({
      ...filters,
      q: resolvedQuery(),
      type: isComboActive ? undefined : 'COMBO',
      page: 0,
    });
  };

  const handleSelectZone = (zone: LocationZone | null) => {
    setValidationError('');
    if (!zone) {
      setLocationCode(undefined);
      setRadiusText('');
      if (sort === 'distance_asc') {
        setSort('newest');
      }
      return;
    }
    setLocationCode(zone.code);
  };

  const handleToggleSheet = () => {
    setValidationError('');
    if (!expanded) {
      setCourseCode(filters.courseCode ?? '');
      setMinPriceText(filters.minPrice !== undefined ? String(filters.minPrice) : '');
      setMaxPriceText(filters.maxPrice !== undefined ? String(filters.maxPrice) : '');
      setFreeOnly(Boolean(filters.freeOnly));
      setListingType(normalizeSearchTypeParam(filters.type));
      setLocationCode(filters.locationCode);
      setRadiusText(filters.radiusKm !== undefined ? String(filters.radiusKm) : '');
      setSort(filters.sort ?? 'newest');
    }
    setExpanded((prev) => !prev);
  };

  const handleApplyAdvanced = () => {
    setValidationError('');

    let parsedMinPrice: number | undefined;
    if (!freeOnly && minPriceText.trim()) {
      const normalized = parseFilterPriceInput(minPriceText);
      if (!Number.isFinite(normalized) || normalized < 0) {
        setValidationError('Giá tối thiểu phải là số không âm hợp lệ.');
        return;
      }
      parsedMinPrice = Math.round(normalized);
    }

    let parsedMaxPrice: number | undefined;
    if (!freeOnly && maxPriceText.trim()) {
      const normalized = parseFilterPriceInput(maxPriceText);
      if (!Number.isFinite(normalized) || normalized < 0) {
        setValidationError('Giá tối đa phải là số không âm hợp lệ.');
        return;
      }
      parsedMaxPrice = Math.round(normalized);
    }

    if (
      parsedMinPrice !== undefined &&
      parsedMaxPrice !== undefined &&
      parsedMinPrice > parsedMaxPrice
    ) {
      setValidationError('Giá tối thiểu không được lớn hơn giá tối đa.');
      return;
    }

    let parsedRadius: number | undefined;
    if (radiusText.trim()) {
      const normalized = Number(radiusText.trim().replace(',', '.'));
      if (!Number.isFinite(normalized) || normalized <= 0) {
        setValidationError('Bán kính tìm kiếm phải lớn hơn 0 km.');
        return;
      }
      if (!selectedZone) {
        setValidationError('Hãy chọn một khu vực ĐHQG-HCM trước khi lọc theo bán kính.');
        return;
      }
      parsedRadius = normalized;
    }

    const effectiveSort: ListingSortOption =
      sort === 'distance_asc' && !selectedZone ? 'newest' : sort;

    const nextFilters: DiscoverySearchFilters = {
      ...filters,
      q: resolvedQuery(),
      courseCode: courseCode.trim() || undefined,
      minPrice: freeOnly ? undefined : parsedMinPrice,
      maxPrice: freeOnly ? undefined : parsedMaxPrice,
      freeOnly: freeOnly || undefined,
      type: listingType,
      locationCode: selectedZone?.code,
      lat: selectedZone?.latitude,
      lng: selectedZone?.longitude,
      radiusKm: parsedRadius,
      sort: effectiveSort,
      page: 0,
    };

    onApply(nextFilters);
    setExpanded(false);
  };

  const handleResetAll = () => {
    setValidationError('');
    setQueryText('');
    setExpanded(false);
    onReset();
  };

  const activeChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];

    if (filters.q?.trim()) {
      chips.push({
        key: 'q',
        label: `"${filters.q.trim()}"`,
        onRemove: () => {
          setQueryText('');
          onApply({ ...filters, q: undefined, page: 0 });
        },
      });
    }

    if (filters.categoryId?.trim()) {
      chips.push({
        key: 'category',
        label: findCategoryName(categories, rootCategories, filters.categoryId.trim()),
        onRemove: () => onApply({ ...filters, categoryId: undefined, page: 0 }),
      });
    }

    const activeType = normalizeSearchTypeParam(filters.type);
    if (activeType) {
      const typeLabel =
        activeType === 'COMBO' ? 'Combo' : activeType === 'SINGLE' ? 'Tin đơn' : 'Cho tặng';
      chips.push({
        key: 'type',
        label: typeLabel,
        onRemove: () => onApply({ ...filters, type: undefined, page: 0 }),
      });
    }

    if (filters.freeOnly === true) {
      chips.push({
        key: 'freeOnly',
        label: 'Miễn phí',
        onRemove: () => onApply({ ...filters, freeOnly: undefined, page: 0 }),
      });
    } else {
      if (typeof filters.minPrice === 'number' && Number.isFinite(filters.minPrice)) {
        chips.push({
          key: 'minPrice',
          label: `Từ ${formatVnd(filters.minPrice)}`,
          onRemove: () => onApply({ ...filters, minPrice: undefined, page: 0 }),
        });
      }
      if (typeof filters.maxPrice === 'number' && Number.isFinite(filters.maxPrice)) {
        chips.push({
          key: 'maxPrice',
          label: `Tối đa ${formatVnd(filters.maxPrice)}`,
          onRemove: () => onApply({ ...filters, maxPrice: undefined, page: 0 }),
        });
      }
    }

    if (filters.courseCode?.trim()) {
      chips.push({
        key: 'courseCode',
        label: `Môn ${filters.courseCode.trim()}`,
        onRemove: () => onApply({ ...filters, courseCode: undefined, page: 0 }),
      });
    }

    if (filters.locationCode?.trim() || filters.location?.trim()) {
      const zoneMatch = locations.find((zone) => zone.code === filters.locationCode);
      const zoneLabel = zoneMatch?.name ?? filters.location?.trim() ?? filters.locationCode ?? '';
      chips.push({
        key: 'location',
        label: zoneLabel,
        onRemove: () =>
          onApply({
            ...filters,
            locationCode: undefined,
            location: undefined,
            lat: undefined,
            lng: undefined,
            radiusKm: undefined,
            sort: filters.sort === 'distance_asc' ? 'newest' : filters.sort,
            page: 0,
          }),
      });
    }

    if (
      typeof filters.radiusKm === 'number' &&
      Number.isFinite(filters.radiusKm) &&
      filters.radiusKm > 0
    ) {
      chips.push({
        key: 'radiusKm',
        label: `Trong ${filters.radiusKm} km`,
        onRemove: () => onApply({ ...filters, radiusKm: undefined, page: 0 }),
      });
    }

    if (filters.sort && filters.sort !== 'newest') {
      const sortMeta = SORT_OPTIONS.find((item) => item.value === filters.sort);
      if (sortMeta) {
        chips.push({
          key: 'sort',
          label: sortMeta.label,
          onRemove: () => onApply({ ...filters, sort: 'newest', page: 0 }),
        });
      }
    }

    return chips;
  }, [categories, filters, locations, onApply, rootCategories]);

  const isFilterActive = expanded || activeFilterCount > 0;
  const segmentValue: TypeSegmentValue =
    listingType === 'SINGLE' || listingType === 'COMBO' ? listingType : 'ALL';
  const activeSort = filters.sort ?? 'newest';
  const isFreeQuickActive = filters.freeOnly === true;
  const isComboQuickActive = normalizeSearchTypeParam(filters.type) === 'COMBO';

  return (
    <View style={styles.container} testID="listing-filter-bar">
      {/* Branded Terracotta Search Dock (when not pinned externally by ListingsScreen) */}
      {!hideSearchDock ? (
        <View style={styles.brandedSearchWrap}>
          <View style={styles.searchBarRow}>
            <View style={styles.searchField}>
              <Pressable
                testID="search-submit-button"
                accessibilityRole="button"
                accessibilityLabel="Tìm kiếm"
                disabled={loading}
                hitSlop={6}
                onPress={handleSearchSubmit}
                style={({ pressed }) => [
                  styles.searchIconBtn,
                  pressed && styles.pressed,
                  loading && styles.disabled,
                ]}
              >
                <Icon name="search" size={17} color={semantic.color.accent} />
              </Pressable>

              <TextInput
                testID="search-input"
                accessibilityLabel="Tìm kiếm tin đăng"
                placeholder="Tìm giáo trình, mã môn SE100, quạt, đèn..."
                placeholderTextColor={semantic.color.textSecondary}
                value={queryText}
                onChangeText={setQueryText}
                returnKeyType="search"
                onSubmitEditing={handleSearchSubmit}
                style={styles.searchInput}
              />

              {queryText.length > 0 ? (
                <Pressable
                  testID="clear-search-input"
                  accessibilityRole="button"
                  accessibilityLabel="Xóa từ khóa tìm kiếm"
                  hitSlop={8}
                  onPress={handleClearSearchText}
                  style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
                >
                  <Icon name="x" size={14} color={semantic.color.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              testID="toggle-advanced-filters"
              accessibilityRole="button"
              accessibilityLabel={
                activeFilterCount > 0 ? `Lọc (${activeFilterCount} bộ lọc đang áp dụng)` : 'Lọc'
              }
              accessibilityState={{ expanded }}
              onPress={handleToggleSheet}
              style={({ pressed }) => [
                styles.filterTrigger,
                isFilterActive && styles.filterTriggerActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name="sliders"
                size={15}
                color={isFilterActive ? semantic.color.accent : semantic.color.textInverse}
              />
              <Text
                style={[
                  styles.filterTriggerLabel,
                  isFilterActive && styles.filterTriggerLabelActive,
                ]}
              >
                Lọc
              </Text>
              {activeFilterCount > 0 ? (
                <View style={styles.countBadge} testID="active-filter-count-badge">
                  <Text style={styles.countBadgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Visual Icon Category Strip (Lazada / Shopee / Tiki style) */}
      {rootCategories.length > 0 ? (
        <View style={styles.categorySection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryStripContent}
            testID="category-underline-tabs"
          >
            {[
              { id: ALL_CATEGORY_VALUE, name: 'Tất cả', isAll: true },
              ...rootCategories.map((root) => ({
                id: root.id,
                name: getShortCategoryLabel(root.id, root.name),
                isAll: false,
              })),
            ].map((item) => {
              const selected = item.isAll
                ? !activeRoot
                : activeRoot?.id === item.id;
              return (
                <Pressable
                  key={item.id}
                  testID={item.isAll ? 'category-chip-all' : `category-chip-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  accessibilityState={{ selected }}
                  onPress={() => handleSelectCategory(item.isAll ? undefined : item.id)}
                  style={({ pressed }) => [
                    styles.catTile,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.catIconBox,
                      selected && styles.catIconBoxActive,
                      item.id === 'DO_CHO_TANG' && !selected && styles.catIconBoxFree,
                    ]}
                  >
                    <Icon
                      name={getCategoryIcon(item.id)}
                      size={20}
                      color={
                        selected
                          ? semantic.color.textInverse
                          : item.id === 'DO_CHO_TANG'
                            ? semantic.color.freeFg
                            : semantic.color.accent
                      }
                    />
                  </View>
                  <Text
                    style={[styles.catTileLabel, selected && styles.catTileLabelActive]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Sub-category pill strip when a parent category has children */}
          {activeRoot && activeRoot.children.length > 0 ? (
            <View style={styles.subCategoryBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.subChipRow}
                testID="child-category-row"
              >
                <Pressable
                  testID={`category-sub-all-${activeRoot.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filters.categoryId === activeRoot.id }}
                  onPress={() => handleSelectCategory(activeRoot.id)}
                  style={({ pressed }) => [
                    styles.subChip,
                    filters.categoryId === activeRoot.id && styles.subChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.subChipText,
                      filters.categoryId === activeRoot.id && styles.subChipTextActive,
                    ]}
                  >
                    Tất cả {getShortCategoryLabel(activeRoot.id, activeRoot.name)}
                  </Text>
                </Pressable>
                {activeRoot.children.map((child) => {
                  const isChildSelected = filters.categoryId === child.id;
                  return (
                    <Pressable
                      key={child.id}
                      testID={`category-chip-${child.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isChildSelected }}
                      onPress={() => handleSelectCategory(child.id)}
                      style={({ pressed }) => [
                        styles.subChip,
                        isChildSelected && styles.subChipActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.subChipText,
                          isChildSelected && styles.subChipTextActive,
                        ]}
                      >
                        {child.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Quick 1-Tap Sort & Marketplace Discovery Pills (Shopee / Tiki bar) */}
      <View style={styles.quickSortBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickSortContent}
        >
          {SORT_OPTIONS.map((opt) => {
            const active = activeSort === opt.value;
            const needsZonePrompt = Boolean(opt.requiresLocation && !hasOriginZone);
            if (needsZonePrompt && !onRequestZonePicker) {
              return null;
            }
            return (
              <Pressable
                key={opt.value}
                testID={`quick-sort-${opt.value}`}
                accessibilityRole="button"
                accessibilityLabel={
                  needsZonePrompt ? 'Chọn khu vực để sắp xếp gần nhất' : `Sắp xếp ${opt.label}`
                }
                accessibilityState={{ selected: active }}
                onPress={() => handleQuickSort(opt.value)}
                style={({ pressed }) => [
                  styles.quickPill,
                  active && styles.quickPillActive,
                  pressed && styles.pressed,
                ]}
              >
                {opt.value === 'distance_asc' ? (
                  <Icon
                    name="map-pin"
                    size={11}
                    color={active ? semantic.color.accent : semantic.color.textSecondary}
                  />
                ) : null}
                <Text style={[styles.quickPillText, active && styles.quickPillTextActive]}>
                  {opt.shortLabel}
                </Text>
              </Pressable>
            );
          })}

          <View style={styles.quickDivider} />

          <Pressable
            testID="quick-pill-free"
            accessibilityRole="button"
            accessibilityLabel="Lọc tin cho tặng miễn phí"
            accessibilityState={{ selected: isFreeQuickActive }}
            onPress={handleQuickToggleFree}
            style={({ pressed }) => [
              styles.quickPill,
              isFreeQuickActive && styles.quickPillFreeActive,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              name="gift"
              size={12}
              color={isFreeQuickActive ? semantic.color.textInverse : semantic.color.freeFg}
            />
            <Text
              style={[
                styles.quickPillText,
                styles.quickPillFreeText,
                isFreeQuickActive && styles.quickPillTextInverse,
              ]}
            >
              Tặng 0đ
            </Text>
          </Pressable>

          <Pressable
            testID="quick-pill-combo"
            accessibilityRole="button"
            accessibilityLabel="Lọc tin bộ combo"
            accessibilityState={{ selected: isComboQuickActive }}
            onPress={handleQuickToggleCombo}
            style={({ pressed }) => [
              styles.quickPill,
              isComboQuickActive && styles.quickPillActive,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              name="layers"
              size={12}
              color={isComboQuickActive ? semantic.color.accent : semantic.color.textSecondary}
            />
            <Text
              style={[
                styles.quickPillText,
                isComboQuickActive && styles.quickPillTextActive,
              ]}
            >
              Bộ Combo
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* 1-tap dismissible active filter chips */}
      {activeChips.length > 0 ? (
        <View style={styles.activeChipsBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeChipsContent}
          >
            {activeChips.map((chip) => (
              <Pressable
                key={chip.key}
                testID={`active-filter-chip-${chip.key}`}
                accessibilityRole="button"
                accessibilityLabel={`Xóa bộ lọc ${chip.label}`}
                onPress={chip.onRemove}
                style={({ pressed }) => [styles.activeChip, pressed && styles.pressed]}
              >
                <Text style={styles.activeChipText} numberOfLines={1}>
                  {chip.label}
                </Text>
                <Icon name="x" size={12} color={component.chip.activeFg} />
              </Pressable>
            ))}

            <Pressable
              testID="quick-reset-filters"
              accessibilityRole="button"
              accessibilityLabel="Xóa tất cả bộ lọc"
              onPress={handleResetAll}
              style={({ pressed }) => [styles.clearAllBtn, pressed && styles.pressed]}
            >
              <Text style={styles.clearAllText}>Xóa tất cả</Text>
            </Pressable>
          </ScrollView>
        </View>
      ) : null}

      {/* Advanced Filter BottomSheet */}
      <BottomSheet
        visible={expanded}
        onClose={() => setExpanded(false)}
        title="Bộ lọc tìm kiếm"
        rightActionLabel="Đặt lại"
        onRightAction={handleResetAll}
        rightActionTestID="reset-filters-button"
        footerLabel="Áp dụng bộ lọc"
        footerDisabled={loading}
        onFooterPress={handleApplyAdvanced}
        footerTestID="apply-filters-button"
        testID="advanced-filter-panel"
        contentStyle={styles.sheetBody}
      >
        {validationError ? (
          <InlineBanner tone="danger" message={validationError} style={styles.validationBanner} />
        ) : null}

        {/* Listing type */}
        <View style={styles.sheetSection}>
          <Text style={styles.sectionLabel}>Loại tin</Text>
          <SegmentedControl
            testID="filter-type-segmented"
            accessibilityLabel="Loại tin đăng"
            options={TYPE_SEGMENT_OPTIONS}
            value={segmentValue}
            onChange={(next) => setListingType(next === 'ALL' ? undefined : next)}
          />
        </View>

        <HairlineDivider />

        {/* Free-only switch */}
        <View style={styles.sheetSectionCompact}>
          <SwitchRow
            testID="filter-free-only"
            label="Chỉ tin tặng miễn phí (0đ)"
            description="Chỉ hiển thị đồ dùng cho tặng không tính phí"
            value={freeOnly}
            onValueChange={(next) => {
              setFreeOnly(next);
              if (next) {
                setMinPriceText('');
                setMaxPriceText('');
              }
            }}
          />
        </View>

        <HairlineDivider />

        {/* Price Range (Min - Max) & Course Code with quick presets */}
        <View style={styles.sheetSection}>
          <Text style={styles.sectionLabel}>Khoảng giá (VNĐ)</Text>
          <View style={styles.priceRangeRow}>
            <View style={styles.priceRangeCol}>
              <FormField
                testID="filter-min-price"
                label="Giá tối thiểu"
                accessibilityLabel="Giá tối thiểu (VNĐ)"
                suffix="đ"
                placeholder="Từ 0"
                keyboardType="numeric"
                editable={!freeOnly}
                value={freeOnly ? '0' : minPriceText}
                onChangeText={setMinPriceText}
              />
            </View>
            <View style={styles.priceRangeCol}>
              <FormField
                testID="filter-max-price"
                label="Giá tối đa (VNĐ)"
                accessibilityLabel="Giá tối đa (VNĐ)"
                suffix="đ"
                placeholder="VD: 150.000"
                keyboardType="numeric"
                editable={!freeOnly}
                value={freeOnly ? '0' : maxPriceText}
                onChangeText={setMaxPriceText}
              />
            </View>
          </View>
          {freeOnly ? (
            <Text style={styles.priceRangeHelper}>
              Đã tắt khoảng giá khi chọn chỉ tin miễn phí.
            </Text>
          ) : (
            <View style={styles.presetRow}>
              {QUICK_PRICE_RANGES.map((range) => {
                const cleanMin = minPriceText.replace(/[.,\s]/g, '');
                const cleanMax = maxPriceText.replace(/[.,\s]/g, '');
                const selected = cleanMin === range.min && cleanMax === range.max;
                return (
                  <Pressable
                    key={range.label}
                    testID={`filter-price-preset-${range.min || '0'}-${range.max || 'up'}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Chọn khoảng giá ${range.label}`}
                    onPress={() => {
                      if (selected) {
                        setMinPriceText('');
                        setMaxPriceText('');
                      } else {
                        setMinPriceText(range.min);
                        setMaxPriceText(range.max);
                      }
                    }}
                    style={[styles.presetChip, selected && styles.presetChipActive]}
                  >
                    <Text style={[styles.presetChipText, selected && styles.presetChipTextActive]}>
                      {range.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <FormField
            testID="filter-course-code"
            label="Mã môn học"
            accessibilityLabel="Mã môn học"
            placeholder="VD: SE100, IT003"
            autoCapitalize="characters"
            autoCorrect={false}
            value={courseCode}
            onChangeText={setCourseCode}
          />

          <View style={styles.presetRow}>
            {QUICK_COURSE_PRESETS.map((code) => {
              const selected = courseCode.trim().toUpperCase() === code;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityLabel={`Chọn mã môn ${code}`}
                  onPress={() => setCourseCode(selected ? '' : code)}
                  style={[styles.presetChip, selected && styles.presetChipActive]}
                >
                  <Text style={[styles.presetChipText, selected && styles.presetChipTextActive]}>
                    {code}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <HairlineDivider />

        {/* Campus Zone & Open Radius */}
        <View style={styles.sheetSection}>
          <Text style={styles.sectionLabel}>Khu vực ĐHQG-HCM</Text>
          <View style={styles.zoneWrap}>
            <Pressable
              testID="filter-location-all"
              accessibilityRole="button"
              accessibilityState={{ selected: !locationCode }}
              onPress={() => handleSelectZone(null)}
              style={({ pressed }) => [
                styles.zoneChip,
                !locationCode && styles.zoneChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.zoneChipText, !locationCode && styles.zoneChipTextActive]}>
                Tất cả khu vực
              </Text>
            </Pressable>

            {locations.map((zone) => {
              const selected = locationCode === zone.code;
              return (
                <Pressable
                  key={zone.code}
                  testID={`filter-location-${zone.code}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => handleSelectZone(zone)}
                  style={({ pressed }) => [
                    styles.zoneChip,
                    selected && styles.zoneChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.zoneChipText, selected && styles.zoneChipTextActive]}>
                    {zone.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <FormField
            testID="filter-radius-km"
            label="Bán kính tìm kiếm (km)"
            accessibilityLabel="Bán kính tìm kiếm (km)"
            suffix="km"
            placeholder={
              selectedZone
                ? `Từ ${selectedZone.name} (nhập số km bất kỳ)`
                : 'Chọn khu vực trước để nhập bán kính'
            }
            keyboardType="decimal-pad"
            editable={Boolean(selectedZone)}
            value={radiusText}
            onChangeText={setRadiusText}
            containerStyle={styles.radiusField}
          />

          {selectedZone ? (
            <View style={styles.presetRow}>
              {QUICK_RADIUS_PRESETS.map((km) => {
                const selected = radiusText.trim() === km;
                return (
                  <Pressable
                    key={km}
                    accessibilityRole="button"
                    accessibilityLabel={`Chọn nhanh bán kính ${km} km`}
                    onPress={() => setRadiusText(selected ? '' : km)}
                    style={[styles.presetChip, selected && styles.presetChipActive]}
                  >
                    <Text style={[styles.presetChipText, selected && styles.presetChipTextActive]}>
                      {km} km
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <HairlineDivider />

        {/* Sort radio rows */}
        <View style={styles.sheetSection}>
          <Text style={styles.sectionLabel}>Sắp xếp</Text>
          <View style={styles.sortList}>
            {SORT_OPTIONS.map((option, index) => {
              const disabled = Boolean(option.requiresLocation && !selectedZone);
              const selected = sort === option.value && !disabled;
              return (
                <View key={option.value}>
                  {index > 0 ? <HairlineDivider /> : null}
                  <Pressable
                    testID={`sort-${option.value}`}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected, checked: selected, disabled }}
                    disabled={disabled}
                    onPress={() => setSort(option.value)}
                    style={({ pressed }) => [
                      styles.sortRow,
                      disabled && styles.disabled,
                      pressed && !disabled && styles.sortRowPressed,
                    ]}
                  >
                    <View style={styles.sortTextWrap}>
                      <Text
                        style={[
                          styles.sortLabel,
                          selected && styles.sortLabelSelected,
                          disabled && styles.sortLabelDisabled,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {disabled ? (
                        <Text style={styles.sortHint}>
                          Chọn khu vực ĐHQG-HCM để bật sắp xếp gần nhất
                        </Text>
                      ) : null}
                    </View>

                    <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                      {selected ? <View style={styles.radioInner} /> : null}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: semantic.color.bgSurface,
  },
  brandedSearchWrap: {
    backgroundColor: semantic.color.accent,
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[1],
    paddingBottom: primitive.space[3],
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.bgSurface,
    paddingLeft: primitive.space[2],
    paddingRight: primitive.space[2],
    gap: primitive.space[1.5],
    ...primitive.elevation.thumb,
  },
  searchIconBtn: {
    width: 30,
    height: 30,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    fontSize: 14,
    color: semantic.color.textPrimary,
    paddingVertical: primitive.space[1.5],
  },
  clearBtn: {
    width: 26,
    height: 26,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: primitive.space[3],
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.inversePillBg,
    borderWidth: 1,
    borderColor: semantic.color.inversePillBorder,
    gap: primitive.space[1.5],
  },
  filterTriggerActive: {
    backgroundColor: semantic.color.bgSurface,
    borderColor: semantic.color.bgSurface,
  },
  filterTriggerLabel: {
    ...semantic.type.label,
    color: semantic.color.textInverse,
  },
  filterTriggerLabelActive: {
    color: semantic.color.accent,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accent,
    paddingHorizontal: primitive.space[1],
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textInverse,
  },

  // Visual Icon Category Strip
  categorySection: {
    backgroundColor: semantic.color.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: semantic.color.borderHairline,
  },
  categoryStripContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[2.5],
    gap: primitive.space[2.5],
  },
  catTile: {
    width: 64,
    alignItems: 'center',
    gap: primitive.space[1],
  },
  catIconBox: {
    width: 44,
    height: 44,
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.accentSoft,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIconBoxFree: {
    backgroundColor: semantic.color.freeBg,
    borderColor: semantic.color.successSoft,
  },
  catIconBoxActive: {
    backgroundColor: semantic.color.accent,
    borderColor: semantic.color.accent,
    ...primitive.elevation.thumb,
  },
  catTileLabel: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
    textAlign: 'center',
  },
  catTileLabelActive: {
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.bold,
  },
  subCategoryBar: {
    backgroundColor: semantic.color.bgWarmTint,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.color.borderHairline,
    paddingVertical: primitive.space[2],
  },
  subChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: semantic.spacing.pageX,
    gap: primitive.space[2],
  },
  subChip: {
    minHeight: 30,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1],
    borderRadius: component.chip.radius,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subChipActive: {
    backgroundColor: semantic.color.textPrimary,
    borderColor: semantic.color.textPrimary,
  },
  subChipText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  subChipTextActive: {
    color: semantic.color.textInverse,
    fontWeight: primitive.fontWeight.semibold,
  },

  // Quick Sort & Discovery Strip
  quickSortBar: {
    backgroundColor: semantic.color.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: semantic.color.borderHairline,
  },
  quickSortContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[2],
    gap: primitive.space[2],
  },
  quickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: primitive.space[2.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  quickPillActive: {
    backgroundColor: semantic.color.accentSoft,
    borderColor: semantic.color.accentBorder,
  },
  quickPillFreeActive: {
    backgroundColor: semantic.color.freeFg,
    borderColor: semantic.color.freeFg,
  },
  quickPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
  },
  quickPillTextActive: {
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  quickPillFreeText: {
    color: semantic.color.freeFg,
    fontWeight: primitive.fontWeight.semibold,
  },
  quickPillTextInverse: {
    color: semantic.color.textInverse,
  },
  quickDivider: {
    width: 1,
    height: 16,
    backgroundColor: semantic.color.borderStrong,
  },

  // Active Filter Chips
  activeChipsBar: {
    backgroundColor: semantic.color.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: semantic.color.borderHairline,
    paddingVertical: primitive.space[2],
  },
  activeChipsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: semantic.spacing.pageX,
    gap: primitive.space[2],
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    paddingHorizontal: primitive.space[2.5],
    borderRadius: component.chip.radius,
    backgroundColor: component.chip.activeBg,
    borderWidth: 1,
    borderColor: component.chip.activeBorder,
    gap: primitive.space[1],
  },
  activeChipText: {
    ...semantic.type.micro,
    color: component.chip.activeFg,
    fontWeight: primitive.fontWeight.semibold,
    maxWidth: 180,
  },
  clearAllBtn: {
    minHeight: 30,
    paddingHorizontal: primitive.space[2],
    justifyContent: 'center',
  },
  clearAllText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontWeight: primitive.fontWeight.semibold,
  },

  // Advanced Filter Sheet
  sheetBody: {
    paddingTop: primitive.space[2],
    paddingBottom: primitive.space[5],
  },
  validationBanner: {
    marginBottom: primitive.space[3],
  },
  sheetSection: {
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
  },
  sheetSectionCompact: {
    paddingVertical: primitive.space[2.5],
  },
  sectionLabel: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  priceRangeRow: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  priceRangeCol: {
    flex: 1,
  },
  priceRangeHelper: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    marginTop: -primitive.space[1],
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
    marginTop: -primitive.space[1],
  },
  presetChip: {
    height: 30,
    paddingHorizontal: primitive.space[3],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipActive: {
    backgroundColor: semantic.color.accentSoft,
    borderColor: semantic.color.accentBorder,
  },
  presetChipText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  presetChipTextActive: {
    color: semantic.color.accent,
  },
  zoneWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  zoneChip: {
    minHeight: 36,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1.5],
    borderRadius: component.chip.radius,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneChipActive: {
    backgroundColor: component.chip.activeBg,
    borderColor: component.chip.activeBorder,
  },
  zoneChipText: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.medium,
  },
  zoneChipTextActive: {
    color: component.chip.activeFg,
    fontWeight: primitive.fontWeight.semibold,
  },
  radiusField: {
    marginTop: primitive.space[1],
  },
  sortList: {
    marginTop: -primitive.space[1],
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: primitive.space[2.5],
    gap: primitive.space[3],
  },
  sortRowPressed: {
    opacity: primitive.opacity.pressed,
  },
  sortTextWrap: {
    flex: 1,
    gap: 2,
  },
  sortLabel: {
    ...semantic.type.body,
    color: semantic.color.textPrimary,
  },
  sortLabelSelected: {
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.accent,
  },
  sortLabelDisabled: {
    color: semantic.color.textSecondary,
  },
  sortHint: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: primitive.radius.full,
    borderWidth: 1.5,
    borderColor: semantic.color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.color.bgSurface,
  },
  radioOuterSelected: {
    borderColor: semantic.color.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accent,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
});

export default ListingFilterBar;
