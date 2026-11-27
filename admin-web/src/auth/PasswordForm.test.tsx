import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PasswordForm from './PasswordForm';
import { api } from '../api/client';
vi.mock('../api/client', () => ({ api: vi.fn(), setAccessToken: vi.fn() }));
afterEach(cleanup);
it('requires OTP grant before submitting a password reset', async () => {
  vi.mocked(api).mockResolvedValueOnce({ challengeId: 'challenge', resendAfter: 60, expiresIn: 300, message: 'Check email' })
    .mockResolvedValueOnce({ resetToken: 'one-use-grant' }).mockResolvedValueOnce(undefined);
  render(<PasswordForm onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@uni.edu.vn' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã' }));
  const code = await screen.findByLabelText('Mã xác minh (hiệu lực 5 phút)');
  fireEvent.change(code, { target: { value: '123456' } }); fireEvent.click(screen.getByRole('button', { name: 'Xác minh' }));
  fireEvent.change(await screen.findByLabelText('Mật khẩu mới (8–128 ký tự)'), { target: { value: 'River!8' } });
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), { target: { value: 'River!8' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu' }));
  expect(await screen.findByText('Mật khẩu mới cần từ 8 đến 128 ký tự.')).toBeInTheDocument();
  expect(api).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText('Mật khẩu mới (8–128 ký tự)'), { target: { value: 'River!82' } });
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), { target: { value: 'River!82' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu' }));
  await waitFor(() => expect(api).toHaveBeenLastCalledWith('/auth/password/reset', expect.objectContaining({ body: JSON.stringify({ resetToken: 'one-use-grant', password: 'River!82' }) })));
  expect(await screen.findByText('Đã đặt lại mật khẩu. Hãy quay lại đăng nhập.')).toBeInTheDocument();
});

it('shows login action on password change completion panel', async () => {
  vi.mocked(api).mockResolvedValueOnce(undefined);
  render(<PasswordForm change onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), { target: { value: 'old password' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu mới (8–128 ký tự)'), { target: { value: 'River!82' } });
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), { target: { value: 'River!82' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu' }));
  expect(await screen.findByText('Đã đổi mật khẩu. Hãy đăng nhập lại.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Về đăng nhập' })).toBeInTheDocument();
});
