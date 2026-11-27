import { resolveMediaUrl } from '../api/client';

export type InventoryItemStatus = 'KHA_DUNG' | 'DANG_GIU' | 'DA_CHUYEN_GIAO';

export interface LinkedListing {
  id: string;
  tieuDe?: string;
  title?: string;
  trangThai?: string;
  status?: string;
}

export interface InventoryItem {
  id: string;
  ten: string;
  tinhTrang: string;
  hinhAnh: string[];
  trangThai: InventoryItemStatus;
  linkedListingCount: number;
  canEdit: boolean;
  canDelete: boolean;
  version?: number;
  nguoiSoHuuId?: string;
  linkedListings?: LinkedListing[];
  name?: string;
  description?: string;
  images?: string[];
  status?: string;
  can_edit?: boolean;
  can_delete?: boolean;
  linked_listing_count?: number;
}

export interface CreateInventoryItemInput {
  ten: string;
  tinhTrang: string;
  hinhAnh: string[];
}

export interface UpdateInventoryItemInput {
  ten?: string;
  tinhTrang: string;
  hinhAnh: string[];
  version?: number;
}

export function normalizeInventoryItem(raw: any): InventoryItem {
  if (!raw) {
    throw new Error('Dữ liệu đồ vật không hợp lệ.');
  }

  const rawImages = raw.hinhAnh ?? raw.hinh_anh ?? raw.images ?? [];
  const hinhAnh = Array.isArray(rawImages)
    ? rawImages.map((entry) => resolveMediaUrl(String(entry))).filter(Boolean)
    : [];
  const trangThai = (raw.trangThai ?? raw.trang_thai ?? raw.status ?? 'KHA_DUNG') as InventoryItemStatus;
  const linkedListings = raw.linkedListings ?? raw.linked_listings ?? [];
  const linkedListingCount = Number(
    raw.linkedListingCount ?? raw.linked_listing_count ?? (Array.isArray(linkedListings) ? linkedListings.length : 0),
  );

  const canEdit = Boolean(
    raw.canEdit ?? raw.can_edit ?? (trangThai === 'KHA_DUNG' && linkedListingCount === 0),
  );
  const canDelete = Boolean(
    raw.canDelete ?? raw.can_delete ?? (trangThai === 'KHA_DUNG' && linkedListingCount === 0),
  );

  return {
    id: String(raw.id ?? ''),
    ten: String(raw.ten ?? raw.name ?? ''),
    tinhTrang: String(raw.tinhTrang ?? raw.tinh_trang ?? raw.description ?? ''),
    hinhAnh,
    trangThai,
    linkedListingCount,
    canEdit,
    canDelete,
    version: raw.version != null ? Number(raw.version) : undefined,
    nguoiSoHuuId: raw.nguoiSoHuuId ?? raw.nguoi_so_huu_id,
    linkedListings: Array.isArray(linkedListings) ? linkedListings : [],
  };
}
