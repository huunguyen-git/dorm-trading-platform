import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Platform } from 'react-native';
import { tokenStore } from '../auth/tokenStore';
import { useSession, type User } from '../auth/session';
import { submitDisputeEvidenceResponse } from './disputeApi';

jest.mock('../auth/tokenStore', () => ({
  tokenStore: {
    save: jest.fn(),
    get: jest.fn(),
    clear: jest.fn(),
    getRefresh: jest.fn(),
    saveRefresh: jest.fn(),
  },
}));

const store = tokenStore as jest.Mocked<typeof tokenStore>;
const fetchMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const originalPlatformOS = Platform.OS;
const originalXmlHttpRequest = globalThis.XMLHttpRequest;

const activeUser: User = {
  id: 'buyer-1',
  name: 'Nguyễn Minh Quân',
  email: 'quan@uit.edu.vn',
  studentId: '22520001',
  role: 'member',
  roles: ['MEMBER'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

function makeServerDisputePayload(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'order-1',
    status: 'CHO_XU_LY',
    version: 4,
    viewerRole: 'BUYER',
    escalationReason: 'OVERDUE_24H',
    escalatedAt: '2026-11-26T10:05:00Z',
    responseDeadlineAt: '2026-12-01T10:05:00Z',
    reviewDeadlineAt: null,
    decision: null,
    evidenceRequests: [],
    timeline: [],
    ...overrides,
  };
}

describe('P3-03 disputeApi real client.ts apiMultipart integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    store.get.mockResolvedValue('valid-jwt');
    store.getRefresh.mockResolvedValue(null);
    store.save.mockResolvedValue(undefined);
    store.saveRefresh.mockResolvedValue(undefined);
    store.clear.mockResolvedValue(undefined);
    useSession.setState({
      token: 'valid-jwt',
      user: activeUser,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_API_URL = 'http://10.0.2.2:8082/api/v1/';
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    globalThis.XMLHttpRequest = originalXmlHttpRequest;
    jest.restoreAllMocks();
  });

  test('submitDisputeEvidenceResponse sends native Android content:// photo via XMLHttpRequest and rebuilds FormData on 401 refresh', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });

    let token: string | null = 'expired-jwt';
    store.get.mockImplementation(async () => token);
    store.getRefresh.mockResolvedValue('refresh-tok');
    store.save.mockImplementation(async (next) => {
      token = next;
    });

    const sentAttempts: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
    let attemptIndex = 0;

    class MockXhr {
      status = 0;
      responseText = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private method = '';
      private url = '';
      private headers: Record<string, string> = {};
      private resHeaders: Record<string, string> = {};

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(k: string, v: string) {
        this.headers[k] = v;
      }

      getResponseHeader(name: string) {
        return this.resHeaders[name.toLowerCase()] ?? null;
      }

      send(body?: unknown) {
        sentAttempts.push({
          url: this.url,
          method: this.method,
          headers: { ...this.headers },
          body,
        });
        if (attemptIndex++ === 0) {
          this.status = 401;
          this.resHeaders = { 'www-authenticate': 'Bearer error="invalid_token"' };
          this.responseText = JSON.stringify({ code: 'UNAUTHORIZED', message: 'Expired' });
        } else {
          this.status = 200;
          this.resHeaders = {};
          this.responseText = JSON.stringify(makeServerDisputePayload());
        }
        this.onload?.();
      }
    }

    globalThis.XMLHttpRequest = MockXhr as unknown as typeof XMLHttpRequest;
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        token: 'refreshed-jwt',
        refreshToken: 'refresh-tok-2',
        user: activeUser,
      }),
    });

    const appendSpy = jest.spyOn(FormData.prototype, 'append');

    const result = await submitDisputeEvidenceResponse(
      'order-1',
      'req-1',
      'Đã chụp ảnh vết nứt tại cổng KTX Khu A.',
      [
        {
          uri: 'content://media/external/images/media/99',
          fileName: 'ban-giao.jpg',
          mimeType: 'image/jpeg',
          fileSize: 150000,
        },
      ],
    );

    expect(result.orderId).toBe('order-1');
    expect(result.version).toBe(4);
    expect(sentAttempts).toHaveLength(2);
    expect(sentAttempts[0].url).toBe(
      'http://10.0.2.2:8082/api/v1/orders/order-1/dispute/evidence-requests/req-1/responses',
    );
    expect(sentAttempts[0].headers.Authorization).toBe('Bearer expired-jwt');
    expect(sentAttempts[0].headers['Content-Type']).toBeUndefined();
    expect(sentAttempts[1].headers.Authorization).toBe('Bearer refreshed-jwt');
    expect(sentAttempts[0].body).toBeInstanceOf(FormData);
    expect(sentAttempts[1].body).toBeInstanceOf(FormData);
    expect(sentAttempts[0].body).not.toBe(sentAttempts[1].body);

    // FormData rebuilt twice with note + RN { uri, name, type } part
    const fileAppends = appendSpy.mock.calls.filter((call) => call[0] === 'files');
    expect(fileAppends).toHaveLength(2);
    expect(fileAppends[0][1]).toEqual({
      uri: 'content://media/external/images/media/99',
      name: 'ban-giao.jpg',
      type: 'image/jpeg',
    });
    expect(fileAppends[1][1]).toEqual({
      uri: 'content://media/external/images/media/99',
      name: 'ban-giao.jpg',
      type: 'image/jpeg',
    });

    // Only /auth/refresh hit fetch; multipart upload never hit Expo's fetch on Android
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://10.0.2.2:8082/api/v1/auth/refresh');
  });

  test('submitDisputeEvidenceResponse sends note-only multipart via fetch on web without Content-Type header', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify(makeServerDisputePayload({ version: 5 })),
    });

    const result = await submitDisputeEvidenceResponse(
      'order-1',
      'req-1',
      'Giải trình không đính kèm ảnh.',
      [],
    );

    expect(result.version).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(
      'http://10.0.2.2:8082/api/v1/orders/order-1/dispute/evidence-requests/req-1/responses',
    );
    expect(calledInit.method).toBe('POST');
    expect(calledInit.body).toBeInstanceOf(FormData);
    expect((calledInit.headers as Record<string, string>).Authorization).toBe('Bearer valid-jwt');
    expect((calledInit.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});
