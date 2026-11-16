# P1-01 · Checklist kiểm thử GUI

Ngày cập nhật: 13/11/2026. Phạm vi: GUI xác thực mobile và web quản trị, theo style kem/nâu đỏ hiện có. P1-01 → UC-01/03/04/07/08 → FR-01, FR-03, NFR-01 và chính sách đã duyệt. Xem [spec và bằng chứng API](P1-01.md).

## Chuẩn bị và mở giao diện

- Mobile: theo [README](../../mobile/README.md), mở Expo trên thiết bị/emulator, cấu hình địa chỉ API thiết bị truy cập được. Từ Tin đăng chọn Đăng nhập; từ đó có Đăng ký, Quên mật khẩu, Gửi lại xác minh email.
- Web: theo [README](../../admin-web/README.md), mở trang đăng nhập. Tài khoản kiểm duyệt viên/quản trị viên hợp lệ vào trang Tài khoản & bảo mật; tài khoản sinh viên dùng mobile.
- Thử tích hợp cần backend, PostgreSQL và SMTP/Maildev; lấy OTP từ hộp thư thử. Không sửa vai trò qua giao diện. Duyệt hồ sơ thật thuộc P1-02.
- Thử layout độc lập: script [verify-p1-01-gui.cjs](../../scripts/verify-p1-01-gui.cjs) tự mở/đóng Vite và Edge headless, giả lập response API tại lớp Playwright. Cần Playwright trong thư mục bỏ qua Git `.local/p1-tools` và Edge; có thể chọn browser qua P1_BROWSER_CHANNEL. Script không cần backend và không chứng minh tích hợp API.

## Các ca thao tác

| Ca | Thao tác | Kết quả cần thấy |
|---|---|---|
| Đăng nhập | Bỏ trống, nhập sai, sau đó nhập đúng | Lỗi rõ, nút xử lý chống bấm lặp; đúng thì vào Tin đăng mobile hoặc Tài khoản & bảo mật web |
| Đăng ký mobile | Điền email, họ tên, MSSV; thử mật khẩu ngắn và xác nhận lệch | Báo lỗi trước khi gửi; hợp lệ chuyển bước OTP |
| OTP | Nhập thiếu/sai mã, nhập mã đúng | Lỗi giữ nguyên bước; đúng có màn Hoàn tất và nút tiếp tục |
| Gửi lại/hết hạn | Chờ cooldown, gửi lại; để mã quá hạn | Countdown, nút gửi lại bị khóa trong cooldown; mã hết hạn không tiếp tục xác minh |
| Quên mật khẩu | Email → OTP → mật khẩu mới | Có chỉ báo bước, đổi email được, kiểm tra xác nhận; thành công trở về đăng nhập |
| Reset hết hạn | Để quyền đặt mật khẩu hết hạn | Báo hết hạn, cho yêu cầu mã mới; không gửi reset bằng grant đã hết hạn |
| Đổi mật khẩu | Nhập mật khẩu hiện tại sai rồi đúng | Có lỗi; thành công giữ phiên hiện tại, thông báo đăng xuất các phiên khác |
| Hồ sơ pending mobile | Đăng nhập tài khoản chưa duyệt; mở Hồ sơ | Có trạng thái email/hồ sơ, sửa tên và cập nhật trạng thái; vẫn xem hàng, không đăng tin |
| Danh sách | Không có mặt hàng hoặc API tải lỗi | Có trạng thái rỗng; lỗi có nút Thử tải lại |
| Đăng xuất | Đăng xuất phiên A trong khi B còn đăng nhập | A về trạng thái chưa đăng nhập; B vẫn dùng được (cần thử API thật/hai thiết bị) |
| Khả dụng | Mật khẩu hiện/ẩn, bàn phím, cuộn, màn hình hẹp | Nhãn rõ, nút có trạng thái; không tràn ngang, đọc được lỗi và thao tác tiếp |

Các selector mobile ổn định: `login-email`, `login-password`, `login-submit`, `auth-email`, `auth-otp`, `auth-submit`, `auth-success-continue`. Các field/nút có nhãn accessibility; web dùng label và role.

## Bằng chứng đã chạy

- Web: TypeScript, 8/8 unit test và production build đạt.
- Mobile: bộ test trước thay đổi cuối 6/6 đạt; test App cập nhật 4/4 đạt (thêm ca đăng ký/OTP/thành công), TypeScript đạt. Android export đạt trước khi chỉ bổ sung test.
- Edge headless với API fixture: login lỗi, OTP sai/cooldown, xác nhận lệch không gửi reset, reset thành công, tài khoản, đổi mật khẩu và logout đạt. Viewport 1440×1000 và 390×844 không tràn ngang, không page error.
- Ảnh sinh tại `.local/p1-gui/`: 01-login-desktop, 02-otp-error, 03-otp-mobile, 04-success-mobile, 05-account (PNG). Đã xem ảnh OTP màn hẹp và tài khoản desktop; ảnh là artifact local, không được Git theo dõi.
- Đây không phải kết quả GUI trên Android/iOS thật. Không có thiết bị adb kết nối; live UI với backend sau outbox chưa chạy lại. Bằng chứng backend/SMTP và giới hạn lần chạy trước giữ trong spec chính.

Trạng thái bàn giao: **Chờ review**. Còn kiểm thiết bị thật (bàn phím, SecureStore, mạng), các ca chờ hết hạn thực tế và ghép duyệt hồ sơ P1-02.
