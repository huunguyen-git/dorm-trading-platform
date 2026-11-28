import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  formatConclusion,
  formatDateTime,
  formatEscalationReasonShort,
  formatOrderStatus,
  formatQueueState,
  formatShortOrderId,
  formatVnd,
  listDisputes,
} from './api';
import type {
  DisputePage,
  DisputeQueueCounts,
  DisputeQueueState,
  DisputeQueueStateFilter,
  DisputeReasonFilter,
} from './types';
import './disputes.css';

const PAGE_SIZE = 20;

const EMPTY_COUNTS: DisputeQueueCounts = {
  all: 0,
  ready: 0,
  waitingEvidence: 0,
  resolved: 0,
  overdue24h: 0,
  cancelDispute: 0,
};

const QUEUE_TABS: { value: DisputeQueueStateFilter; label: string; countKey: keyof DisputeQueueCounts }[] = [
  { value: 'ALL', label: 'Tất cả', countKey: 'all' },
  { value: 'READY', label: 'Cần xử lý', countKey: 'ready' },
  { value: 'WAITING_EVIDENCE', label: 'Chờ bổ sung', countKey: 'waitingEvidence' },
  { value: 'RESOLVED', label: 'Đã xử lý', countKey: 'resolved' },
];

function queueBadgeClass(state: DisputeQueueState): string {
  switch (state) {
    case 'READY':
      return 'status-badge dispute-badge-ready';
    case 'WAITING_EVIDENCE':
      return 'status-badge dispute-badge-waiting';
    case 'RESOLVED':
      return 'status-badge dispute-badge-resolved';
    default:
      return 'status-badge dispute-badge-neutral';
  }
}

