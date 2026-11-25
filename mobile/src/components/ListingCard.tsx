import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatReputationSummary,
  formatShortDate,
  formatVnd,
  type ListingSummary,
} from '../listings/types';
import { component, primitive, semantic } from '../theme';
import { HairlineDivider, Icon, StatusIndicator } from './ui';

export interface ListingCardProps {
  listing: ListingSummary;
  onPress: (listing: ListingSummary) => void;
}

const THUMB_SIZE = 104;

export function ListingCard({ listing, onPress }: ListingCardProps) {
  const thumb = listing.thumbnailUrl ?? listing.images[0] ?? null;
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

  return (
    <View style={styles.wrapper}>
      <Pressable
        testID={`listing-card-${listing.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${listing.title}, ${priceLabel}, ${locationLabel}`}
        onPress={() => onPress(listing)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
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

        <View style={styles.content}>
          <View style={styles.topGroup}>
            <Text style={styles.title} numberOfLines={2}>
              {listing.title}
            </Text>

            <View style={styles.metaRow}>
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
              <Icon name="shield" size={12} color={semantic.color.textSecondary} />
              <Text style={styles.reputationText} numberOfLines={1}>
                {reputation.scoreText}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      <HairlineDivider insetLeft={component.listRow.paddingX} insetRight={component.listRow.paddingX} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
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
  thumbnail: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: component.listRow.thumbRadius,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  thumbnailPlaceholder: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: component.listRow.thumbRadius,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minHeight: THUMB_SIZE,
    justifyContent: 'space-between',
    gap: primitive.space[1.5],
  },
  topGroup: {
    gap: primitive.space[1],
  },
  title: {
    ...semantic.type.cardTitle,
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
    fontWeight: primitive.fontWeight.medium,
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
    flexShrink: 1,
  },
  priceFree: {
    color: semantic.color.success,
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
