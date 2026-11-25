import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { Nav, RootStack } from '../navigation';
import { resolveUserRestriction, useSession } from '../auth/session';
import {
  extractApiError,
  fetchSellerListingDetail,
  isRestrictedError,
} from '../listings/sellerApi';
import { useSellerListings } from '../listings/sellerStore';
import {
  LISTING_STATUS_META,
  type ListingDetail,
  type ListingStatus,
  type UpdateListingPayload,
} from '../listings/types';
import ListingFormContent, {
  type ListingFormConflictState,
  type ListingFormInitialValues,
} from '../components/ListingFormContent';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import { EmptyState, StatusIndicator } from '../components/ui';
import { component, primitive, semantic } from '../theme';

type EditListingRoute = RouteProp<RootStack, 'EditListing'>;

const NON_EDITABLE_STATUSES: ReadonlySet<ListingStatus> = new Set([
  'GIU_CHO',
  'KET_THUC',
  'AN',
]);

function getReadOnlyReason(detail: ListingDetail): string {
  if (detail.status === 'GIU_CHO') {
    return 'Tin đăng đang được giữ chỗ trong một giao dịch đang hoạt động nên không thể chỉnh sửa.';
  }
  if (detail.status === 'KET_THUC') {
    return 'Tin đăng đã kết thúc giao dịch nên không thể chỉnh sửa.';
  }
  if (detail.status === 'AN') {
    return detail.hiddenReason
      ? `Tin đăng đang bị ẩn (${detail.hiddenReason}) nên không thể chỉnh sửa.`
      : 'Tin đăng đang bị ẩn do kiểm duyệt nên không thể chỉnh sửa.';
  }
  return 'Tin đăng hiện không ở trạng thái cho phép chỉnh sửa.';
}

