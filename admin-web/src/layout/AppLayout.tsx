import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import LoginPage from '../auth/LoginPage';
import type { User } from '../auth/session';
import { rolePages } from '../config/rolePages';
import RolePage from '../pages/RolePage';

function ProtectedPage({ user, permission }: { user: User; permission: string }) {
  const allowed = rolePages[user.role].some((page) => page.path === permission);
  return allowed ? <RolePage permission={permission} role={user.role} /> : <Navigate to="/" replace />;
}

export default function AppLayout() {
  const { user, loading, logout } = useAuth();
  if (loading) return <main className="auth-page"><p role="status">Đang kiểm tra phiên…</p></main>;
  if (!user) return <LoginPage />;
  const pages = rolePages[user.role];

  return <div className="app-shell">
    <aside className="sidebar">
      <strong className="brand">Dorm Trading</strong>
      <nav aria-label="Điều hướng chính">{pages.map((page) => <Link key={page.path} to={`/${page.path}`}>{page.label}</Link>)}</nav>
      <footer><span>{user.name} · {user.role}</span><button className="button" onClick={() => void logout()}>Đăng xuất</button></footer>
    </aside>
    <main className="main-content"><Routes>
      <Route path="/" element={<Navigate to={`/${pages[0].path}`} replace />} />
      {pages.map((page) => <Route key={page.path} path={`/${page.path}`} element={<ProtectedPage user={user} permission={page.path} />} />)}
      <Route path="*" element={<Navigate to={`/${pages[0].path}`} replace />} />
    </Routes></main>
  </div>;
}
