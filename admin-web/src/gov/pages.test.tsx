import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import type * as ApiClient from '../api/client';
import ModeratorsPage from './ModeratorsPage';
import PenaltiesPage from './PenaltiesPage';

vi.mock('../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof ApiClient>(),
  api: vi.fn(),
}));
afterEach(() => cleanup());

const request = vi.mocked(api);
const page = <T,>(items: T[]) => ({ items, page: 0, size: 20, total: items.length });
const activePenalty = { id: 'active', name: 'Active rule', points: 4, description: '', status: 'DANG_DUNG' as const, version: 0 };
const inactivePenalty = { id: 'inactive', name: 'Old rule', points: 2, description: '', status: 'NGUNG_SU_DUNG' as const, version: 1 };

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path) => {
    if (path.startsWith('/admin/senior/penalties?')) return page([activePenalty, inactivePenalty]) as never;
    if (path.startsWith('/admin/senior/moderators?')) return page([]) as never;
    if (path.startsWith('/admin/senior/audit?')) return page([]) as never;
    if (path.startsWith('/admin/senior/moderator-candidates?')) return page([{
      userId: 'candidate', name: 'Candidate User', studentId: 'S-1', email: 'candidate@example.test',
      accountStatus: 'HOAT_DONG', isModerator: false, emailVerified: true, profileApproved: true,
    }]) as never;
    return undefined as never;
  });
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false; };
});

it('does not offer editing or deactivation for stopped penalties', async () => {
  render(<PenaltiesPage />);
  const oldRule = await screen.findByText('Old rule');
  const row = oldRule.closest('tr');
  expect(row).not.toBeNull();
  expect(within(row!).queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
  expect(within(row!).queryByRole('button', { name: 'Ngừng sử dụng' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Sửa Active rule' })).toHaveLength(1);
});

it('validates penalty points and retains entered values after a conflict', async () => {
  const user = userEvent.setup();
  request.mockImplementation(async (path, init) => {
    if (path.startsWith('/admin/senior/penalties?')) return page([]) as never;
    if (path.startsWith('/admin/senior/audit?')) return page([]) as never;
    if (init?.method === 'POST') throw new ApiError(409, 'Tên mức phạt đã tồn tại');
    return undefined as never;
  });
  render(<PenaltiesPage />);
  await user.click(await screen.findByRole('button', { name: 'Thêm mức phạt' }));
  const name = screen.getByLabelText(/Tên mức phạt/);
  const points = screen.getByLabelText(/Số điểm trừ/);
  await user.type(name, 'Duplicate rule');
  await user.type(points, '1.5');
  await user.click(screen.getByRole('button', { name: 'Lưu mức phạt' }));
  expect(await screen.findByText(/số nguyên từ 1 đến/)).toBeInTheDocument();
  expect(request).not.toHaveBeenCalledWith('/admin/senior/penalties', expect.objectContaining({ method: 'POST' }));

  await user.clear(points);
  await user.type(points, '5');
  await user.click(screen.getByRole('button', { name: 'Lưu mức phạt' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Tên mức phạt đã tồn tại');
  expect(name).toHaveValue('Duplicate rule');
  expect(points).toHaveValue('5');
});

it('clears appointment conflict state when reloading candidates', async () => {
  const user = userEvent.setup();
  request.mockImplementation(async (path, init) => {
    if (path.startsWith('/admin/senior/moderators?')) return page([]) as never;
    if (path.startsWith('/admin/senior/audit?')) return page([]) as never;
    if (path.startsWith('/admin/senior/moderator-candidates?')) return page([{
      userId: 'candidate', name: 'Candidate User', studentId: 'S-1', email: 'candidate@example.test',
      accountStatus: 'HOAT_DONG', isModerator: false, emailVerified: true, profileApproved: true,
    }]) as never;
    if (init?.method === 'POST') throw new ApiError(409, 'Ứng viên đã thay đổi');
    return undefined as never;
  });
  render(<ModeratorsPage />);
  await user.click(await screen.findByRole('button', { name: 'Thêm kiểm duyệt viên' }));
  await user.click(await screen.findByRole('button', { name: 'Chọn Candidate User' }));
  await user.click(screen.getByRole('button', { name: 'Xác nhận bổ nhiệm' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ứng viên đã thay đổi');
  await user.click(screen.getByRole('button', { name: 'Tải lại ứng viên' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Chọn Candidate User' })).toBeInTheDocument();
});

it('clears the previous success notice when opening edit and deactivate dialogs', async () => {
  const user = userEvent.setup();
  render(<PenaltiesPage />);

  async function createPenalty(nameValue: string) {
    await user.click(screen.getByRole('button', { name: 'Thêm mức phạt' }));
    await user.type(screen.getByLabelText(/Tên mức phạt/), nameValue);
    await user.type(screen.getByLabelText(/Số điểm trừ/), '3');
    await user.click(screen.getByRole('button', { name: 'Lưu mức phạt' }));
    expect(await screen.findByText(`Đã thêm mức phạt “${nameValue}”.`)).toBeInTheDocument();
  }

  await screen.findByText('Active rule');
  await createPenalty('Created rule');
  const activeRow = screen.getByText('Active rule').closest('tr');
  expect(activeRow).not.toBeNull();
  await user.click(within(activeRow!).getByRole('button', { name: 'Sửa Active rule' }));
  expect(screen.queryByText('Đã thêm mức phạt “Created rule”.')).not.toBeInTheDocument();
  const editor = screen.getByRole('dialog');
  expect(within(editor).getByRole('heading', { name: 'Sửa mức phạt' })).toBeInTheDocument();
  await user.click(within(editor).getByRole('button', { name: 'Hủy' }));

  await createPenalty('Created another rule');
  const currentActiveRow = screen.getByText('Active rule').closest('tr');
  expect(currentActiveRow).not.toBeNull();
  await user.click(within(currentActiveRow!).getByRole('button', { name: 'Ngừng sử dụng Active rule' }));
  expect(screen.queryByText('Đã thêm mức phạt “Created another rule”.')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Ngừng sử dụng mức phạt' })).toBeInTheDocument();
});
it('cancels penalty deactivation without making a request', async () => {
  const user = userEvent.setup();
  render(<PenaltiesPage />);
  const row = (await screen.findByText('Active rule')).closest('tr');
  expect(row).not.toBeNull();
  await user.click(within(row!).getByRole('button', { name: 'Ngừng sử dụng Active rule' }));
  expect(await screen.findByRole('heading', { name: 'Ngừng sử dụng mức phạt' })).toBeInTheDocument();
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }));
  expect(screen.queryByRole('heading', { name: 'Ngừng sử dụng mức phạt' })).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalledWith('/admin/senior/penalties/active/deactivate', expect.anything());
});
