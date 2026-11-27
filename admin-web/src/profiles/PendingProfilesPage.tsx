import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { adminProfiles, formatTime, kindLabel, type PendingProfile } from '../profiles/api';

const PAGE_SIZE = 20;

export default function PendingProfilesPage() {
  const flash = (useLocation().state as { done?: string } | null)?.done ?? '';
  const [items, setItems] = useState<PendingProfile[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (next: number) => {
    setLoading(true); setError('');
    try { setItems(await adminProfiles.pending(next, PAGE_SIZE)); setOffset(next); }
    catch (cause) { setError(cause instanceof ApiError && cause.status === 403 ? 'Tài khoản không có quyền duyệt hồ sơ.' : (cause as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(0); }, [load]);

  return <section className="page-content">
    <header className="page-heading"><h1>Hồ sơ chờ duyệt</h1></header>
    <div className="toolbar"><button className="button" disabled={loading} onClick={() => void load(offset)}>Làm mới</button></div>
    {flash && <p className="notice notice-success" role="status">{flash}</p>}
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    {loading ? <p role="status">Đang tải…</p> : items.length === 0
      ? <p className="notice" role="status">Không có hồ sơ nào đang chờ duyệt.</p>
      : <ul className="profile-list">
        {items.map((item) => <li key={item.id}>
          <Link className="profile-row" to={`/profiles/${item.id}`}>
            <span className="profile-row-main"><strong>{item.name}</strong><span className="profile-row-meta">MSSV {item.studentId} · {item.email}</span></span>
            <span className="profile-row-side"><span className="status-badge">{kindLabel(item.kind)}</span><time dateTime={item.submittedAt}>{formatTime(item.submittedAt)}</time></span>
          </Link>
        </li>)}
      </ul>}
    <div className="pager">
      <button className="button" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}>Trang trước</button>
      <button className="button" disabled={loading || items.length < PAGE_SIZE} onClick={() => void load(offset + PAGE_SIZE)}>Trang sau</button>
    </div>
  </section>;
}
