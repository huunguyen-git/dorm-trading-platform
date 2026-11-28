import { resolveMediaUrl } from '../api/client';
import type { InventoryItemStatus } from '../inventory/types';
import { semantic } from '../theme';

export type ListingStatus =
  | 'NHAP'
  | 'CHO_DUYET'
  | 'CONG_KHAI'
  | 'GIU_CHO'
  | 'DA_RUT'
  | 'HET_HAN'
  | 'AN'
  | 'KET_THUC';

export type ListingType = 'BAN_LE' | 'BAN_COMBO' | 'CHO_TANG';

export type ListingAction = 'PUBLISH' | 'DRAFT';

export type UpdateListingAction = 'KEEP' | 'PUBLISH';

export type LocationZoneGroup = 'KTX' | 'TRUONG' | 'LAN_CAN';

export type ListingSortOption = 'newest' | 'price_asc' | 'price_desc' | 'distance_asc';

export interface ListingCategory {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
}

export interface CategoryTreeNode extends ListingCategory {
  children: CategoryTreeNode[];
}

export interface LocationZone {
  code: string;
  name: string;
  group: LocationZoneGroup;
  latitude: number;
  longitude: number;
}

export interface ListingItemSummary {
  id: string;
  name: string;
  condition: string;
  status: InventoryItemStatus;
  images: string[];
}

export interface SellerPublicSummary {
  id: string;
  displayName: string;
  reputationScore: number;
  averageRating: number | null;
  reviewCount: number;
}

export interface ListingViewerContext {
  isOwner: boolean;
  canEdit: boolean;
  canWithdraw: boolean;
  canDelete: boolean;
  canPublish: boolean;
  canRenew: boolean;
  canMakeOffer: boolean;
  canReserve: boolean;
  canMessage: boolean;
}

export interface ListingQuota {
  reputationScore: number;
  activeCount: number;
  limit: number;
  remaining: number;
  canPublish: boolean;
  highTierThreshold: number;
  standardLimit: number;
  highTierLimit: number;
}

export interface ListingSummary {
  id: string;
  title: string;
  description: string;
  condition: string | null;
  priceVnd: number;
  listingType: ListingType;
  isCombo: boolean;
  isFree: boolean;
  status: ListingStatus;
  categoryId: string | null;
  categoryName: string | null;
  courseCode: string | null;
  courseName: string | null;
  author: string | null;
  locationCode: string | null;
  locationName: string | null;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  thumbnailUrl: string | null;
  images: string[];
  itemCount: number;
  seller: SellerPublicSummary;
  hasUnavailableItems: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  renewalReminderDue: boolean;
  renewalCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;
  activeTransactionId?: string | null;
}

export interface ListingDetail extends ListingSummary {
  category: ListingCategory | null;
  items: ListingItemSummary[];
  viewer: ListingViewerContext;
  pendingRequestCount: number;
  closedAt: string | null;
  hiddenReason: string | null;
}

