import type { StatusTone } from '../components/ui';

export type DisputePartyRole = 'BUYER' | 'SELLER';
export type DisputeTargetParty = 'BUYER' | 'SELLER' | 'BOTH';
export type DisputeEscalationReason = 'OVERDUE_24H' | 'CANCEL_DISPUTE';
export type DisputeEvidenceRequestStatus =
  | 'CHO_BO_SUNG'
  | 'DA_PHAN_HOI'
  | 'QUA_HAN'
  | 'DA_DONG';
export type DisputeConclusion = 'HOAN_TAT' | 'HUY';
export type DisputeTimelineActorRole = 'SELLER' | 'BUYER' | 'SYSTEM' | 'MODERATOR';

export interface DisputeAttachment {
  id: string;
  url: string;
  originalFilename: string | null;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface DisputeEvidenceResponse {
  id: string;
  senderRole: DisputePartyRole;
  senderName: string;
  note: string;
  createdAt: string;
  attachments: DisputeAttachment[];
}

export interface DisputeEvidenceRequest {
  id: string;
  targetParty: DisputeTargetParty;
  instruction: string;
  dueAt: string;
  status: DisputeEvidenceRequestStatus;
  createdAt: string;
  canSubmitResponse: boolean;
  hasViewerResponded: boolean;
  responses: DisputeEvidenceResponse[];
}

export interface MemberDisputeDecision {
  id: string;
  conclusion: DisputeConclusion;
  basis: string;
  decidedAt: string;
  listingStatusAfter: string | null;
  listingHiddenReason: string | null;
}

export interface DisputeTimelineEntry {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  actorRole: DisputeTimelineActorRole;
  note: string | null;
  createdAt: string;
}

export interface MemberDispute {
  orderId: string;
  status: string;
  version: number;
  viewerRole: DisputePartyRole;
  escalationReason: DisputeEscalationReason | null;
  escalatedAt: string | null;
  responseDeadlineAt: string | null;
  reviewDeadlineAt: string | null;
  decision: MemberDisputeDecision | null;
  evidenceRequests: DisputeEvidenceRequest[];
  timeline: DisputeTimelineEntry[];
}

export const DISPUTE_EVIDENCE_NOTE_MIN_LENGTH = 3;
export const DISPUTE_EVIDENCE_NOTE_MAX_LENGTH = 2000;
export const MAX_DISPUTE_EVIDENCE_FILES = 5;

export function hasDisputeContent(
  dispute: MemberDispute | null | undefined,
): dispute is MemberDispute {
  if (!dispute || typeof dispute !== 'object') return false;
  const hasReason = dispute.escalationReason !== null && dispute.escalationReason !== undefined;
  const hasDecision = dispute.decision !== null && dispute.decision !== undefined;
  const hasEvidenceRequests =
    Array.isArray(dispute.evidenceRequests) && dispute.evidenceRequests.length > 0;
  return hasReason || hasDecision || hasEvidenceRequests || dispute.status === 'CHO_XU_LY';
}

export function getEscalationReasonMeta(reason: DisputeEscalationReason | null): {
  label: string;
  description: string;
  tone: StatusTone;
} {
  if (reason === 'OVERDUE_24H') {
    return {
      label: 'Quá hạn 24 giờ chưa xác nhận',
      description:
        'Người bán đã báo đã giao nhưng quá 24 giờ chưa có xác nhận nhận hàng từ người mua.',
      tone: 'warning',
    };
  }
  if (reason === 'CANCEL_DISPUTE') {
    return {
      label: 'Tranh chấp yêu cầu hủy',
      description:
        'Yêu cầu hủy giao dịch sau khi báo đã giao chưa đạt đồng thuận giữa hai bên.',
      tone: 'danger',
    };
  }
  return {
    label: 'Chờ Kiểm duyệt viên xem xét',
    description: 'Giao dịch đang được Kiểm duyệt viên rà soát hồ sơ theo quy định.',
    tone: 'danger',
  };
}

export function getTargetPartyLabel(party: DisputeTargetParty): string {
  switch (party) {
    case 'BUYER':
      return 'Người mua';
    case 'SELLER':
      return 'Người bán';
    case 'BOTH':
      return 'Cả hai bên';
  }
}

export function getEvidenceRequestStatusMeta(status: DisputeEvidenceRequestStatus): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case 'CHO_BO_SUNG':
      return { label: 'Chờ bổ sung', tone: 'warning' };
    case 'DA_PHAN_HOI':
      return { label: 'Đã phản hồi', tone: 'success' };
    case 'QUA_HAN':
      return { label: 'Quá hạn bổ sung', tone: 'danger' };
    case 'DA_DONG':
      return { label: 'Đã đóng', tone: 'neutral' };
  }
}

