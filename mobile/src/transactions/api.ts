import {
  api,
  ApiError,
  apiMultipart,
  attachment,
  RestrictedAccountError,
  type ApiErrorDetails,
} from '../api/client';
import { appendMultipartFile } from '../api/multipart';
import {
  validateImageAsset,
  type AllowedImageMimeType,
  type PickableImageAsset,
} from '../media/imagePicker';
import {
  normalizeTransactionDetail,
  normalizeTransactionListPage,
  type CancelDecision,
  type CancelReasonCode,
  type TransactionDetail,
  type TransactionListPage,
  type TransactionListStatusFilter,
  type TransactionRoleFilter,
} from './types';

export const MAX_HANDOVER_PHOTOS = 5;

export interface ExtractedTransactionError {
  message: string;
  code?: string;
  status?: number;
  isRestricted: boolean;
  isVersionConflict: boolean;
  attemptsUsed?: number;
  maxAttempts?: number;
  remainingAttempts?: number;
  locked?: boolean;
  expiresAt?: string | null;
}

const MIME_TO_EXT: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isRestrictedTransactionError(error: unknown): error is RestrictedAccountError {
  return typeof RestrictedAccountError === 'function' && error instanceof RestrictedAccountError;
}

function asOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function extractTransactionError(
  error: unknown,
  fallbackMessage: string,
): ExtractedTransactionError {
  if (isRestrictedTransactionError(error)) {
    return {
      message: error.message || fallbackMessage,
      code: 'ACCOUNT_RESTRICTED',
      status: 403,
      isRestricted: true,
      isVersionConflict: false,
    };
  }

  const err = error as (Partial<ApiError> & { details?: ApiErrorDetails }) | null | undefined;
  const code = typeof err?.code === 'string' && err.code.trim() ? err.code.trim() : undefined;
  const status = typeof err?.status === 'number' ? err.status : undefined;
  const rawMessage = typeof err?.message === 'string' ? err.message.trim() : '';
  const details = err?.details;

  const attemptsUsed = asOptionalFiniteNumber(details?.attemptsUsed);
  const maxAttempts = asOptionalFiniteNumber(details?.maxAttempts);
  const remainingAttempts = asOptionalFiniteNumber(details?.remainingAttempts);
  const locked = typeof details?.locked === 'boolean' ? details.locked : undefined;
  const expiresAt = typeof details?.expiresAt === 'string' ? details.expiresAt : undefined;

  const friendlyByCode: Record<string, string> = {
    OTP_INVALID:
      typeof remainingAttempts === 'number'
        ? `Mã không đúng, còn ${remainingAttempts}/${maxAttempts ?? 5} lượt.`
        : 'Mã không đúng. Vui lòng thử lại.',
    OTP_EXPIRED: 'Mã đã hết hạn. Hãy gửi lại mã mới.',
    OTP_ATTEMPTS_EXCEEDED:
      'Đã nhập sai 5/5 lượt. Hãy gửi lại mã mới — giữ chỗ vẫn được giữ nguyên.',
    OTP_ALREADY_USED: 'Mã này đã được dùng hoặc giao dịch đã hoàn tất.',
    HANDOVER_PHOTO_REQUIRED: 'Vui lòng thêm ít nhất 1 ảnh bàn giao.',
    INVALID_MEDIA: 'Định dạng ảnh chưa hỗ trợ. Chọn JPEG, PNG hoặc WebP.',
    FILE_TOO_LARGE: 'Ảnh vượt quá giới hạn 5MB.',
    VERSION_CONFLICT: 'Giao dịch vừa được cập nhật. Hãy tải lại trạng thái mới nhất.',
    INVALID_STATE_TRANSITION: 'Không thể thực hiện thao tác này lúc này. Hãy tải lại giao dịch.',
    CANCEL_REQUEST_ALREADY_PENDING: 'Đang có yêu cầu hủy chờ phản hồi.',
    TRANSACTION_FORBIDDEN: 'Bạn không có quyền truy cập giao dịch này.',
    TRANSACTION_NOT_FOUND: 'Không tìm thấy giao dịch.',
    INVALID_INPUT: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
  };

  const hasCleanServerMsg = Boolean(rawMessage && !rawMessage.startsWith('API '));
  const resolvedMessage =
    code && code in friendlyByCode
      ? hasCleanServerMsg
        ? rawMessage
        : friendlyByCode[code]
      : hasCleanServerMsg
        ? rawMessage
        : fallbackMessage;

  return {
    message: resolvedMessage,
    code,
    status,
    isRestricted: false,
    isVersionConflict: code === 'VERSION_CONFLICT',
    attemptsUsed,
    maxAttempts,
    remainingAttempts,
    locked,
    expiresAt,
  };
}

