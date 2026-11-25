import { useEffect, useMemo, useState } from 'react';
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
  UnderlineTabs,
  type SegmentedOption,
  type UnderlineTabItem,
} from './ui';

export interface ListingFilterBarProps {
  filters: DiscoverySearchFilters;
  categories: ListingCategory[];
  categoryTree: CategoryTreeNode[];
  locations: LocationZone[];
  loading?: boolean;
  onApply: (nextFilters: DiscoverySearchFilters) => void;
  onReset: () => void;
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
  requiresLocation?: boolean;
}> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá thấp đến cao' },
  { value: 'price_desc', label: 'Giá cao đến thấp' },
  { value: 'distance_asc', label: 'Gần nhất', requiresLocation: true },
];

interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
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
}: ListingFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [queryText, setQueryText] = useState(filters.q ?? '');
  const [courseCode, setCourseCode] = useState(filters.courseCode ?? '');
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

  useEffect(() => {
    setQueryText(filters.q ?? '');
    setCourseCode(filters.courseCode ?? '');
    setMaxPriceText(filters.maxPrice !== undefined ? String(filters.maxPrice) : '');
    setFreeOnly(Boolean(filters.freeOnly));
    setListingType(normalizeSearchTypeParam(filters.type));
    setLocationCode(filters.locationCode);
    setRadiusText(filters.radiusKm !== undefined ? String(filters.radiusKm) : '');
    setSort(filters.sort ?? 'newest');
    setValidationError('');
  }, [filters]);

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

  const categoryTabs = useMemo<UnderlineTabItem<string>[]>(
    () => [
      { value: ALL_CATEGORY_VALUE, label: 'Tất cả', testID: 'category-chip-all' },
      ...rootCategories.map((root) => ({
        value: root.id,
        label: root.name,
        testID: `category-chip-${root.id}`,
      })),
    ],
    [rootCategories],
  );

  const selectedZone = useMemo(
    () => locations.find((zone) => zone.code === locationCode) ?? null,
    [locations, locationCode],
  );

  const activeFilterCount = useMemo(() => countActiveDiscoveryFilters(filters), [filters]);

  const handleSearchSubmit = () => {
    setValidationError('');
    onApply({
      ...filters,
      q: queryText.trim() || undefined,
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
      categoryId,
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

    let parsedMaxPrice: number | undefined;
    if (!freeOnly && maxPriceText.trim()) {
      const normalized = parseFilterPriceInput(maxPriceText);
      if (!Number.isFinite(normalized) || normalized < 0) {
        setValidationError('Giá tối đa phải là số không âm hợp lệ.');
        return;
      }
      parsedMaxPrice = Math.round(normalized);
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
      q: queryText.trim() || undefined,
      courseCode: courseCode.trim() || undefined,
      maxPrice: freeOnly ? undefined : parsedMaxPrice,
      minPrice: freeOnly ? undefined : filters.minPrice,
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

  return (
    <View style={styles.container} testID="listing-filter-bar">
      {/* Compact soft-filled search bar + Filter trigger */}
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
            <Icon name="search" size={18} color={semantic.color.textSecondary} />
          </Pressable>

          <TextInput
            testID="search-input"
            accessibilityLabel="Tìm kiếm tin đăng"
            placeholder="Tìm giáo trình, đồ dùng, mã môn..."
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
              <Icon name="x" size={15} color={semantic.color.textSecondary} />
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
            size={16}
            color={isFilterActive ? semantic.color.accent : semantic.color.textPrimary}
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

      {/* Category UnderlineTabs + flush child strip */}
      {rootCategories.length > 0 ? (
        <View style={styles.categorySection}>
          <UnderlineTabs
            testID="category-underline-tabs"
            accessibilityLabel="Danh mục tin đăng"
            items={categoryTabs}
            value={activeRoot?.id ?? ALL_CATEGORY_VALUE}
            onChange={(nextValue) =>
              handleSelectCategory(nextValue === ALL_CATEGORY_VALUE ? undefined : nextValue)
            }
          />

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
                    Tất cả {activeRoot.name}
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
              if (next) setMaxPriceText('');
            }}
          />
        </View>

        <HairlineDivider />

        {/* Price & Course Code */}
        <View style={styles.sheetSection}>
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
            helperText={freeOnly ? 'Đã tắt mức giá khi chọn chỉ tin miễn phí.' : undefined}
          />

          <FormField
            testID="filter-course-code"
            label="Mã môn học"
            accessibilityLabel="Mã môn học"
            placeholder="VD: SE100, IT001"
            autoCapitalize="characters"
            autoCorrect={false}
            value={courseCode}
            onChangeText={setCourseCode}
          />
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
                ? `Từ ${selectedZone.name} (VD: 1.5)`
                : 'Chọn khu vực trước để nhập bán kính'
            }
            keyboardType="decimal-pad"
            editable={Boolean(selectedZone)}
            value={radiusText}
            onChangeText={setRadiusText}
            containerStyle={styles.radiusField}
          />
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
                        <Text style={styles.sortHint}>Chọn khu vực ĐHQG-HCM để bật sắp xếp gần nhất</Text>
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
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[1],
    paddingBottom: primitive.space[2.5],
    gap: primitive.space[2],
    backgroundColor: semantic.color.bgSurface,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.bgSubtle,
    paddingLeft: primitive.space[2],
    paddingRight: primitive.space[2],
    gap: primitive.space[1.5],
  },
  searchIconBtn: {
    width: 32,
    height: 32,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    fontSize: primitive.fontSize.base,
    color: semantic.color.textPrimary,
    paddingVertical: primitive.space[1.5],
  },
  clearBtn: {
    width: 28,
    height: 28,
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
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.bgSubtle,
    gap: primitive.space[1.5],
  },
  filterTriggerActive: {
    backgroundColor: semantic.color.accentSoft,
    borderColor: semantic.color.accentBorder,
  },
  filterTriggerLabel: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
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
  categorySection: {
    backgroundColor: semantic.color.bgSurface,
  },
  subCategoryBar: {
    backgroundColor: semantic.color.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: semantic.color.borderHairline,
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
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subChipActive: {
    backgroundColor: semantic.color.textPrimary,
  },
  subChipText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  subChipTextActive: {
    color: semantic.color.textInverse,
    fontWeight: primitive.fontWeight.semibold,
  },
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
