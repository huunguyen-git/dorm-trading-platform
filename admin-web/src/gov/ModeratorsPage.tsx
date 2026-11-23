import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { AuditHistory, Dialog, LoadState, Pagination, dateTime, errorMessage, isConflict, listPath, readable, usePage } from './shared';
import { seniorApi, type Candidate, type Moderator } from './types';

function candidateReason(candidate: Candidate) {
  if (candidate.isModerator) return 'Đã là kiểm duyệt viên';
  if (candidate.accountStatus !== 'HOAT_DONG') return `Tài khoản ${readable(candidate.accountStatus).toLocaleLowerCase('vi-VN')}`;
  if (!candidate.emailVerified) return 'Chưa xác minh email';
  if (!candidate.profileApproved) return 'Hồ sơ chưa được duyệt';
  return '';
}

function AppointDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (message: string) => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const candidates = usePage<Candidate>(listPath('moderator-candidates', page, { q: query }));
  function searchCandidates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setQuery(search.trim()); setPage(0); candidates.reload();
  }
  async function appoint() {
    if (!selected || busy || candidateReason(selected)) return;
    setBusy(true); setError(''); setConflict(false);
    try {
      await api<Moderator>(`${seniorApi}/moderators`, { method: 'POST', body: JSON.stringify({ userId: selected.userId }) });
      onSuccess(`Đã bổ nhiệm ${selected.name} làm kiểm duyệt viên.`);
    } catch (cause) { setError(errorMessage(cause)); setConflict(isConflict(cause)); }
    finally { setBusy(false); }
  }
  return <Dialog title={selected ? 'Xác nhận bổ nhiệm' : 'Thêm kiểm duyệt viên'} busy={busy} onClose={onClose}>
    {error && <div className="notice notice-error" role="alert"><p>{error}</p>{conflict && <><p>Thông tin hoặc quyền đã thay đổi. Tải lại danh sách và kiểm tra điều kiện trước khi chọn lại.</p><button type="button" className="button" disabled={busy} onClick={() => { candidates.reload(); setSelected(null); }}>Tải lại ứng viên</button></>}</div>}
    {selected ? <>
      <p>Bổ nhiệm <strong>{selected.name}</strong> làm kiểm duyệt viên? Người này sẽ có quyền kiểm duyệt tin đăng và xử lý báo cáo.</p>
      <dl className="gov-identity"><div><dt>MSSV</dt><dd>{selected.studentId}</dd></div><div><dt>Email</dt><dd>{selected.email}</dd></div></dl>
      <div className="gov-dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>Hủy</button><button type="button" className="button" disabled={busy} onClick={() => { setSelected(null); setError(''); }}>Chọn người khác</button><button type="button" className="button button-primary" disabled={busy || conflict} onClick={() => void appoint()}>{busy ? 'Đang bổ nhiệm…' : 'Xác nhận bổ nhiệm'}</button></div>
    </> : <>
      <p className="gov-muted">Chọn tài khoản đang hoạt động, đã xác minh email, có hồ sơ được duyệt và chưa là kiểm duyệt viên.</p>
      <form className="gov-toolbar" onSubmit={searchCandidates}><label className="gov-search" htmlFor="candidate-search">Tìm người dùng<input id="candidate-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Họ tên, MSSV hoặc email" autoFocus /></label><button className="button" type="submit">Tìm kiếm</button></form>
      <LoadState {...candidates} empty={candidates.data?.items.length === 0} emptyText="Không tìm thấy người dùng. Thử họ tên, MSSV hoặc email khác." />
      {candidates.data && candidates.data.items.length > 0 && <div className="gov-table-wrap"><table className="gov-table"><caption className="gov-sr-only">Kết quả tìm người dùng để bổ nhiệm</caption><thead><tr><th scope="col">Người dùng</th><th scope="col">MSSV / Email</th><th scope="col">Điều kiện</th><th scope="col">Thao tác</th></tr></thead><tbody>{candidates.data.items.map((candidate) => {
        const reason = candidateReason(candidate);
        return <tr key={candidate.userId}><td data-label="Người dùng"><strong>{candidate.name}</strong></td><td data-label="MSSV / Email"><span className="gov-cell-line">{candidate.studentId}</span>{candidate.email}</td><td data-label="Điều kiện"><span className={`status-badge ${reason ? '' : 'gov-badge-active'}`}>{reason || 'Đủ điều kiện'}</span></td><td data-label="Thao tác"><button type="button" className="button" disabled={!!reason} aria-label={`Chọn ${candidate.name}`} onClick={() => { setSelected(candidate); setError(''); setConflict(false); }}>Chọn</button></td></tr>;
      })}</tbody></table></div>}
      <Pagination page={page} data={candidates.data} loading={candidates.loading} onPage={setPage} label="Phân trang ứng viên" />
      <div className="gov-dialog-actions"><button type="button" className="button" onClick={onClose}>Hủy</button></div>
    </>}
  </Dialog>;
}

