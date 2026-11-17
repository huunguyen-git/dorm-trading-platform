import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import PendingProfilesPage from './PendingProfilesPage';

vi.mock('../api/client', () => ({ api: vi.fn(), attachment: vi.fn(async () => null), ApiError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));

const row = (id: string) => ({
  id, name: `Người ${id}`, studentId: `SE00000${id}`, email: `u${id}@uni.edu.vn`,
  kind: 'DANG_KY' as const, submittedAt: '2026-11-17T03:00:00Z', hasStudentCard: false,
});

function renderPage(state?: { done: string }) {
  return render(<MemoryRouter initialEntries={[{ pathname: '/profiles', state }]}><PendingProfilesPage /></MemoryRouter>);
}

beforeEach(() => { cleanup(); vi.mocked(api).mockReset(); });

it('reports the 403 message instead of the raw error', async () => {
  vi.mocked(api).mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN'));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('Tài khoản không có quyền duyệt hồ sơ.');
  expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
});

it('shows the empty state when no profile is waiting', async () => {
  vi.mocked(api).mockResolvedValueOnce([]);
  renderPage();
  expect(await screen.findByText('Không có hồ sơ nào đang chờ duyệt.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
});

it('flashes the approve result and disables paging on a short first page', async () => {
  vi.mocked(api).mockResolvedValueOnce([row('1'), row('2')]);
  renderPage({ done: 'Đã duyệt hồ sơ của Người 1.' });
  expect(await screen.findByRole('status')).toHaveTextContent('Đã duyệt hồ sơ của Người 1.');
  expect(await screen.findByRole('link', { name: /Người 1/ })).toHaveAttribute('href', '/profiles/1');
  expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
});
