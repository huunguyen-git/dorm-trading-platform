import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from './App';
import { api } from './src/api/client';
import { useSession, type User } from './src/auth/session';
import { useListings } from './src/listings/store';

jest.mock('./src/api/client', () => ({ api: jest.fn(async () => []) }));

beforeEach(() => {
  useSession.setState({
    token: null, user: null, loading: false,
    restore: jest.fn<() => Promise<void>>(async () => {}),
    logout: jest.fn<() => Promise<void>>(async () => {}),
    setSession: jest.fn<(token: string, user: User) => Promise<void>>(async () => {}),
  });
  useListings.setState({
    listings: [], loading: false,
    load: jest.fn<() => Promise<void>>(async () => {}),
    create: jest.fn(async () => {}),
  });
});

test('shows empty listing state', async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByText('Chưa có tin đăng.')).toBeTruthy());
});

test('pending account can browse and open profile but cannot publish', async () => {
  useSession.setState({ token: 'pending', user: { id: '1', name: 'Pending', role: 'member', email: 'pending@uni.edu.vn', studentId: 'pending', roles: [], emailVerified: true, profileApproved: false, accountStatus: 'CHO_KICH_HOAT' }, loading: false });
  render(<App />);
  expect(await screen.findByText('Chưa có tin đăng.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Đăng tin' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Hồ sơ' }));
  expect(await screen.findByText('Bạn có thể sửa hồ sơ và xem mặt hàng. Cần xác minh email và duyệt hồ sơ trước khi giao dịch.')).toBeTruthy();
});

test('requires title, description and positive price before creating listing', async () => {
  useSession.setState({ token: 'token', user: { id: '1', name: 'Test', role: 'member', email: 'test@uni.edu.vn', studentId: 'test', roles: ['MEMBER'], emailVerified: true, profileApproved: true, accountStatus: 'HOAT_DONG' }, loading: false });
  render(<App />);
  fireEvent.press(screen.getByRole('button', { name: 'Đăng tin' }));
  await waitFor(() => expect(screen.getByPlaceholderText('Tiêu đề')).toBeTruthy());
  fireEvent.press(screen.getAllByRole('button', { name: 'Đăng tin' }).at(-1)!);
  expect(await screen.findByText('Nhập tiêu đề, mô tả và giá hợp lệ.')).toBeTruthy();
});

test('signup blocks mismatched passwords then verifies OTP with an explicit success screen', async () => {
  const mockedApi = jest.mocked(api);
  mockedApi.mockReset();
  mockedApi.mockResolvedValueOnce({ challengeId: 'signup-test', expiresIn: 300, resendAfter: 60, message: 'Đã gửi mã.' });
  render(<App />);
  fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Đăng ký' }));
  fireEvent.changeText(await screen.findByLabelText('Email'), 'an@truong.edu.vn');
  fireEvent.changeText(screen.getByLabelText('Họ tên'), 'Nguyễn An');
  fireEvent.changeText(screen.getByLabelText('MSSV'), '123456');
  fireEvent.changeText(screen.getByLabelText('Mật khẩu mới'), 'Cau mat khau rieng 123!');
  fireEvent.changeText(screen.getByLabelText('Xác nhận mật khẩu mới'), 'khong khop');
  fireEvent.press(screen.getByTestId('auth-submit'));
  expect(await screen.findByText('Mật khẩu xác nhận chưa khớp.')).toBeTruthy();
  expect(mockedApi).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Xác nhận mật khẩu mới'), 'Cau mat khau rieng 123!');
  fireEvent.press(screen.getByTestId('auth-submit'));
  expect(await screen.findByTestId('auth-otp')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Gửi lại sau 60s' }).props.accessibilityState.disabled).toBe(true);
  mockedApi.mockRejectedValueOnce(new Error('Mã không hợp lệ.'));
  fireEvent.changeText(screen.getByTestId('auth-otp'), '111111');
  fireEvent.press(screen.getByTestId('auth-submit'));
  expect(await screen.findByText('Mã không hợp lệ.')).toBeTruthy();
  mockedApi.mockResolvedValueOnce({ resetToken: null });
  fireEvent.changeText(screen.getByTestId('auth-otp'), '123456');
  fireEvent.press(screen.getByTestId('auth-submit'));
  expect(await screen.findByText('Hoàn tất')).toBeTruthy();
  fireEvent.press(screen.getByTestId('auth-success-continue'));
  expect(await screen.findByTestId('login-submit')).toBeTruthy();
});
