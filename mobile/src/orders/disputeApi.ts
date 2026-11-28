import { api, attachment } from '../api/client';
import { extractApiError, isRestrictedError } from '../listings/sellerApi';
import {
  validateImageAsset,
  type AllowedImageMimeType,
  type PickableImageAsset,
} from '../media/imagePicker';
import {
  DISPUTE_EVIDENCE_NOTE_MAX_LENGTH,
  DISPUTE_EVIDENCE_NOTE_MIN_LENGTH,
  MAX_DISPUTE_EVIDENCE_FILES,
  type DisputeAttachment,
  type DisputeConclusion,
  type DisputeEscalationReason,
  type DisputeEvidenceRequest,
  type DisputeEvidenceRequestStatus,
  type DisputeEvidenceResponse,
  type DisputePartyRole,
  type DisputeTargetParty,
  type DisputeTimelineActorRole,
  type DisputeTimelineEntry,
  type MemberDispute,
  type MemberDisputeDecision,
} from './disputeTypes';

const MIME_TO_EXT: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const DISPUTE_EVIDENCE_PATH_RE =
  /^\/orders\/[a-z0-9_-]+\/dispute\/evidence\/[a-z0-9_-]+$/i;

function resolveEvidenceFileName(
  asset: PickableImageAsset,
  mimeType: AllowedImageMimeType,
  index: number,
): string {
  const candidate = (asset.fileName ?? asset.file?.name ?? '').trim();
  if (candidate) {
    return candidate;
  }
  const withoutQuery = asset.uri.split('?')[0]?.split('#')[0] ?? '';
  const tail = withoutQuery.split('/').pop()?.trim() ?? '';
  if (tail && /\.[a-z0-9]{2,5}$/i.test(tail)) {
    return tail;
  }
  return `dispute-evidence-${index + 1}.${MIME_TO_EXT[mimeType]}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizePartyRole(value: unknown): DisputePartyRole {
  return value === 'SELLER' ? 'SELLER' : 'BUYER';
}

function normalizeTargetParty(value: unknown): DisputeTargetParty {
  if (value === 'BUYER' || value === 'SELLER' || value === 'BOTH') {
    return value;
  }
  return 'BOTH';
}

function normalizeEscalationReason(value: unknown): DisputeEscalationReason | null {
  if (value === 'OVERDUE_24H' || value === 'CANCEL_DISPUTE') {
    return value;
  }
  return null;
}

function normalizeEvidenceRequestStatus(value: unknown): DisputeEvidenceRequestStatus {
  if (
    value === 'CHO_BO_SUNG' ||
    value === 'DA_PHAN_HOI' ||
    value === 'QUA_HAN' ||
    value === 'DA_DONG'
  ) {
    return value;
  }
  return 'CHO_BO_SUNG';
}

function normalizeActorRole(value: unknown): DisputeTimelineActorRole {
  if (value === 'BUYER' || value === 'SELLER' || value === 'MODERATOR' || value === 'SYSTEM') {
    return value;
  }
  return 'SYSTEM';
}

function normalizeConclusion(value: unknown): DisputeConclusion | null {
  if (value === 'HOAN_TAT' || value === 'HUY') {
    return value;
  }
  return null;
}

function normalizeAttachment(raw: unknown): DisputeAttachment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  const url = asString(r.url);
  if (!id || !url) return null;
  return {
    id,
    url,
    originalFilename: asString(r.originalFilename),
    contentType: asString(r.contentType) ?? 'image/jpeg',
    sizeBytes: typeof r.sizeBytes === 'number' && Number.isFinite(r.sizeBytes) ? r.sizeBytes : 0,
    uploadedAt: asString(r.uploadedAt) ?? '',
  };
}

function normalizeEvidenceResponse(raw: unknown): DisputeEvidenceResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (!id) return null;
  const attachments = Array.isArray(r.attachments)
    ? r.attachments
        .map(normalizeAttachment)
        .filter((item): item is DisputeAttachment => item !== null)
    : [];
  return {
    id,
    senderRole: normalizePartyRole(r.senderRole),
    senderName: asString(r.senderName) ?? '',
    note: typeof r.note === 'string' ? r.note : '',
    createdAt: asString(r.createdAt) ?? '',
    attachments,
  };
}

function normalizeEvidenceRequest(raw: unknown): DisputeEvidenceRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (!id) return null;
  const responses = Array.isArray(r.responses)
    ? r.responses
        .map(normalizeEvidenceResponse)
        .filter((item): item is DisputeEvidenceResponse => item !== null)
    : [];
  return {
    id,
    targetParty: normalizeTargetParty(r.targetParty),
    instruction: typeof r.instruction === 'string' ? r.instruction : '',
    dueAt: asString(r.dueAt) ?? '',
    status: normalizeEvidenceRequestStatus(r.status),
    createdAt: asString(r.createdAt) ?? '',
    canSubmitResponse: Boolean(r.canSubmitResponse),
    hasViewerResponded: Boolean(r.hasViewerResponded),
    responses,
  };
}

function normalizeDecision(raw: unknown): MemberDisputeDecision | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  const conclusion = normalizeConclusion(r.conclusion);
  if (!id || !conclusion) return null;
  return {
    id,
    conclusion,
    basis: typeof r.basis === 'string' ? r.basis : '',
    decidedAt: asString(r.decidedAt) ?? '',
    listingStatusAfter: asString(r.listingStatusAfter),
    listingHiddenReason: asString(r.listingHiddenReason),
  };
}

function normalizeTimelineEntry(raw: unknown): DisputeTimelineEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (!id) return null;
  return {
    id,
    action: asString(r.action) ?? '',
    fromStatus: asString(r.fromStatus),
    toStatus: asString(r.toStatus) ?? '',
    actorRole: normalizeActorRole(r.actorRole),
    note: asString(r.note),
    createdAt: asString(r.createdAt) ?? '',
  };
}

export function normalizeMemberDispute(raw: unknown): MemberDispute | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const orderId = asString(r.orderId);
  if (!orderId) return null;

  const evidenceRequests = Array.isArray(r.evidenceRequests)
    ? r.evidenceRequests
        .map(normalizeEvidenceRequest)
        .filter((item): item is DisputeEvidenceRequest => item !== null)
    : [];

  const timeline = Array.isArray(r.timeline)
    ? r.timeline
        .map(normalizeTimelineEntry)
        .filter((item): item is DisputeTimelineEntry => item !== null)
    : [];

  return {
    orderId,
    status: asString(r.status) ?? '',
    version: typeof r.version === 'number' && Number.isFinite(r.version) ? r.version : 0,
    viewerRole: normalizePartyRole(r.viewerRole),
    escalationReason: normalizeEscalationReason(r.escalationReason),
    escalatedAt: asString(r.escalatedAt),
    responseDeadlineAt: asString(r.responseDeadlineAt),
    reviewDeadlineAt: asString(r.reviewDeadlineAt),
    decision: normalizeDecision(r.decision),
    evidenceRequests,
    timeline,
  };
}

export function normalizeDisputeEvidencePath(rawUrl: string): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let path = trimmed;
  if (path.startsWith('/api/v1/')) {
    path = path.slice('/api/v1'.length);
  }

  return DISPUTE_EVIDENCE_PATH_RE.test(path) ? path : null;
}

export async function fetchOrderDispute(orderId: string): Promise<MemberDispute | null> {
  const cleanedOrderId = orderId.trim();
  if (!cleanedOrderId) return null;
  try {
    const raw = await api<unknown>(`/orders/${encodeURIComponent(cleanedOrderId)}/dispute`);
    return normalizeMemberDispute(raw);
  } catch (err) {
    const status = (err as { status?: number } | null | undefined)?.status;
    if (status === 404) {
      return null;
    }
    throw err;
  }
}

export async function submitDisputeEvidenceResponse(
  orderId: string,
  requestId: string,
  note: string,
  files: PickableImageAsset[] = [],
): Promise<MemberDispute> {
  const cleanedOrderId = orderId.trim();
  const cleanedRequestId = requestId.trim();
  if (!cleanedOrderId || !cleanedRequestId) {
    throw new Error('Thiếu mã giao dịch hoặc mã yêu cầu bổ sung bằng chứng.');
  }

  const trimmedNote = (note ?? '').trim();
  if (trimmedNote.length < DISPUTE_EVIDENCE_NOTE_MIN_LENGTH) {
    throw new Error(
      `Nội dung bổ sung bằng chứng cần tối thiểu ${DISPUTE_EVIDENCE_NOTE_MIN_LENGTH} ký tự.`,
    );
  }
  if (trimmedNote.length > DISPUTE_EVIDENCE_NOTE_MAX_LENGTH) {
    throw new Error(
      `Nội dung bổ sung bằng chứng tối đa ${DISPUTE_EVIDENCE_NOTE_MAX_LENGTH} ký tự.`,
    );
  }

  const fileList = Array.isArray(files) ? files : [];
  if (fileList.length > MAX_DISPUTE_EVIDENCE_FILES) {
    throw new Error(`Chỉ được đính kèm tối đa ${MAX_DISPUTE_EVIDENCE_FILES} ảnh bằng chứng.`);
  }

  const validated: Array<{ asset: PickableImageAsset; mimeType: AllowedImageMimeType }> = [];
  for (const asset of fileList) {
    const check = validateImageAsset(asset);
    if (!check.valid || !check.mimeType) {
      throw new Error(check.error ?? 'Ảnh bằng chứng không hợp lệ.');
    }
    validated.push({ asset, mimeType: check.mimeType });
  }

  const formData = new FormData();
  formData.append('note', trimmedNote);
  validated.forEach(({ asset, mimeType }, index) => {
    const fileName = resolveEvidenceFileName(asset, mimeType, index);
    if (asset.file) {
      formData.append('files', asset.file, fileName);
    } else {
      formData.append(
        'files',
        {
          uri: asset.uri,
          name: fileName,
          type: mimeType,
        } as unknown as Blob,
      );
    }
  });

  const raw = await api<unknown>(
    `/orders/${encodeURIComponent(cleanedOrderId)}/dispute/evidence-requests/${encodeURIComponent(cleanedRequestId)}/responses`,
    {
      method: 'POST',
      body: formData,
    },
  );

  const normalized = normalizeMemberDispute(raw);
  if (!normalized) {
    throw new Error('Phản hồi từ máy chủ không hợp lệ sau khi gửi bằng chứng.');
  }
  return normalized;
}

export async function fetchDisputeEvidenceDataUri(rawUrl: string): Promise<string | null> {
  const path = normalizeDisputeEvidencePath(rawUrl);
  if (!path) return null;
  const file = await attachment(path);
  if (!file) return null;
  const bytes = new Uint8Array(file.bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  if (typeof globalThis.btoa === 'function') {
    return `data:${file.type};base64,${globalThis.btoa(binary)}`;
  }
  return null;
}

const DISPUTE_FRIENDLY_ERRORS: Record<string, string> = {
  DISPUTE_ALREADY_RESOLVED:
    'Giao dịch này đã có quyết định của Kiểm duyệt viên. Vui lòng tải lại để xem kết quả mới nhất.',
  EVIDENCE_REQUEST_CLOSED: 'Yêu cầu bổ sung bằng chứng này đã đóng.',
  EVIDENCE_REQUEST_EXPIRED: 'Yêu cầu bổ sung bằng chứng này đã quá thời hạn nộp.',
  EVIDENCE_ALREADY_SUBMITTED: 'Bạn đã gửi phản hồi cho yêu cầu bổ sung này.',
  DISPUTE_FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này trên hồ sơ tranh chấp.',
  DISPUTE_NOT_FOUND: 'Không tìm thấy hồ sơ tranh chấp cho giao dịch này.',
};

export function extractDisputeError(error: unknown, fallbackMessage: string): string {
  if (isRestrictedError(error)) {
    return error.message || fallbackMessage;
  }
  const parsed = extractApiError(error, fallbackMessage);
  if (parsed.code && parsed.code in DISPUTE_FRIENDLY_ERRORS) {
    if (parsed.message && !parsed.message.startsWith('API ')) {
      return parsed.message;
    }
    return DISPUTE_FRIENDLY_ERRORS[parsed.code];
  }
  if (parsed.message && !parsed.message.startsWith('API ')) {
    return parsed.message;
  }
  return fallbackMessage;
}
