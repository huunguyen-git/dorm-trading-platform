import { api, RestrictedAccountError, toPersistableMediaUrl } from '../api/client';
import {
  normalizeCategory,
  normalizeCategoryTreeNode,
  normalizeListingDetail,
  normalizeListingMutationResponse,
  normalizeListingQuota,
  normalizeLocationZone,
  normalizeMyListingsPage,
  type CategoryTreeNode,
  type CreateListingPayload,
  type ListingCategory,
  type ListingDetail,
  type ListingMutationResponse,
  type ListingQuota,
  type ListingStatus,
  type LocationZone,
  type MyListingsPage,
  type UpdateListingPayload,
} from './types';

export interface ApiErrorShape extends Error {
  status?: number;
  code?: string;
}

export interface ReferenceData {
  categories: ListingCategory[];
  categoryTree: CategoryTreeNode[];
  locations: LocationZone[];
}

export interface ExtractedApiError {
  message: string;
  code?: string;
  status?: number;
  isRestricted: boolean;
}

let cachedReferenceData: ReferenceData | null = null;

export function clearReferenceDataCache(): void {
  cachedReferenceData = null;
}

export function isRestrictedError(error: unknown): error is RestrictedAccountError {
  return typeof RestrictedAccountError === 'function' && error instanceof RestrictedAccountError;
}

export function extractApiError(error: unknown, fallbackMessage: string): ExtractedApiError {
  if (isRestrictedError(error)) {
    return {
      message: error.message || fallbackMessage,
      code: 'ACCOUNT_RESTRICTED',
      status: 403,
      isRestricted: true,
    };
  }

  const err = error as ApiErrorShape | null | undefined;
  const code = typeof err?.code === 'string' && err.code.trim() ? err.code.trim() : undefined;
  const status = typeof err?.status === 'number' ? err.status : undefined;
  const rawMessage = typeof err?.message === 'string' ? err.message.trim() : '';

  const friendlyByCode: Record<string, string> = {
    QUOTA_EXCEEDED:
      'Bạn đã đạt hạn mức tin đăng đang mở/chờ duyệt. Bạn có thể lưu thành bản nháp hoặc rút bớt tin cũ.',
    VERSION_CONFLICT:
      'Tin đăng vừa được cập nhật từ thiết bị hoặc thao tác khác. Vui lòng tải lại phiên bản mới nhất trước khi lưu.',
    ITEM_STATUS_CONFLICT:
      'Một hoặc nhiều đồ vật đã chọn hiện đang được giữ chỗ hoặc đã chuyển giao, không thể sử dụng.',
    ITEM_NOT_OWNED:
      'Đồ vật được chọn không thuộc quyền sở hữu của tài khoản hiện tại.',
    LISTING_LOCKED:
      'Tin đăng hiện đang ở trạng thái khóa hoặc có giao dịch đang giữ chỗ, không thể chỉnh sửa/rút/xóa.',
    LISTING_HAS_TRANSACTIONS:
      'Tin đăng đã phát sinh lịch sử giao dịch nên không thể xóa vĩnh viễn. Vui lòng dùng chức năng "Rút tin".',
    INVALID_STATE_TRANSITION:
      'Không thể thực hiện thao tác này với trạng thái hiện tại của tin đăng.',
    INVALID_MEDIA:
      'Ảnh đính kèm không hợp lệ. Chỉ chấp nhận 1–5 ảnh định dạng JPEG, PNG hoặc WebP.',
    FILE_TOO_LARGE:
      'Kích thước ảnh vượt quá giới hạn cho phép (tối đa 5MB mỗi ảnh).',
    MEDIA_QUOTA_EXCEEDED:
      'Bạn đã vượt giới hạn lưu trữ hình ảnh cho phép. Vui lòng thử lại sau.',
    LISTING_NOT_FOUND:
      'Không tìm thấy tin đăng yêu cầu hoặc tin đăng đã bị xóa.',
  };

  if (code && code in friendlyByCode) {
    return {
      message: rawMessage && !rawMessage.startsWith('API ') ? rawMessage : friendlyByCode[code],
      code,
      status,
      isRestricted: false,
    };
  }

  return {
    message: rawMessage || fallbackMessage,
    code,
    status,
    isRestricted: false,
  };
}

