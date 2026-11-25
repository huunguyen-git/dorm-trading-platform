import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { Nav, RootStack } from '../navigation';
import { resolveUserRestriction, useSession } from '../auth/session';
import type { InventoryItemStatus } from '../inventory/types';
import { useDiscovery } from '../listings/discoveryStore';
import {
  formatReputationSummary,
  formatShortDate,
  formatVnd,
  LISTING_STATUS_META,
  normalizeListingSummary,
  type ListingSummary,
} from '../listings/types';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  ActionSheet,
  BottomSheet,
  EmptyState,
  HairlineDivider,
  Icon,
  InlineBanner,
  SectionHeading,
  StatusIndicator,
  type ActionSheetOption,
  type StatusTone,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

const PHOTO_HEIGHT = 300;
const HIGH_TRUST_THRESHOLD = 120;

function getItemStatusMeta(status: InventoryItemStatus): { label: string; tone: StatusTone } {
  if (status === 'DANG_GIU') {
    return { label: 'Đang giữ', tone: 'warning' };
  }
  if (status === 'DA_CHUYEN_GIAO') {
    return { label: 'Đã chuyển giao', tone: 'neutral' };
  }
  return { label: 'Khả dụng', tone: 'success' };
}

function sanitizeErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed || trimmed.startsWith('API ')) {
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  }
  return trimmed;
}

