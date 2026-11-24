import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatShortDate, formatVnd, type ListingSummary } from '../listings/types';
import { colors, radius, space } from '../theme';

export interface ListingCardProps {
  listing: ListingSummary;
  onPress: (listing: ListingSummary) => void;
}

export function ListingCard({ listing, onPress }: ListingCardProps) {
  const thumb = listing.thumbnailUrl ?? listing.images[0] ?? null;
  const isFree = listing.isFree || listing.priceVnd === 0;
  const postedDate = formatShortDate(listing.publishedAt ?? listing.createdAt);
  const locationLabel =
    listing.locationName ?? listing.locationText ?? listing.locationCode ?? 'ĐHQG-HCM';
  const distanceLabel =
    typeof listing.distanceKm === 'number' && Number.isFinite(listing.distanceKm)
      ? `~${listing.distanceKm.toFixed(1)} km`
      : null;

  return (
    <Pressable
      testID={`listing-card-${listing.id}`}
      accessibilityRole="button"
      accessibilityLabel={listing.title}
      onPress={() => onPress(listing)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.topRow}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={styles.thumbnail}
            resizeMode="cover"
            accessibilityLabel={`Ảnh đại diện ${listing.title}`}
          />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Text style={styles.placeholderText}>Chưa có ảnh</Text>
          </View>
        )}

        <View style={styles.infoCol}>
          <View style={styles.badgeRow}>
            {listing.isCombo ? (
              <View style={[styles.badge, styles.comboBadge]}>
                <Text style={[styles.badgeText, styles.comboBadgeText]}>
                  Combo · {Math.max(2, listing.itemCount)} món
                </Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.singleBadge]}>
                <Text style={[styles.badgeText, styles.singleBadgeText]}>Tin đơn</Text>
              </View>
            )}

            {isFree ? (
              <View style={[styles.badge, styles.freeBadge]}>
                <Text style={[styles.badgeText, styles.freeBadgeText]}>Miễn phí 0đ</Text>
              </View>
            ) : null}

            {listing.courseCode ? (
              <View style={[styles.badge, styles.courseBadge]}>
                <Text style={[styles.badgeText, styles.courseBadgeText]}>
                  {listing.courseCode}
                </Text>
              </View>
            ) : null}

            {listing.status === 'GIU_CHO' ? (
              <View style={[styles.badge, styles.reservedBadge]}>
                <Text style={[styles.badgeText, styles.reservedBadgeText]}>Đang giữ chỗ</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.title} numberOfLines={2}>
            {listing.title}
          </Text>

          <Text style={[styles.price, isFree && styles.priceFree]}>
            {formatVnd(listing.priceVnd)}
          </Text>

          {listing.condition ? (
            <Text style={styles.condition} numberOfLines={1}>
              Tình trạng: {listing.condition}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.locationRow}>
          <Text style={styles.metaText} numberOfLines={1}>
            {locationLabel}
            {distanceLabel ? ` · ${distanceLabel}` : ''}
          </Text>
          {postedDate ? <Text style={styles.dateText}>{postedDate}</Text> : null}
        </View>

        <View style={styles.sellerRow}>
          <Text style={styles.sellerName} numberOfLines={1}>
            {listing.seller.displayName}
          </Text>
          <View style={styles.reputationPill}>
            <Text style={styles.reputationText}>⭐ {listing.seller.reputationScore}đ</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: space.sm,
  },
  cardPressed: {
    opacity: 0.92,
    borderColor: colors.brand,
  },
  topRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  thumbnail: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: '#ecebe4',
  },
  thumbnailPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: '#ecebe4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xs,
  },
  placeholderText: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  infoCol: {
    flex: 1,
    gap: space.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  singleBadge: {
    backgroundColor: '#f2ede4',
  },
  singleBadgeText: {
    color: colors.ink,
  },
  comboBadge: {
    backgroundColor: '#f9ebe7',
  },
  comboBadgeText: {
    color: colors.brand,
  },
  freeBadge: {
    backgroundColor: '#e6f4ea',
  },
  freeBadgeText: {
    color: '#137333',
  },
  courseBadge: {
    backgroundColor: '#e8f0fe',
  },
  courseBadgeText: {
    color: '#1967d2',
  },
  reservedBadge: {
    backgroundColor: '#fef7e0',
  },
  reservedBadgeText: {
    color: '#b06000',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    lineHeight: 20,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.brand,
  },
  priceFree: {
    color: '#137333',
  },
  condition: {
    fontSize: 12,
    color: colors.muted,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.sm,
    gap: 4,
  },
  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  metaText: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
  },
  dateText: {
    fontSize: 12,
    color: colors.muted,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  sellerName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.ink,
  },
  reputationPill: {
    backgroundColor: '#f2ede4',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  reputationText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
});

export default ListingCard;
