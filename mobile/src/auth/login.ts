import { api } from '../api/client';
import { useSession, type User } from './session';
export async function login(email: string, password: string): Promise<void> {
  const session = await api<{ token: string; refreshToken: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, client: 'mobile' }) });
  await useSession.getState().setSession(session.token, session.user, session.refreshToken);
}