export default function ListingScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStack, 'Listing'>>();
  const { width: windowWidth } = useWindowDimensions();
  const stageWidth = Math.max(windowWidth || 375, 320);
  const insets = useContext(SafeAreaInsetsContext);
  const stickyBottomPad = Math.max(insets?.bottom ?? 0, primitive.space[3]);

  const token = useSession((state) => state.token);
  const user = useSession((state) => state.user);
  const restriction = useSession((state) => state.restriction);
  const dismissed = useSession((state) => state.restrictionDismissed);
  const hasVisibleRestriction = Boolean(
    restriction ?? (dismissed ? null : resolveUserRestriction(user)),
  );

  const {
    selectedDetail,
    detailLoading,
    detailError,
    detailNotFound,
    categories,
    loadDetail,
    clearDetail,
  } = useDiscovery();

  const previewSummary = useMemo<ListingSummary | null>(() => {
    if (!params?.listing) return null;
    return normalizeListingSummary(params.listing);
  }, [params?.listing]);

  const listingId = params?.id ?? previewSummary?.id ?? '';
  const carouselRef = useRef<ScrollView | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [reputationSheetOpen, setReputationSheetOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  useEffect(() => {
    setActivePhotoIndex(0);
    setReputationSheetOpen(false);
    setMoreSheetOpen(false);
    if (listingId) {
      void loadDetail(listingId);
    } else {
      clearDetail();
    }
  }, [listingId, loadDetail, clearDetail]);

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') return;
    return navigation.addListener('focus', () => {
      if (listingId && !useDiscovery.getState().detailLoading) {
        void loadDetail(listingId);
      }
    });
  }, [navigation, listingId, loadDetail]);

  const detail = selectedDetail?.id === listingId ? selectedDetail : null;
  const display: ListingSummary | null = detail
    ? {
        ...detail,
        distanceKm: detail.distanceKm ?? previewSummary?.distanceKm ?? null,
      }
    : previewSummary;

  const images = useMemo(() => {
    if (!display) return [];
    if (display.images.length > 0) return display.images;
    return display.thumbnailUrl ? [display.thumbnailUrl] : [];
  }, [display]);

  useEffect(() => {
    if (activePhotoIndex >= images.length && images.length > 0) {
      setActivePhotoIndex(0);
    }
  }, [activePhotoIndex, images.length]);

  const categoryBreadcrumb = useMemo(() => {
    const cat = detail?.category;
    const catName = cat?.name ?? display?.categoryName ?? null;
    if (!catName) return null;
    if (cat?.parentId) {
      const parent = categories.find((entry) => entry.id === cat.parentId);
      if (parent?.name) return `${parent.name} › ${catName}`;
    }
    return catName;
  }, [categories, detail?.category, display?.categoryName]);

  const handleRetry = useCallback(() => {
    if (listingId) {
      void loadDetail(listingId);
    }
  }, [listingId, loadDetail]);

  const goToPhoto = useCallback(
    (nextIndex: number) => {
      if (images.length === 0) return;
      const wrapped = ((nextIndex % images.length) + images.length) % images.length;
      setActivePhotoIndex(wrapped);
      carouselRef.current?.scrollTo({ x: wrapped * stageWidth, animated: true });
    },
    [images.length, stageWidth],
  );

  const handleCarouselScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (stageWidth <= 0 || images.length <= 1) return;
      const offsetX = event.nativeEvent.contentOffset.x;
      const nextIndex = Math.max(0, Math.min(images.length - 1, Math.round(offsetX / stageWidth)));
      setActivePhotoIndex(nextIndex);
    },
    [images.length, stageWidth],
  );

  // Not found / deleted / hidden (404)
  if (detailNotFound || (!listingId && !display)) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <EmptyState
          testID="listing-not-found"
          icon="eye-off"
          title="Tin không tồn tại hoặc đã bị ẩn"
          subtitle="Tin đăng này có thể đã bị xóa, rút tin, hết hạn hoặc bị ẩn do vi phạm quy định."
          primaryActionLabel="Quay lại tìm kiếm"
          primaryActionTestID="back-to-search-button"
          onPrimaryAction={() => navigation.navigate('Listings')}
        />
      </SafeAreaView>
    );
  }

  // Initial loading with no preview
  if (detailLoading && !display) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <ActivityIndicator size="large" color={semantic.color.accent} />
        <Text style={styles.loadingText}>Đang tải chi tiết tin đăng…</Text>
      </SafeAreaView>
    );
  }

  // Network error with no preview
  if (detailError && !display) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <View style={styles.errorContainer} testID="listing-detail-error">
          <InlineBanner
            tone="danger"
            title="Không thể tải chi tiết tin"
            message={sanitizeErrorMessage(detailError)}
            actionLabel="Thử lại"
            actionTestID="detail-retry-button"
            onActionPress={handleRetry}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại tìm kiếm"
            onPress={() => navigation.navigate('Listings')}
            style={({ pressed }) => [styles.errorBackBtn, pressed && styles.pressedControl]}
          >
            <Text style={styles.errorBackText}>Quay lại tìm kiếm</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!display) {
    return null;
  }

  const statusMeta = LISTING_STATUS_META[display.status] ?? LISTING_STATUS_META.CONG_KHAI;
  const isFree = display.isFree || display.priceVnd === 0;
  const isReserved = display.status === 'GIU_CHO';
  const isAuthenticated = Boolean(token);
  const isRestrictedOrPending = Boolean(
    user?.accountStatus === 'CHO_KICH_HOAT' ||
      user?.accountStatus === 'BI_KHOA' ||
      restriction ||
      (isAuthenticated && !user?.roles.includes('MEMBER')),
  );
  const isActiveMember = Boolean(
    token && user?.roles.includes('MEMBER') && !isRestrictedOrPending,
  );
  const isOwner = Boolean(
    detail?.viewer.isOwner || (user?.id && display.seller.id && user.id === display.seller.id),
  );
  const hasTextbookInfo = Boolean(display.courseCode || display.courseName || display.author);
  const postedDate = formatShortDate(display.publishedAt ?? display.createdAt);
  const locationZoneName = display.locationName ?? display.locationCode ?? 'ĐHQG-HCM';
  const comboItemCount = Math.max(2, detail?.items.length || display.itemCount);
  const showUrgentStatusBadge = display.status !== 'CONG_KHAI';

  const canOwnerEdit = detail ? detail.viewer.canEdit : display.status !== 'GIU_CHO';
  const reserveBlockedByListing = isReserved || display.hasUnavailableItems;
  const reserveDisabledForMember =
    isAuthenticated &&
    (!isActiveMember ||
      reserveBlockedByListing ||
      (detail ? !detail.viewer.canReserve : display.status !== 'CONG_KHAI'));
  const reserveDisabled = isAuthenticated ? reserveDisabledForMember : reserveBlockedByListing;

  const offerDisabledForMember =
    isAuthenticated &&
    (!isActiveMember ||
      reserveBlockedByListing ||
      (detail ? !detail.viewer.canMakeOffer : display.status !== 'CONG_KHAI'));
  const offerDisabled = isAuthenticated ? offerDisabledForMember : reserveBlockedByListing;
  const messageDisabled =
    isAuthenticated && (!isActiveMember || (detail ? !detail.viewer.canMessage : false));
  const reportDisabled = isRestrictedOrPending;

  const showUpcomingFeatureNotice = (featureLabel: string) => {
    Alert.alert(
      'Tính năng sắp ra mắt',
      `Tính năng ${featureLabel} đang được hoàn thiện và sẽ sớm ra mắt.`,
    );
  };

  const handleMessagePress = () => {
    if (messageDisabled) return;
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    showUpcomingFeatureNotice('Nhắn tin');
  };

  const handleOfferPress = () => {
    if (offerDisabled) return;
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    showUpcomingFeatureNotice('Đề nghị giá');
  };

  const handleReservePress = () => {
    if (reserveDisabled) return;
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    showUpcomingFeatureNotice('Giữ chỗ');
  };

  const handleReportPress = () => {
    if (reportDisabled) return;
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    showUpcomingFeatureNotice('Báo cáo tin');
  };

  const sellerInitial = (display.seller.displayName.trim()[0] ?? 'T').toUpperCase();
  const reputationSummary = formatReputationSummary(display.seller.reputationScore);
  const isHighTrustSeller = display.seller.reputationScore >= HIGH_TRUST_THRESHOLD;
  const ratingText =
    display.seller.reviewCount > 0 && display.seller.averageRating !== null
      ? `${display.seller.averageRating.toFixed(1)} (${display.seller.reviewCount} đánh giá)`
      : 'Chưa có đánh giá';

  const ownerStatusBannerTone =
    display.status === 'AN'
      ? 'danger'
      : display.status === 'GIU_CHO' || display.status === 'CHO_DUYET'
        ? 'warning'
        : 'neutral';

  const textbookRows: { key: string; text: string }[] = [];
  if (display.courseCode) {
    textbookRows.push({ key: 'courseCode', text: `Mã môn học: ${display.courseCode}` });
  }
  if (display.courseName) {
    textbookRows.push({ key: 'courseName', text: `Tên môn học: ${display.courseName}` });
  }
  if (display.author) {
    textbookRows.push({ key: 'author', text: `Tác giả: ${display.author}` });
  }

  const actionSheetOptions: ActionSheetOption[] = isOwner
    ? [
        {
          key: 'edit',
          label: 'Sửa tin',
          icon: 'edit-2',
          disabled: !canOwnerEdit,
          onPress: () => navigation.navigate('EditListing', { id: display.id }),
          testID: 'action-sheet-edit',
        },
        {
          key: 'manage',
          label: 'Quản lý tin của tôi',
          icon: 'layers',
          onPress: () => navigation.navigate('MyListings'),
          testID: 'action-sheet-manage',
        },
        {
          key: 'refresh',
          label: 'Tải lại thông tin',
          icon: 'refresh-cw',
          onPress: handleRetry,
          testID: 'action-sheet-refresh',
        },
      ]
    : [
        {
          key: 'reputation',
          label: 'Tìm hiểu điểm uy tín',
          icon: 'award',
          onPress: () => setReputationSheetOpen(true),
          testID: 'action-sheet-reputation',
        },
        {
          key: 'refresh',
          label: 'Tải lại thông tin',
          icon: 'refresh-cw',
          onPress: handleRetry,
          testID: 'action-sheet-refresh',
        },
        {
          key: 'report',
          label: 'Báo cáo tin này',
          icon: 'alert-triangle',
          destructive: true,
          disabled: reportDisabled,
          onPress: handleReportPress,
          testID: 'action-sheet-report',
        },
      ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Non-blocking sync error & restriction strips */}
        {detailError || hasVisibleRestriction ? (
          <View style={styles.topNoticesWrap}>
            {detailError ? (
              <InlineBanner
                testID="listing-detail-error"
                tone="danger"
                message={sanitizeErrorMessage(detailError)}
                actionLabel="Thử lại"
                actionTestID="detail-retry-button"
                onActionPress={handleRetry}
              />
            ) : null}
            {hasVisibleRestriction ? <RestrictedAccountNotice /> : null}
          </View>
        ) : null}

        {/* 1. Edge-to-Edge Full-Bleed Photo Carousel */}
        <View style={styles.galleryRoot} testID="listing-gallery">
          {images.length > 0 ? (
            <>
              <View style={styles.galleryStage}>
                {images.length > 1 ? (
                  <ScrollView
                    ref={carouselRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={handleCarouselScrollEnd}
                    scrollEventThrottle={16}
                  >
                    {images.map((uri, index) => (
                      <Image
                        key={`${uri}-${index}`}
                        testID={index === activePhotoIndex ? 'gallery-main-image' : undefined}
                        source={{ uri }}
                        style={{ width: stageWidth, height: PHOTO_HEIGHT }}
                        resizeMode="cover"
                        accessibilityLabel={`${display.title} - ảnh ${index + 1}`}
                      />
                    ))}
                  </ScrollView>
                ) : (
                  <Image
                    testID="gallery-main-image"
                    source={{ uri: images[0] }}
                    style={styles.singlePhoto}
                    resizeMode="cover"
                    accessibilityLabel={`${display.title} - ảnh 1`}
                  />
                )}

                <Pressable
                  testID="listing-more-button"
                  onPress={() => setMoreSheetOpen(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Tùy chọn tin đăng"
                  style={({ pressed }) => [styles.galleryMoreBtn, pressed && styles.pressedControl]}
                >
                  <Icon name="more-horizontal" size={18} color={semantic.color.textInverse} />
                </Pressable>

                <View style={styles.counterBadge} testID="gallery-counter">
                  <Text style={styles.counterText}>
                    {activePhotoIndex + 1}/{images.length}
                  </Text>
                </View>

                {images.length > 1 ? (
                  <>
                    <Pressable
                      testID="gallery-prev"
                      accessibilityRole="button"
                      accessibilityLabel="Ảnh trước"
                      hitSlop={8}
                      onPress={() => goToPhoto(activePhotoIndex - 1)}
                      style={({ pressed }) => [
                        styles.galleryNavBtn,
                        styles.galleryNavPrev,
                        pressed && styles.pressedControl,
                      ]}
                    >
                      <Icon name="chevron-left" size={20} color={semantic.color.textInverse} />
                    </Pressable>
                    <Pressable
                      testID="gallery-next"
                      accessibilityRole="button"
                      accessibilityLabel="Ảnh tiếp theo"
                      hitSlop={8}
                      onPress={() => goToPhoto(activePhotoIndex + 1)}
                      style={({ pressed }) => [
                        styles.galleryNavBtn,
                        styles.galleryNavNext,
                        pressed && styles.pressedControl,
                      ]}
                    >
                      <Icon name="chevron-right" size={20} color={semantic.color.textInverse} />
                    </Pressable>
                  </>
                ) : null}
              </View>

              {images.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.thumbStrip}
                  style={styles.thumbStripContainer}
                >
                  {images.map((uri, index) => {
                    const active = index === activePhotoIndex;
                    return (
                      <Pressable
                        key={`${uri}-${index}`}
                        testID={`gallery-thumb-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Chọn ảnh ${index + 1}`}
                        accessibilityState={{ selected: active }}
                        onPress={() => goToPhoto(index)}
                        style={[
                          styles.thumbWrap,
                          active ? styles.thumbWrapActive : styles.thumbWrapInactive,
                        ]}
                      >
                        <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </>
          ) : (
            <View style={styles.noPhotoStage}>
              <Icon name="image" size={32} color={semantic.color.textSecondary} />
              <Text style={styles.captionText}>Tin đăng chưa có hình ảnh đính kèm.</Text>
              <Pressable
                testID="listing-more-button"
                onPress={() => setMoreSheetOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Tùy chọn tin đăng"
                style={({ pressed }) => [styles.galleryMoreBtn, pressed && styles.pressedControl]}
              >
                <Icon name="more-horizontal" size={18} color={semantic.color.textInverse} />
              </Pressable>
            </View>
          )}
        </View>

        {/* Section A — Compact Seller Trust Strip (public fields only) */}
        <Pressable
          testID="seller-trust-card"
          onPress={() => setReputationSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Xem thông tin uy tín của ${display.seller.displayName}`}
          style={({ pressed }) => [styles.sellerStrip, pressed && styles.rowPressed]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{sellerInitial}</Text>
          </View>

          <View style={styles.sellerIdentity}>
            <Text style={styles.sellerName} numberOfLines={1} testID="seller-display-name">
              {display.seller.displayName}
            </Text>
            <Text style={styles.sellerZone} numberOfLines={1}>
              Khu vực {locationZoneName}
            </Text>
          </View>

          <View style={styles.sellerMetrics}>
            <Text style={styles.reputationText}>
              Điểm uy tín: {display.seller.reputationScore}
            </Text>
            <View style={styles.ratingRow}>
              <Icon name="award" size={13} color={semantic.color.textSecondary} />
              <Text style={styles.ratingText} testID="seller-rating">
                {ratingText}
              </Text>
            </View>
            {isHighTrustSeller ? (
              <StatusIndicator variant="dot" tone="success" label="Tin cậy cao" />
            ) : null}
          </View>

          <Icon name="chevron-right" size={16} color={semantic.color.textSecondary} />
        </Pressable>

        <HairlineDivider />

        {/* Section B — Title, Price & Status */}
        <View style={styles.section}>
          {categoryBreadcrumb || postedDate ? (
            <View style={styles.breadcrumbRow}>
              {categoryBreadcrumb ? (
                <Text style={styles.breadcrumbText} testID="listing-category">
                  Danh mục: {categoryBreadcrumb}
                </Text>
              ) : null}
              {categoryBreadcrumb && postedDate ? (
                <Text style={styles.breadcrumbDot}>·</Text>
              ) : null}
              {postedDate ? (
                <Text style={styles.breadcrumbText}>Đăng ngày: {postedDate}</Text>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.title} testID="listing-title">
            {display.title}
          </Text>

          <View style={styles.priceRow}>
            <Text style={[styles.price, isFree && styles.priceFree]} testID="listing-price">
              {formatVnd(display.priceVnd)}
            </Text>

            {showUrgentStatusBadge ? (
              <StatusIndicator
                testID="listing-status-badge"
                variant="urgent"
                tone={statusMeta.tone}
                label={statusMeta.label}
              />
            ) : null}

            {display.isCombo ? (
              <StatusIndicator
                variant="soft"
                tone="neutral"
                label={`Combo · ${comboItemCount} món`}
              />
            ) : null}
          </View>

          {isReserved && !isOwner ? (
            <InlineBanner
              testID="reserved-banner"
              tone="warning"
              title="Tin đang được giữ chỗ"
              message="Tin đăng này hiện đang được giữ chỗ cho một giao dịch khác. Bạn tạm thời không thể gửi yêu cầu giữ chỗ mới."
              style={styles.statusBannerSpacing}
            />
          ) : null}

          {display.hasUnavailableItems ? (
            <InlineBanner
              testID="unavailable-items-banner"
              tone="warning"
              title="Một hoặc nhiều đồ vật trong tin hiện đang được giữ/chuyển giao ở tin khác"
              message="Tin đăng tạm thời không khả dụng để giữ chỗ cho đến khi các đồ vật trở lại trạng thái khả dụng."
              style={styles.statusBannerSpacing}
            />
          ) : null}

          {isOwner && display.status !== 'CONG_KHAI' ? (
            <InlineBanner
              testID="owner-status-banner"
              tone={ownerStatusBannerTone}
              title={`Trạng thái tin của bạn: ${statusMeta.label}`}
              message={
                display.status === 'GIU_CHO'
                  ? 'Tin đang được giữ chỗ cho giao dịch nên tạm khóa chỉnh sửa.'
                  : display.status === 'AN'
                    ? `Tin đang bị ẩn.${detail?.hiddenReason ? ` Lý do: ${detail.hiddenReason}` : ''}`
                    : 'Tin hiện không hiển thị công khai trong kết quả tìm kiếm.'
              }
              style={styles.statusBannerSpacing}
            />
          ) : null}
        </View>

        <HairlineDivider />

        {/* Section C — Description, Condition & Textbook Metadata */}
        <View style={styles.section}>
          <SectionHeading title="Thông tin chi tiết" />

          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Tình trạng</Text>
            <Text style={styles.bodyText}>{display.condition || 'Chưa cập nhật'}</Text>
          </View>

          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Mô tả</Text>
            <Text style={styles.bodyText}>
              {display.description || 'Chưa có mô tả chi tiết.'}
            </Text>
          </View>

          {hasTextbookInfo ? (
            <View style={styles.textbookSection} testID="textbook-metadata-card">
              <HairlineDivider spacing={primitive.space[1]} />
              <View style={styles.textbookHeader}>
                <Icon name="book-open" size={16} color={semantic.color.textSecondary} />
                <Text style={styles.textbookTitle}>Thông tin giáo trình</Text>
              </View>
              <View style={styles.textbookTable}>
                {textbookRows.map((row, index) => (
                  <Fragment key={row.key}>
                    {index > 0 ? <HairlineDivider /> : null}
                    <View style={styles.textbookRow}>
                      <Text style={styles.bodyText}>{row.text}</Text>
                    </View>
                  </Fragment>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <HairlineDivider />

        {/* Section D — Included Physical Items */}
        <View style={styles.section} testID="component-items-section">
          <SectionHeading
            title={
              display.isCombo
                ? `Đồ vật trong combo (${detail?.items.length ?? comboItemCount} món)`
                : 'Đồ vật trong tin'
            }
            subtitle={
              display.isCombo
                ? 'Tin combo gồm đầy đủ các đồ vật bên dưới, không tách lẻ khi giao dịch.'
                : undefined
            }
          />

          {detailLoading && !detail ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color={semantic.color.accent} />
              <Text style={styles.captionText}>Đang tải danh sách đồ vật…</Text>
            </View>
          ) : detail && detail.items.length > 0 ? (
            <View style={styles.itemsList}>
              {detail.items.map((item, index) => {
                const itemMeta = getItemStatusMeta(item.status);
                return (
                  <Fragment key={item.id}>
                    {index > 0 ? <HairlineDivider insetLeft={64} /> : null}
                    <View style={styles.componentItemRow} testID={`component-item-${item.id}`}>
                      {item.images[0] ? (
                        <Image
                          source={{ uri: item.images[0] }}
                          style={styles.componentThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.componentThumbPlaceholder}>
                          <Icon name="package" size={20} color={semantic.color.textSecondary} />
                        </View>
                      )}
                      <View style={styles.componentItemBody}>
                        <Text style={styles.componentItemName} numberOfLines={2}>
                          {item.name}
                        </Text>
                        {item.condition ? (
                          <Text style={styles.componentItemCondition} numberOfLines={1}>
                            {item.condition}
                          </Text>
                        ) : null}
                      </View>
                      <StatusIndicator variant="dot" tone={itemMeta.tone} label={itemMeta.label} />
                    </View>
                  </Fragment>
                );
              })}
            </View>
          ) : (
            <Text style={styles.captionText}>Chưa có thông tin chi tiết đồ vật trong tin.</Text>
          )}
        </View>

        <HairlineDivider />

        {/* Section E — Meeting Location, Distance & Subtle Report Link */}
        <View style={styles.section} testID="location-card">
          <SectionHeading title="Địa điểm giao dịch" />

          <View style={styles.locationRow}>
            <View style={styles.locationIconBadge}>
              <Icon name="map-pin" size={18} color={semantic.color.accent} />
            </View>
            <View style={styles.locationBody}>
              <Text style={styles.locationPrimary}>{locationZoneName}</Text>
              {display.locationText ? (
                <Text style={styles.bodyText}>{display.locationText}</Text>
              ) : null}
              {typeof display.distanceKm === 'number' && Number.isFinite(display.distanceKm) ? (
                <Text style={styles.captionText}>
                  Khoảng cách ước tính: ~{display.distanceKm.toFixed(1)} km
                </Text>
              ) : null}
            </View>
          </View>

          {isOwner && !canOwnerEdit ? (
            <Text style={styles.helperNote}>
              Tin đang giữ chỗ hoặc đã đóng nên không thể chỉnh sửa.
            </Text>
          ) : null}

          {!isOwner ? (
            <>
              {!isAuthenticated ? (
                <Text style={styles.helperNote}>
                  Đăng nhập để nhắn tin, đề nghị giá hoặc gửi yêu cầu giữ chỗ với người bán.
                </Text>
              ) : !isActiveMember ? (
                <Text style={styles.helperNote}>
                  Tài khoản cần được xác minh và ở trạng thái hoạt động để thực hiện giao dịch.
                </Text>
              ) : reserveBlockedByListing ? (
                <Text style={styles.helperNote}>
                  {isReserved
                    ? 'Nút giữ chỗ đang tạm khóa vì tin đã có người giữ chỗ.'
                    : 'Nút giữ chỗ đang tạm khóa vì đồ vật trong tin hiện không khả dụng.'}
                </Text>
              ) : null}

              <HairlineDivider spacing={primitive.space[2]} />

              <View style={styles.reportRow}>
                <Pressable
                  testID="report-button"
                  disabled={reportDisabled}
                  onPress={handleReportPress}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Báo cáo tin này"
                  accessibilityState={{ disabled: reportDisabled }}
                  style={({ pressed }) => [
                    styles.reportLink,
                    reportDisabled && styles.disabledControl,
                    pressed && !reportDisabled && styles.pressedControl,
                  ]}
                >
                  <Icon name="alert-triangle" size={14} color={semantic.color.textSecondary} />
                  <Text style={styles.reportLinkText}>Báo cáo tin này</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      <View
        testID="listing-action-bar"
        style={[styles.stickyBar, { paddingBottom: stickyBottomPad }]}
      >
        {isOwner ? (
          <View style={styles.stickyRow}>
            <Pressable
              testID="owner-manage-button"
              onPress={() => navigation.navigate('MyListings')}
              accessibilityRole="button"
              accessibilityLabel="Quản lý tin"
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.ownerManageBtn,
                pressed && styles.secondaryBtnPressed,
              ]}
            >
              <Text style={styles.secondaryBtnText} numberOfLines={1}>
                Quản lý tin
              </Text>
            </Pressable>

            <Pressable
              testID="owner-edit-button"
              disabled={!canOwnerEdit}
              onPress={() => navigation.navigate('EditListing', { id: display.id })}
              accessibilityRole="button"
              accessibilityLabel="Sửa tin"
              accessibilityState={{ disabled: !canOwnerEdit }}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.ownerEditBtn,
                !canOwnerEdit && styles.disabledControl,
                pressed && canOwnerEdit && styles.primaryBtnPressed,
              ]}
            >
              <Text style={styles.primaryBtnText} numberOfLines={1}>
                Sửa tin
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.stickyRow}>
            <Pressable
              testID="message-button"
              disabled={messageDisabled}
              onPress={handleMessagePress}
              accessibilityRole="button"
              accessibilityLabel="Nhắn tin"
              accessibilityState={{ disabled: messageDisabled }}
              style={({ pressed }) => [
                styles.iconActionBtn,
                messageDisabled && styles.disabledControl,
                pressed && !messageDisabled && styles.secondaryBtnPressed,
              ]}
            >
              <Icon name="message-circle" size={18} color={semantic.color.textPrimary} />
              <Text style={styles.iconActionText} numberOfLines={1}>
                Nhắn tin
              </Text>
            </Pressable>

            {!isFree ? (
              <Pressable
                testID="make-offer-button"
                disabled={offerDisabled}
                onPress={handleOfferPress}
                accessibilityRole="button"
                accessibilityLabel="Đề nghị giá"
                accessibilityState={{ disabled: offerDisabled }}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  styles.offerBtn,
                  offerDisabled && styles.disabledControl,
                  pressed && !offerDisabled && styles.secondaryBtnPressed,
                ]}
              >
                <Text style={styles.secondaryBtnText} numberOfLines={1}>
                  Đề nghị giá
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              testID="reserve-button"
              disabled={reserveDisabled}
              onPress={handleReservePress}
              accessibilityRole="button"
              accessibilityLabel="Yêu cầu giữ chỗ"
              accessibilityState={{ disabled: reserveDisabled }}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.reserveBtn,
                reserveDisabled && styles.disabledControl,
                pressed && !reserveDisabled && styles.primaryBtnPressed,
              ]}
            >
              <Text style={styles.primaryBtnText} numberOfLines={1}>
                Yêu cầu giữ chỗ
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Seller Reputation Explanation BottomSheet */}
      <BottomSheet
        visible={reputationSheetOpen}
        onClose={() => setReputationSheetOpen(false)}
        title="Điểm uy tín người bán"
        subtitle={display.seller.displayName}
        footerLabel="Đã hiểu"
        onFooterPress={() => setReputationSheetOpen(false)}
        testID="reputation-info-sheet"
      >
        <View style={styles.reputationSheetBody}>
          <View style={styles.reputationOverviewRow}>
            <View style={styles.reputationShield}>
              <Icon name="shield" size={20} color={semantic.color.accent} />
            </View>
            <View style={styles.reputationOverviewText}>
              <Text style={styles.reputationOverviewScore}>{reputationSummary.scoreText}</Text>
              <StatusIndicator
                variant="dot"
                tone={isHighTrustSeller ? 'success' : 'neutral'}
                label={reputationSummary.tierLabel}
              />
            </View>
          </View>

          <HairlineDivider />

          <Text style={styles.bodyText}>
            Tài khoản kích hoạt bắt đầu với 100 điểm uy tín. Giao dịch đúng hẹn giúp tăng điểm uy
            tín và mở rộng hạn mức đăng tin.
          </Text>

          <View style={styles.reputationTipsList}>
            <View style={styles.reputationTipRow}>
              <Icon name="check-circle" size={16} color={semantic.color.success} />
              <Text style={styles.reputationTipText}>
                Đạt từ 120 điểm uy tín trở lên được xếp mức Tin cậy cao và đăng tối đa 10 tin công
                khai.
              </Text>
            </View>
            <View style={styles.reputationTipRow}>
              <Icon name="award" size={16} color={semantic.color.textSecondary} />
              <Text style={styles.reputationTipText}>
                Đánh giá được tổng hợp từ nhận xét của người mua sau các giao dịch hoàn tất.
              </Text>
            </View>
          </View>
        </View>
      </BottomSheet>

      {/* Contextual More Options ActionSheet */}
      <ActionSheet
        visible={moreSheetOpen}
        onClose={() => setMoreSheetOpen(false)}
        title="Tùy chọn tin đăng"
        options={actionSheetOptions}
        testID="listing-action-sheet"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  centerPage: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: semantic.spacing.section,
  },
  loadingText: {
    ...semantic.type.caption,
    marginTop: primitive.space[3],
  },
  errorContainer: {
    width: '100%',
    maxWidth: 420,
    gap: primitive.space[4],
  },
  errorBackBtn: {
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: component.button.paddingX,
  },
  errorBackText: {
    ...semantic.type.label,
    fontSize: primitive.fontSize.base,
  },
  scrollView: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  scrollContent: {
    paddingBottom: primitive.space[6],
  },
  topNoticesWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[3],
    gap: primitive.space[2.5],
    backgroundColor: semantic.color.bgSurface,
  },
  galleryRoot: {
    backgroundColor: semantic.color.bgSurface,
  },
  galleryStage: {
    position: 'relative',
    width: '100%',
    height: PHOTO_HEIGHT,
    backgroundColor: semantic.color.bgTrack,
  },
  singlePhoto: {
    width: '100%',
    height: PHOTO_HEIGHT,
  },
  noPhotoStage: {
    position: 'relative',
    width: '100%',
    height: 200,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    paddingHorizontal: semantic.spacing.pageX,
  },
  galleryMoreBtn: {
    position: 'absolute',
    top: primitive.space[3],
    right: primitive.space[3],
    width: 36,
    height: 36,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBadge: {
    position: 'absolute',
    right: primitive.space[3],
    bottom: primitive.space[3],
    backgroundColor: semantic.color.overlayDark,
    borderRadius: primitive.radius.full,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1],
  },
  counterText: {
    color: semantic.color.textInverse,
    fontSize: primitive.fontSize.xs,
    lineHeight: primitive.lineHeight.xs,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: semantic.type.price.fontVariant,
  },
  galleryNavBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryNavPrev: {
    left: primitive.space[3],
  },
  galleryNavNext: {
    right: primitive.space[3],
  },
  thumbStripContainer: {
    backgroundColor: semantic.color.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: semantic.color.borderHairline,
  },
  thumbStrip: {
    flexDirection: 'row',
    gap: primitive.space[2],
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[2.5],
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: primitive.radius.sm,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  thumbWrapActive: {
    borderColor: semantic.color.accent,
  },
  thumbWrapInactive: {
    borderColor: semantic.color.borderHairline,
    opacity: 0.72,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  sellerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
    backgroundColor: semantic.color.bgSurface,
  },
  rowPressed: {
    backgroundColor: semantic.color.bgSubtle,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: semantic.color.accent,
    fontSize: primitive.fontSize.md,
    fontWeight: primitive.fontWeight.bold,
  },
  sellerIdentity: {
    flex: 1,
    gap: 2,
  },
  sellerName: {
    fontSize: primitive.fontSize.base,
    lineHeight: 20,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
  sellerZone: {
    ...semantic.type.caption,
  },
  sellerMetrics: {
    alignItems: 'flex-end',
    gap: 3,
  },
  reputationText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
  },
  ratingText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  section: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[5],
    gap: primitive.space[3],
    backgroundColor: semantic.color.bgSurface,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  breadcrumbText: {
    ...semantic.type.caption,
  },
  breadcrumbDot: {
    ...semantic.type.caption,
  },
  title: {
    ...semantic.type.screenTitle,
  },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  price: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: semantic.type.price.fontVariant,
    color: semantic.color.textPrimary,
  },
  priceFree: {
    color: semantic.color.success,
  },
  statusBannerSpacing: {
    marginTop: primitive.space[1],
  },
  detailBlock: {
    gap: primitive.space[1],
  },
  detailLabel: {
    ...semantic.type.label,
    color: semantic.color.textSecondary,
  },
  bodyText: {
    ...semantic.type.body,
  },
  captionText: {
    ...semantic.type.caption,
  },
  textbookSection: {
    marginTop: primitive.space[1],
    gap: primitive.space[2.5],
  },
  textbookHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    paddingTop: primitive.space[1],
  },
  textbookTitle: {
    ...semantic.type.label,
    fontSize: primitive.fontSize.base,
  },
  textbookTable: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  textbookRow: {
    paddingVertical: primitive.space[2.5],
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    paddingVertical: primitive.space[2],
  },
  itemsList: {
    marginTop: primitive.space[1],
  },
  componentItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
    paddingVertical: primitive.space[2.5],
  },
  componentThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: semantic.color.bgSubtle,
  },
  componentThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  componentItemBody: {
    flex: 1,
    gap: 2,
  },
  componentItemName: {
    ...semantic.type.cardTitle,
  },
  componentItemCondition: {
    ...semantic.type.caption,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[3],
  },
  locationIconBadge: {
    width: 36,
    height: 36,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBody: {
    flex: 1,
    gap: primitive.space[1],
  },
  locationPrimary: {
    ...semantic.type.cardTitle,
  },
  helperNote: {
    ...semantic.type.caption,
    marginTop: primitive.space[1],
  },
  reportRow: {
    alignItems: 'flex-start',
    paddingTop: primitive.space[1],
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    minHeight: 36,
    paddingVertical: primitive.space[1],
  },
  reportLinkText: {
    ...semantic.type.caption,
    fontWeight: primitive.fontWeight.medium,
  },
  stickyBar: {
    borderTopWidth: 1,
    borderTopColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
  },
  stickyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  iconActionBtn: {
    minWidth: 64,
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgSubtle,
    paddingHorizontal: primitive.space[2.5],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconActionText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
  secondaryBtn: {
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.secondaryBg,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    paddingHorizontal: primitive.space[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnPressed: {
    backgroundColor: semantic.color.bgSubtle,
  },
  secondaryBtnText: {
    fontSize: primitive.fontSize.sm,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.secondaryFg,
  },
  primaryBtn: {
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.primaryBg,
    paddingHorizontal: component.button.paddingX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    backgroundColor: component.button.primaryPressedBg,
  },
  primaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.primaryFg,
  },
  ownerManageBtn: {
    flex: 1,
  },
  ownerEditBtn: {
    flex: 1.3,
  },
  offerBtn: {
    paddingHorizontal: primitive.space[3],
  },
  reserveBtn: {
    flex: 1,
  },
  disabledControl: {
    opacity: primitive.opacity.disabled,
  },
  pressedControl: {
    opacity: primitive.opacity.pressed,
  },
  reputationSheetBody: {
    gap: primitive.space[3],
  },
  reputationOverviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  reputationShield: {
    width: 44,
    height: 44,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reputationOverviewText: {
    flex: 1,
    gap: primitive.space[1],
  },
  reputationOverviewScore: {
    ...semantic.type.sectionTitle,
  },
  reputationTipsList: {
    gap: primitive.space[2.5],
    paddingTop: primitive.space[1],
  },
  reputationTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[2.5],
  },
  reputationTipText: {
    ...semantic.type.caption,
    flex: 1,
    lineHeight: 19,
  },
});
