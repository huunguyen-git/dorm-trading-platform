import { api } from '../api/client';

export type Role = 'admin' | 'moderator' | 'seller';
export type User = { id: string; name: string; role: Role };

type LoginResponse = { token: string; user: User };

export const auth = {
  me: () => api<User>('/auth/me'),
  async login(email: string, password: string) {
    const session = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    sessionStorage.setItem('session_token', session.token);
    return session.user;
  },
  async logout() {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
    } finally {
      sessionStorage.removeItem('session_token');
    }
  },
};
