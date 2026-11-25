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
      if (isRestrictedError(err)) {
        set({ loading: false, refreshing: false, error: null });
        return;
      }
      const parsed = extractApiError(err, 'Không thể tải danh sách giao dịch.');
      set({ loading: false, refreshing: false, error: parsed.message });
    }
  },

  loadOrderDetail: async (orderId) => {
    set({ detailLoading: true, detailError: null });
    try {
      const detail = await orderApi.fetchOrderDetail(orderId);
      set({ selectedOrder: detail, detailLoading: false, detailError: null });
      return detail;
    } catch (err) {
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
    try {
      const page = await orderApi.fetchNotifications({ page: 0, size: 20 });
      set({ notifications: page.items, unreadCount: page.unreadCount });
    } catch {
      // Non-blocking secondary feed
    }
  },

  markNotificationRead: async (id) => {
    try {
      const updated = await orderApi.markNotificationRead(id);
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
    try {
      await orderApi.markAllNotificationsRead();
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch {
      // ignore
    }
  },

  createRequest: async (payload) => {
    set({ submitting: true });
    try {
      const created = await orderApi.createOrderRequest(payload);
      set({ selectedOrder: created, submitting: false });
      markCatalogStale();
      return created;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },

  accept: async (orderId, expectedVersion) => {
    set({ submitting: true });
    try {
      const updated = await orderApi.acceptOrder(orderId, expectedVersion);
      set({ selectedOrder: updated, submitting: false });
      markCatalogStale();
      return updated;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },

  reject: async (orderId, reason, expectedVersion) => {
    set({ submitting: true });
    try {
      const updated = await orderApi.rejectOrder(orderId, reason, expectedVersion);
      set({ selectedOrder: updated, submitting: false });
      markCatalogStale();
      return updated;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },

  cancel: async (orderId, reason, expectedVersion) => {
    set({ submitting: true });
    try {
      const updated = await orderApi.cancelOrder(orderId, reason, expectedVersion);
      set({ selectedOrder: updated, submitting: false });
      markCatalogStale();
      return updated;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },

  proposeSchedule: async (orderId, payload) => {
    set({ submitting: true });
    try {
      const updated = await orderApi.proposeSchedule(orderId, payload);
      set({ selectedOrder: updated, submitting: false });
      return updated;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },

  confirmSchedule: async (orderId, proposalId) => {
    set({ submitting: true });
    try {
      const updated = await orderApi.confirmSchedule(orderId, proposalId);
      set({ selectedOrder: updated, submitting: false });
      return updated;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },

  rejectSchedule: async (orderId, proposalId, reason) => {
    set({ submitting: true });
    try {
      const updated = await orderApi.rejectSchedule(orderId, proposalId, reason);
      set({ selectedOrder: updated, submitting: false });
      return updated;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },

  startDelivery: async (orderId, expectedVersion) => {
    set({ submitting: true });
    try {
      const updated = await orderApi.startDelivery(orderId, expectedVersion);
      set({ selectedOrder: updated, submitting: false });
      return updated;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },

  reset: () =>
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
    }),
}));

registerLogoutReset(() => {
  useOrders.getState().reset();
});