/**
 * Chuẩn hóa đường dẫn ảnh bàn giao riêng tư từ server (`/api/v1/transactions/...`)
 * về path tương đối cho `attachment()` (`/transactions/...`), tránh lặp `/api/v1`
 * và đảm bảo không gửi Bearer token sang host/đường dẫn ngoài `/transactions/`.
 */
export function normalizeHandoverAttachmentPath(rawUrl: string): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let path = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      path = parsed.pathname;
    } catch {
      return null;
    }
  }

  if (path.startsWith('/api/v1/')) {
    path = path.slice('/api/v1'.length);
  }

  if (!/^\/transactions\/[0-9a-zA-Z_-]+\/handover-photo(?:s\/[0-9a-zA-Z_-]+)?$/i.test(path)) {
    return null;
  }

  return path;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return globalThis.btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  throw new Error('Thiết bị không hỗ trợ giải mã ảnh riêng tư.');
}

export async function fetchHandoverPhotoDataUri(photoUrl: string): Promise<string | null> {
  const path = normalizeHandoverAttachmentPath(photoUrl);
  if (!path) {
    throw new Error('Đường dẫn ảnh bàn giao không hợp lệ.');
  }
  const file = await attachment(path);
  if (!file) return null;
  const bytes = new Uint8Array(file.bytes);
  return `data:${file.type};base64,${bytesToBase64(bytes)}`;
}

export async function fetchTransactions(params?: {
  role?: TransactionRoleFilter;
  status?: TransactionListStatusFilter;
  q?: string;
  page?: number;
  size?: number;
}): Promise<TransactionListPage> {
  const query = new URLSearchParams();
  if (params?.role) {
    query.set('role', params.role);
  }
  if (params?.status) {
    query.set('status', params.status);
  }
  const trimmedQ = params?.q?.trim();
  if (trimmedQ) {
    query.set('q', trimmedQ);
  }
  if (typeof params?.page === 'number' && Number.isFinite(params.page) && params.page >= 0) {
    query.set('page', String(Math.floor(params.page)));
  }
  if (typeof params?.size === 'number' && Number.isFinite(params.size) && params.size > 0) {
    query.set('size', String(Math.floor(params.size)));
  }
  const qs = query.toString();
  const data = await api<unknown>(qs ? `/transactions?${qs}` : '/transactions');
  return normalizeTransactionListPage(data);
}

export async function fetchTransactionDetail(id: string): Promise<TransactionDetail> {
  const data = await api<unknown>(`/transactions/${encodeURIComponent(id)}`);
  return normalizeTransactionDetail(data);
}

function resolveHandoverFileName(
  asset: PickableImageAsset,
  mimeType: AllowedImageMimeType,
  index: number,
): string {
  const candidate = (asset.fileName ?? asset.file?.name ?? '').trim();
  if (candidate) return candidate;
  const cleanUri = asset.uri.split('?')[0]?.split('#')[0] ?? '';
  const tail = cleanUri.split('/').pop()?.trim() ?? '';
  if (tail && /\.[a-z0-9]{2,5}$/i.test(tail)) return tail;
  return `handover-proof-${index + 1}.${MIME_TO_EXT[mimeType]}`;
}

