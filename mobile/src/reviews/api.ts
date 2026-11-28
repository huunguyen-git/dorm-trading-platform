import { api, ApiError, RestrictedAccountError } from '../api/client';
import {
  validateImageAsset,
  type AllowedImageMimeType,
  type PickableImageAsset,
} from '../media/imagePicker';
import {
  MAX_COMPLAINT_IMAGES,
  type ComplaintReason,
  type ComplaintSummary,
  type CreateComplaintPayload,
  type ReviewChatConversationOption,
  type SellerReceivedReview,
  type SupplementalRequestItem,
  type UploadedReviewEvidence,
} from './types';

const MIME_TO_EXT: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function resolveFilename(
  asset: PickableImageAsset,
  mimeType: AllowedImageMimeType,
  index: number,
): string {
  const candidate = (asset.fileName ?? asset.file?.name ?? '').trim();
  if (candidate) return candidate;
  const tail = (asset.uri.split('?')[0]?.split('#')[0] ?? '').split('/').pop()?.trim() ?? '';
  if (tail && /\.[a-z0-9]{2,5}$/i.test(tail)) return tail;
  return `complaint-evidence-${index + 1}.${MIME_TO_EXT[mimeType]}`;
}

export function isReviewRestrictedError(error: unknown): error is RestrictedAccountError {
  return error instanceof RestrictedAccountError;
}

export function extractReviewApiError(
  error: unknown,
  fallback: string,
): { message: string; code?: string; status?: number } {
  if (error instanceof ApiError) {
    const cleaned = error.message?.trim() ?? '';
    return {
      message: cleaned && !cleaned.startsWith('API ') ? cleaned : fallback,
      code: error.code,
      status: error.status,
    };
  }
  if (error instanceof Error) {
    const cleaned = error.message?.trim() ?? '';
    return {
      message: cleaned && !cleaned.startsWith('API ') ? cleaned : fallback,
    };
  }
  return { message: fallback };
}

export async function fetchComplaintReasons(): Promise<ComplaintReason[]> {
  const res = await api<{ items?: ComplaintReason[] }>('/review-complaints/reasons');
  return Array.isArray(res?.items) ? res.items : [];
}

export async function fetchSellerReceivedReviews(): Promise<SellerReceivedReview[]> {
  const res = await api<{ items?: SellerReceivedReview[] }>('/review-complaints/received');
  return Array.isArray(res?.items) ? res.items : [];
}

export async function fetchReviewChatEvidenceOptions(
  reviewId: string,
): Promise<ReviewChatConversationOption[]> {
  const res = await api<{ conversations?: ReviewChatConversationOption[] }>(
    `/review-complaints/chat-evidence-options?reviewId=${encodeURIComponent(reviewId)}`,
  );
  return Array.isArray(res?.conversations) ? res.conversations : [];
}

export async function uploadComplaintEvidenceImages(
  assets: PickableImageAsset[],
): Promise<UploadedReviewEvidence[]> {
  if (!Array.isArray(assets) || assets.length === 0) return [];
  if (assets.length > MAX_COMPLAINT_IMAGES) {
    throw new Error(`Chỉ được tải lên tối đa ${MAX_COMPLAINT_IMAGES} ảnh bằng chứng mỗi lần.`);
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
    const fileName = resolveFilename(asset, mimeType, index);
    if (asset.file) {
      formData.append('files', asset.file, fileName);
    } else {
      formData.append(
        'files',
        { uri: asset.uri, name: fileName, type: mimeType } as unknown as Blob,
      );
    }
  });

  const res = await api<{
    items?: Array<{ id: string; originalFilename?: string | null; contentType?: string; sizeBytes?: number }>;
  }>('/review-complaints/evidence', {
    method: 'POST',
    body: formData,
  });

  const items = Array.isArray(res?.items) ? res.items : [];
  return items.map((item, idx) => ({
    id: String(item.id),
    localUri: validated[idx]?.asset.uri ?? '',
    originalFilename: item.originalFilename ?? validated[idx]?.asset.fileName ?? null,
    contentType: String(item.contentType ?? validated[idx]?.mimeType ?? 'image/jpeg'),
    sizeBytes: typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) ? item.sizeBytes : 0,
  }));
}

export async function submitReviewComplaint(
  payload: CreateComplaintPayload,
): Promise<ComplaintSummary> {
  return api<ComplaintSummary>('/review-complaints', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function withdrawReviewComplaint(complaintId: string): Promise<ComplaintSummary> {
  return api<ComplaintSummary>(`/review-complaints/${encodeURIComponent(complaintId)}/withdraw`, {
    method: 'POST',
  });
}

export async function respondSupplementalRequest(
  requestId: string,
  responseNote: string,
  evidenceIds: string[] = [],
): Promise<SupplementalRequestItem> {
  return api<SupplementalRequestItem>(
    `/review-complaints/supplemental/${encodeURIComponent(requestId)}/respond`,
    {
      method: 'POST',
      body: JSON.stringify({ responseNote, evidenceIds }),
    },
  );
}
