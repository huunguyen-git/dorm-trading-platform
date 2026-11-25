# P2 / P4-02 · Nâng cấp ứng dụng di động từ Expo SDK 53 lên Expo SDK 58

Trạng thái: **Chấp nhận ngày 25/11/2026** (theo yêu cầu chạy thử trực tiếp trên thiết bị iOS và Android của nhóm).

## Bối cảnh

Khung khởi tạo `mobile/` ở `P0-02` ghim `expo@~53.0.0` (React Native `0.79.5`, React `19.0.0`). Tại thời điểm tháng 11/2026, ứng dụng **Expo Go** chính thức trên **Apple App Store (iOS)** và **Google Play Store (Android)** đã chuyển sang chỉ hỗ trợ duy nhất **Expo SDK 58 (`58.0.0`)**.

Trên Android có thể cài file APK Expo Go cũ (`SDK 53`) để chữa cháy, nhưng **trên thiết bị iOS vật lý (iPhone / iPad) không thể cài hạ cấp IPA Expo Go cũ** nếu các thành viên dùng máy Windows/Linux và chưa có tài khoản Apple Developer trả phí để tự ký Development Build. Khi quét mã QR, Expo Go trên iPhone từ chối mở dự án với lỗi lệch phiên bản SDK (`53` so với `58.0.0`).

## Quyết định

1. Nâng cấp `mobile/` từ **Expo SDK 53** lên **Expo SDK 58 (`~58.0.26`)** theo đúng ma trận phụ thuộc chính thức của Expo (`bundledNativeModules.json`):
   - `expo`: `~58.0.26`
   - `react`: `19.3.0`, `react-native`: `0.88.1`
   - `@expo/vector-icons`: `^15.0.2`, `expo-image-picker`: `~58.0.10`, `expo-secure-store`: `~58.0.3`, `expo-status-bar`: `~58.0.5`
   - `react-native-safe-area-context`: `~5.11.1`, `react-native-screens`: `~4.30.1`
   - `@react-navigation/native`: `^7.5.2`, `@react-navigation/native-stack`: `^7.21.1`
   - `jest-expo`: `~58.0.15`, `jest`: `~30.5.2`, `react-test-renderer`: `19.3.0`, `@types/jest`: `30.0.0`, `@types/node`: `^24.0.0`, `@types/react`: `~19.3.0`, `typescript`: `~6.0.3`
2. Giữ nguyên cổng kiểm tra bắt buộc của job `mobile` trên GitHub Actions (Node `24`: `npm ci`, `npm run lint`, `npm test`, `npm run build` xuất bundle Android). Cả `expo@58.0.26` và `react-native@0.88.1` đều khai báo `engines.node` hỗ trợ `^24.3.0` và `>=26.0.0`.
3. Bổ sung `resolveMediaUrl` tại `mobile/src/api/client.ts` để chuẩn hóa đường dẫn ảnh `/api/v1/media/{id}` theo `EXPO_PUBLIC_API_URL` của từng máy khách, đảm bảo hiển thị đồng nhất trên cả iPhone thật, điện thoại Android thật, Android Studio Emulator (`10.0.2.2`) và iOS Simulator (`localhost`).

## Phương án đã cân nhắc và hệ quả

| Lựa chọn | Đánh giá và tác động |
|---|---|
| **Nâng `mobile/` lên Expo SDK 58 (chọn)** | Cả 5 thành viên tải **Expo Go** trực tiếp từ App Store (iOS) và Google Play (Android) là chạy được ngay trên mọi hệ điều hành máy dev (Windows/macOS/Linux); giữ nguyên quy trình CI không cần tài khoản Apple Developer. Cần khóa chặt `mobile/package-lock.json` mới và chạy lại đủ `lint`, `test`, `build`. |
| Giữ Expo SDK 53, dùng Development Build (`expo-dev-client`) | Trên iOS thật bắt buộc phải có máy macOS + Xcode hoặc tài khoản Apple Developer trả phí ($99/năm) để ký IPA; chặn các thành viên dùng Windows muốn thử ngay trên iPhone. |
| Chỉ hỗ trợ Android APK Expo Go cũ | Không đáp ứng nhu cầu kiểm thử và demo trên thiết bị iOS của các thành viên trong nhóm. |

## Cách xác nhận

- `cd mobile && npx expo install --check` không báo lệch phiên bản SDK 58.
- `npm run lint`, `npm test`, `npm run build` đạt trên `mobile/`.
- Expo Metro chạy `start:lan` trả manifest hợp lệ cho cả `expo-platform: ios` và `expo-platform: android` với `sdkVersion: "58.0.0"`.
