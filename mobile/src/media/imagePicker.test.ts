import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../api/client';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_URL_LENGTH,
  MAX_LISTING_IMAGES,
  pickImagesFromLibrary,
  takePhotoWithCamera,
  uploadListingImages,
  validateImageAsset,
  validateImageUrl,
  type PickableImageAsset,
} from './imagePicker';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

jest.mock('../api/client', () => ({
  api: jest.fn(),
}));

const mockedPicker = jest.mocked(ImagePicker);
const mockedApi = jest.mocked(api);
const originalPlatformOs = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: originalPlatformOs, configurable: true });
});

describe('constants & validators', () => {
  test('exports expected listing image limits and MIME types', () => {
    expect(MAX_LISTING_IMAGES).toBe(5);
    expect(MAX_IMAGE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_IMAGE_URL_LENGTH).toBe(1000);
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  test('validateImageAsset accepts valid JPEG/PNG/WebP assets and infers from extension', () => {
    expect(
      validateImageAsset({
        uri: 'file:///books.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
      }),
    ).toEqual({ valid: true, mimeType: 'image/jpeg' });

    expect(
      validateImageAsset({
        uri: 'file:///legacy.jpg',
        mimeType: 'image/jpg',
        fileSize: MAX_IMAGE_SIZE_BYTES,
      }),
    ).toEqual({ valid: true, mimeType: 'image/jpeg' });

    expect(
      validateImageAsset({
        uri: 'file:///notes.png?v=1',
      }),
    ).toEqual({ valid: true, mimeType: 'image/png' });

    expect(
      validateImageAsset({
        uri: 'content://media/42',
        fileName: 'photo.WEBP',
      }),
    ).toEqual({ valid: true, mimeType: 'image/webp' });
  });

  test('validateImageAsset rejects missing uri, unsupported MIME, zero size, and >5MB', () => {
    expect(validateImageAsset({ uri: '   ' }).valid).toBe(false);
    expect(
      validateImageAsset({
        uri: 'file:///anim.gif',
        mimeType: 'image/gif',
        fileSize: 1000,
      }),
    ).toEqual({ valid: false, error: 'Chỉ hỗ trợ ảnh định dạng JPEG, PNG hoặc WebP.' });
    expect(
      validateImageAsset({
        uri: 'file:///doc.pdf',
      }),
    ).toEqual({ valid: false, error: 'Chỉ hỗ trợ ảnh định dạng JPEG, PNG hoặc WebP.' });
    expect(
      validateImageAsset({
        uri: 'file:///empty.jpg',
        mimeType: 'image/jpeg',
        fileSize: 0,
      }),
    ).toEqual({ valid: false, error: 'Tệp ảnh rỗng hoặc không hợp lệ.' });
    expect(
      validateImageAsset({
        uri: 'file:///huge.png',
        mimeType: 'image/png',
        fileSize: MAX_IMAGE_SIZE_BYTES + 1,
      }),
    ).toEqual({ valid: false, error: 'Kích thước mỗi ảnh không được vượt quá 5MB.' });
  });

  test('validateImageUrl accepts http/https URLs and rejects invalid schemes', () => {
    expect(validateImageUrl('https://cdn.example.com/media/123.jpg')).toEqual({ valid: true });
    expect(validateImageUrl('http://localhost:8082/api/v1/media/abc')).toEqual({ valid: true });
    expect(validateImageUrl('   ').valid).toBe(false);
    expect(validateImageUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateImageUrl('file:///etc/passwd').valid).toBe(false);
    expect(validateImageUrl('not-a-url').valid).toBe(false);
    const prefix = 'https://example.com/';
    const maxLenUrl = `${prefix}${'a'.repeat(MAX_IMAGE_URL_LENGTH - prefix.length)}`;
    expect(maxLenUrl.length).toBe(1000);
    expect(validateImageUrl(maxLenUrl)).toEqual({ valid: true });
    const overLimitResult = validateImageUrl(`${maxLenUrl}b`);
    expect(overLimitResult.valid).toBe(false);
    expect(overLimitResult.error).toContain('1000');
  });
});

describe('pickImagesFromLibrary', () => {
  test('throws when no image slots remain', async () => {
    await expect(pickImagesFromLibrary(0)).rejects.toThrow('tối đa 5 ảnh');
    expect(mockedPicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  });

  test('throws clear Vietnamese message when media library permission is denied', async () => {
    mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
      expires: 'never',
      accessPrivileges: 'none',
    } as ImagePicker.MediaLibraryPermissionResponse);

    await expect(pickImagesFromLibrary(3)).rejects.toThrow('quyền truy cập thư viện ảnh');
    expect(mockedPicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  test('returns empty array when user cancels library picker', async () => {
    mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
      status: 'granted',
      canAskAgain: true,
      expires: 'never',
      accessPrivileges: 'all',
    } as ImagePicker.MediaLibraryPermissionResponse);
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: null,
    });

    await expect(pickImagesFromLibrary(2)).resolves.toEqual([]);
  });

  test('caps selectionLimit to MAX_LISTING_IMAGES and returns validated assets', async () => {
    mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'granted',
      canAskAgain: true,
      expires: 'never',
      accessPrivileges: 'limited',
    } as ImagePicker.MediaLibraryPermissionResponse);
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///p1.jpg',
          fileName: 'p1.jpg',
          mimeType: 'image/jpeg',
          fileSize: 5000,
          width: 800,
          height: 600,
        },
        {
          uri: 'file:///p2.png',
          fileName: 'p2.png',
          mimeType: 'image/png',
          fileSize: 8000,
          width: 1024,
          height: 768,
        },
        {
          uri: 'file:///p3.webp',
          fileName: 'p3.webp',
          mimeType: 'image/webp',
          fileSize: 4000,
          width: 640,
          height: 480,
        },
      ],
    });

    const picked = await pickImagesFromLibrary(2);
    expect(mockedPicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 2,
      }),
    );
    expect(picked).toHaveLength(2);
    expect(picked[0].uri).toBe('file:///p1.jpg');
    expect(picked[1].uri).toBe('file:///p2.png');
  });

  test('skips native permission prompt on web and throws on invalid picked asset', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'blob:http://localhost/gif',
          fileName: 'bad.gif',
          mimeType: 'image/gif',
          fileSize: 1000,
          width: 100,
          height: 100,
        },
      ],
    });

    await expect(pickImagesFromLibrary(1)).rejects.toThrow('JPEG, PNG hoặc WebP');
    expect(mockedPicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('takePhotoWithCamera', () => {
  test('throws clear Vietnamese message when camera permission is denied', async () => {
    mockedPicker.requestCameraPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
      expires: 'never',
    } as ImagePicker.CameraPermissionResponse);

    await expect(takePhotoWithCamera()).rejects.toThrow('quyền truy cập camera');
    expect(mockedPicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  test('returns null when user cancels camera', async () => {
    mockedPicker.requestCameraPermissionsAsync.mockResolvedValue({
      granted: true,
      status: 'granted',
      canAskAgain: true,
      expires: 'never',
    } as ImagePicker.CameraPermissionResponse);
    mockedPicker.launchCameraAsync.mockResolvedValue({
      canceled: true,
      assets: null,
    });

    await expect(takePhotoWithCamera()).resolves.toBeNull();
  });

  test('returns mapped photo asset on success', async () => {
    mockedPicker.requestCameraPermissionsAsync.mockResolvedValue({
      granted: true,
      status: 'granted',
      canAskAgain: true,
      expires: 'never',
    } as ImagePicker.CameraPermissionResponse);
    mockedPicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cam-1.jpg',
          fileName: 'cam-1.jpg',
          mimeType: 'image/jpeg',
          fileSize: 320000,
          width: 1200,
          height: 900,
        },
      ],
    });

    await expect(takePhotoWithCamera()).resolves.toMatchObject({
      uri: 'file:///cam-1.jpg',
      fileName: 'cam-1.jpg',
      mimeType: 'image/jpeg',
      fileSize: 320000,
    });
  });

  test('handles unsupported camera gracefully on web', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    mockedPicker.launchCameraAsync.mockRejectedValue(new Error('Camera not available'));

    await expect(takePhotoWithCamera()).rejects.toThrow('Trình duyệt hiện chưa hỗ trợ chụp ảnh trực tiếp');
  });
});

