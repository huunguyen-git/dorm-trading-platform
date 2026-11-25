import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { EmptyState } from '../components/ui';
import { component, primitive, semantic } from '../theme';

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
      if (typeof navigation.replace === 'function') {
        navigation.replace('MyListings');
      } else {
        navigation.navigate('MyListings');
      }
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
      <View style={styles.gatedScreen}>
        <EmptyState
          icon="log-in"
          title="Đăng nhập để đăng tin"
          subtitle="Đăng nhập bằng tài khoản sinh viên đã kích hoạt để đăng bán hoặc cho tặng đồ dùng."
          primaryActionLabel="Đăng nhập"
          primaryActionTestID="create-listing-login-btn"
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
          testID="create-listing-back-btn"
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
          title="Cần hoàn tất xác minh tài khoản"
          subtitle="Tài khoản đang chờ hoàn tất xác minh email hoặc duyệt hồ sơ. Bạn chưa thể đăng tin."
          primaryActionLabel="Quay lại"
          primaryActionTestID="create-listing-back-btn"
          onPrimaryAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
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
        headerSlot={visibleRestriction ? <RestrictedAccountNotice /> : undefined}
        onNavigateToInventoryCreate={() =>
          navigation.navigate('InventoryForm', { mode: 'create' })
        }
        onCancel={() => {
          clearError();
          navigation.goBack();
        }}
        onSubmitCreate={handleSubmitCreate}
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
