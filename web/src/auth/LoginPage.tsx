import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try { await login(email, password); navigate('/', { replace: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Đăng nhập thất bại'); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><form className="panel auth-form" onSubmit={submit}>
    <h1>Đăng nhập</h1>
    <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>Mật khẩu<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button button-primary" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
  </form></main>;
}
