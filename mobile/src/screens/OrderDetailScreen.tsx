import { Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import { formatReputationSummary, formatVnd } from '../listings/types';
import { useOrders } from '../orders/store';
import {
  buildPresetMeetingTime,
  formatOrderDateTime,
  getOrderStepperState,
  ORDER_CANCEL_REASONS,
  ORDER_REJECT_REASONS,
  ORDER_STATUS_META,
  parseMeetingTimeInput,
  PROPOSAL_STATUS_META,
  QUICK_MEETING_LOCATIONS,
  SCHEDULE_REJECT_REASONS,
} from '../orders/types';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  BottomSheet,
  CollapsibleAlert,
  EmptyState,
  FormField,
  HairlineDivider,
  Icon,
  InlineBanner,
  OrderProgressStepper,
  SectionHeading,
  StatusIndicator,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

export default function OrderDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStack, 'OrderDetail'>>();
  const insets = useContext(SafeAreaInsetsContext);
  const stickyBottomPad = Math.max(insets?.bottom ?? 0, primitive.space[3]);
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

  // Lucian #305 BottomSheet modal states
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [scheduleTimeText, setScheduleTimeText] = useState(() => buildPresetMeetingTime(1, 18));
  const [scheduleLocation, setScheduleLocation] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [scheduleTimeError, setScheduleTimeError] = useState('');
  const [scheduleLocationError, setScheduleLocationError] = useState('');

  const [rejectSheetOpen, setRejectSheetOpen] = useState(false);
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [reasonText, setReasonText] = useState('');

  const [rejectProposalId, setRejectProposalId] = useState<string | null>(null);
  const [scheduleRejectReason, setScheduleRejectReason] = useState('');

  const timePresets = useMemo(
    () => [
      { label: 'Ngày mai 10:00', value: buildPresetMeetingTime(1, 10) },
      { label: 'Ngày mai 18:00', value: buildPresetMeetingTime(1, 18) },
      { label: '2 ngày nữa 17:00', value: buildPresetMeetingTime(2, 17) },
    ],
    [],
  );

  const refresh = useCallback(() => {
    void loadOrderDetail(orderId);
  }, [loadOrderDetail, orderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') return;
    return navigation.addListener('focus', refresh);
  }, [navigation, refresh]);

  const order = selectedOrder?.id === orderId ? selectedOrder : null;

  const runAction = async (fn: () => Promise<void>, successMessage: string): Promise<boolean> => {
    if (submitting) return false;
    setActionError('');
    setActionNotice('');
    try {
      await fn();
      setActionNotice(successMessage);
      return true;
    } catch (err) {
      if (!isRestrictedError(err)) {
        const parsed = extractApiError(err, 'Thao tác không thành công. Vui lòng thử lại.');
        setActionError(parsed.message);
      }
      return false;
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

  const handleConfirmRejectReservation = async () => {
    if (!order || !order.viewer.canReject || submitting) return;
    const ok = await runAction(async () => {
      await reject(order.id, reasonText.trim() || undefined, order.version);
    }, 'Đã từ chối yêu cầu giữ chỗ.');
    if (ok) {
      setRejectSheetOpen(false);
      setReasonText('');
    }
  };

  const handleConfirmCancelReservation = async () => {
    if (!order || !order.viewer.canCancel || submitting) return;
    const isWithdrawPending = order.status === 'YEU_CAU';
    const ok = await runAction(
      async () => {
        await cancel(order.id, reasonText.trim() || undefined, order.version);
      },
      isWithdrawPending
        ? 'Đã rút yêu cầu giữ chỗ.'
        : 'Đã hủy giữ chỗ và cập nhật khả dụng đồ vật.',
    );
    if (ok) {
      setCancelSheetOpen(false);
      setReasonText('');
    }
  };

  const openScheduleSheet = () => {
    if (!order) return;
    setActionError('');
    setScheduleTimeError('');
    setScheduleLocationError('');
    setScheduleLocation(
      order.meetingLocation ??
        order.pendingScheduleProposal?.proposedLocation ??
        order.listing.locationName ??
        QUICK_MEETING_LOCATIONS[0],
    );
    setScheduleSheetOpen(true);
  };

  const handleSubmitSchedule = async () => {
    if (!order || !order.viewer.canProposeSchedule || submitting) return;
    setScheduleTimeError('');
    setScheduleLocationError('');

    const iso = parseMeetingTimeInput(scheduleTimeText);
    if (!iso) {
      setScheduleTimeError('Định dạng thời gian không hợp lệ. Dùng YYYY-MM-DD HH:mm.');
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      setScheduleTimeError('Thời gian hẹn giao nhận phải ở tương lai.');
      return;
    }
    if (!scheduleLocation.trim()) {
      setScheduleLocationError('Vui lòng nhập địa điểm giao nhận.');
      return;
    }

    const ok = await runAction(async () => {
      await proposeSchedule(order.id, {
        proposedTime: iso,
        proposedLocation: scheduleLocation.trim(),
        note: scheduleNote.trim() || null,
        expectedVersion: order.version,
      });
    }, 'Đã gửi đề xuất lịch hẹn. Vui lòng chờ bên còn lại xác nhận.');

    if (ok) {
      setScheduleSheetOpen(false);
      setScheduleNote('');
    }
  };

  const handleConfirmProposal = (proposalId: string) => {
    if (!order || submitting) return;
    void runAction(async () => {
      await confirmSchedule(order.id, proposalId);
    }, 'Hai bên đã thống nhất thời gian và địa điểm giao nhận.');
  };

  const handleConfirmRejectProposal = async (openCounterProposal = false) => {
    if (!order || !rejectProposalId || submitting) return;
    const reason = scheduleRejectReason.trim() || 'Chưa phù hợp, đề xuất lịch khác.';
    const ok = await runAction(async () => {
      await rejectSchedule(order.id, rejectProposalId, reason);
    }, 'Đã phản hồi chưa đồng ý lịch hẹn. Hai bên có thể gửi đề xuất mới.');
    if (ok) {
      setRejectProposalId(null);
      setScheduleRejectReason('');
      if (openCounterProposal) {
        openScheduleSheet();
      }
    }
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color={semantic.color.accent} />
        <Text style={styles.caption}>Đang tải chi tiết giao dịch…</Text>
      </View>
    );
  }

  if (detailError && !order) {
    return (
      <View style={styles.center}>
        <EmptyState
          testID="order-detail-error"
          icon="alert-circle"
          title="Không thể mở giao dịch"
          subtitle={detailError}
          primaryActionLabel="Thử lại"
          onPrimaryAction={refresh}
        />
      </View>
    );
  }

  if (!order) return null;

  const meta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.YEU_CAU;
  const stepper = getOrderStepperState(order);
  const counterparty = order.viewer.isSeller ? order.buyer : order.seller;
  const counterpartyInitial = (counterparty.displayName.trim()[0] ?? 'T').toUpperCase();
  const counterpartyRep = formatReputationSummary(counterparty.reputationScore);
  const isHighTrustCounterparty = counterparty.reputationScore >= 120;
  const isFree = order.listing.isFree || order.agreedPriceVnd === 0;
  const listingThumbUri = order.listing.thumbnailUrl
    ? resolveMediaUrl(order.listing.thumbnailUrl)
    : null;
  const pastProposals = order.scheduleProposals.filter(
    (p) => p.id !== order.pendingScheduleProposal?.id,
  );
  const isWithdrawPending = order.status === 'YEU_CAU';
  const hasPendingUnavailability =
    order.status === 'YEU_CAU' &&
    (order.listing.status !== 'CONG_KHAI' ||
      order.items.some((item) => item.status !== 'KHA_DUNG'));
  const deliveryStateLabel = order.reportedDeliveredAt
    ? `Đã báo đã giao lúc ${formatOrderDateTime(order.reportedDeliveredAt)}`
    : order.deliveryStartedAt
      ? `Đã bắt đầu giao hàng lúc ${formatOrderDateTime(order.deliveryStartedAt)} (chưa báo đã giao)`
      : 'Chưa bắt đầu giao hàng';

  const hasStickyDock =
    order.viewer.canAccept ||
    order.viewer.canReject ||
    (order.viewer.isSeller && order.status === 'GIU_CHO') ||
    (!order.viewer.requiresPostDeliveryCancel && order.viewer.canCancel);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Non-blocking notices & Lucian #072 feedback */}
          {actionNotice || actionError ? (
            <View style={styles.topNoticesWrap}>
              <RestrictedAccountNotice />
              {actionNotice ? (
                <CollapsibleAlert
                  testID="order-action-notice"
                  tone="success"
                  title="Cập nhật giao dịch"
                  message={actionNotice}
                  onDismiss={() => setActionNotice('')}
                  dismissLabel="Đóng thông báo"
                />
              ) : null}
              {actionError ? (
                <InlineBanner testID="order-action-error" tone="danger" message={actionError} />
              ) : null}
            </View>
          ) : (
            <View style={styles.restrictedWrap}>
              <RestrictedAccountNotice />
            </View>
          )}

          {/* Section 1 — Status Hero + Lucian #444 OrderProgressStepper */}
          <View style={styles.section} testID="order-status-card">
            <View style={styles.rowBetween}>
              <StatusIndicator
                testID="order-status-badge"
                variant="urgent"
                tone={meta.tone}
                label={meta.label}
              />
              <View style={styles.roleChip}>
                <Text style={styles.roleChipText}>
                  {order.viewer.isSeller ? 'Bạn là Người bán' : 'Bạn là Người mua'}
                </Text>
              </View>
            </View>

            <OrderProgressStepper
              testID="order-progress-stepper"
              currentStep={stepper.currentStep}
              cancelled={stepper.cancelled}
              tone={stepper.tone}
              statusNote={stepper.statusNote}
            />

            <View style={styles.timestampsRow}>
              <View style={styles.timestampItem}>
                <Text style={styles.timestampLabel}>Tạo yêu cầu</Text>
                <Text style={styles.timestampValue}>{formatOrderDateTime(order.createdAt)}</Text>
              </View>
              {order.reservedAt ? (
                <View style={styles.timestampItem}>
                  <Text style={styles.timestampLabel}>Giữ chỗ lúc</Text>
                  <Text style={styles.timestampValue}>{formatOrderDateTime(order.reservedAt)}</Text>
                </View>
              ) : null}
            </View>

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

            {order.viewer.requiresPostDeliveryCancel ? (
              <InlineBanner
                testID="post-delivery-cancel-notice"
                tone="warning"
                title="Đã ghi nhận báo đã giao (UC-27)"
                message="Không thể tự hủy giữ chỗ sau khi người bán đã báo đã giao kèm bằng chứng. Vui lòng sử dụng luồng Yêu cầu hủy sau báo giao (UC-28)."
              />
            ) : null}

            {hasPendingUnavailability ? (
              <InlineBanner
                testID="order-pending-unavailability-banner"
                tone="warning"
                title="Tin đăng hoặc đồ vật hiện không còn khả dụng"
                message="Tin đăng không còn ở trạng thái công khai hoặc có đồ vật đang được giữ/đã chuyển giao ở giao dịch khác nên không thể chấp nhận giữ chỗ lúc này."
              />
            ) : null}
          </View>

          <View style={styles.sectionGap} />

          {/* Section 2 — Listing & Counterparty Public Strip (Zero-PII NFR-01) */}
          <View style={styles.section}>
            <Pressable
              testID="order-listing-link"
              accessibilityRole="button"
              accessibilityLabel={`Xem tin đăng ${order.listing.title}`}
              onPress={() => navigation.navigate('Listing', { id: order.listing.id })}
              style={({ pressed }) => [styles.listingRow, pressed && styles.pressed]}
            >
              {listingThumbUri ? (
                <Image
                  source={{ uri: listingThumbUri }}
                  style={styles.listingThumb}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.listingThumbPlaceholder}>
                  <Icon name="image" size={20} color={semantic.color.textSecondary} />
                </View>
              )}

              <View style={styles.flex}>
                <Text style={styles.listingTitle} numberOfLines={2}>
                  {order.listing.title}
                </Text>
                <View style={styles.priceBadgeRow}>
                  <Text style={[styles.price, isFree && styles.priceFree]}>
                    {isFree ? '0đ · Cho tặng' : formatVnd(order.agreedPriceVnd)}
                  </Text>
                  {order.listing.isCombo ? (
                    <StatusIndicator variant="soft" tone="accent" label="Combo nguyên bộ" />
                  ) : null}
                </View>
              </View>
              <Icon name="chevron-right" size={18} color={semantic.color.textSecondary} />
            </Pressable>

            <HairlineDivider />

            <View style={styles.counterpartyRow} testID="order-counterparty-strip">
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{counterpartyInitial}</Text>
              </View>

              <View style={styles.flex}>
                <View style={styles.counterpartyNameRow}>
                  <Text style={styles.counterpartyName} numberOfLines={1}>
                    {counterparty.displayName}
                  </Text>
                  <View style={styles.verifiedTag}>
                    <Icon name="check-circle" size={11} color={semantic.color.freeFg} />
                    <Text style={styles.verifiedTagText}>ĐHQG</Text>
                  </View>
                </View>
                <Text style={styles.caption}>
                  {order.viewer.isSeller ? 'Người mua' : 'Người bán'}
                </Text>
              </View>

              <View style={styles.counterpartyMetrics}>
                <Text style={styles.reputationScoreText}>
                  Điểm uy tín: {counterparty.reputationScore}
                </Text>
                <StatusIndicator
                  variant="dot"
                  tone={isHighTrustCounterparty ? 'success' : 'neutral'}
                  label={counterpartyRep.tierLabel}
                />
              </View>
            </View>

            {order.note || order.proposedMeetingTime || order.proposedMeetingLocation ? (
              <View style={styles.buyerHintBox}>
                {order.proposedMeetingTime || order.proposedMeetingLocation ? (
                  <View style={styles.hintLine}>
                    <Icon name="clock" size={14} color={semantic.color.textSecondary} />
                    <Text style={styles.hintText}>
                      Gợi ý ban đầu: {formatOrderDateTime(order.proposedMeetingTime)} ·{' '}
                      {order.proposedMeetingLocation || 'Chưa ghi địa điểm'}
                    </Text>
                  </View>
                ) : null}
                {order.note ? (
                  <View style={styles.hintLine}>
                    <Icon name="message-circle" size={14} color={semantic.color.textSecondary} />
                    <Text style={styles.hintText}>Ghi chú: {order.note}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={styles.sectionGap} />

          {/* Section 3 — Physical Items in Order */}
          <View style={styles.section} testID="order-items-card">
            <SectionHeading
              title={`Đồ vật trong giao dịch (${order.items.length})`}
              subtitle={
                order.items.length >= 2
                  ? 'Combo được giữ và hủy nguyên bộ, không tách lẻ.'
                  : undefined
              }
            />

            <View style={styles.itemsList}>
              {order.items.map((item, idx) => {
                const itemThumb = item.images[0] ? resolveMediaUrl(item.images[0]) : null;
                return (
                  <Fragment key={item.id}>
                    {idx > 0 ? <HairlineDivider insetLeft={64} /> : null}
                    <View style={styles.itemRow}>
                      {itemThumb ? (
                        <Image
                          source={{ uri: itemThumb }}
                          style={styles.itemThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.itemThumbPlaceholder}>
                          <Icon name="package" size={18} color={semantic.color.textSecondary} />
                        </View>
                      )}
                      <View style={styles.flex}>
                        <Text style={styles.itemName} numberOfLines={2}>
                          {item.name}
                        </Text>
                        <Text style={styles.caption} numberOfLines={1}>
                          {item.condition}
                        </Text>
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
                  </Fragment>
                );
              })}
            </View>
          </View>

          {/* Section 4 — Two-Party Schedule Coordination (UC-25) */}
          {order.status === 'GIU_CHO' || order.status === 'DANG_GIAO' ? (
            <>
              <View style={styles.sectionGap} />
              <View style={styles.section} testID="schedule-section">
                <SectionHeading
                  title="Lịch hẹn giao nhận"
                  subtitle="Cần cả hai bên xác nhận trước khi người bán bắt đầu giao hàng."
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

                {order.pendingScheduleProposal ? (
                  <View style={styles.proposalBox} testID="pending-schedule-proposal">
                    <View style={styles.rowBetween}>
                      <Text style={styles.proposalAuthor}>
                        Đề xuất bởi {order.pendingScheduleProposal.proposedByName}
                      </Text>
                      <StatusIndicator
                        variant="soft"
                        tone={PROPOSAL_STATUS_META[order.pendingScheduleProposal.status].tone}
                        label={PROPOSAL_STATUS_META[order.pendingScheduleProposal.status].label}
                      />
                    </View>

                    <View style={styles.proposalDetails}>
                      <View style={styles.hintLine}>
                        <Icon name="calendar" size={14} color={semantic.color.accent} />
                        <Text style={styles.proposalValue}>
                          {formatOrderDateTime(order.pendingScheduleProposal.proposedTime)}
                        </Text>
                      </View>
                      <View style={styles.hintLine}>
                        <Icon name="map-pin" size={14} color={semantic.color.accent} />
                        <Text style={styles.proposalValue}>
                          {order.pendingScheduleProposal.proposedLocation}
                        </Text>
                      </View>
                      {order.pendingScheduleProposal.note ? (
                        <Text style={styles.caption}>
                          Ghi chú: {order.pendingScheduleProposal.note}
                        </Text>
                      ) : null}
                    </View>

                    {order.pendingScheduleProposal.canConfirm ? (
                      <View style={styles.rowActions}>
                        <Pressable
                          testID="reject-schedule-button"
                          disabled={submitting}
                          accessibilityRole="button"
                          accessibilityLabel="Chưa đồng ý lịch hẹn"
                          onPress={() => {
                            setActionError('');
                            setScheduleRejectReason('');
                            setRejectProposalId(order.pendingScheduleProposal!.id);
                          }}
                          style={({ pressed }) => [
                            styles.secondaryBtn,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.secondaryBtnText}>Chưa đồng ý</Text>
                        </Pressable>
                        <Pressable
                          testID="confirm-schedule-button"
                          disabled={submitting}
                          accessibilityRole="button"
                          accessibilityLabel="Xác nhận lịch hẹn"
                          onPress={() => handleConfirmProposal(order.pendingScheduleProposal!.id)}
                          style={({ pressed }) => [
                            styles.primaryBtn,
                            styles.flex,
                            submitting && styles.disabledBtn,
                            pressed && !submitting && styles.primaryBtnPressed,
                          ]}
                        >
                          <Icon name="check" size={15} color={component.button.primaryFg} />
                          <Text style={styles.primaryBtnText}>Xác nhận lịch hẹn</Text>
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
                  <Pressable
                    testID="open-schedule-form-button"
                    accessibilityRole="button"
                    accessibilityLabel={
                      order.scheduleConfirmed
                        ? 'Đề xuất đổi lịch hẹn'
                        : 'Đề xuất thời gian & địa điểm'
                    }
                    onPress={openScheduleSheet}
                    style={({ pressed }) => [styles.scheduleTriggerBtn, pressed && styles.pressed]}
                  >
                    <Icon name="calendar" size={16} color={semantic.color.accent} />
                    <Text style={styles.scheduleTriggerText}>
                      {order.scheduleConfirmed
                        ? 'Đề xuất đổi lịch hẹn'
                        : 'Đề xuất thời gian & địa điểm'}
                    </Text>
                  </Pressable>
                ) : null}

                {pastProposals.length > 0 ? (
                  <View style={styles.historyWrap} testID="schedule-history-list">
                    <Text style={styles.historyHeading}>Lịch sử đề xuất gần đây</Text>
                    {pastProposals.map((prop, idx) => {
                      const propMeta = PROPOSAL_STATUS_META[prop.status];
                      return (
                        <Fragment key={prop.id}>
                          {idx > 0 ? <HairlineDivider /> : null}
                          <View style={styles.historyRow}>
                            <View style={styles.flex}>
                              <Text style={styles.historyTime}>
                                {formatOrderDateTime(prop.proposedTime)} · {prop.proposedLocation}
                              </Text>
                              <Text style={styles.caption}>
                                {prop.proposedByName}
                                {prop.rejectReason ? ` · ${prop.rejectReason}` : ''}
                              </Text>
                            </View>
                            <StatusIndicator
                              variant="dot"
                              tone={propMeta.tone}
                              label={propMeta.label}
                            />
                          </View>
                        </Fragment>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>

        {/* Sticky Bottom CTA Dock */}
        {hasStickyDock ? (
          <View style={[styles.stickyBar, { paddingBottom: stickyBottomPad }]}>
            {order.viewer.canAccept || order.viewer.canReject ? (
              <View style={styles.dockColumn} testID="seller-decision-section">
                <Text style={styles.dockHint}>
                  Chấp nhận sẽ khóa tin đăng và toàn bộ đồ vật thành phần cho người mua này.
                </Text>
                <View style={styles.rowActions}>
                  {order.viewer.canReject ? (
                    <Pressable
                      testID="reject-reservation-button"
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel="Từ chối yêu cầu"
                      onPress={() => {
                        setActionError('');
                        setReasonText('');
                        setRejectSheetOpen(true);
                      }}
                      style={({ pressed }) => [
                        styles.dangerSoftBtn,
                        submitting && styles.disabledBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.dangerSoftBtnText}>Từ chối</Text>
                    </Pressable>
                  ) : null}

                  {order.viewer.canAccept ? (
                    <Pressable
                      testID="accept-reservation-button"
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel="Chấp nhận giữ chỗ"
                      onPress={handleAcceptPress}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        styles.flex,
                        submitting && styles.disabledBtn,
                        pressed && !submitting && styles.primaryBtnPressed,
                      ]}
                    >
                      <Icon name="check" size={16} color={component.button.primaryFg} />
                      <Text style={styles.primaryBtnText}>Chấp nhận giữ chỗ</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : order.viewer.isSeller && order.status === 'GIU_CHO' ? (
              <View style={styles.dockColumn} testID="start-delivery-section">
                {!order.viewer.canStartDelivery ? (
                  <Text style={styles.dockHint} testID="start-delivery-hint">
                    Cần hai bên thống nhất thời gian và địa điểm hẹn trước khi bấm bắt đầu giao hàng.
                  </Text>
                ) : null}
                <View style={styles.rowActions}>
                  {order.viewer.canCancel ? (
                    <Pressable
                      testID="cancel-reservation-button"
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel="Hủy giữ chỗ"
                      onPress={() => {
                        setActionError('');
                        setReasonText('');
                        setCancelSheetOpen(true);
                      }}
                      style={({ pressed }) => [
                        styles.dangerSoftBtn,
                        submitting && styles.disabledBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.dangerSoftBtnText}>Hủy giữ chỗ</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    testID="start-delivery-button"
                    disabled={!order.viewer.canStartDelivery || submitting}
                    accessibilityRole="button"
                    accessibilityLabel="Thông báo bắt đầu giao hàng"
                    accessibilityState={{ disabled: !order.viewer.canStartDelivery || submitting }}
                    onPress={handleStartDeliveryPress}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      styles.flex,
                      (!order.viewer.canStartDelivery || submitting) && styles.disabledBtn,
                      pressed && order.viewer.canStartDelivery && styles.primaryBtnPressed,
                    ]}
                  >
                    <Icon name="navigation" size={16} color={component.button.primaryFg} />
                    <Text style={styles.primaryBtnText}>Bắt đầu giao hàng</Text>
                  </Pressable>
                </View>
              </View>
            ) : order.viewer.canCancel ? (
              <View style={styles.dockColumn} testID="cancel-reservation-section">
                {order.status === 'DANG_GIAO' ? (
                  <Text style={styles.dockHint}>
                    Người bán chưa báo đã giao (UC-27), hai bên vẫn có thể hủy giữ chỗ nếu cần.
                  </Text>
                ) : null}
                <View style={styles.rowActions}>
                  {order.viewer.canProposeSchedule ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Đề xuất lịch hẹn"
                      onPress={openScheduleSheet}
                      style={({ pressed }) => [
                        styles.secondaryBtn,
                        styles.flex,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.secondaryBtnText}>
                        {order.scheduleConfirmed ? 'Đổi lịch hẹn' : 'Đề xuất lịch'}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    testID="cancel-reservation-button"
                    disabled={submitting}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isWithdrawPending ? 'Rút yêu cầu giữ chỗ' : 'Hủy giữ chỗ'
                    }
                    onPress={() => {
                      setActionError('');
                      setReasonText('');
                      setCancelSheetOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.dangerSoftBtn,
                      !order.viewer.canProposeSchedule && styles.flex,
                      submitting && styles.disabledBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.dangerSoftBtnText}>
                      {isWithdrawPending ? 'Rút yêu cầu giữ chỗ' : 'Hủy giữ chỗ'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* Lucian #305 BottomSheet: Schedule Proposal Form (UC-25) */}
      <BottomSheet
        visible={scheduleSheetOpen}
        onClose={() => setScheduleSheetOpen(false)}
        title={order.scheduleConfirmed ? 'Đề xuất đổi lịch hẹn' : 'Đề xuất lịch giao nhận'}
        subtitle="Bên còn lại cần xác nhận để lịch có hiệu lực chung."
        footerLabel={submitting ? 'Đang gửi…' : 'Gửi đề xuất lịch'}
        footerDisabled={submitting}
        footerTestID="submit-schedule-proposal-button"
        onFooterPress={() => void handleSubmitSchedule()}
        testID="schedule-proposal-sheet"
      >
        <View style={styles.sheetBody} testID="schedule-proposal-form">
          {actionError ? (
            <InlineBanner testID="schedule-sheet-error" tone="danger" message={actionError} />
          ) : null}
          <View style={styles.chipRow}>
            {timePresets.map((preset) => {
              const active = scheduleTimeText.trim() === preset.value;
              return (
                <Pressable
                  key={preset.label}
                  onPress={() => {
                    setScheduleTimeText(preset.value);
                    setScheduleTimeError('');
                  }}
                  style={[styles.chip, active && styles.chipActive]}
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
            testID="schedule-time-input"
            label="Thời gian đề xuất"
            required
            placeholder="YYYY-MM-DD HH:mm"
            helperText="Ví dụ: 2026-12-01 18:00"
            value={scheduleTimeText}
            onChangeText={(text) => {
              setScheduleTimeText(text);
              if (scheduleTimeError) setScheduleTimeError('');
            }}
            error={scheduleTimeError}
            leadingIcon="calendar"
          />

          <FormField
            testID="schedule-location-input"
            label="Địa điểm gặp mặt"
            required
            placeholder="Nhập địa điểm trong ĐHQG-HCM / KTX…"
            value={scheduleLocation}
            onChangeText={(text) => {
              setScheduleLocation(text);
              if (scheduleLocationError) setScheduleLocationError('');
            }}
            error={scheduleLocationError}
            leadingIcon="map-pin"
          />

          <View style={styles.chipRow}>
            {QUICK_MEETING_LOCATIONS.map((loc, i) => {
              const active = scheduleLocation === loc;
              return (
                <Pressable
                  key={loc}
                  testID={`schedule-loc-chip-${i}`}
                  onPress={() => {
                    setScheduleLocation(loc);
                    setScheduleLocationError('');
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{loc}</Text>
                </Pressable>
              );
            })}
          </View>

          <FormField
            testID="schedule-note-input"
            label="Ghi chú (tùy chọn)"
            placeholder="Ví dụ: Gặp trước cổng bảo vệ"
            value={scheduleNote}
            onChangeText={setScheduleNote}
          />
        </View>
      </BottomSheet>

      {/* Lucian #305 BottomSheet: Seller Reject Reservation (UC-23 A1) */}
      <BottomSheet
        visible={rejectSheetOpen}
        onClose={() => setRejectSheetOpen(false)}
        title="Từ chối yêu cầu giữ chỗ"
        subtitle="Từ chối sẽ không khóa tin đăng hay đồ vật."
        testID="reject-reservation-sheet"
        footerSlot={
          <View style={styles.rowActions}>
            <Pressable
              onPress={() => setRejectSheetOpen(false)}
              style={[styles.secondaryBtn, styles.flex]}
            >
              <Text style={styles.secondaryBtnText}>Quay lại</Text>
            </Pressable>
            <Pressable
              testID="confirm-reject-reservation-button"
              disabled={submitting}
              onPress={() => void handleConfirmRejectReservation()}
              style={({ pressed }) => [
                styles.dangerPrimaryBtn,
                styles.flex,
                submitting && styles.disabledBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.dangerPrimaryBtnText}>
                {submitting ? 'Đang xử lý…' : 'Xác nhận từ chối'}
              </Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.sheetBody}>
          {actionError ? (
            <InlineBanner testID="reject-sheet-error" tone="danger" message={actionError} />
          ) : null}
          <View style={styles.chipRow}>
            {ORDER_REJECT_REASONS.map((preset) => {
              const active = reasonText === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => setReasonText(preset)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset}</Text>
                </Pressable>
              );
            })}
          </View>
          <FormField
            testID="seller-reject-reason-input"
            label="Lý do từ chối (tùy chọn)"
            placeholder="Nhập lý do gửi cho người mua…"
            multiline
            maxLength={500}
            value={reasonText}
            onChangeText={setReasonText}
            editable={!submitting}
          />
        </View>
      </BottomSheet>

      {/* Lucian #305 BottomSheet: Cancel / Withdraw Reservation (UC-24) */}
      <BottomSheet
        visible={cancelSheetOpen}
        onClose={() => setCancelSheetOpen(false)}
        title={isWithdrawPending ? 'Rút yêu cầu giữ chỗ' : 'Xác nhận hủy giữ chỗ'}
        subtitle={
          isWithdrawPending
            ? 'Yêu cầu đang chờ phản hồi này sẽ bị hủy.'
            : 'Chấm dứt giữ chỗ toàn bộ đồ vật (không tách combo) và cập nhật lại khả dụng.'
        }
        testID="cancel-reservation-sheet"
        footerSlot={
          <View style={styles.rowActions}>
            <Pressable
              onPress={() => setCancelSheetOpen(false)}
              style={[styles.secondaryBtn, styles.flex]}
            >
              <Text style={styles.secondaryBtnText}>Giữ lại</Text>
            </Pressable>
            <Pressable
              testID="confirm-cancel-reservation-button"
              disabled={submitting}
              onPress={() => void handleConfirmCancelReservation()}
              style={({ pressed }) => [
                styles.dangerPrimaryBtn,
                styles.flex,
                submitting && styles.disabledBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.dangerPrimaryBtnText}>
                {submitting
                  ? 'Đang xử lý…'
                  : isWithdrawPending
                    ? 'Rút yêu cầu'
                    : 'Hủy giữ chỗ'}
              </Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.sheetBody}>
          {actionError ? (
            <InlineBanner testID="cancel-sheet-error" tone="danger" message={actionError} />
          ) : null}
          <View style={styles.cancelContextBox} testID="cancel-sheet-delivery-state">
            <View style={styles.hintLine}>
              <Icon name="navigation" size={14} color={semantic.color.textSecondary} />
              <Text style={styles.hintText}>Trạng thái giao hàng: {deliveryStateLabel}</Text>
            </View>
            <View style={styles.hintLine}>
              <Icon name="package" size={14} color={semantic.color.textSecondary} />
              <Text style={styles.hintText}>
                Đồ vật: {order.items.length} món
                {order.items.length >= 2 ? ' (hủy nguyên bộ combo)' : ''}
              </Text>
            </View>
          </View>
          <View style={styles.chipRow}>
            {ORDER_CANCEL_REASONS.map((preset) => {
              const active = reasonText === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => setReasonText(preset)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset}</Text>
                </Pressable>
              );
            })}
          </View>
          <FormField
            testID="cancel-reason-input"
            label="Lý do hủy (tùy chọn)"
            placeholder="Nhập lý do để thông báo cho đối tác…"
            multiline
            maxLength={500}
            value={reasonText}
            onChangeText={setReasonText}
            editable={!submitting}
          />
        </View>
      </BottomSheet>

      {/* Lucian #305 BottomSheet: Reject Schedule Proposal (UC-25 A1) */}
      <BottomSheet
        visible={Boolean(rejectProposalId)}
        onClose={() => setRejectProposalId(null)}
        title="Chưa đồng ý lịch hẹn này"
        subtitle="Giữ chỗ vẫn giữ nguyên hiệu lực để hai bên thống nhất khung giờ khác."
        testID="reject-schedule-sheet"
        footerSlot={
          <View style={styles.rowActions}>
            <Pressable
              testID="confirm-reject-schedule-button"
              disabled={submitting}
              onPress={() => void handleConfirmRejectProposal(false)}
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.flex,
                submitting && styles.disabledBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryBtnText}>
                {submitting ? 'Đang gửi…' : 'Chỉ phản hồi'}
              </Text>
            </Pressable>
            <Pressable
              testID="reject-and-counter-propose-button"
              disabled={submitting}
              onPress={() => void handleConfirmRejectProposal(true)}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.flex,
                submitting && styles.disabledBtn,
                pressed && styles.primaryBtnPressed,
              ]}
            >
              <Text style={styles.primaryBtnText}>Đề xuất lịch khác</Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.sheetBody}>
          {actionError ? (
            <InlineBanner testID="reject-schedule-sheet-error" tone="danger" message={actionError} />
          ) : null}
          <View style={styles.chipRow}>
            {SCHEDULE_REJECT_REASONS.map((preset) => {
              const active = scheduleRejectReason === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => setScheduleRejectReason(preset)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset}</Text>
                </Pressable>
              );
            })}
          </View>
          <FormField
            testID="schedule-reject-reason-input"
            label="Lý do chưa phù hợp (tùy chọn)"
            placeholder="Ví dụ: Mình có lịch học, hẹn sau 18h nhé…"
            multiline
            maxLength={300}
            value={scheduleRejectReason}
            onChangeText={setScheduleRejectReason}
            editable={!submitting}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    padding: primitive.space[6],
    gap: primitive.space[2.5],
    backgroundColor: semantic.color.bgSurface,
  },
  scrollView: {
    flex: 1,
    backgroundColor: semantic.color.bgCanvas,
  },
  scrollContent: {
    paddingBottom: primitive.space[6],
  },
  topNoticesWrap: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    paddingBottom: primitive.space[1],
    gap: primitive.space[2.5],
  },
  restrictedWrap: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
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
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  roleChip: {
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
  },
  roleChipText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  timestampsRow: {
    flexDirection: 'row',
    gap: primitive.space[2],
  },
  timestampItem: {
    flex: 1,
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
    gap: 2,
  },
  timestampLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
  },
  timestampValue: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  listingThumb: {
    width: 64,
    height: 64,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgTrack,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  listingThumbPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingTitle: {
    ...semantic.type.cardTitle,
  },
  priceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[2],
    marginTop: primitive.space[1],
  },
  price: {
    ...semantic.type.price,
    color: semantic.color.accent,
  },
  priceFree: {
    color: semantic.color.freeFg,
  },
  counterpartyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.heroEspresso,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: semantic.color.textInverse,
    fontSize: primitive.fontSize.md,
    fontWeight: primitive.fontWeight.bold,
  },
  counterpartyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  counterpartyName: {
    ...semantic.type.cardTitle,
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
  counterpartyMetrics: {
    alignItems: 'flex-end',
    gap: 3,
  },
  reputationScoreText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  buyerHintBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    padding: primitive.space[3],
    gap: primitive.space[1.5],
  },
  hintLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[2],
  },
  hintText: {
    flex: 1,
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
  },
  caption: {
    ...semantic.type.caption,
  },
  itemsList: {
    gap: 0,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
    paddingVertical: primitive.space[2.5],
  },
  itemThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: semantic.color.bgSubtle,
  },
  itemThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
    ...semantic.type.cardTitle,
  },
  proposalBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.lg,
    padding: primitive.space[3.5 as keyof typeof primitive.space] ?? 14,
    gap: primitive.space[2.5],
  },
  proposalAuthor: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
    flex: 1,
  },
  proposalDetails: {
    gap: primitive.space[1.5],
  },
  proposalValue: {
    flex: 1,
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.medium,
  },
  waitingText: {
    ...semantic.type.caption,
    color: semantic.color.warning,
    fontWeight: primitive.fontWeight.semibold,
  },
  scheduleTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
    backgroundColor: semantic.color.accentSoft,
    paddingHorizontal: component.button.paddingX,
  },
  scheduleTriggerText: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  historyWrap: {
    paddingTop: primitive.space[1],
    gap: primitive.space[1.5],
  },
  historyHeading: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    paddingVertical: primitive.space[2],
  },
  historyTime: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.medium,
  },
  stickyBar: {
    borderTopWidth: 1,
    borderTopColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
  },
  dockColumn: {
    gap: primitive.space[2],
  },
  dockHint: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    backgroundColor: component.button.primaryBg,
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
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
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    paddingHorizontal: primitive.space[3.5 as keyof typeof primitive.space] ?? 14,
  },
  secondaryBtnText: {
    fontSize: primitive.fontSize.sm,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.secondaryFg,
  },
  dangerSoftBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.destructiveSoftBg,
    paddingHorizontal: primitive.space[4],
  },
  dangerSoftBtnText: {
    fontSize: primitive.fontSize.sm,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.destructiveFg,
  },
  dangerPrimaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.destructiveBg,
    paddingHorizontal: component.button.paddingX,
  },
  dangerPrimaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textInverse,
  },
  sheetBody: {
    gap: primitive.space[3],
  },
  cancelContextBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    padding: primitive.space[3],
    gap: primitive.space[1.5],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    minHeight: component.chip.height,
    backgroundColor: component.chip.bg,
    borderWidth: 1,
    borderColor: component.chip.border,
    borderRadius: component.chip.radius,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1],
  },
  chipActive: {
    backgroundColor: component.chip.activeBg,
    borderColor: component.chip.activeBorder,
  },
  chipText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  chipTextActive: {
    color: component.chip.activeFg,
    fontWeight: primitive.fontWeight.semibold,
  },
  disabledBtn: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
