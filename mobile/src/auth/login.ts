import { api } from '../api/client';
import { useSession, type User } from './session';

export async function login(email: string, password: string): Promise<void> {
  const session = await api<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await useSession.getState().setSession(session.token, session.user);
}
