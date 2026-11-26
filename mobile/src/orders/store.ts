import { create } from 'zustand';
import { registerLogoutReset } from '../auth/session';
import { useDiscovery } from '../listings/discoveryStore';
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import * as orderApi from './api';
import type {
  AppNotification,
  CreateOrderPayload,
  OrderDetail,
  OrderRoleFilter,
  OrderStatus,
  OrderSummary,
  ProposeSchedulePayload,
} from './types';

interface LoadOrdersOptions {
  role?: OrderRoleFilter;
  status?: OrderStatus | 'ALL';
  listingId?: string | null;
  listingTitle?: string | null;
  page?: number;
  refresh?: boolean;
}

interface OrdersState {
  orders: OrderSummary[];
  page: number;
  totalElements: number;
  totalPages: number;
  roleFilter: OrderRoleFilter;
  statusFilter: OrderStatus | 'ALL';
  listingIdFilter: string | null;
  listingTitleFilter: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  selectedOrder: OrderDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  submitting: boolean;
  notifications: AppNotification[];
  unreadCount: number;
  setRoleFilter: (role: OrderRoleFilter) => void;
  setStatusFilter: (status: OrderStatus | 'ALL') => void;
  clearListingFilter: () => void;
  loadOrders: (opts?: LoadOrdersOptions) => Promise<void>;
  loadOrderDetail: (orderId: string) => Promise<OrderDetail | null>;
  loadNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  createRequest: (payload: CreateOrderPayload) => Promise<OrderDetail>;
  accept: (orderId: string, expectedVersion?: number) => Promise<OrderDetail>;
  reject: (orderId: string, reason?: string, expectedVersion?: number) => Promise<OrderDetail>;
  cancel: (orderId: string, reason?: string, expectedVersion?: number) => Promise<OrderDetail>;
  proposeSchedule: (orderId: string, payload: ProposeSchedulePayload) => Promise<OrderDetail>;
  confirmSchedule: (orderId: string, proposalId: string) => Promise<OrderDetail>;
  rejectSchedule: (orderId: string, proposalId: string, reason?: string) => Promise<OrderDetail>;
  startDelivery: (orderId: string, expectedVersion?: number) => Promise<OrderDetail>;
  reset: () => void;
}

function markCatalogStale() {
  try {
    useDiscovery.getState().markStale();
  } catch {
    // ignore store sync error
  }
}

let ordersReqSeq = 0;
let detailReqSeq = 0;
let notificationsReqSeq = 0;
let sessionEpoch = 0;

