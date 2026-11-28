import { create } from 'zustand';
import { useSession } from '../auth/session';
import { useDiscovery } from '../listings/discoveryStore';
import type { PickableImageAsset } from '../media/imagePicker';
import * as txApi from './api';
import type {
  CancelDecision,
  CancelReasonCode,
  TransactionDetail,
  TransactionListPage,
  TransactionListStatusFilter,
  TransactionRoleFilter,
  TransactionStatusCounts,
  TransactionSummary,
} from './types';

export interface TransactionsState {
  items: TransactionSummary[];
  pendingActionCount: number;
  counts: TransactionStatusCounts | null;
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  roleFilter: TransactionRoleFilter;
  statusFilter: TransactionListStatusFilter;
  searchQuery: string;
  loading: boolean;
  error: string | null;

  selectedDetail: TransactionDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  detailNotFound: boolean;
  submitting: boolean;

  setRoleFilter: (role: TransactionRoleFilter) => void;
  setStatusFilter: (status: TransactionListStatusFilter) => void;
  setSearchQuery: (q: string) => void;
  clearError: () => void;
  clearDetail: () => void;
  loadTransactions: (params?: {
    role?: TransactionRoleFilter;
    status?: TransactionListStatusFilter;
    q?: string;
    page?: number;
    size?: number;
  }) => Promise<TransactionListPage>;
  loadPendingActionCount: () => Promise<number>;
  loadDetail: (id: string) => Promise<TransactionDetail>;
  reportDelivered: (
    id: string,
    payload: { photos: PickableImageAsset[]; note?: string; version?: number },
  ) => Promise<TransactionDetail>;
  completeWithOtp: (
    id: string,
    payload: { otp: string; version: number },
  ) => Promise<TransactionDetail>;
  reissueOtp: (id: string, payload: { version: number }) => Promise<TransactionDetail>;
  requestCancel: (
    id: string,
    payload: { reasonCode: CancelReasonCode; reasonNote?: string; version: number },
  ) => Promise<TransactionDetail>;
  respondCancel: (
    id: string,
    requestId: string,
    payload: { decision: CancelDecision; responseNote?: string; version: number },
  ) => Promise<TransactionDetail>;
  reset: () => void;
}

const INITIAL_STATE = {
  items: [] as TransactionSummary[],
  pendingActionCount: 0,
  counts: null as TransactionStatusCounts | null,
  page: 0,
  size: 20,
  totalPages: 0,
  totalElements: 0,
  roleFilter: 'ALL' as TransactionRoleFilter,
  statusFilter: '' as TransactionListStatusFilter,
  searchQuery: '',
  loading: false,
  error: null as string | null,
  selectedDetail: null as TransactionDetail | null,
  detailLoading: false,
  detailError: null as string | null,
  detailNotFound: false,
  submitting: false,
};

function syncRestrictionIfNeeded(error: unknown): boolean {
  if (!txApi.isRestrictedTransactionError(error)) {
    return false;
  }
  if (!useSession.getState().restriction) {
    useSession.setState({
      restriction: error.restriction,
      restrictionDismissed: false,
    });
  }
  return true;
}

function detailToSummaryPatch(detail: TransactionDetail): Partial<TransactionSummary> {
  const hasPendingCancelRequest = detail.cancellationRequest?.status === 'CHO_XAC_NHAN';
  const needsViewerAction = Boolean(
    detail.actions.canReportDelivered ||
      detail.actions.canVerifyOtp ||
      (detail.actions.canRespondCancel && hasPendingCancelRequest),
  );
  return {
    status: detail.status,
    deliveredAt: detail.deliveredAt,
    completedAt: detail.completedAt,
    cancelledAt: detail.cancelledAt,
    hasPendingCancelRequest,
    needsViewerAction,
    escalationReason: detail.escalationReason,
    version: detail.version,
  };
}

let listSeq = 0;
let detailSeq = 0;

