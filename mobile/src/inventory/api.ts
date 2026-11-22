import { api } from '../api/client';
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
    hinhAnh: input.hinhAnh,
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
    hinhAnh: input.hinhAnh,
    version: input.version,
  };
  const data = await api<any>(`/inventory/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return normalizeInventoryItem(data);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await api<void>(`/inventory/${id}`, {
    method: 'DELETE',
  });
}