export const useOrders = create<OrdersState>((set, get) => ({
  orders: [],
  page: 0,
  totalElements: 0,
  totalPages: 0,
  roleFilter: 'ALL',
  statusFilter: 'ALL',
  listingIdFilter: null,
  listingTitleFilter: null,
  loading: false,
  refreshing: false,
  error: null,
  selectedOrder: null,
  detailLoading: false,
  detailError: null,
  submitting: false,
  notifications: [],
  unreadCount: 0,

  setRoleFilter: (roleFilter) => set({ roleFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  clearListingFilter: () => set({ listingIdFilter: null, listingTitleFilter: null }),

  loadOrders: async (opts) => {
    const state = get();
    const role = opts?.role ?? state.roleFilter;
    const status = opts?.status ?? state.statusFilter;
    const listingId = opts && 'listingId' in opts ? (opts.listingId ?? null) : state.listingIdFilter;
    const listingTitle =
      opts && 'listingTitle' in opts
        ? (opts.listingTitle ?? null)
        : listingId === state.listingIdFilter
          ? state.listingTitleFilter
          : null;
    const targetPage = opts?.page ?? 0;
    const isRefresh = Boolean(opts?.refresh);

    const seq = ++ordersReqSeq;
    const epoch = sessionEpoch;

    set({
      loading: !isRefresh,
      refreshing: isRefresh,
      error: null,
      roleFilter: role,
      statusFilter: status,
      listingIdFilter: listingId,
      listingTitleFilter: listingTitle,
    });
    try {
      const result = await orderApi.fetchOrders({
        role,
        status,
        listingId: listingId ?? undefined,
        page: targetPage,
        size: 30,
      });
      if (seq !== ordersReqSeq || epoch !== sessionEpoch) return;
      set((prev) => ({
        orders: targetPage > 0 ? [...prev.orders, ...result.items] : result.items,
        page: result.page ?? targetPage,
        totalElements: result.totalElements ?? result.items.length,
        totalPages: result.totalPages ?? (result.items.length > 0 ? 1 : 0),
        loading: false,
        refreshing: false,
        error: null,
      }));
    } catch (err) {
      if (seq !== ordersReqSeq || epoch !== sessionEpoch) return;
      if (isRestrictedError(err)) {
        set({ loading: false, refreshing: false, error: null });
        return;
      }
      const parsed = extractApiError(err, 'Không thể tải danh sách giao dịch.');
      set({ loading: false, refreshing: false, error: parsed.message });
    }
  },

  loadOrderDetail: async (orderId) => {
    const seq = ++detailReqSeq;
    const epoch = sessionEpoch;
    set({ detailLoading: true, detailError: null });
    try {
      const detail = await orderApi.fetchOrderDetail(orderId);
      if (seq !== detailReqSeq || epoch !== sessionEpoch) return null;
      set({ selectedOrder: detail, detailLoading: false, detailError: null });
      return detail;
    } catch (err) {
      if (seq !== detailReqSeq || epoch !== sessionEpoch) return null;
      if (isRestrictedError(err)) {
        set({ detailLoading: false, detailError: null });
        return null;
      }
      const parsed = extractApiError(err, 'Không thể tải chi tiết giao dịch.');
      set({ detailLoading: false, detailError: parsed.message });
      return null;
    }
  },

  loadNotifications: async () => {
    const seq = ++notificationsReqSeq;
    const epoch = sessionEpoch;
    try {
      const page = await orderApi.fetchNotifications({ page: 0, size: 20 });
      if (seq !== notificationsReqSeq || epoch !== sessionEpoch) return;
      set({
        notifications: Array.isArray(page?.items) ? page.items : [],
        unreadCount: typeof page?.unreadCount === 'number' ? page.unreadCount : 0,
      });
    } catch {
      if (seq !== notificationsReqSeq || epoch !== sessionEpoch) return;
      // Non-blocking secondary feed
    }
  },

  markNotificationRead: async (id) => {
    const epoch = sessionEpoch;
    try {
      const updated = await orderApi.markNotificationRead(id);
      if (epoch !== sessionEpoch) return;
      set((state) => {
        const nextList = state.notifications.map((n) => (n.id === id ? updated : n));
        const wasUnread = state.notifications.find((n) => n.id === id)?.read === false;
        const nextUnread = Math.max(0, state.unreadCount - (wasUnread ? 1 : 0));
        return { notifications: nextList, unreadCount: nextUnread };
      });
    } catch {
      // ignore
    }
  },

  markAllNotificationsRead: async () => {
    const epoch = sessionEpoch;
    try {
      await orderApi.markAllNotificationsRead();
      if (epoch !== sessionEpoch) return;
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch {
      // ignore
    }
  },

  createRequest: async (payload) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const created = await orderApi.createOrderRequest(payload);
      if (epoch === sessionEpoch) {
        detailReqSeq += 1;
        set({ selectedOrder: created, submitting: false });
        markCatalogStale();
      }
      return created;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  accept: async (orderId, expectedVersion) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const updated = await orderApi.acceptOrder(orderId, expectedVersion);
      if (epoch === sessionEpoch) {
        detailReqSeq += 1;
        set({ selectedOrder: updated, submitting: false });
        markCatalogStale();
      }
      return updated;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  reject: async (orderId, reason, expectedVersion) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const updated = await orderApi.rejectOrder(orderId, reason, expectedVersion);
      if (epoch === sessionEpoch) {
        detailReqSeq += 1;
        set({ selectedOrder: updated, submitting: false });
        markCatalogStale();
      }
      return updated;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  cancel: async (orderId, reason, expectedVersion) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const updated = await orderApi.cancelOrder(orderId, reason, expectedVersion);
      if (epoch === sessionEpoch) {
        detailReqSeq += 1;
        set({ selectedOrder: updated, submitting: false });
        markCatalogStale();
      }
      return updated;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  proposeSchedule: async (orderId, payload) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const updated = await orderApi.proposeSchedule(orderId, payload);
      if (epoch === sessionEpoch) {
        detailReqSeq += 1;
        set({ selectedOrder: updated, submitting: false });
      }
      return updated;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  confirmSchedule: async (orderId, proposalId) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const updated = await orderApi.confirmSchedule(orderId, proposalId);
      if (epoch === sessionEpoch) {
        detailReqSeq += 1;
        set({ selectedOrder: updated, submitting: false });
      }
      return updated;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  rejectSchedule: async (orderId, proposalId, reason) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const updated = await orderApi.rejectSchedule(orderId, proposalId, reason);
      if (epoch === sessionEpoch) {
        detailReqSeq += 1;
        set({ selectedOrder: updated, submitting: false });
      }
      return updated;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  startDelivery: async (orderId, expectedVersion) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const updated = await orderApi.startDelivery(orderId, expectedVersion);
      if (epoch === sessionEpoch) {
        detailReqSeq += 1;
        set({ selectedOrder: updated, submitting: false });
      }
      return updated;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  reset: () => {
    sessionEpoch += 1;
    ordersReqSeq += 1;
    detailReqSeq += 1;
    notificationsReqSeq += 1;
    set({
      orders: [],
      page: 0,
      totalElements: 0,
      totalPages: 0,
      roleFilter: 'ALL',
      statusFilter: 'ALL',
      listingIdFilter: null,
      listingTitleFilter: null,
      loading: false,
      refreshing: false,
      error: null,
      selectedOrder: null,
      detailLoading: false,
      detailError: null,
      submitting: false,
      notifications: [],
      unreadCount: 0,
    });
  },
}));

registerLogoutReset(() => {
  useOrders.getState().reset();
});
