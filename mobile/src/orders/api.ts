import { api } from '../api/client';
import type {
  AppNotification,
  CreateOrderPayload,
  NotificationsPage,
  OrderDetail,
  OrderPage,
  OrderRoleFilter,
  OrderStatus,
  ProposeSchedulePayload,
} from './types';

export async function createOrderRequest(payload: CreateOrderPayload): Promise<OrderDetail> {
  return api<OrderDetail>('/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchOrders(params?: {
  role?: OrderRoleFilter;
  status?: OrderStatus | 'ALL';
  listingId?: string;
  page?: number;
  size?: number;
}): Promise<OrderPage> {
  const query = new URLSearchParams();
  if (params?.role) query.set('role', params.role);
  if (params?.status && params.status !== 'ALL') query.set('status', params.status);
  if (params?.listingId) query.set('listingId', params.listingId);
  query.set('page', String(params?.page ?? 0));
  query.set('size', String(params?.size ?? 20));
  return api<OrderPage>(`/orders?${query.toString()}`);
}

export async function fetchOrderDetail(orderId: string): Promise<OrderDetail> {
  return api<OrderDetail>(`/orders/${orderId}`);
}

export async function acceptOrder(
  orderId: string,
  expectedVersion?: number,
  agreedPriceVnd?: number,
): Promise<OrderDetail> {
  return api<OrderDetail>(`/orders/${orderId}/accept`, {
    method: 'POST',
    body: JSON.stringify({
      ...(typeof expectedVersion === 'number' ? { expectedVersion } : {}),
      ...(typeof agreedPriceVnd === 'number' ? { agreedPriceVnd } : {}),
    }),
  });
}

export async function rejectOrder(
  orderId: string,
  reason?: string,
  expectedVersion?: number,
): Promise<OrderDetail> {
  return api<OrderDetail>(`/orders/${orderId}/reject`, {
    method: 'POST',
    body: JSON.stringify({
      ...(reason ? { reason } : {}),
      ...(typeof expectedVersion === 'number' ? { expectedVersion } : {}),
    }),
  });
}

export async function cancelOrder(
  orderId: string,
  reason?: string,
  expectedVersion?: number,
): Promise<OrderDetail> {
  return api<OrderDetail>(`/orders/${orderId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      ...(reason ? { reason } : {}),
      ...(typeof expectedVersion === 'number' ? { expectedVersion } : {}),
    }),
  });
}

export async function proposeSchedule(
  orderId: string,
  payload: ProposeSchedulePayload,
): Promise<OrderDetail> {
  return api<OrderDetail>(`/orders/${orderId}/schedules`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function confirmSchedule(
  orderId: string,
  proposalId: string,
): Promise<OrderDetail> {
  return api<OrderDetail>(`/orders/${orderId}/schedules/${proposalId}/confirm`, {
    method: 'POST',
  });
}

export async function rejectSchedule(
  orderId: string,
  proposalId: string,
  reason?: string,
): Promise<OrderDetail> {
  return api<OrderDetail>(`/orders/${orderId}/schedules/${proposalId}/reject`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export async function startDelivery(
  orderId: string,
  expectedVersion?: number,
): Promise<OrderDetail> {
  return api<OrderDetail>(`/orders/${orderId}/start-delivery`, {
    method: 'POST',
    body: JSON.stringify(typeof expectedVersion === 'number' ? { expectedVersion } : {}),
  });
}

export async function fetchNotifications(params?: {
  unreadOnly?: boolean;
  page?: number;
  size?: number;
}): Promise<NotificationsPage> {
  const query = new URLSearchParams();
  query.set('unreadOnly', String(Boolean(params?.unreadOnly)));
  query.set('page', String(params?.page ?? 0));
  query.set('size', String(params?.size ?? 20));
  return api<NotificationsPage>(`/notifications?${query.toString()}`);
}

export async function markNotificationRead(notificationId: string): Promise<AppNotification> {
  return api<AppNotification>(`/notifications/${notificationId}/read`, {
    method: 'POST',
  });
}

export async function markAllNotificationsRead(): Promise<{ updatedCount: number }> {
  return api<{ updatedCount: number }>('/notifications/read-all', {
    method: 'POST',
  });
}
