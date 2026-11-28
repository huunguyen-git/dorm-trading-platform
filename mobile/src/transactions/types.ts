import { resolveMediaUrl } from '../api/client';
import type { InventoryItemStatus } from '../inventory/types';
import type { ListingStatus } from '../listings/types';
import type { StatusTone, StatusVariant } from '../components/ui/StatusIndicator';

export type TransactionStatus =
  | 'YEU_CAU'
  | 'GIU_CHO'
  | 'DANG_GIAO'
  | 'CHO_XAC_NHAN'
  | 'CHO_XU_LY'
  | 'HOAN_TAT'
  | 'HUY';

export type TransactionListStatusFilter =
  | ''
  | 'ACTION_REQUIRED'
  | 'DANG_GIAO'
  | 'CHO_XAC_NHAN'
  | 'HOAN_TAT'
  | 'HUY'
  | 'CHO_XU_LY';

export type TransactionRoleFilter = 'ALL' | 'SELLER' | 'BUYER';
export type TransactionViewerRole = 'SELLER' | 'BUYER' | 'MODERATOR' | 'SENIOR_ADMIN';
export type TransactionPartyRole = 'SELLER' | 'BUYER';
export type TimelineActorRole = 'SELLER' | 'BUYER' | 'SYSTEM' | 'MODERATOR';

export type EscalationReason = 'OVERDUE_24H' | 'CANCEL_DISPUTE';

export type HandoverOtpStatus = 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'USED' | 'INVALIDATED';

export type CancelReasonCode =
  | 'ITEM_NOT_AS_DESCRIBED'
  | 'DEFECT_AT_HANDOVER'
  | 'COMBO_MISSING_ITEM'
  | 'MUTUAL_AGREEMENT'
  | 'OTHER';

export type CancelRequestStatus =
  | 'CHO_XAC_NHAN'
  | 'DONG_Y'
  | 'TU_CHOI'
  | 'DA_DONG_DO_HOAN_TAT';

export type CancelDecision = 'AGREE' | 'REJECT';

export interface TransactionCounterparty {
  id: string;
  displayName: string;
  reputationScore: number;
}

export interface TransactionStatusCounts {
  all: number;
  actionRequired: number;
  yeuCau: number;
  giuCho: number;
  dangGiao: number;
  choXacNhan: number;
  choXuLy: number;
  hoanTat: number;
  huy: number;
}

export interface TransactionSummary {
  id: string;
  listingId: string;
  listingTitle: string;
  listingThumbnailUrl: string | null;
  isCombo: boolean;
  isFree: boolean;
  itemCount: number;
  agreedPriceVnd: number;
  status: TransactionStatus;
  viewerRole: TransactionViewerRole;
  counterparty: TransactionCounterparty;
  appointmentAt: string | null;
  appointmentLocation: string | null;
  deliveredAt: string | null;
  autoEscalateAt?: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  hasPendingCancelRequest: boolean;
  needsViewerAction: boolean;
  escalationReason: EscalationReason | null;
  updatedAt: string | null;
  version: number;
}