function buildCategoryTree(items: ListingCategory[]): CategoryTreeNode[] {
  const map = new Map<string, CategoryTreeNode>();
  items.forEach((item) => {
    map.set(item.id, { ...item, children: [] });
  });

  const roots: CategoryTreeNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export async function fetchListingQuota(): Promise<ListingQuota> {
  const data = await api<unknown>('/listings/quota');
  return normalizeListingQuota(data);
}

export async function fetchMyListings(
  params?: { status?: ListingStatus | ''; page?: number; size?: number },
): Promise<MyListingsPage> {
  const searchParams = new URLSearchParams();
  if (params?.status) {
    searchParams.set('status', params.status);
  }
  if (typeof params?.page === 'number' && Number.isFinite(params.page) && params.page >= 0) {
    searchParams.set('page', String(Math.floor(params.page)));
  }
  if (typeof params?.size === 'number' && Number.isFinite(params.size) && params.size > 0) {
    searchParams.set('size', String(Math.floor(params.size)));
  }

  const query = searchParams.toString();
  const path = query ? `/listings/mine?${query}` : '/listings/mine';
  const data = await api<unknown>(path);
  return normalizeMyListingsPage(data);
}

export async function fetchSellerListingDetail(id: string): Promise<ListingDetail> {
  const data = await api<unknown>(`/listings/${encodeURIComponent(id)}`);
  return normalizeListingDetail(data);
}

export async function fetchReferenceData(options?: { force?: boolean }): Promise<ReferenceData> {
  if (!options?.force && cachedReferenceData) {
    return cachedReferenceData;
  }

  const [rawCategories, rawLocations] = await Promise.all([
    api<unknown>('/categories'),
    api<unknown>('/locations'),
  ]);

  const catRecord =
    rawCategories && typeof rawCategories === 'object' && !Array.isArray(rawCategories)
      ? (rawCategories as Record<string, unknown>)
      : {};
  const rawCategoryItems = Array.isArray(rawCategories)
    ? rawCategories
    : Array.isArray(catRecord.items)
      ? catRecord.items
      : [];
  const categories = rawCategoryItems.map(normalizeCategory).filter((item) => Boolean(item.id));

  const rawTree = Array.isArray(catRecord.tree) ? catRecord.tree : [];
  const categoryTree =
    rawTree.length > 0 ? rawTree.map(normalizeCategoryTreeNode) : buildCategoryTree(categories);

  const locRecord =
    rawLocations && typeof rawLocations === 'object' && !Array.isArray(rawLocations)
      ? (rawLocations as Record<string, unknown>)
      : {};
  const rawLocationItems = Array.isArray(rawLocations)
    ? rawLocations
    : Array.isArray(locRecord.items)
      ? locRecord.items
      : [];
  const locations = rawLocationItems.map(normalizeLocationZone).filter((zone) => Boolean(zone.code));

  const result: ReferenceData = {
    categories,
    categoryTree,
    locations,
  };
  cachedReferenceData = result;
  return result;
}

export async function createListing(payload: CreateListingPayload): Promise<ListingMutationResponse> {
  const normalizedPayload: CreateListingPayload = {
    ...payload,
    images: payload.images?.map(toPersistableMediaUrl),
  };
  const data = await api<unknown>('/listings', {
    method: 'POST',
    body: JSON.stringify(normalizedPayload),
  });
  return normalizeListingMutationResponse(data);
}

export async function updateListing(
  id: string,
  payload: UpdateListingPayload,
): Promise<ListingMutationResponse> {
  const normalizedPayload: UpdateListingPayload = {
    ...payload,
    images: payload.images?.map(toPersistableMediaUrl),
  };
  const data = await api<unknown>(`/listings/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(normalizedPayload),
  });
  return normalizeListingMutationResponse(data);
}

export async function publishListing(id: string, version: number): Promise<ListingMutationResponse> {
  const data = await api<unknown>(`/listings/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
  return normalizeListingMutationResponse(data);
}

export async function withdrawListing(id: string, version: number): Promise<ListingMutationResponse> {
  const data = await api<unknown>(`/listings/${encodeURIComponent(id)}/withdraw`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
  return normalizeListingMutationResponse(data);
}

export async function renewListing(id: string, version: number): Promise<ListingMutationResponse> {
  const data = await api<unknown>(`/listings/${encodeURIComponent(id)}/renew`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
  return normalizeListingMutationResponse(data);
}

export async function deleteListing(id: string, version: number): Promise<void> {
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    throw new Error('Thiếu thông tin phiên bản dữ liệu (version) để xóa tin đăng.');
  }
  await api<void>(`/listings/${encodeURIComponent(id)}?version=${encodeURIComponent(String(version))}`, {
    method: 'DELETE',
  });
}
