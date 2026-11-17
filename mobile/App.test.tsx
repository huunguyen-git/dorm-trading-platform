import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from './App';
import { api } from './src/api/client';
import { useSession, type User } from './src/auth/session';
import { useListings } from './src/listings/store';

jest.mock('./src/api/client', () => ({ api: jest.fn(async () => []), apiUrl: (path: string) => path, upload: jest.fn(async () => undefined) }));

const profile = {
  id: '1', name: 'Pending', studentId: 'pending', email: 'pending@uni.edu.vn', phone: null,
  school: null, campus: null, major: null, cohort: null, studyStatus: null, reputation: 100,
  emailVerified: true, profileApproved: false, profileStatus: 'CHO_DUYET' as const, rejectReason: null,
  pendingUpdate: false, hasStudentCard: false, accountStatus: 'CHO_KICH_HOAT',
};

function routes(handlers: Record<string, unknown>) {
  jest.mocked(api).mockImplementation(((path: string) =>
    Promise.resolve(path in handlers ? handlers[path] : [])) as never);
}

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
  routes({ '/profile/me': profile });
  useSession.setState({ token: 'pending', user: { id: '1', name: 'Pending', role: 'member', email: 'pending@uni.edu.vn', studentId: 'pending', roles: [], emailVerified: true, profileApproved: false, accountStatus: 'CHO_KICH_HOAT' }, loading: false });
  render(<App />);
  expect(await screen.findByText('Chưa có tin đăng.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Đăng tin' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Hồ sơ' }));
  expect(await screen.findByText('Bạn vẫn xem được mặt hàng và sửa hồ sơ. Cần được duyệt trước khi giao dịch.')).toBeTruthy();
  expect(screen.getByText('Hồ sơ chờ duyệt')).toBeTruthy();
});

test('saving profile identity moves it to pending review', async () => {
  routes({ '/profile/me': { ...profile, profileStatus: 'DA_DUYET', profileApproved: true, accountStatus: 'HOAT_DONG' } });
  useSession.setState({ token: 'token', user: { id: '1', name: 'Pending', role: 'member', email: 'pending@uni.edu.vn', studentId: 'pending', roles: ['MEMBER'], emailVerified: true, profileApproved: true, accountStatus: 'HOAT_DONG' }, loading: false });
  render(<App />);
  fireEvent.press(screen.getByRole('button', { name: 'Hồ sơ' }));
  fireEvent.press(await screen.findByTestId('profile-edit'));
  routes({ '/profile/me': profile });
  fireEvent.press(screen.getByTestId('profile-save'));
  expect(await screen.findByText('Đã lưu. Thông tin định danh đang chờ kiểm duyệt.')).toBeTruthy();
  expect(screen.getByText('Hồ sơ chờ duyệt')).toBeTruthy();
});

test('changes email after verifying the OTP and reports a wrong code', async () => {
  routes({ '/profile/me': { ...profile, profileApproved: true, profileStatus: 'DA_DUYET', accountStatus: 'HOAT_DONG' } });
  useSession.setState({ token: 'token', user: { id: '1', name: 'Pending', role: 'member', email: 'pending@uni.edu.vn', studentId: 'pending', roles: ['MEMBER'], emailVerified: true, profileApproved: true, accountStatus: 'HOAT_DONG' }, loading: false });
  render(<App />);
  fireEvent.press(screen.getByRole('button', { name: 'Hồ sơ' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Cài đặt tài khoản' }));
  fireEvent.changeText(await screen.findByTestId('settings-password'), 'mat khau hien tai');
  fireEvent.changeText(screen.getByTestId('settings-email'), 'moi@uni.edu.vn');
  jest.mocked(api).mockResolvedValueOnce({ challengeId: 'c1', expiresIn: 300, resendAfter: 60, message: 'Đã gửi mã tới email mới.' });
  fireEvent.press(screen.getByTestId('settings-request'));
  expect(await screen.findByText('Đã gửi mã tới email mới.')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('settings-otp'), '111111');
  jest.mocked(api).mockRejectedValueOnce(new Error('Mã xác minh không đúng.'));
  fireEvent.press(screen.getByTestId('settings-verify'));
  expect(await screen.findByText('Mã xác minh không đúng.')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('settings-otp'), '123456');
  jest.mocked(api).mockResolvedValueOnce(undefined);
  fireEvent.press(screen.getByTestId('settings-verify'));
  expect(await screen.findByText('Đã đổi email. Lần đăng nhập sau dùng email mới.')).toBeTruthy();
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
