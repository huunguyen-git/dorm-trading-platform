import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStack } from '../navigation';
import { ApiError, RestrictedAccountError } from '../api/client';
import { resolveUserRestriction, useSession } from '../auth/session';
import { useChat } from '../chat/store';
import type { ChatMessage, OfferStatus, PendingOutgoingMessage, RestrictionReason } from '../chat/types';
import { Action, Notice, ui } from '../components/AuthUI';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import { colors, radius, space } from '../theme';

const POLL_INTERVAL_MS = 5000;
const EMPTY_PENDING: PendingOutgoingMessage[] = [];
const MAX_OFFER_NOTE_LENGTH = 1000;

type TimelineItem =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'pending'; pending: PendingOutgoingMessage };

function formatChatTime(iso?: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const dd = pad(date.getDate());
  const MM = pad(date.getMonth() + 1);
  return `${hh}:${mm} ${dd}/${MM}`;
}

function parsePositiveIntegerPrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num)) {
    return null;
  }
  return num;
}

function validateOfferAmount(raw: string, listingPrice: number | null): { price?: number; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: 'Vui lòng nhập mức giá đề nghị.' };
  }
  const parsed = parsePositiveIntegerPrice(trimmed);
  if (parsed === null) {
    return {
      error:
        'Mức giá đề nghị phải là số nguyên VND hợp lệ (chỉ nhập chữ số, không dùng dấu chấm hoặc dấu phẩy).',
    };
  }
  if (parsed <= 0) {
    return { error: 'Mức giá đề nghị phải lớn hơn 0 ₫.' };
  }
  if (listingPrice != null && parsed > listingPrice) {
    return {
      error: `Mức giá đề nghị không được cao hơn giá niêm yết (${listingPrice.toLocaleString('vi-VN')} ₫).`,
    };
  }
  return { price: parsed };
}

function getRestrictionMessage(
  reason: RestrictionReason,
  options?: { listingStatus?: string | null; canSendMessage?: boolean },
): string | null {
  switch (reason) {
    case 'COUNTERPARTY_RESTRICTED':
      return 'Tài khoản của đối phương hiện đang bị khóa hoặc hạn chế giao dịch. Tính năng nhắn tin và thương lượng đã bị khóa.';
    case 'LISTING_NOT_AVAILABLE':
      if (options?.canSendMessage) {
        return 'Tin đăng đang được giữ chỗ nên tạm khóa thương lượng giá. Bạn vẫn có thể nhắn tin trao đổi thông thường.';
      }
      return 'Tin đăng không còn ở trạng thái công khai. Lịch sử hội thoại được giữ ở chế độ chỉ đọc.';
    case 'FREE_LISTING_NO_NEGOTIATION':
      return 'Tin đăng cho tặng miễn phí (0đ) không hỗ trợ thương lượng giá. Bạn vẫn có thể nhắn tin trao đổi thông thường.';
    case 'ACCOUNT_RESTRICTED':
      return 'Tài khoản của bạn đang bị khóa hoặc hạn chế giao dịch.';
    default:
      return null;
  }
}

function renderOfferStatusLabel(status: OfferStatus | null): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'DA_DONG_Y':
      return { label: 'Đã đồng ý giá', bg: '#e6f4ea', fg: '#137333' };
    case 'DA_TU_CHOI':
      return { label: 'Đã từ chối', bg: '#fff0ec', fg: colors.danger };
    case 'DA_THAY_THE':
      return { label: 'Đã thay thế', bg: '#f1f3f4', fg: '#5f6368' };
    case 'CHO_PHAN_HOI':
    default:
      return { label: 'Đang chờ phản hồi', bg: '#fef7e0', fg: '#b06000' };
  }
}