export interface TransactionListPage {
  items: TransactionSummary[];
  pendingActionCount: number;
  counts: TransactionStatusCounts | null;
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface TransactionListingRef {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  isCombo: boolean;
  isFree: boolean;
  status: ListingStatus;
}

export interface TransactionItemRef {
  id: string;
  name: string;
  condition: string;
  status: InventoryItemStatus;
  thumbnailUrl: string | null;
}

export interface HandoverProofPhoto {
  id: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string | null;
}

export interface HandoverProofInfo {
  photoId: string | null;
  photoUrl: string;
  photos: HandoverProofPhoto[];
  uploadedAt: string | null;
  note: string | null;
  contentType: string;
}

export interface HandoverOtpInfo {
  id: string;
  status: HandoverOtpStatus;
  issuedAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number;
  ttlSeconds: number;
  reissueCount: number;
  attemptsUsed: number;
  maxAttempts: number;
  remainingAttempts: number;
  inAppCode: string | null;
}

export interface CancelRequestInfo {
  id: string;
  status: CancelRequestStatus;
  requestedByRole: TransactionPartyRole;
  isViewerRequester: boolean;
  reasonCode: CancelReasonCode;
  reasonLabel: string;
  reasonNote: string | null;
  requestedAt: string | null;
  respondedAt: string | null;
  responseNote: string | null;
}

export interface TransactionActions {
  canReportDelivered: boolean;
  canVerifyOtp: boolean;
  canReissueOtp: boolean;
  canRequestCancel: boolean;
  canRespondCancel: boolean;
  canViewHandoverPhoto: boolean;
}

export interface TransactionTimelineEvent {
  id: string;
  action: string;
  fromStatus: TransactionStatus | null;
  toStatus: TransactionStatus;
  actorRole: TimelineActorRole;
  note: string | null;
  createdAt: string | null;
}

export interface TransactionDetail {
  id: string;
  version: number;
  serverNow: string | null;
  receivedAtMs: number;
  clockOffsetMs: number;
  status: TransactionStatus;
  viewerRole: TransactionViewerRole;
  agreedPriceVnd: number;
  isFree: boolean;
  appointmentAt: string | null;
  appointmentLocation: string | null;
  deliveryStartedAt: string | null;
  deliveredAt: string | null;
  autoEscalateAt: string | null;
  autoEscalateRemainingSeconds: number | null;
  completedAt: string | null;
  cancelledAt: string | null;
  escalationReason: EscalationReason | null;
  escalatedAt: string | null;
  listing: TransactionListingRef;
  items: TransactionItemRef[];
  counterparty: TransactionCounterparty;
  seller: TransactionCounterparty | null;
  buyer: TransactionCounterparty | null;
  handoverProof: HandoverProofInfo | null;
  otp: HandoverOtpInfo | null;
  cancellationRequest: CancelRequestInfo | null;
  actions: TransactionActions;
  timeline: TransactionTimelineEvent[];
}

export interface TransactionStatusMeta {
  label: string;
  shortLabel: string;
  tone: StatusTone;
  variant: StatusVariant;
}

export const TRANSACTION_STATUS_META: Record<TransactionStatus, TransactionStatusMeta> = {
  YEU_CAU: {
    label: 'Chờ phản hồi giữ chỗ',
    shortLabel: 'Chờ giữ chỗ',
    tone: 'neutral',
    variant: 'dot',
  },
  GIU_CHO: {
    label: 'Đang giữ chỗ',
    shortLabel: 'Đang giữ chỗ',
    tone: 'warning',
    variant: 'soft',
  },
  DANG_GIAO: {
    label: 'Đang giao hàng',
    shortLabel: 'Đang giao',
    tone: 'accent',
    variant: 'soft',
  },
  CHO_XAC_NHAN: {
    label: 'Chờ xác nhận',
    shortLabel: 'Chờ xác nhận',
    tone: 'warning',
    variant: 'urgent',
  },
  CHO_XU_LY: {
    label: 'Chờ kiểm duyệt',
    shortLabel: 'Chờ kiểm duyệt',
    tone: 'warning',
    variant: 'urgent',
  },
  HOAN_TAT: {
    label: 'Đã hoàn tất',
    shortLabel: 'Hoàn tất',
    tone: 'success',
    variant: 'soft',
  },
  HUY: {
    label: 'Đã hủy',
    shortLabel: 'Đã hủy',
    tone: 'danger',
    variant: 'dot',
  },
};

export interface CancelReasonOption {
  code: CancelReasonCode;
  label: string;
  requiresNote: boolean;
}

export const CANCEL_REASON_OPTIONS: CancelReasonOption[] = [
  { code: 'ITEM_NOT_AS_DESCRIBED', label: 'Sản phẩm không đúng mô tả', requiresNote: false },
  { code: 'DEFECT_AT_HANDOVER', label: 'Phát hiện lỗi khi nhận hàng', requiresNote: false },
  { code: 'COMBO_MISSING_ITEM', label: 'Thiếu món trong bộ combo', requiresNote: false },
  { code: 'MUTUAL_AGREEMENT', label: 'Hai bên thống nhất hủy', requiresNote: false },
  { code: 'OTHER', label: 'Lý do khác', requiresNote: true },
];

export const CANCEL_REASON_LABELS: Record<CancelReasonCode, string> = {
  ITEM_NOT_AS_DESCRIBED: 'Sản phẩm không đúng mô tả',
  DEFECT_AT_HANDOVER: 'Phát hiện lỗi khi nhận hàng',
  COMBO_MISSING_ITEM: 'Thiếu món trong bộ combo',
  MUTUAL_AGREEMENT: 'Hai bên thống nhất hủy',
  OTHER: 'Lý do khác',
};

export const CANCEL_STATUS_LABELS: Record<CancelRequestStatus, string> = {
  CHO_XAC_NHAN: 'Chờ phản hồi',
  DONG_Y: 'Đã đồng ý hủy',
  TU_CHOI: 'Đã từ chối',
  DA_DONG_DO_HOAN_TAT: 'Đã hoàn tất',
};

export const ESCALATION_REASON_LABELS: Record<EscalationReason, string> = {
  OVERDUE_24H: 'Quá 24 giờ chưa xác nhận nhận hàng',
  CANCEL_DISPUTE: 'Chưa thống nhất yêu cầu hủy',
};

export const TIMELINE_ACTOR_LABELS: Record<TimelineActorRole, string> = {
  SELLER: 'Người bán',
  BUYER: 'Người mua',
  SYSTEM: 'Hệ thống',
  MODERATOR: 'Kiểm duyệt',
};

const TIMELINE_ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: 'Tạo giao dịch',
  RESERVATION_ACCEPTED: 'Chấp nhận giữ chỗ',
  DELIVERY_STARTED: 'Bắt đầu giao hàng',
  REPORT_DELIVERED: 'Đã báo giao',
  DELIVERY_REPORTED: 'Đã báo giao',
  HANDOVER_REPORTED: 'Đã báo giao',
  DELIVERED_REPORTED: 'Đã báo giao',
  OTP_ISSUED: 'Đã gửi mã xác nhận',
  OTP_REISSUED: 'Đã gửi lại mã',
  OTP_VERIFIED: 'Đã xác nhận nhận hàng',
  COMPLETED_BY_OTP: 'Đã hoàn tất giao dịch',
  OTP_ATTEMPTS_EXCEEDED: 'Nhập sai mã 5 lần',
  OTP_LOCKED_MAX_ATTEMPTS: 'Nhập sai mã 5 lần',
  TRANSACTION_COMPLETED: 'Đã hoàn tất giao dịch',
  CANCEL_REQUESTED: 'Yêu cầu hủy giao dịch',
  CANCEL_AGREED: 'Đồng ý hủy giao dịch',
  CANCEL_REJECTED: 'Từ chối yêu cầu hủy',
  TRANSACTION_CANCELLED: 'Đã hủy giao dịch',
  AUTO_ESCALATED_OVERDUE_24H: 'Chuyển kiểm duyệt sau 24 giờ',
  ESCALATED_OVERDUE_24H: 'Chuyển kiểm duyệt sau 24 giờ',
  ESCALATED_CANCEL_DISPUTE: 'Chuyển kiểm duyệt xem xét',
  MODERATOR_DECISION: 'Kết quả kiểm duyệt',
};

