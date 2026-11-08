# admin-web

Web quản trị của Nhóm 14 (React 18 + Vite 6 + React Router 6).

## Chạy

```bash
npm ci
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
npm run dev            # http://localhost:5173
```

`VITE_API_URL` phải là gốc API của backend, ví dụ `http://localhost:8082/api/v1`.

## Kiểm tra

```bash
npm run lint     # tsc --noEmit
npm test         # vitest run
npm run build    # tsc -b && vite build
```

## Cấu trúc

- `src/api/client.ts` gắn bearer token, xử lý 401 và lỗi HTTP.
- `src/auth/` phiên đăng nhập, `AuthProvider` và trang đăng nhập.
- `src/config/rolePages.ts` bảng route theo vai trò.
- `src/layout/AppLayout.tsx` menu và chặn route ngoài quyền.
- `src/style.css` token giao diện và class dùng chung.
