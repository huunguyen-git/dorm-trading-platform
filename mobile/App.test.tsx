import React from 'react';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from './App';
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

test('requires title, description and positive price before creating listing', async () => {
  useSession.setState({ token: 'token', user: { id: '1', name: 'Test', role: 'seller' }, loading: false });
  render(<App />);
  fireEvent.press(screen.getByRole('button', { name: 'Đăng tin' }));
  await waitFor(() => expect(screen.getByPlaceholderText('Tiêu đề')).toBeTruthy());
  fireEvent.press(screen.getAllByRole('button', { name: 'Đăng tin' }).at(-1)!);
  expect(await screen.findByText('Nhập tiêu đề, mô tả và giá hợp lệ.')).toBeTruthy();
});