export async function reportDelivered(
  id: string,
  payload: {
    photos: PickableImageAsset[];
    note?: string;
    version?: number;
  },
): Promise<TransactionDetail> {
  if (!Array.isArray(payload.photos) || payload.photos.length === 0) {
    throw new ApiError(
      400,
      'Vui lòng thêm ít nhất 1 ảnh bàn giao.',
      'HANDOVER_PHOTO_REQUIRED',
    );
  }
  if (payload.photos.length > MAX_HANDOVER_PHOTOS) {
    throw new ApiError(
      400,
      `Chỉ có thể đính kèm tối đa ${MAX_HANDOVER_PHOTOS} ảnh bàn giao.`,
      'INVALID_MEDIA',
    );
  }

  const validated: Array<{ asset: PickableImageAsset; mimeType: AllowedImageMimeType }> = [];
  for (const photo of payload.photos) {
    const check = validateImageAsset(photo);
    if (!check.valid || !check.mimeType) {
      throw new ApiError(400, check.error ?? 'Ảnh bàn giao không hợp lệ.', 'INVALID_MEDIA');
    }
    validated.push({ asset: photo, mimeType: check.mimeType });
  }

  const trimmedNote = payload.note?.trim();
  const hasVersion = typeof payload.version === 'number' && Number.isFinite(payload.version);
  const fieldName = validated.length === 1 ? 'file' : 'files';

  // FormData mới mỗi lần gửi để 401 refresh retry không tái sử dụng body đã đọc
  const data = await apiMultipart<unknown>(
    `/transactions/${encodeURIComponent(id)}/deliver`,
    async () => {
      const formData = new FormData();
      for (let index = 0; index < validated.length; index += 1) {
        const { asset, mimeType } = validated[index];
        const fileName = resolveHandoverFileName(asset, mimeType, index);
        await appendMultipartFile(formData, fieldName, {
          uri: asset.uri,
          name: fileName,
          type: mimeType,
          file: asset.file,
        });
      }
      if (trimmedNote) {
        formData.append('note', trimmedNote);
      }
      if (hasVersion) {
        formData.append('version', String(payload.version));
      }
      return formData;
    },
  );
  return normalizeTransactionDetail(data);
}

export async function completeTransactionWithOtp(
  id: string,
  payload: { otp: string; version: number },
): Promise<TransactionDetail> {
  const data = await api<unknown>(`/transactions/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      otp: payload.otp.replace(/\D/g, '').slice(0, 6),
      version: payload.version,
    }),
  });
  return normalizeTransactionDetail(data);
}

export async function reissueHandoverOtp(
  id: string,
  payload: { version: number },
): Promise<TransactionDetail> {
  const data = await api<unknown>(`/transactions/${encodeURIComponent(id)}/otp/reissue`, {
    method: 'POST',
    body: JSON.stringify({ version: payload.version }),
  });
  return normalizeTransactionDetail(data);
}

export async function createCancelRequest(
  id: string,
  payload: {
    reasonCode: CancelReasonCode;
    reasonNote?: string;
    version: number;
  },
): Promise<TransactionDetail> {
  const data = await api<unknown>(`/transactions/${encodeURIComponent(id)}/cancel-requests`, {
    method: 'POST',
    body: JSON.stringify({
      reasonCode: payload.reasonCode,
      reasonNote: payload.reasonNote?.trim() || null,
      version: payload.version,
    }),
  });
  return normalizeTransactionDetail(data);
}

export async function respondCancelRequest(
  id: string,
  requestId: string,
  payload: {
    decision: CancelDecision;
    responseNote?: string;
    version: number;
  },
): Promise<TransactionDetail> {
  const data = await api<unknown>(
    `/transactions/${encodeURIComponent(id)}/cancel-requests/${encodeURIComponent(requestId)}/respond`,
    {
      method: 'POST',
      body: JSON.stringify({
        decision: payload.decision,
        responseNote: payload.responseNote?.trim() || null,
        version: payload.version,
      }),
    },
  );
  return normalizeTransactionDetail(data);
}