export default function ChatScreen() {
  const { params } = useRoute<RouteProp<RootStack, 'Chat'>>();
  const { conversationId, autoOpenOffer } = params;

  const user = useSession((s) => s.user);
  const restriction = useSession((s) => s.restriction);
  const restrictionDismissed = useSession((s) => s.restrictionDismissed);
  const hasVisibleRestriction = Boolean(
    restriction ?? (restrictionDismissed ? null : resolveUserRestriction(user)),
  );
  const detail = useChat((s) => s.detailsById[conversationId]);
  const pendingMessages = useChat(
    (s) => s.pendingMessagesByConversation[conversationId] ?? EMPTY_PENDING,
  );
  const loadingDetail = useChat((s) => s.loadingDetail);
  const storeError = useChat((s) => s.error);
  const loadConversationDetail = useChat((s) => s.loadConversationDetail);
  const sendMessage = useChat((s) => s.sendMessage);
  const retryMessage = useChat((s) => s.retryMessage);
  const dismissPendingMessage = useChat((s) => s.dismissPendingMessage);
  const createOffer = useChat((s) => s.createOffer);
  const respondToOffer = useChat((s) => s.respondToOffer);
  const clearError = useChat((s) => s.clearError);

  const [messageInput, setMessageInput] = useState('');
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerPriceInput, setOfferPriceInput] = useState('');
  const [offerNoteInput, setOfferNoteInput] = useState('');
  const [activeCounterMessageId, setActiveCounterMessageId] = useState<string | null>(null);
  const [counterPriceInput, setCounterPriceInput] = useState('');
  const [responseNoteInput, setResponseNoteInput] = useState('');
  const [localError, setLocalError] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [respondingMessageId, setRespondingMessageId] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const stoppedRef = useRef(false);
  const autoOpenedOfferRef = useRef(false);
  const sendingTextRef = useRef(false);
  const submittingOfferRef = useRef(false);
  const respondingOfferRef = useRef(false);
  const flatListRef = useRef<FlatList<TimelineItem>>(null);
  const lastScrollStateRef = useRef<{
    conversationId: string;
    count: number;
    hasScrolledInitial: boolean;
  }>({
    conversationId,
    count: 0,
    hasScrolledInitial: false,
  });

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const delivered: TimelineItem[] = (detail?.messages ?? []).map((message) => ({
      kind: 'message',
      message,
    }));
    const pending: TimelineItem[] = pendingMessages.map((pendingItem) => ({
      kind: 'pending',
      pending: pendingItem,
    }));
    return [...delivered, ...pending];
  }, [detail?.messages, pendingMessages]);

  const runFetch = useCallback(
    async (silent: boolean) => {
      const currentSession = useSession.getState();
      if (
        stoppedRef.current ||
        inFlightRef.current ||
        !currentSession.token ||
        (currentSession.user && !currentSession.user.roles.includes('MEMBER'))
      ) {
        return;
      }
      inFlightRef.current = true;
      try {
        await loadConversationDetail(conversationId, { silent });
      } catch (err: any) {
        const status = err instanceof ApiError ? err.status : err?.status;
        const code = err instanceof ApiError ? err.code : err?.code;
        if (
          (typeof RestrictedAccountError === 'function' && err instanceof RestrictedAccountError) ||
          status === 401 ||
          status === 403 ||
          status === 404 ||
          code === 'CONVERSATION_NOT_FOUND' ||
          code === 'ACCOUNT_RESTRICTED' ||
          code === 'ACCOUNT_NOT_ACTIVE'
        ) {
          stoppedRef.current = true;
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [conversationId, loadConversationDetail],
  );

  useFocusEffect(
    useCallback(() => {
      stoppedRef.current = false;
      setLocalError('');
      clearError();
      void runFetch(false);

      let appState: AppStateStatus =
        AppState.currentState === 'background' || AppState.currentState === 'inactive'
          ? AppState.currentState
          : 'active';
      const intervalId = setInterval(() => {
        if (!stoppedRef.current && appState === 'active') {
          void runFetch(true);
        }
      }, POLL_INTERVAL_MS);

      const sub = AppState.addEventListener?.('change', (nextState: AppStateStatus) => {
        const wasBackground = appState !== 'active';
        appState = nextState;
        if (wasBackground && nextState === 'active' && !stoppedRef.current) {
          void runFetch(true);
        }
      });

      return () => {
        stoppedRef.current = true;
        clearInterval(intervalId);
        sub?.remove?.();
      };
    }, [runFetch, clearError]),
  );

  const currentUserId = detail?.currentUserId ?? user?.id ?? '';
  const isFreeListing =
    detail?.listingType === 'CHO_TANG' ||
    detail?.listingPrice === 0 ||
    detail?.restrictionReason === 'FREE_LISTING_NO_NEGOTIATION';
  const isCallerMember =
    Boolean(user?.roles.includes('MEMBER')) &&
    user?.accountStatus !== 'BI_KHOA' &&
    !restriction;
  const canSendMessage = Boolean(detail && detail.canSendMessage && isCallerMember);
  const canMakeOffer = Boolean(detail && detail.canMakeOffer && !isFreeListing && isCallerMember);
  const isCounterpartyRestricted = Boolean(
    detail?.counterpartyRestricted ||
      (detail?.counterpartyStatus && detail.counterpartyStatus !== 'HOAT_DONG') ||
      detail?.restrictionReason === 'COUNTERPARTY_RESTRICTED',
  );
  const restrictionBanner =
    getRestrictionMessage(detail?.restrictionReason ?? null, {
      listingStatus: detail?.listingStatus,
      canSendMessage: detail?.canSendMessage,
    }) ||
    (isCounterpartyRestricted ? getRestrictionMessage('COUNTERPARTY_RESTRICTED') : null);
  const reservationNotice =
    detail?.agreedPrice != null
      ? detail.reservationNotice ||
        'Đã ghi nhận mức giá thỏa thuận. Lưu ý: Đồng ý giá chưa phải là giữ chỗ hàng, bạn cần gửi yêu cầu giữ chỗ để chính thức giữ đồ.'
      : null;

  useEffect(() => {
    autoOpenedOfferRef.current = false;
    setMessageInput('');
    setShowOfferForm(false);
    setOfferPriceInput('');
    setOfferNoteInput('');
    setActiveCounterMessageId(null);
    setCounterPriceInput('');
    setResponseNoteInput('');
    setLocalError('');
  }, [conversationId]);

  useEffect(() => {
    autoOpenedOfferRef.current = false;
  }, [autoOpenOffer]);

  useEffect(() => {
    if (autoOpenOffer && canMakeOffer && !autoOpenedOfferRef.current) {
      autoOpenedOfferRef.current = true;
      setShowOfferForm(true);
    }
  }, [conversationId, autoOpenOffer, canMakeOffer]);

  useEffect(() => {
    const prev = lastScrollStateRef.current;
    const isNewConversation = prev.conversationId !== conversationId;
    const prevCount = isNewConversation ? 0 : prev.count;
    const hasScrolledInitial = isNewConversation ? false : prev.hasScrolledInitial;
    const currentCount = timelineItems.length;

    const shouldScroll =
      currentCount > 0 && (!hasScrolledInitial || currentCount > prevCount);

    lastScrollStateRef.current = {
      conversationId,
      count: currentCount,
      hasScrolledInitial: hasScrolledInitial || shouldScroll,
    };

    if (shouldScroll) {
      flatListRef.current?.scrollToEnd?.({ animated: true });
    }
  }, [conversationId, timelineItems.length]);

  const handleManualRefresh = useCallback(() => {
    stoppedRef.current = false;
    setLocalError('');
    clearError();
    void runFetch(false);
  }, [clearError, runFetch]);

  const handleSendText = async () => {
    if (sendingTextRef.current) return;
    setLocalError('');
    clearError();
    if (!canSendMessage) {
      setLocalError(
        restrictionBanner || 'Không thể gửi tin nhắn trong trạng thái hội thoại hiện tại.',
      );
      return;
    }
    const content = messageInput.trim();
    if (!content) {
      setLocalError('Nội dung tin nhắn không được để trống.');
      return;
    }
    if (content.length > 2000) {
      setLocalError('Nội dung tin nhắn không được vượt quá 2000 ký tự.');
      return;
    }
    sendingTextRef.current = true;
    setMessageInput('');
    try {
      await sendMessage(conversationId, content);
    } catch (err: any) {
      setLocalError(err?.message || 'Gửi tin nhắn thất bại.');
    } finally {
      sendingTextRef.current = false;
    }
  };

  const handleRetryMessage = async (clientMessageId: string) => {
    setLocalError('');
    clearError();
    try {
      await retryMessage(conversationId, clientMessageId);
    } catch (err: any) {
      setLocalError(err?.message || 'Gửi lại tin nhắn thất bại.');
    }
  };

  const handleCreateOffer = async () => {
    if (submittingOfferRef.current || submittingOffer) return;
    setLocalError('');
    clearError();
    if (!canMakeOffer) {
      setLocalError(
        restrictionBanner || 'Không thể gửi đề nghị giá cho tin đăng này.',
      );
      return;
    }
    const validation = validateOfferAmount(offerPriceInput, detail?.listingPrice ?? null);
    if (validation.error || validation.price === undefined) {
      setLocalError(validation.error || 'Mức giá đề nghị không hợp lệ.');
      return;
    }
    if (offerNoteInput.trim().length > MAX_OFFER_NOTE_LENGTH) {
      setLocalError('Ghi chú kèm đề nghị giá không được vượt quá 1000 ký tự.');
      return;
    }

    submittingOfferRef.current = true;
    setSubmittingOffer(true);
    try {
      await createOffer(conversationId, {
        offeredPrice: validation.price,
        note: offerNoteInput.trim() || undefined,
      });
      setOfferPriceInput('');
      setOfferNoteInput('');
      setShowOfferForm(false);
    } catch (err: any) {
      setLocalError(err?.message || 'Không thể gửi đề nghị giá.');
    } finally {
      submittingOfferRef.current = false;
      setSubmittingOffer(false);
    }
  };

  const handleRespondOffer = async (
    messageId: string,
    action: 'ACCEPT' | 'REJECT' | 'COUNTER',
  ) => {
    if (respondingOfferRef.current || respondingMessageId !== null) return;
    setLocalError('');
    clearError();

    let counterPrice: number | undefined;
    if (action === 'COUNTER') {
      const validation = validateOfferAmount(counterPriceInput, detail?.listingPrice ?? null);
      if (validation.error || validation.price === undefined) {
        setLocalError(validation.error || 'Mức giá đề xuất lại không hợp lệ.');
        return;
      }
      counterPrice = validation.price;
    }
    if (responseNoteInput.trim().length > MAX_OFFER_NOTE_LENGTH) {
      setLocalError('Ghi chú phản hồi đề nghị giá không được vượt quá 1000 ký tự.');
      return;
    }

    respondingOfferRef.current = true;
    setRespondingMessageId(messageId);
    try {
      await respondToOffer(conversationId, messageId, {
        action,
        counterPrice,
        note: responseNoteInput.trim() || undefined,
      });
      setActiveCounterMessageId(null);
      setCounterPriceInput('');
      setResponseNoteInput('');
    } catch (err: any) {
      setLocalError(err?.message || 'Không thể phản hồi đề nghị giá.');
    } finally {
      respondingOfferRef.current = false;
      setRespondingMessageId(null);
    }
  };

  const renderTimelineItem = ({ item }: { item: TimelineItem }) => {
    if (item.kind === 'pending') {
      const pending = item.pending;
      const pendingTime = formatChatTime(pending.createdAt);
      return (
        <View
          testID={`pending-message-${pending.clientMessageId}`}
          style={[styles.messageBubble, styles.myBubble, styles.myMessageAlign, styles.pendingBubble]}
        >
          <Text style={styles.messageText}>{pending.content}</Text>
          {pendingTime ? (
            <Text style={styles.timestampText} testID={`pending-time-${pending.clientMessageId}`}>
              {pendingTime}
            </Text>
          ) : null}
          {pending.status === 'sending' ? (
            <Text style={styles.pendingStatusText}>Đang gửi...</Text>
          ) : (
            <View style={styles.failedRow}>
              <Text style={styles.failedStatusText}>
                Gửi thất bại{pending.error ? `: ${pending.error}` : ''}
              </Text>
              <View style={styles.offerButtonsRow}>
                {pending.retryable !== false ? (
                  <Action
                    secondary
                    title="Thử gửi lại"
                    testID={`retry-message-${pending.clientMessageId}`}
                    onPress={() => void handleRetryMessage(pending.clientMessageId)}
                  />
                ) : null}
                <Action
                  secondary
                  title="Xóa"
                  testID={`dismiss-message-${pending.clientMessageId}`}
                  onPress={() => dismissPendingMessage(conversationId, pending.clientMessageId)}
                />
              </View>
            </View>
          )}
        </View>
      );
    }

    const msg = item.message;
    const isMine = msg.senderId === currentUserId;
    const isOffer = msg.type === 'DE_NGHI_GIA' || msg.messageType === 'DE_NGHI_GIA';
    const canUserRespond =
      Boolean(msg.canRespond) &&
      msg.offerStatus === 'CHO_PHAN_HOI' &&
      msg.senderId !== currentUserId &&
      canMakeOffer;
    const createdTime = formatChatTime(msg.createdAt);

    if (isOffer) {
      const statusBadge = renderOfferStatusLabel(msg.offerStatus);
      const isCounterOpen = activeCounterMessageId === msg.id;
      const isResponding = respondingMessageId === msg.id;
      const respondedTime = formatChatTime(msg.respondedAt);

      return (
        <View
          testID={`offer-card-${msg.id}`}
          style={[styles.offerCard, isMine ? styles.myMessageAlign : styles.theirMessageAlign]}
        >
          <View style={styles.offerHeader}>
            <Text style={styles.offerTitle}>Đề nghị giá · {msg.senderName}</Text>
            <View style={[styles.badge, { backgroundColor: statusBadge.bg }]}>
              <Text style={[styles.badgeText, { color: statusBadge.fg }]}>{statusBadge.label}</Text>
            </View>
          </View>

          <Text style={styles.offerAmount} testID={`offer-amount-${msg.id}`}>
            {(msg.offeredPrice ?? 0).toLocaleString('vi-VN')} ₫
          </Text>

          {msg.content && msg.content.trim().length > 0 ? (
            <Text style={styles.offerContent} testID={`offer-content-${msg.id}`}>
              {msg.content}
            </Text>
          ) : null}

          {msg.responseNote && msg.responseNote.trim().length > 0 ? (
            <Text style={styles.responseNote} testID={`offer-response-note-${msg.id}`}>
              Ghi chú phản hồi: {msg.responseNote}
            </Text>
          ) : null}

          {createdTime || respondedTime ? (
            <View style={styles.timestampRow}>
              {createdTime ? (
                <Text style={styles.timestampText} testID={`offer-time-${msg.id}`}>
                  {createdTime}
                </Text>
              ) : null}
              {respondedTime ? (
                <Text style={styles.timestampText} testID={`offer-responded-time-${msg.id}`}>
                  Phản hồi: {respondedTime}
                </Text>
              ) : null}
            </View>
          ) : null}

          {canUserRespond ? (
            <View style={styles.offerActionsContainer} testID={`offer-actions-${msg.id}`}>
              <TextInput
                testID={`offer-response-note-input-${msg.id}`}
                accessibilityLabel="Ghi chú phản hồi"
                placeholder="Ghi chú phản hồi (tùy chọn)"
                placeholderTextColor={colors.muted}
                value={responseNoteInput}
                onChangeText={setResponseNoteInput}
                style={styles.smallInput}
              />
              <View style={styles.offerButtonsRow}>
                <Action
                  title="Chấp nhận"
                  testID={`accept-offer-${msg.id}`}
                  busy={isResponding}
                  disabled={isResponding}
                  onPress={() => void handleRespondOffer(msg.id, 'ACCEPT')}
                />
                <Action
                  secondary
                  title="Từ chối"
                  testID={`reject-offer-${msg.id}`}
                  disabled={isResponding}
                  onPress={() => void handleRespondOffer(msg.id, 'REJECT')}
                />
                <Action
                  secondary
                  title="Đề xuất lại giá"
                  testID={`toggle-counter-offer-${msg.id}`}
                  disabled={isResponding}
                  onPress={() =>
                    setActiveCounterMessageId(isCounterOpen ? null : msg.id)
                  }
                />
              </View>

              {isCounterOpen ? (
                <View style={styles.counterForm} testID={`counter-offer-form-${msg.id}`}>
                  <TextInput
                    testID={`counter-price-input-${msg.id}`}
                    accessibilityLabel="Mức giá đề xuất lại"
                    placeholder="Nhập mức giá đề xuất lại (VND)"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    value={counterPriceInput}
                    onChangeText={setCounterPriceInput}
                    style={styles.smallInput}
                  />
                  <Action
                    title="Gửi đề xuất lại"
                    testID={`submit-counter-offer-${msg.id}`}
                    busy={isResponding}
                    disabled={isResponding}
                    onPress={() => void handleRespondOffer(msg.id, 'COUNTER')}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      );
    }

    return (
      <View
        testID={`message-bubble-${msg.id}`}
        style={[
          styles.messageBubble,
          isMine ? styles.myBubble : styles.theirBubble,
          isMine ? styles.myMessageAlign : styles.theirMessageAlign,
        ]}
      >
        <Text style={styles.senderLabel}>{msg.senderName}</Text>
        <Text style={styles.messageText}>{msg.content}</Text>
        {createdTime ? (
          <Text style={styles.timestampText} testID={`message-time-${msg.id}`}>
            {createdTime}
          </Text>
        ) : null}
      </View>
    );
  };

  const listingTitle =
    detail?.listing?.title ??
    detail?.listingTitle ??
    (detail && detail.listing === null && detail.listingId === null
      ? 'Tin đăng đã bị gỡ'
      : 'Đang tải thông tin tin đăng...');

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {hasVisibleRestriction ? (
          <View style={styles.restrictedNoticeWrapper}>
            <RestrictedAccountNotice />
          </View>
        ) : null}

        <View style={styles.topBar}>
          <View style={styles.topBarRow}>
            <View style={{ flex: 1 }}>
              <Text style={ui.brand}>
                {detail?.counterpartyName ? `Đối phương: ${detail.counterpartyName}` : 'CUỘC HỘI THOẠI'}
              </Text>
              <Text style={styles.headerListingTitle} numberOfLines={1}>
                {listingTitle}
              </Text>
              {detail?.listingPrice != null ? (
                <Text style={styles.headerPrice}>
                  Giá niêm yết: {detail.listingPrice.toLocaleString('vi-VN')} ₫
                </Text>
              ) : null}
              {detail?.agreedPrice != null ? (
                <Text style={styles.agreedPriceHighlight} testID="agreed-price-banner">
                  Giá thỏa thuận: {detail.agreedPrice.toLocaleString('vi-VN')} ₫
                </Text>
              ) : null}
            </View>
            <Action
              secondary
              title="Làm mới"
              testID="chat-refresh-button"
              onPress={handleManualRefresh}
            />
          </View>

          {reservationNotice ? (
            <View style={styles.reservationNoticeBox} testID="reservation-notice-banner">
              <Text style={styles.reservationNoticeText}>{reservationNotice}</Text>
            </View>
          ) : null}

          {restrictionBanner ? (
            <View style={styles.restrictionBox} testID="chat-restriction-banner">
              <Text style={styles.restrictionText}>{restrictionBanner}</Text>
            </View>
          ) : null}

          {localError || storeError ? (
            <View style={{ marginTop: space.xs }}>
              <Notice message={localError || storeError || ''} error />
            </View>
          ) : null}
        </View>

        <FlatList
          ref={flatListRef}
          data={timelineItems}
          keyExtractor={(item) =>
            item.kind === 'message' ? `msg:${item.message.id}` : `pending:${item.pending.clientMessageId}`
          }
          refreshControl={
            <RefreshControl refreshing={loadingDetail} onRefresh={handleManualRefresh} />
          }
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            !loadingDetail ? (
              <View style={styles.emptyChat} testID="chat-empty-messages">
                <Text style={ui.caption}>
                  Chưa có tin nhắn nào. Hãy gửi lời chào hoặc đề nghị mức giá phù hợp!
                </Text>
              </View>
            ) : undefined
          }
          renderItem={renderTimelineItem}
        />

        {canMakeOffer ? (
          <View style={styles.offerComposerSection} testID="offer-composer-section">
            {!showOfferForm ? (
              <Action
                secondary
                title="Đề nghị giá"
                testID="open-offer-form-button"
                onPress={() => {
                  setLocalError('');
                  setShowOfferForm(true);
                }}
              />
            ) : (
              <View style={styles.offerFormBox} testID="offer-form-box">
                <Text style={ui.label}>Đề nghị mức giá mới (VND)</Text>
                <TextInput
                  testID="offer-price-input"
                  accessibilityLabel="Số tiền đề nghị"
                  placeholder="Nhập mức giá mong muốn (VND)"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={offerPriceInput}
                  onChangeText={setOfferPriceInput}
                  style={styles.smallInput}
                />
                <TextInput
                  testID="offer-note-input"
                  accessibilityLabel="Ghi chú đề nghị giá"
                  placeholder="Ghi chú kèm đề nghị (tùy chọn)"
                  placeholderTextColor={colors.muted}
                  value={offerNoteInput}
                  onChangeText={setOfferNoteInput}
                  style={styles.smallInput}
                />
                <View style={styles.offerButtonsRow}>
                  <Action
                    title="Gửi đề nghị giá"
                    testID="submit-offer-button"
                    busy={submittingOffer}
                    disabled={submittingOffer}
                    onPress={() => void handleCreateOffer()}
                  />
                  <Action
                    secondary
                    title="Đóng"
                    testID="cancel-offer-button"
                    disabled={submittingOffer}
                    onPress={() => setShowOfferForm(false)}
                  />
                </View>
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.composerBar}>
          <TextInput
            testID="chat-message-input"
            accessibilityLabel="Tin nhắn"
            multiline
            placeholder={
              canSendMessage
                ? 'Nhập tin nhắn trao đổi đồ dùng, địa điểm hẹn gặp...'
                : 'Tính năng nhắn tin hiện đang bị khóa'
            }
            placeholderTextColor={colors.muted}
            editable={canSendMessage}
            value={messageInput}
            onChangeText={setMessageInput}
            style={[styles.textInput, !canSendMessage && { backgroundColor: '#ecebe4' }]}
          />
          <Action
            title="Gửi"
            testID="chat-send-button"
            disabled={!canSendMessage}
            onPress={() => void handleSendText()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f4ef',
  },
  restrictedNoticeWrapper: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  topBar: {
    padding: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: space.xs,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  headerListingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  headerPrice: {
    fontSize: 13,
    color: colors.muted,
  },
  agreedPriceHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#137333',
    marginTop: 2,
  },
  reservationNoticeBox: {
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: '#e6f4ea',
    borderWidth: 1,
    borderColor: '#137333',
    marginTop: space.xs,
  },
  reservationNoticeText: {
    fontSize: 13,
    color: '#137333',
    fontWeight: '600',
    lineHeight: 18,
  },
  restrictionBox: {
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: '#fef7e0',
    borderWidth: 1,
    borderColor: '#b06000',
    marginTop: space.xs,
  },
  restrictionText: {
    fontSize: 13,
    color: '#b06000',
    lineHeight: 18,
  },
  messagesList: {
    padding: space.md,
    gap: space.sm,
    flexGrow: 1,
  },
  emptyChat: {
    padding: space.xl,
    alignItems: 'center',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
  },
  myBubble: {
    backgroundColor: '#fdf6f0',
    borderColor: colors.brand,
  },
  theirBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
  },
  myMessageAlign: {
    alignSelf: 'flex-end',
  },
  theirMessageAlign: {
    alignSelf: 'flex-start',
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  messageText: {
    fontSize: 15,
    color: colors.ink,
    lineHeight: 20,
  },
  timestampRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.xs,
    marginTop: 2,
  },
  timestampText: {
    fontSize: 11,
    color: colors.muted,
  },
  pendingBubble: {
    borderStyle: 'dashed',
  },
  pendingStatusText: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
  },
  failedRow: {
    marginTop: space.xs,
    gap: space.xs,
  },
  failedStatusText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
  },
  offerCard: {
    width: '90%',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: '#fffaf5',
    gap: space.xs,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  offerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brand,
  },
  offerAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  offerContent: {
    fontSize: 14,
    color: colors.ink,
  },
  responseNote: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
  },
  offerActionsContainer: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: space.sm,
  },
  offerButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  counterForm: {
    gap: space.xs,
    marginTop: space.xs,
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  offerComposerSection: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  offerFormBox: {
    gap: space.xs,
    paddingBottom: space.xs,
  },
  smallInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 44,
    maxHeight: 120,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
});
