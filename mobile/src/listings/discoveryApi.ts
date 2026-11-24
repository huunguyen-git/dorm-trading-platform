import { api } from '../api/client';
import {
  normalizeCategory,
  normalizeCategoryTreeNode,
  normalizeListingDetail,
  normalizeListingPage,
  normalizeLocationZone,
  type CategoriesResponse,
  type CategoryTreeNode,
  type ListingCategory,
  type ListingDetail,
  type ListingPage,
  type ListingSearchFilters,
  type ListingType,
  type LocationZone,
} from './types';

export type DiscoveryListingTypeFilter = 'SINGLE' | 'COMBO' | 'FREE';

export type DiscoverySearchFilters = Omit<ListingSearchFilters, 'type'> & {
  type?: DiscoveryListingTypeFilter | ListingType;
};

export function normalizeSearchTypeParam(type?: string | null): DiscoveryListingTypeFilter | undefined {
  if (!type) return undefined;
  const upper = type.trim().toUpperCase();
  if (upper === 'SINGLE' || upper === 'BAN_LE') return 'SINGLE';
  if (upper === 'COMBO' || upper === 'BAN_COMBO') return 'COMBO';
  if (upper === 'FREE' || upper === 'CHO_TANG') return 'FREE';
  return undefined;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function buildListingSearchQuery(filters: DiscoverySearchFilters = {}): string {
  const pairs: Array<[string, string]> = [];

  const q = filters.q?.trim();
  if (q) pairs.push(['q', q]);

  const categoryId = filters.categoryId?.trim();
  if (categoryId) pairs.push(['categoryId', categoryId]);

  const courseCode = filters.courseCode?.trim();
  if (courseCode) pairs.push(['courseCode', courseCode]);

  if (isFiniteNonNegative(filters.minPrice)) {
    pairs.push(['minPrice', String(Math.round(filters.minPrice))]);
  }
  if (isFiniteNonNegative(filters.maxPrice)) {
    pairs.push(['maxPrice', String(Math.round(filters.maxPrice))]);
  }
  if (filters.freeOnly === true) {
    pairs.push(['freeOnly', 'true']);
  }

  const normalizedType = normalizeSearchTypeParam(filters.type);
  if (normalizedType) pairs.push(['type', normalizedType]);

  const locationCode = filters.locationCode?.trim();
  if (locationCode) pairs.push(['locationCode', locationCode]);

  const location = filters.location?.trim();
  if (location) pairs.push(['location', location]);

  if (isFiniteNumber(filters.lat)) {
    pairs.push(['lat', String(filters.lat)]);
  }
  if (isFiniteNumber(filters.lng)) {
    pairs.push(['lng', String(filters.lng)]);
  }
  if (isFiniteNumber(filters.radiusKm) && filters.radiusKm > 0) {
    pairs.push(['radiusKm', String(filters.radiusKm)]);
  }

  if (filters.sort) {
    pairs.push(['sort', filters.sort]);
  }
  if (isFiniteNonNegative(filters.page)) {
    pairs.push(['page', String(Math.floor(filters.page))]);
  }
  if (isFiniteNumber(filters.size) && filters.size > 0) {
    pairs.push(['size', String(Math.floor(filters.size))]);
  }
  if (isFiniteNonNegative(filters.offset)) {
    pairs.push(['offset', String(Math.floor(filters.offset))]);
  }

  if (pairs.length === 0) return '';
  return `?${pairs.map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`).join('&')}`;
}

export function buildCategoryTreeFromItems(items: ListingCategory[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  for (const item of items) {
    if (!item.id) continue;
    byId.set(item.id, { ...item, children: [] });
  }
  const roots: CategoryTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function searchListings(filters: DiscoverySearchFilters = {}): Promise<ListingPage> {
  const query = buildListingSearchQuery(filters);
  const raw = await api<unknown>(`/listings${query}`);
  return normalizeListingPage(raw);
}

export async function fetchListingDetail(id: string): Promise<ListingDetail> {
  const raw = await api<unknown>(`/listings/${encodeURIComponent(id)}`);
  return normalizeListingDetail(raw);
}

export async function fetchCategories(): Promise<CategoriesResponse> {
  try {
    const raw = await api<unknown>('/categories');
    if (Array.isArray(raw)) {
      const items = raw.map(normalizeCategory).filter((item) => Boolean(item.id));
      return { items, tree: buildCategoryTreeFromItems(items) };
    }
    if (raw && typeof raw === 'object') {
      const record = raw as { items?: unknown; tree?: unknown };
      const items = Array.isArray(record.items)
        ? record.items.map(normalizeCategory).filter((item) => Boolean(item.id))
        : [];
      const tree = Array.isArray(record.tree)
        ? record.tree.map(normalizeCategoryTreeNode).filter((node) => Boolean(node.id))
        : buildCategoryTreeFromItems(items);
      return { items, tree: tree.length > 0 ? tree : buildCategoryTreeFromItems(items) };
    }
    return { items: [], tree: [] };
  } catch {
    return { items: [], tree: [] };
  }
}

export async function fetchLocations(): Promise<LocationZone[]> {
  try {
    const raw = await api<unknown>('/locations');
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
        ? ((raw as { items: unknown[] }).items)
        : [];
    return list.map(normalizeLocationZone).filter((zone) => Boolean(zone.code));
  } catch {
    return [];
  }
}

export function isListingNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const typed = err as { status?: number; code?: string; message?: string };
  if (typed.status === 404) return true;
  if (typed.code === 'LISTING_NOT_FOUND') return true;
  if (typeof typed.message === 'string' && typed.message.includes('API 404')) return true;
  return false;
}
