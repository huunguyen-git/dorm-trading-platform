import type { InventoryItemStatus } from '../inventory/types';
import type { StatusTone } from '../components/ui';

export type OrderStatus =
  | 'YEU_CAU'
  | 'GIU_CHO'
  | 'DANG_GIAO'
  | 'CHO_XAC_NHAN'
  | 'CHO_XU_LY'
  | 'HOAN_TAT'
  | 'HUY';

export type OrderRoleFilter = 'ALL' | 'BUYER' | 'SELLER';

export type ScheduleProposalStatus =
  | 'CHO_XAC_NHAN'
  | 'DA_XAC_NHAN'
  | 'TU_CHOI'
  | 'DA_THAY_THE';

export interface PartySummary {
  id: string;
  displayName: string;
  reputationScore: number;
}

export interface OrderListingSummary {
  id: string;
  title: string;
  listedPriceVnd: number;
  listingType: string;
  isCombo: boolean;
  isFree: boolean;
  status: string;
  thumbnailUrl: string | null;
  locationName: string | null;
}

export interface OrderItem {
  id: string;
  name: string;
  condition: string;
  status: InventoryItemStatus;
  images: string[];
  heldByThisOrder: boolean;
}

export interface ScheduleProposal {
  id: string;
  orderId: string;
  proposedById: string;
  proposedByName: string;
  proposedTime: string;
  proposedLocation: string;
  note: string | null;
  status: ScheduleProposalStatus;
  respondedById: string | null;
  respondedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  canConfirm: boolean;
  canReject: boolean;
}

export interface OrderViewerFlags {
  isBuyer: boolean;
  isSeller: boolean;
  canAccept: boolean;
  canReject: boolean;
  canCancel: boolean;
  canProposeSchedule: boolean;
  canStartDelivery: boolean;
  requiresPostDeliveryCancel: boolean;
}

export interface OrderSummary {
  id: string;
  listing: OrderListingSummary;
  seller: PartySummary;
  buyer: PartySummary;
  agreedPriceVnd: number;
  status: OrderStatus;
  scheduleConfirmed: boolean;
  meetingTime: string | null;
  meetingLocation: string | null;
  proposedMeetingTime: string | null;
  proposedMeetingLocation: string | null;
  hasPendingScheduleProposal: boolean;
  itemCount: number;
  createdAt: string;
  reservedAt: string | null;
  deliveryStartedAt: string | null;
  reportedDeliveredAt: string | null;
  cancelledAt: string | null;
  version: number;
}

export interface OrderDetail {
  id: string;
  listing: OrderListingSummary;
  seller: PartySummary;
  buyer: PartySummary;
  agreedPriceVnd: number;
  status: OrderStatus;
  note: string | null;
  scheduleConfirmed: boolean;
  meetingTime: string | null;
  meetingLocation: string | null;
  proposedMeetingTime: string | null;
  proposedMeetingLocation: string | null;
  items: OrderItem[];
  pendingScheduleProposal: ScheduleProposal | null;
  scheduleProposals: ScheduleProposal[];
  cancelledById: string | null;
  cancelReason: string | null;
  createdAt: string;
  reservedAt: string | null;
  deliveryStartedAt: string | null;
  reportedDeliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  version: number;
  viewer: OrderViewerFlags;
}

export interface OrderPage {
  items: OrderSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  listingId: string | null;
  orderId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsPage {
  items: AppNotification[];
  unreadCount: number;
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface CreateOrderPayload {
  listingId: string;
  agreedPriceVnd?: number | null;
  proposedMeetingTime?: string | null;
  proposedMeetingLocation?: string | null;
  note?: string | null;
}

export interface ProposeSchedulePayload {
  proposedTime: string;
  proposedLocation: string;
  note?: string | null;
  expectedVersion?: number;
}

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; tone: StatusTone; shortDesc: string }
> = {
  YEU_CAU: {
    label: 'Chờ người bán duyệt',
    tone: 'warning',
    shortDesc: 'Đã gửi yêu cầu, chưa chính thức khóa giữ đồ.',
  },
  GIU_CHO: {
    label: 'Đang giữ chỗ',
    tone: 'accent',
    shortDesc: 'Đồ vật đã được giữ cho giao dịch này.',
  },
  DANG_GIAO: {
    label: 'Đang giao hàng',
    tone: 'accent',
    shortDesc: 'Người bán đã thông báo bắt đầu giao hàng.',
  },
  CHO_XAC_NHAN: {
    label: 'Chờ xác nhận nhận hàng',
    tone: 'warning',
    shortDesc: 'Người bán đã báo đã giao kèm ảnh bàn giao (UC-27).',
  },
  CHO_XU_LY: {
    label: 'Chờ kiểm duyệt xử lý',
    tone: 'danger',
    shortDesc: 'Giao dịch đang chờ Kiểm duyệt viên xem xét (UC-29).',
  },
  HOAN_TAT: {
    label: 'Đã hoàn tất',
    tone: 'success',
    shortDesc: 'Giao dịch đã hoàn tất.',
  },
  HUY: {
    label: 'Đã hủy',
    tone: 'neutral',
    shortDesc: 'Giao dịch đã kết thúc ở trạng thái hủy.',
  },
};

export const PROPOSAL_STATUS_META: Record<
  ScheduleProposalStatus,
  { label: string; tone: StatusTone }
> = {
  CHO_XAC_NHAN: { label: 'Chờ xác nhận', tone: 'warning' },
  DA_XAC_NHAN: { label: 'Đã thống nhất', tone: 'success' },
  TU_CHOI: { label: 'Chưa đồng ý', tone: 'danger' },
  DA_THAY_THE: { label: 'Đã thay thế', tone: 'neutral' },
};

export const QUICK_MEETING_LOCATIONS = [
  'Cổng KTX Khu A ĐHQG-HCM',
  'Cổng KTX Khu B ĐHQG-HCM',
  'Nhà Văn hóa Sinh viên ĐHQG',
  'Cổng Trường ĐH CNTT (UIT)',
];

export function formatOrderDateTime(iso?: string | null): string {
  if (!iso) return 'Chưa có';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} · ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatLocalInputFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Parses either "YYYY-MM-DD HH:mm" (local time) or an ISO-8601 timestamp string into ISO UTC string.
 * Returns null if invalid.
 */
export function parseMeetingTimeInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    const date = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      ss ? Number(ss) : 0,
      0,
    );
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== Number(y) ||
      date.getMonth() !== Number(m) - 1 ||
      date.getDate() !== Number(d)
    ) {
      return null;
    }
    return date.toISOString();
  }
  const direct = new Date(trimmed);
  if (Number.isNaN(direct.getTime())) {
    return null;
  }
  return direct.toISOString();
}
