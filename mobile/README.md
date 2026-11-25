# mobile

App Expo SDK 58 cho người dùng (React Native 0.88.1 + React 19.3).

## Chạy

> **Lưu ý:** Luôn `cd mobile` trước khi chạy lệnh `npm` / `npx expo` (thư mục gốc monorepo không có `package.json`). Trên Windows PowerShell nếu bị chặn `npx.ps1`, dùng `npm.cmd` hoặc `cmd /c npx ...`.

```bash
cd mobile
npm ci
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
npx expo login         # Đăng nhập cùng tài khoản Expo với app Expo Go trên điện thoại (PowerShell: cmd /c npx expo login)
npm run start:lan      # Mở QR cho thiết bị thật iOS / Android qua LAN
npm run android        # hoặc npm run ios (macOS Xcode Simulator)
```

`EXPO_PUBLIC_API_URL` phải là gốc API của backend:
- **Thiết bị thật iOS / Android (Expo Go chung Wi-Fi/LAN) & LDPlayer:** `http://<IP_LAN>:8082/api/v1` (ví dụ `http://192.168.100.181:8082/api/v1`).
- **Android Studio Emulator chuẩn:** `http://10.0.2.2:8082/api/v1`.
- **iOS Simulator (macOS):** `http://localhost:8082/api/v1`.

Xem hướng dẫn đầy đủ cho cả nhóm tại [`docs/huong-dan-trai-nghiem-mobile-ios-android.md`](../docs/huong-dan-trai-nghiem-mobile-ios-android.md).

Kiểm tra đường mạng từ trong giả lập trước khi mở app:

```bash
adb shell "curl -s http://192.168.1.73:8082/api/v1/health"
```

Chưa có Expo Go thì cài `adb install -r ExpoGo-<sdk>.apk`, chạy `adb reverse tcp:8081 tcp:8081` rồi mở `exp://127.0.0.1:8081`.

## Kiểm tra

```bash
npm run lint     # tsc --noEmit
npm test         # jest --runInBand
npm run build    # expo export --platform android, kết quả ở dist/
```

## Cấu trúc

- `src/api/client.ts` gắn bearer token, xử lý 401 và lỗi HTTP.
- `src/auth/` phiên đăng nhập và lưu token bằng `expo-secure-store`.
- `src/listings/store.ts` danh sách tin và tạo tin.
- `src/navigation/AppNavigator.tsx` các màn hình và luồng auth.
- `src/theme.ts` token giao diện dùng chung cho các màn.


## Xác thực P1-01

Màn đăng nhập có đăng ký, gửi lại xác minh email và quên mật khẩu. OTP email6 số/5 phút; mật khẩu15–128 ký tự. Người chờ duyệt xem tin công khai và sửa họ tên trong Hồ sơ; duyệt đầy đủ thuộc P1-02. Access/refresh token lưu SecureStore; đăng xuất chỉ thiết bị này. Đổi mật khẩu giữ phiên hiện tại, thu hồi các phiên khác; reset yêu cầu đăng nhập lại.

[Live test](e2e/auth.live.tsx) chạy UI React Native test renderer với API/SMTP thật, nhưng SecureStore và transport được thay cho môi trường Node; không thay kiểm tra thiết bị. Xem [spec](../docs/specs/P1-01.md) để chạy với dịch vụ thử riêng. Không đưa khóa JWT vào EXPO_PUBLIC_*.

## Kiểm thử GUI P1-01

Giao diện xác thực đã có nhãn, trạng thái xử lý/lỗi/thành công và các bước OTP/mật khẩu. Xem [checklist GUI](../docs/specs/P1-01-gui-checklist.md) để mở từng luồng, phân biệt test fixture với API thật và phần cần thử trên thiết bị.
