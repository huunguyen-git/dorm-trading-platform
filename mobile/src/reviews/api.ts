import { api } from '../api/client';
import {
  extractApiError,
  isRestrictedError,
  type ExtractedApiError,
} from '../listings/sellerApi';
import {
  validateImageAsset,
  type AllowedImageMimeType,
  type PickableImageAsset,
} from '../media/imagePicker';
import {
  MAX_REVIEW_EVIDENCE,
  normalizeOrderReviewState,
  normalizeReviewEvidenceItem,
  normalizeReviewMutationResponse,
  normalizeSellerReviewsResponse,
  type CreateReviewPayload,
  type OrderReviewState,
  type ReviewEvidenceItem,
  type ReviewMutationResponse,
  type SellerReviewsResponse,
  type UpdateReviewPayload,
} from './types';

const MIME_TO_EXT: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function resolveEvidenceFileName(
  asset: PickableImageAsset,
  mimeType: AllowedImageMimeType,
  index: number,
): string {
  const candidate = (asset.fileName ?? asset.file?.name ?? '').trim();
  if (candidate) return candidate;
  const withoutQuery = asset.uri.split('?')[0]?.split('#')[0] ?? '';
  const tail = withoutQuery.split('/').pop()?.trim() ?? '';
  if (tail && /\.[a-z0-9]{2,5}$/i.test(tail)) {
    return tail;
  }
  return `review-evidence-${index + 1}.${MIME_TO_EXT[mimeType]}`;
}

const REVIEW_FRIENDLY_ERRORS: Record<string, string> = {
  REVIEW_DETAILS_REQUIRED:
    'Đánh giá 1–3 sao bắt buộc nhập nhận xét hoặc đính kèm ít nhất 1 ảnh bằng chứng.',
  REVIEW_NO_CHANGES: 'Bạn chưa thay đổi số sao, nhận xét hoặc bằng chứng nào so với phiên bản cũ.',
  REVIEW_ALREADY_EXISTS:
    'Giao dịch này đã được đánh giá. Bạn có thể chọn "Chỉnh sửa đánh giá" để cập nhật.',
  REVIEW_WINDOW_EXPIRED:
    'Đã hết thời hạn 15 ngày kể từ khi giao dịch hoàn tất nên không thể đánh giá hoặc chỉnh sửa.',
  NO_REVIEW_BONUS_APPLIED:
    'Giao dịch đã hết hạn 15 ngày và đã cộng +1 điểm uy tín cho người bán nên không thể đánh giá.',
  NO_REVIEW_BONUS_ALREADY_APPLIED:
    'Giao dịch đã hết hạn 15 ngày và đã cộng +1 điểm uy tín cho người bán nên không thể đánh giá.',
  REVIEW_MODERATED:
    'Đánh giá đã có quyết định xét duyệt từ Kiểm duyệt viên nên không thể chỉnh sửa hoặc xóa.',
  REVIEW_COMPLAINT_LOCKED:
    'Đánh giá đang bị khiếu nại hoặc đã có kết quả xử lý khiếu nại nên không thể chỉnh sửa hoặc xóa.',
  REVIEW_DELETED: 'Đánh giá này đã bị xóa trước đó.',
  VERSION_CONFLICT:
    'Đánh giá vừa thay đổi từ thao tác khác. Vui lòng tải lại phiên bản mới nhất trước khi lưu.',
  ORDER_NOT_COMPLETED: 'Chỉ có thể đánh giá sau khi giao dịch chuyển sang trạng thái Hoàn tất.',
  ORDER_NOT_FOUND: 'Không tìm thấy giao dịch yêu cầu.',
  REVIEW_NOT_FOUND: 'Không tìm thấy đánh giá yêu cầu.',
  SELLER_NOT_FOUND: 'Không tìm thấy hồ sơ người bán.',
  INVALID_MEDIA: 'Tệp bằng chứng không hợp lệ. Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.',
  FILE_TOO_LARGE: 'Kích thước mỗi ảnh bằng chứng không được vượt quá 5MB.',
  MEDIA_QUOTA_EXCEEDED: 'Bạn đã vượt giới hạn lưu trữ ảnh bằng chứng. Vui lòng thử lại sau.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này trên giao dịch hoặc đánh giá.',
};