export default function ModeratorsPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<Moderator | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [success, setSuccess] = useState('');
  const moderators = usePage<Moderator>(listPath('moderators', page, { q: query }), revision);
  function mutationSucceeded(message: string) {
    setSuccess(message); setAdding(false); setRevoking(null); setPage(0); setRevision((value) => value + 1);
  }
  async function revoke() {
    if (!revoking || busy) return;
    setBusy(true); setError(''); setConflict(false);
    try {
      const params = new URLSearchParams({ assignmentId: revoking.assignmentId });
      await api<void>(`${seniorApi}/moderators/${encodeURIComponent(revoking.userId)}?${params}`, { method: 'DELETE' });
      mutationSucceeded(`Đã thu hồi vai trò kiểm duyệt viên của ${revoking.name}. Báo cáo đang xử lý được trả về hàng chờ.`);
    } catch (cause) { setError(errorMessage(cause)); setConflict(isConflict(cause)); }
    finally { setBusy(false); }
  }
  return <section className="page-content gov-page">
    <header className="page-heading gov-page-heading"><div><p className="eyebrow">QUẢN TRỊ CỘNG ĐỒNG · UC-39</p><h1>Quản lý kiểm duyệt viên</h1><p>Bổ nhiệm đúng người, quản lý vai trò và theo dõi mọi thay đổi.</p></div><button type="button" className="button button-primary" onClick={() => { setSuccess(''); setAdding(true); }}>Thêm kiểm duyệt viên</button></header>
    {success && <p className="notice notice-success" role="status">{success}</p>}
    <section className="gov-card" aria-label="Danh sách kiểm duyệt viên">
      <form className="gov-toolbar" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(0); moderators.reload(); }}><label className="gov-search" htmlFor="moderator-search">Tìm kiểm duyệt viên<input id="moderator-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Họ tên, MSSV hoặc email" /></label><button className="button" type="submit">Tìm kiếm</button><button className="button" type="button" disabled={moderators.loading} onClick={moderators.reload}>Tải lại</button></form>
      <LoadState {...moderators} empty={moderators.data?.items.length === 0} emptyText={query ? 'Không có kiểm duyệt viên phù hợp. Hãy đổi từ khóa tìm kiếm.' : 'Chưa có kiểm duyệt viên. Chọn “Thêm kiểm duyệt viên” để bổ nhiệm.'} />
      {moderators.data && moderators.data.items.length > 0 && <div className="gov-table-wrap"><table className="gov-table"><caption className="gov-sr-only">Danh sách kiểm duyệt viên hiện hành</caption><thead><tr><th scope="col">Họ tên</th><th scope="col">MSSV</th><th scope="col">Email</th><th scope="col">Ngày bổ nhiệm</th><th scope="col">Thao tác</th></tr></thead><tbody>{moderators.data.items.map((moderator) => <tr key={moderator.assignmentId}><td data-label="Họ tên"><strong>{moderator.name}</strong><span className="gov-cell-line gov-muted">{readable(moderator.accountStatus)}</span></td><td data-label="MSSV">{moderator.studentId}</td><td data-label="Email">{moderator.email}</td><td data-label="Ngày bổ nhiệm"><time dateTime={moderator.appointedAt}>{dateTime(moderator.appointedAt)}</time></td><td data-label="Thao tác"><button type="button" className="button gov-button-danger" aria-label={`Thu hồi vai trò của ${moderator.name}`} onClick={() => { setRevoking(moderator); setError(''); setConflict(false); setSuccess(''); }}>Thu hồi vai trò</button></td></tr>)}</tbody></table></div>}
      <Pagination page={page} data={moderators.data} loading={moderators.loading} onPage={setPage} label="Phân trang kiểm duyệt viên" />
    </section>
    <AuditHistory resourceType="MODERATOR" revision={revision} />
    {adding && <AppointDialog onClose={() => setAdding(false)} onSuccess={mutationSucceeded} />}
    {revoking && <Dialog title="Xác nhận thu hồi vai trò" busy={busy} onClose={() => setRevoking(null)}>
      <p>Thu hồi vai trò kiểm duyệt viên của <strong>{revoking.name}</strong> ({revoking.studentId})?</p><p className="notice">Các báo cáo người này đang xử lý sẽ được trả về trạng thái <strong>Chờ xử lý</strong> để phân công lại. Báo cáo đã có kết quả và lịch sử cũ được giữ nguyên.</p>
      {error && <div className="notice notice-error" role="alert"><p>{error}</p>{conflict && <><p>Lượt bổ nhiệm có thể đã thay đổi. Hãy tải lại và kiểm tra trước khi thao tác tiếp.</p><button type="button" className="button" onClick={() => { setRevoking(null); moderators.reload(); }}>Tải lại danh sách</button></>}</div>}
      <div className="gov-dialog-actions"><button type="button" className="button" disabled={busy} onClick={() => setRevoking(null)}>Hủy</button><button type="button" className="button gov-button-danger" disabled={busy || conflict} onClick={() => void revoke()}>{busy ? 'Đang thu hồi…' : 'Xác nhận thu hồi'}</button></div>
    </Dialog>}
  </section>;
}
