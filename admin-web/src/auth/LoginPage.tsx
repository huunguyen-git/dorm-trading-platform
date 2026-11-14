import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import PasswordForm from './PasswordForm';
import AuthShell from './AuthShell';
import { useAuth } from './AuthProvider';
export default function LoginPage() {
  const navigate = useNavigate(); const { login } = useAuth();
  const [reset, setReset] = useState(false); const [show, setShow] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!email.trim() || !password) { setError('Nhập email và mật khẩu để tiếp tục.'); return; }
    setBusy(true);
    try { await login(email.trim(), password); setPassword(''); navigate('/account', { replace: true }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <AuthShell>{reset ? <PasswordForm onClose={() => setReset(false)} /> : <form className="panel auth-form" onSubmit={submit} aria-label="Đăng nhập quản trị" aria-busy={busy}>
    <header className="form-heading"><p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p><h2>Đăng nhập</h2><p>Sử dụng tài khoản đã được cấp quyền quản trị.</p></header>
    <label htmlFor="login-email">Email<input id="login-email" data-testid="login-email" type="email" autoComplete="username" placeholder="ban@truong.edu.vn" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
    <label htmlFor="login-password">Mật khẩu<input id="login-password" data-testid="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    <div className="form-options"><button className="text-button" type="button" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Ẩn' : 'Hiện'} mật khẩu</button><button className="text-button" type="button" disabled={busy} onClick={() => { setError(''); setReset(true); }}>Quên mật khẩu</button></div>
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    <button className="button button-primary" data-testid="login-submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    <p className="form-help">Bạn là sinh viên? Đăng ký và khám phá mặt hàng trên ứng dụng Dorm Trading.</p>
  </form>}</AuthShell>;
}
