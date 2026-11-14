# ADR-003: Xác thực JWT và phân quyền RBAC theo ranh giới vai trò

Trạng thái: Chấp nhận (thay thế quyết định session cookie trong ADR stack cũ của nhóm, 2026-09-25)
Ngày: 2026-10-28
Người quyết định: Tô Thành Nguyên (P0-05); Liên quan: Nguyễn Hữu Nguyên (P0-01, Spring Security), Nguyễn Bảo Việt (P0-02, lưu token trên mobile)

## Cập nhật ngày 13/11/2026

**Được thay thế một phần** bởi [quyết định P1-01 đã được người dùng duyệt](../../decisions/P1-01-hop-dong-xac-thuc.md): logout chỉ phiên hiện tại; đổi mật khẩu giữ phiên hiện tại bằng token mới và thu hồi phiên khác; reset thu hồi tất cả, đăng nhập lại. Phiên/token thu hồi bị từ chối từ request tiếp theo, không chờ access hết hạn. Người chờ duyệt được quản lý hồ sơ mình và xem mặt hàng công khai. Các phát biểu khác tương ứng bên dưới được giữ làm lịch sử, không dùng làm hợp đồng hiện hành. Chính sách OTP/mật khẩu và lựa chọn triển khai xem quyết định P1-01; bằng chứng ở spec P1-01.

## Bối cảnh

Quyết định cũ dùng session cookie cùng origin phù hợp với một SPA web. Phạm vi mới có ứng dụng mobile native, nơi cookie và CSRF không tự nhiên; kế hoạch Phase 0 (P0-01) ghi rõ "JWT Security và RBAC dùng chung cho mobile và web quản trị". Vai trò hệ thống: Người đăng ký, Thành viên, Kiểm duyệt viên, Quản trị viên cấp cao (xem [ranh giới vai trò](../README.md#3-ranh-giới-vai-trò)). Yêu cầu: NFR-01 hạn chế truy cập dữ liệu định danh; FR-03 kiểm duyệt viên và quản trị viên có nhiệm vụ phân biệt; FR-12 tài khoản bị khóa không được thao tác.

## Quyết định

Chúng tôi dùng **Bearer JWT** cho cả hai client, với **RBAC** ở backend:

Token

- **Access token**: JWT ký HS256 bằng khóa bí mật của backend (đổi sang RS256 nếu có dịch vụ thứ hai cần xác minh), hiệu lực **15 phút**, claim: `sub` = userId, `roles` = danh sách vai trò, `client` = `mobile` | `admin-web`, `jti`.
- **Refresh token**: chuỗi ngẫu nhiên, hiệu lực **30 ngày**, lưu **băm** trong bảng `refresh_token` (module `iam`) cùng userId, client, thiết bị, thời điểm; **xoay vòng** mỗi lần làm mới; dùng lại token đã xoay sẽ thu hồi cả chuỗi (phát hiện đánh cắp).
- Mobile lưu cả hai token trong **Expo SecureStore** (Keychain/Keystore). Web quản trị giữ access token trong bộ nhớ; refresh token trong cookie `HttpOnly; Secure; SameSite=Strict`, chỉ gửi tới `/api/v1/auth/refresh`, kèm kiểm tra header `Origin`.
- Đăng xuất, đổi mật khẩu, khóa tài khoản, xóa tài khoản: thu hồi mọi refresh token của người dùng; access token còn lại tự hết sau tối đa 15 phút. Với khóa tài khoản, backend kiểm thêm trạng thái tài khoản ở mỗi request ghi (không chỉ tin claim).

Phân quyền

- Vai trò lưu trong `iam`: `MEMBER` (mọi tài khoản đã kích hoạt), `MODERATOR`, `SENIOR_ADMIN` (bao gồm quyền `MODERATOR`). Người đăng ký chưa kích hoạt không có vai trò, chỉ gọi được nhóm endpoint đăng ký/OTP/thẻ.
- Ranh giới client: endpoint kiểm duyệt (`/api/v1/admin/**`) yêu cầu `roles` chứa `MODERATOR` hoặc `SENIOR_ADMIN` **và** `client = admin-web`; endpoint thành viên yêu cầu `MEMBER`. Đăng nhập trên mobile không cấp token `admin-web` dù tài khoản có vai trò kiểm duyệt.
- Kiểm quyền theo vai trò ở `shared` bằng Spring Security (`@PreAuthorize`); kiểm **quyền sở hữu** (chủ tin, bên tham gia giao dịch, người báo cáo) ở application service của module chủ, không ở controller.
- Mặc định từ chối: mọi endpoint phải khai báo quyền; chỉ `GET /api/v1/system/status`, `/actuator/health`, đăng ký, OTP, đăng nhập, khôi phục mật khẩu là công khai, có rate limit.
- Người dùng bị khóa tạm: được đọc và hoàn tất giao dịch đã giữ, không được đăng tin/giữ chỗ mới; khóa vĩnh viễn: chỉ đọc và khiếu nại.

## Phương án đã cân nhắc

- **Session cookie cho cả hai** (quyết định cũ): tốt cho web, nhưng mobile phải mô phỏng cookie jar và CSRF; khó kiểm thử và dễ sai.
- **JWT không refresh, access token dài**: đơn giản nhưng không thu hồi được khi khóa tài khoản, vi phạm FR-12.
- **OAuth2/OpenID với máy chủ ủy quyền riêng (Keycloak)**: chuẩn, nhưng thêm một dịch vụ phải vận hành và vượt nhu cầu 8 tuần.
- **JWT ngắn + refresh xoay vòng + RBAC** (chọn): dùng được trên cả hai client, thu hồi được, không thêm dịch vụ.

## Hệ quả

- Dễ hơn: một cơ chế auth cho hai client; kiểm thử bằng REST Assured dễ đóng gói token; ZAP quét được.
- Khó hơn: phải cài rate limit cho đăng nhập/OTP, quản lý khóa ký trong secrets (không commit), xử lý làm mới token trên mobile khi app trở về từ nền.
- Việc tiếp theo: P0-01 hiện thực `shared` security + `iam` auth endpoint theo ADR này; P0-02 cấu hình API client tự làm mới token và xử lý 401; P4-04 kiểm tra mobile không chứa secret và dùng HTTPS.