export interface ListingPage {
  items: ListingSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface MyListingsPage extends ListingPage {
  quota: ListingQuota;
}

export interface ListingMutationResponse {
  listing: ListingDetail;
  quota: ListingQuota;
}

export interface CreateListingPayload {
  action: ListingAction;
  title: string;
  description: string;
  condition?: string | null;
  priceVnd: number;
  categoryId: string;
  locationCode?: string | null;
  locationText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  courseCode?: string | null;
  courseName?: string | null;
  author?: string | null;
  images: string[];
  itemIds: string[];
}

export interface UpdateListingPayload {
  action?: UpdateListingAction;
  title: string;
  description: string;
  condition?: string | null;
  priceVnd: number;
  categoryId: string;
  locationCode?: string | null;
  locationText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  courseCode?: string | null;
  courseName?: string | null;
  author?: string | null;
  images: string[];
  itemIds: string[];
  version: number;
}

export interface ListingSearchFilters {
  q?: string;
  categoryId?: string;
  courseCode?: string;
  minPrice?: number;
  maxPrice?: number;
  freeOnly?: boolean;
  type?: ListingType;
  locationCode?: string;
  location?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sort?: ListingSortOption;
  page?: number;
  size?: number;
  offset?: number;
}

export interface CategoriesResponse {
  items: ListingCategory[];
  tree: CategoryTreeNode[];
}

export interface LocationsResponse {
  items: LocationZone[];
}

export type ListingStatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
export type ListingStatusTier = 'dot' | 'soft' | 'urgent';

export interface ListingStatusMeta {
  label: string;
  bg: string;
  fg: string;
  tone: ListingStatusTone;
  tier: ListingStatusTier;
}

export const LISTING_STATUS_META: Record<ListingStatus, ListingStatusMeta> = {
  NHAP: {
    label: 'Bản nháp',
    bg: semantic.color.bgTrack,
    fg: semantic.color.textSecondary,
    tone: 'neutral',
    tier: 'dot',
  },
  CHO_DUYET: {
    label: 'Chờ duyệt',
    bg: semantic.color.warningSoft,
    fg: semantic.color.warning,
    tone: 'warning',
    tier: 'urgent',
  },
  CONG_KHAI: {
    label: 'Đang hiển thị',
    bg: semantic.color.successSoft,
    fg: semantic.color.success,
    tone: 'success',
    tier: 'dot',
  },
  GIU_CHO: {
    label: 'Đang giữ chỗ',
    bg: semantic.color.warningSoft,
    fg: semantic.color.warning,
    tone: 'warning',
    tier: 'urgent',
  },
  DA_RUT: {
    label: 'Đã rút tin',
    bg: semantic.color.bgSubtle,
    fg: semantic.color.textSecondary,
    tone: 'neutral',
    tier: 'dot',
  },
  HET_HAN: {
    label: 'Hết hạn',
    bg: semantic.color.dangerSoft,
    fg: semantic.color.danger,
    tone: 'danger',
    tier: 'dot',
  },
  AN: {
    label: 'Bị ẩn',
    bg: semantic.color.dangerSoft,
    fg: semantic.color.danger,
    tone: 'danger',
    tier: 'urgent',
  },
  KET_THUC: {
    label: 'Đã kết thúc',
    bg: semantic.color.bgTrack,
    fg: semantic.color.textSecondary,
    tone: 'neutral',
    tier: 'dot',
  },
};

export const LISTING_TYPE_LABELS: Record<ListingType, string> = {
  BAN_LE: 'Bán lẻ',
  BAN_COMBO: 'Combo',
  CHO_TANG: 'Cho tặng',
};

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

const VALID_LISTING_TYPES = new Set<ListingType>(['BAN_LE', 'BAN_COMBO', 'CHO_TANG']);

const VALID_ZONE_GROUPS = new Set<LocationZoneGroup>(['KTX', 'TRUONG', 'LAN_CAN']);

const VALID_ITEM_STATUSES = new Set<InventoryItemStatus>(['KHA_DUNG', 'DANG_GIU', 'DA_CHUYEN_GIAO']);

type RawRecord = Record<string, unknown>;

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

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0) return false;
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function normalizeListingStatus(raw: unknown): ListingStatus {
  const value = asString(raw, 'CONG_KHAI').toUpperCase() as ListingStatus;
  return VALID_LISTING_STATUSES.has(value) ? value : 'CONG_KHAI';
}

function normalizeListingType(raw: unknown, isCombo: boolean, isFree: boolean): ListingType {
  const value = asString(raw).toUpperCase() as ListingType;
  if (VALID_LISTING_TYPES.has(value)) {
    return value;
  }
  if (isCombo) return 'BAN_COMBO';
  if (isFree) return 'CHO_TANG';
  return 'BAN_LE';
}

function normalizeItemStatus(raw: unknown): InventoryItemStatus {
  const value = asString(raw, 'KHA_DUNG').toUpperCase() as InventoryItemStatus;
  return VALID_ITEM_STATUSES.has(value) ? value : 'KHA_DUNG';
}

export function normalizeCategory(raw: unknown): ListingCategory {
  const rec = asRecord(raw);
  return {
    id: asString(rec.id ?? rec.maDanhMuc ?? rec.ma_danh_muc),
    name: asString(rec.name ?? rec.ten),
    parentId: asNullableString(rec.parentId ?? rec.parent_id ?? rec.danhMucChaId ?? rec.danh_muc_cha_id),
    description: asNullableString(rec.description ?? rec.moTa ?? rec.mo_ta),
  };
}

export function normalizeCategoryTreeNode(raw: unknown): CategoryTreeNode {
  const rec = asRecord(raw);
  const base = normalizeCategory(rec);
  const rawChildren = Array.isArray(rec.children) ? rec.children : [];
  return {
    ...base,
    children: rawChildren.map(normalizeCategoryTreeNode),
  };
}

