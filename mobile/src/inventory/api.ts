import { api, toPersistableMediaUrl } from '../api/client';
import type { CreateInventoryItemInput, InventoryItem, UpdateInventoryItemInput } from './types';
import { normalizeInventoryItem } from './types';

export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  const data = await api<any[]>('/inventory');
  return (data || []).map(normalizeInventoryItem);
}

export async function fetchInventoryItem(id: string): Promise<InventoryItem> {
  const data = await api<any>(`/inventory/${id}`);
  return normalizeInventoryItem(data);
}

export async function createInventoryItem(input: CreateInventoryItemInput): Promise<InventoryItem> {
  const payload = {
    ten: input.ten.trim(),
    tinhTrang: input.tinhTrang.trim(),
    hinhAnh: input.hinhAnh.map(toPersistableMediaUrl),
  };
  const data = await api<any>('/inventory', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizeInventoryItem(data);
}

export async function updateInventoryItem(id: string, input: UpdateInventoryItemInput): Promise<InventoryItem> {
  const payload = {
    ten: input.ten?.trim(),
    tinhTrang: input.tinhTrang.trim(),
    hinhAnh: input.hinhAnh.map(toPersistableMediaUrl),
    version: input.version,
  };
  const data = await api<any>(`/inventory/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return normalizeInventoryItem(data);
}

export async function deleteInventoryItem(id: string, version?: number): Promise<void> {
  const query = typeof version === 'number' ? `?version=${version}` : '';
  await api<void>(`/inventory/${id}${query}`, {
    method: 'DELETE',
  });
}