export const useTransactions = create<TransactionsState>((set, get) => ({
  ...INITIAL_STATE,

  setRoleFilter: (roleFilter) => set({ roleFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  clearError: () => set({ error: null, detailError: null }),
  clearDetail: () => {
    detailSeq += 1;
    set({ selectedDetail: null, detailLoading: false, detailError: null, detailNotFound: false });
  },
  reset: () => {
    listSeq += 1;
    detailSeq += 1;
    set({ ...INITIAL_STATE });
  },

  loadTransactions: async (params) => {
    const nextRole = params?.role !== undefined ? params.role : get().roleFilter;
    const nextStatus = params?.status !== undefined ? params.status : get().statusFilter;
    const nextQ = params?.q !== undefined ? params.q : get().searchQuery;
    const nextPage = params?.page ?? 0;
    const nextSize = params?.size ?? get().size;
    const reqId = ++listSeq;

    set({
      loading: true,
      error: null,
      roleFilter: nextRole,
      statusFilter: nextStatus,
      searchQuery: nextQ,
    });
    try {
      const response = await txApi.fetchTransactions({
        role: nextRole,
        status: nextStatus,
        q: nextQ.trim() || undefined,
        page: nextPage,
        size: nextSize,
      });
      if (reqId !== listSeq) return response;

      const existing = nextPage > 0 ? get().items : [];
      const mergedItems =
        nextPage > 0
          ? [
              ...existing,
              ...response.items.filter((entry) => !existing.some((prev) => prev.id === entry.id)),
            ]
          : response.items;

      set({
        items: mergedItems,
        pendingActionCount: response.pendingActionCount,
        counts: response.counts,
        page: response.page,
        size: response.size,
        totalPages: response.totalPages,
        totalElements: response.totalElements,
      });
      return response;
    } catch (err) {
      if (reqId !== listSeq) throw err;
      if (syncRestrictionIfNeeded(err)) {
        set({ error: null });
        throw err;
      }
      const parsed = txApi.extractTransactionError(err, 'Không thể tải danh sách giao dịch.');
      set({ error: parsed.message });
      throw err;
    } finally {
      if (reqId === listSeq) {
        set({ loading: false });
      }
    }
  },

  loadPendingActionCount: async () => {
    try {
      const response = await txApi.fetchTransactions({
        role: 'ALL',
        status: 'ACTION_REQUIRED',
        page: 0,
        size: 1,
      });
      set({ pendingActionCount: response.pendingActionCount });
      return response.pendingActionCount;
    } catch {
      return get().pendingActionCount;
    }
  },

  loadDetail: async (id) => {
    const reqId = ++detailSeq;
    set({ detailLoading: true, detailError: null, detailNotFound: false });
    try {
      const detail = await txApi.fetchTransactionDetail(id);
      if (reqId !== detailSeq) return detail;
      set((state) => ({
        selectedDetail: detail,
        items: state.items.map((item) =>
          item.id === detail.id ? { ...item, ...detailToSummaryPatch(detail) } : item,
        ),
      }));
      return detail;
    } catch (err) {
      if (reqId !== detailSeq) throw err;
      if (syncRestrictionIfNeeded(err)) {
        set({ detailError: null });
        throw err;
      }
      const parsed = txApi.extractTransactionError(err, 'Không thể tải chi tiết giao dịch.');
      set({
        detailError: parsed.message,
        detailNotFound: parsed.status === 404 || parsed.code === 'TRANSACTION_NOT_FOUND',
      });
      throw err;
    } finally {
      if (reqId === detailSeq) {
        set({ detailLoading: false });
      }
    }
  },

  reportDelivered: async (id, payload) => {
    set({ submitting: true });
    try {
      const updated = await txApi.reportDelivered(id, payload);
      set((state) => ({
        selectedDetail: updated,
        detailError: null,
        items: state.items.map((item) =>
          item.id === updated.id ? { ...item, ...detailToSummaryPatch(updated) } : item,
        ),
      }));
      return updated;
    } catch (err) {
      syncRestrictionIfNeeded(err);
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  completeWithOtp: async (id, payload) => {
    set({ submitting: true });
    try {
      const updated = await txApi.completeTransactionWithOtp(id, payload);
      set((state) => ({
        selectedDetail: updated,
        detailError: null,
        items: state.items.map((item) =>
          item.id === updated.id ? { ...item, ...detailToSummaryPatch(updated) } : item,
        ),
      }));
      useDiscovery.getState().markStale();
      return updated;
    } catch (err) {
      syncRestrictionIfNeeded(err);
      const parsed = txApi.extractTransactionError(err, 'Không thể xác nhận mã.');
      // Synchronize local OTP attempt telemetry immediately from structured backend error
      set((state) => {
        const cur = state.selectedDetail;
        if (!cur || cur.id !== id || !cur.otp) return state;
        const nextAttemptsUsed =
          typeof parsed.attemptsUsed === 'number' ? parsed.attemptsUsed : cur.otp.attemptsUsed;
        const nextMax =
          typeof parsed.maxAttempts === 'number' ? parsed.maxAttempts : cur.otp.maxAttempts;
        const nextRemaining =
          typeof parsed.remainingAttempts === 'number'
            ? parsed.remainingAttempts
            : cur.otp.remainingAttempts;
        let nextStatus = cur.otp.status;
        if (parsed.code === 'OTP_EXPIRED') {
          nextStatus = 'EXPIRED';
        } else if (parsed.code === 'OTP_ALREADY_USED') {
          nextStatus = 'USED';
        } else if (parsed.code === 'OTP_ATTEMPTS_EXCEEDED' || parsed.locked || nextRemaining === 0) {
          nextStatus = 'EXHAUSTED';
        }
        return {
          selectedDetail: {
            ...cur,
            otp: {
              ...cur.otp,
              status: nextStatus,
              attemptsUsed: nextAttemptsUsed,
              maxAttempts: nextMax,
              remainingAttempts: nextRemaining,
              inAppCode: nextStatus === 'ACTIVE' ? cur.otp.inAppCode : null,
            },
            actions:
              nextStatus !== 'ACTIVE'
                ? { ...cur.actions, canVerifyOtp: false }
                : cur.actions,
          },
        };
      });
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  reissueOtp: async (id, payload) => {
    set({ submitting: true });
    try {
      const updated = await txApi.reissueHandoverOtp(id, payload);
      set((state) => ({
        selectedDetail: updated,
        detailError: null,
        items: state.items.map((item) =>
          item.id === updated.id ? { ...item, ...detailToSummaryPatch(updated) } : item,
        ),
      }));
      return updated;
    } catch (err) {
      syncRestrictionIfNeeded(err);
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  requestCancel: async (id, payload) => {
    set({ submitting: true });
    try {
      const updated = await txApi.createCancelRequest(id, payload);
      set((state) => ({
        selectedDetail: updated,
        detailError: null,
        items: state.items.map((item) =>
          item.id === updated.id ? { ...item, ...detailToSummaryPatch(updated) } : item,
        ),
      }));
      return updated;
    } catch (err) {
      syncRestrictionIfNeeded(err);
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  respondCancel: async (id, requestId, payload) => {
    set({ submitting: true });
    try {
      const updated = await txApi.respondCancelRequest(id, requestId, payload);
      set((state) => ({
        selectedDetail: updated,
        detailError: null,
        items: state.items.map((item) =>
          item.id === updated.id ? { ...item, ...detailToSummaryPatch(updated) } : item,
        ),
      }));
      if (updated.status === 'HUY') {
        useDiscovery.getState().markStale();
      }
      return updated;
    } catch (err) {
      syncRestrictionIfNeeded(err);
      throw err;
    } finally {
      set({ submitting: false });
    }
  },
}));

useSession.subscribe((state, prevState) => {
  const prevUserId = prevState.user?.id ?? null;
  const nextUserId = state.user?.id ?? null;
  if ((!state.token && prevState.token) || prevUserId !== nextUserId) {
    useTransactions.getState().reset();
  }
});
