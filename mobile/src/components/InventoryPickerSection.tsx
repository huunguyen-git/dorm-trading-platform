import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Action, Notice, ui } from './AuthUI';
import { colors, radius, space } from '../theme';

export type InventoryPickerMode = 'single' | 'combo';

export interface InventoryPickerSectionProps {
  selectedItemIds: string[];
  onChangeSelectedItemIds: (nextIds: string[]) => void;
  mode: InventoryPickerMode;
  onChangeMode: (nextMode: InventoryPickerMode) => void;
  disabled?: boolean;
  error?: string;
  preselectedItemId?: string;
  onNavigateToInventoryCreate: () => void;
}

const ITEM_STATUS_STYLE: Record<
  InventoryItemStatus,
  { label: string; bg: string; fg: string; lockReason?: string }
> = {
  KHA_DUNG: {
    label: 'Khả dụng',
    bg: '#e6f4ea',
    fg: '#137333',
  },
  DANG_GIU: {
    label: 'Đang giữ',
    bg: '#fef7e0',
    fg: '#b06000',
    lockReason: 'Đang được giữ chỗ trong một giao dịch khác, không thể chọn.',
  },
  DA_CHUYEN_GIAO: {
    label: 'Đã chuyển giao',
    bg: '#f1f3f4',
    fg: '#5f6368',
    lockReason: 'Đồ vật đã chuyển giao xong, không thể đăng lại.',
  },
};

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

  // Automatically sync mode to combo whenever >= 2 items are selected
  useEffect(() => {
    if (selectedItemIds.length >= 2 && mode !== 'combo') {
      onChangeMode('combo');
    }
  }, [selectedItemIds.length, mode, onChangeMode]);

  // Preselect item from route param once inventory is loaded
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

  return (
    <View style={styles.container} testID="inventory-picker-section">
      <View style={styles.headerRow}>
        <Text style={ui.label}>Đồ vật từ Kho đồ cá nhân *</Text>
        <View style={styles.summaryPill} testID="inventory-selection-summary">
          <Text style={styles.summaryPillText}>
            {selectedItemIds.length === 0
              ? 'Chưa chọn đồ vật'
              : selectedItemIds.length >= 2 || mode === 'combo'
                ? `Đã chọn ${selectedItemIds.length} món · Combo`
                : 'Đã chọn 1 món · Tin đơn'}
          </Text>
        </View>
      </View>

      <Text style={ui.caption}>
        Mỗi tin đăng gắn trực tiếp với 1 đồ vật (Tin đơn) hoặc từ 2 đồ vật trở lên (Tin combo bán trọn bộ).
      </Text>

      <View style={styles.modeRow}>
        <Pressable
          testID="listing-mode-single"
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'single', disabled }}
          disabled={disabled}
          onPress={() => handleSwitchMode('single')}
          style={[
            styles.modeBtn,
            mode === 'single' && styles.modeBtnActive,
            disabled && styles.modeBtnDisabled,
          ]}
        >
          <Text style={[styles.modeBtnText, mode === 'single' && styles.modeBtnTextActive]}>
            Tin đơn (1 đồ vật)
          </Text>
        </Pressable>

        <Pressable
          testID="listing-mode-combo"
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'combo', disabled }}
          disabled={disabled}
          onPress={() => handleSwitchMode('combo')}
          style={[
            styles.modeBtn,
            mode === 'combo' && styles.modeBtnActive,
            disabled && styles.modeBtnDisabled,
          ]}
        >
          <Text style={[styles.modeBtnText, mode === 'combo' && styles.modeBtnTextActive]}>
            Tin combo (từ 2 đồ vật)
          </Text>
        </Pressable>
      </View>

      {mode === 'combo' && selectedItemIds.length < 2 ? (
        <View style={styles.comboHintBox} testID="combo-mode-hint">
          <Text style={styles.comboHintText}>
            Chế độ Tin combo yêu cầu chọn ít nhất 2 đồ vật khả dụng (hiện đã chọn {selectedItemIds.length}).
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingBox} testID="inventory-picker-loading">
          <ActivityIndicator color={colors.brand} size="small" />
          <Text style={ui.caption}>Đang tải Kho đồ cá nhân…</Text>
        </View>
      ) : loadError ? (
        <View style={{ gap: space.sm }}>
          <Notice message={loadError} error />
          <Action
            secondary
            title="Tải lại kho đồ"
            testID="inventory-picker-retry"
            onPress={() => void loadInventory()}
          />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox} testID="inventory-picker-empty">
          <Text style={styles.emptyTitle}>Kho đồ cá nhân đang trống</Text>
          <Text style={styles.emptyCaption}>
            Hãy thêm ít nhất 1 đồ vật thực tế vào Kho đồ cá nhân trước khi đăng tin bán hoặc cho tặng.
          </Text>
          <View style={styles.emptyCtaWrap}>
            <Action
              secondary
              title="Đi tới Kho đồ cá nhân"
              testID="go-to-inventory-cta"
              onPress={onNavigateToInventoryCreate}
            />
            <Action
              secondary
              title="Tải lại kho đồ"
              testID="inventory-picker-refresh-empty"
              onPress={() => void loadInventory()}
            />
          </View>
        </View>
      ) : (
        <View style={styles.itemList}>
          {availableCount === 0 ? (
            <View style={styles.emptyBox} testID="inventory-picker-no-available">
              <Text style={styles.emptyTitle}>Chưa có đồ vật khả dụng</Text>
              <Text style={styles.emptyCaption}>
                Tất cả đồ vật hiện tại đang được giữ chỗ hoặc đã chuyển giao. Bạn có thể thêm đồ vật mới vào kho.
              </Text>
              <View style={styles.emptyCtaWrap}>
                <Action
                  secondary
                  title="Đi tới Kho đồ cá nhân"
                  testID="go-to-inventory-cta"
                  onPress={onNavigateToInventoryCreate}
                />
                <Action
                  secondary
                  title="Tải lại kho đồ"
                  testID="inventory-picker-refresh-no-available"
                  onPress={() => void loadInventory()}
                />
              </View>
            </View>
          ) : null}

          {items.map((item) => {
            const statusMeta = ITEM_STATUS_STYLE[item.trangThai] ?? ITEM_STATUS_STYLE.KHA_DUNG;
            const isSelected = selectedItemIds.includes(item.id);
            const isUnavailable = item.trangThai !== 'KHA_DUNG';
            const canToggle = !disabled && (!isUnavailable || isSelected);
            const thumb = item.hinhAnh[0];

            return (
              <Pressable
                key={item.id}
                testID={`inventory-picker-item-${item.id}`}
                accessibilityRole="checkbox"
                accessibilityLabel={item.ten}
                accessibilityState={{ checked: isSelected, disabled: !canToggle }}
                disabled={!canToggle}
                onPress={() => handleToggleItem(item)}
                style={[
                  styles.itemCard,
                  isSelected && styles.itemCardSelected,
                  isSelected && isUnavailable && styles.itemCardSelectedWarning,
                  !canToggle && styles.itemCardDisabled,
                ]}
              >
                <View style={styles.checkbox}>
                  <View
                    style={[
                      styles.checkboxInner,
                      isSelected && styles.checkboxInnerSelected,
                      !canToggle && styles.checkboxInnerDisabled,
                    ]}
                  >
                    {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                </View>

                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} accessibilityLabel={item.ten} />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Text style={styles.thumbPlaceholderText}>Chưa có ảnh</Text>
                  </View>
                )}

                <View style={styles.itemBody}>
                  <View style={styles.itemTopRow}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.ten}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
                      <Text style={[styles.statusPillText, { color: statusMeta.fg }]}>
                        {statusMeta.label}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.itemCondition} numberOfLines={2}>
                    {item.tinhTrang}
                  </Text>

                  {isUnavailable && isSelected ? (
                    <Text
                      style={styles.lockReason}
                      testID={`inventory-picker-unselect-hint-${item.id}`}
                    >
                      Đồ vật không còn khả dụng — chạm để bỏ chọn
                    </Text>
                  ) : statusMeta.lockReason ? (
                    <Text style={styles.lockReason}>{statusMeta.lockReason}</Text>
                  ) : item.linkedListingCount > 0 ? (
                    <Text style={styles.sharedInfo}>
                      Đang gắn {item.linkedListingCount} tin khác (có thể dùng chung cho đến khi giữ chỗ)
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {error ? <Notice message={error} error /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  summaryPill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: 16,
    backgroundColor: '#f2ede4',
    borderWidth: 1,
    borderColor: colors.line,
  },
  summaryPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  modeRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  modeBtn: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#f9f8f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  modeBtnDisabled: {
    opacity: 0.5,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
  },
  modeBtnTextActive: {
    color: colors.surface,
  },
  comboHintBox: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: '#fef7e0',
    borderWidth: 1,
    borderColor: '#f0d796',
  },
  comboHintText: {
    fontSize: 13,
    color: '#8a4f00',
    lineHeight: 19,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: '#f9f8f5',
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyBox: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: '#f2ede4',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    gap: space.sm,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  emptyCaption: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyCtaWrap: {
    marginTop: space.xs,
    width: '100%',
    maxWidth: 300,
    gap: space.sm,
  },
  itemList: {
    gap: space.sm,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  itemCardSelected: {
    borderColor: colors.brand,
    borderWidth: 1.5,
    backgroundColor: '#fdf8f6',
  },
  itemCardSelectedWarning: {
    borderColor: colors.danger,
    backgroundColor: '#fff5f3',
  },
  itemCardDisabled: {
    backgroundColor: '#f5f4ef',
    opacity: 0.72,
  },
  checkbox: {
    paddingTop: 2,
  },
  checkboxInner: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxInnerSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  checkboxInnerDisabled: {
    borderColor: colors.line,
    backgroundColor: '#ecebe4',
  },
  checkmark: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#ecebe4',
  },
  thumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#ecebe4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  thumbPlaceholderText: {
    fontSize: 10,
    color: colors.muted,
    textAlign: 'center',
  },
  itemBody: {
    flex: 1,
    gap: 4,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.xs,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  statusPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemCondition: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  lockReason: {
    fontSize: 12,
    color: '#a12d24',
    fontWeight: '500',
    lineHeight: 17,
  },
  sharedInfo: {
    fontSize: 11,
    color: colors.brand,
    fontWeight: '500',
  },
});
