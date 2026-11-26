import { Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav, RootStack } from '../navigation';
import { resolveMediaUrl } from '../api/client';
import { useDiscovery } from '../listings/discoveryStore';
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import { formatReputationSummary } from '../listings/types';
import { useOrders } from '../orders/store';
import {
  buildPresetMeetingTime,
  formatExactVnd,
  parseMeetingTimeInput,
  QUICK_MEETING_LOCATIONS,
} from '../orders/types';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  EmptyState,
  FormField,
  HairlineDivider,
  Icon,
  InlineBanner,
  SectionHeading,
  StatusIndicator,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

const LISTING_GONE_CODES = new Set([
  'LISTING_NOT_FOUND',
  'LISTING_NOT_AVAILABLE',
  'LISTING_HIDDEN',
  'LISTING_WITHDRAWN',
]);

export default function ReservationRequestScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStack, 'ReservationRequest'>>();
  const insets = useContext(SafeAreaInsetsContext);
  const stickyBottomPad = Math.max(insets?.bottom ?? 0, primitive.space[3]);

  const listingId = params?.listingId ?? '';

  const selectedDetail = useDiscovery((s) => s.selectedDetail);
  const detailLoading = useDiscovery((s) => s.detailLoading);
  const detailError = useDiscovery((s) => s.detailError);
  const detailNotFound = useDiscovery((s) => s.detailNotFound);
  const loadDetail = useDiscovery((s) => s.loadDetail);
  const createRequest = useOrders((s) => s.createRequest);
  const mutating = useOrders((s) => s.submitting);

  const detail = selectedDetail?.id === listingId ? selectedDetail : null;
  const preview = detail ?? params?.listing ?? null;

  const timePresets = useMemo(
    () => [
      { label: 'Ngày mai 10:00', value: buildPresetMeetingTime(1, 10) },
      { label: 'Ngày mai 18:00', value: buildPresetMeetingTime(1, 18) },
      { label: '2 ngày nữa 17:00', value: buildPresetMeetingTime(2, 17) },
    ],
    [],
  );

  const locationTouchedRef = useRef(Boolean(params?.listing?.locationName));
  const [meetingTimeText, setMeetingTimeText] = useState(() => timePresets[1].value);
  const [meetingLocation, setMeetingLocation] = useState(
    () => preview?.locationName ?? QUICK_MEETING_LOCATIONS[0],
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [timeError, setTimeError] = useState('');

  useEffect(() => {
    if (listingId && (!selectedDetail || selectedDetail.id !== listingId)) {
      void loadDetail(listingId);
    }
  }, [listingId, selectedDetail, loadDetail]);

  useEffect(() => {
    if (!locationTouchedRef.current && detail?.locationName) {
      setMeetingLocation(detail.locationName);
    }
  }, [detail?.locationName]);

  const isListingFree = Boolean(preview && (preview.isFree || preview.priceVnd === 0));

  const appliedPriceVnd = useMemo(() => {
    if (!preview) return null;
    if (isListingFree) return 0;
    if (typeof params?.agreedPriceVnd === 'number' && Number.isFinite(params.agreedPriceVnd)) {
      return Math.round(params.agreedPriceVnd);
    }
    return preview.priceVnd;
  }, [isListingFree, params?.agreedPriceVnd, preview]);

  const isCombo = Boolean(preview?.isCombo || (detail && detail.items.length >= 2));
  const hasPriceDiff = Boolean(
    preview && appliedPriceVnd !== null && appliedPriceVnd !== preview.priceVnd,
  );
  const invalidPaidPriceError =
    preview && !isListingFree && (appliedPriceVnd === null || appliedPriceVnd <= 0)
      ? 'Tin có phí không thể đặt giá 0đ.'
      : '';

  const unavailableReason = useMemo(() => {
    if (!detail) return '';
    if (detail.viewer.isOwner) {
      return 'Bạn không thể gửi yêu cầu giữ chỗ cho tin đăng của chính mình.';
    }
    if (detail.status === 'GIU_CHO') {
      return 'Tin đăng này hiện đã được giữ chỗ cho giao dịch khác.';
    }
    if (detail.status !== 'CONG_KHAI') {
      return 'Tin đăng không còn công khai (đã rút, hết hạn hoặc bị ẩn).';
    }
    if (detail.hasUnavailableItems) {
      return 'Một hoặc nhiều đồ vật trong tin hiện không còn khả dụng.';
    }
    if (!detail.viewer.canReserve) {
      return 'Tin đăng hiện không đủ điều kiện để gửi yêu cầu giữ chỗ.';
    }
    return '';
  }, [detail]);

  const isSubmitBlocked =
    !preview || Boolean(unavailableReason) || Boolean(invalidPaidPriceError) || mutating;
  const shouldOfferSearchRedirect =
    Boolean(errorCode && LISTING_GONE_CODES.has(errorCode)) ||
    Boolean(detail && detail.status !== 'CONG_KHAI' && detail.status !== 'GIU_CHO');

  const thumbUri = preview?.thumbnailUrl
    ? resolveMediaUrl(preview.thumbnailUrl)
    : preview?.images?.[0]
      ? resolveMediaUrl(preview.images[0])
      : null;

  const sellerRep = preview?.seller
    ? formatReputationSummary(preview.seller.reputationScore)
    : null;

  const handleSubmit = async () => {
    if (!preview || !listingId || mutating) return;
    if (!isListingFree && (appliedPriceVnd === null || appliedPriceVnd <= 0)) {
      setError('Tin có phí không thể đặt giá 0đ.');
      return;
    }
    if (unavailableReason) return;
    setError('');
    setErrorCode(null);
    setTimeError('');

    let isoTime: string | null = null;
    if (meetingTimeText.trim()) {
      isoTime = parseMeetingTimeInput(meetingTimeText);
      if (!isoTime) {
        setTimeError('Định dạng thời gian không hợp lệ. Vui lòng dùng dạng YYYY-MM-DD HH:mm.');
        return;
      }
      if (new Date(isoTime).getTime() <= Date.now()) {
        setTimeError('Thời gian hẹn dự kiến phải ở tương lai.');
        return;
      }
    }

    try {
      const created = await createRequest({
        listingId,
        agreedPriceVnd: isListingFree ? 0 : appliedPriceVnd!,
        proposedMeetingTime: isoTime,
        proposedMeetingLocation: meetingLocation.trim() || null,
        note: note.trim() || null,
      });
      if (typeof navigation.replace === 'function') {
        navigation.replace('OrderDetail', { id: created.id, justCreated: true });
      } else {
        navigation.navigate('OrderDetail', { id: created.id, justCreated: true });
      }
    } catch (err) {
      if (!isRestrictedError(err)) {
        const parsed = extractApiError(err, 'Không thể gửi yêu cầu giữ chỗ. Vui lòng thử lại.');
        setError(parsed.message);
        setErrorCode(parsed.code ?? null);
      }
    }
  };

  if (detailNotFound && !detail) {
    return (
      <View style={styles.center}>
        <EmptyState
          testID="reservation-listing-not-found"
          icon="eye-off"
          title="Tin đăng không còn khả dụng"
          subtitle="Tin đăng này có thể đã bị người bán rút, xóa hoặc bị khóa do vi phạm quy định."
          primaryActionLabel="Quay lại tìm kiếm"
          primaryActionTestID="reservation-not-found-back"
          onPrimaryAction={() => navigation.navigate('Listings')}
        />
      </View>
    );
  }

  if (detailLoading && !preview) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={semantic.color.accent} />
        <Text style={styles.loadingText}>Đang kiểm tra khả dụng tin đăng…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Warning & Error Strip */}
          <View style={styles.section}>
            <RestrictedAccountNotice />

            <InlineBanner
              testID="reservation-not-locked-warning"
              tone="warning"
              title="Gửi yêu cầu chưa phải là đã giữ đồ"
              message="Tin đăng và đồ vật chỉ được chính thức giữ chỗ sau khi người bán bấm Chấp nhận yêu cầu của bạn."
            />

            {detailError && !preview ? (
              <InlineBanner
                testID="reservation-detail-error-banner"
                tone="danger"
                title="Không thể tải thông tin tin đăng"
                message={detailError}
                actionLabel="Thử lại"
                actionTestID="reservation-detail-retry-button"
                onActionPress={() => {
                  if (listingId) {
                    void loadDetail(listingId);
                  }
                }}
              />
            ) : null}

            {unavailableReason ? (
              <InlineBanner
                testID="reservation-unavailable-banner"
                tone="danger"
                title="Tin đăng tạm thời không thể giữ chỗ"
                message={unavailableReason}
                actionLabel="Quay lại tìm kiếm"
                actionTestID="reservation-back-to-listings"
                onActionPress={() => navigation.navigate('Listings')}
              />
            ) : null}

            {error ? (
              <InlineBanner
                testID="reservation-error-banner"
                tone="danger"
                message={error}
                actionLabel={shouldOfferSearchRedirect ? 'Quay lại tìm kiếm' : undefined}
                actionTestID={
                  shouldOfferSearchRedirect ? 'reservation-error-back-listings' : undefined
                }
                onActionPress={
                  shouldOfferSearchRedirect ? () => navigation.navigate('Listings') : undefined
                }
              />
            ) : null}
          </View>

          <View style={styles.sectionGap} />

          {/* Listing Summary & Price Section (Flat Editorial) */}
          {preview ? (
            <>
              <View style={styles.section} testID="reservation-listing-summary">
                <SectionHeading title="Thông tin tin đăng" />

                <View style={styles.listingRow}>
                  {thumbUri ? (
                    <Image
                      source={{ uri: thumbUri }}
                      style={styles.thumb}
                      resizeMode="cover"
                      accessibilityLabel={preview.title}
                    />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Icon name="image" size={22} color={semantic.color.textSecondary} />
                    </View>
                  )}

                  <View style={styles.listingInfo}>
                    <Text style={styles.listingTitle} numberOfLines={2}>
                      {preview.title}
                    </Text>

                    <View style={styles.badgeRow}>
                      {isCombo ? (
                        <StatusIndicator variant="soft" tone="accent" label="Combo nguyên bộ" />
                      ) : null}
                      {preview.locationName ? (
                        <Text style={styles.metaCaption} numberOfLines={1}>
                          {preview.locationName}
                        </Text>
                      ) : null}
                    </View>

                    {preview.seller && sellerRep ? (
                      <Text style={styles.metaCaption} numberOfLines={1}>
                        Người bán: {preview.seller.displayName} · {sellerRep.scoreText}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <HairlineDivider />

                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>
                    {hasPriceDiff ? 'Giá thỏa thuận' : 'Mức giá áp dụng'}
                  </Text>
                  <View style={styles.priceValueCol}>
                    <Text
                      testID="reservation-applied-price"
                      style={[styles.priceValue, isListingFree && styles.priceFree]}
                    >
                      {isListingFree ? '0đ · Cho tặng' : formatExactVnd(appliedPriceVnd)}
                    </Text>
                    {hasPriceDiff ? (
                      <Text testID="reservation-listed-price" style={styles.listedPriceCaption}>
                        {`Giá niêm yết: ${isListingFree ? '0đ · Cho tặng' : formatExactVnd(preview.priceVnd)}`}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {invalidPaidPriceError ? (
                  <InlineBanner
                    testID="reservation-price-error"
                    tone="danger"
                    message={invalidPaidPriceError}
                  />
                ) : null}

                {isCombo ? (
                  <View style={styles.comboBox} testID="reservation-combo-note">
                    <View style={styles.comboHeaderRow}>
                      <Icon name="layers" size={15} color={semantic.color.accent} />
                      <Text style={styles.comboNoteText}>
                        Áp dụng cho toàn bộ gói đồ, không mua tách lẻ.
                      </Text>
                    </View>
                    {detail && detail.items.length > 0 ? (
                      <View style={styles.comboItemsList}>
                        {detail.items.map((item, idx) => (
                          <Fragment key={item.id}>
                            {idx > 0 ? <HairlineDivider /> : null}
                            <View style={styles.comboItemRow}>
                              <Text style={styles.comboItemName} numberOfLines={1}>
                                {item.name}
                              </Text>
                              <Text style={styles.comboItemCond} numberOfLines={1}>
                                {item.condition}
                              </Text>
                            </View>
                          </Fragment>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View style={styles.sectionGap} />
            </>
          ) : null}

          {/* Schedule Suggestion & Note Form Section */}
          <View style={styles.section}>
            <SectionHeading
              title="Lịch hẹn dự kiến (tùy chọn)"
              subtitle="Gợi ý khung giờ & địa điểm gặp để người bán dễ dàng xem xét. Hai bên vẫn sẽ thống nhất lại sau khi chấp nhận."
            />

            <View style={styles.chipsRow}>
              {timePresets.map((preset) => {
                const active = meetingTimeText.trim() === preset.value;
                return (
                  <Pressable
                    key={preset.label}
                    onPress={() => {
                      setMeetingTimeText(preset.value);
                      setTimeError('');
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon
                      name="clock"
                      size={12}
                      color={active ? semantic.color.accent : semantic.color.textSecondary}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <FormField
              testID="reservation-time-input"
              label="Thời gian hẹn dự kiến"
              placeholder="YYYY-MM-DD HH:mm"
              helperText="Định dạng: YYYY-MM-DD HH:mm (ví dụ 2026-11-28 18:00)"
              value={meetingTimeText}
              onChangeText={(text) => {
                setMeetingTimeText(text);
                if (timeError) setTimeError('');
              }}
              error={timeError}
              leadingIcon="calendar"
              editable={!mutating}
            />

            <View style={styles.chipsRow}>
              {QUICK_MEETING_LOCATIONS.map((loc) => {
                const active = meetingLocation === loc;
                return (
                  <Pressable
                    key={loc}
                    onPress={() => {
                      locationTouchedRef.current = true;
                      setMeetingLocation(loc);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon
                      name="map-pin"
                      size={12}
                      color={active ? semantic.color.accent : semantic.color.textSecondary}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{loc}</Text>
                  </Pressable>
                );
              })}
            </View>

            <FormField
              testID="reservation-location-input"
              label="Địa điểm hẹn dự kiến"
              placeholder="Ví dụ: Sảnh tòa A1 KTX Khu A"
              maxLength={255}
              value={meetingLocation}
              onChangeText={(text) => {
                locationTouchedRef.current = true;
                setMeetingLocation(text);
              }}
              leadingIcon="map-pin"
              editable={!mutating}
            />

            <FormField
              testID="reservation-note-input"
              label="Ghi chú cho người bán"
              placeholder="Nhắn thêm khung giờ rảnh hoặc lưu ý nhận đồ tại KTX…"
              multiline
              maxLength={1000}
              value={note}
              onChangeText={setNote}
              editable={!mutating}
            />
          </View>
        </ScrollView>

        {/* Sticky Bottom CTA Dock */}
        <View style={[styles.stickyBar, { paddingBottom: stickyBottomPad }]}>
          <View style={styles.stickySummaryRow}>
            <Text style={styles.stickySummaryLabel}>Giá áp dụng</Text>
            <Text
              testID="reservation-sticky-price"
              style={[styles.stickySummaryPrice, isListingFree && styles.priceFree]}
            >
              {!preview
                ? '—'
                : isListingFree
                  ? '0đ · Cho tặng'
                  : formatExactVnd(appliedPriceVnd)}
            </Text>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              testID="cancel-reservation-request"
              accessibilityRole="button"
              accessibilityLabel="Hủy bỏ"
              disabled={mutating}
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryBtnText}>Hủy bỏ</Text>
            </Pressable>

            <Pressable
              testID="submit-reservation-request"
              accessibilityRole="button"
              accessibilityLabel="Xác nhận gửi yêu cầu giữ chỗ"
              accessibilityState={{ disabled: isSubmitBlocked, busy: mutating }}
              disabled={isSubmitBlocked}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.primaryBtn,
                isSubmitBlocked && styles.disabledBtn,
                pressed && !isSubmitBlocked && styles.primaryBtnPressed,
              ]}
            >
              {mutating ? (
                <ActivityIndicator size="small" color={component.button.primaryFg} />
              ) : (
                <Icon name="send" size={16} color={component.button.primaryFg} />
              )}
              <Text style={styles.primaryBtnText}>
                {mutating ? 'Đang gửi…' : 'Gửi yêu cầu giữ chỗ'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.color.bgSurface,
    gap: primitive.space[3],
  },
  loadingText: {
    ...semantic.type.caption,
  },
  scrollView: {
    flex: 1,
    backgroundColor: semantic.color.bgCanvas,
  },
  scrollContent: {
    paddingBottom: primitive.space[6],
  },
  section: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
  },
  sectionGap: {
    height: primitive.space[2],
    backgroundColor: semantic.color.bgCanvas,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[3],
  },
  thumb: {
    width: 68,
    height: 68,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgTrack,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  thumbPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingInfo: {
    flex: 1,
    gap: primitive.space[1],
  },
  listingTitle: {
    ...semantic.type.cardTitle,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  metaCaption: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  priceLabel: {
    ...semantic.type.caption,
  },
  priceValueCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  priceValue: {
    ...semantic.type.price,
    fontSize: primitive.fontSize.lg,
    color: semantic.color.accent,
  },
  priceFree: {
    color: semantic.color.freeFg,
  },
  listedPriceCaption: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  comboBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    padding: primitive.space[3],
    gap: primitive.space[2],
  },
  comboHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  comboNoteText: {
    ...semantic.type.label,
    color: semantic.color.accent,
    flex: 1,
  },
  comboItemsList: {
    gap: primitive.space[1.5],
  },
  comboItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
    paddingVertical: primitive.space[1],
  },
  comboItemName: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.medium,
    flex: 1,
  },
  comboItemCond: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    minHeight: component.chip.height,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1],
    borderRadius: component.chip.radius,
    backgroundColor: component.chip.bg,
    borderWidth: 1,
    borderColor: component.chip.border,
  },
  chipActive: {
    borderColor: component.chip.activeBorder,
    backgroundColor: component.chip.activeBg,
  },
  chipText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  chipTextActive: {
    color: component.chip.activeFg,
    fontWeight: primitive.fontWeight.semibold,
  },
  stickyBar: {
    borderTopWidth: 1,
    borderTopColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    gap: primitive.space[2.5],
  },
  stickySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stickySummaryLabel: {
    ...semantic.type.caption,
  },
  stickySummaryPrice: {
    ...semantic.type.price,
    color: semantic.color.accent,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  secondaryBtn: {
    flex: 1,
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: primitive.space[3],
  },
  secondaryBtnText: {
    fontSize: primitive.fontSize.sm,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.secondaryFg,
  },
  primaryBtn: {
    flex: 2,
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.primaryBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    paddingHorizontal: component.button.paddingX,
  },
  primaryBtnPressed: {
    backgroundColor: component.button.primaryPressedBg,
  },
  primaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.primaryFg,
  },
  disabledBtn: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
