import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import PasswordForm from '../auth/PasswordForm';
import { useAuth } from '../auth/AuthProvider';
import LoginPage from '../auth/LoginPage';
import type { User } from '../auth/session';
import { rolePages } from '../config/rolePages';
import RolePage from '../pages/RolePage';
function ProtectedPage({ user, permission }: { user: User; permission: string }) {
  const allowed = rolePages[user.role].some((page) => page.path === permission);
  return allowed ? <RolePage permission={permission} role={user.role} /> : <Navigate to="/account" replace />;
}
export default function AppLayout() {
  const [change, setChange] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const { user, loading, logout } = useAuth();
  async function signOut() { setBusy(true); setError(''); try { await logout(); setChange(false); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  if (loading) return <main className="auth-page"><p className="notice" role="status">Đang kiểm tra phiên…</p></main>;
  if (!user) return <LoginPage />;
  if (user.role !== 'admin' && user.role !== 'moderator') return <main className="auth-page"><section className="panel"><h1>Không đủ quyền truy cập</h1><p role="alert">Tài khoản không có quyền quản trị.</p><button className="button" disabled={busy} onClick={() => void signOut()}>Đăng xuất</button>{error && <p role="alert">{error}</p>}</section></main>;
  const pages = rolePages[user.role]; const roleName = user.role === 'admin' ? 'Quản trị viên cấp cao' : 'Kiểm duyệt viên';
  const account = <section className="page-content account-page">
    <header className="page-heading"><p className="eyebrow">KHÔNG GIAN CỦA BẠN</p><h1>Tài khoản & bảo mật</h1><p>Kiểm tra thông tin đăng nhập và quản lý mật khẩu của bạn.</p></header>
    {change ? <PasswordForm change onClose={() => setChange(false)} /> : <div className="account-grid">
      <section className="account-card"><div className="account-identity"><span className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><div><h2>{user.name}</h2><span className="status-badge">{roleName}</span></div></div>
        <dl className="account-details"><div><dt>Email đăng nhập</dt><dd>{user.email}</dd></div><div><dt>Xác minh email</dt><dd>{user.emailVerified ? 'Đã xác minh' : 'Chưa xác minh'}</dd></div><div><dt>Hồ sơ</dt><dd>{user.profileApproved ? 'Đã được duyệt' : 'Đang chờ duyệt'}</dd></div></dl>
      </section>
      <section className="account-card"><p className="eyebrow">BẢO MẬT</p><h2>Mật khẩu & phiên</h2><p>Đổi mật khẩu sẽ giữ phiên hiện tại và đăng xuất những phiên khác.</p><button className="button button-primary" onClick={() => setChange(true)}>Đổi mật khẩu</button><hr /><p>Đăng xuất chỉ kết thúc phiên trên trình duyệt này.</p><button className="button" disabled={busy} onClick={() => void signOut()}>Đăng xuất phiên này</button></section>
    </div>}
  </section>;
  return <div className="app-shell"><aside className="sidebar">
    <strong className="brand">DORM TRADING<small>QUẢN TRỊ CỘNG ĐỒNG</small></strong>
    <nav aria-label="Điều hướng chính"><NavLink to="/account">Tài khoản & bảo mật</NavLink>{pages.map((page) => <NavLink key={page.path} to={`/${page.path}`}>{page.label}</NavLink>)}</nav>
    <footer><span>{user.name}</span><small>{roleName}</small><button className="button" disabled={busy} onClick={() => void signOut()}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></footer>
  </aside><main className="main-content">{error && <p className="notice notice-error" role="alert">{error}</p>}<Routes>
    <Route path="/" element={<Navigate to="/account" replace />} /><Route path="/account" element={account} />
    {pages.map((page) => <Route key={page.path} path={`/${page.path}`} element={<ProtectedPage user={user} permission={page.path} />} />)}
    <Route path="*" element={<Navigate to="/account" replace />} />
  </Routes></main></div>;
}