export function mapTransactionStatusLabel(status: string | null | undefined): string {
  if (!status || typeof status !== 'string') return 'Không xác định';
  const key = status.trim().toUpperCase() as TransactionStatus;
  if (key in TRANSACTION_STATUS_META) {
    return TRANSACTION_STATUS_META[key].label;
  }
  return 'Không xác định';
}

export function mapTimelineActionLabel(action: string | null | undefined): string {
  if (!action || typeof action !== 'string') return 'Cập nhật trạng thái';
  const key = action.trim().toUpperCase();
  if (key in TIMELINE_ACTION_LABELS) {
    return TIMELINE_ACTION_LABELS[key];
  }
  if (/^[A-Z0-9_]+$/.test(action.trim())) {
    return 'Cập nhật giao dịch';
  }
  return action.trim();
}

export function mapCancelReasonLabel(code: string | null | undefined, fallback?: string | null): string {
  if (fallback && fallback.trim() && !/^[A-Z0-9_]+$/.test(fallback.trim())) {
    return fallback.trim();
  }
  if (!code) return 'Lý do khác';
  const key = code.trim().toUpperCase() as CancelReasonCode;
  return CANCEL_REASON_LABELS[key] ?? 'Lý do khác';
}

export function formatTransactionDateTime(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(parsed);
  } catch {
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mm = String(parsed.getMinutes()).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mo = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return `${hh}:${mm} ${dd}/${mo}/${yyyy}`;
  }
}

export function computeClockOffsetMs(serverNowIso: string | null | undefined, nowMs = Date.now()): number {
  if (!serverNowIso) return 0;
  const parsed = new Date(serverNowIso).getTime();
  if (Number.isNaN(parsed)) return 0;
  return parsed - nowMs;
}