export function getTimelineActorLabel(role: DisputeTimelineActorRole): string {
  switch (role) {
    case 'BUYER':
      return 'Người mua';
    case 'SELLER':
      return 'Người bán';
    case 'MODERATOR':
      return 'Kiểm duyệt viên';
    case 'SYSTEM':
      return 'Hệ thống';
  }
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  YEU_CAU: 'Chờ duyệt',
  GIU_CHO: 'Đang giữ chỗ',
  DANG_GIAO: 'Đang giao hàng',
  CHO_XAC_NHAN: 'Chờ xác nhận',
  CHO_XU_LY: 'Chờ xử lý',
  HOAN_TAT: 'Hoàn tất',
  HUY: 'Đã hủy',
};

export function formatDisputeOrderStatus(status: string | null | undefined): string {
  if (!status) return '';
  return ORDER_STATUS_LABELS[status] ?? status;
}

const TIMELINE_ACTION_LABELS: Record<string, string> = {
  AUTO_ESCALATED_OVERDUE_24H: 'Tự động chuyển Chờ xử lý (quá hạn 24 giờ)',
  ORDER_ESCALATED_OVERDUE_24H: 'Chuyển Chờ xử lý do quá hạn 24 giờ',
  CANCEL_DISPUTE_ESCALATED: 'Chuyển Chờ xử lý do tranh chấp yêu cầu hủy',
  ORDER_ESCALATED_CANCEL_DISPUTE: 'Chuyển Chờ xử lý do tranh chấp yêu cầu hủy',
  MODERATOR_REQUESTED_EVIDENCE: 'Kiểm duyệt viên yêu cầu bổ sung bằng chứng',
  DISPUTE_EVIDENCE_REQUESTED: 'Kiểm duyệt viên yêu cầu bổ sung bằng chứng',
  EVIDENCE_SUBMITTED: 'Đã gửi bổ sung bằng chứng',
  DISPUTE_EVIDENCE_SUBMITTED: 'Đã gửi bổ sung bằng chứng',
  MEMBER_SUBMITTED_EVIDENCE: 'Thành viên gửi bổ sung bằng chứng',
  EVIDENCE_REQUEST_EXPIRED: 'Hết thời hạn bổ sung bằng chứng',
  MODERATOR_DECIDED_COMPLETE: 'Kiểm duyệt viên xác nhận hoàn tất giao dịch',
  MODERATOR_DECIDED_CANCEL: 'Kiểm duyệt viên quyết định hủy giao dịch',
  DISPUTE_RESOLVED_COMPLETED: 'Kiểm duyệt viên xác nhận hoàn tất giao dịch',
  DISPUTE_RESOLVED_CANCELLED: 'Kiểm duyệt viên quyết định hủy giao dịch',
  REPORT_DELIVERED: 'Người bán báo đã giao hàng',
  BUYER_CONFIRMED_OTP: 'Người mua xác nhận hoàn tất bằng mã OTP',
  CANCEL_REQUESTED: 'Gửi yêu cầu hủy sau báo giao',
  CANCEL_REJECTED: 'Từ chối yêu cầu hủy sau báo giao',
  CANCEL_CONFIRMED: 'Đồng ý hủy giao dịch',
};

export function getTimelineActionLabel(
  action: string,
  fromStatus: string | null,
  toStatus: string,
): string {
  const normalized = (action || '').trim().toUpperCase();
  if (normalized && normalized in TIMELINE_ACTION_LABELS) {
    return TIMELINE_ACTION_LABELS[normalized];
  }
  const fromLabel = formatDisputeOrderStatus(fromStatus);
  const toLabel = formatDisputeOrderStatus(toStatus);
  if (fromLabel && toLabel && fromLabel !== toLabel) {
    return `Chuyển trạng thái: ${fromLabel} → ${toLabel}`;
  }
  if (toLabel) {
    return `Cập nhật trạng thái: ${toLabel}`;
  }
  return action || 'Cập nhật hồ sơ xử lý';
}

export function formatEvidenceFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '';
  if (sizeBytes < 1024) return `${Math.round(sizeBytes)} B`;
  const kb = sizeBytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
