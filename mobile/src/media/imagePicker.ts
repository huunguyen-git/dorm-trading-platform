import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { apiMultipart } from '../api/client';
import { appendMultipartFile } from '../api/multipart';

export const MAX_LISTING_IMAGES = 5;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_URL_LENGTH = 1000;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export interface PickableImageAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  file?: File | null;
}

export interface UploadedMediaItem {
  id: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  mimeType?: AllowedImageMimeType;
}

const MIME_TO_EXTENSION: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXTENSION_TO_MIME: Record<string, AllowedImageMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function normalizeMimeType(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().split(';')[0]?.trim();
  if (!cleaned) return null;
  if (cleaned === 'image/jpg') return 'image/jpeg';
  return cleaned;
}

function isAllowedMimeType(mime: string | null): mime is AllowedImageMimeType {
  return mime !== null && (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

function inferMimeTypeFromString(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dataUriMatch = /^data:([^;,]+)[;,]/i.exec(trimmed);
  if (dataUriMatch?.[1]) {
    return normalizeMimeType(dataUriMatch[1]);
  }

  const withoutQuery = trimmed.split('?')[0]?.split('#')[0] ?? trimmed;
  const lastSegment = withoutQuery.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) {
    return null;
  }
  const ext = lastSegment.slice(dotIndex + 1).toLowerCase();
  if (ext in EXTENSION_TO_MIME) {
    return EXTENSION_TO_MIME[ext];
  }
  return `application/x-ext-${ext}`;
}

function resolveAssetMimeType(asset: PickableImageAsset): string | null {
  const fromMime = normalizeMimeType(asset.mimeType ?? asset.file?.type);
  if (fromMime) return fromMime;
  const fromFileName = inferMimeTypeFromString(asset.fileName ?? asset.file?.name);
  if (fromFileName) return fromFileName;
  return inferMimeTypeFromString(asset.uri);
}

function resolveAssetFileName(
  asset: PickableImageAsset,
  mimeType: AllowedImageMimeType,
  index: number,
): string {
  const candidate = (asset.fileName ?? asset.file?.name ?? '').trim();
  if (candidate) {
    return candidate;
  }
  const withoutQuery = asset.uri.split('?')[0]?.split('#')[0] ?? '';
  const tail = withoutQuery.split('/').pop()?.trim() ?? '';
  if (tail && /\.[a-z0-9]{2,5}$/i.test(tail)) {
    return tail;
  }
  return `listing-image-${index + 1}.${MIME_TO_EXTENSION[mimeType]}`;
}

function mapPickerAsset(asset: ImagePicker.ImagePickerAsset): PickableImageAsset {
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? asset.file?.name ?? null,
    mimeType: asset.mimeType ?? asset.file?.type ?? null,
    fileSize: asset.fileSize ?? asset.file?.size ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    file: asset.file ?? null,
  };
}

export function validateImageAsset(asset: PickableImageAsset | null | undefined): ImageValidationResult {
  if (!asset || typeof asset.uri !== 'string' || !asset.uri.trim()) {
    return { valid: false, error: 'Ảnh không hợp lệ hoặc thiếu đường dẫn.' };
  }

  const size = asset.fileSize ?? asset.file?.size ?? null;
  if (typeof size === 'number' && Number.isFinite(size)) {
    if (size <= 0) {
      return { valid: false, error: 'Tệp ảnh rỗng hoặc không hợp lệ.' };
    }
    if (size > MAX_IMAGE_SIZE_BYTES) {
      return { valid: false, error: 'Kích thước mỗi ảnh không được vượt quá 5MB.' };
    }
  }

  const mimeType = resolveAssetMimeType(asset);
  if (!isAllowedMimeType(mimeType)) {
    return {
      valid: false,
      error: 'Chỉ hỗ trợ ảnh định dạng JPEG, PNG hoặc WebP.',
    };
  }

  return { valid: true, mimeType };
}

const RELATIVE_MEDIA_PATH_RE =
  /^\/api\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateImageUrl(url: string): ImageValidationResult {
  const trimmed = (url ?? '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Vui lòng nhập đường dẫn ảnh.' };
  }
  if (trimmed.length > MAX_IMAGE_URL_LENGTH) {
    return { valid: false, error: `Đường dẫn ảnh quá dài (tối đa ${MAX_IMAGE_URL_LENGTH} ký tự).` };
  }
  if (RELATIVE_MEDIA_PATH_RE.test(trimmed)) {
    return { valid: true };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return { valid: false, error: 'Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://.' };
  }
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
      return { valid: false, error: 'Đường dẫn ảnh không hợp lệ.' };
    }
  } catch {
    return { valid: false, error: 'Đường dẫn ảnh không hợp lệ.' };
  }
  return { valid: true };
}

