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


## Xác thực P1-01

Đăng nhập bằng tài khoản đã xác minh/duyệt và được cấp vai trò quản trị trong backend. Access token chỉ ở bộ nhớ; refresh cookie HttpOnly/Secure/SameSite=Strict. Không còn dùng sessionStorage. Backend phải cho phép origin Vite qua CORS, credentials và expose WWW-Authenticate. Dùng localhost ở cả hai đầu khi thử; triển khai thật dùng HTTPS cùng site.

Có quên mật khẩu bằng OTP và đổi mật khẩu trong phiên. Đăng xuất chỉ phiên hiện tại; đổi mật khẩu giữ phiên này và thu hồi phiên khác. Các menu nghiệp vụ chưa có API vẫn cần task tương ứng; xem [P1-01](../docs/specs/P1-01.md) để chạy live check và biết phần chưa nghiệm thu.

## Kiểm thử GUI P1-01

Giao diện xác thực đã có nhãn, trạng thái xử lý/lỗi/thành công và các bước OTP/mật khẩu. Xem [checklist GUI](../docs/specs/P1-01-gui-checklist.md) để mở từng luồng, phân biệt test fixture với API thật và phần cần thử trên thiết bị.