export function normalizeLocationZone(raw: unknown): LocationZone {
  const rec = asRecord(raw);
  const rawGroup = asString(rec.group ?? rec.nhom, 'KTX').toUpperCase() as LocationZoneGroup;
  return {
    code: asString(rec.code ?? rec.maKhuVuc ?? rec.ma_khu_vuc),
    name: asString(rec.name ?? rec.ten),
    group: VALID_ZONE_GROUPS.has(rawGroup) ? rawGroup : 'KTX',
    latitude: asNumber(rec.latitude ?? rec.viDo ?? rec.vi_do, 0),
    longitude: asNumber(rec.longitude ?? rec.kinhDo ?? rec.kinh_do, 0),
  };
}

export function normalizeListingQuota(raw: unknown): ListingQuota {
  const rec = asRecord(raw);
  const reputationScore = asNumber(rec.reputationScore ?? rec.reputation_score ?? rec.diemUyTin ?? rec.diem_uy_tin, 100);
  const highTierThreshold = asNumber(rec.highTierThreshold ?? rec.high_tier_threshold, 120);
  const standardLimit = asNumber(rec.standardLimit ?? rec.standard_limit, 5);
  const highTierLimit = asNumber(rec.highTierLimit ?? rec.high_tier_limit, 10);
  const derivedLimit = reputationScore >= highTierThreshold ? highTierLimit : standardLimit;
  const limit = asNumber(rec.limit, derivedLimit);
  const activeCount = Math.max(0, asNumber(rec.activeCount ?? rec.active_count, 0));
  const remaining = Math.max(0, asNumber(rec.remaining, Math.max(0, limit - activeCount)));
  const canPublish = asBoolean(rec.canPublish ?? rec.can_publish, activeCount < limit);

  return {
    reputationScore,
    activeCount,
    limit,
    remaining,
    canPublish,
    highTierThreshold,
    standardLimit,
    highTierLimit,
  };
}

function normalizeSellerPublicSummary(rawSeller: unknown, fallbackRecord: RawRecord): SellerPublicSummary {
  if (typeof rawSeller === 'string') {
    return {
      id: asString(fallbackRecord.sellerId ?? fallbackRecord.nguoiDangId ?? fallbackRecord.nguoi_dang_id),
      displayName: rawSeller.trim() || 'Thành viên',
      reputationScore: 100,
      averageRating: null,
      reviewCount: 0,
    };
  }
  const seller = asRecord(rawSeller);
  return {
    id: asString(seller.id ?? fallbackRecord.sellerId ?? fallbackRecord.nguoiDangId ?? fallbackRecord.nguoi_dang_id),
    displayName:
      asString(seller.displayName ?? seller.display_name ?? seller.name ?? seller.hoTen ?? seller.ho_ten).trim() ||
      'Thành viên',
    reputationScore: asNumber(seller.reputationScore ?? seller.reputation_score ?? seller.diemUyTin ?? seller.diem_uy_tin, 100),
    averageRating: asNullableNumber(seller.averageRating ?? seller.average_rating),
    reviewCount: Math.max(0, asNumber(seller.reviewCount ?? seller.review_count, 0)),
  };
}

function normalizeListingItemSummary(raw: unknown): ListingItemSummary {
  const rec = asRecord(raw);
  return {
    id: asString(rec.id ?? rec.maVat ?? rec.ma_vat),
    name: asString(rec.name ?? rec.ten),
    condition: asString(rec.condition ?? rec.tinhTrang ?? rec.tinh_trang),
    status: normalizeItemStatus(rec.status ?? rec.trangThai ?? rec.trang_thai),
    images: asStringArray(rec.images ?? rec.hinhAnh ?? rec.hinh_anh).map(resolveMediaUrl),
  };
}

function normalizeViewerContext(raw: unknown): ListingViewerContext {
  const rec = asRecord(raw);
  return {
    isOwner: asBoolean(rec.isOwner ?? rec.is_owner, false),
    canEdit: asBoolean(rec.canEdit ?? rec.can_edit, false),
    canWithdraw: asBoolean(rec.canWithdraw ?? rec.can_withdraw, false),
    canDelete: asBoolean(rec.canDelete ?? rec.can_delete, false),
    canPublish: asBoolean(rec.canPublish ?? rec.can_publish, false),
    canRenew: asBoolean(rec.canRenew ?? rec.can_renew, false),
    canMakeOffer: asBoolean(rec.canMakeOffer ?? rec.can_make_offer, false),
    canReserve: asBoolean(rec.canReserve ?? rec.can_reserve, false),
    canMessage: asBoolean(rec.canMessage ?? rec.can_message, false),
  };
}

