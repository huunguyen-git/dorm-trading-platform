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

Có quên mật khẩu bằng OTP và đổi mật khẩu trong phiên. Đăng xuất chỉ phiên hiện tại; đổi mật khẩu thu hồi tất cả phiên và yêu cầu đăng nhập lại. Các menu nghiệp vụ chưa có API vẫn cần task tương ứng; xem [P1-01](../docs/specs/P1-01.md) để chạy live check và biết phần chưa nghiệm thu.

## Kiểm thử GUI P1-01

Giao diện xác thực đã có nhãn, trạng thái xử lý/lỗi/thành công và các bước OTP/mật khẩu. Xem [checklist GUI](../docs/specs/P1-01-gui-checklist.md) để mở từng luồng, phân biệt test fixture với API thật và phần cần thử trên thiết bị.

Mật khẩu mới cần 8–128 code point sau NFC. HTTP 429 hiển thị số giây chờ từ server. Tài khoản quản trị bị khóa (`BI_KHOA`) bị từ chối bằng `403 ACCOUNT_RESTRICTED` khi đăng nhập, làm mới phiên và gọi API bảo vệ (`/auth/me`, `/admin/**`); giao diện ẩn thao tác đổi mật khẩu và không gọi API quản trị.

Lượt 22/11 đã kiểm web/API/SMTP thật, gồm reset, change → đăng nhập lại, logout khi refresh offline/503 và tài khoản khóa. Dùng [bộ chạy live](../scripts/verify-p1-01-live.cjs) từ root theo [hướng dẫn chuẩn bị](../docs/specs/P1-01-gui-checklist.md#chạy-lại-bộ-live--22112026); bộ chạy tự mở/đóng API và Vite trên cổng thử riêng.

## Quản trị P1-06

Đăng nhập bằng tài khoản đang hoạt động, đã xác minh/duyệt hồ sơ và có vai trò `QUAN_TRI_VIEN_CAP_CAO` hiệu lực:

- **Kiểm duyệt viên** (`/moderators`): tìm theo họ tên/MSSV/email, xác nhận bổ nhiệm hoặc thu hồi, xem lịch sử. Thu hồi trả báo cáo đang xử lý về hàng chờ; không đổi báo cáo đã có kết quả.
- **Thang phạt** (`/penalties`): tìm theo tên/mô tả, lọc trạng thái, thêm/sửa/ngừng mức phạt và xem giá trị trước/sau. Số điểm trừ phải là số nguyên dương. Khi có xung đột phiên bản, dữ liệu nhập vẫn được giữ; tải lại để lấy bản mới trước khi sửa.

Hai trang chỉ có trong menu cấp cao; API cũng kiểm tra quyền độc lập. Không có tài khoản cấp cao mặc định, API tự nâng quyền, xóa mức phạt hoặc kích hoạt lại mức đã ngừng. Sáu mức mẫu V2 được V5 chuyển ngừng sử dụng, không phải chính sách được duyệt.

Kết quả build/test và các bước thử với API thật: [spec P1-06](../docs/specs/P1-06.md).
