# P1-01 · Checklist kiểm thử GUI

Ngày cập nhật: 22/11/2026. Phạm vi: GUI xác thực mobile và web quản trị, theo style kem/nâu đỏ hiện có. P1-01 → UC-01/03/04/07/08 → FR-01, FR-03, NFR-01 và chính sách đã duyệt. Xem [spec và bằng chứng API](P1-01.md).

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
| Đổi mật khẩu | Nhập mật khẩu hiện tại sai rồi đúng | Có lỗi; thành công thu hồi mọi phiên, về đăng nhập và thông báo đổi mật khẩu |
| Hồ sơ pending mobile | Đăng nhập tài khoản chưa duyệt; mở Hồ sơ | Có trạng thái email/hồ sơ, sửa tên và cập nhật trạng thái; vẫn xem hàng, không đăng tin |
| Danh sách | Không có mặt hàng hoặc API tải lỗi | Có trạng thái rỗng; lỗi có nút Thử tải lại |
| Đăng xuất | Đăng xuất phiên A trong khi B còn đăng nhập | A về trạng thái chưa đăng nhập; B vẫn dùng được (cần thử API thật/hai thiết bị) |
| Khả dụng | Mật khẩu hiện/ẩn, bàn phím, cuộn, màn hình hẹp | Nhãn rõ, nút có trạng thái; không tràn ngang, đọc được lỗi và thao tác tiếp |

Các selector mobile ổn định: `login-email`, `login-password`, `login-submit`, `auth-email`, `auth-otp`, `auth-submit`, `auth-success-continue`. Các field/nút có nhãn accessibility; web dùng label và role.

## Bằng chứng 13/11 · lịch sử

- Web: TypeScript, 8/8 unit test và production build đạt.
- Mobile: bộ test trước thay đổi cuối 6/6 đạt; test App cập nhật 4/4 đạt (thêm ca đăng ký/OTP/thành công), TypeScript đạt. Android export đạt trước khi chỉ bổ sung test.
- Edge headless với API fixture: login lỗi, OTP sai/cooldown, xác nhận lệch không gửi reset, reset thành công, tài khoản, đổi mật khẩu và logout đạt. Viewport 1440×1000 và 390×844 không tràn ngang, không page error.
- Ảnh sinh tại `.local/p1-gui/`: 01-login-desktop, 02-otp-error, 03-otp-mobile, 04-success-mobile, 05-account (PNG). Đã xem ảnh OTP màn hẹp và tài khoản desktop; ảnh là artifact local, không được Git theo dõi.
- Đây không phải kết quả GUI trên Android/iOS thật. Không có thiết bị adb kết nối; live UI với backend sau outbox chưa chạy lại. Bằng chứng backend/SMTP và giới hạn lần chạy trước giữ trong spec chính.

Trạng thái tại 13/11: **Chờ review**; được thay bằng **Đang thực hiện** trong lượt cập nhật 17/11 và giữ tới 22/11. Các phần còn thiếu được cập nhật ở cuối tài liệu.


Cập nhật 17/11: tiêu chí đổi mật khẩu đã theo UC-07, ngưỡng 8–128. Bằng chứng GUI 13/11 ở trên là lịch sử; lượt cập nhật có web 11/11, mobile 8/8 và build đạt. Chưa chạy lại browser/live UI do bước khởi động dịch vụ bị công cụ chặn; xem spec chính.

## Chạy lại bộ live · 22/11/2026

Chuẩn bị Node24, Java21+ (lượt này dùng Java24), Docker và Edge. Playwright nằm trong `.local/p1-tools`. Chạy Maven verify để JAR phản ánh mã backend hiện tại. Hai container riêng `p101-postgres` và `p101-maildev` phải đang chạy đúng cấu hình tại spec, bind `127.0.0.1`; không dùng dữ liệu thật.

Từ root chạy `node scripts/verify-p1-01-live.cjs`. Script từ chối cổng đang dùng, sinh JWT key trong bộ nhớ, mở API28082/Vite25173, chạy web và mobile renderer rồi đóng cả cây tiến trình đã mở. Log API: `.local/p1-01-live-backend.log`. Script giữ container/dữ liệu thử; không tự xóa bộ đếm, vì vậy chạy lặp quá nhiều trong một giờ có thể chạm quota IP thật và phải chờ Retry-After.

Để thêm native, mở Android emulator thử riêng đã cài Expo Go tương thích SDK53, sau đó chạy `node scripts/verify-p1-01-live.cjs --android`. Mặc định dùng `emulator-5554`; chọn thiết bị thử qua `P1_ANDROID_SERIAL`. Bộ chạy mở Metro28081, cấu hình adb reverse28081/28082 và chạy UI bằng accessibility label. Không chạy ca này trên Expo Go đang dùng cho công việc khác: ca thử force-stop ứng dụng để kiểm SecureStore. Emulator không tự đóng; adb reverse có thể dọn sau lượt thử.

Nếu đã có dịch vụ riêng, `node scripts/start-p1-01-mobile.cjs` mở Metro cho emulator; `node scripts/verify-p1-01-android.cjs` chạy ca native. Helper Metro dùng đường dẫn Windows 8.3 khi repo có dấu; máy không hỗ trợ cần checkout ở đường dẫn ASCII. Không sửa file trong node_modules. Có thể chọn JVM thực bằng `P1_JAVA` hoặc `JAVA_HOME`.

## Bằng chứng hiện tại · 22/11/2026

- Backend34/34, web17/17, mobile13/13; build JAR/web/Android export đạt. GUI fixture màn rộng/hẹp đạt.
- Live web/API/SMTP đạt cả reset, change → login lại, tài khoản khóa và logout lỗi refresh/khôi phục. Chỉ request refresh offline/503 được chèn lỗi bằng Playwright; 401 và thu hồi phiên đi qua API thật.
- Mobile renderer/API/SMTP1/1 đạt; Android native login/hồ sơ/SecureStore restore/logout qua force-stop đạt trên API35, Expo Go2.33.22. Đăng ký/OTP Android dùng fixture API; chưa thử toàn bộ biểu mẫu native hay iOS/thiết bị vật lý.
- Ảnh `.local/p1-native/` và `.local/p1-gui/`; chi tiết phạm vi, lần lỗi và kết quả tự rà tại [spec](P1-01.md#tiếp-tục-kiểm-chứng--22112026).

Giữ **Đang thực hiện**: còn trạng thái giao thư OTP thất bại trên UI, phần ghép hồ sơ P1-02, native auth đầy đủ và review xác nhận của Quốc Nguyên.
