import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { Nav, RootStack } from '../navigation';
import { resolveUserRestriction, useSession } from '../auth/session';
import type { InventoryItemStatus } from '../inventory/types';
import { useDiscovery } from '../listings/discoveryStore';
import {
  formatShortDate,
  formatVnd,
  LISTING_STATUS_META,
  normalizeListingSummary,
  type ListingSummary,
} from '../listings/types';
import { Action, Notice, ui } from '../components/AuthUI';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import { colors, radius, space, text } from '../theme';

function getItemStatusMeta(status: InventoryItemStatus): { label: string; bg: string; fg: string } {
  if (status === 'DANG_GIU') {
    return { label: 'Đang giữ', bg: '#fef7e0', fg: '#b06000' };
  }
  if (status === 'DA_CHUYEN_GIAO') {
    return { label: 'Đã chuyển giao', bg: '#f1f3f4', fg: '#5f6368' };
  }
  return { label: 'Khả dụng', bg: '#e6f4ea', fg: '#137333' };
}

export default function ListingScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStack, 'Listing'>>();

  const token = useSession((state) => state.token);
  const user = useSession((state) => state.user);
  const restriction = useSession((state) => state.restriction);
  const dismissed = useSession((state) => state.restrictionDismissed);
  const hasVisibleRestriction = Boolean(restriction ?? (dismissed ? null : resolveUserRestriction(user)));

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
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  useEffect(() => {
    setActivePhotoIndex(0);
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

  // Exception E1: Not found / deleted / hidden (404)
  if (detailNotFound || (!listingId && !display)) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <View style={styles.notFoundCard} testID="listing-not-found">
          <Text style={styles.notFoundTitle}>Tin không tồn tại hoặc đã bị ẩn</Text>
          <Text style={ui.caption}>
            Tin đăng này có thể đã bị xóa, rút tin, hết hạn hoặc bị ẩn do vi phạm quy định.
          </Text>
          <View style={{ marginTop: space.sm, width: '100%' }}>
            <Action
              title="Quay lại tìm kiếm"
              testID="back-to-search-button"
              onPress={() => navigation.navigate('Listings')}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Initial loading with no preview
  if (detailLoading && !display) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={[ui.caption, { marginTop: space.sm }]}>Đang tải chi tiết tin đăng…</Text>
      </SafeAreaView>
    );
  }

  // Network error with no preview
  if (detailError && !display) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <View style={styles.notFoundCard} testID="listing-detail-error">
          <Notice message={detailError} error />
          <Action title="Thử lại" testID="detail-retry-button" onPress={handleRetry} />
          <Action
            title="Quay lại tìm kiếm"
            secondary
            onPress={() => navigation.navigate('Listings')}
          />
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
  const messageDisabled = isAuthenticated && (!isActiveMember || (detail ? !detail.viewer.canMessage : false));
  const reportDisabled = isRestrictedOrPending;

  const showPhase2BNotice = (featureLabel: string) => {
    Alert.alert(
      'Tính năng sắp ra mắt',
      `Tính năng ${featureLabel} sẽ kích hoạt ở sprint kế tiếp.`,
    );
  };

  const handleMessagePress = () => {
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    showPhase2BNotice('Nhắn tin (P2-03)');
  };

  const handleOfferPress = () => {
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    showPhase2BNotice('Đề nghị giá (P2-03)');
  };

  const handleReservePress = () => {
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    showPhase2BNotice('Giữ chỗ (P2-04)');
  };

  const handleReportPress = () => {
    if (reportDisabled) return;
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    showPhase2BNotice('Báo cáo (P2-06)');
  };

  const sellerInitial = (display.seller.displayName.trim()[0] ?? 'T').toUpperCase();
  const ratingText =
    display.seller.reviewCount > 0 && display.seller.averageRating !== null
      ? `${display.seller.averageRating.toFixed(1)} ★ (${display.seller.reviewCount} đánh giá)`
      : 'Chưa có đánh giá';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Non-blocking network error banner when preview exists */}
        {detailError ? (
          <View style={{ gap: space.sm }} testID="listing-detail-error">
            <Notice message={detailError} error />
            <Action title="Thử lại" secondary testID="detail-retry-button" onPress={handleRetry} />
          </View>
        ) : null}

        {hasVisibleRestriction ? <RestrictedAccountNotice /> : null}

        {/* 1. Photo Gallery */}
        <View style={styles.galleryCard} testID="listing-gallery">
          {images.length > 0 ? (
            <>
              <View style={styles.galleryStage}>
                <Image
                  testID="gallery-main-image"
                  source={{ uri: images[activePhotoIndex] }}
                  style={styles.mainImage}
                  resizeMode="cover"
                  accessibilityLabel={`${display.title} - ảnh ${activePhotoIndex + 1}`}
                />
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
                      onPress={() =>
                        setActivePhotoIndex((prev) => (prev - 1 + images.length) % images.length)
                      }
                      style={[styles.galleryNavBtn, styles.galleryNavPrev]}
                    >
                      <Text style={styles.galleryNavText}>‹</Text>
                    </Pressable>
                    <Pressable
                      testID="gallery-next"
                      accessibilityRole="button"
                      accessibilityLabel="Ảnh tiếp theo"
                      onPress={() => setActivePhotoIndex((prev) => (prev + 1) % images.length)}
                      style={[styles.galleryNavBtn, styles.galleryNavNext]}
                    >
                      <Text style={styles.galleryNavText}>›</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>

              {images.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.thumbStrip}
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
                        onPress={() => setActivePhotoIndex(index)}
                        style={[styles.thumbWrap, active && styles.thumbWrapActive]}
                      >
                        <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </>
          ) : (
            <View style={styles.noPhotoBox}>
              <Text style={ui.caption}>Tin đăng chưa có hình ảnh đính kèm.</Text>
            </View>
          )}
        </View>

        {/* 2. Header & Badges */}
        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <View
              testID="listing-status-badge"
              style={[styles.pill, { backgroundColor: statusMeta.bg }]}
            >
              <Text style={[styles.pillText, { color: statusMeta.fg }]}>{statusMeta.label}</Text>
            </View>

            {display.isCombo ? (
              <View style={[styles.pill, { backgroundColor: '#f9ebe7' }]}>
                <Text style={[styles.pillText, { color: colors.brand }]}>
                  Combo ({Math.max(2, detail?.items.length || display.itemCount)} đồ vật)
                </Text>
              </View>
            ) : (
              <View style={[styles.pill, { backgroundColor: '#f2ede4' }]}>
                <Text style={[styles.pillText, { color: colors.ink }]}>Tin đơn</Text>
              </View>
            )}

            {isFree ? (
              <View style={[styles.pill, { backgroundColor: '#e6f4ea' }]}>
                <Text style={[styles.pillText, { color: '#137333' }]}>Miễn phí (0đ)</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.title} testID="listing-title">
            {display.title}
          </Text>

          <Text style={[styles.price, isFree && styles.priceFree]} testID="listing-price">
            {formatVnd(display.priceVnd)}
          </Text>

          <View style={styles.metaRow}>
            {categoryBreadcrumb ? (
              <Text style={styles.metaText} testID="listing-category">
                Danh mục: {categoryBreadcrumb}
              </Text>
            ) : null}
            {postedDate ? <Text style={styles.metaText}>Đăng ngày: {postedDate}</Text> : null}
          </View>
        </View>

        {/* 3. Status / Availability Banners */}
        {isReserved && !isOwner ? (
          <View style={styles.amberBanner} testID="reserved-banner" accessibilityRole="alert">
            <Text style={styles.amberTitle}>Tin đang được giữ chỗ</Text>
            <Text style={styles.amberBody}>
              Tin đăng này hiện đang được giữ chỗ cho một giao dịch khác. Bạn tạm thời không thể gửi
              yêu cầu giữ chỗ mới.
            </Text>
          </View>
        ) : null}

        {display.hasUnavailableItems ? (
          <View
            style={styles.warningBanner}
            testID="unavailable-items-banner"
            accessibilityRole="alert"
          >
            <Text style={styles.warningTitle}>
              Một hoặc nhiều đồ vật trong tin hiện đang được giữ/chuyển giao ở tin khác
            </Text>
            <Text style={styles.warningBody}>
              Tin đăng tạm thời không khả dụng để giữ chỗ cho đến khi các đồ vật trở lại trạng thái
              khả dụng.
            </Text>
          </View>
        ) : null}

        {isOwner && display.status !== 'CONG_KHAI' ? (
          <View style={styles.ownerBanner} testID="owner-status-banner">
            <Text style={styles.ownerBannerTitle}>Trạng thái tin của bạn: {statusMeta.label}</Text>
            <Text style={ui.caption}>
              {display.status === 'GIU_CHO'
                ? 'Tin đang được giữ chỗ cho giao dịch nên tạm khóa chỉnh sửa.'
                : display.status === 'AN'
                  ? `Tin đang bị ẩn.${detail?.hiddenReason ? ` Lý do: ${detail.hiddenReason}` : ''}`
                  : 'Tin hiện không hiển thị công khai trong kết quả tìm kiếm.'}
            </Text>
          </View>
        ) : null}

        {/* 4. Condition, Description & Textbook Metadata */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Thông tin chi tiết</Text>

          <View style={styles.detailBlock}>
            <Text style={ui.label}>Tình trạng</Text>
            <Text style={styles.bodyText}>{display.condition || 'Chưa cập nhật'}</Text>
          </View>

          <View style={styles.detailBlock}>
            <Text style={ui.label}>Mô tả</Text>
            <Text style={styles.bodyText}>
              {display.description || 'Chưa có mô tả chi tiết.'}
            </Text>
          </View>

          {hasTextbookInfo ? (
            <View style={styles.textbookBox} testID="textbook-metadata-card">
              <Text style={styles.textbookTitle}>Thông tin giáo trình</Text>
              {display.courseCode ? (
                <Text style={styles.bodyText}>Mã môn học: {display.courseCode}</Text>
              ) : null}
              {display.courseName ? (
                <Text style={styles.bodyText}>Tên môn học: {display.courseName}</Text>
              ) : null}
              {display.author ? (
                <Text style={styles.bodyText}>Tác giả: {display.author}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* 5. Component Inventory Items List */}
        <View style={styles.card} testID="component-items-section">
          <Text style={styles.sectionTitle}>
            {display.isCombo
              ? `Đồ vật trong combo (${detail?.items.length ?? Math.max(2, display.itemCount)} món)`
              : 'Đồ vật đính kèm'}
          </Text>
          {display.isCombo ? (
            <Text style={ui.caption}>
              Tin combo bao gồm đầy đủ các đồ vật bên dưới, không tách lẻ khi giao dịch.
            </Text>
          ) : null}

          {detailLoading && !detail ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={ui.caption}>Đang tải danh sách đồ vật đính kèm…</Text>
            </View>
          ) : detail && detail.items.length > 0 ? (
            <View style={{ gap: space.sm }}>
              {detail.items.map((item) => {
                const itemMeta = getItemStatusMeta(item.status);
                return (
                  <View
                    key={item.id}
                    style={styles.componentItemCard}
                    testID={`component-item-${item.id}`}
                  >
                    {item.images[0] ? (
                      <Image source={{ uri: item.images[0] }} style={styles.componentThumb} />
                    ) : (
                      <View style={styles.componentThumbPlaceholder}>
                        <Text style={styles.componentThumbText}>Đồ</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.componentItemHeader}>
                        <Text style={styles.componentItemName}>{item.name}</Text>
                        <View style={[styles.pill, { backgroundColor: itemMeta.bg }]}>
                          <Text style={[styles.pillText, { color: itemMeta.fg }]}>
                            {itemMeta.label}
                          </Text>
                        </View>
                      </View>
                      {item.condition ? (
                        <Text style={styles.componentItemCondition}>{item.condition}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={ui.caption}>Chưa có thông tin chi tiết đồ vật đính kèm.</Text>
          )}
        </View>

        {/* 6. Meeting Location Card */}
        <View style={styles.card} testID="location-card">
          <Text style={styles.sectionTitle}>Địa điểm giao dịch</Text>
          <Text style={styles.locationPrimary}>{locationZoneName}</Text>
          {display.locationText ? (
            <Text style={styles.bodyText}>{display.locationText}</Text>
          ) : null}
          {typeof display.distanceKm === 'number' && Number.isFinite(display.distanceKm) ? (
            <Text style={ui.caption}>Khoảng cách ước tính: ~{display.distanceKm.toFixed(1)} km</Text>
          ) : null}
        </View>

        {/* 7. Seller Public Trust Card (NFR-01: ZERO PII!) */}
        <View style={styles.card} testID="seller-trust-card">
          <Text style={styles.sectionTitle}>Người đăng tin</Text>
          <View style={styles.sellerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{sellerInitial}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.sellerName} testID="seller-display-name">
                {display.seller.displayName}
              </Text>
              <View style={styles.sellerBadges}>
                <View style={[styles.pill, { backgroundColor: '#f2ede4' }]}>
                  <Text style={[styles.pillText, { color: colors.ink }]}>
                    Điểm uy tín: {display.seller.reputationScore}
                  </Text>
                </View>
                <Text style={styles.ratingText} testID="seller-rating">
                  {ratingText}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 8. Role & Context-Aware Action Bar (UC-20 Main + Alts 1-4) */}
        <View style={styles.card} testID="listing-action-bar">
          {isOwner ? (
            <View style={{ gap: space.sm }}>
              <Action
                title="Sửa tin"
                testID="owner-edit-button"
                disabled={!canOwnerEdit}
                onPress={() => navigation.navigate('EditListing', { id: display.id })}
              />
              <Action
                title="Quản lý tin của tôi"
                secondary
                testID="owner-manage-button"
                onPress={() => navigation.navigate('MyListings')}
              />
              {!canOwnerEdit ? (
                <Text style={ui.caption}>
                  Tin đang ở trạng thái khóa giao dịch hoặc đã đóng nên không thể chỉnh sửa.
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              <Action
                title="Yêu cầu giữ chỗ"
                testID="reserve-button"
                disabled={reserveDisabled}
                onPress={handleReservePress}
              />

              <View style={styles.secondaryActionRow}>
                <View style={{ flex: 1 }}>
                  <Action
                    title="Nhắn tin"
                    secondary
                    testID="message-button"
                    disabled={messageDisabled}
                    onPress={handleMessagePress}
                  />
                </View>
                {!isFree ? (
                  <View style={{ flex: 1 }}>
                    <Action
                      title="Đề nghị giá"
                      secondary
                      testID="make-offer-button"
                      disabled={offerDisabled}
                      onPress={handleOfferPress}
                    />
                  </View>
                ) : null}
              </View>

              <Action
                title="Báo cáo tin"
                secondary
                testID="report-button"
                disabled={reportDisabled}
                onPress={handleReportPress}
              />

              {!isAuthenticated ? (
                <Text style={ui.caption}>
                  Đăng nhập để nhắn tin, đề nghị giá hoặc gửi yêu cầu giữ chỗ với người bán.
                </Text>
              ) : !isActiveMember ? (
                <Text style={ui.caption}>
                  Tài khoản cần được xác minh và ở trạng thái hoạt động để thực hiện giao dịch.
                </Text>
              ) : reserveBlockedByListing ? (
                <Text style={ui.caption}>
                  {isReserved
                    ? 'Nút giữ chỗ đang tạm khóa vì tin đã có người giữ chỗ.'
                    : 'Nút giữ chỗ đang tạm khóa vì đồ vật trong tin hiện không khả dụng.'}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f4ef',
  },
  centerPage: {
    flex: 1,
    backgroundColor: '#f5f4ef',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
  },
  notFoundCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.xl,
    gap: space.md,
    alignItems: 'center',
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  scrollContent: {
    padding: space.lg,
    gap: space.md,
    paddingBottom: space.xl * 2,
  },
  galleryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  galleryStage: {
    position: 'relative',
    backgroundColor: '#1b1d1c',
  },
  mainImage: {
    width: '100%',
    height: 260,
  },
  counterBadge: {
    position: 'absolute',
    right: space.sm,
    bottom: space.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  counterText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  galleryNavBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 36,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryNavPrev: {
    left: space.sm,
  },
  galleryNavNext: {
    right: space.sm,
  },
  galleryNavText: {
    color: colors.surface,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  thumbStrip: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.sm,
    backgroundColor: '#f9f8f5',
  },
  thumbWrap: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  thumbWrapActive: {
    borderColor: colors.brand,
  },
  thumbImage: {
    width: 56,
    height: 56,
  },
  noPhotoBox: {
    height: 160,
    backgroundColor: '#ecebe4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    ...text.title,
    fontSize: 21,
    lineHeight: 28,
  },
  price: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.brand,
  },
  priceFree: {
    color: '#137333',
  },
  metaRow: {
    gap: 4,
    paddingTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  metaText: {
    fontSize: 13,
    color: colors.muted,
  },
  amberBanner: {
    backgroundColor: '#fef7e0',
    borderColor: '#f3d078',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.xs,
  },
  amberTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#b06000',
  },
  amberBody: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 20,
  },
  warningBanner: {
    backgroundColor: '#fff0ec',
    borderColor: '#e5b8af',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.xs,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.danger,
  },
  warningBody: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 20,
  },
  ownerBanner: {
    backgroundColor: '#e8f0fe',
    borderColor: '#c2d7fa',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.xs,
  },
  ownerBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1967d2',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  detailBlock: {
    gap: 4,
  },
  bodyText: {
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  textbookBox: {
    backgroundColor: '#f9f8f5',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
    gap: 4,
    marginTop: space.xs,
  },
  textbookTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1967d2',
    marginBottom: 2,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  componentItemCard: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#f9f8f5',
  },
  componentThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#ecebe4',
  },
  componentThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#ecebe4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  componentThumbText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
  },
  componentItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.xs,
  },
  componentItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  componentItemCondition: {
    fontSize: 13,
    color: colors.muted,
  },
  locationPrimary: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '700',
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  sellerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b06000',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
});