export function extractReviewApiError(error: unknown, fallback: string): ExtractedApiError {
  if (isRestrictedError(error)) {
    return extractApiError(error, fallback);
  }
  const base = extractApiError(error, fallback);
  const rawMessage =
    typeof base.message === 'string' && !base.message.startsWith('API ') ? base.message.trim() : '';
  if (base.code && base.code in REVIEW_FRIENDLY_ERRORS) {
    return {
      ...base,
      message: rawMessage || REVIEW_FRIENDLY_ERRORS[base.code],
    };
  }
  return {
    ...base,
    message: rawMessage || fallback,
  };
}

export async function fetchOrderReviewState(orderId: string): Promise<OrderReviewState> {
  const data = await api<unknown>(`/orders/${encodeURIComponent(orderId)}/review`);
  return normalizeOrderReviewState(data);
}

export async function uploadReviewEvidence(
  orderId: string,
  assets: PickableImageAsset[],
): Promise<ReviewEvidenceItem[]> {
  if (!Array.isArray(assets) || assets.length === 0) {
    return [];
  }
  if (assets.length > MAX_REVIEW_EVIDENCE) {
    throw new Error(`Chỉ được tải lên tối đa ${MAX_REVIEW_EVIDENCE} ảnh bằng chứng mỗi lần.`);
  }

  const validated: Array<{ asset: PickableImageAsset; mimeType: AllowedImageMimeType }> = [];
  for (const asset of assets) {
    const check = validateImageAsset(asset);
    if (!check.valid || !check.mimeType) {
      throw new Error(check.error ?? 'Tệp bằng chứng không hợp lệ.');
    }
    validated.push({ asset, mimeType: check.mimeType });
  }

  const formData = new FormData();
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

  const response = await api<{ items?: unknown[] }>(
    `/orders/${encodeURIComponent(orderId)}/review/evidence`,
    {
      method: 'POST',
      body: formData,
    },
  );

  const items = Array.isArray(response?.items) ? response.items : [];
  return items.map(normalizeReviewEvidenceItem).filter((item) => Boolean(item.id && item.url));
}

function dedupeEvidenceIds(ids?: string[]): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

export async function createOrderReview(
  orderId: string,
  payload: CreateReviewPayload,
): Promise<ReviewMutationResponse> {
  const headers: Record<string, string> = {};
  if (payload.idempotencyKey?.trim()) {
    headers['Idempotency-Key'] = payload.idempotencyKey.trim();
  }
  const data = await api<unknown>(`/orders/${encodeURIComponent(orderId)}/review`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      rating: payload.rating,
      comment: payload.comment?.trim() ? payload.comment.trim() : null,
      evidenceIds: dedupeEvidenceIds(payload.evidenceIds),
      ...(payload.idempotencyKey?.trim() ? { idempotencyKey: payload.idempotencyKey.trim() } : {}),
    }),
  });
  return normalizeReviewMutationResponse(data);
}

export async function updateReview(
  reviewId: string,
  payload: UpdateReviewPayload,
): Promise<ReviewMutationResponse> {
  const data = await api<unknown>(`/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      rating: payload.rating,
      comment: payload.comment?.trim() ? payload.comment.trim() : null,
      evidenceIds: dedupeEvidenceIds(payload.evidenceIds),
      expectedVersion: payload.expectedVersion,
    }),
  });
  return normalizeReviewMutationResponse(data);
}

export async function deleteReview(
  reviewId: string,
  expectedVersion?: number,
): Promise<ReviewMutationResponse> {
  const query =
    typeof expectedVersion === 'number' && Number.isFinite(expectedVersion)
      ? `?expectedVersion=${encodeURIComponent(String(expectedVersion))}`
      : '';
  const data = await api<unknown>(`/reviews/${encodeURIComponent(reviewId)}${query}`, {
    method: 'DELETE',
  });
  return normalizeReviewMutationResponse(data);
}

export async function fetchSellerReviews(
  sellerId: string,
  params?: { rating?: number | null; page?: number; size?: number },
): Promise<SellerReviewsResponse | null> {
  const query = new URLSearchParams();
  if (
    typeof params?.rating === 'number' &&
    Number.isInteger(params.rating) &&
    params.rating >= 1 &&
    params.rating <= 5
  ) {
    query.set('rating', String(params.rating));
  }
  query.set('page', String(Math.max(0, params?.page ?? 0)));
  query.set('size', String(Math.max(1, params?.size ?? 20)));
  const raw = await api<unknown>(
    `/sellers/${encodeURIComponent(sellerId)}/reviews?${query.toString()}`,
  );
  return normalizeSellerReviewsResponse(raw);
}
