import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';
import { fetchInventoryItems } from '../inventory/api';
import type { InventoryItem, InventoryItemStatus } from '../inventory/types';
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import { useSession } from '../auth/session';
import {
  EmptyState,
  HairlineDivider,
  Icon,
  InlineBanner,
  SegmentedControl,
  StatusIndicator,
  type StatusTone,
} from './ui';
import { component, primitive, semantic } from '../theme';

export type InventoryPickerMode = 'single' | 'combo';

export interface InventoryPickerSectionProps {
  selectedItemIds: string[];
  onChangeSelectedItemIds: (nextIds: string[]) => void;
  mode: InventoryPickerMode;
  onChangeMode: (nextMode: InventoryPickerMode) => void;
  disabled?: boolean;
  error?: string;
  preselectedItemId?: string;
  currentListingItemIds?: string[];
  currentListingCountsTowardLinked?: boolean;
  onNavigateToInventoryCreate: () => void;
}

const ITEM_STATUS_META: Record<
  InventoryItemStatus,
  { label: string; tone: StatusTone; lockReason?: string }
> = {
  KHA_DUNG: {
    label: 'Khả dụng',
    tone: 'success',
  },
  DANG_GIU: {
    label: 'Đang giữ',
    tone: 'warning',
    lockReason: 'Đang được giữ chỗ trong một giao dịch khác, không thể chọn.',
  },
  DA_CHUYEN_GIAO: {
    label: 'Đã chuyển giao',
    tone: 'neutral',
    lockReason: 'Đồ vật đã chuyển giao xong, không thể đăng lại.',
  },
};

const MODE_OPTIONS: Array<{
  value: InventoryPickerMode;
  label: string;
  testID: string;
}> = [
  { value: 'single', label: 'Tin đơn', testID: 'listing-mode-single' },
  { value: 'combo', label: 'Combo (≥2 món)', testID: 'listing-mode-combo' },
];

function useOptionalNavigation(): NavigationProp<ParamListBase> | null {
  try {
    return useNavigation<NavigationProp<ParamListBase>>();
  } catch {
    return null;
  }
}

