import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { resolveUserRestriction, useSession } from '../auth/session';
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import { useSellerListings } from '../listings/sellerStore';
import {
  formatShortDate,
  formatVnd,
  LISTING_STATUS_META,
  type ListingStatus,
  type ListingSummary,
} from '../listings/types';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import { Action, Notice, ui } from '../components/AuthUI';
import { colors, radius, space, text } from '../theme';

const STATUS_FILTERS: Array<{ value: ListingStatus | ''; label: string; testIdKey: string }> = [
  { value: '', label: 'Tất cả', testIdKey: 'ALL' },
  { value: 'CONG_KHAI', label: 'Đang hiển thị', testIdKey: 'CONG_KHAI' },
  { value: 'NHAP', label: 'Bản nháp', testIdKey: 'NHAP' },
  { value: 'GIU_CHO', label: 'Đang giữ chỗ', testIdKey: 'GIU_CHO' },
  { value: 'CHO_DUYET', label: 'Chờ duyệt', testIdKey: 'CHO_DUYET' },
  { value: 'HET_HAN', label: 'Hết hạn', testIdKey: 'HET_HAN' },
  { value: 'DA_RUT', label: 'Đã rút', testIdKey: 'DA_RUT' },
];

const EDITABLE_STATUSES: ReadonlySet<ListingStatus> = new Set([
  'NHAP',
  'CHO_DUYET',
  'CONG_KHAI',
  'DA_RUT',
  'HET_HAN',
]);

const DELETABLE_STATUSES: ReadonlySet<ListingStatus> = new Set([
  'NHAP',
  'CHO_DUYET',
  'CONG_KHAI',
  'DA_RUT',
  'HET_HAN',
]);

function formatExpiryLine(item: ListingSummary): string {
  if (item.status === 'NHAP') {
    return 'Bản nháp · Chưa tính hạn 30 ngày';
  }
  if (item.status === 'GIU_CHO') {
    return 'Đang giữ chỗ · Không tự động đóng khi hết 30 ngày';
  }
  if (item.status === 'HET_HAN') {
    const dateStr = formatShortDate(item.expiresAt);
    return dateStr ? `Đã hết hạn ngày ${dateStr}` : 'Đã hết hạn hiển thị';
  }
  if (item.status === 'DA_RUT') {
    return 'Đã rút khỏi tìm kiếm công khai';
  }
  if (item.status === 'CONG_KHAI' && item.expiresAt) {
    const expiresMs = new Date(item.expiresAt).getTime();
    if (!Number.isNaN(expiresMs)) {
      const daysLeft = Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000));
      const formatted = formatShortDate(item.expiresAt);
      if (daysLeft <= 0) {
        return `Sắp hết hạn hôm nay (${formatted})`;
      }
      return `Còn ${daysLeft} ngày (hết hạn ${formatted})`;
    }
  }
  if (item.createdAt) {
    return `Tạo ngày ${formatShortDate(item.createdAt)}`;
  }
  return '';
}

