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
    request.mockResolvedValueOnce({ token: 'new-token', user: moderator } as never);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@student.edu.vn' } });
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
});
