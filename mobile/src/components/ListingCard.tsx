import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  formatReputationSummary,
  formatShortDate,
  formatVnd,
  type ListingSummary,
} from '../listings/types';
import { component, primitive, semantic } from '../theme';
import { HairlineDivider, Icon, StatusIndicator } from './ui';

export type ListingCardVariant = 'grid' | 'list';

export interface ListingCardProps {
  listing: ListingSummary;
  onPress: (listing: ListingSummary) => void;
  variant?: ListingCardVariant;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const LIST_THUMB_SIZE = 108;

export function ListingCard({
  listing,
  onPress,
  variant = 'grid',
  testID,
  style,
}: ListingCardProps) {
  const thumb = listing.thumbnailUrl ?? listing.images[0] ?? null;
  const photoCount = listing.images.length;
  const isFree = listing.isFree || listing.priceVnd === 0;
  const priceLabel = formatVnd(listing.priceVnd);
  const postedDate = formatShortDate(listing.publishedAt ?? listing.createdAt);
  const locationLabel =
    listing.locationName ?? listing.locationText ?? listing.locationCode ?? 'ĐHQG-HCM';
  const distanceLabel =
    typeof listing.distanceKm === 'number' && Number.isFinite(listing.distanceKm)
      ? `~${listing.distanceKm.toFixed(1)} km`
      : null;
  const locationDistanceLabel = distanceLabel
    ? `${locationLabel} · ${distanceLabel}`
    : locationLabel;
  const reputation = formatReputationSummary(listing.seller.reputationScore);
  const isReserved = listing.status === 'GIU_CHO';
  const isHighTrust = listing.seller.reputationScore >= 120;
  const conditionText = listing.condition?.trim() || null;
  const hasRating =
    listing.seller.reviewCount > 0 &&
    typeof listing.seller.averageRating === 'number' &&
    Number.isFinite(listing.seller.averageRating);
  const cardTestID = testID ?? `listing-card-${listing.id}`;

  if (variant === 'grid') {
    return (
      <Pressable
        testID={cardTestID}
        accessibilityRole="button"
        accessibilityLabel={`${listing.title}, ${priceLabel}, ${locationLabel}`}
        onPress={() => onPress(listing)}
        style={({ pressed }) => [styles.gridCard, pressed && styles.gridCardPressed, style]}
      >
        <View style={styles.gridPhotoStage}>
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              style={styles.gridPhoto}
              resizeMode="cover"
              accessibilityLabel={`Ảnh đại diện ${listing.title}`}
            />
          ) : (
            <View style={styles.gridPhotoPlaceholder}>
              <Icon name="image" size={28} color={semantic.color.textSecondary} />
            </View>
          )}

          {/* Top-left corner badge: reserved OR combo OR free giveaway */}
          {isReserved ? (
            <View style={[styles.photoBadgeTopLeft, styles.photoBadgeReserved]}>
              <Text style={styles.photoBadgeText}>Đang giữ chỗ</Text>
            </View>
          ) : listing.isCombo && isFree ? (
            <View style={[styles.photoBadgeTopLeft, styles.photoBadgeFree]}>
              <Icon name="gift" size={11} color={semantic.color.textInverse} />
              <Text style={styles.photoBadgeText}>
                Combo · {Math.max(2, listing.itemCount)} món
              </Text>
            </View>
          ) : listing.isCombo ? (
            <View style={styles.photoBadgeTopLeft}>
              <Icon name="layers" size={11} color={semantic.color.textInverse} />
              <Text style={styles.photoBadgeText}>
                Combo · {Math.max(2, listing.itemCount)} món
              </Text>
            </View>
          ) : isFree ? (
            <View style={[styles.photoBadgeTopLeft, styles.photoBadgeFree]}>
              <Icon name="gift" size={10} color={semantic.color.textInverse} />
              <Text style={styles.photoBadgeText}>Tặng 0đ</Text>
            </View>
          ) : null}

          {/* Top-right course code pill for textbooks */}
          {listing.courseCode ? (
            <View style={styles.courseOverlayPill}>
              <Text style={styles.courseOverlayText} numberOfLines={1}>
                {listing.courseCode}
              </Text>
            </View>
          ) : null}

          {/* Bottom-right photo count pill when multiple photos */}
          {photoCount > 1 ? (
            <View style={styles.photoCountPill}>
              <Icon name="camera" size={10} color={semantic.color.textInverse} />
              <Text style={styles.photoCountText}>{photoCount}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.gridBody}>
          <Text style={styles.gridTitle} numberOfLines={2}>
            {listing.title}
          </Text>

          {conditionText ? (
            <Text
              style={styles.gridConditionText}
              numberOfLines={1}
              ellipsizeMode="tail"
              testID={`listing-condition-${listing.id}`}
            >
              {conditionText}
            </Text>
          ) : null}

          <View style={styles.gridPriceRow}>
            <Text style={[styles.gridPrice, isFree && styles.priceFree]} numberOfLines={1}>
              {priceLabel}
            </Text>
            {hasRating ? (
              <View style={styles.ratingPill}>
                <Icon name="star" size={11} color={semantic.color.ratingStar} />
                <Text style={styles.ratingValue}>
                  {listing.seller.averageRating!.toFixed(1)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.gridLocationRow}>
            <Icon name="map-pin" size={11} color={semantic.color.textSecondary} />
            <Text style={styles.gridLocationText} numberOfLines={1} ellipsizeMode="tail">
              {locationDistanceLabel}
            </Text>
          </View>

          <View style={styles.gridFooterRow}>
            <View style={styles.gridTrustGroup}>
              <Icon
                name={isHighTrust ? 'check-circle' : 'shield'}
                size={11}
                color={isHighTrust ? semantic.color.freeFg : semantic.color.textSecondary}
              />
              <Text
                style={[styles.gridTrustText, isHighTrust && styles.gridTrustTextHigh]}
                numberOfLines={1}
              >
                {reputation.scoreText}
              </Text>
            </View>
            {postedDate ? (
              <Text style={styles.gridDateText} numberOfLines={1}>
                {postedDate}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.listWrapper, style]}>
      <Pressable
        testID={cardTestID}
        accessibilityRole="button"
        accessibilityLabel={`${listing.title}, ${priceLabel}, ${locationLabel}`}
        onPress={() => onPress(listing)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.listThumbStage}>
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              style={styles.thumbnail}
              resizeMode="cover"
              accessibilityLabel={`Ảnh đại diện ${listing.title}`}
            />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Icon name="image" size={26} color={semantic.color.textSecondary} />
            </View>
          )}
          {isFree ? (
            <View style={styles.listFreeOverlay}>
              <Text style={styles.listFreeOverlayText}>0đ</Text>
            </View>
          ) : null}
          {photoCount > 1 ? (
            <View style={styles.listPhotoCountPill}>
              <Icon name="camera" size={9} color={semantic.color.textInverse} />
              <Text style={styles.photoCountText}>{photoCount}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.content}>
          <View style={styles.topGroup}>
            <Text style={styles.title} numberOfLines={2}>
              {listing.title}
            </Text>

            {conditionText ? (
              <Text
                style={styles.listConditionText}
                numberOfLines={1}
                ellipsizeMode="tail"
                testID={`listing-condition-${listing.id}`}
              >
                {conditionText}
              </Text>
            ) : null}

            <View style={styles.metaRow}>
              <Icon name="map-pin" size={12} color={semantic.color.textSecondary} />
              <Text style={styles.metaLocation} numberOfLines={1} ellipsizeMode="tail">
                {locationDistanceLabel}
              </Text>
              {postedDate ? (
                <>
                  <Text style={styles.metaSep}>·</Text>
                  <Text style={styles.metaItem} numberOfLines={1}>
                    {postedDate}
                  </Text>
                </>
              ) : null}
              {listing.courseCode ? (
                <>
                  <Text style={styles.metaSep}>·</Text>
                  <Text style={styles.courseText} numberOfLines={1}>
                    {listing.courseCode}
                  </Text>
                </>
              ) : null}
            </View>
          </View>

          <View style={styles.bottomGroup}>
            <View style={styles.priceRow}>
              <Text style={[styles.price, isFree && styles.priceFree]} numberOfLines={1}>
                {priceLabel}
              </Text>

              {isReserved ? (
                <StatusIndicator label="Đang giữ chỗ" tone="warning" variant="urgent" />
              ) : listing.isCombo ? (
                <StatusIndicator
                  label={`Combo · ${Math.max(2, listing.itemCount)} món`}
                  tone="neutral"
                  variant="soft"
                />
              ) : null}
            </View>

            <View style={styles.trustRow}>
              <Text style={styles.sellerName} numberOfLines={1} ellipsizeMode="tail">
                {listing.seller.displayName}
              </Text>
              <Text style={styles.trustSep}>·</Text>
              <Icon
                name={isHighTrust ? 'check-circle' : 'shield'}
                size={12}
                color={isHighTrust ? semantic.color.freeFg : semantic.color.textSecondary}
              />
              <Text
                style={[styles.reputationText, isHighTrust && styles.gridTrustTextHigh]}
                numberOfLines={1}
              >
                {reputation.scoreText}
              </Text>
              {hasRating ? (
                <>
                  <Text style={styles.trustSep}>·</Text>
                  <Icon name="star" size={11} color={semantic.color.ratingStar} />
                  <Text style={styles.ratingValue}>
                    {listing.seller.averageRating!.toFixed(1)}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>

      <HairlineDivider
        insetLeft={component.listRow.paddingX}
        insetRight={component.listRow.paddingX}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 2-Column E-commerce Grid Card
  gridCard: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
    borderRadius: primitive.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    ...primitive.elevation.thumb,
  },
  gridCardPressed: {
    opacity: primitive.opacity.pressed,
  },
  gridPhotoStage: {
    width: '100%',
    aspectRatio: 1.06,
    backgroundColor: semantic.color.bgSubtle,
    position: 'relative',
  },
  gridPhoto: {
    width: '100%',
    height: '100%',
  },
  gridPhotoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.color.bgTrack,
  },
  photoBadgeTopLeft: {
    position: 'absolute',
    top: primitive.space[2],
    left: primitive.space[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: primitive.space[2],
    paddingVertical: 3,
    borderRadius: primitive.radius.sm,
    backgroundColor: semantic.color.overlayDark,
  },
  photoBadgeReserved: {
    backgroundColor: semantic.color.warning,
  },
  photoBadgeFree: {
    backgroundColor: semantic.color.freeFg,
  },
  photoBadgeText: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textInverse,
  },
  courseOverlayPill: {
    position: 'absolute',
    top: primitive.space[2],
    right: primitive.space[2],
    paddingHorizontal: primitive.space[1.5],
    paddingVertical: 2.5,
    borderRadius: primitive.radius.sm,
    backgroundColor: semantic.color.overlayLight,
  },
  courseOverlayText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textPrimary,
    letterSpacing: 0.2,
  },
  photoCountPill: {
    position: 'absolute',
    bottom: primitive.space[2],
    right: primitive.space[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
  },
  photoCountText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textInverse,
  },
  gridBody: {
    padding: primitive.space[2.5],
    gap: 4,
  },
  gridTitle: {
    fontSize: 13,
    lineHeight: 17.5,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
    minHeight: 35,
  },
  gridConditionText: {
    fontSize: 11,
    lineHeight: 14,
    color: semantic.color.textSecondary,
    backgroundColor: semantic.color.bgSubtle,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: primitive.radius.xs,
    overflow: 'hidden',
  },
  gridPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[1],
    marginTop: 1,
  },
  gridPrice: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.accent,
    flexShrink: 1,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: primitive.radius.sm,
    backgroundColor: semantic.color.ratingBg,
  },
  ratingValue: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.ratingText,
  },
  gridLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridLocationText: {
    fontSize: 11,
    lineHeight: 14.5,
    color: semantic.color.textSecondary,
    flex: 1,
  },
  gridFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: primitive.space[1],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.color.borderHairline,
    gap: primitive.space[1],
  },
  gridTrustGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  gridTrustText: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.medium,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  gridTrustTextHigh: {
    color: semantic.color.freeFg,
    fontWeight: primitive.fontWeight.semibold,
  },
  gridDateText: {
    fontSize: 10.5,
    lineHeight: 14,
    color: semantic.color.textSecondary,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },

  // 1-Column Horizontal List Card
  listWrapper: {
    backgroundColor: component.listRow.bg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: component.listRow.paddingX,
    paddingVertical: component.listRow.paddingY,
    gap: primitive.space[3],
    backgroundColor: component.listRow.bg,
  },
  rowPressed: {
    backgroundColor: component.listRow.pressedBg,
  },
  listThumbStage: {
    width: LIST_THUMB_SIZE,
    height: LIST_THUMB_SIZE,
    position: 'relative',
  },
  thumbnail: {
    width: LIST_THUMB_SIZE,
    height: LIST_THUMB_SIZE,
    borderRadius: component.listRow.thumbRadius,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  thumbnailPlaceholder: {
    width: LIST_THUMB_SIZE,
    height: LIST_THUMB_SIZE,
    borderRadius: component.listRow.thumbRadius,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listFreeOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: primitive.radius.xs,
    backgroundColor: semantic.color.freeFg,
  },
  listFreeOverlayText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textInverse,
  },
  listPhotoCountPill: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
  },
  content: {
    flex: 1,
    minHeight: LIST_THUMB_SIZE,
    justifyContent: 'space-between',
    gap: primitive.space[1.5],
  },
  topGroup: {
    gap: 3,
  },
  title: {
    ...semantic.type.cardTitle,
  },
  listConditionText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
    overflow: 'hidden',
  },
  metaLocation: {
    ...semantic.type.caption,
    flexShrink: 1,
  },
  metaSep: {
    ...semantic.type.caption,
    flexShrink: 0,
  },
  metaItem: {
    ...semantic.type.caption,
    flexShrink: 0,
  },
  courseText: {
    ...semantic.type.caption,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.accent,
    flexShrink: 0,
  },
  bottomGroup: {
    gap: primitive.space[1],
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  price: {
    ...semantic.type.price,
    color: semantic.color.accent,
    flexShrink: 1,
  },
  priceFree: {
    color: semantic.color.freeFg,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
  },
  sellerName: {
    ...semantic.type.micro,
    flexShrink: 1,
  },
  trustSep: {
    ...semantic.type.micro,
    flexShrink: 0,
  },
  reputationText: {
    ...semantic.type.micro,
    flexShrink: 0,
  },
});

export default ListingCard;
