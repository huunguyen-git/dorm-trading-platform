import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { auth } from './session';
type Challenge = { challengeId: string; expiresIn: number; resendAfter: number; message: string };
export default function PasswordForm({ change = false, onClose }: { change?: boolean; onClose: () => void }) {
  const [email, setEmail] = useState(''); const [code, setCode] = useState('');
  const [currentPassword, setCurrent] = useState(''); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null); const [grant, setGrant] = useState('');
  const [resendAt, setResendAt] = useState(0); const [expiresAt, setExpiresAt] = useState(0); const [now, setNow] = useState(Date.now());
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000)); const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const post = <T,>(path: string, body: object) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function send() {
    const response = await post<Challenge>('/auth/otp/resend', { email: email.trim(), purpose: 'RESET' });
    setChallenge(response); setNow(Date.now()); setResendAt(Date.now() + response.resendAfter * 1000); setExpiresAt(Date.now() + response.expiresIn * 1000); setCode(''); setMessage(response.message);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (change || grant) {
        const length = [...password.normalize('NFC')].length;
        if (length < 15 || length > 128) throw new Error('Mật khẩu mới cần từ 15 đến 128 ký tự.');
        if (password !== confirmation) throw new Error('Mật khẩu xác nhận chưa khớp.');
        if (grant && !remaining) throw new Error('Quyền đặt lại mật khẩu đã hết hạn. Hãy yêu cầu mã mới.');
        if (change) { await auth.change(currentPassword, password); setMessage('Đã đổi mật khẩu và đăng xuất các phiên khác.'); }
        else { await post('/auth/password/reset', { resetToken: grant, password }); setMessage('Đã đặt lại mật khẩu. Hãy quay lại đăng nhập.'); }
        setPassword(''); setConfirmation(''); setCurrent(''); setGrant(''); setCode(''); setDone(true);
      } else if (challenge) {
        if (!remaining) throw new Error('Mã đã hết hạn. Hãy gửi lại mã.');
        const result = await post<{ resetToken: string }>('/auth/otp/verify', { challengeId: challenge.challengeId, email: email.trim(), purpose: 'RESET', code });
        setGrant(result.resetToken); setExpiresAt(Date.now() + 300000); setMessage('Đã xác minh. Đặt mật khẩu mới trong 5 phút.');
      } else await send();
    });
  }
  function restart() { setChallenge(null); setGrant(''); setCode(''); setPassword(''); setConfirmation(''); setMessage(''); setError(''); }
  const labels = ['Email', 'Xác minh', 'Mật khẩu mới']; const step = grant ? 2 : challenge ? 1 : 0;
  if (done) return <section className="panel auth-form success-panel" data-testid="password-success"><span className="success-mark" aria-hidden="true">✓</span><h2>Hoàn tất</h2><p className="notice notice-success" role="status">{message}</p><button className="button button-primary" onClick={onClose}>{change ? 'Về tài khoản' : 'Về đăng nhập'}</button></section>;
  return <form className="panel auth-form" onSubmit={(e) => void submit(e)} aria-label={change ? 'Đổi mật khẩu' : 'Khôi phục tài khoản'} aria-busy={busy}>
    <header className="form-heading"><p className="eyebrow">BẢO MẬT TÀI KHOẢN</p><h2>{change ? 'Đổi mật khẩu' : 'Quên mật khẩu'}</h2><p>{change ? 'Phiên này được giữ lại. Các phiên khác sẽ được đăng xuất.' : 'Xác minh email để lấy lại quyền truy cập tài khoản.'}</p></header>
    {!change && <ol className="form-steps" aria-label="Tiến trình khôi phục">{labels.map((label, i) => <li key={label} aria-current={step === i ? 'step' : undefined}><span>{i + 1}</span>{label}</li>)}</ol>}
    {!change && <label htmlFor="reset-email">Email<input id="reset-email" type="email" autoComplete="username" placeholder="ban@truong.edu.vn" required value={email} disabled={!!challenge || !!grant || busy} onChange={(e) => setEmail(e.target.value)} /></label>}
    {change && <label htmlFor="current-password">Mật khẩu hiện tại<input id="current-password" type={show ? 'text' : 'password'} autoComplete="current-password" required disabled={busy} value={currentPassword} onChange={(e) => setCurrent(e.target.value)} /></label>}
    {(change || grant) && <>
      <label htmlFor="new-password">Mật khẩu mới (15–128 ký tự)<input id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label htmlFor="confirm-password">Xác nhận mật khẩu mới<input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" required disabled={busy} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
      <div className="form-options"><span className="form-help">Có thể dùng cụm từ có khoảng trắng.</span><button className="text-button" type="button" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Ẩn' : 'Hiện'} mật khẩu</button></div>
    </>}
    {challenge && !grant && <>
      <label htmlFor="reset-otp">Mã xác minh (hiệu lực 5 phút)<input className="otp-input" id="reset-otp" data-testid="reset-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" placeholder="000000" required disabled={busy} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))} /></label>
      <div className="form-options"><span className="form-help">{remaining ? `Còn ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Mã đã hết hạn.'}</span><button className="text-button" type="button" disabled={busy || wait > 0} onClick={() => void run(send)}>{wait ? `Gửi lại sau ${wait}s` : 'Gửi lại mã'}</button></div>
    </>}
    {!!grant && !remaining && <p className="notice notice-error" role="alert">Quyền đặt lại mật khẩu đã hết hạn. Hãy yêu cầu mã mới.</p>}
    {message && <p className="notice" role="status">{message}</p>}{error && <p className="notice notice-error" role="alert">{error}</p>}
    <button className="button button-primary" data-testid="password-submit" disabled={busy || (!!(challenge || grant) && !remaining)}>{busy ? 'Đang xử lý…' : change || grant ? 'Lưu mật khẩu' : challenge ? 'Xác minh' : 'Gửi mã'}</button>
    {!change && (challenge || grant) && <button className="text-button" type="button" disabled={busy} onClick={restart}>{grant && !remaining ? 'Yêu cầu mã mới' : 'Dùng email khác'}</button>}
    <button className="button" type="button" disabled={busy} onClick={onClose}>{change ? 'Hủy' : 'Về đăng nhập'}</button>
  </form>;
}