export function normalizeListingSummary(raw: unknown): ListingSummary {
  const rec = asRecord(raw);
  const images = asStringArray(rec.images ?? rec.hinhAnh ?? rec.hinh_anh).map(resolveMediaUrl);
  const priceVnd = Math.max(0, asNumber(rec.priceVnd ?? rec.price_vnd ?? rec.giaVnd ?? rec.gia_vnd ?? rec.price, 0));
  const rawItems = Array.isArray(rec.items) ? rec.items : [];
  const itemCount = Math.max(0, asNumber(rec.itemCount ?? rec.item_count, rawItems.length));
  const isCombo = asBoolean(
    rec.isCombo ?? rec.is_combo,
    itemCount >= 2 || asString(rec.listingType ?? rec.listing_type ?? rec.hinhThuc ?? rec.hinh_thuc).toUpperCase() === 'BAN_COMBO',
  );
  const isFree = asBoolean(rec.isFree ?? rec.is_free, priceVnd === 0);
  const listingType = normalizeListingType(
    rec.listingType ?? rec.listing_type ?? rec.hinhThuc ?? rec.hinh_thuc,
    isCombo,
    isFree,
  );
  const rawThumbnail = asNullableString(rec.thumbnailUrl ?? rec.thumbnail_url);
  const thumbnailUrl = (rawThumbnail ? resolveMediaUrl(rawThumbnail) : null) ?? (images[0] ?? null);

  return {
    id: asString(rec.id ?? rec.maTin ?? rec.ma_tin),
    title: asString(rec.title ?? rec.tieuDe ?? rec.tieu_de),
    description: asString(rec.description ?? rec.moTa ?? rec.mo_ta),
    condition: asNullableString(rec.condition ?? rec.tinhTrang ?? rec.tinh_trang),
    priceVnd,
    listingType,
    isCombo,
    isFree,
    status: normalizeListingStatus(rec.status ?? rec.trangThai ?? rec.trang_thai),
    categoryId: asNullableString(rec.categoryId ?? rec.category_id ?? rec.maDanhMuc ?? rec.ma_danh_muc),
    categoryName: asNullableString(rec.categoryName ?? rec.category_name),
    courseCode: asNullableString(rec.courseCode ?? rec.course_code ?? rec.maMonHoc ?? rec.ma_mon_hoc),
    courseName: asNullableString(rec.courseName ?? rec.course_name ?? rec.tenMonHoc ?? rec.ten_mon_hoc),
    author: asNullableString(rec.author ?? rec.tacGia ?? rec.tac_gia),
    locationCode: asNullableString(rec.locationCode ?? rec.location_code ?? rec.maKhuVuc ?? rec.ma_khu_vuc),
    locationName: asNullableString(rec.locationName ?? rec.location_name),
    locationText: asNullableString(rec.locationText ?? rec.location_text ?? rec.khuVucText ?? rec.khu_vuc_text),
    latitude: asNullableNumber(rec.latitude ?? rec.viDo ?? rec.vi_do),
    longitude: asNullableNumber(rec.longitude ?? rec.kinhDo ?? rec.kinh_do),
    distanceKm: asNullableNumber(rec.distanceKm ?? rec.distance_km),
    thumbnailUrl,
    images,
    itemCount,
    seller: normalizeSellerPublicSummary(rec.seller, rec),
    hasUnavailableItems: asBoolean(rec.hasUnavailableItems ?? rec.has_unavailable_items, false),
    publishedAt: asNullableString(rec.publishedAt ?? rec.published_at),
    expiresAt: asNullableString(rec.expiresAt ?? rec.expires_at),
    renewalReminderDue: asBoolean(rec.renewalReminderDue ?? rec.renewal_reminder_due, false),
    renewalCount: Math.max(0, asNumber(rec.renewalCount ?? rec.renewal_count ?? rec.soLanGiaHan ?? rec.so_lan_gia_han, 0)),
    createdAt: asNullableString(rec.createdAt ?? rec.created_at),
    updatedAt: asNullableString(rec.updatedAt ?? rec.updated_at),
    version: Math.max(0, asNumber(rec.version, 0)),
    ...(asNullableString(rec.activeTransactionId ?? rec.active_transaction_id)
      ? { activeTransactionId: asNullableString(rec.activeTransactionId ?? rec.active_transaction_id) }
      : {}),
  };
}

