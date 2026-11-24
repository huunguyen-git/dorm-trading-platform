import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from './App';
import { api, RestrictedAccountError } from './src/api/client';
import { resolveUserRestriction, useSession, type AccountRestriction, type User } from './src/auth/session';
import { useListings } from './src/listings/store';

jest.mock('./src/api/client', () => {
  const actual = jest.requireActual<typeof import('./src/api/client')>('./src/api/client');
  return {
    ...actual,
    api: jest.fn(async () => []),
  };
});

beforeEach(() => {
  useSession.setState({
    token: null,
    user: null,
    loading: false,
    restriction: null,
    restrictionDismissed: false,
    clearRestriction: () => useSession.setState({ restriction: null, restrictionDismissed: true }),
    restore: jest.fn<() => Promise<void>>(async () => {}),
    logout: jest.fn<() => Promise<void>>(async () => {
      useSession.setState({
        token: null,
        user: null,
        loading: false,
        restriction: null,
        restrictionDismissed: false,
      });
    }),
    setSession: jest.fn<(token: string, user: User, refreshToken?: string) => Promise<void>>(async (token, user) => {
      useSession.setState({
        token,
        user,
        loading: false,
        restriction: resolveUserRestriction(user),
        restrictionDismissed: false,
      });
    }),
  });
  useListings.setState({
    listings: [],
    loading: false,
    load: jest.fn<() => Promise<void>>(async () => {}),
    create: jest.fn(async () => {}),
  });
});

test('shows empty listing state', async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByText('Chưa có tin đăng.')).toBeTruthy());
});

