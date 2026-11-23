import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type * as ApiClient from '../api/client';
import { api } from '../api/client';
import { AuditHistory } from './shared';

vi.mock('../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof ApiClient>(),
  api: vi.fn(),
}));

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
