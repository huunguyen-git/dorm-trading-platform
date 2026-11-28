import type { InventoryItemStatus } from '../inventory/types';
import type { CollapsibleAlertTone, StatusTone, StatusVariant } from '../components/ui';
import type { OrderReviewSummary, ReviewStatus } from '../reviews/types';

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

export type OrderItemStatus = InventoryItemStatus | 'DA_XOA';

export interface OrderItem {
  id: string;
  name: string;
  condition: string;
  status: OrderItemStatus;
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
  completedAt?: string | null;
  cancelledAt: string | null;
  reviewStatus?: ReviewStatus | null;
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
  reviewSummary?: OrderReviewSummary | null;
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
  { label: string; tone: StatusTone; tier: StatusVariant; shortDesc: string }
> = {
  YEU_CAU: {
    label: 'Chờ người bán duyệt',
    tone: 'warning',
    tier: 'soft',
    shortDesc: 'Đã gửi yêu cầu, chưa chính thức khóa giữ đồ.',
  },
  GIU_CHO: {
    label: 'Đang giữ chỗ',
    tone: 'accent',
    tier: 'urgent',
    shortDesc: 'Đồ vật đã được giữ cho giao dịch này.',
  },
  DANG_GIAO: {
    label: 'Đang giao hàng',
    tone: 'accent',
    tier: 'urgent',
    shortDesc: 'Người bán đã thông báo bắt đầu giao hàng.',
  },
  CHO_XAC_NHAN: {
    label: 'Chờ xác nhận nhận hàng',
    tone: 'warning',
    tier: 'urgent',
    shortDesc: 'Người bán đã báo đã giao kèm ảnh bàn giao (UC-27).',
  },
  CHO_XU_LY: {
    label: 'Chờ kiểm duyệt xử lý',
    tone: 'danger',
    tier: 'urgent',
    shortDesc: 'Giao dịch đang chờ Kiểm duyệt viên xem xét (UC-29).',
  },
  HOAN_TAT: {
    label: 'Đã hoàn tất',
    tone: 'success',
    tier: 'dot',
    shortDesc: 'Giao dịch đã hoàn tất.',
  },
  HUY: {
    label: 'Đã hủy',
    tone: 'neutral',
    tier: 'dot',
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

export const ORDER_REJECT_REASONS = [
  'Đã có người hẹn lấy trước',
  'Tạm thời chưa giao được',
  'Chưa phù hợp lịch hẹn',
];

export const ORDER_CANCEL_REASONS = [
  'Thay đổi kế hoạch cá nhân',
  'Chưa sắp xếp được lịch gặp',
  'Hai bên đã trao đổi lại',
];

export const SCHEDULE_REJECT_REASONS = [
  'Bận khung giờ này',
  'Muốn đổi địa điểm khác',
  'Đề xuất sang ngày hôm sau',
];

export interface OrderStepperState {
  currentStep: number;
  cancelled: boolean;
  tone: 'accent' | 'success';
  statusNote: string;
}

export function getOrderStepperState(order: OrderDetail): OrderStepperState {
  switch (order.status) {
    case 'YEU_CAU':
      return {
        currentStep: 0,
        cancelled: false,
        tone: 'accent',
        statusNote: 'Yêu cầu đang chờ người bán chấp nhận để chính thức giữ đồ.',
      };
    case 'GIU_CHO':
      return {
        currentStep: 1,
        cancelled: false,
        tone: 'accent',
        statusNote: order.scheduleConfirmed
          ? 'Đã thống nhất lịch hẹn · Sẵn sàng bắt đầu giao hàng.'
          : 'Đồ vật đã được giữ · Hai bên thống nhất thời gian và địa điểm giao nhận.',
      };
    case 'DANG_GIAO':
      return {
        currentStep: 2,
        cancelled: false,
        tone: 'accent',
        statusNote: 'Người bán đã thông báo bắt đầu giao hàng theo lịch hẹn.',
      };
    case 'CHO_XAC_NHAN':
      return {
        currentStep: 2,
        cancelled: false,
        tone: 'accent',
        statusNote: 'Đã báo đã giao (UC-27) · Chờ xác nhận nhận hàng.',
      };
    case 'CHO_XU_LY':
      return {
        currentStep: 2,
        cancelled: false,
        tone: 'accent',
        statusNote: 'Giao dịch đang chờ Kiểm duyệt viên xử lý (UC-29).',
      };
    case 'HOAN_TAT':
      return {
        currentStep: 4,
        cancelled: false,
        tone: 'success',
        statusNote: 'Giao dịch đã hoàn tất.',
      };
    case 'HUY':
      return {
        currentStep: order.deliveryStartedAt ? 2 : order.reservedAt ? 1 : 0,
        cancelled: true,
        tone: 'accent',
        statusNote: order.reservedAt
          ? 'Giữ chỗ đã hủy · Khả dụng đồ vật đã được cập nhật.'
          : 'Yêu cầu giữ chỗ đã kết thúc ở trạng thái hủy.',
      };
  }
}

export function getNotificationTone(type: string): CollapsibleAlertTone {
  const normalized = (type || '').toUpperCase();
  if (
    normalized.includes('CANCEL') ||
    normalized.includes('REJECT') ||
    normalized.includes('REVIEW_DELETED')
  ) {
    return 'danger';
  }
  if (
    normalized.includes('ACCEPTED') ||
    normalized.includes('CONFIRMED') ||
    normalized.includes('DELIVERY_STARTED') ||
    normalized.includes('REVIEW_RECEIVED') ||
    normalized.includes('NO_REVIEW_BONUS')
  ) {
    return 'success';
  }
  if (
    normalized.includes('UPDATED') ||
    normalized.includes('WARNING') ||
    normalized.includes('PENDING_MODERATION')
  ) {
    return 'warning';
  }
  return 'accent';
}

export function buildPresetMeetingTime(daysAhead: number, hour: number): string {
  const target = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1);
  }
  return formatLocalInputFromDate(target);
}

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
 * Formats a numeric VND amount without inferring "Miễn phí" when price is 0.
 * Only use `listing.isFree` (`listedPriceVnd === 0`) to label giveaway ("Cho tặng") listings.
 */
export function formatExactVnd(priceVnd: number | null | undefined): string {
  const value =
    typeof priceVnd === 'number' && Number.isFinite(priceVnd)
      ? Math.max(0, Math.round(priceVnd))
      : 0;
  const grouped = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped}đ`;
}

/**
 * Parses either "YYYY-MM-DD HH:mm[:ss]" (local time) or an ISO-8601 timestamp string into ISO UTC string.
 * Strictly validates date/time ranges to reject JS Date rollover (e.g. "2026-12-01 10:99", "2026-12-01 25:00").
 * Returns null if invalid.
 */
export function parseMeetingTimeInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = match[6] ? Number(match[6]) : 0;
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59
    ) {
      return null;
    }
    const date = new Date(year, month - 1, day, hour, minute, second, 0);
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute ||
      date.getSeconds() !== second
    ) {
      return null;
    }
    return date.toISOString();
  }
  const isoMatch =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      trimmed,
    );
  if (!isoMatch) {
    return null;
  }
  const isoYear = Number(isoMatch[1]);
  const isoMonth = Number(isoMatch[2]);
  const isoDay = Number(isoMatch[3]);
  const isoHour = Number(isoMatch[4]);
  const isoMinute = Number(isoMatch[5]);
  const isoSecond = isoMatch[6] ? Number(isoMatch[6]) : 0;
  if (
    isoMonth < 1 ||
    isoMonth > 12 ||
    isoDay < 1 ||
    isoDay > 31 ||
    isoHour < 0 ||
    isoHour > 23 ||
    isoMinute < 0 ||
    isoMinute > 59 ||
    isoSecond < 0 ||
    isoSecond > 59
  ) {
    return null;
  }
  const calendarCheck = new Date(Date.UTC(isoYear, isoMonth - 1, isoDay));
  if (
    calendarCheck.getUTCFullYear() !== isoYear ||
    calendarCheck.getUTCMonth() !== isoMonth - 1 ||
    calendarCheck.getUTCDate() !== isoDay
  ) {
    return null;
  }
  const direct = new Date(trimmed);
  if (Number.isNaN(direct.getTime())) {
    return null;
  }
  return direct.toISOString();
}