export default function EditListingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<EditListingRoute>();
  const listingId = route.params?.id;

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
    quota,
    categories,
    categoryTree,
    locations,
    loadingReferences,
    submitting,
    loadQuota,
    loadReferences,
    update,
    clearError,
  } = useSellerListings();

  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [conflictState, setConflictState] = useState<ListingFormConflictState | null>(null);
  const [formReloadKey, setFormReloadKey] = useState(0);

  const loadDetail = useCallback(
    async (options?: { incrementKey?: boolean }) => {
      if (!listingId || !isActiveMember) {
        setLoadingDetail(false);
        return;
      }
      setLoadingDetail(true);
      setLoadError('');
      try {
        const fetched = await fetchSellerListingDetail(listingId);
        setDetail(fetched);
        setConflictState(null);
        setSubmitError('');
        if (options?.incrementKey) {
          setFormReloadKey((prev) => prev + 1);
        }
      } catch (err) {
        if (isRestrictedError(err)) {
          setLoadError('');
          return;
        }
        const parsed = extractApiError(err, 'Không thể tải thông tin chi tiết tin đăng.');
        setLoadError(parsed.message);
      } finally {
        setLoadingDetail(false);
      }
    },
    [listingId, isActiveMember],
  );

  useEffect(() => {
    if (!isActiveMember) return;
    void loadDetail();
    void loadQuota().catch(() => {});
    void loadReferences().catch(() => {});
  }, [isActiveMember, loadDetail, loadQuota, loadReferences]);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const isStatusReadOnly = Boolean(
    detail &&
      (NON_EDITABLE_STATUSES.has(detail.status) ||
        (detail.viewer.isOwner && !detail.viewer.canEdit)),
  );

  const initialValues = useMemo<ListingFormInitialValues | undefined>(() => {
    if (!detail) return undefined;
    return {
      title: detail.title,
      description: detail.description,
      condition: detail.condition ?? '',
      priceVnd: detail.priceVnd,
      categoryId: detail.categoryId ?? '',
      locationCode: detail.locationCode ?? '',
      locationText: detail.locationText ?? '',
      latitude: detail.latitude,
      longitude: detail.longitude,
      courseCode: detail.courseCode ?? '',
      courseName: detail.courseName ?? '',
      author: detail.author ?? '',
      images: detail.images,
      itemIds: detail.items.map((item) => item.id),
    };
  }, [detail]);

  const handleSubmitEdit = async (payload: UpdateListingPayload) => {
    if (!detail || isStatusReadOnly) return;
    setSubmitError('');
    setConflictState(null);

    try {
      await update(detail.id, payload);
      if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('MyListings');
      }
    } catch (err) {
      if (isRestrictedError(err)) {
        setSubmitError('');
        return;
      }
      const parsed = extractApiError(err, 'Không thể lưu thay đổi tin đăng.');
      if (parsed.code === 'VERSION_CONFLICT') {
        setConflictState({
          type: 'VERSION_CONFLICT',
          message: parsed.message,
        });
        return;
      }
      if (parsed.code === 'QUOTA_EXCEEDED') {
        void loadQuota().catch(() => {});
        setConflictState({
          type: 'QUOTA_EXCEEDED',
          message: parsed.message,
        });
        return;
      }
      setSubmitError(parsed.message);
    }
  };

  if (!token) {
    return (
      <View style={styles.gatedScreen}>
        <EmptyState
          icon="log-in"
          title="Đăng nhập để chỉnh sửa tin"
          subtitle="Vui lòng đăng nhập bằng tài khoản chủ sở hữu để cập nhật nội dung tin đăng."
          primaryActionLabel="Đăng nhập"
          onPrimaryAction={() => navigation.navigate('Login')}
        />
      </View>
    );
  }

  if (isLocked) {
    return (
      <View style={styles.lockedScreen}>
        <RestrictedAccountNotice />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressedState]}
        >
          <Text style={styles.backBtnText}>Quay lại</Text>
        </Pressable>
      </View>
    );
  }

  if (!isActiveMember) {
    return (
      <View style={styles.gatedScreen}>
        <EmptyState
          icon="shield"
          title="Tài khoản chưa đủ điều kiện"
          subtitle="Tài khoản đang chờ hoàn tất xác minh email hoặc duyệt hồ sơ."
          primaryActionLabel="Quay lại"
          onPrimaryAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  if (loadingDetail) {
    return (
      <View style={styles.loadingScreen} testID="edit-listing-loading">
        <ActivityIndicator color={semantic.color.accent} />
        <Text style={styles.loadingText}>Đang tải thông tin tin đăng...</Text>
      </View>
    );
  }

  if (loadError || !detail) {
    return (
      <View style={styles.gatedScreen}>
        <EmptyState
          icon="alert-circle"
          title="Không thể mở biểu mẫu chỉnh sửa"
          subtitle={loadError || 'Không tìm thấy tin đăng.'}
          primaryActionLabel="Thử tải lại"
          primaryActionTestID="edit-listing-retry-btn"
          onPrimaryAction={() => void loadDetail({ incrementKey: true })}
          secondaryActionLabel="Quay lại"
          onSecondaryAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  const statusMeta = LISTING_STATUS_META[detail.status];

  return (
    <View style={styles.screen}>
      <ListingFormContent
        key={`${detail.id}-${formReloadKey}`}
        mode="edit"
        listingStatus={detail.status}
        listingVersion={detail.version}
        pendingRequestCount={detail.pendingRequestCount}
        initialValues={initialValues}
        quota={quota}
        categories={categories}
        categoryTree={categoryTree}
        locations={locations}
        loadingReferences={loadingReferences}
        submitting={submitting}
        readOnly={isStatusReadOnly}
        readOnlyMessage={isStatusReadOnly ? getReadOnlyReason(detail) : undefined}
        submitError={submitError}
        conflictState={conflictState}
        headerSlot={
          <View style={styles.statusHeader}>
            <View style={styles.statusStrip} testID="edit-listing-status-strip">
              <Text style={styles.statusLabel}>Trạng thái:</Text>
              <StatusIndicator
                label={statusMeta.label}
                tone={statusMeta.tone}
                variant={statusMeta.tier}
              />
            </View>
            {visibleRestriction ? <RestrictedAccountNotice /> : null}
          </View>
        }
        onReloadConflict={() => void loadDetail({ incrementKey: true })}
        onNavigateToInventoryCreate={() =>
          navigation.navigate('InventoryForm', { mode: 'create' })
        }
        onCancel={() => {
          clearError();
          navigation.goBack();
        }}
        onSubmitEdit={handleSubmitEdit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  gatedScreen: {
    flex: 1,
    backgroundColor: semantic.color.bgPage,
    justifyContent: 'center',
  },
  lockedScreen: {
    flex: 1,
    backgroundColor: semantic.color.bgPage,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[6],
    gap: primitive.space[4],
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  loadingText: {
    ...semantic.type.caption,
  },
  statusHeader: {
    gap: primitive.space[3],
  },
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    paddingVertical: primitive.space[1],
  },
  statusLabel: {
    ...semantic.type.caption,
  },
  backBtn: {
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: component.button.paddingX,
  },
  backBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
  pressedState: {
    opacity: primitive.opacity.pressed,
  },
});
