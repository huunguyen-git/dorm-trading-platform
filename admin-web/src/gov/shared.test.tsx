import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type * as ApiClient from '../api/client';
import { api } from '../api/client';
import { AuditHistory, Pagination } from './shared';

vi.mock('../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof ApiClient>(),
  api: vi.fn(),
}));
afterEach(() => cleanup());

it('renders arbitrary recorded penalty text verbatim while translating its status', async () => {
  vi.mocked(api).mockResolvedValue({
    items: [{
      id: 'audit-1', actorId: 'admin-1', actorName: 'Người quản trị',
      action: 'CREATE_PENALTY', resourceType: 'PENALTY', resourceId: 'penalty-1',
      before: null,
      after: { name: '__proto__', description: 'DANG_DUNG', status: 'DANG_DUNG', points: 2 },
      happenedAt: '2026-11-19T10:00:00Z',
    }],
    page: 0, size: 20, total: 1,
  });
  const user = userEvent.setup();
  render(<AuditHistory resourceType="PENALTY" revision={0} />);
  await user.click(await screen.findByText('Xem giá trị trước / sau'));
  expect(screen.getByText('__proto__')).toBeVisible();
  expect(screen.getByText('DANG_DUNG')).toBeVisible();
  expect(screen.getByText('Đang sử dụng')).toBeVisible();
});
it('resets audit pagination when the page revision changes', async () => {
  vi.mocked(api).mockImplementation(async (path) => ({
    items: [{
      id: 'audit-1', actorId: 'admin-1', actorName: 'Người quản trị',
      action: 'CREATE_PENALTY', resourceType: 'PENALTY', resourceId: 'penalty-1',
      before: null, after: null, happenedAt: '2026-11-19T10:00:00Z',
    }],
    page: Number(new URLSearchParams(path.split('?')[1]).get('page')),
    size: 20, total: 50,
  }));
  const user = userEvent.setup();
  const view = render(<AuditHistory resourceType="PENALTY" revision={0} />);
  await screen.findByText('Người thực hiện:');
  await user.click(within(screen.getByRole('navigation', { name: 'Phân trang lịch sử' })).getByRole('button', { name: 'Sau' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(expect.stringContaining('page=1'), expect.anything()));
  view.rerender(<AuditHistory resourceType="PENALTY" revision={1} />);
  await waitFor(() => expect(api).toHaveBeenLastCalledWith(expect.stringContaining('page=0'), expect.anything()));
});

it('does not show a loading pagination message after a failed request', () => {
  render(<Pagination page={0} loading={false} onPage={() => {}} label="Phân trang lỗi" />);
  expect(screen.getByRole('navigation', { name: 'Phân trang lỗi' })).toHaveTextContent('Không có dữ liệu phân trang.');
  expect(screen.queryByText('Đang tải phân trang…')).not.toBeInTheDocument();
});
