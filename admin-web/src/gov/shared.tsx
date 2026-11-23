import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../api/client';
import { pageSize, seniorApi, type Audit, type Page } from './types';
import './gov.css';

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể kết nối. Vui lòng thử lại.';
}
export function isConflict(error: unknown) { return error instanceof ApiError && error.status === 409; }
export function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}
export function listPath(resource: string, page: number, filters: Record<string, string> = {}) {
  const query = new URLSearchParams({ page: String(page), size: String(pageSize) });
  Object.entries(filters).forEach(([name, value]) => { if (value.trim()) query.set(name, value.trim()); });
  return `${seniorApi}/${resource}?${query}`;
}

// Every result belongs to its exact request, including reloads. Aborting and checking
// the signal protects searches even when an older response settles after a new one.
export function usePage<T>(path: string, revision: number = 0) {
  const [retry, setRetry] = useState(0);
  const key = `${path}:${revision}:${retry}`;
  const [state, setState] = useState<{ key: string; data?: Page<T>; error?: string }>({ key: '' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key });
    void api<Page<T>>(path, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setState({ key, data }); },
      (error: unknown) => { if (!controller.signal.aborted) setState({ key, error: errorMessage(error) }); },
    );
    return () => controller.abort();
  }, [path, key]);
  const current = state.key === key ? state : undefined;
  return { data: current?.data, error: current?.error, loading: !current?.data && !current?.error, reload: () => setRetry((value) => value + 1) };
}

export function Pagination({ page, data, loading, onPage, label }: {
  page: number; data?: Page<unknown>; loading: boolean; onPage: (page: number) => void; label: string;
}) {
  const total = data?.total;
  const pages = total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
  return <nav className="gov-pagination" aria-label={label}>
    <span>{total === undefined ? 'Đang tải phân trang…' : `${total} kết quả · Trang ${page + 1}/${Math.max(page + 1, pages ?? 1)}`}</span>
    <div className="gov-actions">
      <button type="button" className="button" disabled={loading || page === 0} onClick={() => onPage(page - 1)}>Trước</button>
      <button type="button" className="button" disabled={loading || !data || (page + 1) * pageSize >= data.total} onClick={() => onPage(page + 1)}>Sau</button>
    </div>
  </nav>;
}

export function LoadState({ loading, error, empty, emptyText, reload }: {
  loading: boolean; error?: string; empty: boolean; emptyText: string; reload: () => void;
}) {
  if (error) return <div className="notice notice-error" role="alert"><p>Không tải được dữ liệu: {error}</p><button type="button" className="button" onClick={reload}>Thử tải lại</button></div>;
  if (loading) return <p className="gov-empty" role="status">Đang tải dữ liệu…</p>;
  if (empty) return <p className="gov-empty" role="status">{emptyText}</p>;
  return null;
}

export function Dialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="gov-dialog" aria-labelledby="gov-dialog-title" aria-busy={busy}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="gov-dialog-heading"><h2 id="gov-dialog-title">{title}</h2><button type="button" className="button" disabled={busy} onClick={onClose} aria-label="Đóng hộp thoại">Đóng</button></header>
    {children}
  </dialog>;
}

const labels: Record<string, string> = {
  name: 'Họ tên / tên mức', studentId: 'MSSV', email: 'Email', accountStatus: 'Trạng thái tài khoản',
  appointedAt: 'Ngày bổ nhiệm', points: 'Điểm trừ', description: 'Mô tả', status: 'Trạng thái',
  version: 'Phiên bản', userId: 'Mã người dùng', assignmentId: 'Mã lượt bổ nhiệm', id: 'Mã đối tượng',
  isModerator: 'Là kiểm duyệt viên', emailVerified: 'Đã xác minh email', profileApproved: 'Đã duyệt hồ sơ',
};
const values: Record<string, string> = {
  DANG_DUNG: 'Đang sử dụng', NGUNG_SU_DUNG: 'Ngừng sử dụng', HOAT_DONG: 'Hoạt động',
  CHO_KICH_HOAT: 'Chờ kích hoạt', BI_KHOA: 'Bị khóa', VO_HIEU_HOA: 'Vô hiệu hóa',
  APPOINT_MODERATOR: 'Bổ nhiệm kiểm duyệt viên', REVOKE_MODERATOR: 'Thu hồi vai trò',
  CREATE_PENALTY: 'Thêm mức phạt', UPDATE_PENALTY: 'Sửa mức phạt', DEACTIVATE_PENALTY: 'Ngừng sử dụng mức phạt',
};
export function readable(value: unknown, translate = true): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  return translate && Object.prototype.hasOwnProperty.call(values, text) ? values[text] : text;
}
function Snapshot({ title, value }: { title: string; value: Audit['before'] }) {
  return <section className="gov-snapshot"><h4>{title}</h4>{value ? <dl>{Object.entries(value).map(([key, entry]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{key.endsWith('At') && typeof entry === 'string' ? dateTime(entry) : readable(entry, key === 'status' || key === 'accountStatus')}</dd></div>)}</dl> : <p>Không có dữ liệu</p>}</section>;
}
export function AuditHistory({ resourceType, revision }: { resourceType: Audit['resourceType']; revision: number }) {
  const [page, setPage] = useState(0);
  const history = usePage<Audit>(listPath('audit', page, { resourceType }), revision);
  return <section className="gov-card gov-history" aria-labelledby={`history-${resourceType}`}>
    <header className="gov-section-heading"><div><p className="eyebrow">TRUY VẾT THAY ĐỔI</p><h2 id={`history-${resourceType}`}>Lịch sử {resourceType === 'MODERATOR' ? 'vai trò kiểm duyệt viên' : 'thang phạt'}</h2><p className="gov-muted">Chỉ đọc · Mới nhất trước · Ghi nhận người thực hiện và giá trị trước / sau.</p></div><button type="button" className="button" onClick={history.reload} disabled={history.loading}>Tải lại lịch sử</button></header>
    <LoadState {...history} empty={history.data?.items.length === 0} emptyText="Chưa có thay đổi được ghi nhận." />
    {history.data && <ol className="gov-audit-list">{history.data.items.map((entry) => <li key={entry.id}>
      <div className="gov-audit-heading"><strong>{readable(entry.action)}</strong><time dateTime={entry.happenedAt}>{dateTime(entry.happenedAt)}</time></div>
      <p className="gov-muted">Người thực hiện: <strong>{entry.actorName || entry.actorId}</strong></p>
      <details><summary>Xem giá trị trước / sau</summary><div className="gov-snapshots"><Snapshot title="Trước thay đổi" value={entry.before} /><Snapshot title="Sau thay đổi" value={entry.after} /></div></details>
    </li>)}</ol>}
    <Pagination page={page} data={history.data} loading={history.loading} onPage={setPage} label="Phân trang lịch sử" />
  </section>;
}
