import { api, ApiError, RestrictedAccountError } from '../api/client';
import {
  validateImageAsset,
  type AllowedImageMimeType,
  type PickableImageAsset,
} from '../media/imagePicker';
import {
  MAX_REPORT_IMAGES,
  type ChatEvidenceConversation,
  type CreateReportPayload,
  type ReportCategory,
  type ReportSubmissionResult,
  type ReportTargetType,
  type UploadedReportEvidence,
} from './types';

const MIME_TO_EXTENSION: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function resolveEvidenceFilename(
  asset: PickableImageAsset,
  mimeType: AllowedImageMimeType,
  index: number,
): string {
  const candidate = (asset.fileName ?? asset.file?.name ?? '').trim();
  if (candidate) return candidate;
  const tail = (asset.uri.split('?')[0]?.split('#')[0] ?? '').split('/').pop()?.trim() ?? '';
  if (tail && /\.[a-z0-9]{2,5}$/i.test(tail)) return tail;
  return `report-evidence-${index + 1}.${MIME_TO_EXTENSION[mimeType]}`;
}

export function isReportRestrictedError(error: unknown): error is RestrictedAccountError {
  return error instanceof RestrictedAccountError;
}

export function extractReportApiError(
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

export async function fetchReportCategories(targetType: ReportTargetType): Promise<ReportCategory[]> {
  const query = encodeURIComponent(targetType);
  const response = await api<{ items?: ReportCategory[] }>(`/reports/categories?targetType=${query}`);
  return Array.isArray(response?.items) ? response.items : [];
}

export async function fetchChatEvidenceOptions(
  targetType: ReportTargetType,
  targetId: string,
): Promise<ChatEvidenceConversation[]> {
  const qs = `targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`;
  const response = await api<{ conversations?: ChatEvidenceConversation[] }>(
    `/reports/chat-evidence-options?${qs}`,
  );
  return Array.isArray(response?.conversations) ? response.conversations : [];
}

export async function uploadReportEvidenceImages(
  assets: PickableImageAsset[],
): Promise<UploadedReportEvidence[]> {
  if (!Array.isArray(assets) || assets.length === 0) {
    return [];
  }
  if (assets.length > MAX_REPORT_IMAGES) {
    throw new Error(`Chỉ được tải lên tối đa ${MAX_REPORT_IMAGES} ảnh bằng chứng mỗi lần.`);
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
    const fileName = resolveEvidenceFilename(asset, mimeType, index);
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

  const response = await api<{
    items?: Array<{
      id: string;
      originalFilename?: string | null;
      contentType?: string;
      sizeBytes?: number;
    }>;
  }>('/reports/evidence', {
    method: 'POST',
    body: formData,
  });

  const items = Array.isArray(response?.items) ? response.items : [];
  return items.map((item, idx) => ({
    id: String(item.id),
    localUri: validated[idx]?.asset.uri ?? '',
    originalFilename: item.originalFilename ?? validated[idx]?.asset.fileName ?? null,
    contentType: String(item.contentType ?? validated[idx]?.mimeType ?? 'image/jpeg'),
    sizeBytes: typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) ? item.sizeBytes : 0,
  }));
}

export async function submitReport(payload: CreateReportPayload): Promise<ReportSubmissionResult> {
  return api<ReportSubmissionResult>('/reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
