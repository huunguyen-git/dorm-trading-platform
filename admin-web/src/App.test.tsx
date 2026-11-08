import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './api/client';

vi.mock('./api/client', () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error { status = 404; },
}));

const request = vi.mocked(api);
const moderator = { id: '1', name: 'Test user', role: 'moderator' as const };

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path) => {
    if (path === '/auth/me') return moderator as never;
    return { listings: [] } as never;
  });
});

describe('role-based session', () => {
  it('hydrates role from API and denies routes outside role', async () => {
    request.mockResolvedValueOnce({ id: '1', name: 'Test user', role: 'seller' } as never);
    render(<MemoryRouter initialEntries={['/reports']}><App /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Tổng quan')).toBeInTheDocument());
    expect(request).not.toHaveBeenCalledWith('/reports');
  });

  it('loads authorized page data through API', async () => {
    render(<MemoryRouter initialEntries={['/listings']}><App /></MemoryRouter>);
    await waitFor(() => expect(request).toHaveBeenCalledWith('/listings'));
    expect(screen.getByText('listings')).toBeInTheDocument();
  });
});
