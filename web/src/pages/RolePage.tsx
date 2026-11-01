import { useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';
import type { Role } from '../auth/session';

const endpoints: Record<string, string> = {
  overview: '/dashboard', users: '/users', transactions: '/transactions', categories: '/categories',
  listings: '/listings', 'my-listings': '/listings/mine', reports: '/reports',
};

export default function RolePage({ permission, role }: { permission: string; role: Role }) {
  const [data, setData] = useState<unknown>();
  const [error, setError] = useState('');
  const endpoint = permission === 'overview' ? `${endpoints.overview}/${role}` : endpoints[permission];

  useEffect(() => {
    let active = true;
    void api<unknown>(endpoint).then((result) => { if (active) setData(result); })
      .catch((cause: Error) => {
        if (active) setError(cause instanceof ApiError && cause.status === 404 ? 'API endpoint chưa được triển khai.' : cause.message);
      });
    return () => { active = false; };
  }, [endpoint]);

  return <section className="page-content"><h1>{permission.replace('-', ' ')}</h1>
    {error ? <p className="error" role="alert">{error}</p> : data === undefined ? <p role="status">Đang tải…</p> : <pre className="data-view">{JSON.stringify(data, null, 2)}</pre>}
  </section>;
}
