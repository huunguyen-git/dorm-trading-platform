import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './api/client';

vi.mock('./api/client', () => ({
  api: vi.fn(), setAccessToken: vi.fn(),
  ApiError: class ApiError extends Error { status = 404; },
}));

const request = vi.mocked(api);
const moderator = { id: '1', name: 'Test user', role: 'moderator' as const };
afterEach(cleanup);

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path) => {
    if (path === '/auth/me') return moderator as never;
    return { listings: [] } as never;
  });
});

describe('role-based session', () => {
  it('opens account actions after changing password and signing in again', async () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Đổi mật khẩu' }));
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), { target: { value: 'old password' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu mới (8–128 ký tự)'), { target: { value: 'River!82' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), { target: { value: 'River!82' } });
    request.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu' }));
    await screen.findByTestId('login-submit');
    expect(screen.getByText('Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.')).toBeInTheDocument();
    request.mockRejectedValueOnce(new Error('Sai mật khẩu.'));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@student.edu.vn' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Sai mật khẩu.')).toBeInTheDocument();
    expect(screen.queryByText('Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.')).not.toBeInTheDocument();
    request.mockResolvedValueOnce({ token: 'new-token', user: moderator } as never);
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'River!82' } });
    fireEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByRole('button', { name: 'Đăng xuất phiên này' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Mật khẩu hiện tại')).not.toBeInTheDocument();
  });
  it('denies administrative routes and password change for a restricted account', async () => {
    request.mockResolvedValueOnce({ id: '1', name: 'Locked', role: 'member', roles: [], accountStatus: 'BI_KHOA' } as never);
    render(<MemoryRouter initialEntries={['/reports']}><App /></MemoryRouter>);
    expect(await screen.findByText('Tài khoản đang bị khóa. Không có quyền truy cập quản trị.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith('/reports');
    expect(screen.queryByRole('button', { name: 'Đổi mật khẩu' })).not.toBeInTheDocument();
  });
  it('hydrates role from API and denies routes outside role', async () => {
    request.mockResolvedValueOnce({ id: '1', name: 'Test user', role: 'member' } as never);
    render(<MemoryRouter initialEntries={['/reports']}><App /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Tài khoản không có quyền quản trị.')).toBeInTheDocument());
    expect(request).not.toHaveBeenCalledWith('/reports');
  });

  it('loads authorized page data through API', async () => {
    render(<MemoryRouter initialEntries={['/listings']}><App /></MemoryRouter>);
    await waitFor(() => expect(request).toHaveBeenCalledWith('/listings'));
    expect(screen.getByText('listings')).toBeInTheDocument();
  });

  it('allows admins on governance routes and keeps moderator routes restricted', async () => {
    request.mockImplementation(async (path) => {
      if (path === '/auth/me') return { ...moderator, role: 'admin' } as never;
      if (path.startsWith('/admin/senior/moderators?') || path.startsWith('/admin/senior/penalties?') || path.startsWith('/admin/senior/audit?'))
        return { items: [], page: 0, size: 20, total: 0 } as never;
      return {} as never;
    });
    const moderators = render(<MemoryRouter initialEntries={['/moderators']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Quản lý kiểm duyệt viên' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(expect.stringMatching('/admin/senior/moderators'), expect.anything());
    moderators.unmount();

    request.mockReset();
    request.mockImplementation(async (path) => {
      if (path === '/auth/me') return { ...moderator, role: 'admin' } as never;
      if (path.startsWith('/admin/senior/penalties?') || path.startsWith('/admin/senior/audit?'))
        return { items: [], page: 0, size: 20, total: 0 } as never;
      return {} as never;
    });
    const penalties = render(<MemoryRouter initialEntries={['/penalties']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Quản lý thang phạt' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(expect.stringMatching('/admin/senior/penalties'), expect.anything());
    penalties.unmount();

    request.mockReset();
    request.mockImplementation(async (path) => {
      if (path === '/auth/me') return moderator as never;
      return {} as never;
    });
    const moderatorRoute = render(<MemoryRouter initialEntries={['/moderators']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Tài khoản & bảo mật' })).toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith(expect.stringMatching('/admin/senior/moderators'), expect.anything());
    moderatorRoute.unmount();

    request.mockReset();
    request.mockResolvedValue({ ...moderator } as never);
    render(<MemoryRouter initialEntries={['/penalties']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Tài khoản & bảo mật' })).toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith(expect.stringMatching('/admin/senior/penalties'), expect.anything());
  });
});

describe('senior admin governance routes', () => {
  it('renders the report queue for an admin visiting /reports', async () => {
    request.mockImplementation(async (path) => {
      if (path === '/auth/me') return { ...moderator, role: 'admin' } as never;
      if (path.startsWith('/admin/reports/groups?')) return { items: [], page: 0, size: 20, total: 0 } as never;
      return {} as never;
    });
    render(<MemoryRouter initialEntries={['/reports']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Kiểm duyệt báo cáo' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/admin/reports/groups'), expect.anything());
  });
});