export default function MyListingsScreen() {
  const navigation = useNavigation<Nav>();
  const token = useSession((state) => state.token);
  const user = useSession((state) => state.user);
  const restriction = useSession((state) => state.restriction);
  const restrictionDismissed = useSession((state) => state.restrictionDismissed);

  const visibleRestriction =
    restriction ?? (restrictionDismissed ? null : resolveUserRestriction(user));
  const isLocked = Boolean(visibleRestriction) || user?.accountStatus === 'BI_KHOA';
  const isActiveMember = Boolean(
    token && user?.roles.includes('MEMBER') && user?.accountStatus !== 'BI_KHOA',
  );

  const {
    myListings,
    page,
    totalPages,
    statusFilter,
    quota,
    loading,
    error,
    loadMyListings,
    publish,
    withdraw,
    renew,
    remove,
    clearError,
  } = useSellerListings();

  const statusFilterRef = useRef<ListingStatus | ''>(statusFilter);
  statusFilterRef.current = statusFilter;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!isActiveMember) return;
      setActionError('');
      clearError();
      void loadMyListings({ status: statusFilterRef.current, page: 0 }).catch(() => {});
    }, [isActiveMember, loadMyListings, clearError]),
  );

  const handleSelectFilter = (nextStatus: ListingStatus | '') => {
    setActionError('');
    setActionSuccess('');
    clearError();
    void loadMyListings({ status: nextStatus, page: 0 }).catch(() => {});
  };

  const handleRefresh = () => {
    if (!isActiveMember) return;
    setActionError('');
    setActionSuccess('');
    clearError();
    void loadMyListings({ status: statusFilter, page: 0 }).catch(() => {});
  };

  const handleLoadMore = () => {
    if (!isActiveMember || loading || page + 1 >= totalPages) return;
    void loadMyListings({ status: statusFilter, page: page + 1 }).catch(() => {});
  };

  const handleMutationError = (err: unknown, fallback: string) => {
    if (isRestrictedError(err)) {
      setActionError('');
      return;
    }
    const parsed = extractApiError(err, fallback);
    setActionError(parsed.message);
  };

  const handlePublish = async (item: ListingSummary) => {
    setBusyId(item.id);
    setActionError('');
    setActionSuccess('');
    try {
      await publish(item.id, item.version);
      setActionSuccess(`Đã công khai tin "${item.title}".`);
    } catch (err) {
      handleMutationError(err, 'Không thể công khai tin đăng.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRenew = async (item: ListingSummary) => {
    setBusyId(item.id);
    setActionError('');
    setActionSuccess('');
    try {
      await renew(item.id, item.version);
      setActionSuccess(`Đã gia hạn tin "${item.title}" thêm 30 ngày.`);
    } catch (err) {
      handleMutationError(err, 'Không thể gia hạn tin đăng.');
    } finally {
      setBusyId(null);
    }
  };

  const performWithdraw = async (item: ListingSummary) => {
    setBusyId(item.id);
    setActionError('');
    setActionSuccess('');
    try {
      await withdraw(item.id, item.version);
      setActionSuccess(
        `Đã rút tin "${item.title}" khỏi hiển thị công khai và giải phóng liên kết đồ vật.`,
      );
    } catch (err) {
      handleMutationError(err, 'Không thể rút tin đăng.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmWithdraw = (item: ListingSummary) => {
    setActionError('');
    setActionSuccess('');
    const comboNote = item.isCombo
      ? `Toàn bộ ${item.itemCount} đồ vật trong combo sẽ được giải phóng liên kết khỏi tin này.`
      : 'Đồ vật gắn với tin sẽ được giải phóng liên kết khỏi tin này.';
    Alert.alert(
      'Xác nhận rút tin',
      `Rút tin "${item.title}" sẽ ngừng hiển thị tin với người mua và hoàn lại 1 suất hạn mức (nếu đang công khai). ${comboNote}`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Rút tin',
          style: 'destructive',
          onPress: () => void performWithdraw(item),
        },
      ],
    );
  };

  const performDelete = async (item: ListingSummary) => {
    setBusyId(item.id);
    setActionError('');
    setActionSuccess('');
    try {
      await remove(item.id, item.version);
      setActionSuccess(`Đã xóa tin "${item.title}".`);
    } catch (err) {
      handleMutationError(err, 'Không thể xóa tin đăng.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (item: ListingSummary) => {
    setActionError('');
    setActionSuccess('');
    Alert.alert(
      'Xác nhận xóa tin',
      `Bạn có chắc chắn muốn xóa vĩnh viễn tin "${item.title}"? Các liên kết với Kho đồ cá nhân sẽ được gỡ bỏ (nếu tin đã có lịch sử giao dịch, vui lòng dùng nút "Rút tin").`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tin',
          style: 'destructive',
          onPress: () => void performDelete(item),
        },
      ],
    );
  };

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.gatedWrap}>
          <Text style={ui.brand}>DORM TRADING</Text>
          <Text style={text.title}>Tin của tôi</Text>
          <Notice message="Vui lòng đăng nhập bằng tài khoản sinh viên để quản lý tin đăng cá nhân." />
          <Action
            title="Đăng nhập"
            testID="my-listings-login-btn"
            onPress={() => navigation.navigate('Login')}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (isLocked) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.gatedWrap}>
          <Text style={ui.brand}>DORM TRADING</Text>
          <Text style={text.title}>Tin của tôi</Text>
          <RestrictedAccountNotice />
          <Action
            secondary
            title="Quay lại tin công khai"
            onPress={() => navigation.navigate('Listings')}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!isActiveMember) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.gatedWrap}>
          <Text style={ui.brand}>DORM TRADING</Text>
          <Text style={text.title}>Tin của tôi</Text>
          <Notice message="Tài khoản đang chờ hoàn tất xác minh email hoặc duyệt hồ sơ. Bạn chưa thể quản lý tin đăng." />
          <Action
            secondary
            title="Quay lại tin công khai"
            onPress={() => navigation.navigate('Listings')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const quotaProgressRatio =
    quota && quota.limit > 0 ? Math.min(1, Math.max(0, quota.activeCount / quota.limit)) : 0;

  const visibleError = actionError || error || '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={ui.brand}>DORM TRADING</Text>
            <Text style={[text.title, { marginTop: space.xs }]}>Tin của tôi</Text>
          </View>
          <Action
            title="Tạo tin mới"
            testID="my-listings-create-btn"
            onPress={() => navigation.navigate('CreateListing')}
          />
        </View>

        {/* FR-05 Quota Summary Card */}
        {quota ? (
          <View style={styles.quotaCard} testID="my-listings-quota-card">
            <View style={styles.quotaHeaderRow}>
              <Text style={styles.quotaTitle}>
                Đang mở/giữ chỗ: {quota.activeCount} / {quota.limit} tin
              </Text>
              <View style={styles.reputationPill}>
                <Text style={styles.reputationPillText}>Uy tín: {quota.reputationScore}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(quotaProgressRatio * 100)}%`,
                    backgroundColor: quota.remaining === 0 ? colors.danger : colors.brand,
                  },
                ]}
              />
            </View>
            <Text style={styles.quotaCaption}>
              {quota.remaining > 0
                ? `Còn ${quota.remaining} suất công khai · Hạn mức < ${quota.highTierThreshold} điểm: ${quota.standardLimit} tin, ≥ ${quota.highTierThreshold} điểm: ${quota.highTierLimit} tin.`
                : 'Đã dùng hết hạn mức công khai. Bạn vẫn có thể lưu Bản nháp hoặc rút bớt tin cũ.'}
            </Text>
          </View>
        ) : null}

        {/* Status Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {STATUS_FILTERS.map((filter) => {
            const active = statusFilter === filter.value;
            return (
              <Pressable
                key={filter.testIdKey}
                testID={`filter-status-${filter.testIdKey}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => handleSelectFilter(filter.value)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {visibleRestriction ? (
        <View style={styles.bannerMargin}>
          <RestrictedAccountNotice />
        </View>
      ) : null}

      {visibleError ? (
        <View style={styles.bannerMargin}>
          <Notice message={visibleError} error />
        </View>
      ) : null}

      {actionSuccess ? (
        <View style={styles.bannerMargin}>
          <Notice message={actionSuccess} />
        </View>
      ) : null}

      <FlatList
        data={myListings}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyBox} testID="my-listings-empty">
              <Text style={styles.emptyTitle}>
                {statusFilter ? 'Không có tin đăng ở trạng thái này' : 'Bạn chưa có tin đăng nào'}
              </Text>
              <Text style={ui.caption}>
                {statusFilter
                  ? 'Hãy thử chuyển sang bộ lọc khác hoặc tạo tin đăng mới từ Kho đồ cá nhân.'
                  : 'Bắt đầu đăng bán hoặc cho tặng đồ dùng KTX ngay từ Kho đồ cá nhân của bạn.'}
              </Text>
              <View style={styles.emptyCtaWrap}>
                <Action
                  title="Tạo tin mới"
                  testID="my-listings-empty-create-btn"
                  onPress={() => navigation.navigate('CreateListing')}
                />
              </View>
            </View>
          ) : null
        }
        ListFooterComponent={
          page + 1 < totalPages ? (
            <View style={styles.loadMoreWrap}>
              <Action
                secondary
                title="Tải thêm tin"
                testID="my-listings-load-more"
                busy={loading}
                onPress={handleLoadMore}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const statusMeta = LISTING_STATUS_META[item.status];
          const isBusy = busyId === item.id;
          const isReserved = item.status === 'GIU_CHO';
          const canEdit = EDITABLE_STATUSES.has(item.status);
          const canPublish = item.status === 'NHAP' || item.status === 'DA_RUT';
          const canWithdraw = item.status === 'CONG_KHAI' || item.status === 'CHO_DUYET';
          const canRenew =
            (item.status === 'CONG_KHAI' && item.renewalReminderDue) || item.status === 'HET_HAN';
          const canDelete = DELETABLE_STATUSES.has(item.status);
          const thumb = item.thumbnailUrl ?? item.images[0] ?? null;
          const expiryLine = formatExpiryLine(item);
          const locationLabel = item.locationName || item.locationText || '';

          return (
            <View style={styles.card} testID={`my-listing-card-${item.id}`}>
              <View style={styles.cardTop}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} accessibilityLabel={item.title} />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Text style={styles.thumbPlaceholderText}>Chưa có ảnh</Text>
                  </View>
                )}

                <View style={styles.cardInfo}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View
                      style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}
                      testID={`my-listing-status-${item.id}`}
                    >
                      <Text style={[styles.statusBadgeText, { color: statusMeta.fg }]}>
                        {statusMeta.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metaBadgesRow}>
                    {item.isCombo ? (
                      <View style={styles.comboPill}>
                        <Text style={styles.comboPillText}>
                          Combo ({item.itemCount} món)
                        </Text>
                      </View>
                    ) : null}
                    {item.isFree ? (
                      <View style={styles.freePill}>
                        <Text style={styles.freePillText}>Cho tặng 0đ</Text>
                      </View>
                    ) : null}
                    {item.courseCode ? (
                      <View style={styles.coursePill}>
                        <Text style={styles.coursePillText}>{item.courseCode}</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.priceText}>{formatVnd(item.priceVnd)}</Text>

                  {locationLabel ? (
                    <Text style={styles.metaCaption} numberOfLines={1}>
                      Khu vực: {locationLabel}
                    </Text>
                  ) : null}

                  {expiryLine ? (
                    <Text style={styles.expiryCaption}>{expiryLine}</Text>
                  ) : null}
                </View>
              </View>

              {item.hasUnavailableItems ? (
                <View style={styles.warningStrip} testID={`unavailable-items-${item.id}`}>
                  <Text style={styles.warningStripText}>
                    Một đồ vật trong tin hiện đang được giữ hoặc đã chuyển giao ở tin khác.
                  </Text>
                </View>
              ) : null}

              {/* FR-13 7-day Renewal Reminder Banner */}
              {item.renewalReminderDue && item.status === 'CONG_KHAI' ? (
                <View style={styles.renewalBanner} testID={`renewal-banner-${item.id}`}>
                  <Text style={styles.renewalBannerText}>
                    Nhắc gia hạn (FR-13): Tin sắp hết hạn trong vòng 7 ngày tới. Gia hạn để tiếp tục hiển thị thêm 30 ngày.
                  </Text>
                  <Action
                    title="Gia hạn +30 ngày"
                    testID={`renew-banner-btn-${item.id}`}
                    disabled={isBusy}
                    busy={isBusy}
                    onPress={() => void handleRenew(item)}
                  />
                </View>
              ) : null}

              {/* Blocked/Locked Badge on GIU_CHO */}
              {isReserved ? (
                <View style={styles.lockedBadge} testID={`locked-badge-${item.id}`}>
                  <Text style={styles.lockedBadgeText}>
                    Tin đang được giữ chỗ cho giao dịch — không thể sửa, rút tin hoặc xóa lúc này.
                  </Text>
                </View>
              ) : null}

              {/* Status-aware Action Buttons */}
              <View style={styles.cardActions}>
                <Pressable
                  testID={`my-listing-view-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Xem ${item.title}`}
                  onPress={() => navigation.navigate('Listing', { id: item.id, listing: item })}
                  style={styles.actionChip}
                >
                  <Text style={styles.actionChipText}>Xem</Text>
                </Pressable>

                {canEdit ? (
                  <Pressable
                    testID={`my-listing-edit-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Sửa ${item.title}`}
                    disabled={isBusy}
                    onPress={() => navigation.navigate('EditListing', { id: item.id })}
                    style={[styles.actionChip, isBusy && styles.chipDisabled]}
                  >
                    <Text style={styles.actionChipText}>Sửa</Text>
                  </Pressable>
                ) : null}

                {canPublish ? (
                  <Pressable
                    testID={`my-listing-publish-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Công khai ${item.title}`}
                    accessibilityState={{ disabled: isBusy || Boolean(quota && !quota.canPublish) }}
                    disabled={isBusy || Boolean(quota && !quota.canPublish)}
                    onPress={() => void handlePublish(item)}
                    style={[
                      styles.actionChipPrimary,
                      (isBusy || Boolean(quota && !quota.canPublish)) && styles.chipDisabled,
                    ]}
                  >
                    <Text style={styles.actionChipPrimaryText}>Công khai</Text>
                  </Pressable>
                ) : null}

                {canRenew ? (
                  <Pressable
                    testID={`my-listing-renew-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Gia hạn ${item.title}`}
                    accessibilityState={{ disabled: isBusy }}
                    disabled={isBusy}
                    onPress={() => void handleRenew(item)}
                    style={[styles.actionChipPrimary, isBusy && styles.chipDisabled]}
                  >
                    <Text style={styles.actionChipPrimaryText}>Gia hạn</Text>
                  </Pressable>
                ) : null}

                {canWithdraw ? (
                  <Pressable
                    testID={`my-listing-withdraw-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Rút tin ${item.title}`}
                    accessibilityState={{ disabled: isBusy }}
                    disabled={isBusy}
                    onPress={() => confirmWithdraw(item)}
                    style={[styles.actionChipWarn, isBusy && styles.chipDisabled]}
                  >
                    <Text style={styles.actionChipWarnText}>Rút tin</Text>
                  </Pressable>
                ) : null}

                {canDelete ? (
                  <Pressable
                    testID={`my-listing-delete-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa ${item.title}`}
                    accessibilityState={{ disabled: isBusy }}
                    disabled={isBusy}
                    onPress={() => confirmDelete(item)}
                    style={[styles.actionChipDanger, isBusy && styles.chipDisabled]}
                  >
                    <Text style={styles.actionChipDangerText}>Xóa</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f4ef',
  },
  gatedWrap: {
    padding: space.xl,
    gap: space.md,
  },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    gap: space.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  quotaCard: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space.xs,
  },
  quotaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  quotaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  reputationPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: '#e6f4ea',
  },
  reputationPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#137333',
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#e3e4df',
    overflow: 'hidden',
    marginVertical: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  quotaCaption: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  filterRow: {
    flexDirection: 'row',
    gap: space.xs,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  filterPillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  filterPillTextActive: {
    color: colors.surface,
  },
  bannerMargin: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  listContent: {
    padding: space.lg,
    paddingTop: space.sm,
    gap: space.md,
    flexGrow: 1,
  },
  emptyBox: {
    padding: space.xl,
    borderRadius: radius.md,
    backgroundColor: '#f2ede4',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  emptyCtaWrap: {
    marginTop: space.sm,
    width: '100%',
    maxWidth: 240,
  },
  loadMoreWrap: {
    paddingVertical: space.md,
  },
  card: {
    backgroundColor: colors.surface,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space.md,
  },
  cardTop: {
    flexDirection: 'row',
    gap: space.md,
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: '#ecebe4',
  },
  thumbPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: '#ecebe4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xs,
  },
  thumbPlaceholderText: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    lineHeight: 20,
  },
  statusBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  comboPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#f2ede4',
  },
  comboPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  freePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#e6f4ea',
  },
  freePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#137333',
  },
  coursePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#e8f0fe',
  },
  coursePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1967d2',
  },
  priceText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.brand,
  },
  metaCaption: {
    fontSize: 12,
    color: colors.muted,
  },
  expiryCaption: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  warningStrip: {
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: '#fef7e0',
    borderWidth: 1,
    borderColor: '#f0d796',
  },
  warningStripText: {
    fontSize: 12,
    color: '#8a4f00',
    lineHeight: 17,
  },
  renewalBanner: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: '#fef7e0',
    borderWidth: 1,
    borderColor: '#e9c874',
    gap: space.sm,
  },
  renewalBannerText: {
    fontSize: 13,
    color: '#7a4500',
    fontWeight: '600',
    lineHeight: 19,
  },
  lockedBadge: {
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: '#fef7e0',
    borderWidth: 1,
    borderColor: '#f0d796',
  },
  lockedBadgeText: {
    fontSize: 12,
    color: '#8a4f00',
    fontWeight: '600',
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.sm,
  },
  actionChip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#f9f8f5',
  },
  actionChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  actionChipPrimary: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.brand,
  },
  actionChipPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.surface,
  },
  actionChipWarn: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9c874',
    backgroundColor: '#fef7e0',
  },
  actionChipWarnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8a4f00',
  },
  actionChipDanger: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5b8af',
    backgroundColor: '#fff0ec',
  },
  actionChipDangerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.danger,
  },
  chipDisabled: {
    opacity: 0.45,
  },
});
