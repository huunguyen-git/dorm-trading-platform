import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PasswordForm from './PasswordForm';
import { api } from '../api/client';
vi.mock('../api/client', () => ({ api: vi.fn(), setAccessToken: vi.fn() }));
it('requires OTP grant before submitting a password reset', async () => {
  vi.mocked(api).mockResolvedValueOnce({ challengeId: 'challenge', resendAfter: 60, expiresIn: 300, message: 'Check email' })
    .mockResolvedValueOnce({ resetToken: 'one-use-grant' }).mockResolvedValueOnce(undefined);
  render(<PasswordForm onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@uni.edu.vn' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã' }));
  const code = await screen.findByLabelText('Mã xác minh (hiệu lực 5 phút)');
  fireEvent.change(code, { target: { value: '123456' } }); fireEvent.click(screen.getByRole('button', { name: 'Xác minh' }));
  fireEvent.change(await screen.findByLabelText('Mật khẩu mới (15–128 ký tự)'), { target: { value: 'a quiet river beneath stars' } });
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), { target: { value: 'a quiet river beneath stars' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu' }));
  await waitFor(() => expect(api).toHaveBeenLastCalledWith('/auth/password/reset', expect.objectContaining({ body: JSON.stringify({ resetToken: 'one-use-grant', password: 'a quiet river beneath stars' }) })));
  expect(await screen.findByText('Đã đặt lại mật khẩu. Hãy quay lại đăng nhập.')).toBeInTheDocument();
});