export function computeRemainingSeconds(
  expiresAtIso: string | null | undefined,
  clockOffsetMs = 0,
  nowMs = Date.now(),
): number {
  if (!expiresAtIso) return 0;
  const expiresMs = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiresMs)) return 0;
  const syncedNowMs = nowMs + clockOffsetMs;
  return Math.max(0, Math.ceil((expiresMs - syncedNowMs) / 1000));
}

export function formatCountdownMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatOtpDisplay(code: string): string {
  const digits = code.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)} · ${digits.slice(3)}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function formatMimeShort(contentType: string | null | undefined): string {
  if (!contentType) return 'Ảnh';
  const normalized = contentType.trim().toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'JPEG';
  if (normalized.includes('png')) return 'PNG';
  if (normalized.includes('webp')) return 'WebP';
  return 'Ảnh';
}

export function formatEscalationCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  if (safe === 0) return '0p';
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  if (hours > 0) {
    return `${hours}g ${String(mins).padStart(2, '0')}p`;
  }
  if (mins > 0) {
    return `${mins}p`;
  }
  return '< 1p';
}

export function formatRelativeTime(
  iso: string | null | undefined,
  nowMs = Date.now(),
): string {
  if (!iso || typeof iso !== 'string') return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.floor((nowMs - ts) / 1000);
  if (diffSec < 0) return formatTransactionDateTime(iso);
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Hôm qua';
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return formatTransactionDateTime(iso);
}

export function getInitialsFromName(name: string | null | undefined): string {
  const cleaned = (name ?? '').trim();
  if (!cleaned) return 'TV';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = Array.from(words[0])[0] ?? '';
    const last = Array.from(words[words.length - 1])[0] ?? '';
    return `${first}${last}`.toUpperCase();
  }
  return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
}

// --- Defensive Normalizers (camelCase + snake_case tolerant) ---

type RawRecord = Record<string, unknown>;

const VALID_TX_STATUSES = new Set<TransactionStatus>([
  'YEU_CAU',
  'GIU_CHO',
  'DANG_GIAO',
  'CHO_XAC_NHAN',
  'CHO_XU_LY',
  'HOAN_TAT',
  'HUY',
]);

const VALID_VIEWER_ROLES = new Set<TransactionViewerRole>([
  'SELLER',
  'BUYER',
  'MODERATOR',
  'SENIOR_ADMIN',
]);

const VALID_OTP_STATUSES = new Set<HandoverOtpStatus>([
  'ACTIVE',
  'EXPIRED',
  'EXHAUSTED',
  'USED',
  'INVALIDATED',
]);

const VALID_CANCEL_REASONS = new Set<CancelReasonCode>([
  'ITEM_NOT_AS_DESCRIBED',
  'DEFECT_AT_HANDOVER',
  'COMBO_MISSING_ITEM',
  'MUTUAL_AGREEMENT',
  'OTHER',
]);

const VALID_CANCEL_STATUSES = new Set<CancelRequestStatus>([
  'CHO_XAC_NHAN',
  'DONG_Y',
  'TU_CHOI',
  'DA_DONG_DO_HOAN_TAT',
]);

const VALID_ESCALATIONS = new Set<EscalationReason>(['OVERDUE_24H', 'CANCEL_DISPUTE']);
const VALID_ITEM_STATUSES = new Set<InventoryItemStatus>(['KHA_DUNG', 'DANG_GIU', 'DA_CHUYEN_GIAO']);
const VALID_LISTING_STATUSES = new Set<ListingStatus>([
  'NHAP',
  'CHO_DUYET',
  'CONG_KHAI',
  'GIU_CHO',
  'DA_RUT',
  'HET_HAN',
  'AN',
  'KET_THUC',
]);

function asRecord(value: unknown): RawRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawRecord) : {};
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0) return false;
  return fallback;
}

function normalizeStatus(raw: unknown): TransactionStatus {
  const val = asString(raw, 'GIU_CHO').toUpperCase() as TransactionStatus;
  return VALID_TX_STATUSES.has(val) ? val : 'GIU_CHO';
}

function normalizeNullableStatus(raw: unknown): TransactionStatus | null {
  const s = asNullableString(raw);
  if (!s) return null;
  const val = s.toUpperCase() as TransactionStatus;
  return VALID_TX_STATUSES.has(val) ? val : null;
}

function normalizeViewerRole(raw: unknown): TransactionViewerRole {
  const val = asString(raw, 'BUYER').toUpperCase() as TransactionViewerRole;
  return VALID_VIEWER_ROLES.has(val) ? val : 'BUYER';
}

