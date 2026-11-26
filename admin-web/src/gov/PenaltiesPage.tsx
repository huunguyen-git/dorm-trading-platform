import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { AuditHistory, Dialog, LoadState, Pagination, errorMessage, isConflict, listPath, readable, usePage } from './shared';
import { seniorApi, type Penalty } from './types';

function PenaltyEditor({ penalty, onClose, onSuccess, onReload }: {
  penalty: Penalty | null; onClose: () => void; onSuccess: (message: string) => void; onReload: () => void;
}) {
  const [name, setName] = useState(penalty?.name ?? '');
  const [points, setPoints] = useState(penalty ? String(penalty.points) : '');
  const [description, setDescription] = useState(penalty?.description ?? '');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; points?: string; description?: string }>({});
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const pointsInput = useRef<HTMLInputElement>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const invalidName = !name.trim() ? 'Nhập tên mức phạt.' : undefined;
    const invalidPoints = !/^\d+$/.test(points) || Number(points) < 1 || Number(points) > 2147483647
      ? 'Điểm trừ phải là số nguyên từ 1 đến 2.147.483.647.' : undefined;
    const invalidDescription = description.length > 4000 ? 'Mô tả tối đa 4.000 ký tự.' : undefined;
    setFieldErrors({ name: invalidName, points: invalidPoints, description: invalidDescription });
    if (invalidName || invalidPoints || invalidDescription) {
      const invalidField = invalidName ? nameInput.current : invalidPoints ? pointsInput.current : descriptionInput.current;
      invalidField?.focus();
      return;
    }
    setBusy(true); setError(''); setConflict(false);
    try {
      await api<Penalty>(`${seniorApi}/penalties${penalty ? `/${encodeURIComponent(penalty.id)}` : ''}`, {
        method: penalty ? 'PUT' : 'POST',
        body: JSON.stringify({ name: name.trim(), points: Number(points), description: description.trim(), ...(penalty ? { version: penalty.version } : {}) }),
      });
      onSuccess(penalty ? `Đã cập nhật mức phạt “${name.trim()}”.` : `Đã thêm mức phạt “${name.trim()}”.`);
    } catch (cause) { setError(errorMessage(cause)); setConflict(isConflict(cause)); }
    finally { setBusy(false); }
  }
  return <Dialog title={penalty ? 'Sửa mức phạt' : 'Thêm mức phạt'} busy={busy} onClose={onClose}>
    <p className="gov-muted">{penalty ? 'Thay đổi chỉ áp dụng cho quyết định về sau; không sửa các quyết định đã ghi.' : 'Quy định mức phạt mới để dùng khi xử lý báo cáo. Không có mức điểm đặt sẵn.'}</p>
    <form className="gov-form" onSubmit={(event) => void save(event)} noValidate>
      <fieldset disabled={busy}>
        <label htmlFor="penalty-name"><span>Tên mức phạt <span className="gov-required">(bắt buộc)</span></span><input ref={nameInput} id="penalty-name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? 'penalty-name-error' : undefined} /></label>
        {fieldErrors.name && <p className="error gov-field-error" id="penalty-name-error" role="alert">{fieldErrors.name}</p>}
        <label htmlFor="penalty-points"><span>Số điểm trừ <span className="gov-required">(bắt buộc)</span></span><input ref={pointsInput} id="penalty-points" type="text" inputMode="numeric" value={points} onChange={(event) => setPoints(event.target.value)} required aria-invalid={!!fieldErrors.points} aria-describedby={`penalty-points-help${fieldErrors.points ? ' penalty-points-error' : ''}`} /></label>
        <p className="gov-muted gov-field-help" id="penalty-points-help">Số nguyên dương, tối đa 2.147.483.647; không nhập số thập phân.</p>
        {fieldErrors.points && <p className="error gov-field-error" id="penalty-points-error" role="alert">{fieldErrors.points}</p>}
        <label htmlFor="penalty-description">Mô tả áp dụng<textarea ref={descriptionInput} id="penalty-description" rows={4} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} aria-invalid={!!fieldErrors.description} aria-describedby={fieldErrors.description ? 'penalty-description-error' : undefined} /></label>
        {fieldErrors.description && <p className="error gov-field-error" id="penalty-description-error" role="alert">{fieldErrors.description}</p>}
      </fieldset>
      {error && <div className="notice notice-error" role="alert"><p>{error}</p>{conflict && <><p>Tên có thể đã tồn tại hoặc mức phạt đã được người khác thay đổi. Dữ liệu bạn nhập vẫn được giữ. Kiểm tra tên; nếu xung đột phiên bản, tải lại danh sách rồi mở lại bản mới trước khi sửa.</p><button type="button" className="button" disabled={busy} onClick={onReload}>Tải lại danh sách (đóng biểu mẫu)</button></>}</div>}
      <div className="gov-dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>Hủy</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu mức phạt'}</button></div>
    </form>
  </Dialog>;
}

