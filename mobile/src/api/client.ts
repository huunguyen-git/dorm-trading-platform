import { useSession } from '../auth/session';
import { tokenStore } from '../auth/tokenStore';

const baseUrl = () => process.env.EXPO_PUBLIC_API_URL;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const origin = baseUrl();
  if (!origin) {
    throw new Error('EXPO_PUBLIC_API_URL is required');
  }

  const token = await tokenStore.get();
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    await tokenStore.clear();
    useSession.setState({ token: null, user: null, loading: false });
  }

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