export default function InventoryPickerSection({
  selectedItemIds,
  onChangeSelectedItemIds,
  mode,
  onChangeMode,
  disabled = false,
  error,
  preselectedItemId,
  currentListingItemIds,
  currentListingCountsTowardLinked = true,
  onNavigateToInventoryCreate,
}: InventoryPickerSectionProps) {
  const navigation = useOptionalNavigation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const appliedPreselectRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const loadInventory = useCallback(async () => {
    loadingRef.current = true;
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchInventoryItems();
      setItems(data);
    } catch (err) {
      if (isRestrictedError(err)) {
        if (!useSession.getState().restriction) {
          useSession.setState({ restriction: err.restriction, restrictionDismissed: false });
        }
        setLoadError('');
        return;
      }
      const parsed = extractApiError(err, 'Không thể tải danh sách kho đồ cá nhân.');
      setLoadError(parsed.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') return;
    return navigation.addListener('focus', () => {
      if (!loadingRef.current) {
        void loadInventory();
      }
    });
  }, [navigation, loadInventory]);

  useEffect(() => {
    if (selectedItemIds.length >= 2 && mode !== 'combo') {
      onChangeMode('combo');
    }
  }, [selectedItemIds.length, mode, onChangeMode]);

  useEffect(() => {
    if (!preselectedItemId || loading) return;
    if (appliedPreselectRef.current === preselectedItemId) return;
    if (selectedItemIds.length > 0) {
      appliedPreselectRef.current = preselectedItemId;
      return;
    }

    const match = items.find(
      (item) => item.id === preselectedItemId && item.trangThai === 'KHA_DUNG',
    );
    if (match) {
      appliedPreselectRef.current = preselectedItemId;
      onChangeSelectedItemIds([match.id]);
    }
  }, [preselectedItemId, loading, items, selectedItemIds.length, onChangeSelectedItemIds]);

  const handleSwitchMode = (nextMode: InventoryPickerMode) => {
    if (disabled || nextMode === mode) return;
    onChangeMode(nextMode);
    if (nextMode === 'single' && selectedItemIds.length > 1) {
      onChangeSelectedItemIds([selectedItemIds[0]]);
    }
  };

  const handleToggleItem = (item: InventoryItem) => {
    if (disabled) return;

    const alreadySelected = selectedItemIds.includes(item.id);
    if (alreadySelected) {
      onChangeSelectedItemIds(selectedItemIds.filter((id) => id !== item.id));
      return;
    }

    if (item.trangThai !== 'KHA_DUNG') return;

    if (mode === 'single') {
      onChangeSelectedItemIds([item.id]);
      return;
    }

    const next = [...selectedItemIds, item.id];
    onChangeSelectedItemIds(next);
    if (next.length >= 2 && mode !== 'combo') {
      onChangeMode('combo');
    }
  };

  const availableCount = items.filter((item) => item.trangThai === 'KHA_DUNG').length;
  const selectionSummary =
    selectedItemIds.length === 0
      ? 'Chưa chọn đồ vật'
      : selectedItemIds.length >= 2 || mode === 'combo'
        ? `Đã chọn ${selectedItemIds.length} món · Combo`
        : 'Đã chọn 1 món · Tin đơn';

  return (
    <View style={styles.container} testID="inventory-picker-section">
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Đồ vật từ Kho đồ
          </Text>
          <Text style={styles.requiredMark}>*</Text>
        </View>
        <Text
          style={[styles.summaryCaption, selectedItemIds.length > 0 && styles.summaryCaptionActive]}
          testID="inventory-selection-summary"
        >
          {selectionSummary}
        </Text>
      </View>

      <Text style={styles.caption}>
        Chọn 1 đồ vật cho Tin đơn, hoặc từ 2 đồ vật trở lên cho Combo.
      </Text>

      <SegmentedControl
        options={MODE_OPTIONS}
        value={mode}
        onChange={handleSwitchMode}
        disabled={disabled}
        accessibilityLabel="Hình thức tin đăng"
        testID="inventory-mode-segmented"
      />

      {mode === 'combo' && selectedItemIds.length < 2 ? (
        <InlineBanner
          tone="warning"
          testID="combo-mode-hint"
          message={`Chế độ Combo yêu cầu chọn ít nhất 2 đồ vật khả dụng (hiện đã chọn ${selectedItemIds.length}).`}
        />
      ) : null}

      {loading ? (
        <View style={styles.loadingRow} testID="inventory-picker-loading">
          <ActivityIndicator color={semantic.color.accent} size="small" />
          <Text style={styles.caption}>Đang tải Kho đồ cá nhân...</Text>
        </View>
      ) : loadError ? (
        <InlineBanner
          tone="danger"
          message={loadError}
          actionLabel="Tải lại kho đồ"
          actionTestID="inventory-picker-retry"
          onActionPress={() => void loadInventory()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          testID="inventory-picker-empty"
          icon="package"
          title="Kho đồ cá nhân đang trống"
          subtitle="Thêm ít nhất 1 đồ vật thực tế vào Kho đồ cá nhân trước khi đăng tin bán hoặc cho tặng."
          primaryActionLabel="Tạo đồ vật trong Kho"
          onPrimaryAction={onNavigateToInventoryCreate}
          primaryActionTestID="go-to-inventory-cta"
          secondaryActionLabel="Tải lại kho đồ"
          onSecondaryAction={() => void loadInventory()}
          secondaryActionTestID="inventory-picker-refresh-empty"
          style={styles.emptyStateFlush}
        />
      ) : (
        <View style={styles.listWrap}>
          {availableCount === 0 ? (
            <EmptyState
              testID="inventory-picker-no-available"
              icon="package"
              title="Chưa có đồ vật khả dụng"
              subtitle="Tất cả đồ vật hiện đang được giữ chỗ hoặc đã chuyển giao. Bạn có thể thêm đồ vật mới vào kho."
              primaryActionLabel="Tạo đồ vật trong Kho"
              onPrimaryAction={onNavigateToInventoryCreate}
              primaryActionTestID="go-to-inventory-cta"
              secondaryActionLabel="Tải lại kho đồ"
              onSecondaryAction={() => void loadInventory()}
              secondaryActionTestID="inventory-picker-refresh-no-available"
              style={styles.emptyStateFlush}
            />
          ) : null}

          {items.map((item, index) => {
            const statusMeta = ITEM_STATUS_META[item.trangThai] ?? ITEM_STATUS_META.KHA_DUNG;
            const isSelected = selectedItemIds.includes(item.id);
            const isUnavailable = item.trangThai !== 'KHA_DUNG';
            const canToggle = !disabled && (!isUnavailable || isSelected);
            const thumb = item.hinhAnh[0];

            const isInCurrentListing = Boolean(currentListingItemIds?.includes(item.id));
            const otherLinkedCount =
              isInCurrentListing && currentListingCountsTowardLinked
                ? Math.max(0, item.linkedListingCount - 1)
                : item.linkedListingCount;
            const sharedLinkLabel = isInCurrentListing
              ? otherLinkedCount > 0
                ? `Đang gắn tin này và ${otherLinkedCount} tin khác`
                : 'Đang gắn tin này'
              : item.linkedListingCount > 0
                ? `Đang gắn ${item.linkedListingCount} tin khác`
                : null;

            return (
              <Fragment key={item.id}>
                {index > 0 ? <HairlineDivider insetLeft={36} /> : null}
                <Pressable
                  testID={`inventory-picker-item-${item.id}`}
                  accessibilityRole="checkbox"
                  accessibilityLabel={item.ten}
                  accessibilityState={{ checked: isSelected, disabled: !canToggle }}
                  disabled={!canToggle}
                  onPress={() => handleToggleItem(item)}
                  style={({ pressed }) => [
                    styles.itemRow,
                    isSelected && !isUnavailable && styles.itemRowSelected,
                    isSelected && isUnavailable && styles.itemRowConflict,
                    !canToggle && styles.itemRowDisabled,
                    pressed && canToggle && styles.itemRowPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      isSelected && !isUnavailable && styles.checkboxChecked,
                      isSelected && isUnavailable && styles.checkboxConflict,
                      !canToggle && styles.checkboxDisabled,
                    ]}
                  >
                    {isSelected ? (
                      <Icon name="check" size={14} color={semantic.color.textInverse} />
                    ) : null}
                  </View>

                  {thumb ? (
                    <Image
                      source={{ uri: thumb }}
                      style={styles.thumb}
                      resizeMode="cover"
                      accessibilityLabel={item.ten}
                    />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Icon name="package" size={18} color={semantic.color.textSecondary} />
                    </View>
                  )}

                  <View style={styles.itemBody}>
                    <View style={styles.itemTopRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.ten}
                      </Text>
                      <StatusIndicator
                        label={statusMeta.label}
                        tone={statusMeta.tone}
                        variant="dot"
                      />
                    </View>

                    <Text style={styles.itemCondition} numberOfLines={2}>
                      {item.tinhTrang}
                    </Text>

                    {isUnavailable && isSelected ? (
                      <Text
                        style={styles.conflictHint}
                        testID={`inventory-picker-unselect-hint-${item.id}`}
                      >
                        Đồ vật không còn khả dụng — chạm để bỏ chọn
                      </Text>
                    ) : statusMeta.lockReason ? (
                      <Text style={styles.lockReason}>{statusMeta.lockReason}</Text>
                    ) : sharedLinkLabel ? (
                      <Text style={styles.sharedInfo}>{sharedLinkLabel}</Text>
                    ) : null}
                  </View>
                </Pressable>
              </Fragment>
            );
          })}
        </View>
      )}

      {error ? <InlineBanner tone="danger" message={error} /> : null}
    </View>
  );
}

const THUMB_SIZE = 48;

const styles = StyleSheet.create({
  container: {
    gap: primitive.space[3],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
  },
  sectionTitle: {
    ...semantic.type.sectionTitle,
  },
  requiredMark: {
    ...semantic.type.sectionTitle,
    color: semantic.color.accent,
  },
  summaryCaption: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  summaryCaptionActive: {
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  caption: {
    ...semantic.type.caption,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    paddingVertical: primitive.space[3],
  },
  emptyStateFlush: {
    paddingVertical: primitive.space[5],
    paddingHorizontal: primitive.space[2],
  },
  listWrap: {
    backgroundColor: semantic.color.bgSurface,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    paddingVertical: primitive.space[3],
    paddingHorizontal: primitive.space[1.5],
    gap: primitive.space[3],
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSurface,
  },
  itemRowSelected: {
    backgroundColor: semantic.color.accentSoft,
  },
  itemRowConflict: {
    backgroundColor: semantic.color.dangerSoft,
  },
  itemRowDisabled: {
    opacity: 0.55,
  },
  itemRowPressed: {
    backgroundColor: semantic.color.bgSubtle,
  },
  checkboxBox: {
    width: component.toggle.checkboxSize,
    height: component.toggle.checkboxSize,
    borderRadius: component.toggle.checkboxRadius,
    borderWidth: 1.5,
    borderColor: semantic.color.borderStrong,
    backgroundColor: semantic.color.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: component.toggle.onBg,
    borderColor: component.toggle.onBg,
  },
  checkboxConflict: {
    backgroundColor: semantic.color.danger,
    borderColor: semantic.color.danger,
  },
  checkboxDisabled: {
    borderColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgTrack,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    backgroundColor: semantic.color.bgTrack,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  thumbPlaceholder: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
    gap: 3,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  itemName: {
    ...semantic.type.cardTitle,
    flex: 1,
  },
  itemCondition: {
    ...semantic.type.caption,
  },
  conflictHint: {
    ...semantic.type.micro,
    color: semantic.color.danger,
    fontWeight: primitive.fontWeight.semibold,
  },
  lockReason: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  sharedInfo: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
});