export default function PenaltiesPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{ penalty: Penalty | null } | null>(null);
  const [deactivating, setDeactivating] = useState<Penalty | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [success, setSuccess] = useState('');
  const penalties = usePage<Penalty>(listPath('penalties', page, { q: query, status }), revision);
  function mutationSucceeded(message: string) {
    setSuccess(message); setEditor(null); setDeactivating(null); setPage(0); setRevision((value) => value + 1);
  }
  async function deactivate() {
    if (!deactivating || busy) return;
    setBusy(true); setError(''); setConflict(false);
    try {
      await api<Penalty>(`${seniorApi}/penalties/${encodeURIComponent(deactivating.id)}/deactivate`, { method: 'POST', body: JSON.stringify({ version: deactivating.version }) });
      mutationSucceeded(`Đã ngừng sử dụng mức phạt “${deactivating.name}”. Các quyết định đã ghi được giữ nguyên.`);
    } catch (cause) { setError(errorMessage(cause)); setConflict(isConflict(cause)); }
    finally { setBusy(false); }
  }
  return <section className="page-content gov-page">
    <header className="page-heading gov-page-heading"><div><p className="eyebrow">QUẢN TRỊ CỘNG ĐỒNG · UC-40</p><h1>Quản lý thang phạt</h1><p>Quy định mức điểm trừ, phạm vi áp dụng và vòng đời sử dụng.</p></div><button type="button" className="button button-primary" onClick={() => { setSuccess(''); setEditor({ penalty: null }); }}>Thêm mức phạt</button></header>
    {success && <p className="notice notice-success" role="status">{success}</p>}
    <p className="notice">Chỉ mức <strong>Đang sử dụng</strong> được áp dụng cho quyết định mới. Sửa hoặc ngừng mức phạt không thay đổi các quyết định trước đó.</p>
    <section className="gov-card" aria-label="Danh sách thang phạt">
      <form className="gov-toolbar" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(0); penalties.reload(); }}><label className="gov-search" htmlFor="penalty-search">Tìm mức phạt<input id="penalty-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên hoặc mô tả mức phạt" /></label><label htmlFor="penalty-status">Trạng thái<select id="penalty-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}><option value="">Tất cả trạng thái</option><option value="DANG_DUNG">Đang sử dụng</option><option value="NGUNG_SU_DUNG">Ngừng sử dụng</option></select></label><button className="button" type="submit">Tìm kiếm</button><button className="button" type="button" disabled={penalties.loading} onClick={penalties.reload}>Tải lại</button></form>
      <LoadState {...penalties} empty={penalties.data?.items.length === 0} emptyText={query || status ? 'Không có mức phạt phù hợp. Thử thay đổi từ khóa hoặc trạng thái.' : 'Chưa có mức phạt. Chọn “Thêm mức phạt” để quy định thang phạt.'} />
      {penalties.data && penalties.data.items.length > 0 && <div className="gov-table-wrap"><table className="gov-table"><caption className="gov-sr-only">Các mức phạt trong thang phạt</caption><thead><tr><th scope="col">Tên mức phạt</th><th scope="col">Điểm trừ</th><th scope="col">Mô tả</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody>{penalties.data.items.map((penalty) => <tr key={penalty.id}><td data-label="Tên mức phạt"><strong>{penalty.name}</strong></td><td data-label="Điểm trừ" className="gov-points">{penalty.points.toLocaleString('vi-VN')}</td><td data-label="Mô tả" className="gov-description">{penalty.description || '—'}</td><td data-label="Trạng thái"><span className={`status-badge ${penalty.status === 'DANG_DUNG' ? 'gov-badge-active' : ''}`}>{readable(penalty.status)}</span></td><td data-label="Thao tác"><div className="gov-actions">{penalty.status === 'DANG_DUNG' && <><button type="button" className="button" onClick={() => setEditor({ penalty })}>Sửa</button><button type="button" className="button gov-button-danger" onClick={() => { setError(''); setConflict(false); setDeactivating(penalty); }}>Ngừng sử dụng</button></>}</div></td></tr>)}</tbody></table></div>}
      <Pagination page={page} data={penalties.data} loading={penalties.loading} onPage={setPage} label="Phân trang thang phạt" />
    </section>
    <AuditHistory resourceType="PENALTY" revision={revision} />
    {editor && <PenaltyEditor penalty={editor.penalty} onClose={() => setEditor(null)} onSuccess={mutationSucceeded} onReload={() => { setEditor(null); penalties.reload(); }} />}
    {deactivating && <Dialog title="Ngừng sử dụng mức phạt" busy={busy} onClose={() => setDeactivating(null)}>
      <p>Ngừng sử dụng <strong>{deactivating.name}</strong> ({deactivating.points.toLocaleString('vi-VN')} điểm)?</p><p className="notice">Mức phạt này sẽ không thể được chọn cho quyết định mới. Các quyết định đã ghi vẫn giữ nguyên tên, điểm và mô tả tại thời điểm xử lý. Thao tác này không có chức năng kích hoạt lại.</p>
      {error && <div className="notice notice-error" role="alert"><p>{error}</p>{conflict && <><p>Mức phạt đã thay đổi. Tải lại và kiểm tra phiên bản mới trước khi xác nhận lại.</p><button type="button" className="button" onClick={() => { setDeactivating(null); penalties.reload(); }}>Tải lại danh sách</button></>}</div>}
      <div className="gov-dialog-actions"><button type="button" className="button" disabled={busy} onClick={() => setDeactivating(null)}>Hủy</button><button type="button" className="button gov-button-danger" disabled={busy || conflict} onClick={() => void deactivate()}>{busy ? 'Đang ngừng sử dụng…' : 'Xác nhận ngừng sử dụng'}</button></div>
    </Dialog>}
  </section>;
}
