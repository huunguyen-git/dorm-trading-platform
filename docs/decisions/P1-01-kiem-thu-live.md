# P1-01 · Kiểm thử live và Android · 22/11/2026

## Lựa chọn

Dùng `scripts/verify-p1-01-live.cjs` quản lý vòng đời API/Vite và tùy chọn Metro/Android trong một lượt kiểm thử có thời hạn. Chạy JAR vừa được Maven verify; chỉ dùng hai container thử `p101-postgres`/`p101-maildev` với cổng bind loopback đã kiểm tra. Khóa JWT sinh ngẫu nhiên trong bộ nhớ; không in khóa/token/OTP vào log. Script từ chối nếu cổng đã có dịch vụ, không tự dừng tiến trình không thuộc lượt chạy.

Web dùng Edge/Playwright và API/SMTP thật. Chỉ hai request refresh lỗi được chèn tại lớp Playwright để kiểm offline/503; request 401 và lần thử lại thu hồi phiên đi qua backend thật. Fixture tăng generation khiến access token cũ không hợp lệ trong khi refresh vẫn dùng được; không hạ TTL hay bỏ giới hạn production. Reset chờ đúng Retry-After, không xóa bộ đếm IP/email.

Android dùng Expo Go trên emulator thử riêng, ADB thao tác theo accessibility label. Đăng ký/xác minh tài khoản thử qua API/SMTP; đăng nhập, hồ sơ, khôi phục phiên sau force-stop và logout chạy bằng UI/native SecureStore. Phép thử này không thay thế UI đăng ký/reset/đổi mật khẩu trên thiết bị vật lý hoặc iOS.

## Lý do và tác động

- Lượt cũ thiếu bằng chứng client/API trên bản mới và cần mở nhiều dịch vụ thủ công. Bộ chạy chung giúp tái hiện và dọn đúng tiến trình đã mở; Windows dùng cây tiến trình vì Oracle javapath có JVM con.
- Expo SDK 53 đưa projectRoot vào HTTP header `/status`; đường dẫn tiếng Việt làm Node từ chối header. `scripts/start-p1-01-mobile.cjs` dùng đường dẫn Windows 8.3 tới chính các file hiện tại. Không sửa dependency hay di chuyển repo; nếu máy không có short path, script báo cần checkout ở đường dẫn ASCII.
- Không thay API contract, schema hoặc ngưỡng xác thực. Giữ dữ liệu thử trong container p101; Maildev chứa email thử và ảnh bằng chứng nằm ở `.local`, không đưa vào Git. Không trỏ công cụ này vào môi trường thật.
- Review sản phẩm vẫn do Quốc Nguyên xác nhận; trạng thái giao thư thất bại trên UI và phần hồ sơ P1-02 vẫn là việc còn lại.
