import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { Nav, RootStack } from '../navigation';
import { resolveUserRestriction, useSession } from '../auth/session';
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import { useSellerListings } from '../listings/sellerStore';
import type { CreateListingPayload } from '../listings/types';
import ListingFormContent, {
  type ListingFormConflictState,
} from '../components/ListingFormContent';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import { Action, AuthScreen, Notice } from '../components/AuthUI';
import { space } from '../theme';

type CreateListingRoute = RouteProp<RootStack, 'CreateListing'>;

export default function CreateListingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<CreateListingRoute>();
  const preselectedItemId = route.params?.preselectedItemId;

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
    create,
    clearError,
  } = useSellerListings();

  const [submitError, setSubmitError] = useState('');
  const [conflictState, setConflictState] = useState<ListingFormConflictState | null>(null);

  useEffect(() => {
    if (!isActiveMember) return;
    void loadQuota().catch(() => {});
    void loadReferences().catch(() => {});
  }, [isActiveMember, loadQuota, loadReferences]);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleSubmitCreate = async (payload: CreateListingPayload) => {
    if (!isActiveMember) {
      setSubmitError('Tài khoản chưa được phép đăng tin.');
      return;
    }

    setSubmitError('');
    setConflictState(null);

    try {
      await create(payload);
      navigation.navigate('MyListings');
    } catch (err) {
      if (isRestrictedError(err)) {
        setSubmitError('');
        return;
      }
      const parsed = extractApiError(err, 'Không thể tạo tin đăng. Vui lòng thử lại.');
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
        title="Đăng tin mới"
        subtitle="Đăng nhập bằng tài khoản sinh viên đã kích hoạt để đăng bán hoặc cho tặng đồ dùng."
      >
        <Notice message="Vui lòng đăng nhập để sử dụng chức năng đăng tin." />
        <Action
          title="Đăng nhập"
          testID="create-listing-login-btn"
          onPress={() => navigation.navigate('Login')}
        />
      </AuthScreen>
    );
  }

  if (isLocked) {
    return (
      <AuthScreen
        title="Đăng tin mới"
        subtitle="Tài khoản hiện không thể thực hiện thao tác tạo tin đăng."
      >
        <RestrictedAccountNotice />
        <Action
          secondary
          title="Quay lại"
          testID="create-listing-back-btn"
          onPress={() => navigation.goBack()}
        />
      </AuthScreen>
    );
  }

  if (!isActiveMember) {
    return (
      <AuthScreen
        title="Đăng tin mới"
        subtitle="Cần hoàn tất xác minh tài khoản trước khi đăng bán đồ dùng."
      >
        <Notice message="Tài khoản đang chờ hoàn tất xác minh email hoặc duyệt hồ sơ. Bạn chưa thể đăng tin." />
        <Action
          secondary
          title="Quay lại"
          testID="create-listing-back-btn"
          onPress={() => navigation.goBack()}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Đăng tin mới"
      subtitle="Chọn đồ vật từ Kho đồ cá nhân, tải 1–5 ảnh thực tế và công khai hoặc lưu nháp."
    >
      {visibleRestriction ? (
        <View style={styles.restrictionWrap}>
          <RestrictedAccountNotice />
        </View>
      ) : null}

      <ListingFormContent
        mode="create"
        preselectedItemId={preselectedItemId}
        quota={quota}
        categories={categories}
        categoryTree={categoryTree}
        locations={locations}
        loadingReferences={loadingReferences}
        submitting={submitting}
        submitError={submitError}
        conflictState={conflictState}
        onNavigateToInventoryCreate={() => navigation.navigate('InventoryForm', { mode: 'create' })}
        onCancel={() => {
          clearError();
          navigation.goBack();
        }}
        onSubmitCreate={handleSubmitCreate}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  restrictionWrap: {
    marginBottom: space.sm,
  },
});