export async function pickImagesFromLibrary(remainingSlots: number): Promise<PickableImageAsset[]> {
  const limit = Math.min(Math.floor(remainingSlots), MAX_LISTING_IMAGES);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Bạn chỉ có thể đính kèm tối đa ${MAX_LISTING_IMAGES} ảnh cho mỗi tin đăng.`);
  }

  if (typeof ImagePicker.launchImageLibraryAsync !== 'function') {
    throw new Error('Thiết bị hiện tại chưa hỗ trợ chọn ảnh từ thư viện. Bạn có thể dán liên kết ảnh.');
  }

  if (Platform.OS !== 'web' && typeof ImagePicker.requestMediaLibraryPermissionsAsync === 'function') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const granted = Boolean(permission?.granted || permission?.accessPrivileges === 'limited');
    if (!granted) {
      throw new Error(
        'Ứng dụng chưa có quyền truy cập thư viện ảnh. Vui lòng cấp quyền trong cài đặt thiết bị.',
      );
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 0.85,
  });

  if (result.canceled || !Array.isArray(result.assets) || result.assets.length === 0) {
    return [];
  }

  const picked = result.assets.slice(0, limit).map(mapPickerAsset);
  for (const asset of picked) {
    const check = validateImageAsset(asset);
    if (!check.valid) {
      throw new Error(check.error ?? 'Ảnh được chọn không hợp lệ.');
    }
  }
  return picked;
}

export async function takePhotoWithCamera(): Promise<PickableImageAsset | null> {
  if (typeof ImagePicker.launchCameraAsync !== 'function') {
    throw new Error('Thiết bị hiện tại chưa hỗ trợ chụp ảnh. Bạn có thể chọn ảnh từ thư viện hoặc dán liên kết ảnh.');
  }

  if (Platform.OS !== 'web' && typeof ImagePicker.requestCameraPermissionsAsync === 'function') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission?.granted) {
      throw new Error('Ứng dụng chưa có quyền truy cập camera. Vui lòng cấp quyền trong cài đặt thiết bị.');
    }
  }

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
  } catch (err) {
    if (Platform.OS === 'web') {
      throw new Error('Trình duyệt hiện chưa hỗ trợ chụp ảnh trực tiếp. Hãy chọn ảnh từ thư viện hoặc dán liên kết ảnh.');
    }
    throw err;
  }

  if (result.canceled || !Array.isArray(result.assets) || result.assets.length === 0) {
    return null;
  }

  const asset = mapPickerAsset(result.assets[0]);
  const check = validateImageAsset(asset);
  if (!check.valid) {
    throw new Error(check.error ?? 'Ảnh chụp không hợp lệ.');
  }
  return asset;
}

export async function uploadListingImages(assets: PickableImageAsset[]): Promise<UploadedMediaItem[]> {
  if (!Array.isArray(assets) || assets.length === 0) {
    return [];
  }
  if (assets.length > MAX_LISTING_IMAGES) {
    throw new Error(`Chỉ được tải lên tối đa ${MAX_LISTING_IMAGES} ảnh mỗi lần.`);
  }

  const validated: Array<{ asset: PickableImageAsset; mimeType: AllowedImageMimeType }> = [];
  for (const asset of assets) {
    const check = validateImageAsset(asset);
    if (!check.valid || !check.mimeType) {
      throw new Error(check.error ?? 'Ảnh tải lên không hợp lệ.');
    }
    validated.push({ asset, mimeType: check.mimeType });
  }

  // FormData mới mỗi lần gửi để 401 refresh retry không tái sử dụng body đã đọc
  const response = await apiMultipart<{ items?: UploadedMediaItem[] }>('/media/images', async () => {
    const formData = new FormData();
    for (let index = 0; index < validated.length; index += 1) {
      const { asset, mimeType } = validated[index];
      const fileName = resolveAssetFileName(asset, mimeType, index);
      await appendMultipartFile(formData, 'files', {
        uri: asset.uri,
        name: fileName,
        type: mimeType,
        file: asset.file,
      });
    }
    return formData;
  });

  const items = Array.isArray(response?.items) ? response.items : [];
  return items
    .filter((item): item is UploadedMediaItem => Boolean(item && typeof item.url === 'string' && item.url.trim()))
    .map((item) => ({
      id: String(item.id ?? ''),
      url: item.url.trim(),
      contentType: String(item.contentType ?? 'image/jpeg'),
      sizeBytes: typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) ? item.sizeBytes : 0,
    }));
}
