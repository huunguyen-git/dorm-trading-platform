import { Fragment, useCallback, useContext, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import { buildMediaImageSource } from '../api/client';
import { resolveUserRestriction, useSession } from '../auth/session';
import type { InventoryItemStatus } from '../inventory/types';
import { formatReputationSummary, formatVnd } from '../listings/types';
import type { PickableImageAsset } from '../media/imagePicker';
import { extractTransactionError } from '../transactions/api';
import { useTransactions } from '../transactions/store';
import {
  computeRemainingSeconds,
  ESCALATION_REASON_LABELS,
  formatEscalationCountdown,
  formatOtpDisplay,
  formatTransactionDateTime,
  getInitialsFromName,
  TRANSACTION_STATUS_META,
  type CancelDecision,
  type CancelReasonCode,
  type TransactionCounterparty,
} from '../transactions/types';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  BottomSheet,
  EmptyState,
  FormField,
  HairlineDivider,
  Icon,
  InlineBanner,
  OtpCodeInput,
  SectionHeading,
  StatusIndicator,
  Toast,
  TransactionDetailSkeleton,
  TransactionStepper,
  useReduceMotion,
  type OtpVisualStatus,
  type StatusTone,
  type ToastTone,
} from '../components/ui';
import { CountdownPill } from '../components/transactions/CountdownPill';
import { HandoverPhotoUploader } from '../components/transactions/HandoverPhotoUploader';
import { HandoverProofCard } from '../components/transactions/HandoverProofCard';
import { CancelRequestSheet } from '../components/transactions/CancelRequestSheet';
import { CancelConsentCard } from '../components/transactions/CancelConsentCard';
import { TransactionTimeline } from '../components/transactions/TransactionTimeline';
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics';
import { component, primitive, semantic } from '../theme';

function getItemStatusMeta(status: InventoryItemStatus): { label: string; tone: StatusTone } {
  if (status === 'DANG_GIU') return { label: 'Đang giữ', tone: 'warning' };
  if (status === 'DA_CHUYEN_GIAO') return { label: 'Đã chuyển giao', tone: 'success' };
  return { label: 'Khả dụng', tone: 'neutral' };
}

function getViewerRolePill(role: string): { label: string; tone: StatusTone } {
  if (role === 'SELLER') return { label: 'Đơn bán', tone: 'accent' };
  if (role === 'BUYER') return { label: 'Đơn mua', tone: 'neutral' };
  if (role === 'SENIOR_ADMIN') return { label: 'Quản trị', tone: 'warning' };
  return { label: 'Kiểm duyệt', tone: 'warning' };
}

function PartyIdentityRow({
  roleLabel,
  party,
  nameTestID,
  rowTestID,
}: {
  roleLabel: string;
  party: TransactionCounterparty;
  nameTestID?: string;
  rowTestID?: string;
}) {
  const rep = formatReputationSummary(party.reputationScore);
  const initials = getInitialsFromName(party.displayName);
  const isHighTrust = party.reputationScore >= 120;

  return (
    <View style={styles.partyRow} testID={rowTestID}>
      <View style={styles.partyAvatar}>
        <Text style={styles.partyAvatarText}>{initials}</Text>
      </View>
      <View style={styles.partyBody}>
        <Text style={styles.partyEyebrow}>{roleLabel}</Text>
        <Text style={styles.partyName} numberOfLines={1} testID={nameTestID}>
          {party.displayName}
        </Text>
      </View>
      <View style={[styles.trustPill, isHighTrust && styles.trustPillHigh]}>
        <Icon
          name="shield"
          size={11}
          color={isHighTrust ? semantic.color.success : semantic.color.textSecondary}
        />
        <Text style={[styles.trustPillText, isHighTrust && styles.trustPillTextHigh]}>
          {rep.tierLabel} · {party.reputationScore}
        </Text>
      </View>
    </View>
  );
}