function normalizeEscalationReason(raw: unknown): EscalationReason | null {
  const s = asNullableString(raw);
  if (!s) return null;
  const val = s.toUpperCase() as EscalationReason;
  return VALID_ESCALATIONS.has(val) ? val : null;
}

function normalizeCounterparty(raw: unknown): TransactionCounterparty {
  const rec = asRecord(raw);
  return {
    id: asString(rec.id),
    displayName: asString(rec.displayName ?? rec.display_name ?? rec.name, 'Thành viên').trim() || 'Thành viên',
    reputationScore: Math.max(0, asNumber(rec.reputationScore ?? rec.reputation_score, 100)),
  };
}

function normalizeNullableCounterparty(raw: unknown): TransactionCounterparty | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = asRecord(raw);
  const id = asNullableString(rec.id);
  const name = asNullableString(rec.displayName ?? rec.display_name ?? rec.name);
  if (!id && !name) return null;
  return {
    id: id ?? '',
    displayName: name ?? 'Thành viên',
    reputationScore: Math.max(0, asNumber(rec.reputationScore ?? rec.reputation_score, 100)),
  };
}

function normalizeStatusCounts(raw: unknown): TransactionStatusCounts | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = asRecord(raw);
  return {
    all: Math.max(0, asNumber(rec.all, 0)),
    actionRequired: Math.max(0, asNumber(rec.actionRequired ?? rec.action_required, 0)),
    yeuCau: Math.max(0, asNumber(rec.yeuCau ?? rec.yeu_cau, 0)),
    giuCho: Math.max(0, asNumber(rec.giuCho ?? rec.giu_cho, 0)),
    dangGiao: Math.max(0, asNumber(rec.dangGiao ?? rec.dang_giao, 0)),
    choXacNhan: Math.max(0, asNumber(rec.choXacNhan ?? rec.cho_xac_nhan, 0)),
    choXuLy: Math.max(0, asNumber(rec.choXuLy ?? rec.cho_xu_ly, 0)),
    hoanTat: Math.max(0, asNumber(rec.hoanTat ?? rec.hoan_tat, 0)),
    huy: Math.max(0, asNumber(rec.huy, 0)),
  };
}

export function normalizeTransactionSummary(raw: unknown): TransactionSummary {
  const rec = asRecord(raw);
  const agreedPriceVnd = Math.max(0, asNumber(rec.agreedPriceVnd ?? rec.agreed_price_vnd ?? rec.giaThoaThuan, 0));
  const rawThumb = asNullableString(rec.listingThumbnailUrl ?? rec.listing_thumbnail_url);
  return {
    id: asString(rec.id ?? rec.maGiaoDich ?? rec.ma_giao_dich),
    listingId: asString(rec.listingId ?? rec.listing_id ?? rec.maTin ?? rec.ma_tin),
    listingTitle: asString(rec.listingTitle ?? rec.listing_title ?? rec.tieuDe, 'Giao dịch đồ dùng'),
    listingThumbnailUrl: rawThumb ? resolveMediaUrl(rawThumb) : null,
    isCombo: asBoolean(rec.isCombo ?? rec.is_combo, false),
    isFree: asBoolean(rec.isFree ?? rec.is_free, agreedPriceVnd === 0),
    itemCount: Math.max(1, asNumber(rec.itemCount ?? rec.item_count, 1)),
    agreedPriceVnd,
    status: normalizeStatus(rec.status ?? rec.trangThai ?? rec.trang_thai),
    viewerRole: normalizeViewerRole(rec.viewerRole ?? rec.viewer_role),
    counterparty: normalizeCounterparty(rec.counterparty),
    appointmentAt: asNullableString(rec.appointmentAt ?? rec.appointment_at ?? rec.thoiGianHen),
    appointmentLocation: asNullableString(rec.appointmentLocation ?? rec.appointment_location ?? rec.diaDiemHen),
    deliveredAt: asNullableString(rec.deliveredAt ?? rec.delivered_at ?? rec.thoiDiemBaoGiao),
    autoEscalateAt: asNullableString(rec.autoEscalateAt ?? rec.auto_escalate_at),
    completedAt: asNullableString(rec.completedAt ?? rec.completed_at ?? rec.thoiDiemHoanTat),
    cancelledAt: asNullableString(rec.cancelledAt ?? rec.cancelled_at ?? rec.thoiDiemHuy),
    hasPendingCancelRequest: asBoolean(rec.hasPendingCancelRequest ?? rec.has_pending_cancel_request, false),
    needsViewerAction: asBoolean(rec.needsViewerAction ?? rec.needs_viewer_action, false),
    escalationReason: normalizeEscalationReason(rec.escalationReason ?? rec.escalation_reason),
    updatedAt: asNullableString(rec.updatedAt ?? rec.updated_at),
    version: Math.max(0, asNumber(rec.version, 0)),
  };
}

