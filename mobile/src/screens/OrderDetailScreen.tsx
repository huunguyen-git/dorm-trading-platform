import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { Nav, RootStack } from '../navigation';
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import { formatVnd } from '../listings/types';
import { useOrders } from '../orders/store';
import {
  formatLocalInputFromDate,
  formatOrderDateTime,
  ORDER_STATUS_META,
  parseMeetingTimeInput,
  PROPOSAL_STATUS_META,
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
import { primitive, semantic } from '../theme';

function defaultNextScheduleTime(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setHours(18, 0, 0, 0);
  return formatLocalInputFromDate(d);
}

export default function OrderDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStack, 'OrderDetail'>>();
  const orderId = params.id;

  const {
    selectedOrder,
    detailLoading,
    detailError,
    submitting,
    loadOrderDetail,
    accept,
    reject,
    cancel,
    proposeSchedule,
    confirmSchedule,
    rejectSchedule,
    startDelivery,
  } = useOrders();

  const [actionNotice, setActionNotice] = useState(
    params.justCreated
      ? 'Đã gửi yêu cầu giữ chỗ thành công. Vui lòng chờ người bán phản hồi để chính thức giữ đồ.'
      : '',
  );
  const [actionError, setActionError] = useState('');

  // Schedule proposal form state (UC-25)
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleTimeText, setScheduleTimeText] = useState(defaultNextScheduleTime);
  const [scheduleLocation, setScheduleLocation] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');

  // Cancel / reject reason state
  const [reasonText, setReasonText] = useState('');

  const refresh = useCallback(() => {
    void loadOrderDetail(orderId);
  }, [loadOrderDetail, orderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const order = selectedOrder?.id === orderId ? selectedOrder : null;

  const runAction = async (fn: () => Promise<void>, successMessage: string) => {
    if (submitting) return;
    setActionError('');
    setActionNotice('');
    try {
      await fn();
      setActionNotice(successMessage);
    } catch (err) {
      if (!isRestrictedError(err)) {
        const parsed = extractApiError(err, 'Thao tác không thành công. Vui lòng thử lại.');
        setActionError(parsed.message);
      }
    }
  };

  const handleAcceptPress = () => {
    if (!order || !order.viewer.canAccept || submitting) return;
    const itemSummary =
      order.items.length >= 2
        ? `Toàn bộ ${order.items.length} đồ vật trong combo sẽ được khóa giữ chỗ nguyên bộ.`
        : 'Đồ vật trong tin sẽ chuyển sang trạng thái Đang giữ chỗ.';
    Alert.alert('Chấp nhận giữ chỗ', `${itemSummary} Bạn xác nhận chấp nhận yêu cầu này?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Chấp nhận giữ chỗ',
        onPress: () =>
          void runAction(async () => {
            await accept(order.id, order.version);
          }, 'Đã chấp nhận giữ chỗ thành công. Hai bên có thể thống nhất lịch giao nhận.'),
      },
    ]);
  };

  const handleRejectPress = () => {
    if (!order || !order.viewer.canReject || submitting) return;
    Alert.alert('Từ chối yêu cầu', 'Từ chối yêu cầu này sẽ không khóa tin hay đồ vật.', [
      { text: 'Quay lại', style: 'cancel' },
      {
        text: 'Từ chối',
        style: 'destructive',
        onPress: () =>
          void runAction(async () => {
            await reject(order.id, reasonText.trim() || undefined, order.version);
            setReasonText('');
          }, 'Đã từ chối yêu cầu giữ chỗ.'),
      },
    ]);
  };

  const handleCancelPress = () => {
    if (!order || !order.viewer.canCancel || submitting) return;
    const isWithdrawPending = order.status === 'YEU_CAU';
    Alert.alert(
      isWithdrawPending ? 'Rút yêu cầu giữ chỗ' : 'Xác nhận hủy giữ chỗ',
      isWithdrawPending
        ? 'Bạn muốn rút yêu cầu giữ chỗ đang chờ phản hồi này?'
        : 'Hủy giữ chỗ sẽ chấm dứt giữ chỗ cho toàn bộ đồ vật (không tách combo) và cập nhật lại khả dụng trong kho.',
      [
        { text: 'Giữ lại', style: 'cancel' },
        {
          text: isWithdrawPending ? 'Rút yêu cầu' : 'Hủy giữ chỗ',
          style: 'destructive',
          onPress: () =>
            void runAction(async () => {
              await cancel(order.id, reasonText.trim() || undefined, order.version);
              setReasonText('');
            }, isWithdrawPending ? 'Đã rút yêu cầu giữ chỗ.' : 'Đã hủy giữ chỗ và cập nhật khả dụng đồ vật.'),
        },
      ],
    );
  };

  const handleSubmitSchedule = async () => {
    if (!order || !order.viewer.canProposeSchedule || submitting) return;
    setActionError('');
    const iso = parseMeetingTimeInput(scheduleTimeText);
    if (!iso) {
      setActionError('Định dạng thời gian không hợp lệ. Dùng YYYY-MM-DD HH:mm.');
      return;
    }
    if (new Date(iso).getTime() < Date.now()) {
      setActionError('Thời gian hẹn giao nhận phải ở tương lai.');
      return;
    }
    if (!scheduleLocation.trim()) {
      setActionError('Vui lòng nhập địa điểm giao nhận.');
      return;
    }
    await runAction(async () => {
      await proposeSchedule(order.id, {
        proposedTime: iso,
        proposedLocation: scheduleLocation.trim(),
        note: scheduleNote.trim() || null,
        expectedVersion: order.version,
      });
      setShowScheduleForm(false);
      setScheduleNote('');
    }, 'Đã gửi đề xuất lịch hẹn. Vui lòng chờ bên còn lại xác nhận.');
  };

  const handleConfirmProposal = (proposalId: string) => {
    if (!order || submitting) return;
    void runAction(async () => {
      await confirmSchedule(order.id, proposalId);
    }, 'Hai bên đã thống nhất thời gian và địa điểm giao nhận.');
  };

  const handleRejectProposal = (proposalId: string) => {
    if (!order || submitting) return;
    void runAction(async () => {
      await rejectSchedule(order.id, proposalId, 'Chưa phù hợp, đề xuất lịch khác.');
    }, 'Đã phản hồi chưa đồng ý lịch hẹn. Hai bên có thể gửi đề xuất mới.');
  };

  const handleStartDeliveryPress = () => {
    if (!order || !order.viewer.canStartDelivery || submitting) return;
    Alert.alert(
      'Thông báo bắt đầu giao hàng',
      'Xác nhận bạn đang bắt đầu giao hàng theo lịch hẹn đã thống nhất. Lưu ý: đây chưa phải mốc báo đã giao — ảnh bàn giao và mã hoàn tất 6 số thực hiện tại bước bàn giao thực tế (UC-27).',
      [
        { text: 'Chưa bắt đầu', style: 'cancel' },
        {
          text: 'Bắt đầu giao hàng',
          onPress: () =>
            void runAction(async () => {
              await startDelivery(order.id, order.version);
            }, 'Đã ghi nhận bắt đầu giao hàng và thông báo tới người mua.'),
        },
      ],
    );
  };

  if (detailLoading && !order) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={semantic.color.accent} />
        <Text style={styles.caption}>Đang tải chi tiết giao dịch…</Text>
      </SafeAreaView>
    );
  }

  if (detailError && !order) {
    return (
      <SafeAreaView style={styles.center}>
        <EmptyState
          testID="order-detail-error"
          icon="alert-circle"
          title="Không thể mở giao dịch"
          subtitle={detailError}
          primaryActionLabel="Thử lại"
          onPrimaryAction={refresh}
        />
      </SafeAreaView>
    );
  }

  if (!order) return null;

  const meta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.YEU_CAU;
  const counterparty = order.viewer.isSeller ? order.buyer : order.seller;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <RestrictedAccountNotice />

          {actionNotice ? (
            <InlineBanner testID="order-action-notice" tone="success" message={actionNotice} />
          ) : null}
          {actionError ? (
            <InlineBanner testID="order-action-error" tone="danger" message={actionError} />
          ) : null}

          {/* Status & Summary Header */}
          <View style={styles.card} testID="order-status-card">
            <View style={styles.rowBetween}>
              <StatusIndicator
                testID="order-status-badge"
                variant="urgent"
                tone={meta.tone}
                label={meta.label}
              />
              <Text style={styles.roleBadge}>
                {order.viewer.isSeller ? 'Bạn là Người bán' : 'Bạn là Người mua'}
              </Text>
            </View>
            <Text style={styles.caption}>{meta.shortDesc}</Text>

            <HairlineDivider spacing={primitive.space[1]} />

            <Pressable
              onPress={() => navigation.navigate('Listing', { id: order.listing.id })}
              style={styles.listingRow}
            >
              <View style={styles.flex}>
                <Text style={styles.title}>{order.listing.title}</Text>
                <Text style={styles.price}>
                  Giá thỏa thuận: {formatVnd(order.agreedPriceVnd)}
                  {order.agreedPriceVnd === 0 ? ' (Cho tặng)' : ''}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={semantic.color.textSecondary} />
            </Pressable>

            <Text style={styles.metaText}>
              {order.viewer.isSeller ? 'Người mua' : 'Người bán'}:{' '}
              <Text style={styles.bold}>{counterparty.displayName}</Text> · Điểm uy tín:{' '}
              {counterparty.reputationScore}
            </Text>

            {order.note ? <Text style={styles.metaText}>Ghi chú: {order.note}</Text> : null}

            {order.reservedAt ? (
              <Text style={styles.metaText}>
                Giữ chỗ lúc: {formatOrderDateTime(order.reservedAt)}
              </Text>
            ) : null}
            {order.deliveryStartedAt ? (
              <InlineBanner
                testID="delivery-started-banner"
                tone="success"
                icon="navigation"
                title="Đã bắt đầu giao hàng (UC-26)"
                message={`Bắt đầu lúc ${formatOrderDateTime(order.deliveryStartedAt)}. Ảnh bàn giao và mã hoàn tất 6 số thực hiện sau khi gặp mặt (UC-27).`}
              />
            ) : null}
            {order.status === 'HUY' && order.cancelReason ? (
              <InlineBanner
                testID="order-cancelled-banner"
                tone="neutral"
                title="Lý do hủy"
                message={order.cancelReason}
              />
            ) : null}
          </View>

          {/* Items in this order (Single / Combo) */}
          <View style={styles.card} testID="order-items-card">
            <SectionHeading
              title={`Đồ vật trong giao dịch (${order.items.length})`}
              subtitle={
                order.items.length >= 2
                  ? 'Combo được giữ và hủy nguyên bộ, không tách lẻ.'
                  : undefined
              }
            />
            {order.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.flex}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.caption}>{item.condition}</Text>
                </View>
                <StatusIndicator
                  variant="dot"
                  tone={
                    item.status === 'DANG_GIU'
                      ? 'warning'
                      : item.status === 'DA_CHUYEN_GIAO'
                        ? 'neutral'
                        : 'success'
                  }
                  label={
                    item.status === 'DANG_GIU'
                      ? 'Đang giữ'
                      : item.status === 'DA_CHUYEN_GIAO'
                        ? 'Đã chuyển giao'
                        : 'Khả dụng'
                  }
                />
              </View>
            ))}
          </View>

          {/* UC-23 Seller Pending Actions */}
          {order.viewer.canAccept || order.viewer.canReject ? (
            <View style={styles.card} testID="seller-decision-section">
              <SectionHeading
                title="Phản hồi yêu cầu giữ chỗ"
                subtitle="Chấp nhận sẽ khóa tin đăng và toàn bộ đồ vật thành phần."
              />
              {order.proposedMeetingTime || order.proposedMeetingLocation ? (
                <Text style={styles.metaText}>
                  Lịch dự kiến người mua gợi ý: {formatOrderDateTime(order.proposedMeetingTime)} ·{' '}
                  {order.proposedMeetingLocation || 'Chưa ghi địa điểm'}
                </Text>
              ) : null}
              <FormField
                testID="seller-reject-reason-input"
                label="Lý do (chỉ cần nếu từ chối)"
                placeholder="Nhập lý do từ chối nếu cần..."
                value={reasonText}
                onChangeText={setReasonText}
                editable={!submitting}
              />
              <View style={styles.rowActions}>
                <Pressable
                  testID="accept-reservation-button"
                  disabled={submitting}
                  onPress={handleAcceptPress}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    styles.flex,
                    submitting && styles.disabledBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon name="check" size={16} color={semantic.color.textInverse} />
                  <Text style={styles.primaryBtnText}>Chấp nhận giữ chỗ</Text>
                </Pressable>
                <Pressable
                  testID="reject-reservation-button"
                  disabled={submitting}
                  onPress={handleRejectPress}
                  style={({ pressed }) => [styles.dangerOutlineBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.dangerOutlineBtnText}>Từ chối</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* UC-25 Two-party Schedule Section */}
          {order.status === 'GIU_CHO' || order.status === 'DANG_GIAO' ? (
            <View style={styles.card} testID="schedule-section">
              <SectionHeading
                title="Lịch hẹn giao nhận (UC-25)"
                subtitle="Cần cả hai bên thống nhất trước khi bắt đầu giao hàng."
              />

              {order.scheduleConfirmed && order.meetingTime && order.meetingLocation ? (
                <InlineBanner
                  testID="confirmed-schedule-banner"
                  tone="success"
                  icon="check-circle"
                  title="Lịch hẹn đã thống nhất"
                  message={`${formatOrderDateTime(order.meetingTime)} tại ${order.meetingLocation}. (Việc hẹn chưa chứng minh đã bàn giao hay thanh toán.)`}
                />
              ) : (
                <InlineBanner
                  testID="unconfirmed-schedule-banner"
                  tone="neutral"
                  icon="clock"
                  message="Chưa có lịch hẹn chung được hai bên xác nhận. Đề xuất một phía chưa được tính là lịch đã thống nhất."
                />
              )}

              {/* Pending proposal awaiting confirmation */}
              {order.pendingScheduleProposal ? (
                <View style={styles.proposalBox} testID="pending-schedule-proposal">
                  <View style={styles.rowBetween}>
                    <Text style={styles.bold}>
                      Đề xuất bởi {order.pendingScheduleProposal.proposedByName}
                    </Text>
                    <StatusIndicator
                      variant="soft"
                      tone={PROPOSAL_STATUS_META[order.pendingScheduleProposal.status].tone}
                      label={PROPOSAL_STATUS_META[order.pendingScheduleProposal.status].label}
                    />
                  </View>
                  <Text style={styles.metaText}>
                    Thời gian: {formatOrderDateTime(order.pendingScheduleProposal.proposedTime)}
                  </Text>
                  <Text style={styles.metaText}>
                    Địa điểm: {order.pendingScheduleProposal.proposedLocation}
                  </Text>
                  {order.pendingScheduleProposal.note ? (
                    <Text style={styles.caption}>
                      Ghi chú: {order.pendingScheduleProposal.note}
                    </Text>
                  ) : null}

                  {order.pendingScheduleProposal.canConfirm ? (
                    <View style={styles.rowActions}>
                      <Pressable
                        testID="confirm-schedule-button"
                        disabled={submitting}
                        onPress={() => handleConfirmProposal(order.pendingScheduleProposal!.id)}
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          styles.flex,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Icon name="check" size={15} color={semantic.color.textInverse} />
                        <Text style={styles.primaryBtnText}>Xác nhận lịch hẹn</Text>
                      </Pressable>
                      <Pressable
                        testID="reject-schedule-button"
                        disabled={submitting}
                        onPress={() => handleRejectProposal(order.pendingScheduleProposal!.id)}
                        style={({ pressed }) => [
                          styles.secondaryBtn,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.secondaryBtnText}>Chưa đồng ý</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.waitingText} testID="waiting-counterparty-schedule">
                      Đang chờ bên còn lại xác nhận đề xuất lịch hẹn này.
                    </Text>
                  )}
                </View>
              ) : null}

              {order.viewer.canProposeSchedule ? (
                showScheduleForm ? (
                  <View style={styles.scheduleForm} testID="schedule-proposal-form">
                    <FormField
                      testID="schedule-time-input"
                      label="Thời gian đề xuất"
                      required
                      placeholder="YYYY-MM-DD HH:mm"
                      value={scheduleTimeText}
                      onChangeText={setScheduleTimeText}
                      leadingIcon="clock"
                    />
                    <FormField
                      testID="schedule-location-input"
                      label="Địa điểm gặp mặt"
                      required
                      placeholder="Nhập địa điểm trong ĐHQG-HCM / KTX..."
                      value={scheduleLocation}
                      onChangeText={setScheduleLocation}
                      leadingIcon="map-pin"
                    />
                    <View style={styles.chipRow}>
                      {QUICK_MEETING_LOCATIONS.map((loc, i) => (
                        <Pressable
                          key={loc}
                          testID={`schedule-loc-chip-${i}`}
                          onPress={() => setScheduleLocation(loc)}
                          style={styles.chip}
                        >
                          <Text style={styles.chipText}>{loc}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <FormField
                      testID="schedule-note-input"
                      label="Ghi chú (tùy chọn)"
                      placeholder="Ví dụ: Gặp trước cổng bảo vệ"
                      value={scheduleNote}
                      onChangeText={setScheduleNote}
                    />
                    <View style={styles.rowActions}>
                      <Pressable
                        testID="submit-schedule-proposal-button"
                        disabled={submitting}
                        onPress={() => void handleSubmitSchedule()}
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          styles.flex,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.primaryBtnText}>Gửi đề xuất lịch</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setShowScheduleForm(false)}
                        style={styles.secondaryBtn}
                      >
                        <Text style={styles.secondaryBtnText}>Đóng</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    testID="open-schedule-form-button"
                    onPress={() => {
                      setScheduleLocation(
                        order.meetingLocation ??
                          order.pendingScheduleProposal?.proposedLocation ??
                          order.listing.locationName ??
                          '',
                      );
                      setShowScheduleForm(true);
                    }}
                    style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryBtnText}>
                      {order.scheduleConfirmed ? 'Đề xuất đổi lịch hẹn' : 'Đề xuất thời gian & địa điểm'}
                    </Text>
                  </Pressable>
                )
              ) : null}
            </View>
          ) : null}

          {/* UC-26 Seller Start Delivery */}
          {order.viewer.isSeller && order.status === 'GIU_CHO' ? (
            <View style={styles.card} testID="start-delivery-section">
              <SectionHeading
                title="Bắt đầu giao hàng (UC-26)"
                subtitle="Thông báo cho người mua khi bạn bắt đầu đi giao theo lịch hẹn."
              />
              {!order.viewer.canStartDelivery ? (
                <Text style={styles.caption} testID="start-delivery-hint">
                  Cần hai bên thống nhất thời gian và địa điểm hẹn ở trên trước khi bấm bắt đầu giao hàng.
                </Text>
              ) : null}
              <Pressable
                testID="start-delivery-button"
                disabled={!order.viewer.canStartDelivery || submitting}
                accessibilityRole="button"
                accessibilityState={{ disabled: !order.viewer.canStartDelivery || submitting }}
                onPress={handleStartDeliveryPress}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (!order.viewer.canStartDelivery || submitting) && styles.disabledBtn,
                  pressed && order.viewer.canStartDelivery && styles.pressed,
                ]}
              >
                <Icon name="navigation" size={16} color={semantic.color.textInverse} />
                <Text style={styles.primaryBtnText}>Thông báo bắt đầu giao hàng</Text>
              </Pressable>
            </View>
          ) : null}

          {/* UC-24 Pre-delivery Cancellation / UC-28 Boundary Notice */}
          {order.viewer.requiresPostDeliveryCancel ? (
            <InlineBanner
              testID="post-delivery-cancel-notice"
              tone="warning"
              title="Đã ghi nhận báo đã giao (UC-27)"
              message="Không thể tự hủy giữ chỗ sau khi người bán đã báo đã giao kèm bằng chứng. Vui lòng sử dụng luồng Yêu cầu hủy sau báo giao (UC-28)."
            />
          ) : order.viewer.canCancel ? (
            <View style={styles.card} testID="cancel-reservation-section">
              <SectionHeading
                title={order.status === 'YEU_CAU' ? 'Rút yêu cầu giữ chỗ' : 'Hủy giữ chỗ (UC-24)'}
                subtitle={
                  order.status === 'DANG_GIAO'
                    ? 'Người bán mới bắt đầu giao hàng và chưa báo đã giao (UC-27), hai bên vẫn có thể hủy giữ chỗ hợp lệ.'
                    : undefined
                }
              />
              <FormField
                testID="cancel-reason-input"
                label="Lý do hủy (tùy chọn)"
                placeholder="Nhập lý do để thông báo cho đối tác..."
                value={reasonText}
                onChangeText={setReasonText}
                editable={!submitting}
              />
              <Pressable
                testID="cancel-reservation-button"
                disabled={submitting}
                onPress={handleCancelPress}
                style={({ pressed }) => [styles.dangerOutlineBtn, pressed && styles.pressed]}
              >
                <Text style={styles.dangerOutlineBtnText}>
                  {order.status === 'YEU_CAU' ? 'Rút yêu cầu giữ chỗ' : 'Hủy giữ chỗ'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: semantic.color.bgPage },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: primitive.space[6],
    gap: primitive.space[2],
    backgroundColor: semantic.color.bgPage,
  },
  scrollContent: {
    padding: primitive.space[4],
    gap: primitive.space[3],
    paddingBottom: primitive.space[10],
  },
  card: {
    backgroundColor: semantic.color.bgSurface,
    borderRadius: primitive.radius.lg,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    padding: primitive.space[4],
    gap: primitive.space[2.5],
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  roleBadge: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontWeight: '600',
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  title: {
    ...semantic.type.sectionTitle,
    color: semantic.color.textPrimary,
  },
  price: {
    ...semantic.type.label,
    color: semantic.color.accent,
    fontWeight: '700',
    marginTop: 2,
  },
  metaText: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
  },
  bold: {
    fontWeight: '700',
    color: semantic.color.textPrimary,
  },
  caption: {
    ...semantic.type.caption,
    color: semantic.color.textSecondary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
    paddingVertical: primitive.space[1.5],
    borderTopWidth: 1,
    borderTopColor: semantic.color.borderHairline,
  },
  itemName: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  proposalBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    padding: primitive.space[3],
    gap: primitive.space[2],
  },
  waitingText: {
    ...semantic.type.caption,
    color: semantic.color.warning,
    fontWeight: '600',
  },
  scheduleForm: {
    gap: primitive.space[2.5],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[1.5],
  },
  chip: {
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    borderRadius: primitive.radius.full,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1],
  },
  chipText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    backgroundColor: semantic.color.accent,
    minHeight: 44,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[4],
  },
  primaryBtnText: {
    ...semantic.type.label,
    color: semantic.color.textInverse,
    fontWeight: '700',
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: primitive.radius.md,
    borderWidth: 1,
    borderColor: semantic.color.borderStrong,
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: primitive.space[4],
  },
  secondaryBtnText: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  dangerOutlineBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: primitive.radius.md,
    borderWidth: 1,
    borderColor: semantic.color.danger,
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: primitive.space[4],
  },
  dangerOutlineBtnText: {
    ...semantic.type.label,
    color: semantic.color.danger,
    fontWeight: '600',
  },
  disabledBtn: { opacity: primitive.opacity.disabled },
  pressed: { opacity: primitive.opacity.pressed },
});
