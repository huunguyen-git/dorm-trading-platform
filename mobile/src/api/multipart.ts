import { Platform } from 'react-native';

export interface MultipartFileInput {
  uri: string;
  name: string;
  type: string;
  file?: File | Blob | null;
}

/**
 * WinterCG-compatible FormData file part for Expo SDK 58+ (`expo/fetch`) that also
 * preserves React Native's `{ uri, name, type }` shape for legacy `FormData.getParts()` / XHR.
 *
 * `expo/src/winter/fetch/convertFormData.ts` checks:
 *  - `part.name` -> `Content-Disposition: form-data; name="..."; filename="..."`
 *  - `part.type` -> `Content-Type: ...`
 *  - `'bytes' in part` -> `await part.bytes()` (`Uint8Array`)
 */
export interface WinterCGMultipartFilePart {
  uri: string;
  name: string;
  type: string;
  bytes: () => Promise<Uint8Array>;
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s+/g, '');
  if (!cleaned) return new Uint8Array(0);
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(cleaned);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(cleaned, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  throw new Error('Thiết bị không hỗ trợ giải mã tệp ảnh.');
}

function decodeDataUriToUint8Array(dataUri: string): Uint8Array {
  const commaIndex = dataUri.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('Đường dẫn dữ liệu ảnh không hợp lệ.');
  }
  const meta = dataUri.slice(0, commaIndex);
  const payload = dataUri.slice(commaIndex + 1);
  if (/;base64$/i.test(meta)) {
    return decodeBase64ToUint8Array(payload);
  }
  const decoded = decodeURIComponent(payload);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(decoded);
  }
  const out = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) {
    out[i] = decoded.charCodeAt(i) & 0xff;
  }
  return out;
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.size === 'number' && blob.size === 0) {
    return new Uint8Array(0);
  }
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof FileReader === 'undefined') {
    throw new Error('Thiết bị không hỗ trợ đọc dữ liệu ảnh (FileReader).');
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result));
      } else if (typeof result === 'string') {
        try {
          resolve(decodeDataUriToUint8Array(result));
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error('Không thể đọc dữ liệu nhị phân của ảnh.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Không thể đọc dữ liệu nhị phân của ảnh.'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function readUriBytesViaXhrBlob(uri: string): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    if (typeof XMLHttpRequest === 'undefined') {
      reject(new Error(`Không thể đọc tệp ảnh cục bộ: ${uri}`));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      const blob = xhr.response as (Blob & { close?: () => void }) | null;
      if (!blob) {
        reject(new Error('Không thể đọc tệp ảnh từ thiết bị.'));
        return;
      }
      blobToUint8Array(blob)
        .then((bytes) => {
          try {
            blob.close?.();
          } catch {
            /* ignore blob cleanup error */
          }
          resolve(bytes);
        })
        .catch((err) => {
          try {
            blob.close?.();
          } catch {
            /* ignore blob cleanup error */
          }
          reject(err);
        });
    };
    xhr.onerror = () => {
      reject(new Error('Không thể đọc tệp ảnh từ thiết bị.'));
    };
    xhr.onabort = () => {
      reject(new Error('Đã hủy đọc tệp ảnh từ thiết bị.'));
    };
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

/**
 * Reads raw bytes from a local device URI (`file://`, `content://`, `blob:`, or `data:`).
 *
 * - `file://` and `blob:` use `fetch(uri).arrayBuffer()` first (native `OkHttpFileUrlInterceptor`
 *   on Expo SDK 58 Android & `URLSession` on iOS — zero base64 overhead).
 * - `content://` (Android 15 Photo Picker / MediaStore) and any failed `file://` edge case
 *   (e.g. percent-encoded filenames) transparently fall back to React Native's `XMLHttpRequest`
 *   `blob` reader backed by Android `ContentResolver.openInputStream(uri)`.
 */
export async function readLocalUriBytes(uri: string): Promise<Uint8Array> {
  const trimmed = uri.trim();
  if (!trimmed) {
    throw new Error('Thiếu đường dẫn tệp ảnh để tải lên.');
  }

  if (/^data:/i.test(trimmed)) {
    return decodeDataUriToUint8Array(trimmed);
  }

  const isContentUri = /^content:\/\//i.test(trimmed);
  if (!isContentUri && typeof globalThis.fetch === 'function') {
    try {
      const response = await globalThis.fetch(trimmed);
      if (response && response.ok && typeof response.arrayBuffer === 'function') {
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
      }
    } catch {
      // Fall through to native XHR Blob / ContentResolver reader below
    }
  }

  return readUriBytesViaXhrBlob(trimmed);
}

/**
 * Builds a WinterCG-compatible FormData file part.
 *
 * `bytes` is attached as a non-enumerable method so:
 *  1. Expo SDK 58 `convertFormDataAsync` detects `'bytes' in entry` and invokes `await entry.bytes()`,
 *     reading `entry.name` (filename) and `entry.type` (Content-Type) cleanly.
 *  2. Legacy RN `FormData.getParts()` (`{ ...value }`) only copies enumerable `{ uri, name, type }`
 *     without leaking a JS function into native `ReadableMap`.
 *  3. Existing tests asserting `{ uri, name, type }` structural equality remain intact.
 */
export function createWinterCGFilePart(
  input: Pick<MultipartFileInput, 'uri' | 'name' | 'type'>,
): WinterCGMultipartFilePart {
  let cachedBytes: Promise<Uint8Array> | null = null;
  const readBytes = (): Promise<Uint8Array> => {
    if (!cachedBytes) {
      cachedBytes = readLocalUriBytes(input.uri).catch((err) => {
        cachedBytes = null;
        throw err;
      });
    }
    return cachedBytes;
  };

  const part: { uri: string; name: string; type: string } = {
    uri: input.uri,
    name: input.name,
    type: input.type,
  };

  Object.defineProperty(part, 'bytes', {
    value: readBytes,
    enumerable: false,
    configurable: true,
    writable: false,
  });

  return part as WinterCGMultipartFilePart;
}

/**
 * Appends a file to `FormData` cleanly across Expo SDK 58 Android 15 / iOS, legacy RN fetch,
 * Web browsers, and Jest tests.
 */
export async function appendMultipartFile(
  formData: FormData,
  fieldName: string,
  input: MultipartFileInput,
): Promise<void> {
  if (input.file) {
    formData.append(fieldName, input.file as unknown as Blob, input.name);
    return;
  }

  if (Platform.OS === 'web' && typeof Blob !== 'undefined') {
    try {
      const bytes = await readLocalUriBytes(input.uri);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type: input.type });
      formData.append(fieldName, blob, input.name);
      return;
    } catch {
      // Fall through in mocked web test environments without real blob/file fetch
    }
  }

  const part = createWinterCGFilePart(input);
  formData.append(fieldName, part as unknown as Blob);
}
