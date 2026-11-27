import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import ProfileDetailPage from './ProfileDetailPage';

vi.mock('../api/client', () => ({ api: vi.fn(), attachment: vi.fn(async () => null), ApiError: class extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } } }));

const profile = {
  id: 'u1', name: 'Trần Minh', studentId: 'SE123456', email: 'minh@uni.edu.vn', phone: null,
  school: null, campus: null, major: null, cohort: null, studyStatus: null, reputation: 100,
  emailVerified: true, profileApproved: false, profileStatus: 'CHO_DUYET', rejectReason: null,
  pendingUpdate: false, hasStudentCard: false, accountStatus: 'CHO_KICH_HOAT', version: 7,
};

function renderPage() {
  return render(<MemoryRouter initialEntries={['/profiles/u1']}><Routes>
    <Route path="/profiles/:id" element={<ProfileDetailPage />} />
    <Route path="/profiles" element={<p>Danh sách hồ sơ</p>} />
  </Routes></MemoryRouter>);
}

beforeEach(() => { cleanup(); vi.mocked(api).mockReset(); });

it('blocks rejecting a profile without a reason', async () => {
  vi.mocked(api).mockResolvedValueOnce(profile);
  renderPage();
  fireEvent.click(await screen.findByTestId('reject'));
  fireEvent.click(screen.getByTestId('confirm-reject'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Lý do từ chối cần 3–1000 ký tự.');
  expect(vi.mocked(api).mock.calls.some(([path]) => String(path).endsWith('/reject'))).toBe(false);
});

it('reports a stale profile on approve 409 and reloads it', async () => {
  vi.mocked(api).mockResolvedValueOnce(profile)
    .mockRejectedValueOnce(new ApiError(409, 'Hồ sơ đã được người khác xử lý.', 'PROFILE_ALREADY_HANDLED'))
    .mockResolvedValueOnce({ ...profile, profileApproved: true, profileStatus: 'DA_DUYET' });
  renderPage();
  fireEvent.click(await screen.findByTestId('approve'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Hồ sơ đã được người khác xử lý. Thông tin vừa được làm mới.');
  await waitFor(() => expect(vi.mocked(api).mock.calls.filter(([path]) => String(path) === '/admin/profiles/u1')).toHaveLength(2));
  // Sau khi tải lại, hồ sơ đã xử lý thì không quyết định lại được.
  expect(await screen.findByTestId('approve')).toBeDisabled();
  expect(screen.getByTestId('reject')).toBeDisabled();
  expect(screen.getByText('Hồ sơ này đã được xử lý nên không thể duyệt hay từ chối lại.')).toBeInTheDocument();
  // Thông báo xung đột phải sống sót qua lần tải lại, không bị load() xóa.
  expect(screen.getByRole('alert')).toHaveTextContent('Hồ sơ đã được người khác xử lý. Thông tin vừa được làm mới.');
});

it('shows the real message for a non-stale 409 instead of the stale hint', async () => {
  vi.mocked(api).mockResolvedValueOnce(profile)
    .mockRejectedValueOnce(new ApiError(409, 'MSSV đã thuộc về tài khoản khác.', 'STUDENT_ID_IN_USE'));
  renderPage();
  fireEvent.click(await screen.findByTestId('approve'));
  expect(await screen.findByRole('alert')).toHaveTextContent('MSSV đã thuộc về tài khoản khác.');
  expect(screen.queryByText('Hồ sơ đã được người khác xử lý. Thông tin vừa được làm mới.')).toBeNull();
});

it('sends the reviewed snapshot version so a concurrent edit cannot be approved blindly', async () => {
  vi.mocked(api).mockResolvedValueOnce(profile).mockResolvedValueOnce(undefined);
  renderPage();
  fireEvent.click(await screen.findByTestId('approve'));
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => String(path).endsWith('/approve?expectedVersion=7'))).toBe(true));
    const call = vi.mocked(api).mock.calls.find(([path]) => String(path).endsWith('/approve?expectedVersion=7'));
    expect(call?.[1]?.body).toBeUndefined();
});

it('reports a profile edited after load as changed, with different wording from an already handled one', async () => {
  vi.mocked(api).mockResolvedValueOnce(profile)
    .mockRejectedValueOnce(new ApiError(409, 'Hồ sơ đã thay đổi sau khi bạn xem.', 'PROFILE_CHANGED'))
    .mockResolvedValueOnce({ ...profile, version: 8, name: 'Trần Minh Anh' });
  renderPage();
  fireEvent.click(await screen.findByTestId('approve'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Hồ sơ đã được người dùng cập nhật sau khi bạn mở trang.');
  // Hồ sơ mới vẫn ở trạng thái chờ duyệt nên vẫn quyết định được, khác trường hợp đã bị xử lý.
  expect(await screen.findByTestId('approve')).toBeEnabled();
  expect(screen.getByRole('heading', { name: 'Trần Minh Anh' })).toBeInTheDocument();
});

it('shows the latest rejection reason for an approved profile', async () => {
  vi.mocked(api).mockResolvedValueOnce({ ...profile, profileApproved: true, profileStatus: 'DA_DUYET', rejectReason: 'Ảnh thẻ mờ.' });
  renderPage();
  expect(await screen.findByText('Lý do từ chối gần nhất: Ảnh thẻ mờ.')).toBeInTheDocument();
});
