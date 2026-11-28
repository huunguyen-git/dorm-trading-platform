import { create } from 'zustand';
import { ApiError, RestrictedAccountError } from '../api/client';
import { useSession } from '../auth/session';
import * as chatApi from './api';
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  CreateOfferInput,
  PendingOutgoingMessage,
  RespondOfferInput,
} from './types';

let clientMsgCounter = 0;
const draftClientIds = new Map<string, string>();

export function generateClientMessageId(): string {
  clientMsgCounter += 1;
  return `cmsg-${Date.now()}-${clientMsgCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function isNonRetryableBusinessError(err: unknown): boolean {
  if (typeof RestrictedAccountError === 'function' && err instanceof RestrictedAccountError) {
    return true;
  }
  const status =
    err instanceof ApiError
      ? err.status
      : typeof (err as { status?: unknown } | null)?.status === 'number'
        ? (err as { status: number }).status
        : undefined;
  return status === 400 || status === 403 || status === 404 || status === 409;
}

function preserveCounterpartyRestrictedOnSummary(
  summary: ConversationSummary,
): ConversationSummary {
  return {
    ...summary,
    canSendMessage: false,
    canMakeOffer: false,
    restrictionReason: 'COUNTERPARTY_RESTRICTED',
    counterpartyStatus: 'HAN_CHE',
    counterpartyRestricted: true,
    lastMessage: summary.lastMessage
      ? { ...summary.lastMessage, canRespond: false }
      : summary.lastMessage,
  };
}

function detailToSummary(detail: ConversationDetail): ConversationSummary {
  const lastMessage =
    detail.messages && detail.messages.length > 0
      ? detail.messages[detail.messages.length - 1]
      : null;
  return {
    id: detail.id,
    listing: detail.listing,
    listingId: detail.listingId,
    listingTitle: detail.listingTitle,
    listingPrice: detail.listingPrice,
    listingType: detail.listingType,
    listingStatus: detail.listingStatus,
    buyer: detail.buyer,
    buyerId: detail.buyerId,
    buyerName: detail.buyerName,
    seller: detail.seller,
    sellerId: detail.sellerId,
    sellerName: detail.sellerName,
    counterpartyId: detail.counterpartyId,
    counterpartyName: detail.counterpartyName,
    counterpartyStatus: detail.counterpartyStatus,
    counterpartyRestricted: detail.counterpartyRestricted,
    agreedPrice: detail.agreedPrice,
    pendingOfferId: detail.pendingOfferId,
    pendingOfferPrice: detail.pendingOfferPrice,
    pendingOfferSenderId: detail.pendingOfferSenderId,
    lastMessage,
    canSendMessage: detail.canSendMessage,
    canMakeOffer: detail.canMakeOffer,
    restrictionReason: detail.restrictionReason,
    version: detail.version,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    if (
      typeof a.sequenceNumber === 'number' &&
      typeof b.sequenceNumber === 'number' &&
      a.sequenceNumber !== b.sequenceNumber
    ) {
      return a.sequenceNumber - b.sequenceNumber;
    }
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    return a.id.localeCompare(b.id);
  });
}

function sortConversations(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort((a, b) => {
    const timeDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (timeDiff !== 0 && !Number.isNaN(timeDiff)) {
      return timeDiff;
    }
    return a.id.localeCompare(b.id);
  });
}

function upsertSummaryWithVersionGuard(
  list: ConversationSummary[],
  incoming: ConversationSummary,
): ConversationSummary[] {
  const existing = list.find((c) => c.id === incoming.id);
  if (
    existing &&
    typeof existing.version === 'number' &&
    typeof incoming.version === 'number' &&
    incoming.version < existing.version
  ) {
    return list;
  }
  const nextIncoming =
    existing &&
    typeof existing.version === 'number' &&
    typeof incoming.version === 'number' &&
    incoming.version === existing.version &&
    existing.restrictionReason === 'COUNTERPARTY_RESTRICTED' &&
    incoming.restrictionReason !== 'COUNTERPARTY_RESTRICTED'
      ? preserveCounterpartyRestrictedOnSummary(incoming)
      : incoming;
  const filtered = list.filter((c) => c.id !== incoming.id);
  return sortConversations([nextIncoming, ...filtered]);
}

function isConflictError(err: any): boolean {
  const code = err?.code;
  return (
    err?.status === 409 ||
    code === 'OFFER_NOT_PENDING' ||
    code === 'LISTING_NOT_AVAILABLE' ||
    code === 'CLIENT_MESSAGE_ID_CONFLICT'
  );
}

export interface ChatState {
  conversations: ConversationSummary[];
  detailsById: Record<string, ConversationDetail>;
  pendingMessagesByConversation: Record<string, PendingOutgoingMessage[]>;
  loadingList: boolean;
  loadingDetail: boolean;
  error: string | null;
  sessionGeneration: number;

  loadConversations: (options?: { silent?: boolean }) => Promise<ConversationSummary[]>;
  openOrCreateConversation: (listingId: string) => Promise<ConversationDetail>;
  loadConversationDetail: (
    conversationId: string,
    options?: { silent?: boolean },
  ) => Promise<ConversationDetail>;
  sendMessage: (
    conversationId: string,
    content: string,
    existingClientMessageId?: string,
  ) => Promise<ChatMessage>;
  retryMessage: (conversationId: string, clientMessageId: string) => Promise<ChatMessage>;
  dismissPendingMessage: (conversationId: string, clientMessageId: string) => void;
  createOffer: (conversationId: string, input: CreateOfferInput) => Promise<ConversationDetail>;
  respondToOffer: (
    conversationId: string,
    messageId: string,
    input: RespondOfferInput,
  ) => Promise<ConversationDetail>;
  clearError: () => void;
  reset: () => void;
}

export const useChat = create<ChatState>((set, get) => {
  const captureSessionGuard = () => ({
    generation: get().sessionGeneration,
    userId: useSession.getState().user?.id ?? null,
    token: useSession.getState().token,
  });

  const isGuardActive = (guard: {
    generation: number;
    userId: string | null;
    token: string | null;
  }) => {
    const currentSession = useSession.getState();
    const currentUserId = currentSession.user?.id ?? null;
    if (!currentSession.token) return false;
    if (get().sessionGeneration !== guard.generation) return false;
    if (guard.userId !== currentUserId) return false;
    return true;
  };

  const applyDetailWithVersionGuard = (detail: ConversationDetail): ConversationDetail => {
    const existing = get().detailsById[detail.id];
    if (
      existing &&
      typeof existing.version === 'number' &&
      typeof detail.version === 'number' &&
      detail.version < existing.version
    ) {
      return existing;
    }

    let effectiveDetail = detail;
    if (
      existing &&
      typeof existing.version === 'number' &&
      typeof detail.version === 'number' &&
      detail.version === existing.version &&
      existing.messages.length > detail.messages.length
    ) {
      const mergedById = new Map<string, ChatMessage>();
      const seenClientIds = new Set<string>();
      for (const msg of detail.messages || []) {
        mergedById.set(msg.id, msg);
        if (msg.clientMessageId) {
          seenClientIds.add(msg.clientMessageId);
        }
      }
      for (const msg of existing.messages || []) {
        if (
          !mergedById.has(msg.id) &&
          !(msg.clientMessageId && seenClientIds.has(msg.clientMessageId))
        ) {
          mergedById.set(msg.id, msg);
          if (msg.clientMessageId) {
            seenClientIds.add(msg.clientMessageId);
          }
        }
      }
      const mergedMessages = sortMessages(Array.from(mergedById.values()));
      const latestMerged = mergedMessages[mergedMessages.length - 1];
      const latestTime = latestMerged ? new Date(latestMerged.createdAt).getTime() : NaN;
      const detailTime = new Date(detail.updatedAt).getTime();
      effectiveDetail = {
        ...detail,
        messages: mergedMessages,
        updatedAt:
          latestMerged &&
          !Number.isNaN(latestTime) &&
          (Number.isNaN(detailTime) || latestTime > detailTime)
            ? latestMerged.createdAt
            : detail.updatedAt,
      };
    }

    const existingSummary = get().conversations.find((c) => c.id === detail.id);
    const shouldPreserveCounterpartyLock =
      typeof detail.version === 'number' &&
      effectiveDetail.restrictionReason !== 'COUNTERPARTY_RESTRICTED' &&
      ((existing &&
        typeof existing.version === 'number' &&
        detail.version === existing.version &&
        existing.restrictionReason === 'COUNTERPARTY_RESTRICTED') ||
        (existingSummary &&
          typeof existingSummary.version === 'number' &&
          detail.version === existingSummary.version &&
          existingSummary.restrictionReason === 'COUNTERPARTY_RESTRICTED'));

    if (shouldPreserveCounterpartyLock) {
      effectiveDetail = {
        ...effectiveDetail,
        canSendMessage: false,
        canMakeOffer: false,
        restrictionReason: 'COUNTERPARTY_RESTRICTED',
        counterpartyStatus: 'HAN_CHE',
        counterpartyRestricted: true,
        messages: (effectiveDetail.messages || []).map((m) => ({
          ...m,
          canRespond: false,
        })),
      };
    }

    const deliveredClientIds = new Set(
      (effectiveDetail.messages || [])
        .map((m) => m.clientMessageId)
        .filter((id): id is string => Boolean(id)),
    );
    const currentPending = get().pendingMessagesByConversation[detail.id] || [];
    const remainingPending = currentPending.filter(
      (p) => !deliveredClientIds.has(p.clientMessageId),
    );

    set((state) => ({
      detailsById: {
        ...state.detailsById,
        [detail.id]: effectiveDetail,
      },
      conversations: upsertSummaryWithVersionGuard(
        state.conversations,
        detailToSummary(effectiveDetail),
      ),
      pendingMessagesByConversation: {
        ...state.pendingMessagesByConversation,
        [detail.id]: remainingPending,
      },
    }));

    return effectiveDetail;
  };

  const applyCounterpartyRestrictedLock = (conversationId: string) => {
    const existingDetail = get().detailsById[conversationId];
    if (existingDetail) {
      const lockedMessages = existingDetail.messages.map((m) => ({
        ...m,
        canRespond: false,
      }));
      const updatedDetail: ConversationDetail = {
        ...existingDetail,
        counterpartyStatus: 'HAN_CHE',
        counterpartyRestricted: true,
        canSendMessage: false,
        canMakeOffer: false,
        restrictionReason: 'COUNTERPARTY_RESTRICTED',
        messages: lockedMessages,
      };
      set((state) => ({
        detailsById: {
          ...state.detailsById,
          [conversationId]: updatedDetail,
        },
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                counterpartyStatus: 'HAN_CHE',
                counterpartyRestricted: true,
                canSendMessage: false,
                canMakeOffer: false,
                restrictionReason: 'COUNTERPARTY_RESTRICTED',
              }
            : c,
        ),
      }));
    }
  };

  return {
    conversations: [],
    detailsById: {},
    pendingMessagesByConversation: {},
    loadingList: false,
    loadingDetail: false,
    error: null,
    sessionGeneration: 0,

    clearError: () => set({ error: null }),

    reset: () => {
      draftClientIds.clear();
      set((state) => ({
        conversations: [],
        detailsById: {},
        pendingMessagesByConversation: {},
        loadingList: false,
        loadingDetail: false,
        error: null,
        sessionGeneration: state.sessionGeneration + 1,
      }));
    },

    loadConversations: async (options) => {
      const guard = captureSessionGuard();
      if (!options?.silent) {
        set({ loadingList: true, error: null });
      }
      try {
        const fetched = await chatApi.fetchConversations();
        if (!isGuardActive(guard)) {
          return get().conversations;
        }
        const currentById = new Map(get().conversations.map((c) => [c.id, c]));
        const detailsById = get().detailsById;
        const merged = fetched.map((incoming) => {
          const prev = currentById.get(incoming.id);
          const existingDetail = detailsById[incoming.id];
          if (
            prev &&
            typeof prev.version === 'number' &&
            typeof incoming.version === 'number' &&
            incoming.version < prev.version
          ) {
            return prev;
          }
          const lockedSameVersion =
            typeof incoming.version === 'number' &&
            incoming.restrictionReason !== 'COUNTERPARTY_RESTRICTED' &&
            ((prev &&
              typeof prev.version === 'number' &&
              incoming.version === prev.version &&
              prev.restrictionReason === 'COUNTERPARTY_RESTRICTED') ||
              (existingDetail &&
                typeof existingDetail.version === 'number' &&
                incoming.version === existingDetail.version &&
                existingDetail.restrictionReason === 'COUNTERPARTY_RESTRICTED'));
          if (lockedSameVersion) {
            return preserveCounterpartyRestrictedOnSummary(incoming);
          }
          return incoming;
        });
        const sorted = sortConversations(merged);
        set({ conversations: sorted, error: null });
        return sorted;
      } catch (err: any) {
        if (isGuardActive(guard)) {
          const message = err?.message || 'Không thể tải danh sách hộp thư.';
          set({ error: message });
        }
        throw err;
      } finally {
        if (isGuardActive(guard) && !options?.silent) {
          set({ loadingList: false });
        }
      }
    },

    openOrCreateConversation: async (listingId: string) => {
      const guard = captureSessionGuard();
      set({ loadingDetail: true, error: null });
      try {
        const detail = await chatApi.openOrCreateConversation(listingId);
        if (!isGuardActive(guard)) {
          return detail;
        }
        const applied = applyDetailWithVersionGuard(detail);
        set({ error: null });
        return applied;
      } catch (err: any) {
        if (isGuardActive(guard)) {
          const message = err?.message || 'Không thể mở cuộc hội thoại.';
          set({ error: message });
        }
        throw err;
      } finally {
        if (isGuardActive(guard)) {
          set({ loadingDetail: false });
        }
      }
    },

    loadConversationDetail: async (conversationId: string, options) => {
      const guard = captureSessionGuard();
      if (!options?.silent) {
        set({ loadingDetail: true, error: null });
      }
      try {
        const detail = await chatApi.fetchConversationDetail(conversationId);
        if (!isGuardActive(guard)) {
          return get().detailsById[conversationId] ?? detail;
        }
        const applied = applyDetailWithVersionGuard(detail);
        set({ error: null });
        return applied;
      } catch (err: any) {
        if (isGuardActive(guard)) {
          const message = err?.message || 'Không thể tải nội dung cuộc hội thoại.';
          set({ error: message });
        }
        throw err;
      } finally {
        if (isGuardActive(guard) && !options?.silent) {
          set({ loadingDetail: false });
        }
      }
    },

    sendMessage: async (
      conversationId: string,
      content: string,
      existingClientMessageId?: string,
    ) => {
      const trimmed = content.trim();
      if (!trimmed) {
        const message = 'Nội dung tin nhắn không được để trống.';
        set({ error: message });
        throw new Error(message);
      }
      if (trimmed.length > 2000) {
        const message = 'Nội dung tin nhắn không được vượt quá 2000 ký tự.';
        set({ error: message });
        throw new Error(message);
      }

      const guard = captureSessionGuard();
      const clientMessageId = existingClientMessageId || generateClientMessageId();
      const nowIso = new Date().toISOString();

      set((state) => {
        const existingList = state.pendingMessagesByConversation[conversationId] || [];
        const hasExisting = existingList.some((m) => m.clientMessageId === clientMessageId);
        const nextList: PendingOutgoingMessage[] = hasExisting
          ? existingList.map((m) =>
              m.clientMessageId === clientMessageId
                ? { ...m, content: trimmed, status: 'sending', error: undefined, retryable: undefined }
                : m,
            )
          : [
              ...existingList,
              {
                clientMessageId,
                conversationId,
                content: trimmed,
                status: 'sending',
                createdAt: nowIso,
              },
            ];
        return {
          error: null,
          pendingMessagesByConversation: {
            ...state.pendingMessagesByConversation,
            [conversationId]: nextList,
          },
        };
      });

      try {
        const sent = await chatApi.sendChatMessage(conversationId, {
          content: trimmed,
          clientMessageId,
        });
        if (!isGuardActive(guard)) {
          return sent;
        }

        set((state) => {
          const existingPending = state.pendingMessagesByConversation[conversationId] || [];
          const nextPending = existingPending.filter(
            (p) => p.clientMessageId !== clientMessageId,
          );
          const existingDetail = state.detailsById[conversationId];
          let nextDetailsById = state.detailsById;
          let nextConversations = state.conversations;

          if (existingDetail) {
            const alreadyInMessages = existingDetail.messages.some(
              (m) =>
                m.id === sent.id ||
                (sent.clientMessageId && m.clientMessageId === sent.clientMessageId),
            );
            const nextMessages = sortMessages(
              alreadyInMessages
                ? existingDetail.messages.map((m) =>
                    m.id === sent.id ||
                    (sent.clientMessageId && m.clientMessageId === sent.clientMessageId)
                      ? sent
                      : m,
                  )
                : [...existingDetail.messages, sent],
            );

            const nextVersion =
              typeof sent.conversationVersion === 'number'
                ? Math.max(existingDetail.version, sent.conversationVersion)
                : existingDetail.version + 1;

            const updatedDetail: ConversationDetail = {
              ...existingDetail,
              messages: nextMessages,
              version: nextVersion,
              updatedAt: sent.createdAt || existingDetail.updatedAt,
            };
            nextDetailsById = {
              ...state.detailsById,
              [conversationId]: updatedDetail,
            };
            nextConversations = upsertSummaryWithVersionGuard(
              state.conversations,
              detailToSummary(updatedDetail),
            );
          }

          return {
            error: null,
            detailsById: nextDetailsById,
            conversations: nextConversations,
            pendingMessagesByConversation: {
              ...state.pendingMessagesByConversation,
              [conversationId]: nextPending,
            },
          };
        });

        return sent;
      } catch (err: any) {
        if (isGuardActive(guard)) {
          const message = err?.message || 'Gửi tin nhắn thất bại.';
          const isNonRetryable =
            err?.status === 403 || err?.status === 409 || err?.status === 400;
          const retryable = !isNonRetryable;
          if (err?.status === 403 && err?.code === 'COUNTERPARTY_RESTRICTED') {
            applyCounterpartyRestrictedLock(conversationId);
          }
          if (isConflictError(err)) {
            void get()
              .loadConversationDetail(conversationId, { silent: true })
              .catch(() => {});
          }
          set((state) => {
            const existingPending = state.pendingMessagesByConversation[conversationId] || [];
            return {
              error: message,
              pendingMessagesByConversation: {
                ...state.pendingMessagesByConversation,
                [conversationId]: existingPending.map((m) =>
                  m.clientMessageId === clientMessageId
                    ? { ...m, status: 'failed', error: message, retryable }
                    : m,
                ),
              },
            };
          });
        }
        throw err;
      }
    },

    retryMessage: async (conversationId: string, clientMessageId: string) => {
      const pendingList = get().pendingMessagesByConversation[conversationId] || [];
      const target = pendingList.find((m) => m.clientMessageId === clientMessageId);
      if (!target) {
        throw new Error('Không tìm thấy tin nhắn cần gửi lại.');
      }
      if (target.retryable === false) {
        throw new Error(target.error || 'Tin nhắn này không thể thử gửi lại.');
      }
      return get().sendMessage(conversationId, target.content, target.clientMessageId);
    },

    dismissPendingMessage: (conversationId: string, clientMessageId: string) =>
      set((state) => {
        const existingPending = state.pendingMessagesByConversation[conversationId] || [];
        return {
          pendingMessagesByConversation: {
            ...state.pendingMessagesByConversation,
            [conversationId]: existingPending.filter(
              (m) => m.clientMessageId !== clientMessageId,
            ),
          },
        };
      }),

    createOffer: async (conversationId: string, input: CreateOfferInput) => {
      const guard = captureSessionGuard();
      const draftKey = `offer:${conversationId}:${input.offeredPrice}:${(input.note ?? '').trim()}`;
      const explicitClientId = input.clientMessageId?.trim();
      let clientMessageId = explicitClientId || draftClientIds.get(draftKey);
      if (!clientMessageId) {
        clientMessageId = generateClientMessageId();
        draftClientIds.set(draftKey, clientMessageId);
      }

      set({ error: null });
      try {
        const detail = await chatApi.createPriceOffer(conversationId, {
          ...input,
          clientMessageId,
        });
        if (!isGuardActive(guard)) {
          return get().detailsById[conversationId] ?? detail;
        }
        draftClientIds.delete(draftKey);
        const applied = applyDetailWithVersionGuard(detail);
        set({ error: null });
        return applied;
      } catch (err: any) {
        if (isGuardActive(guard)) {
          if (isNonRetryableBusinessError(err)) {
            draftClientIds.delete(draftKey);
          }
          const message = err?.message || 'Không thể gửi đề nghị giá.';
          if (err?.status === 403 && err?.code === 'COUNTERPARTY_RESTRICTED') {
            applyCounterpartyRestrictedLock(conversationId);
          }
          if (isConflictError(err)) {
            void get()
              .loadConversationDetail(conversationId, { silent: true })
              .catch(() => {});
          }
          set({ error: message });
        }
        throw err;
      }
    },

    respondToOffer: async (
      conversationId: string,
      messageId: string,
      input: RespondOfferInput,
    ) => {
      const guard = captureSessionGuard();
      const draftKey = `respond:${conversationId}:${messageId}:${input.action}:${input.counterPrice ?? ''}:${(input.note ?? '').trim()}`;
      const explicitClientId = input.clientMessageId?.trim();
      let clientMessageId = explicitClientId || draftClientIds.get(draftKey);
      if (!clientMessageId) {
        clientMessageId = generateClientMessageId();
        draftClientIds.set(draftKey, clientMessageId);
      }

      set({ error: null });
      try {
        const detail = await chatApi.respondToPriceOffer(conversationId, messageId, {
          ...input,
          clientMessageId,
        });
        if (!isGuardActive(guard)) {
          return get().detailsById[conversationId] ?? detail;
        }
        draftClientIds.delete(draftKey);
        const applied = applyDetailWithVersionGuard(detail);
        set({ error: null });
        return applied;
      } catch (err: any) {
        if (isGuardActive(guard)) {
          if (isNonRetryableBusinessError(err)) {
            draftClientIds.delete(draftKey);
          }
          const message = err?.message || 'Không thể phản hồi đề nghị giá.';
          if (err?.status === 403 && err?.code === 'COUNTERPARTY_RESTRICTED') {
            applyCounterpartyRestrictedLock(conversationId);
          }
          if (isConflictError(err)) {
            void get()
              .loadConversationDetail(conversationId, { silent: true })
              .catch(() => {});
          }
          set({ error: message });
        }
        throw err;
      }
    },
  };
});

useSession.subscribe((state, prevState) => {
  const prevUserId = prevState.user?.id ?? null;
  const nextUserId = state.user?.id ?? null;
  if ((!state.token && prevState.token) || prevUserId !== nextUserId) {
    useChat.getState().reset();
  }
});