export default function DisputesQueuePage() {
  const flash = (useLocation().state as { done?: string } | null)?.done ?? '';

  const [queueState, setQueueState] = useState<DisputeQueueStateFilter>('ALL');
  const [reason, setReason] = useState<DisputeReasonFilter>('ALL');
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [data, setData] = useState<DisputePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    void listDisputes({
      reason,
      queueState,
      q: appliedSearch,
      page,
      size: PAGE_SIZE,
    })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 403) {
          setError('Tài khoản không có quyền truy cập hàng đợi tranh chấp giao dịch.');
        } else {
          setError(cause instanceof Error && cause.message ? cause.message : 'Không thể tải danh sách tranh chấp.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reason, queueState, appliedSearch, page, refreshNonce]);

  const counts = data?.counts ?? EMPTY_COUNTS;
  const items = data?.items ?? [];
  const hasFilters = queueState !== 'ALL' || reason !== 'ALL' || appliedSearch.trim() !== '';

  function handleSelectQueueState(next: DisputeQueueStateFilter) {
    setQueueState(next);
    setPage(0);
  }

  function handleSelectReason(next: DisputeReasonFilter) {
    setReason(next);
    setPage(0);
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = searchDraft.trim();
    if (trimmed === appliedSearch && page === 0) {
      setRefreshNonce((n) => n + 1);
      return;
    }
    setAppliedSearch(trimmed);
    setPage(0);
  }

  function handleResetFilters() {
    setQueueState('ALL');
    setReason('ALL');
    setSearchDraft('');
    setAppliedSearch('');
    setPage(0);
    setRefreshNonce((n) => n + 1);
  }

  return (
    <section className="page-content disputes-page">
      <header className="page-heading disputes-page-header">
        <div>
          <p className="eyebrow">KIỂM DUYỆT GIAO DỊCH · UC-29</p>
          <h1>Tranh chấp giao dịch</h1>
          <p>
            Xem xét các giao dịch đã báo giao nhưng quá 24 giờ chưa xác nhận hoặc có tranh chấp hủy. Giao dịch có
            chính bạn tham gia không hiển thị trong hàng đợi này.
          </p>
        </div>
        <div className="disputes-header-actions">
          <button
            type="button"
            className="button button-compact"
            disabled={loading}
            onClick={() => setRefreshNonce((n) => n + 1)}
          >
            {loading ? 'Đang tải…' : 'Làm mới'}
          </button>
        </div>
      </header>

      {flash && (
        <p className="notice notice-success" role="status">
          {flash}
        </p>
      )}

      <section className="disputes-card" aria-label="Bộ lọc hàng đợi tranh chấp">
        <div className="disputes-tabs" role="tablist" aria-label="Trạng thái hàng đợi">
          {QUEUE_TABS.map((tab) => {
            const selected = queueState === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                className="disputes-tab"
                onClick={() => handleSelectQueueState(tab.value)}
              >
                <span>{tab.label}</span>
                <span className="dispute-count-pill">{counts[tab.countKey]}</span>
              </button>
            );
          })}
        </div>

        <form className="disputes-filter-form" onSubmit={handleSearchSubmit} noValidate>
          <label className="disputes-filter-field" htmlFor="dispute-reason-filter">
            Lý do chuyển xử lý
            <select
              id="dispute-reason-filter"
              value={reason}
              onChange={(event) => handleSelectReason(event.target.value as DisputeReasonFilter)}
            >
              <option value="ALL">Tất cả lý do</option>
              <option value="OVERDUE_24H">Quá hạn 24 giờ</option>
              <option value="CANCEL_DISPUTE">Tranh chấp hủy</option>
            </select>
          </label>

          <label className="disputes-filter-field disputes-filter-search" htmlFor="dispute-search-input">
            Tìm kiếm hồ sơ
            <input
              id="dispute-search-input"
              type="search"
              maxLength={200}
              placeholder="Mã giao dịch, tiêu đề tin đăng, tên người mua hoặc người bán…"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>

          <div className="filter-actions">
            <button type="submit" className="button button-primary button-compact" disabled={loading}>
              Tìm kiếm
            </button>
            {hasFilters && (
              <button type="button" className="button button-compact" disabled={loading} onClick={handleResetFilters}>
                Đặt lại
              </button>
            )}
          </div>
        </form>

        <div className="disputes-reason-summary">
          <span>
            Quá hạn 24 giờ: <strong>{counts.overdue24h}</strong>
          </span>
          <span>·</span>
          <span>
            Tranh chấp hủy: <strong>{counts.cancelDispute}</strong>
          </span>
          <span>·</span>
          <span>Hạn phản hồi KDV tiêu chuẩn: 3 ngày làm việc kể từ lúc chuyển Chờ xử lý</span>
        </div>
      </section>

      <section className="disputes-card" aria-label="Danh sách giao dịch tranh chấp">
        {error ? (
          <div className="notice notice-error dispute-error-banner" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="button button-compact"
              onClick={() => setRefreshNonce((n) => n + 1)}
            >
              Thử lại
            </button>
          </div>
        ) : loading ? (
          <p className="notice" role="status">
            Đang tải danh sách giao dịch tranh chấp…
          </p>
        ) : items.length === 0 ? (
          <div className="dispute-empty" role="status">
            <p>
              {page > 0
                ? `Trang ${page + 1} hiện không còn hồ sơ tranh chấp nào.`
                : hasFilters
                  ? 'Không có hồ sơ tranh chấp nào khớp với bộ lọc hiện tại.'
                  : 'Hiện không có giao dịch quá hạn hoặc tranh chấp nào cần xem xét.'}
            </p>
            {(page > 0 || hasFilters) && (
              <div className="filter-actions">
                {page > 0 && (
                  <button
                    type="button"
                    className="button button-primary button-compact"
                    onClick={() => setPage(0)}
                  >
                    Quay về trang đầu
                  </button>
                )}
                {page > 1 && (
                  <button
                    type="button"
                    className="button button-compact"
                    onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                  >
                    Trang trước
                  </button>
                )}
                {hasFilters && (
                  <button type="button" className="button button-compact" onClick={handleResetFilters}>
                    Xem tất cả hồ sơ
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Mã giao dịch</th>
                    <th>Tin đăng & giá</th>
                    <th>Các bên (Zero-PII)</th>
                    <th>Lý do & chuyển lúc</th>
                    <th>Hạn phản hồi KDV</th>
                    <th>Hàng đợi</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isSlaOverdue = item.overdueSla && item.queueState !== 'RESOLVED';
                    return (
                      <tr key={item.orderId}>
                        <td>
                          <span className="dispute-code" title={item.orderId}>
                            {formatShortOrderId(item.orderId)}
                          </span>
                          <span className="cell-sub">{formatOrderStatus(item.status)}</span>
                        </td>
                        <td>
                          <span className="cell-primary">{item.listing.title}</span>
                          <span className="cell-sub">
                            Giá thỏa thuận: <strong>{formatVnd(item.agreedPriceVnd, item.listing.isFree)}</strong>
                            {item.listing.isCombo ? ' · Combo' : ''}
                          </span>
                        </td>
                        <td>
                          <div className="dispute-party-stack">
                            <div className="dispute-party-row">
                              <span className="dispute-party-role">Mua:</span>
                              <strong>{item.buyer.displayName}</strong>
                              <span className="dispute-reputation">({item.buyer.reputationScore} đ)</span>
                            </div>
                            <div className="dispute-party-row">
                              <span className="dispute-party-role">Bán:</span>
                              <strong>{item.seller.displayName}</strong>
                              <span className="dispute-reputation">({item.seller.reputationScore} đ)</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status-badge ${
                              item.escalationReason === 'OVERDUE_24H'
                                ? 'dispute-badge-overdue'
                                : 'dispute-badge-cancel'
                            }`}
                          >
                            {formatEscalationReasonShort(item.escalationReason)}
                          </span>
                          <span className="cell-sub">Chuyển: {formatDateTime(item.escalatedAt)}</span>
                          {item.reportedDeliveredAt && (
                            <span className="cell-sub">Báo giao: {formatDateTime(item.reportedDeliveredAt)}</span>
                          )}
                        </td>
                        <td>
                          <div className="dispute-sla-block">
                            <span>{formatDateTime(item.responseDeadlineAt)}</span>
                            {isSlaOverdue && (
                              <span className="status-badge dispute-badge-overdue">Quá hạn SLA 3 ngày</span>
                            )}
                            {item.queueState === 'RESOLVED' && item.decisionSummary && (
                              <span className="cell-sub">
                                {formatConclusion(item.decisionSummary.conclusion)} ·{' '}
                                {item.decisionSummary.decidedByName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={queueBadgeClass(item.queueState)}>
                            {formatQueueState(item.queueState)}
                          </span>
                        </td>
                        <td>
                          <Link
                            className="button button-primary button-compact dispute-action-link"
                            to={`/disputes/${item.orderId}`}
                          >
                            Mở hồ sơ
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data && (
              <div className="pagination-bar">
                <span>
                  Trang {data.page + 1} / {Math.max(1, data.totalPages)} · Tổng {data.totalElements} hồ sơ
                </span>
                <div className="pagination-actions">
                  <button
                    type="button"
                    className="button button-compact"
                    disabled={loading || data.page <= 0}
                    onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    className="button button-compact"
                    disabled={loading || data.page + 1 >= data.totalPages}
                    onClick={() => setPage((prev) => prev + 1)}
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}