export default function TransactionDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStack, 'TransactionDetail'>>();
  const insets = useContext(SafeAreaInsetsContext);
  const reduceMotion = useReduceMotion();
  const transactionId = params?.id ?? '';

  const user = useSession((state) => state.user);
  const restriction = useSession((state) => state.restriction);
  const restrictionDismissed = useSession((state) => state.restrictionDismissed);
  const visibleRestriction =
    restriction ?? (restrictionDismissed ? null : resolveUserRestriction(user));
  const isLockedAccount = Boolean(visibleRestriction) || user?.accountStatus === 'BI_KHOA';

  const {
    selectedDetail,
    detailLoading,
    detailError,
    detailNotFound,
    submitting,
    loadDetail,
    clearDetail,
    reportDelivered,
    completeWithOtp,
    reissueOtp,
    requestCancel,
    respondCancel,
  } = useTransactions();

  // Seller handover form state (UC-27)
  const [pickedPhotos, setPickedPhotos] = useState<PickableImageAsset[]>([]);
  const [handoverNote, setHandoverNote] = useState('');
  const [photoValidationError, setPhotoValidationError] = useState('');
  const [deliverConfirmOpen, setDeliverConfirmOpen] = useState(false);

  // Practical dorm combo/item local inspection checklist (non-blocking)
  const [checkedItemIds, setCheckedItemIds] = useState<Record<string, boolean>>({});

  // Buyer verification workbench state
  const [otpInput, setOtpInput] = useState('');
  const [otpVisualStatus, setOtpVisualStatus] = useState<OtpVisualStatus>('idle');
  const [otpErrorMsg, setOtpErrorMsg] = useState('');
  const [otpShakeKey, setOtpShakeKey] = useState(0);
  const [otpClientExpired, setOtpClientExpired] = useState(false);
  const [hideInAppCode, setHideInAppCode] = useState(false);

  // Seller 24h live escalation countdown
  const [escalateRemainingSec, setEscalateRemainingSec] = useState<number | null>(null);

  // Cancellation & floating toast feedback state
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [actionError, setActionError] = useState('');
  const [versionConflictMsg, setVersionConflictMsg] = useState('');
  const [externalLightboxOpen, setExternalLightboxOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone; seq: number } | null>(null);

  const submitGuardRef = useRef(false);
  const sellerExpiredSyncedOtpIdRef = useRef<string | null>(null);
  const scrollViewRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const otpSectionYRef = useRef(0);

  const detail = selectedDetail?.id === transactionId ? selectedDetail : null;

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast((prev) => ({ message, tone, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const scrollToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo?.({ y: 0, animated: !reduceMotion });
  }, [reduceMotion]);

  useEffect(() => {
    setPickedPhotos([]);
    setHandoverNote('');
    setPhotoValidationError('');
    setDeliverConfirmOpen(false);
    setCheckedItemIds({});
    setOtpInput('');
    setOtpVisualStatus('idle');
    setOtpErrorMsg('');
    setOtpClientExpired(false);
    setCancelSheetOpen(false);
    setCancelError('');
    setActionError('');
    setVersionConflictMsg('');
    setExternalLightboxOpen(false);
    setToast(null);
    sellerExpiredSyncedOtpIdRef.current = null;

    if (transactionId) {
      void loadDetail(transactionId).catch(() => {});
    } else {
      clearDetail();
    }
  }, [transactionId, loadDetail, clearDetail]);

  // Reset client-expired & visibility flags whenever server issues a fresh verification code
  useEffect(() => {
    setOtpClientExpired(false);
    setHideInAppCode(false);
  }, [detail?.otp?.id, detail?.otp?.expiresAt]);

  // Live 24h auto-escalation countdown for Seller waiting state (updates every 30s)
  useEffect(() => {
    if (!detail || detail.status !== 'CHO_XAC_NHAN' || !detail.autoEscalateAt) {
      setEscalateRemainingSec(null);
      return;
    }
    const computeLeft = () =>
      computeRemainingSeconds(detail.autoEscalateAt, detail.clockOffsetMs);
    setEscalateRemainingSec(
      detail.autoEscalateRemainingSeconds !== null
        ? detail.autoEscalateRemainingSeconds
        : computeLeft(),
    );
    const interval = setInterval(() => {
      setEscalateRemainingSec(computeLeft());
    }, 30000);
    return () => clearInterval(interval);
  }, [detail?.autoEscalateAt, detail?.autoEscalateRemainingSeconds, detail?.clockOffsetMs, detail?.status]);

  const handleRefresh = useCallback(
    async (withToast = false) => {
      if (!transactionId) return;
      setActionError('');
      setVersionConflictMsg('');
      setOtpErrorMsg('');
      setCancelError('');
      try {
        const fresh = await loadDetail(transactionId);
        if (withToast) {
          triggerLightHaptic();
          if (fresh.status === 'HOAN_TAT') {
            showToast('Giao dịch đã hoàn tất!', 'success');
          } else {
            showToast('Đã cập nhật trạng thái mới nhất.', 'info');
          }
        }
      } catch {
        // Error already surfaced via store/detailError
      }
    },
    [transactionId, loadDetail, showToast],
  );

  const handleDeliverPress = () => {
    setActionError('');
    setVersionConflictMsg('');
    if (pickedPhotos.length === 0) {
      setPhotoValidationError('Vui lòng thêm ít nhất 1 ảnh bàn giao.');
      return;
    }
    setPhotoValidationError('');
    setDeliverConfirmOpen(true);
  };

  const confirmReportDelivered = async () => {
    if (!detail || submitting || submitGuardRef.current) return;
    submitGuardRef.current = true;
    setActionError('');
    setVersionConflictMsg('');
    try {
      await reportDelivered(detail.id, {
        photos: pickedPhotos,
        note: handoverNote,
        version: detail.version,
      });
      setDeliverConfirmOpen(false);
      setPickedPhotos([]);
      setHandoverNote('');
      triggerSuccessHaptic();
      scrollToTop();
      showToast('Đã báo giao và gửi mã xác nhận cho người mua.', 'success');
    } catch (err) {
      setDeliverConfirmOpen(false);
      triggerErrorHaptic();
      const parsed = extractTransactionError(err, 'Không thể gửi ảnh bàn giao.');
      if (parsed.isRestricted) return;
      if (parsed.isVersionConflict) {
        setVersionConflictMsg(parsed.message);
        showToast(parsed.message, 'warning');
        scrollToTop();
      } else if (
        parsed.code === 'HANDOVER_PHOTO_REQUIRED' ||
        parsed.code === 'INVALID_MEDIA' ||
        parsed.code === 'FILE_TOO_LARGE'
      ) {
        setPhotoValidationError(parsed.message);
        showToast(parsed.message, 'danger');
      } else {
        setActionError(parsed.message);
        showToast(parsed.message, 'danger');
        scrollToTop();
      }
    } finally {
      submitGuardRef.current = false;
    }
  };

  const handleAutoFillInAppCode = (code: string) => {
    const cleaned = code.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length !== 6) return;
    setOtpInput(cleaned);
    setOtpVisualStatus('idle');
    setOtpErrorMsg('');
    triggerLightHaptic();
    showToast('Đã điền mã — bấm “Xác nhận đã nhận hàng” để hoàn tất.', 'info');
  };

  const handleOtpFocus = useCallback(() => {
    if (otpSectionYRef.current > 0) {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, otpSectionYRef.current - 12),
        animated: !reduceMotion,
      });
    }
  }, [reduceMotion]);

  const handleOtpSubmit = async () => {
    if (!detail || submitting || submitGuardRef.current) return;
    const cleaned = otpInput.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length !== 6) {
      setOtpVisualStatus('error');
      setOtpShakeKey((k) => k + 1);
      setOtpErrorMsg('Vui lòng nhập đủ mã xác nhận.');
      triggerErrorHaptic();
      return;
    }
    submitGuardRef.current = true;
    setOtpErrorMsg('');
    setActionError('');
    setVersionConflictMsg('');
    setOtpVisualStatus('checking');

    try {
      await completeWithOtp(detail.id, { otp: cleaned, version: detail.version });
      setOtpVisualStatus('success');
      setOtpInput('');
      triggerSuccessHaptic();
      scrollToTop();
      showToast('Giao dịch đã hoàn tất!', 'success');
    } catch (err) {
      triggerErrorHaptic();
      const parsed = extractTransactionError(err, 'Không thể xác nhận nhận hàng.');
      if (parsed.isRestricted) {
        setOtpVisualStatus('idle');
        return;
      }
      if (parsed.isVersionConflict) {
        setOtpVisualStatus('idle');
        setVersionConflictMsg(parsed.message);
        showToast(parsed.message, 'warning');
        scrollToTop();
        return;
      }
      if (parsed.code === 'OTP_ALREADY_USED') {
        setOtpVisualStatus('idle');
        setOtpInput('');
        setOtpErrorMsg('');
        scrollToTop();
        void loadDetail(detail.id).catch(() => {});
        return;
      }
      const isInlineOtpCode =
        parsed.code === 'OTP_INVALID' ||
        parsed.code === 'OTP_EXPIRED' ||
        parsed.code === 'OTP_ATTEMPTS_EXCEEDED';
      if (!isInlineOtpCode) {
        setOtpVisualStatus('idle');
        setActionError(parsed.message);
        showToast(parsed.message, 'danger');
        scrollToTop();
        return;
      }
      setOtpVisualStatus('error');
      setOtpShakeKey((k) => k + 1);
      setOtpErrorMsg(parsed.message);
      if (parsed.code === 'OTP_INVALID') {
        setOtpInput('');
      }
    } finally {
      submitGuardRef.current = false;
    }
  };

  const handleReissueOtp = async () => {
    if (!detail || submitting || submitGuardRef.current) return;
    submitGuardRef.current = true;
    setActionError('');
    setOtpErrorMsg('');
    setVersionConflictMsg('');
    try {
      await reissueOtp(detail.id, { version: detail.version });
      setOtpInput('');
      setOtpVisualStatus('idle');
      setOtpClientExpired(false);
      triggerSuccessHaptic();
      showToast('Đã gửi lại mã xác nhận mới.', 'success');
    } catch (err) {
      triggerErrorHaptic();
      const parsed = extractTransactionError(err, 'Không thể gửi lại mã.');
      if (parsed.isRestricted) return;
      if (parsed.isVersionConflict) {
        setVersionConflictMsg(parsed.message);
        showToast(parsed.message, 'warning');
        scrollToTop();
      } else {
        setActionError(parsed.message);
        showToast(parsed.message, 'danger');
      }
    } finally {
      submitGuardRef.current = false;
    }
  };

  const handleCancelSubmit = async (payload: { reasonCode: CancelReasonCode; reasonNote: string }) => {
    if (!detail || submitting || submitGuardRef.current) return;
    submitGuardRef.current = true;
    setCancelError('');
    setActionError('');
    setVersionConflictMsg('');
    try {
      await requestCancel(detail.id, {
        reasonCode: payload.reasonCode,
        reasonNote: payload.reasonNote,
        version: detail.version,
      });
      setCancelSheetOpen(false);
      triggerLightHaptic();
      scrollToTop();
      showToast('Đã gửi yêu cầu hủy. Đồ vật vẫn được giữ trong lúc chờ.', 'warning');
    } catch (err) {
      triggerErrorHaptic();
      const parsed = extractTransactionError(err, 'Không thể gửi yêu cầu hủy.');
      if (parsed.isRestricted) {
        setCancelSheetOpen(false);
        return;
      }
      if (parsed.isVersionConflict) {
        setCancelSheetOpen(false);
        setVersionConflictMsg(parsed.message);
        showToast(parsed.message, 'warning');
        scrollToTop();
      } else {
        setCancelError(parsed.message);
        showToast(parsed.message, 'danger');
      }
    } finally {
      submitGuardRef.current = false;
    }
  };

  const handleCancelRespond = async (decision: CancelDecision, responseNote: string) => {
    if (!detail?.cancellationRequest || submitting || submitGuardRef.current) return;
    submitGuardRef.current = true;
    setCancelError('');
    setActionError('');
    setVersionConflictMsg('');
    try {
      await respondCancel(detail.id, detail.cancellationRequest.id, {
        decision,
        responseNote,
        version: detail.version,
      });
      triggerSuccessHaptic();
      scrollToTop();
      showToast(
        decision === 'AGREE'
          ? 'Đã hủy giao dịch và mở lại đồ vật.'
          : 'Đã từ chối hủy. Chuyển kiểm duyệt xem xét.',
        decision === 'AGREE' ? 'info' : 'warning',
      );
    } catch (err) {
      triggerErrorHaptic();
      const parsed = extractTransactionError(err, 'Không thể gửi phản hồi.');
      if (parsed.isRestricted) return;
      if (parsed.isVersionConflict) {
        setVersionConflictMsg(parsed.message);
        showToast(parsed.message, 'warning');
        scrollToTop();
      } else {
        setCancelError(parsed.message);
        showToast(parsed.message, 'danger');
      }
    } finally {
      submitGuardRef.current = false;
    }
  };

  const handleReviewCta = () => {
    Alert.alert(
      'Đánh giá người bán',
      'Tính năng đánh giá sau giao dịch sẽ sớm có mặt.',
    );
  };

  const toggleCheckedItem = (itemId: string) => {
    triggerLightHaptic();
    setCheckedItemIds((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const checkAllItems = (itemIds: string[]) => {
    triggerLightHaptic();
    const next: Record<string, boolean> = {};
    itemIds.forEach((id) => {
      next[id] = true;
    });
    setCheckedItemIds(next);
  };

  if (detailNotFound || (!transactionId && !detail)) {
    return (
      <View style={styles.centerPage} testID="transaction-not-found">
        <EmptyState
          icon="eye-off"
          title="Không tìm thấy giao dịch"
          subtitle="Giao dịch này không tồn tại hoặc bạn không thuộc hai bên tham gia giao dịch."
          primaryActionLabel="Về danh sách giao dịch"
          onPrimaryAction={() => navigation.navigate('Transactions')}
        />
      </View>
    );
  }

  if (detailLoading && !detail) {
    return <TransactionDetailSkeleton testID="transaction-detail-loading" />;
  }

  if (detailError && !detail) {
    return (
      <View style={styles.centerPage} testID="transaction-detail-error">
        <View style={styles.errorWrap}>
          <InlineBanner
            tone="danger"
            title="Không thể tải giao dịch"
            message={detailError}
            actionLabel="Thử lại"
            actionTestID="transaction-retry-btn"
            onActionPress={() => void handleRefresh(false)}
          />
        </View>
      </View>
    );
  }

  if (!detail) return null;

  const statusMeta = TRANSACTION_STATUS_META[detail.status] ?? TRANSACTION_STATUS_META.GIU_CHO;
  const rolePill = getViewerRolePill(detail.viewerRole);
  const isSeller = detail.viewerRole === 'SELLER';
  const isBuyer = detail.viewerRole === 'BUYER';
  const isModeratorOrAdmin =
    detail.viewerRole === 'MODERATOR' || detail.viewerRole === 'SENIOR_ADMIN';
  const isWaitingConfirm = detail.status === 'CHO_XAC_NHAN';
  const isEscalated = detail.status === 'CHO_XU_LY';
  const isCompleted = detail.status === 'HOAN_TAT';
  const isCancelled = detail.status === 'HUY';
  const isDelivering = detail.status === 'DANG_GIAO';

  const otp = detail.otp;
  const isOtpExhausted = otp?.status === 'EXHAUSTED' || otp?.remainingAttempts === 0;
  const isOtpExpired =
    otp?.status === 'EXPIRED' || (otp?.status === 'ACTIVE' && otpClientExpired);
  const isOtpActive = Boolean(otp && otp.status === 'ACTIVE' && !otpClientExpired && !isOtpExhausted);

  const canBuyerSubmitOtp = Boolean(
    isBuyer &&
      detail.actions.canVerifyOtp &&
      isOtpActive &&
      otpInput.replace(/\D/g, '').length === 6 &&
      !submitting &&
      !isLockedAccount,
  );

  const showBuyerOtpWorkbench = Boolean(
    isBuyer &&
      (isWaitingConfirm || (isEscalated && (detail.actions.canVerifyOtp || detail.actions.canReissueOtp))),
  );
  const showSellerWaitingWorkbench = Boolean(isSeller && (isWaitingConfirm || isEscalated));
  const canInspectChecklist = Boolean(
    !isLockedAccount &&
      detail.items.length > 0 &&
      ((isDelivering && isSeller) || (showBuyerOtpWorkbench && isBuyer)),
  );
  const checkedCount = detail.items.filter((item) => checkedItemIds[item.id]).length;
  const allItemsChecked = detail.items.length > 0 && checkedCount === detail.items.length;

  const appointmentStr = formatTransactionDateTime(detail.appointmentAt);
  const escalateStr = formatTransactionDateTime(detail.autoEscalateAt);
  const completedStr = formatTransactionDateTime(detail.completedAt);
  const cancelledStr = formatTransactionDateTime(detail.cancelledAt);
  const shortDealCode = detail.id.slice(0, 8).toUpperCase();
  const bottomPad = Math.max(insets?.bottom ?? 0, primitive.space[8]) + primitive.space[4];

  const sellerParty = detail.seller ?? (!isSeller ? detail.counterparty : null);
  const buyerParty = detail.buyer ?? (isSeller ? detail.counterparty : null);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        testID="transaction-detail-screen"
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={detailLoading}
            onRefresh={() => void handleRefresh(false)}
            tintColor={semantic.color.accent}
            colors={[semantic.color.accent]}
          />
        }
      >
        {/* Top Critical Alerts: Restriction, Version Conflict, Action Error */}
        {visibleRestriction || versionConflictMsg || actionError ? (
          <View style={styles.topAlerts}>
            {visibleRestriction ? <RestrictedAccountNotice /> : null}
            {versionConflictMsg ? (
              <InlineBanner
                testID="transaction-version-conflict-banner"
                tone="warning"
                title="Trạng thái giao dịch đã thay đổi"
                message={versionConflictMsg}
                actionLabel="Tải lại giao dịch"
                actionTestID="transaction-conflict-reload-btn"
                onActionPress={() => void handleRefresh(false)}
              />
            ) : null}
            {actionError ? (
              <InlineBanner testID="transaction-action-error" tone="danger" message={actionError} />
            ) : null}
          </View>
        ) : null}

        {/* 1. Terminal Settlement Receipt (HOAN_TAT) or Cancellation Summary (HUY) */}
        {isCompleted ? (
          <>
            <View style={styles.receiptCard} testID="transaction-completed-receipt">
              <View style={styles.receiptTopBandSuccess} />
              <View style={styles.receiptInner}>
                <View style={styles.receiptSealSuccess}>
                  <Icon name="check-circle" size={26} color={semantic.color.success} />
                </View>
                <Text style={styles.receiptTitle}>Giao dịch hoàn tất</Text>
                <Text style={styles.receiptSubtitle}>
                  {completedStr ? `Xác nhận lúc ${completedStr}` : 'Đã xác nhận bàn giao thành công'}
                </Text>

                <View style={styles.receiptPriceWrap}>
                  <Text style={styles.receiptPrice}>{formatVnd(detail.agreedPriceVnd)}</Text>
                </View>

                <View style={styles.receiptLedger}>
                  <View style={styles.ledgerRow}>
                    <Text style={styles.ledgerLabel}>Mã giao dịch</Text>
                    <Text style={styles.ledgerValue}>#{shortDealCode}</Text>
                  </View>
                  <HairlineDivider />
                  {sellerParty ? (
                    <>
                      <View style={styles.ledgerRow}>
                        <Text style={styles.ledgerLabel}>Người bán</Text>
                        <Text style={styles.ledgerValue}>{sellerParty.displayName}</Text>
                      </View>
                      <HairlineDivider />
                    </>
                  ) : null}
                  {buyerParty ? (
                    <>
                      <View style={styles.ledgerRow}>
                        <Text style={styles.ledgerLabel}>Người mua</Text>
                        <Text style={styles.ledgerValue}>{buyerParty.displayName}</Text>
                      </View>
                      <HairlineDivider />
                    </>
                  ) : null}
                  <View style={styles.ledgerRow}>
                    <Text style={styles.ledgerLabel}>Đồ vật bàn giao</Text>
                    <Text style={styles.ledgerValue}>{detail.items.length || 1} món · Đã chuyển giao</Text>
                  </View>
                </View>

                <View style={styles.receiptCtaRow}>
                  {isBuyer ? (
                    <Pressable
                      testID="completed-review-cta"
                      onPress={handleReviewCta}
                      accessibilityRole="button"
                      accessibilityLabel="Đánh giá người bán"
                      style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                    >
                      <Icon name="star" size={16} color={component.button.primaryFg} />
                      <Text style={styles.primaryBtnText}>Đánh giá người bán</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      testID="completed-seller-listings-cta"
                      onPress={() => navigation.navigate('MyListings')}
                      accessibilityRole="button"
                      accessibilityLabel="Về Tin của tôi"
                      style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                    >
                      <Text style={styles.primaryBtnText}>Về Tin của tôi</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {isCancelled ? (
          <>
            <View style={styles.receiptCard} testID="transaction-cancelled-receipt">
              <View style={styles.receiptTopBandDanger} />
              <View style={styles.receiptInner}>
                <View style={styles.receiptSealDanger}>
                  <Icon name="x" size={24} color={semantic.color.danger} />
                </View>
                <Text style={styles.receiptTitle}>Giao dịch đã hủy</Text>
                {cancelledStr ? (
                  <Text style={styles.receiptSubtitle}>Chốt hủy lúc {cancelledStr}</Text>
                ) : null}

                {detail.cancellationRequest ? (
                  <View style={styles.cancelReceiptDetail}>
                    <View style={styles.ledgerRow}>
                      <Text style={styles.ledgerLabel}>Lý do hủy</Text>
                      <Text style={styles.cancelReceiptReason}>
                        {detail.cancellationRequest.reasonLabel}
                      </Text>
                    </View>
                    {detail.cancellationRequest.reasonNote ? (
                      <Text style={styles.captionText}>
                        Ghi chú yêu cầu: “{detail.cancellationRequest.reasonNote}”
                      </Text>
                    ) : null}
                    {detail.cancellationRequest.responseNote ? (
                      <Text style={styles.captionText}>
                        Phản hồi đồng thuận: “{detail.cancellationRequest.responseNote}”
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                <Text style={styles.receiptMetaNote}>
                  Đồ vật đã được mở lại nếu không thuộc giao dịch khác.
                </Text>

                <View style={styles.receiptCtaRow}>
                  <Pressable
                    testID="cancelled-back-transactions-cta"
                    onPress={() => navigation.navigate('Transactions')}
                    accessibilityRole="button"
                    accessibilityLabel="Về danh sách giao dịch"
                    style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryBtnText}>Về danh sách giao dịch</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {/* 2. Elevated Hero Handover Pass (Unified Status + Stepper + Deal + Dorm Spot + Parties + Checklist) */}
        <View style={styles.heroPass} testID="transaction-deal-context">
          <View style={styles.statusHeaderRow}>
            <StatusIndicator
              testID="tx-detail-status-badge"
              variant={statusMeta.variant}
              tone={statusMeta.tone}
              label={statusMeta.label}
            />
            <StatusIndicator
              testID="tx-detail-role-badge"
              variant="soft"
              tone={rolePill.tone}
              label={rolePill.label}
            />
          </View>

          <TransactionStepper
            status={detail.status}
            hasHandoverProof={Boolean(detail.handoverProof)}
          />

          <HairlineDivider />

          <Pressable
            onPress={() => {
              if (detail.listing.id) {
                navigation.navigate('Listing', { id: detail.listing.id });
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`Xem tin đăng ${detail.listing.title}`}
            style={({ pressed }) => [styles.listingRow, pressed && styles.pressed]}
          >
            {detail.listing.thumbnailUrl ? (
              <Image
                source={buildMediaImageSource(detail.listing.thumbnailUrl, null)}
                style={styles.listingThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.listingThumbPlaceholder}>
                <Icon name="package" size={22} color={semantic.color.textSecondary} />
              </View>
            )}
            <View style={styles.listingMeta}>
              <Text style={styles.listingTitle} numberOfLines={2}>
                {detail.listing.title}
              </Text>
              <View style={styles.priceRow}>
                <View style={detail.isFree ? styles.freePriceBadge : undefined}>
                  <Text
                    testID="tx-agreed-price"
                    style={[styles.agreedPrice, detail.isFree && styles.agreedPriceFree]}
                  >
                    {formatVnd(detail.agreedPriceVnd)}
                  </Text>
                </View>
                {detail.listing.isCombo ? (
                  <StatusIndicator
                    variant="soft"
                    tone="accent"
                    label={`Combo · ${detail.items.length || 2} món`}
                  />
                ) : null}
              </View>
            </View>
            <Icon name="chevron-right" size={16} color={semantic.color.textSecondary} />
          </Pressable>

          {/* 2-Pill Dorm Appointment Strip */}
          {detail.appointmentLocation || appointmentStr ? (
            <View style={styles.appointmentStrip} testID="tx-appointment-strip">
              {detail.appointmentLocation ? (
                <View style={styles.appointmentPill}>
                  <Icon name="map-pin" size={13} color={semantic.color.accent} />
                  <View style={styles.appointmentPillTextWrap}>
                    <Text style={styles.appointmentPillLabel}>Điểm hẹn</Text>
                    <Text style={styles.appointmentPillValue} numberOfLines={1}>
                      {detail.appointmentLocation}
                    </Text>
                  </View>
                </View>
              ) : null}
              {appointmentStr ? (
                <View style={styles.appointmentPill}>
                  <Icon name="clock" size={13} color={semantic.color.accent} />
                  <View style={styles.appointmentPillTextWrap}>
                    <Text style={styles.appointmentPillLabel}>Lịch hẹn</Text>
                    <Text style={[styles.appointmentPillValue, styles.tabular]} numberOfLines={1}>
                      {appointmentStr}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          <HairlineDivider />

          {/* Counterparty / Dual-Party Identity Strip (Zero-PII) */}
          {isModeratorOrAdmin ? (
            <View style={styles.dualPartyStack} testID="tx-moderator-parties">
              {sellerParty ? (
                <PartyIdentityRow
                  roleLabel="Người bán"
                  party={sellerParty}
                  rowTestID="tx-seller-party"
                  nameTestID="tx-counterparty-name"
                />
              ) : null}
              {sellerParty && buyerParty ? <HairlineDivider /> : null}
              {buyerParty ? (
                <PartyIdentityRow
                  roleLabel="Người mua"
                  party={buyerParty}
                  rowTestID="tx-buyer-party"
                />
              ) : null}
            </View>
          ) : (
            <PartyIdentityRow
              roleLabel={isSeller ? 'Người mua' : 'Người bán'}
              party={detail.counterparty}
              nameTestID="tx-counterparty-name"
            />
          )}

          {/* Practical Dorm Combo & Item Inspection Checklist */}
          {detail.items.length > 0 ? (
            <>
              <HairlineDivider />
              <View style={styles.itemsList} testID="tx-items-section">
                <View style={styles.itemsHeaderRow}>
                  <Text style={styles.subLabel}>
                    {canInspectChecklist
                      ? `Kiểm tra đồ bàn giao (${detail.items.length})`
                      : `Đồ vật trong giao dịch (${detail.items.length})`}
                  </Text>
                  {canInspectChecklist ? (
                    <View style={styles.checklistHeaderRight}>
                      <View
                        testID="item-checklist-progress"
                        style={[
                          styles.checkProgressPill,
                          allItemsChecked && styles.checkProgressPillDone,
                        ]}
                      >
                        <Text
                          style={[
                            styles.checkProgressText,
                            allItemsChecked && styles.checkProgressTextDone,
                          ]}
                        >
                          Đã kiểm tra {checkedCount}/{detail.items.length} món
                        </Text>
                      </View>
                      {detail.items.length > 1 && !allItemsChecked ? (
                        <Pressable
                          testID="item-checklist-check-all"
                          onPress={() => checkAllItems(detail.items.map((entry) => entry.id))}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="Đánh dấu đã kiểm tra đủ tất cả đồ vật"
                          style={({ pressed }) => [styles.checkAllBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.checkAllText}>Đánh dấu đủ</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                {detail.items.map((item, idx) => {
                  const meta = getItemStatusMeta(item.status);
                  const isChecked = Boolean(checkedItemIds[item.id]);

                  if (canInspectChecklist) {
                    return (
                      <Fragment key={item.id}>
                        {idx > 0 ? <HairlineDivider /> : null}
                        <Pressable
                          testID={`tx-item-${item.id}`}
                          onPress={() => toggleCheckedItem(item.id)}
                          accessibilityRole="checkbox"
                          accessibilityLabel={`Kiểm tra ${item.name}`}
                          accessibilityState={{ checked: isChecked }}
                          style={({ pressed }) => [
                            styles.checkItemRow,
                            isChecked && styles.checkItemRowDone,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View
                            style={[
                              styles.checkSquare,
                              isChecked && styles.checkSquareDone,
                            ]}
                          >
                            {isChecked ? (
                              <Icon name="check" size={13} color={semantic.color.textInverse} />
                            ) : null}
                          </View>
                          <View style={styles.itemTextWrap}>
                            <Text
                              style={[styles.itemName, isChecked && styles.itemNameChecked]}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                            {item.condition ? (
                              <Text style={styles.captionText} numberOfLines={1}>
                                {item.condition}
                              </Text>
                            ) : null}
                          </View>
                          <StatusIndicator variant="dot" tone={meta.tone} label={meta.label} />
                        </Pressable>
                      </Fragment>
                    );
                  }

                  return (
                    <Fragment key={item.id}>
                      {idx > 0 ? <HairlineDivider /> : null}
                      <View style={styles.itemRow} testID={`tx-item-${item.id}`}>
                        <View style={styles.itemTextWrap}>
                          <Text style={styles.itemName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {item.condition ? (
                            <Text style={styles.captionText} numberOfLines={1}>
                              {item.condition}
                            </Text>
                          ) : null}
                        </View>
                        <StatusIndicator variant="dot" tone={meta.tone} label={meta.label} />
                      </View>
                    </Fragment>
                  );
                })}
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.sectionGap} />

        {/* 3. Escalation Banner (CHO_XU_LY) */}
        {isEscalated ? (
          <>
            <View style={styles.section} testID="transaction-escalated-section">
              <InlineBanner
                tone="warning"
                title="Đang chờ kiểm duyệt xem xét"
                message={
                  detail.escalationReason
                    ? `${ESCALATION_REASON_LABELS[detail.escalationReason]}. Đồ vật vẫn được giữ trong lúc chờ kết quả.`
                    : 'Đồ vật vẫn được giữ trong lúc chờ kết quả kiểm duyệt.'
                }
              />
            </View>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {/* 4. Pending / Rejected Cancellation Request Card */}
        {detail.cancellationRequest &&
        (detail.cancellationRequest.status === 'CHO_XAC_NHAN' ||
          detail.cancellationRequest.status === 'TU_CHOI') ? (
          <>
            <View style={styles.section}>
              <CancelConsentCard
                request={detail.cancellationRequest}
                canRespond={detail.actions.canRespondCancel && !isLockedAccount}
                hasHandoverProof={Boolean(detail.handoverProof)}
                onInspectProof={() => setExternalLightboxOpen(true)}
                onRespond={handleCancelRespond}
                submitting={submitting}
                error={cancelError || undefined}
              />
            </View>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {/* 5. Pre-delivery States (YEU_CAU / GIU_CHO) */}
        {detail.status === 'YEU_CAU' || detail.status === 'GIU_CHO' ? (
          <>
            <View style={styles.section}>
              <InlineBanner
                tone="neutral"
                title="Chưa đến bước bàn giao"
                message={
                  detail.status === 'GIU_CHO'
                    ? 'Đang chờ người bán bắt đầu giao hàng.'
                    : 'Đang chờ người bán phản hồi giữ chỗ.'
                }
              />
            </View>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {/* 6. DANG_GIAO — Seller Handover Workbench */}
        {isDelivering && isSeller ? (
          <>
            <View style={styles.section} testID="seller-handover-workbench">
              <SectionHeading title="Báo đã giao" />

              {isLockedAccount ? (
                <InlineBanner
                  tone="danger"
                  message="Tài khoản đang bị hạn chế nên không thể báo đã giao."
                />
              ) : (
                <>
                  <HandoverPhotoUploader
                    photos={pickedPhotos}
                    onChange={(next) => {
                      setPickedPhotos(next);
                      if (next.length > 0) setPhotoValidationError('');
                    }}
                    disabled={submitting || !detail.actions.canReportDelivered}
                    error={photoValidationError}
                    isCombo={detail.listing.isCombo}
                    onFeedback={(msg) => showToast(msg, 'info')}
                  />

                  <FormField
                    testID="handover-note-input"
                    label="Ghi chú (không bắt buộc)"
                    placeholder="VD: Đã giao tại sảnh KTX Khu A"
                    multiline
                    maxLength={500}
                    value={handoverNote}
                    onChangeText={setHandoverNote}
                    editable={!submitting && detail.actions.canReportDelivered}
                    helperText={`${handoverNote.trim().length}/500 ký tự`}
                  />

                  <Pressable
                    testID="report-delivered-btn"
                    disabled={submitting || !detail.actions.canReportDelivered}
                    onPress={handleDeliverPress}
                    accessibilityRole="button"
                    accessibilityLabel="Báo đã giao"
                    accessibilityState={{
                      disabled: submitting || !detail.actions.canReportDelivered,
                      busy: submitting,
                    }}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      (submitting || !detail.actions.canReportDelivered) && styles.disabled,
                      pressed && !submitting && detail.actions.canReportDelivered && styles.primaryBtnPressed,
                    ]}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color={component.button.primaryFg} />
                    ) : (
                      <Icon name="send" size={16} color={component.button.primaryFg} />
                    )}
                    <Text style={styles.primaryBtnText}>
                      {submitting ? 'Đang gửi…' : 'Báo đã giao'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {/* 7. DANG_GIAO — Buyer Waiting State */}
        {isDelivering && isBuyer ? (
          <>
            <View style={styles.section} testID="buyer-delivering-waiting">
              <InlineBanner
                tone="neutral"
                icon="clock"
                title="Người bán đang giao hàng"
                message="Khi gặp mặt nhận đồ, người bán sẽ báo đã giao và mã xác nhận sẽ hiện tại đây."
              />
            </View>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {/* 8. Handover Proof Photo Card (Authorized Private Viewer) */}
        {detail.handoverProof ? (
          <>
            <View style={styles.section}>
              <HandoverProofCard
                proof={detail.handoverProof}
                canViewPhoto={detail.actions.canViewHandoverPhoto}
                externalLightboxOpen={externalLightboxOpen}
                onExternalLightboxClose={() => setExternalLightboxOpen(false)}
              />
            </View>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {/* 9. Buyer Verification Card (Fintech-Grade Clean Surface) */}
        {showBuyerOtpWorkbench ? (
          <>
            <View
              style={styles.otpWorkbenchSection}
              testID="buyer-otp-workbench"
              onLayout={(event) => {
                otpSectionYRef.current = event.nativeEvent.layout.y;
              }}
            >
              {/* Top Header Row + Crisp Draining Progress Bar */}
              {otp ? (
                <CountdownPill
                  expiresAt={otp.expiresAt}
                  clockOffsetMs={detail.clockOffsetMs}
                  ttlSeconds={otp.ttlSeconds}
                  showProgressBar
                  inactiveLabel={
                    isOtpExhausted
                      ? 'Đã khóa'
                      : otp.status === 'EXPIRED'
                        ? '00:00 · Hết hạn'
                        : otp.status === 'USED'
                          ? 'Đã xác nhận'
                          : otp.status === 'INVALIDATED'
                            ? 'Đã đổi mã'
                            : undefined
                  }
                  inactiveTone={
                    isOtpExhausted || otp.status === 'EXPIRED' ? 'danger' : 'neutral'
                  }
                  onExpired={() => setOtpClientExpired(true)}
                  headerLeft={
                    <Text style={styles.verifyHeaderTitle} accessibilityRole="header">
                      Xác nhận nhận hàng
                    </Text>
                  }
                />
              ) : (
                <Text style={styles.verifyHeaderTitle} accessibilityRole="header">
                  Xác nhận nhận hàng
                </Text>
              )}

              {/* Compact 1-Row Inline Code Strip */}
              {otp && isOtpActive && otp.inAppCode ? (
                <View style={styles.codeStrip} testID="buyer-inapp-otp-card">
                  <View style={styles.codeStripLeft}>
                    <View style={styles.codeStripIconWrap}>
                      <Icon name="key" size={14} color={semantic.color.accent} />
                    </View>
                    <View style={styles.codeStripTextCol}>
                      <View style={styles.codeStripLabelRow}>
                        <Text style={styles.codeStripLabel} numberOfLines={1}>
                          Mã nhận hàng
                        </Text>
                        {otp.reissueCount > 0 ? (
                          <View style={styles.reissueCountPill} testID="otp-reissue-count-badge">
                            <Text style={styles.reissueCountText}>Lần {otp.reissueCount}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        selectable
                        testID="buyer-inapp-otp-code"
                        style={styles.codeStripDigits}
                        numberOfLines={1}
                      >
                        {hideInAppCode ? '••• · •••' : formatOtpDisplay(otp.inAppCode)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.codeStripActions}>
                    <Pressable
                      testID="toggle-inapp-otp-visibility"
                      onPress={() => setHideInAppCode((prev) => !prev)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={hideInAppCode ? 'Hiện mã nhận hàng' : 'Ẩn mã nhận hàng'}
                      style={({ pressed }) => [styles.codeStripEyeBtn, pressed && styles.pressed]}
                    >
                      <Icon
                        name={hideInAppCode ? 'eye' : 'eye-off'}
                        size={15}
                        color={semantic.color.textSecondary}
                      />
                    </Pressable>

                    <Pressable
                      testID="autofill-inapp-otp-btn"
                      disabled={submitting || isLockedAccount || !detail.actions.canVerifyOtp}
                      onPress={() => handleAutoFillInAppCode(otp.inAppCode!)}
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityLabel="Điền nhanh mã nhận hàng"
                      style={({ pressed }) => [
                        styles.codeStripFillBtn,
                        (submitting || isLockedAccount || !detail.actions.canVerifyOtp) &&
                          styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Icon name="zap" size={13} color={semantic.color.accentDeep} />
                      <Text style={styles.codeStripFillText} numberOfLines={1}>
                        Điền nhanh
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* Clean 6-Box Input */}
              <View style={styles.otpInputWrap}>
                <OtpCodeInput
                  testID="handover-otp-input"
                  value={otpInput}
                  onChange={(next) => {
                    setOtpInput(next);
                    if (otpVisualStatus === 'error') {
                      setOtpVisualStatus('idle');
                    }
                    if (otpErrorMsg) setOtpErrorMsg('');
                  }}
                  onFocus={handleOtpFocus}
                  disabled={!isOtpActive || !detail.actions.canVerifyOtp || submitting || isLockedAccount}
                  status={otpVisualStatus}
                  errorShakeKey={otpShakeKey}
                />
              </View>

              {/* Quiet Attempts Telemetry */}
              {otp ? (
                <View style={styles.attemptsRow} testID="otp-telemetry-row">
                  <View
                    testID="otp-attempts-badge"
                    style={
                      otp.attemptsUsed > 0 || isOtpExhausted
                        ? [
                            styles.attemptsPill,
                            otp.remainingAttempts <= 2 && styles.attemptsPillWarn,
                            otp.remainingAttempts === 0 && styles.attemptsPillDanger,
                          ]
                        : styles.attemptsQuietRow
                    }
                  >
                    <View
                      style={styles.attemptDotsRow}
                      testID="otp-attempt-dots"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      {Array.from({ length: otp.maxAttempts }, (_, dotIdx) => {
                        const activeDot = dotIdx < otp.remainingAttempts;
                        const dotBg = !activeDot
                          ? semantic.color.borderStrong
                          : otp.attemptsUsed === 0
                            ? semantic.color.borderStrong
                            : otp.remainingAttempts <= 2
                              ? semantic.color.warning
                              : semantic.color.accent;
                        return (
                          <View
                            key={dotIdx}
                            style={[
                              styles.attemptDot,
                              { backgroundColor: dotBg },
                              !activeDot && styles.attemptDotSpent,
                            ]}
                          />
                        );
                      })}
                    </View>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="clip"
                      textBreakStrategy="simple"
                      style={[
                        otp.attemptsUsed === 0 && !isOtpExhausted
                          ? styles.attemptsQuietText
                          : styles.attemptsText,
                        otp.attemptsUsed > 0 && otp.remainingAttempts <= 2 && styles.attemptsTextWarn,
                        otp.remainingAttempts === 0 && styles.attemptsTextDanger,
                      ]}
                    >
                      {otp.attemptsUsed === 0 && !isOtpExhausted
                        ? `${otp.maxAttempts} lượt thử`
                        : `Còn ${otp.remainingAttempts}/${otp.maxAttempts} lượt`}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Concise Error & Recovery Banners */}
              {otpErrorMsg ? (
                <InlineBanner testID="otp-error-banner" tone="danger" message={otpErrorMsg} />
              ) : null}

              {isOtpExhausted ? (
                <InlineBanner
                  testID="otp-exhausted-banner"
                  tone="danger"
                  message="Đã nhập sai 5/5 lượt. Hãy gửi lại mã mới — giữ chỗ vẫn được giữ nguyên."
                />
              ) : isOtpExpired ? (
                <InlineBanner
                  testID="otp-expired-banner"
                  tone="warning"
                  message="Mã đã hết hạn. Hãy gửi lại mã mới — giữ chỗ vẫn được giữ nguyên."
                />
              ) : null}

              {/* Primary CTA & Subtle Secondary Reissue Link */}
              {isOtpExhausted || isOtpExpired ? (
                detail.actions.canReissueOtp && !isLockedAccount ? (
                  <Pressable
                    testID="otp-reissue-btn"
                    disabled={submitting}
                    onPress={() => void handleReissueOtp()}
                    accessibilityRole="button"
                    accessibilityLabel="Gửi lại mã"
                    accessibilityState={{ disabled: submitting, busy: submitting }}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      submitting && styles.disabled,
                      pressed && !submitting && styles.primaryBtnPressed,
                    ]}
                  >
                    <Icon name="refresh-cw" size={16} color={component.button.primaryFg} />
                    <Text style={styles.primaryBtnText}>
                      {submitting ? 'Đang gửi lại…' : 'Gửi lại mã'}
                    </Text>
                  </Pressable>
                ) : null
              ) : (
                <>
                  <Pressable
                    testID="otp-confirm-submit-btn"
                    disabled={!canBuyerSubmitOtp}
                    onPress={() => void handleOtpSubmit()}
                    accessibilityRole="button"
                    accessibilityLabel="Xác nhận đã nhận hàng"
                    accessibilityState={{ disabled: !canBuyerSubmitOtp, busy: submitting }}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      !canBuyerSubmitOtp && styles.disabled,
                      pressed && canBuyerSubmitOtp && styles.primaryBtnPressed,
                    ]}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color={component.button.primaryFg} />
                    ) : (
                      <Icon name="check-circle" size={17} color={component.button.primaryFg} />
                    )}
                    <Text style={styles.primaryBtnText}>
                      {submitting ? 'Đang xác nhận…' : 'Xác nhận đã nhận hàng'}
                    </Text>
                  </Pressable>

                  {detail.actions.canReissueOtp && !isLockedAccount ? (
                    <Pressable
                      testID="otp-reissue-btn"
                      disabled={submitting}
                      onPress={() => void handleReissueOtp()}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Gửi lại mã"
                      style={({ pressed }) => [
                        styles.ghostBtn,
                        submitting && styles.disabled,
                        pressed && !submitting && styles.pressed,
                      ]}
                    >
                      <Icon name="refresh-cw" size={14} color={semantic.color.accent} />
                      <Text style={styles.ghostBtnText}>Gửi lại mã</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {/* 10. Seller Waiting Card (CHO_XAC_NHAN / CHO_XU_LY) */}
        {showSellerWaitingWorkbench ? (
          <>
            <View style={styles.section} testID="seller-waiting-telemetry">
              <View style={styles.sellerHeaderRow}>
                <Text style={styles.verifyHeaderTitle} accessibilityRole="header">
                  Chờ người mua xác nhận
                </Text>
                <Pressable
                  testID="seller-refresh-status-btn"
                  disabled={detailLoading || submitting}
                  onPress={() => void handleRefresh(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Làm mới trạng thái"
                  style={({ pressed }) => [
                    styles.compactRefreshBtn,
                    (detailLoading || submitting) && styles.disabled,
                    pressed && !detailLoading && !submitting && styles.pressed,
                  ]}
                >
                  <Icon name="refresh-cw" size={13} color={semantic.color.accent} />
                  <Text style={styles.compactRefreshText} numberOfLines={1}>
                    {detailLoading ? 'Đang tải…' : 'Làm mới'}
                  </Text>
                </Pressable>
              </View>

              {otp ? (
                <CountdownPill
                  expiresAt={otp.expiresAt}
                  clockOffsetMs={detail.clockOffsetMs}
                  ttlSeconds={otp.ttlSeconds}
                  showProgressBar
                  inactiveLabel={
                    isOtpExhausted
                      ? 'Đã khóa (5/5 lượt)'
                      : otp.status === 'EXPIRED'
                        ? '00:00 · Hết hạn'
                        : otp.status === 'USED'
                          ? 'Đã xác nhận'
                          : otp.status === 'INVALIDATED'
                            ? 'Đã đổi mã'
                            : undefined
                  }
                  inactiveTone={
                    isOtpExhausted || otp.status === 'EXPIRED' ? 'danger' : 'neutral'
                  }
                  onExpired={() => {
                    setOtpClientExpired(true);
                    if (
                      transactionId &&
                      !submitGuardRef.current &&
                      otp.status === 'ACTIVE' &&
                      sellerExpiredSyncedOtpIdRef.current !== otp.id
                    ) {
                      sellerExpiredSyncedOtpIdRef.current = otp.id;
                      void loadDetail(transactionId).catch(() => {});
                    }
                  }}
                  headerRight={
                    otp.attemptsUsed > 0 ? (
                      <View style={styles.attemptsPill} testID="seller-otp-attempts">
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="clip"
                          textBreakStrategy="simple"
                          style={styles.attemptsText}
                        >
                          Sai {otp.attemptsUsed}/{otp.maxAttempts} lượt
                        </Text>
                      </View>
                    ) : undefined
                  }
                />
              ) : null}

              {/* Concise 1-Line 24h Auto-Escalation Note */}
              {escalateStr && isWaitingConfirm ? (
                <View style={styles.escalationRow} testID="seller-24h-escalation-notice">
                  <Icon name="clock" size={13} color={semantic.color.warning} />
                  <Text style={styles.escalationRowText} testID="seller-24h-countdown-text">
                    {escalateRemainingSec !== null && escalateRemainingSec > 0
                      ? `Tự động chuyển hỗ trợ sau ${formatEscalationCountdown(escalateRemainingSec)} nếu chưa xác nhận.`
                      : 'Đã quá 24 giờ — chuyển đội kiểm duyệt xem xét.'}
                  </Text>
                </View>
              ) : null}

              {/* Reissue CTA shown only when permitted or expired/exhausted */}
              {(detail.actions.canReissueOtp ||
                (isWaitingConfirm && (isOtpExpired || isOtpExhausted))) &&
              !isLockedAccount ? (
                <Pressable
                  testID="seller-otp-reissue-btn"
                  disabled={submitting}
                  onPress={() => void handleReissueOtp()}
                  accessibilityRole="button"
                  accessibilityLabel="Gửi lại mã"
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    submitting && styles.disabled,
                    pressed && !submitting && styles.pressed,
                  ]}
                >
                  <Icon name="refresh-cw" size={15} color={semantic.color.textPrimary} />
                  <Text style={styles.secondaryBtnText} numberOfLines={1}>
                    {submitting ? 'Đang gửi…' : 'Gửi lại mã'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {/* 11. Subtle Single-Row Post-Delivery Cancel Trigger */}
        {detail.actions.canRequestCancel &&
        !isLockedAccount &&
        detail.cancellationRequest?.status !== 'CHO_XAC_NHAN' ? (
          <>
            <Pressable
              testID="open-cancel-request-btn"
              disabled={submitting}
              onPress={() => {
                setCancelError('');
                setCancelSheetOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Gặp vấn đề? Yêu cầu hủy"
              style={({ pressed }) => [
                styles.cancelCompactRow,
                submitting && styles.disabled,
                pressed && !submitting && styles.cancelCompactRowPressed,
              ]}
            >
              <View style={styles.cancelCompactLeft}>
                <Icon name="alert-triangle" size={15} color={semantic.color.danger} />
                <Text style={styles.cancelCompactPrompt}>
                  Gặp vấn đề?{' '}
                  <Text style={styles.cancelCompactLink}>Yêu cầu hủy</Text>
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={semantic.color.textSecondary} />
            </Pressable>
            <View style={styles.sectionGap} />
          </>
        ) : null}

        {/* 12. Zero-PII Audit Timeline */}
        {detail.timeline.length > 0 ? (
          <View style={styles.section}>
            <TransactionTimeline events={detail.timeline} />
          </View>
        ) : null}
      </ScrollView>

      {/* Floating Editorial Toast (Lucian #435) — stays mounted to preserve useReduceMotion */}
      <Toast
        triggerKey={toast?.seq ?? 0}
        visible={Boolean(toast)}
        message={toast?.message ?? ''}
        tone={toast?.tone ?? 'success'}
        onDismiss={() => setToast(null)}
        testID="transaction-action-success"
      />

      {/* Seller Deliver Confirmation Guard Sheet */}
      <BottomSheet
        visible={deliverConfirmOpen}
        onClose={() => {
          if (!submitting) setDeliverConfirmOpen(false);
        }}
        title="Xác nhận báo đã giao"
        subtitle={`Đính kèm ${pickedPhotos.length} ảnh bàn giao`}
        testID="report-delivered-confirm-sheet"
        footerSlot={
          <View style={styles.sheetFooterRow}>
            <Pressable
              testID="report-delivered-cancel-btn"
              disabled={submitting}
              onPress={() => setDeliverConfirmOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Kiểm tra lại"
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.sheetFlex1,
                submitting && styles.disabled,
                pressed && !submitting && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryBtnText} numberOfLines={1}>
                Kiểm tra lại
              </Text>
            </Pressable>
            <Pressable
              testID="report-delivered-confirm-btn"
              disabled={submitting}
              onPress={() => void confirmReportDelivered()}
              accessibilityRole="button"
              accessibilityLabel="Xác nhận đã giao"
              accessibilityState={{ disabled: submitting, busy: submitting }}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.sheetFlex15,
                submitting && styles.disabled,
                pressed && !submitting && styles.primaryBtnPressed,
              ]}
            >
              <Text style={styles.primaryBtnText} numberOfLines={1}>
                {submitting ? 'Đang gửi…' : 'Xác nhận đã giao'}
              </Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.sheetBody}>
          <InlineBanner
            tone="warning"
            message="Hệ thống sẽ gửi mã xác nhận cho người mua. Muốn hủy sau bước này cần hai bên đồng ý."
          />
          {handoverNote.trim() ? (
            <View style={styles.confirmNotePreview}>
              <Text style={styles.subLabel}>Ghi chú đính kèm</Text>
              <Text style={styles.bodyText}>“{handoverNote.trim()}”</Text>
            </View>
          ) : null}
        </View>
      </BottomSheet>

      {/* Cancellation Request Sheet */}
      <CancelRequestSheet
        visible={cancelSheetOpen}
        onClose={() => setCancelSheetOpen(false)}
        onSubmit={handleCancelSubmit}
        submitting={submitting}
        error={cancelError || undefined}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.color.bgCanvas,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  centerPage: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: semantic.spacing.section,
  },
  errorWrap: {
    width: '100%',
    maxWidth: 420,
  },
  topAlerts: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    paddingBottom: primitive.space[2],
    gap: primitive.space[2],
  },
  heroPass: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
    borderBottomWidth: 1,
    borderBottomColor: semantic.color.borderHairline,
  },
  section: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
  },
  otpWorkbenchSection: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
    borderTopWidth: 2,
    borderTopColor: semantic.color.accentBorder,
  },
  sectionGap: {
    height: primitive.space[2],
    backgroundColor: semantic.color.bgCanvas,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  receiptCard: {
    backgroundColor: semantic.color.bgSurface,
    overflow: 'hidden',
  },
  receiptTopBandSuccess: {
    height: 4,
    backgroundColor: semantic.color.success,
  },
  receiptTopBandDanger: {
    height: 4,
    backgroundColor: semantic.color.danger,
  },
  receiptInner: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[5],
    alignItems: 'center',
    gap: primitive.space[2],
  },
  receiptSealSuccess: {
    width: 52,
    height: 52,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: primitive.space[1],
  },
  receiptSealDanger: {
    width: 50,
    height: 50,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: primitive.space[1],
  },
  receiptTitle: {
    ...semantic.type.screenTitle,
    fontSize: primitive.fontSize.lg,
    textAlign: 'center',
  },
  receiptSubtitle: {
    ...semantic.type.caption,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  receiptPriceWrap: {
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.successSoft,
    marginVertical: primitive.space[1],
  },
  receiptPrice: {
    ...semantic.type.price,
    fontSize: primitive.fontSize.xl,
    color: semantic.color.success,
  },
  receiptLedger: {
    width: '100%',
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.lg,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
    gap: primitive.space[2],
    marginTop: primitive.space[1],
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  ledgerLabel: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  ledgerValue: {
    ...semantic.type.label,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 1,
  },
  receiptMetaNote: {
    ...semantic.type.micro,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 340,
    marginTop: primitive.space[1],
  },
  receiptCtaRow: {
    width: '100%',
    marginTop: primitive.space[2],
  },
  cancelReceiptDetail: {
    width: '100%',
    backgroundColor: semantic.color.dangerSoft,
    borderRadius: primitive.radius.lg,
    padding: primitive.space[3],
    gap: primitive.space[1.5],
    marginTop: primitive.space[1],
  },
  cancelReceiptReason: {
    ...semantic.type.label,
    color: semantic.color.danger,
    flexShrink: 1,
    textAlign: 'right',
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
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingMeta: {
    flex: 1,
    gap: 5,
  },
  listingTitle: {
    ...semantic.type.cardTitle,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  agreedPrice: {
    ...semantic.type.price,
    color: semantic.color.accent,
  },
  freePriceBadge: {
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: 2,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.freeBg,
  },
  agreedPriceFree: {
    color: semantic.color.freeFg,
    fontSize: primitive.fontSize.sm,
  },
  appointmentStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  appointmentPill: {
    flexGrow: 1,
    flexBasis: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[2],
  },
  appointmentPillTextWrap: {
    flex: 1,
    gap: 1,
  },
  appointmentPillLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
  },
  appointmentPillValue: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
  dualPartyStack: {
    gap: primitive.space[2.5],
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  partyAvatar: {
    width: 38,
    height: 38,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyAvatarText: {
    fontSize: primitive.fontSize.sm,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.accentDeep,
  },
  partyBody: {
    flex: 1,
    gap: 1,
  },
  partyEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    color: semantic.color.textSecondary,
  },
  partyName: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  trustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: primitive.space[2],
    paddingVertical: 4,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
  },
  trustPillHigh: {
    backgroundColor: semantic.color.successSoft,
  },
  trustPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  trustPillTextHigh: {
    color: semantic.color.success,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  itemsList: {
    gap: primitive.space[2],
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  checklistHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    flexWrap: 'wrap',
  },
  checkProgressPill: {
    paddingHorizontal: primitive.space[2],
    paddingVertical: 3,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgTrack,
  },
  checkProgressPillDone: {
    backgroundColor: semantic.color.successSoft,
  },
  checkProgressText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  checkProgressTextDone: {
    color: semantic.color.success,
  },
  checkAllBtn: {
    paddingHorizontal: primitive.space[2],
    paddingVertical: 3,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
  },
  checkAllText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.accent,
  },
  subLabel: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textSecondary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
    paddingVertical: primitive.space[1],
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
    paddingVertical: primitive.space[1.5],
    paddingHorizontal: primitive.space[1],
    borderRadius: primitive.radius.md,
  },
  checkItemRowDone: {
    backgroundColor: semantic.color.successSoft,
  },
  checkSquare: {
    width: 22,
    height: 22,
    borderRadius: primitive.radius.sm,
    borderWidth: 1.5,
    borderColor: semantic.color.borderStrong,
    backgroundColor: semantic.color.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSquareDone: {
    borderColor: semantic.color.success,
    backgroundColor: semantic.color.success,
  },
  itemTextWrap: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...semantic.type.label,
  },
  itemNameChecked: {
    color: semantic.color.success,
  },
  captionText: {
    ...semantic.type.caption,
    lineHeight: 19,
  },
  bodyText: {
    ...semantic.type.body,
    fontSize: primitive.fontSize.sm,
  },
  verifyHeaderTitle: {
    ...semantic.type.sectionTitle,
    flex: 1,
  },
  codeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    backgroundColor: semantic.color.bgWarmTint,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
    gap: primitive.space[2],
  },
  codeStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    flex: 1,
    minWidth: 0,
  },
  codeStripIconWrap: {
    width: 28,
    height: 28,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  codeStripTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  codeStripLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  codeStripLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
    flexShrink: 1,
  },
  reissueCountPill: {
    paddingHorizontal: primitive.space[1.5],
    paddingVertical: 1,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
  },
  reissueCountText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.accent,
  },
  codeStripDigits: {
    fontSize: primitive.fontSize.md,
    lineHeight: 20,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1.5,
    color: semantic.color.textPrimary,
  },
  codeStripActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    flexShrink: 0,
  },
  codeStripEyeBtn: {
    width: 32,
    height: 32,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeStripFillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: primitive.space[2.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
  },
  codeStripFillText: {
    ...semantic.type.micro,
    color: semantic.color.accentDeep,
    fontWeight: primitive.fontWeight.bold,
  },
  otpInputWrap: {
    paddingVertical: primitive.space[1],
  },
  attemptsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  attemptsQuietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  attemptsQuietText: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
    flexShrink: 0,
  },
  attemptsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    flexShrink: 0,
    gap: primitive.space[1.5],
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: 4,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
  },
  attemptsPillWarn: {
    backgroundColor: semantic.color.warningSoft,
  },
  attemptsPillDanger: {
    backgroundColor: semantic.color.dangerSoft,
  },
  attemptDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 3,
  },
  attemptDot: {
    width: 5,
    height: 5,
    borderRadius: primitive.radius.full,
  },
  attemptDotSpent: {
    opacity: 0.35,
  },
  attemptsText: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textPrimary,
    flexShrink: 0,
    paddingRight: 2,
  },
  attemptsTextWarn: {
    color: semantic.color.warning,
  },
  attemptsTextDanger: {
    color: semantic.color.danger,
  },
  sellerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  compactRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: primitive.space[2.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
    flexShrink: 0,
  },
  compactRefreshText: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.accentDeep,
  },
  escalationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    backgroundColor: semantic.color.warningSoft,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
  },
  escalationRowText: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.warning,
    fontWeight: primitive.fontWeight.medium,
    flex: 1,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.primaryBg,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    paddingHorizontal: component.button.paddingX,
  },
  secondaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.secondaryFg,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    minHeight: 36,
    paddingHorizontal: primitive.space[3],
    alignSelf: 'center',
  },
  ghostBtnText: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  cancelCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[3],
    gap: primitive.space[2],
  },
  cancelCompactRowPressed: {
    backgroundColor: semantic.color.bgSubtle,
  },
  cancelCompactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    flex: 1,
  },
  cancelCompactPrompt: {
    ...semantic.type.caption,
    color: semantic.color.textSecondary,
  },
  cancelCompactLink: {
    ...semantic.type.label,
    color: semantic.color.danger,
  },
  sheetFooterRow: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  sheetFlex1: {
    flex: 1,
  },
  sheetFlex15: {
    flex: 1.4,
  },
  sheetBody: {
    gap: primitive.space[3],
  },
  confirmNotePreview: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    padding: primitive.space[3],
    gap: 4,
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