export function normalizeTransactionListPage(raw: unknown): TransactionListPage {
  if (Array.isArray(raw)) {
    const items = raw.map(normalizeTransactionSummary);
    return {
      items,
      pendingActionCount: items.filter((item) => item.needsViewerAction).length,
      counts: null,
      page: 0,
      size: items.length || 20,
      totalElements: items.length,
      totalPages: items.length > 0 ? 1 : 0,
    };
  }
  const rec = asRecord(raw);
  const items = Array.isArray(rec.items) ? rec.items.map(normalizeTransactionSummary) : [];
  const page = Math.max(0, asNumber(rec.page, 0));
  const size = Math.max(1, asNumber(rec.size, items.length || 20));
  const totalElements = Math.max(0, asNumber(rec.totalElements ?? rec.total_elements, items.length));
  const totalPages = Math.max(
    0,
    asNumber(rec.totalPages ?? rec.total_pages, Math.ceil(totalElements / size)),
  );
  const pendingActionCount = Math.max(
    0,
    asNumber(
      rec.pendingActionCount ?? rec.pending_action_count,
      items.filter((item) => item.needsViewerAction).length,
    ),
  );
  const counts = normalizeStatusCounts(rec.counts);

  return { items, pendingActionCount, counts, page, size, totalElements, totalPages };
}

function normalizeHandoverProof(raw: unknown): HandoverProofInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = asRecord(raw);
  const photoUrl = asNullableString(rec.photoUrl ?? rec.photo_url);
  const rawPhotos = Array.isArray(rec.photos) ? rec.photos : [];
  const photos: HandoverProofPhoto[] = rawPhotos
    .map((entry) => {
      const p = asRecord(entry);
      const url = asNullableString(p.url);
      if (!url) return null;
      return {
        id: asString(p.id),
        url,
        contentType: asString(p.contentType ?? p.content_type, 'image/jpeg'),
        sizeBytes: Math.max(0, asNumber(p.sizeBytes ?? p.size_bytes, 0)),
        uploadedAt: asNullableString(p.uploadedAt ?? p.uploaded_at),
      };
    })
    .filter((entry): entry is HandoverProofPhoto => entry !== null);

  const primaryUrl = photoUrl ?? photos[0]?.url ?? null;
  if (!primaryUrl) return null;

  const normalizedPhotos: HandoverProofPhoto[] =
    photos.length > 0
      ? photos
      : [
          {
            id: asString(rec.photoId ?? rec.photo_id, 'primary'),
            url: primaryUrl,
            contentType: asString(rec.contentType ?? rec.content_type, 'image/jpeg'),
            sizeBytes: Math.max(0, asNumber(rec.sizeBytes ?? rec.size_bytes, 0)),
            uploadedAt: asNullableString(rec.uploadedAt ?? rec.uploaded_at),
          },
        ];

  return {
    photoId: asNullableString(rec.photoId ?? rec.photo_id) ?? normalizedPhotos[0]?.id ?? null,
    photoUrl: primaryUrl,
    photos: normalizedPhotos,
    uploadedAt: asNullableString(rec.uploadedAt ?? rec.uploaded_at) ?? normalizedPhotos[0]?.uploadedAt ?? null,
    note: asNullableString(rec.note),
    contentType: asString(rec.contentType ?? rec.content_type, normalizedPhotos[0]?.contentType ?? 'image/jpeg'),
  };
}

