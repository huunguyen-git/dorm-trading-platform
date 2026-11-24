import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
import { Action, AuthScreen, Notice, ui } from '../components/AuthUI';
import { colors, space } from '../theme';

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
      <AuthScreen
        title="Sửa tin đăng"
        subtitle="Vui lòng đăng nhập bằng tài khoản chủ sở hữu để chỉnh sửa tin."
      >
        <Notice message="Vui lòng đăng nhập để tiếp tục." />
        <Action title="Đăng nhập" onPress={() => navigation.navigate('Login')} />
      </AuthScreen>
    );
  }

  if (isLocked) {
    return (
      <AuthScreen
        title="Sửa tin đăng"
        subtitle="Tài khoản hiện đang bị hạn chế nên không thể chỉnh sửa tin đăng."
      >
        <RestrictedAccountNotice />
        <Action secondary title="Quay lại" onPress={() => navigation.goBack()} />
      </AuthScreen>
    );
  }

  if (!isActiveMember) {
    return (
      <AuthScreen
        title="Sửa tin đăng"
        subtitle="Tài khoản chưa đủ điều kiện chỉnh sửa tin đăng."
      >
        <Notice message="Tài khoản đang chờ hoàn tất xác minh email hoặc duyệt hồ sơ." />
        <Action secondary title="Quay lại" onPress={() => navigation.goBack()} />
      </AuthScreen>
    );
  }

  if (loadingDetail) {
    return (
      <AuthScreen title="Sửa tin đăng" subtitle="Đang tải dữ liệu tin đăng…">
        <View style={styles.loadingWrap} testID="edit-listing-loading">
          <ActivityIndicator color={colors.brand} />
          <Text style={ui.caption}>Đang tải thông tin tin đăng…</Text>
        </View>
      </AuthScreen>
    );
  }

  if (loadError || !detail) {
    return (
      <AuthScreen
        title="Sửa tin đăng"
        subtitle="Không thể mở biểu mẫu chỉnh sửa cho tin đăng này."
      >
        <Notice message={loadError || 'Không tìm thấy tin đăng.'} error />
        <Action
          secondary
          title="Thử tải lại"
          testID="edit-listing-retry-btn"
          onPress={() => void loadDetail({ incrementKey: true })}
        />
        <Action secondary title="Quay lại" onPress={() => navigation.goBack()} />
      </AuthScreen>
    );
  }

  const statusMeta = LISTING_STATUS_META[detail.status];

  return (
    <AuthScreen
      title="Sửa tin đăng"
      subtitle={`Trạng thái hiện tại: ${statusMeta.label} · Phiên bản #${detail.version}`}
    >
      {visibleRestriction ? (
        <View style={styles.restrictionWrap}>
          <RestrictedAccountNotice />
        </View>
      ) : null}

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
        onReloadConflict={() => void loadDetail({ incrementKey: true })}
        onNavigateToInventoryCreate={() => navigation.navigate('InventoryForm', { mode: 'create' })}
        onCancel={() => {
          clearError();
          navigation.goBack();
        }}
        onSubmitEdit={handleSubmitEdit}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
  },
  restrictionWrap: {
    marginBottom: space.sm,
  },
});
