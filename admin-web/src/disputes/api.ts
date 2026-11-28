import { api, ApiError, attachment } from '../api/client';
import type {
  DisputeConclusion,
  DisputeDecisionPayload,
  DisputeDetail,
  DisputeEscalationReason,
  DisputePage,
  DisputeQueueQuery,
  DisputeQueueState,
  EvidenceRequestStatus,
  EvidenceTargetParty,
  PartyRole,
  RequestEvidencePayload,
  TimelineActorRole,
} from './types';

/**
 * Chuẩn hóa đường dẫn tệp đính kèm do backend trả về trước khi gọi `attachment(path)`.
 * `attachment()` đã tự ghép tiền tố `VITE_API_URL` (kết thúc bằng `/api/v1`),
 * nên cần loại bỏ `/api/v1` ở đầu nếu backend trả về `/api/v1/admin/disputes/...`.
 */
export function normalizeApiPath(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const pathname = parsed.pathname.startsWith('/api/v1/')
        ? parsed.pathname.slice('/api/v1'.length)
        : parsed.pathname === '/api/v1'
          ? '/'
          : parsed.pathname;
      return `${pathname}${parsed.search}`;
    } catch {
      return trimmed;
    }
  }

  if (trimmed.startsWith('/api/v1/')) {
    return trimmed.slice('/api/v1'.length);
  }
  if (trimmed === '/api/v1') {
    return '/';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export async function listDisputes(query: DisputeQueueQuery = {}): Promise<DisputePage> {
  const params = new URLSearchParams();
  params.set('reason', query.reason ?? 'ALL');
  params.set('queueState', query.queueState ?? 'ALL');
  params.set('q', (query.q ?? '').trim());
  params.set('page', String(query.page ?? 0));
  params.set('size', String(query.size ?? 20));
  return api<DisputePage>(`/admin/disputes?${params.toString()}`);
}

export async function getDisputeDetail(orderId: string): Promise<DisputeDetail> {
  return api<DisputeDetail>(`/admin/disputes/${encodeURIComponent(orderId)}`);
}

export async function completeDispute(
  orderId: string,
  payload: DisputeDecisionPayload,
): Promise<DisputeDetail> {
  return api<DisputeDetail>(`/admin/disputes/${encodeURIComponent(orderId)}/complete`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cancelDispute(
  orderId: string,
  payload: DisputeDecisionPayload,
): Promise<DisputeDetail> {
  return api<DisputeDetail>(`/admin/disputes/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function requestDisputeEvidence(
  orderId: string,
  payload: RequestEvidencePayload,
): Promise<DisputeDetail> {
  return api<DisputeDetail>(`/admin/disputes/${encodeURIComponent(orderId)}/request-evidence`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Tải ảnh bàn giao / bằng chứng bổ sung có xác thực Bearer token thành blob URL.
 * Ném lỗi rõ ràng khi không tồn tại (404 -> null) hoặc tải thất bại để kích hoạt cổng chặn UC-29 §3.3.
 */
export async function loadEvidenceBlobUrl(rawUrl: string): Promise<string> {
  const path = normalizeApiPath(rawUrl);
  if (!path) {
    throw new ApiError(400, 'Đường dẫn ảnh bằng chứng không hợp lệ.', 'INVALID_EVIDENCE_URL');
  }
  const blob = await attachment(path);
  if (!blob) {
    throw new ApiError(404, 'Không tìm thấy tệp ảnh bằng chứng trên hệ thống.', 'EVIDENCE_NOT_FOUND');
  }
  return URL.createObjectURL(blob);
}

export function formatShortOrderId(orderId: string): string {
  const compact = orderId.replace(/-/g, '');
  return `#${compact.slice(0, 8).toUpperCase()}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatVnd(amount: number | null | undefined, isFree = false): string {
  if (isFree || amount === 0) return 'Miễn phí';
  if (amount == null) return 'Thỏa thuận';
  return `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`;
}

export function formatFileSize(sizeBytes: number | null | undefined): string {
  if (sizeBytes == null || sizeBytes <= 0) return '';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatEscalationReason(reason: DisputeEscalationReason | null | undefined): string {
  if (reason === 'OVERDUE_24H') return 'Quá hạn 24 giờ';
  if (reason === 'CANCEL_DISPUTE') return 'Tranh chấp hủy';
  return 'Đang xem xét';
}

export function formatEscalationReasonShort(reason: DisputeEscalationReason | null | undefined): string {
  if (reason === 'OVERDUE_24H') return 'Quá hạn 24h';
  if (reason === 'CANCEL_DISPUTE') return 'Tranh chấp hủy';
  return 'Đang xem xét';
}

export function formatQueueState(state: DisputeQueueState): string {
  switch (state) {
    case 'READY':
      return 'Cần xử lý';
    case 'WAITING_EVIDENCE':
      return 'Chờ bổ sung';
    case 'RESOLVED':
      return 'Đã xử lý';
    default:
      return state;
  }
}

export function formatOrderStatus(status: string): string {
  switch (status) {
    case 'YEU_CAU':
      return 'Yêu cầu mua';
    case 'GIU_CHO':
      return 'Đang giữ chỗ';
    case 'DA_HEN_GIAO':
      return 'Đã hẹn giao';
    case 'DANG_GIAO':
      return 'Đang giao';
    case 'CHO_XAC_NHAN':
      return 'Chờ xác nhận bàn giao';
    case 'CHO_XU_LY':
      return 'Chờ xử lý';
    case 'HOAN_TAT':
      return 'Hoàn tất';
    case 'HUY':
      return 'Đã hủy';
    default:
      return status;
  }
}

export function formatListingStatus(status: string | null | undefined): string {
  if (!status) return '—';
  switch (status) {
    case 'CONG_KHAI':
      return 'Công khai';
    case 'GIU_CHO':
      return 'Đang giữ chỗ';
    case 'CHO_DUYET':
      return 'Chờ duyệt';
    case 'AN':
      return 'Đang ẩn';
    case 'DA_RUT':
      return 'Đã rút';
    case 'HET_HAN':
      return 'Hết hạn';
    case 'KET_THUC':
      return 'Đã kết thúc (Lưu trữ)';
    case 'NHAP':
      return 'Bản nháp';
    default:
      return status;
  }
}

export function formatItemStatus(status: string): string {
  switch (status) {
    case 'KHA_DUNG':
      return 'Còn hàng';
    case 'DANG_GIU':
      return 'Đang giữ chỗ';
    case 'DA_CHUYEN_GIAO':
      return 'Đã bán / Đã cho';
    case 'DA_XOA':
      return 'Đã xóa khỏi kho';
    default:
      return status;
  }
}

export function formatItemCondition(condition: string | null | undefined): string {
  if (!condition) return '—';
  switch (condition) {
    case 'MOI':
      return 'Mới';
    case 'NHU_MOI':
      return 'Như mới';
    case 'TOT':
      return 'Tốt';
    case 'KHA':
      return 'Khá';
    case 'CU':
      return 'Đã qua sử dụng';
    default:
      return condition;
  }
}

export function formatPartyRole(role: PartyRole | EvidenceTargetParty | TimelineActorRole | string): string {
  switch (role) {
    case 'BUYER':
      return 'Người mua';
    case 'SELLER':
      return 'Người bán';
    case 'BOTH':
      return 'Cả hai bên';
    case 'MODERATOR':
      return 'Kiểm duyệt viên';
    case 'SYSTEM':
      return 'Hệ thống';
    default:
      return role;
  }
}

export function formatEvidenceRequestStatus(status: EvidenceRequestStatus): string {
  switch (status) {
    case 'CHO_BO_SUNG':
      return 'Đang chờ bổ sung';
    case 'DA_PHAN_HOI':
      return 'Đã phản hồi';
    case 'QUA_HAN':
      return 'Quá hạn bổ sung';
    case 'DA_DONG':
      return 'Đã đóng';
    default:
      return status;
  }
}

export function formatScheduleStatus(status: string): string {
  switch (status) {
    case 'CHO_XAC_NHAN':
      return 'Chờ xác nhận';
    case 'DA_XAC_NHAN':
      return 'Đã xác nhận';
    case 'DA_CHAP_NHAN':
    case 'CHAP_NHAN':
      return 'Đã chấp nhận';
    case 'DA_THAY_THE':
      return 'Đã thay thế';
    case 'BI_TU_CHOI':
    case 'TU_CHOI':
      return 'Bị từ chối';
    case 'DA_HUY':
    case 'HUY':
      return 'Đã hủy';
    default:
      return status;
  }
}

export function formatCancelStatus(status: string): string {
  switch (status) {
    case 'CHO_XAC_NHAN':
      return 'Chờ xác nhận';
    case 'CHO_PHAN_HOI':
      return 'Chờ phản hồi';
    case 'DA_DONG_Y':
    case 'DONG_Y':
      return 'Đã đồng ý';
    case 'BI_TU_CHOI':
    case 'TU_CHOI':
      return 'Bị từ chối';
    case 'QUA_HAN':
      return 'Quá hạn phản hồi';
    case 'DA_CHUYEN_XU_LY':
      return 'Đã chuyển kiểm duyệt';
    case 'DA_DONG_DO_HOAN_TAT':
      return 'Đã đóng do hoàn tất';
    default:
      return status;
  }
}

export function formatConclusion(conclusion: DisputeConclusion): string {
  return conclusion === 'HOAN_TAT' ? 'Xác nhận hoàn tất' : 'Hủy giao dịch';
}

export function formatTimelineAction(action: string): string {
  switch (action) {
    case 'ORDER_CREATED':
      return 'Tạo yêu cầu giao dịch';
    case 'ORDER_ACCEPTED':
      return 'Người bán chấp nhận giữ chỗ';
    case 'SCHEDULE_PROPOSED':
      return 'Đề xuất lịch hẹn';
    case 'SCHEDULE_ACCEPTED':
      return 'Chốt lịch hẹn bàn giao';
    case 'DELIVERY_STARTED':
      return 'Bắt đầu bàn giao';
    case 'REPORTED_DELIVERED':
      return 'Người bán báo đã giao hàng';
    case 'AUTO_ESCALATED_OVERDUE_24H':
      return 'Tự động chuyển xử lý do quá hạn 24 giờ';
    case 'CANCEL_REQUESTED':
      return 'Gửi yêu cầu hủy giao dịch';
    case 'CANCEL_REJECTED':
      return 'Từ chối yêu cầu hủy';
    case 'CANCEL_ESCALATED':
      return 'Chuyển tranh chấp hủy lên kiểm duyệt';
    case 'MODERATOR_REQUESTED_EVIDENCE':
      return 'Kiểm duyệt viên yêu cầu bổ sung bằng chứng';
    case 'EVIDENCE_SUBMITTED':
    case 'DISPUTE_EVIDENCE_SUBMITTED':
      return 'Bên liên quan đã nộp bằng chứng bổ sung';
    case 'EVIDENCE_REQUEST_EXPIRED':
      return 'Hết hạn bổ sung bằng chứng';
    case 'MODERATOR_DECIDED_COMPLETE':
      return 'Kiểm duyệt viên quyết định hoàn tất giao dịch';
    case 'MODERATOR_DECIDED_CANCEL':
      return 'Kiểm duyệt viên quyết định hủy giao dịch';
    case 'BUYER_CONFIRMED_OTP':
      return 'Người mua xác nhận mã hoàn tất';
    case 'MUTUAL_CANCEL_COMPLETED':
      return 'Hai bên đồng thuận hủy giao dịch';
    default:
      return action;
  }
}