export function normalizeListingDetail(raw: unknown): ListingDetail {
  const rec = asRecord(raw);
  const summary = normalizeListingSummary(rec);
  const rawCategory = rec.category;
  const category = rawCategory && typeof rawCategory === 'object' ? normalizeCategory(rawCategory) : null;
  const items = Array.isArray(rec.items) ? rec.items.map(normalizeListingItemSummary) : [];

  return {
    ...summary,
    categoryId: summary.categoryId ?? category?.id ?? null,
    categoryName: summary.categoryName ?? category?.name ?? null,
    itemCount: summary.itemCount || items.length,
    category,
    items,
    viewer: normalizeViewerContext(rec.viewer),
    pendingRequestCount: Math.max(0, asNumber(rec.pendingRequestCount ?? rec.pending_request_count, 0)),
    closedAt: asNullableString(rec.closedAt ?? rec.closed_at),
    hiddenReason: asNullableString(rec.hiddenReason ?? rec.hidden_reason ?? rec.lyDoAn ?? rec.ly_do_an),
  };
}

export function normalizeListingPage(raw: unknown): ListingPage {
  if (Array.isArray(raw)) {
    const items = raw.map(normalizeListingSummary);
    return {
      items,
      page: 0,
      size: items.length,
      totalElements: items.length,
      totalPages: items.length > 0 ? 1 : 0,
    };
  }
  const rec = asRecord(raw);
  const items = Array.isArray(rec.items) ? rec.items.map(normalizeListingSummary) : [];
  const page = Math.max(0, asNumber(rec.page, 0));
  const size = Math.max(0, asNumber(rec.size, items.length || 20));
  const totalElements = Math.max(0, asNumber(rec.totalElements ?? rec.total_elements, items.length));
  const totalPages = Math.max(
    0,
    asNumber(rec.totalPages ?? rec.total_pages, size > 0 ? Math.ceil(totalElements / size) : 0),
  );
  return { items, page, size, totalElements, totalPages };
}

export function normalizeMyListingsPage(raw: unknown): MyListingsPage {
  const rec = asRecord(raw);
  return {
    ...normalizeListingPage(rec),
    quota: normalizeListingQuota(rec.quota),
  };
}

export function normalizeListingMutationResponse(raw: unknown): ListingMutationResponse {
  const rec = asRecord(raw);
  return {
    listing: normalizeListingDetail(rec.listing ?? rec),
    quota: normalizeListingQuota(rec.quota),
  };
}

export function formatVnd(priceVnd: number | null | undefined): string {
  const value = typeof priceVnd === 'number' && Number.isFinite(priceVnd) ? Math.round(priceVnd) : 0;
  if (value <= 0) {
    return 'Miễn phí (0đ)';
  }
  const grouped = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped}đ`;
}

export function formatDisplayPrice(priceVnd: number | null | undefined): string {
  const value = typeof priceVnd === 'number' && Number.isFinite(priceVnd) ? Math.round(priceVnd) : 0;
  if (value <= 0) {
    return 'Tặng miễn phí';
  }
  const grouped = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped}đ`;
}

export interface ReputationSummary {
  scoreText: string;
  tierLabel: string;
}

export function formatReputationSummary(score: number | null | undefined): ReputationSummary {
  const normalized =
    typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.round(score)) : 0;
  let tierLabel = 'Hạn chế';
  if (normalized >= 120) {
    tierLabel = 'Tin cậy cao';
  } else if (normalized >= 80) {
    tierLabel = 'Ổn định';
  } else if (normalized >= 50) {
    tierLabel = 'Cần cải thiện';
  }
  return {
    scoreText: `Uy tín ${normalized}`,
    tierLabel,
  };
}

const EXTRA_STATUS_LABELS: Record<string, string> = {
  DANG_GIU: 'Đang giữ chỗ',
  HOAN_TAT: 'Đã hoàn tất',
  KHA_DUNG: 'Khả dụng',
  DA_CHUYEN_GIAO: 'Đã chuyển giao',
  DA_DONG: 'Đã đóng',
  BI_AN: 'Bị ẩn',
  DA_XOA: 'Đã xóa',
  CHO_XAC_NHAN: 'Chờ xác nhận',
  DA_HUY: 'Đã hủy',
};

export function mapListingStatusLabel(status: string | null | undefined): string {
  if (!status || typeof status !== 'string') {
    return 'Không xác định';
  }
  const trimmed = status.trim();
  if (!trimmed) {
    return 'Không xác định';
  }
  const normalized = trimmed.toUpperCase();
  if (normalized in LISTING_STATUS_META) {
    return LISTING_STATUS_META[normalized as ListingStatus].label;
  }
  if (normalized in EXTRA_STATUS_LABELS) {
    return EXTRA_STATUS_LABELS[normalized];
  }
  if (/^[A-Z0-9_]+$/.test(trimmed)) {
    return 'Không xác định';
  }
  return trimmed;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(parsed);
  } catch {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  }
}
