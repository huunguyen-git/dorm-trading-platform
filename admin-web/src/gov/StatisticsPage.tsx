import { useEffect, useState } from 'react';
import { api as request } from '../api/client';
import { errorMessage, listPath, LoadState, Pagination, usePage } from './shared';
import {
  statisticsApi,
  type CategoryLocationResponse,
  type LowReputationUser,
  type SemesterOption,
  type TopSubjectsResponse,
  type ZeroPriceResponse,
} from './types';

function useData<T>(path: string, tick: number) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    void request<T>(path, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setState({ data, loading: false }); },
      (err: unknown) => { if (!controller.signal.aborted) setState({ error: errorMessage(err), loading: false }); },
    );
    return () => controller.abort();
  }, [path, tick]);
  return state;
}

export default function StatisticsPage() {
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [semester, setSemester] = useState('');
  const [maxScore, setMaxScore] = useState(60);
  const [minDisputes, setMinDisputes] = useState(1);
  const [userPage, setUserPage] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request<SemesterOption[]>(`${statisticsApi}/semesters`, { signal: controller.signal })
      .then((list) => {
        setSemesters(list);
        if (list.length > 0) {
          setSemester((prev) => prev || list[0].code);
        }
      })
      .catch(() => {
        // Fallback to backend default current semester if semesters lookup fails.
      });
    return () => controller.abort();
  }, []);

  const periodQuery = semester ? `semester=${encodeURIComponent(semester)}` : '';
  const topSubjects = useData<TopSubjectsResponse>(
    `${statisticsApi}/top-subjects${periodQuery ? `?${periodQuery}&limit=10` : '?limit=10'}`,
    tick,
  );
  const categoryLocation = useData<CategoryLocationResponse>(
    `${statisticsApi}/category-location${periodQuery ? `?${periodQuery}` : ''}`,
    tick,
  );
  const zeroPrice = useData<ZeroPriceResponse>(
    `${statisticsApi}/zero-price${periodQuery ? `?${periodQuery}` : ''}`,
    tick,
  );
  const lowRep = usePage<LowReputationUser>(
    listPath('statistics/low-reputation-disputes', userPage, {
      maxScore: String(maxScore),
      minDisputes: String(minDisputes),
    }),
    tick,
  );

  useEffect(() => {
    setUserPage(0);
  }, [maxScore, minDisputes]);

  return (
    <section className="page-content">
      <header className="page-heading">
        <h1>Thống kê hệ thống</h1>
      </header>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="stats-semester">Học kỳ</label>
          <select
            id="stats-semester"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          >
            {semesters.length === 0 ? (
              <option value="">Học kỳ hiện tại</option>
            ) : (
              semesters.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))
            )}
          </select>
        </div>

        <button type="button" className="button" onClick={() => setTick((t) => t + 1)}>
          Làm mới
        </button>
      </div>

      {/* FR-18: Tỷ trọng 0đ */}
      <section className="panel stack">
        <h2>Tỷ trọng tài liệu 0đ / tặng miễn phí</h2>
        <LoadState
          loading={zeroPrice.loading}
          error={zeroPrice.error}
          empty={false}
          emptyText=""
          reload={() => setTick((t) => t + 1)}
        />
        {zeroPrice.data && (
          <div className="account-grid">
            <div className="account-card">
              <strong>{zeroPrice.data.zeroPricePercentage.toFixed(2)}%</strong>
              <p>
                {zeroPrice.data.zeroPriceCount} / {zeroPrice.data.totalCompleted} giao dịch hoàn tất là 0đ
              </p>
            </div>
            <div className="account-card">
              <strong>{zeroPrice.data.paidCount}</strong>
              <p>Giao dịch có thu phí trong kỳ</p>
            </div>
            <div className="account-card">
              <strong>
                {zeroPrice.data.zeroPriceActiveListings} / {zeroPrice.data.totalActiveListings}
              </strong>
              <p>Tin đăng đang bán có giá 0đ</p>
            </div>
          </div>
        )}
      </section>

      {/* FR-15: Top môn học */}
      <section className="panel stack">
        <h2>Top môn học theo học kỳ</h2>
        <LoadState
          loading={topSubjects.loading}
          error={topSubjects.error}
          empty={false}
          emptyText=""
          reload={() => setTick((t) => t + 1)}
        />
        {topSubjects.data && (
          <>
            {!topSubjects.data.searchTrackingActive && (
              <p className="notice">
                Lượt tìm kiếm hiện hiển thị 0 do module tìm kiếm chưa ghi nhận log truy vấn.
              </p>
            )}
            {topSubjects.data.items.length === 0 ? (
              <p className="notice">Chưa có dữ liệu môn học trong kỳ này.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã môn</th>
                    <th>Tên môn học</th>
                    <th>Giao dịch hoàn tất</th>
                    <th>Tin đang bán</th>
                    <th>Lượt tìm kiếm</th>
                  </tr>
                </thead>
                <tbody>
                  {topSubjects.data.items.map((item) => (
                    <tr key={`${item.subjectCode}-${item.subjectName}`}>
                      <td>{item.subjectCode}</td>
                      <td>{item.subjectName}</td>
                      <td>{item.exchangedCount}</td>
                      <td>{item.activeListingCount}</td>
                      <td>{item.searchCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* FR-17: Tỷ trọng theo danh mục & khu vực */}
      <section className="panel stack">
        <h2>Tỷ trọng giao dịch theo danh mục và khu vực ĐHQG-HCM</h2>
        <LoadState
          loading={categoryLocation.loading}
          error={categoryLocation.error}
          empty={false}
          emptyText=""
          reload={() => setTick((t) => t + 1)}
        />
        {categoryLocation.data && (
          <div className="account-grid">
            <div>
              <h3>Theo danh mục ({categoryLocation.data.totalCompleted} giao dịch)</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Danh mục</th>
                    <th>Số lượng</th>
                    <th>Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryLocation.data.byCategory.map((row) => (
                    <tr key={row.code}>
                      <td>{row.name}</td>
                      <td>{row.count}</td>
                      <td>{row.percentage.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3>Theo khu vực ĐHQG-HCM</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Khu vực</th>
                    <th>Số lượng</th>
                    <th>Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryLocation.data.byLocation.map((row) => (
                    <tr key={row.code}>
                      <td>{row.name}</td>
                      <td>{row.count}</td>
                      <td>{row.percentage.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* FR-16: Người dùng uy tín thấp & tranh chấp */}
      <section className="panel stack">
        <h2>Người dùng điểm uy tín thấp hoặc nhiều tranh chấp</h2>
        <div className="toolbar">
          <div className="field">
            <label htmlFor="stats-max-score">Điểm uy tín tối đa</label>
            <input
              id="stats-max-score"
              type="number"
              min={0}
              max={100}
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label htmlFor="stats-min-disputes">Số tranh chấp tối thiểu</label>
            <input
              id="stats-min-disputes"
              type="number"
              min={0}
              max={100}
              value={minDisputes}
              onChange={(e) => setMinDisputes(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <LoadState
          loading={lowRep.loading}
          error={lowRep.error}
          empty={!lowRep.loading && !lowRep.error && (!lowRep.data || lowRep.data.items.length === 0)}
          emptyText="Không có người dùng nào vượt ngưỡng cảnh báo."
          reload={() => setTick((t) => t + 1)}
        />
        {lowRep.data && lowRep.data.items.length > 0 && (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Thành viên</th>
                  <th>MSSV</th>
                  <th>Điểm uy tín</th>
                  <th>Tranh chấp</th>
                  <th>Vi phạm</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {lowRep.data.items.map((u) => (
                  <tr key={u.userId}>
                    <td>{u.fullName}</td>
                    <td>{u.studentId}</td>
                    <td>{u.reputationScore}</td>
                    <td>{u.disputeCount}</td>
                    <td>{u.violationCount}</td>
                    <td>{u.accountStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={userPage}
              data={lowRep.data}
              loading={lowRep.loading}
              onPage={setUserPage}
              label="Phân trang người dùng uy tín thấp"
            />
          </>
        )}
      </section>
    </section>
  );
}
