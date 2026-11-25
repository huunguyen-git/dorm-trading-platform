import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { Nav, RootStack } from '../navigation';
import { useDiscovery } from '../listings/discoveryStore';
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import { formatVnd } from '../listings/types';
import { useOrders } from '../orders/store';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  FormField,
  HairlineDivider,
  Icon,
  InlineBanner,
  SectionHeading,
  StatusIndicator,
} from '../components/ui';
import { primitive, semantic } from '../theme';

const QUICK_LOCATIONS = [
  'Cổng KTX Khu A',
  'Cổng KTX Khu B',
  'Nhà Văn hóa SV ĐHQG',
  'Cổng ĐH CNTT (UIT)',
];

function formatLocalDateTimeInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function parseUserDateTimeToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function buildPresetTime(daysAhead: number, hour: number): string {
  const target = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1);
  }
  return formatLocalDateTimeInput(target);
}

export default function ReservationRequestScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStack, 'ReservationRequest'>>();
  const listingId = params?.listingId ?? '';

  const selectedDetail = useDiscovery((s) => s.selectedDetail);
  const detailLoading = useDiscovery((s) => s.detailLoading);
  const loadDetail = useDiscovery((s) => s.loadDetail);
  const createRequest = useOrders((s) => s.createRequest);
  const mutating = useOrders((s) => s.submitting);

  const detail = selectedDetail?.id === listingId ? selectedDetail : null;
  const preview = detail ?? params?.listing ?? null;

  const [meetingTimeText, setMeetingTimeText] = useState(() => buildPresetTime(1, 18));
  const [meetingLocation, setMeetingLocation] = useState(
    () => preview?.locationName ?? 'Cổng KTX Khu A',
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [timeError, setTimeError] = useState('');

  useEffect(() => {
    if (listingId && (!selectedDetail || selectedDetail.id !== listingId)) {
      void loadDetail(listingId);
    }
  }, [listingId, selectedDetail, loadDetail]);

  const appliedPriceVnd = useMemo(() => {
    if (preview?.isFree || preview?.priceVnd === 0) return 0;
    if (typeof params?.agreedPriceVnd === 'number' && params.agreedPriceVnd >= 0) {
      return params.agreedPriceVnd;
    }
    return preview?.priceVnd ?? 0;
  }, [params?.agreedPriceVnd, preview]);

  const isCombo = Boolean(preview?.isCombo || (detail && detail.items.length >= 2));
  const isFree = Boolean(preview?.isFree || appliedPriceVnd === 0);

  const handleSubmit = async () => {
    if (!listingId || mutating) return;
    setError('');
    setTimeError('');

    let isoTime: string | null = null;
    if (meetingTimeText.trim()) {
      isoTime = parseUserDateTimeToIso(meetingTimeText);
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
        agreedPriceVnd: appliedPriceVnd,
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
      }
    }
  };

  if (detailLoading && !preview) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={semantic.color.accent} />
        <Text style={styles.loadingText}>Đang kiểm tra khả dụng tin đăng…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <RestrictedAccountNotice />

          <InlineBanner
            testID="reservation-not-locked-warning"
            tone="warning"
            title="Gửi yêu cầu chưa phải là đã giữ đồ"
            message="Tin đăng và đồ vật chỉ được chính thức giữ chỗ sau khi người bán bấm Chấp nhận yêu cầu của bạn."
          />

          {error ? (
            <InlineBanner testID="reservation-error-banner" tone="danger" message={error} />
          ) : null}

          {preview ? (
            <View style={styles.card} testID="reservation-listing-summary">
              <View style={styles.cardHeader}>
                <Text style={styles.listingTitle} numberOfLines={2}>
                  {preview.title}
                </Text>
                {isCombo ? (
                  <StatusIndicator variant="soft" tone="accent" label="Combo nguyên bộ" />
                ) : null}
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Mức giá áp dụng</Text>
                <Text
                  testID="reservation-applied-price"
                  style={[styles.priceValue, isFree && styles.priceFree]}
                >
                  {isFree ? '0đ · Cho tặng' : formatVnd(appliedPriceVnd)}
                </Text>
              </View>

              {isCombo ? (
                <View style={styles.comboBox} testID="reservation-combo-note">
                  <View style={styles.comboHeaderRow}>
                    <Icon name="layers" size={14} color={semantic.color.accent} />
                    <Text style={styles.comboNoteText}>
                      Áp dụng cho toàn bộ gói đồ, không mua tách lẻ.
                    </Text>
                  </View>
                  {detail?.items.map((item) => (
                    <Text key={item.id} style={styles.comboItemLine}>
                      • {item.name} ({item.condition})
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <HairlineDivider />

          <View style={styles.formSection}>
            <SectionHeading
              title="Lịch hẹn dự kiến (tùy chọn)"
              subtitle="Gợi ý khung giờ & địa điểm gặp để người bán dễ dàng xem xét. Hai bên vẫn sẽ thống nhất lại sau khi chấp nhận."
            />

            <View style={styles.chipsRow}>
              {[
                { label: 'Ngày mai 10:00', value: buildPresetTime(1, 10) },
                { label: 'Ngày mai 18:00', value: buildPresetTime(1, 18) },
                { label: '2 ngày nữa 17:00', value: buildPresetTime(2, 17) },
              ].map((preset) => (
                <Pressable
                  key={preset.label}
                  onPress={() => {
                    setMeetingTimeText(preset.value);
                    setTimeError('');
                  }}
                  style={styles.chip}
                >
                  <Icon name="clock" size={12} color={semantic.color.textSecondary} />
                  <Text style={styles.chipText}>{preset.label}</Text>
                </Pressable>
              ))}
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
              leadingIcon="clock"
              editable={!mutating}
            />

            <View style={styles.chipsRow}>
              {QUICK_LOCATIONS.map((loc) => (
                <Pressable
                  key={loc}
                  onPress={() => setMeetingLocation(loc)}
                  style={[styles.chip, meetingLocation === loc && styles.chipActive]}
                >
                  <Icon
                    name="map-pin"
                    size={12}
                    color={meetingLocation === loc ? semantic.color.accent : semantic.color.textSecondary}
                  />
                  <Text
                    style={[styles.chipText, meetingLocation === loc && styles.chipTextActive]}
                  >
                    {loc}
                  </Text>
                </Pressable>
              ))}
            </View>

            <FormField
              testID="reservation-location-input"
              label="Địa điểm hẹn dự kiến"
              placeholder="Ví dụ: Sảnh tòa A1 KTX Khu A"
              maxLength={255}
              value={meetingLocation}
              onChangeText={setMeetingLocation}
              leadingIcon="map-pin"
              editable={!mutating}
            />

            <FormField
              testID="reservation-note-input"
              label="Ghi chú cho người bán"
              placeholder="Nhắn thêm thông tin liên hệ hoặc khung giờ rảnh của bạn…"
              multiline
              maxLength={1000}
              value={note}
              onChangeText={setNote}
              editable={!mutating}
            />
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
              disabled={mutating}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.primaryBtn,
                mutating && styles.disabledBtn,
                pressed && !mutating && styles.pressed,
              ]}
            >
              {mutating ? (
                <ActivityIndicator size="small" color={semantic.color.textInverse} />
              ) : (
                <Icon name="send" size={16} color={semantic.color.textInverse} />
              )}
              <Text style={styles.primaryBtnText}>
                {mutating ? 'Đang gửi…' : 'Gửi yêu cầu giữ chỗ'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.color.bgPage },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.color.bgPage,
    gap: primitive.space[3],
  },
  loadingText: { ...semantic.type.body, color: semantic.color.textSecondary },
  content: {
    padding: primitive.space[4],
    gap: primitive.space[4],
    paddingBottom: primitive.space[8],
  },
  card: {
    backgroundColor: semantic.color.bgSurface,
    borderRadius: primitive.radius.lg,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    padding: primitive.space[4],
    gap: primitive.space[3],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  listingTitle: {
    flex: 1,
    ...semantic.type.sectionTitle,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: { ...semantic.type.caption, color: semantic.color.textSecondary },
  priceValue: { ...semantic.type.sectionTitle, color: semantic.color.accent },
  priceFree: { color: semantic.color.freeFg },
  comboBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    padding: primitive.space[3],
    gap: primitive.space[1.5],
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
  comboItemLine: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
  },
  formSection: { gap: primitive.space[3] },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  chipActive: {
    borderColor: semantic.color.accent,
    backgroundColor: semantic.color.accentSoft,
  },
  chipText: { ...semantic.type.micro, color: semantic.color.textSecondary },
  chipTextActive: { color: semantic.color.accent, fontWeight: primitive.fontWeight.semibold },
  actionsRow: {
    flexDirection: 'row',
    gap: primitive.space[3],
    marginTop: primitive.space[2],
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: primitive.radius.md,
    borderWidth: 1,
    borderColor: semantic.color.borderStrong,
    backgroundColor: semantic.color.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { ...semantic.type.label, color: semantic.color.textPrimary },
  primaryBtn: {
    flex: 2,
    minHeight: 48,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    paddingHorizontal: primitive.space[4],
  },
  primaryBtnText: { ...semantic.type.label, color: semantic.color.textInverse },
  disabledBtn: { opacity: primitive.opacity.disabled },
  pressed: { opacity: primitive.opacity.pressed },
});
