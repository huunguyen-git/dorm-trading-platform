import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  normalizeSearchTypeParam,
  type DiscoveryListingTypeFilter,
  type DiscoverySearchFilters,
} from '../listings/discoveryApi';
import { countActiveDiscoveryFilters } from '../listings/discoveryStore';
import type {
  CategoryTreeNode,
  ListingCategory,
  ListingSortOption,
  LocationZone,
} from '../listings/types';
import { colors, radius, space } from '../theme';
import { Action, Notice } from './AuthUI';

export interface ListingFilterBarProps {
  filters: DiscoverySearchFilters;
  categories: ListingCategory[];
  categoryTree: CategoryTreeNode[];
  locations: LocationZone[];
  loading?: boolean;
  onApply: (nextFilters: DiscoverySearchFilters) => void;
  onReset: () => void;
}

const TYPE_OPTIONS: Array<{
  value: DiscoveryListingTypeFilter | undefined;
  label: string;
  testID: string;
}> = [
  { value: undefined, label: 'Tất cả', testID: 'filter-type-all' },
  { value: 'SINGLE', label: 'Tin đơn', testID: 'filter-type-single' },
  { value: 'COMBO', label: 'Combo', testID: 'filter-type-combo' },
];

const SORT_OPTIONS: Array<{ value: ListingSortOption; label: string; requiresLocation?: boolean }> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá tăng dần' },
  { value: 'price_desc', label: 'Giá giảm dần' },
  { value: 'distance_asc', label: 'Gần nhất', requiresLocation: true },
];

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
    setExpanded(false);
    onReset();
  };

  return (
    <View style={styles.container} testID="listing-filter-bar">
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          testID="search-input"
          accessibilityLabel="Tìm kiếm tin đăng"
          placeholder="Tìm kiếm theo tiêu đề, mô tả, mã môn..."
          placeholderTextColor={colors.muted}
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
            onPress={handleClearSearchText}
            style={styles.clearInlineBtn}
          >
            <Text style={styles.clearInlineText}>✕</Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="search-submit-button"
          accessibilityRole="button"
          accessibilityLabel="Tìm kiếm"
          disabled={loading}
          onPress={handleSearchSubmit}
          style={({ pressed }) => [
            styles.searchSubmitBtn,
            pressed && { opacity: 0.85 },
            loading && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.searchSubmitText}>Tìm</Text>
        </Pressable>
      </View>

      {/* Quick horizontal category chips */}
      {rootCategories.length > 0 ? (
        <View style={styles.categoryGroup}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              testID="category-chip-all"
              accessibilityRole="button"
              accessibilityState={{ selected: !filters.categoryId }}
              onPress={() => handleSelectCategory(undefined)}
              style={[styles.chip, !filters.categoryId && styles.chipActive]}
            >
              <Text style={[styles.chipText, !filters.categoryId && styles.chipTextActive]}>
                Tất cả
              </Text>
            </Pressable>
            {rootCategories.map((root) => {
              const isSelected =
                filters.categoryId === root.id || activeRoot?.id === root.id;
              return (
                <Pressable
                  key={root.id}
                  testID={`category-chip-${root.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => handleSelectCategory(root.id)}
                  style={[styles.chip, isSelected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                    {root.name}
                    {root.children.length > 0 ? ' ▾' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {activeRoot && activeRoot.children.length > 0 ? (
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
                style={[
                  styles.subChip,
                  filters.categoryId === activeRoot.id && styles.subChipActive,
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
                    style={[styles.subChip, isChildSelected && styles.subChipActive]}
                  >
                    <Text style={[styles.subChipText, isChildSelected && styles.subChipTextActive]}>
                      {child.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      {/* Advanced filter toggle + quick reset */}
      <View style={styles.toolbarRow}>
        <Pressable
          testID="toggle-advanced-filters"
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((prev) => !prev)}
          style={[styles.toggleBtn, (expanded || activeFilterCount > 0) && styles.toggleBtnActive]}
        >
          <Text
            style={[
              styles.toggleBtnText,
              (expanded || activeFilterCount > 0) && styles.toggleBtnTextActive,
            ]}
          >
            {expanded ? 'Thu gọn bộ lọc' : 'Bộ lọc nâng cao'}
          </Text>
          {activeFilterCount > 0 ? (
            <View style={styles.countBadge} testID="active-filter-count-badge">
              <Text style={styles.countBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>

        {activeFilterCount > 0 ? (
          <Pressable
            testID="quick-reset-filters"
            accessibilityRole="button"
            onPress={handleResetAll}
            style={styles.quickResetBtn}
          >
            <Text style={styles.quickResetText}>Xóa bộ lọc</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Collapsible advanced filter panel */}
      {expanded ? (
        <View style={styles.panel} testID="advanced-filter-panel">
          {validationError ? <Notice message={validationError} error /> : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Mã môn học</Text>
            <TextInput
              testID="filter-course-code"
              accessibilityLabel="Mã môn học"
              placeholder="VD: SE100, IT001"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              value={courseCode}
              onChangeText={setCourseCode}
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Giá tối đa (VNĐ)</Text>
            <TextInput
              testID="filter-max-price"
              accessibilityLabel="Giá tối đa (VNĐ)"
              placeholder="VD: 150000"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              editable={!freeOnly}
              value={freeOnly ? '0' : maxPriceText}
              onChangeText={setMaxPriceText}
              style={[styles.input, freeOnly && styles.inputDisabled]}
            />
            <Pressable
              testID="filter-free-only"
              accessibilityRole="switch"
              accessibilityLabel="Chỉ tin miễn phí (0đ)"
              accessibilityState={{ checked: freeOnly }}
              onPress={() => {
                setFreeOnly((prev) => {
                  const next = !prev;
                  if (next) setMaxPriceText('');
                  return next;
                });
              }}
              style={[styles.switchRow, freeOnly && styles.switchRowActive]}
            >
              <View style={[styles.checkbox, freeOnly && styles.checkboxChecked]}>
                {freeOnly ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.switchText}>Chỉ tin miễn phí (0đ)</Text>
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Loại tin</Text>
            <View style={styles.wrapChips}>
              {TYPE_OPTIONS.map((option) => {
                const selected = listingType === option.value;
                return (
                  <Pressable
                    key={option.label}
                    testID={option.testID}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setListingType(option.value)}
                    style={[styles.chip, selected && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Khu vực ĐHQG-HCM</Text>
            <View style={styles.wrapChips}>
              <Pressable
                testID="filter-location-all"
                accessibilityRole="button"
                accessibilityState={{ selected: !locationCode }}
                onPress={() => handleSelectZone(null)}
                style={[styles.chip, !locationCode && styles.chipActive]}
              >
                <Text style={[styles.chipText, !locationCode && styles.chipTextActive]}>
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
                    style={[styles.chip, selected && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {zone.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ marginTop: space.sm, gap: space.xs }}>
              <Text style={styles.subLabel}>Bán kính tìm kiếm (km, tùy chọn)</Text>
              <TextInput
                testID="filter-radius-km"
                accessibilityLabel="Bán kính tìm kiếm (km)"
                placeholder={
                  selectedZone
                    ? `Nhập khoảng cách từ ${selectedZone.name} (VD: 1.5)`
                    : 'Chọn khu vực trước để nhập bán kính (km)'
                }
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                editable={Boolean(selectedZone)}
                value={radiusText}
                onChangeText={setRadiusText}
                style={[styles.input, !selectedZone && styles.inputDisabled]}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Sắp xếp</Text>
            <View style={styles.wrapChips}>
              {SORT_OPTIONS.map((option) => {
                const disabled = Boolean(option.requiresLocation && !selectedZone);
                const selected = sort === option.value && !disabled;
                return (
                  <Pressable
                    key={option.value}
                    testID={`sort-${option.value}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled }}
                    disabled={disabled}
                    onPress={() => setSort(option.value)}
                    style={[
                      styles.chip,
                      selected && styles.chipActive,
                      disabled && styles.chipDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.chipTextActive,
                        disabled && styles.chipTextDisabled,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.panelActions}>
            <View style={{ flex: 1 }}>
              <Action
                title="Đặt lại"
                secondary
                testID="reset-filters-button"
                onPress={handleResetAll}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Action
                title="Áp dụng bộ lọc"
                testID="apply-filters-button"
                busy={loading}
                onPress={handleApplyAdvanced}
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingLeft: space.md,
    paddingRight: space.xs,
    paddingVertical: space.xs,
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    fontSize: 15,
    color: colors.ink,
  },
  clearInlineBtn: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  clearInlineText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  searchSubmitBtn: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: space.md,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchSubmitText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },
  categoryGroup: {
    gap: space.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: space.xs,
    paddingVertical: 2,
  },
  subChipRow: {
    flexDirection: 'row',
    gap: space.xs,
    paddingLeft: space.sm,
    paddingVertical: 2,
  },
  wrapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.surface,
    fontWeight: '700',
  },
  chipTextDisabled: {
    color: colors.muted,
  },
  subChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#f2ede4',
    borderWidth: 1,
    borderColor: colors.line,
  },
  subChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  subChipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '500',
  },
  subChipTextActive: {
    color: colors.surface,
    fontWeight: '700',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  toggleBtnActive: {
    borderColor: colors.brand,
    backgroundColor: '#fdf6f4',
  },
  toggleBtnText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: colors.brand,
  },
  countBadge: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: '700',
  },
  quickResetBtn: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  quickResetText: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '600',
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.md,
  },
  fieldGroup: {
    gap: space.xs,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  subLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 44,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  inputDisabled: {
    backgroundColor: '#f5f4ef',
    color: colors.muted,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#f9f8f5',
  },
  switchRowActive: {
    borderColor: '#137333',
    backgroundColor: '#e6f4ea',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: '#137333',
    borderColor: '#137333',
  },
  checkmark: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  switchText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '500',
  },
  panelActions: {
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});

export default ListingFilterBar;