describe('uploadListingImages', () => {
  test('returns empty array without calling API for empty input', async () => {
    await expect(uploadListingImages([])).resolves.toEqual([]);
    expect(mockedApi).not.toHaveBeenCalled();
  });

  test('rejects more than 5 images before calling API', async () => {
    const sixAssets: PickableImageAsset[] = Array.from({ length: 6 }, (_, i) => ({
      uri: `file:///img-${i}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: 1000,
    }));

    await expect(uploadListingImages(sixAssets)).rejects.toThrow('tối đa 5 ảnh');
    expect(mockedApi).not.toHaveBeenCalled();
  });

  test('rejects invalid asset before calling API', async () => {
    await expect(
      uploadListingImages([
        {
          uri: 'file:///huge.jpg',
          mimeType: 'image/jpeg',
          fileSize: MAX_IMAGE_SIZE_BYTES + 100,
        },
      ]),
    ).rejects.toThrow('5MB');
    expect(mockedApi).not.toHaveBeenCalled();
  });

  test('uploads FormData with field "files" to POST /media/images and returns items', async () => {
    const uploaded = [
      {
        id: 'media-1',
        url: 'http://localhost:8082/api/v1/media/media-1',
        contentType: 'image/jpeg',
        sizeBytes: 12000,
      },
      {
        id: 'media-2',
        url: 'http://localhost:8082/api/v1/media/media-2',
        contentType: 'image/png',
        sizeBytes: 24000,
      },
    ];
    mockedApi.mockResolvedValueOnce({ items: uploaded });

    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    try {
      const result = await uploadListingImages([
        { uri: 'file:///book-cover.jpg', fileName: 'book-cover.jpg', mimeType: 'image/jpeg', fileSize: 12000 },
        { uri: 'file:///book-page.png', mimeType: 'image/png', fileSize: 24000 },
      ]);

      expect(result).toEqual(uploaded);
      expect(mockedApi).toHaveBeenCalledTimes(1);
      const [path, init] = mockedApi.mock.calls[0];
      expect(path).toBe('/media/images');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBeInstanceOf(FormData);
      expect(appendSpy).toHaveBeenCalledTimes(2);
      expect(appendSpy).toHaveBeenNthCalledWith(1, 'files', {
        uri: 'file:///book-cover.jpg',
        name: 'book-cover.jpg',
        type: 'image/jpeg',
      });
      expect(appendSpy).toHaveBeenNthCalledWith(2, 'files', {
        uri: 'file:///book-page.png',
        name: 'book-page.png',
        type: 'image/png',
      });
    } finally {
      appendSpy.mockRestore();
    }
  });
});