function normalizeOtpInfo(raw: unknown): HandoverOtpInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = asRecord(raw);
  const rawStatus = asString(rec.status, 'ACTIVE').toUpperCase() as HandoverOtpStatus;
  const status: HandoverOtpStatus = VALID_OTP_STATUSES.has(rawStatus) ? rawStatus : 'ACTIVE';
  const maxAttempts = Math.max(1, asNumber(rec.maxAttempts ?? rec.max_attempts, 5));
  const attemptsUsed = Math.max(0, Math.min(maxAttempts, asNumber(rec.attemptsUsed ?? rec.attempts_used, 0)));
  const remainingAttempts = Math.max(
    0,
    Math.min(maxAttempts, asNumber(rec.remainingAttempts ?? rec.remaining_attempts, maxAttempts - attemptsUsed)),
  );
  const inAppCode = asNullableString(rec.inAppCode ?? rec.in_app_code);

  return {
    id: asString(rec.id),
    status,
    issuedAt: asNullableString(rec.issuedAt ?? rec.issued_at),
    expiresAt: asNullableString(rec.expiresAt ?? rec.expires_at),
    remainingSeconds: Math.max(0, asNumber(rec.remainingSeconds ?? rec.remaining_seconds, 0)),
    ttlSeconds: Math.max(60, asNumber(rec.ttlSeconds ?? rec.ttl_seconds, 600)),
    reissueCount: Math.max(0, asNumber(rec.reissueCount ?? rec.reissue_count, 0)),
    attemptsUsed,
    maxAttempts,
    remainingAttempts,
    inAppCode: status === 'ACTIVE' ? inAppCode : null,
  };
}

function normalizeCancelRequest(raw: unknown): CancelRequestInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = asRecord(raw);
  const id = asNullableString(rec.id);
  if (!id) return null;

  const rawStatus = asString(rec.status, 'CHO_XAC_NHAN').toUpperCase() as CancelRequestStatus;
  const status: CancelRequestStatus = VALID_CANCEL_STATUSES.has(rawStatus) ? rawStatus : 'CHO_XAC_NHAN';
  const rawReason = asString(rec.reasonCode ?? rec.reason_code, 'OTHER').toUpperCase() as CancelReasonCode;
  const reasonCode: CancelReasonCode = VALID_CANCEL_REASONS.has(rawReason) ? rawReason : 'OTHER';
  const rawRole = asString(rec.requestedByRole ?? rec.requested_by_role, 'BUYER').toUpperCase();
  const requestedByRole: TransactionPartyRole = rawRole === 'SELLER' ? 'SELLER' : 'BUYER';

  return {
    id,
    status,
    requestedByRole,
    isViewerRequester: asBoolean(rec.isViewerRequester ?? rec.is_viewer_requester, false),
    reasonCode,
    reasonLabel: mapCancelReasonLabel(reasonCode, asNullableString(rec.reasonLabel ?? rec.reason_label)),
    reasonNote: asNullableString(rec.reasonNote ?? rec.reason_note),
    requestedAt: asNullableString(rec.requestedAt ?? rec.requested_at),
    respondedAt: asNullableString(rec.respondedAt ?? rec.responded_at),
    responseNote: asNullableString(rec.responseNote ?? rec.response_note),
  };
}

function normalizeTimeline(raw: unknown): TransactionTimelineEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, idx) => {
    const rec = asRecord(entry);
    const rawActor = asString(rec.actorRole ?? rec.actor_role, 'SYSTEM').toUpperCase();
    const actorRole: TimelineActorRole =
      rawActor === 'SELLER' || rawActor === 'BUYER' || rawActor === 'MODERATOR'
        ? rawActor
        : 'SYSTEM';
    return {
      id: asString(rec.id, `event-${idx}`),
      action: asString(rec.action ?? rec.hanhDong, 'UPDATED'),
      fromStatus: normalizeNullableStatus(rec.fromStatus ?? rec.from_status),
      toStatus: normalizeStatus(rec.toStatus ?? rec.to_status),
      actorRole,
      note: asNullableString(rec.note ?? rec.ghiChu),
      createdAt: asNullableString(rec.createdAt ?? rec.created_at),
    };
  });
}