test('pending account can browse and open profile but cannot publish', async () => {
  useSession.setState({
    token: 'pending',
    user: {
      id: '1',
      name: 'Pending',
      role: 'member',
      email: 'pending@uni.edu.vn',
      studentId: 'pending',
      roles: [],
      emailVerified: true,
      profileApproved: false,
      accountStatus: 'CHO_KICH_HOAT',
    },
    loading: false,
  });
  render(<App />);
  expect(await screen.findByText('Chưa có tin đăng.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Đăng tin' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Hồ sơ' }));
  expect(
    await screen.findByText('Bạn có thể sửa hồ sơ và xem mặt hàng. Cần xác minh email và duyệt hồ sơ trước khi giao dịch.'),
  ).toBeTruthy();
});

test('requires inventory item, title, description, price and photo before publishing listing', async () => {
  useSession.setState({
    token: 'token',
    user: {
      id: '1',
      name: 'Test',
      role: 'member',
      email: 'test@uni.edu.vn',
      studentId: 'test',
      roles: ['MEMBER'],
      emailVerified: true,
      profileApproved: true,
      accountStatus: 'HOAT_DONG',
    },
    loading: false,
  });
  render(<App />);
  fireEvent.press(screen.getByRole('button', { name: 'Đăng tin' }));
  await waitFor(() => expect(screen.getByTestId('listing-title-input')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('inventory-picker-empty')).toBeTruthy());
  fireEvent.press(screen.getByTestId('submit-publish-listing'));
  expect(
    await screen.findByText('Vui lòng chọn ít nhất 1 đồ vật khả dụng từ Kho đồ cá nhân.'),
  ).toBeTruthy();
  expect(screen.getByText('Vui lòng nhập tiêu đề tin đăng.')).toBeTruthy();
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

test('locked BI_KHOA account can sign in with limited permissions on listings and profile (UC-03 3.2)', async () => {
  const mockedApi = jest.mocked(api);
  mockedApi.mockReset();
  mockedApi.mockResolvedValueOnce({
    token: 'locked-mobile-token',
    refreshToken: 'locked-mobile-refresh',
    user: {
      id: 'u-locked',
      name: 'Trần B',
      email: 'locked@truong.edu.vn',
      studentId: '22120999',
      role: 'member',
      roles: [],
      emailVerified: true,
      profileApproved: true,
      accountStatus: 'BI_KHOA',
      restriction: {
        accountStatus: 'BI_KHOA',
        lockType: 'KHOA_VINH_VIEN',
        reason: 'Điểm uy tín giảm xuống ngưỡng 30',
        lockedUntil: null,
        appealable: true,
        reputationScore: 30,
        message: 'Tài khoản bị khóa vĩnh viễn.',
      },
    },
  });

  render(<App />);
  fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
  fireEvent.changeText(await screen.findByTestId('login-email'), 'locked@truong.edu.vn');
  fireEvent.changeText(screen.getByTestId('login-password'), 'Cau mat khau rieng 123!');
  fireEvent.press(screen.getByTestId('login-submit'));

  // ListingsScreen: shows restriction notice + FR-12 appeal guidance, disables publish, hides pending approval notice
  expect(await screen.findByTestId('restricted-account-notice')).toBeTruthy();
  expect(screen.getByText('Tài khoản bị khóa vĩnh viễn')).toBeTruthy();
  expect(screen.getByText('Lý do: Điểm uy tín giảm xuống ngưỡng 30')).toBeTruthy();
  expect(screen.getByText('Điểm uy tín: 30')).toBeTruthy();
  expect(
    screen.getByText('Bạn có quyền gửi khiếu nại kèm bằng chứng tới Kiểm duyệt viên để được xem xét lại.'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Đăng tin' }).props.accessibilityState.disabled).toBe(true);
  expect(
    screen.queryByText('Tài khoản đang chờ hoàn tất xác minh hoặc duyệt hồ sơ. Bạn vẫn có thể xem các mặt hàng công khai.'),
  ).toBeNull();

  // Navigate to ProfileScreen: shows restriction notice, hides pending notice, disables edit/change-password, keeps refresh/logout enabled
  fireEvent.press(screen.getByRole('button', { name: 'Hồ sơ' }));
  expect(await screen.findByText('Hồ sơ của bạn')).toBeTruthy();
  expect(
    screen.queryByText('Bạn có thể sửa hồ sơ và xem mặt hàng. Cần xác minh email và duyệt hồ sơ trước khi giao dịch.'),
  ).toBeNull();
  expect(screen.getByRole('button', { name: 'Lưu họ tên' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Đổi mật khẩu' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Cập nhật trạng thái hồ sơ' }).props.accessibilityState.disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Đăng xuất thiết bị này' }).props.accessibilityState.disabled).toBe(false);
});

test('renders temporary lock details on 403 ACCOUNT_RESTRICTED login without duplicate error notice and dismisses', async () => {
  const mockedApi = jest.mocked(api);
  mockedApi.mockReset();
  const tempRestriction: AccountRestriction = {
    accountStatus: 'BI_KHOA',
    lockType: 'KHOA_TAM_THOI',
    reason: 'Vi phạm quy định giao dịch',
    lockedUntil: '2026-12-02T10:00:00Z',
    appealable: false,
    reputationScore: 45,
    message: 'Tài khoản của bạn đang tạm khóa trong 14 ngày.',
  };
  mockedApi.mockImplementationOnce(async () => {
    useSession.setState({
      token: null,
      user: null,
      loading: false,
      restriction: tempRestriction,
      restrictionDismissed: false,
    });
    throw new RestrictedAccountError(tempRestriction.message, tempRestriction);
  });

  render(<App />);
  fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
  fireEvent.changeText(await screen.findByTestId('login-email'), 'locked@truong.edu.vn');
  fireEvent.changeText(screen.getByTestId('login-password'), 'Cau mat khau rieng 123!');
  fireEvent.press(screen.getByTestId('login-submit'));

  expect(await screen.findByTestId('restricted-account-notice')).toBeTruthy();
  expect(screen.getByText('Tài khoản đang bị khóa tạm thời')).toBeTruthy();
  expect(screen.getByText('Lý do: Vi phạm quy định giao dịch')).toBeTruthy();
  expect(screen.getByText(/Mở khóa sau:/)).toBeTruthy();
  expect(screen.getByText('Điểm uy tín: 45')).toBeTruthy();
  expect(
    screen.queryByText('Bạn có quyền gửi khiếu nại kèm bằng chứng tới Kiểm duyệt viên để được xem xét lại.'),
  ).toBeNull();
  expect(screen.getAllByText('Tài khoản của bạn đang tạm khóa trong 14 ngày.')).toHaveLength(1);

  fireEvent.press(screen.getByTestId('dismiss-restriction'));
  await waitFor(() => expect(screen.queryByTestId('restricted-account-notice')).toBeNull());
});

test('clears stale restriction when submitting a new login attempt for another account', async () => {
  const mockedApi = jest.mocked(api);
  mockedApi.mockReset();
  useSession.setState({
    token: null,
    user: null,
    loading: false,
    restriction: {
      accountStatus: 'VO_HIEU_HOA',
      lockType: null,
      reason: null,
      lockedUntil: null,
      appealable: false,
      reputationScore: null,
      message: 'Tài khoản này đang bị hạn chế truy cập.',
    },
    restrictionDismissed: false,
  });
  mockedApi.mockRejectedValueOnce(new Error('Sai email hoặc mật khẩu.'));

  render(<App />);
  expect(await screen.findByText('Tài khoản đang bị hạn chế')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
  expect(await screen.findByTestId('restricted-account-notice')).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('login-email'), 'other@truong.edu.vn');
  fireEvent.changeText(screen.getByTestId('login-password'), 'Cau mat khau rieng 123!');
  fireEvent.press(screen.getByTestId('login-submit'));

  expect(await screen.findByText('Sai email hoặc mật khẩu.')).toBeTruthy();
  expect(screen.queryByTestId('restricted-account-notice')).toBeNull();
});
