// Opt-in: EXPO_PUBLIC_API_URL and P1_MAILDEV_URL must point to isolated test services.
// Run with: npx jest --runInBand --testMatch '**/e2e/auth.live.tsx'
import React from 'react';
import { test, expect, jest } from '@jest/globals';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import http from 'node:http';
import App from '../App';
configure({ asyncUtilTimeout: 10000 });

jest.mock('../src/auth/tokenStore', () => {
  let token: string | null = null; let refresh: string | null = null;
  return { tokenStore: {
    get: async () => token, save: async (v: string) => { token = v; },
    getRefresh: async () => refresh, saveRefresh: async (v: string) => { refresh = v; },
    clear: async () => { token = null; refresh = null; },
  } };
});

function network(url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: init.method ?? 'GET', headers: init.headers as Record<string,string> }, (response) => {
      let body = ''; response.setEncoding('utf8'); response.on('data', (part) => { body += part; });
      response.on('end', () => resolve({ status: response.statusCode!, ok: response.statusCode! < 400,
        headers: { get: (name: string) => response.headers[name.toLowerCase()] ?? null },
        text: async () => body, json: async () => JSON.parse(body),
      } as unknown as Response));
    });
    request.on('error', reject); if (init.body) request.write(init.body); request.end();
  });
}

test('mobile registration → real SMTP OTP → login → pending profile → logout', async () => {
  if (!process.env.EXPO_PUBLIC_API_URL || !process.env.P1_MAILDEV_URL) throw new Error('Set isolated API and Maildev URLs before running this test.');
  global.fetch = network as typeof fetch;
  const email = `mobile${Date.now()}@student.edu.vn`;
  render(<App />);
  fireEvent.press(await screen.findByRole('button', { name: 'Đăng nhập' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Đăng ký' }));
  fireEvent.changeText(await screen.findByLabelText('Email'), email);
  fireEvent.changeText(screen.getByLabelText('Họ tên'), 'Mobile Integration');
  fireEvent.changeText(screen.getByLabelText('MSSV'), `M${Date.now()}`);
  fireEvent.changeText(screen.getByLabelText('Mật khẩu mới'), 'violet island brass telescope 7629');
  fireEvent.changeText(screen.getByLabelText('Xác nhận mật khẩu mới'), 'violet island brass telescope 7629');
  fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByLabelText('Mã OTP', {}, { timeout: 15000 });
  let message: { id: string } | undefined;
  await waitFor(async () => {
    const messages = await (await network(`${process.env.P1_MAILDEV_URL}/email`)).json();
    message = messages.find((m: { to: { address: string }[] }) => m.to.some((t) => t.address === email));
    expect(message).toBeTruthy();
  }, { timeout: 15000 });
  expect(message).toBeTruthy();
  const detail = await (await network(`${process.env.P1_MAILDEV_URL}/email/${message!.id}`)).json();
  fireEvent.changeText(screen.getByLabelText('Mã OTP'), detail.text.match(/\b\d{6}\b/)[0]);
  fireEvent.press(screen.getByRole('button', { name: 'Xác minh' }));
  fireEvent.press(await screen.findByTestId('auth-success-continue'));
  const loginPassword = await screen.findByLabelText('Mật khẩu');
  fireEvent.changeText(screen.getByLabelText('Email'), email);
  fireEvent.changeText(loginPassword, 'violet island brass telescope 7629');
  fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Đăng tin' }).props.accessibilityState.disabled).toBe(true), { timeout: 10000 });
  fireEvent.press(screen.getByRole('button', { name: 'Hồ sơ' }));
  expect(await screen.findByText(email)).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Họ tên'), 'Mobile Updated');
  fireEvent.press(screen.getByRole('button', { name: 'Lưu họ tên' }));
  expect(await screen.findByText('Đã lưu hồ sơ.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất thiết bị này' }));
  expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeTruthy();
}, 60000);