export function normalizeTransactionDetail(raw: unknown): TransactionDetail {
  const rec = asRecord(raw);
  const nowMs = Date.now();
  const serverNow = asNullableString(rec.serverNow ?? rec.server_now);
  const clockOffsetMs = computeClockOffsetMs(serverNow, nowMs);

  const agreedPriceVnd = Math.max(0, asNumber(rec.agreedPriceVnd ?? rec.agreed_price_vnd, 0));
  const isFree = asBoolean(rec.isFree ?? rec.is_free, agreedPriceVnd === 0);

  const rawListing = asRecord(rec.listing);
  const rawListingThumb = asNullableString(rawListing.thumbnailUrl ?? rawListing.thumbnail_url);
  const rawListingStatus = asString(rawListing.status, 'GIU_CHO').toUpperCase() as ListingStatus;
  const listing: TransactionListingRef = {
    id: asString(rawListing.id ?? rec.listingId),
    title: asString(rawListing.title ?? rec.listingTitle, 'Tin đăng'),
    thumbnailUrl: rawListingThumb ? resolveMediaUrl(rawListingThumb) : null,
    isCombo: asBoolean(rawListing.isCombo ?? rawListing.is_combo, false),
    isFree: asBoolean(rawListing.isFree ?? rawListing.is_free, isFree),
    status: VALID_LISTING_STATUSES.has(rawListingStatus) ? rawListingStatus : 'GIU_CHO',
  };

  const rawItems = Array.isArray(rec.items) ? rec.items : [];
  const items: TransactionItemRef[] = rawItems.map((entry, idx) => {
    const item = asRecord(entry);
    const rawItemStatus = asString(item.status, 'DANG_GIU').toUpperCase() as InventoryItemStatus;
    const rawItemThumb = asNullableString(item.thumbnailUrl ?? item.thumbnail_url);
    return {
      id: asString(item.id, `item-${idx}`),
      name: asString(item.name, 'Đồ vật'),
      condition: asString(item.condition),
      status: VALID_ITEM_STATUSES.has(rawItemStatus) ? rawItemStatus : 'DANG_GIU',
      thumbnailUrl: rawItemThumb ? resolveMediaUrl(rawItemThumb) : null,
    };
  });

  const rawActions = asRecord(rec.actions);
  const actions: TransactionActions = {
    canReportDelivered: asBoolean(rawActions.canReportDelivered ?? rawActions.can_report_delivered, false),
    canVerifyOtp: asBoolean(rawActions.canVerifyOtp ?? rawActions.can_verify_otp, false),
    canReissueOtp: asBoolean(rawActions.canReissueOtp ?? rawActions.can_reissue_otp, false),
    canRequestCancel: asBoolean(rawActions.canRequestCancel ?? rawActions.can_request_cancel, false),
    canRespondCancel: asBoolean(rawActions.canRespondCancel ?? rawActions.can_respond_cancel, false),
    canViewHandoverPhoto: asBoolean(rawActions.canViewHandoverPhoto ?? rawActions.can_view_handover_photo, false),
  };

  const rawAutoEscalateRemaining =
    rec.autoEscalateRemainingSeconds ?? rec.auto_escalate_remaining_seconds;
  const autoEscalateAt = asNullableString(rec.autoEscalateAt ?? rec.auto_escalate_at);
  const autoEscalateRemainingSeconds =
    rawAutoEscalateRemaining !== undefined && rawAutoEscalateRemaining !== null
      ? Math.max(0, asNumber(rawAutoEscalateRemaining, 0))
      : autoEscalateAt
        ? computeRemainingSeconds(autoEscalateAt, clockOffsetMs, nowMs)
        : null;

  return {
    id: asString(rec.id),
    version: Math.max(0, asNumber(rec.version, 0)),
    serverNow,
    receivedAtMs: nowMs,
    clockOffsetMs,
    status: normalizeStatus(rec.status),
    viewerRole: normalizeViewerRole(rec.viewerRole ?? rec.viewer_role),
    agreedPriceVnd,
    isFree,
    appointmentAt: asNullableString(rec.appointmentAt ?? rec.appointment_at),
    appointmentLocation: asNullableString(rec.appointmentLocation ?? rec.appointment_location),
    deliveryStartedAt: asNullableString(rec.deliveryStartedAt ?? rec.delivery_started_at),
    deliveredAt: asNullableString(rec.deliveredAt ?? rec.delivered_at),
    autoEscalateAt,
    autoEscalateRemainingSeconds,
    completedAt: asNullableString(rec.completedAt ?? rec.completed_at),
    cancelledAt: asNullableString(rec.cancelledAt ?? rec.cancelled_at),
    escalationReason: normalizeEscalationReason(rec.escalationReason ?? rec.escalation_reason),
    escalatedAt: asNullableString(rec.escalatedAt ?? rec.escalated_at),
    listing,
    items,
    counterparty: normalizeCounterparty(rec.counterparty),
    seller: normalizeNullableCounterparty(rec.seller),
    buyer: normalizeNullableCounterparty(rec.buyer),
    handoverProof: normalizeHandoverProof(rec.handoverProof ?? rec.handover_proof),
    otp: normalizeOtpInfo(rec.otp),
    cancellationRequest: normalizeCancelRequest(rec.cancellationRequest ?? rec.cancellation_request),
    actions,
    timeline: normalizeTimeline(rec.timeline),
  };
}
