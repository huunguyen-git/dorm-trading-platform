import { useCallback, useContext, useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav, RootStack } from '../navigation';
import { formatReputationSummary, formatShortDate } from '../listings/types';
import { useReviews } from '../reviews/store';
import type { PublicReviewItem } from '../reviews/types';
import { StarRatingRow } from '../components/reviews';
import {
  EmptyState,
  HairlineDivider,
  Icon,
  InlineBanner,
  StatusIndicator,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

const RATING_FILTERS: Array<{ value: number | null; label: string; testID: string }> = [
  { value: null, label: 'Tất cả', testID: 'seller-reviews-filter-all' },
  { value: 5, label: '5 sao', testID: 'seller-reviews-filter-5' },
  { value: 4, label: '4 sao', testID: 'seller-reviews-filter-4' },
  { value: 3, label: '3 sao', testID: 'seller-reviews-filter-3' },
  { value: 2, label: '2 sao', testID: 'seller-reviews-filter-2' },
  { value: 1, label: '1 sao', testID: 'seller-reviews-filter-1' },
];

export default function SellerReviewsScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStack, 'SellerReviews'>>();
  const insets = useContext(SafeAreaInsetsContext);
  const bottomPad = Math.max(insets?.bottom ?? 0, primitive.space[6]);

  const {
    sellerReviews,
    sellerReviewsSellerId,
    sellerReviewsRatingFilter,
    sellerReviewsLoading,
    sellerReviewsRefreshing,
    sellerReviewsError,
    loadSellerReviews,
  } = useReviews();

  const sellerId = params.sellerId;
  const activeData = sellerReviewsSellerId === sellerId ? sellerReviews : null;

  const fetchInitial = useCallback(() => {
    void loadSellerReviews(sellerId, { rating: null, page: 0 });
  }, [loadSellerReviews, sellerId]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const handleFilterChange = (rating: number | null) => {
    void loadSellerReviews(sellerId, { rating, page: 0 });
  };

  const handleRefresh = () => {
    void loadSellerReviews(sellerId, {
      rating: sellerReviewsRatingFilter,
      page: 0,
      refresh: true,
    });
  };

  const handleLoadMore = () => {
    if (
      !activeData ||
      sellerReviewsLoading ||
      sellerReviewsRefreshing ||
      activeData.page + 1 >= activeData.totalPages
    ) {
      return;
    }
    void loadSellerReviews(sellerId, {
      rating: sellerReviewsRatingFilter,
      page: activeData.page + 1,
    });
  };

  const sellerName = activeData?.seller.displayName ?? params.sellerName ?? 'Người bán';
  const sellerInitial = (sellerName.trim()[0] ?? 'T').toUpperCase();
  const reputationScore =
    activeData?.seller.reputationScore ?? params.reputationScore ?? 100;
  const repSummary = formatReputationSummary(reputationScore);
  const isHighTrust = reputationScore >= 120;
  const averageRating = activeData?.seller.averageRating ?? null;
  const totalReviewCount = activeData?.seller.reviewCount ?? 0;
  const starDist = activeData?.starDistribution ?? { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

  const renderReviewRow = ({ item }: { item: PublicReviewItem }) => {
    const buyerInitial = (item.buyerDisplayName.trim()[0] ?? 'N').toUpperCase();
    const dateText = formatShortDate(item.publishedAt ?? item.createdAt);

    return (
      <View style={styles.reviewRow} testID={`public-review-card-${item.id}`}>
        <View style={styles.reviewRowHeader}>
          <View style={styles.buyerAvatar}>
            <Text style={styles.buyerAvatarText}>{buyerInitial}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.buyerName} numberOfLines={1}>
              {item.buyerDisplayName}
            </Text>
            <View style={styles.reviewMetaLine}>
              <StarRatingRow
                value={item.rating}
                readOnly
                size="sm"
                testIDPrefix={`public-review-stars-${item.id}`}
              />
              {dateText ? <Text style={styles.metaDot}>·</Text> : null}
              {dateText ? <Text style={styles.metaText}>{dateText}</Text> : null}
              {item.edited ? (
                <Text style={styles.editedTag} testID={`public-review-edited-${item.id}`}>
                  · Đã chỉnh sửa
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {item.comment ? (
          <Text style={styles.reviewComment}>{item.comment}</Text>
        ) : (
          <Text style={styles.reviewEmptyComment}>Người mua không để lại nhận xét chi tiết.</Text>
        )}

        {item.listingTitle ? (
          <Pressable
            disabled={!item.listingId}
            accessibilityRole={item.listingId ? 'button' : 'text'}
            accessibilityLabel={`Tin đăng: ${item.listingTitle}`}
            onPress={() => {
              if (item.listingId) {
                navigation.navigate('Listing', { id: item.listingId });
              }
            }}
            style={({ pressed }) => [
              styles.listingTag,
              pressed && Boolean(item.listingId) && styles.pressed,
            ]}
          >
            <Icon name="tag" size={12} color={semantic.color.textSecondary} />
            <Text style={styles.listingTagText} numberOfLines={1}>
              {item.listingTitle}
            </Text>
            {item.listingId ? (
              <Icon name="chevron-right" size={13} color={semantic.color.textSecondary} />
            ) : null}
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.screen} testID="seller-reviews-screen">
      <FlatList
        data={activeData?.items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderReviewRow}
        refreshControl={
          <RefreshControl
            refreshing={sellerReviewsRefreshing}
            onRefresh={handleRefresh}
            tintColor={semantic.color.accent}
          />
        }
        ItemSeparatorComponent={() => <HairlineDivider insetLeft={semantic.spacing.pageX} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        ListHeaderComponent={
          <View>
            {/* Seller Summary & Distribution Card */}
            <View style={styles.summarySection} testID="seller-reviews-summary">
              <View style={styles.sellerHeaderRow}>
                <View style={styles.sellerAvatar}>
                  <Text style={styles.sellerAvatarText}>{sellerInitial}</Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.sellerNameRow}>
                    <Text style={styles.sellerName} numberOfLines={1}>
                      {sellerName}
                    </Text>
                    <View style={styles.verifiedTag}>
                      <Icon name="check-circle" size={11} color={semantic.color.freeFg} />
                      <Text style={styles.verifiedTagText}>ĐHQG</Text>
                    </View>
                  </View>
                  <View style={styles.repRow}>
                    <Text style={styles.repScoreText}>Điểm uy tín: {reputationScore}</Text>
                    <StatusIndicator
                      variant="dot"
                      tone={isHighTrust ? 'success' : 'neutral'}
                      label={repSummary.tierLabel}
                    />
                  </View>
                </View>
              </View>

              <HairlineDivider />

              <View style={styles.ratingOverviewGrid}>
                <View style={styles.averageBox}>
                  <Text style={styles.averageNumber} testID="seller-reviews-average">
                    {averageRating !== null ? averageRating.toFixed(1) : '—'}
                  </Text>
                  <StarRatingRow
                    value={averageRating ?? 0}
                    readOnly
                    size="sm"
                    testIDPrefix="seller-reviews-avg-stars"
                  />
                  <Text style={styles.totalCountText} testID="seller-reviews-count">
                    {totalReviewCount} đánh giá công khai
                  </Text>
                </View>

                <View style={styles.distColumn}>
                  {(['5', '4', '3', '2', '1'] as const).map((starKey) => {
                    const count = starDist[starKey] ?? 0;
                    const ratio = totalReviewCount > 0 ? count / totalReviewCount : 0;
                    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
                    return (
                      <View key={starKey} style={styles.distRow}>
                        <Text style={styles.distStarLabel}>{starKey} sao</Text>
                        <View style={styles.distTrack}>
                          <View style={[styles.distFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={styles.distCount}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={styles.sectionGap} />

            {/* Star Rating Filter Pills */}
            <View style={styles.filterSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterPillsRow}
              >
                {RATING_FILTERS.map((opt) => {
                  const active = sellerReviewsRatingFilter === opt.value;
                  return (
                    <Pressable
                      key={opt.testID}
                      testID={opt.testID}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => handleFilterChange(opt.value)}
                      style={({ pressed }) => [
                        styles.filterPill,
                        active && styles.filterPillActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[styles.filterPillText, active && styles.filterPillTextActive]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <HairlineDivider />

            {sellerReviewsError ? (
              <View style={styles.errorWrap}>
                <InlineBanner
                  testID="seller-reviews-error"
                  tone="danger"
                  message={sellerReviewsError}
                  actionLabel="Thử lại"
                  onActionPress={handleRefresh}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          sellerReviewsLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={semantic.color.accent} />
              <Text style={styles.caption}>Đang tải đánh giá công khai…</Text>
            </View>
          ) : (
            <EmptyState
              testID="seller-reviews-empty"
              icon="star"
              title={
                sellerReviewsRatingFilter !== null
                  ? `Chưa có đánh giá ${sellerReviewsRatingFilter} sao`
                  : params.isOwnProfile
                    ? 'Bạn chưa có đánh giá công khai nào'
                    : 'Người bán chưa có đánh giá công khai'
              }
              subtitle={
                sellerReviewsRatingFilter !== null
                  ? 'Thử chọn "Tất cả" để xem toàn bộ các đánh giá đã được chấp nhận.'
                  : 'Chỉ những đánh giá đã được chấp nhận từ giao dịch hoàn tất mới hiển thị công khai tại đây.'
              }
              primaryActionLabel={
                sellerReviewsRatingFilter !== null ? 'Xem tất cả đánh giá' : undefined
              }
              onPrimaryAction={
                sellerReviewsRatingFilter !== null ? () => handleFilterChange(null) : undefined
              }
            />
          )
        }
        ListFooterComponent={
          activeData && activeData.page + 1 < activeData.totalPages ? (
            <View style={styles.loadMoreWrap}>
              <Pressable
                testID="seller-reviews-load-more"
                disabled={sellerReviewsLoading}
                accessibilityRole="button"
                accessibilityLabel="Tải thêm đánh giá"
                onPress={handleLoadMore}
                style={({ pressed }) => [
                  styles.loadMoreBtn,
                  sellerReviewsLoading && styles.disabled,
                  pressed && !sellerReviewsLoading && styles.pressed,
                ]}
              >
                <Text style={styles.loadMoreText}>
                  {sellerReviewsLoading ? 'Đang tải…' : 'Tải thêm đánh giá'}
                </Text>
              </Pressable>
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  flex: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  summarySection: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
  },
  sellerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.heroEspresso,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerAvatarText: {
    color: semantic.color.textInverse,
    fontSize: primitive.fontSize.lg,
    fontWeight: primitive.fontWeight.bold,
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  sellerName: {
    ...semantic.type.sectionTitle,
    flexShrink: 1,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.freeBg,
  },
  verifiedTagText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.freeFg,
  },
  repRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
    marginTop: 2,
  },
  repScoreText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  ratingOverviewGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[4],
  },
  averageBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 108,
    backgroundColor: semantic.color.bgWarmTint,
    borderRadius: primitive.radius.lg,
    paddingVertical: primitive.space[3],
    paddingHorizontal: primitive.space[2.5],
    gap: primitive.space[1],
  },
  averageNumber: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textPrimary,
  },
  totalCountText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    textAlign: 'center',
  },
  distColumn: {
    flex: 1,
    gap: primitive.space[1.5],
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  distStarLabel: {
    width: 34,
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  distTrack: {
    flex: 1,
    height: 7,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgTrack,
    overflow: 'hidden',
  },
  distFill: {
    height: '100%',
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.ratingStar,
  },
  distCount: {
    width: 24,
    textAlign: 'right',
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textPrimary,
  },
  sectionGap: {
    height: primitive.space[2],
    backgroundColor: semantic.color.bgCanvas,
  },
  filterSection: {
    backgroundColor: semantic.color.bgSurface,
    paddingVertical: primitive.space[2.5],
  },
  filterPillsRow: {
    paddingHorizontal: semantic.spacing.pageX,
    gap: primitive.space[2],
  },
  filterPill: {
    height: component.chip.height,
    paddingHorizontal: primitive.space[3],
    borderRadius: component.chip.radius,
    borderWidth: 1,
    borderColor: component.chip.border,
    backgroundColor: component.chip.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: component.chip.activeBg,
    borderColor: component.chip.activeBorder,
  },
  filterPillText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.medium,
  },
  filterPillTextActive: {
    color: component.chip.activeFg,
    fontWeight: primitive.fontWeight.semibold,
  },
  errorWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
  },
  center: {
    paddingVertical: primitive.space[10],
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  caption: {
    ...semantic.type.caption,
  },
  reviewRow: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[2.5],
    backgroundColor: semantic.color.bgSurface,
  },
  reviewRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  buyerAvatar: {
    width: 36,
    height: 36,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyerAvatarText: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  buyerName: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  reviewMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[1.5],
    marginTop: 2,
  },
  metaDot: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  metaText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  editedTag: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontStyle: 'italic',
  },
  reviewComment: {
    ...semantic.type.body,
    color: semantic.color.textPrimary,
  },
  reviewEmptyComment: {
    ...semantic.type.caption,
    fontStyle: 'italic',
  },
  listingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: primitive.space[1.5],
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1.5],
  },
  listingTagText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    flexShrink: 1,
  },
  loadMoreWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[4],
  },
  loadMoreBtn: {
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    ...semantic.type.label,
    color: component.button.secondaryFg,
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
