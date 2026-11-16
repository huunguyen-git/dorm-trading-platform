# P0-06 · Checklist chạy lại và xác nhận quy ước

Áp dụng [quyết định đã chốt ngày 08/11/2026](../decisions/P0-06-quy-uoc-va-ci.md). Mỗi thành viên dùng một bản clone mới ở revision nghiệm thu ghi trong [spec](../specs/P0-06.md#theo-dõi-pr-và-kết-quả-local), ghi kết quả và bằng chứng của máy mình. Không dùng kết quả của agent để xác nhận thay thành viên.

## 1. Quy ước chung

- Một Maven module, package miền dưới `com.dormtrading`, Temurin 21, Spring Boot 3.5.14, Maven Wrapper 3.9.16; Compose và Testcontainers cùng PostgreSQL 16.
- Migration V1/V2 giữ nguyên; trước khi tạo V3/V4… phối hợp Nguyễn Quốc Nguyên để cấp số và chốt phụ thuộc schema. Chủ task viết SQL/test của mình.
- Branch ngắn hạn từ main, tên `<type>/<mã-task>-<slug>`; commit/tiêu đề PR `type(scope): <mã-task> <kết quả>`. Riêng branch P0-06 dùng tên `task/p0-06-conventions-pipeline` đã được người dùng xác nhận.
- Một PR một việc, có bằng chứng kiểm tra và một người khác review; chỉ squash khi đủ điều kiện. Workflow `required` phải kiểm tra repository, workflow-lint, backend, admin-web và mobile.
- Ranh giới package, quyền API và migration phải được review theo task; CI hiện chưa có ArchUnit hoặc E2E. Không coi các màn scaffold dùng mock là nghiệp vụ đã hoàn thành.

## 2. Chuẩn bị môi trường

Ghi OS, revision và phiên bản. Chọn JDK 21 cho terminal hiện tại; không dùng Java mặc định khác phiên bản. Cần Docker Desktop đang chạy cho integration test. Các lệnh dưới đây dành cho PowerShell tại root của clone mới.

```powershell
git rev-parse HEAD
java -version
node --version
npm.cmd --version
docker version
docker compose version
```

Node phải là 24. Nếu `JAVA_HOME` đã trỏ JDK 21 nhưng `java -version` khác, thêm `$env:JAVA_HOME/bin` lên đầu PATH của terminal. Chép `.env.example` thành `.env` ở root và từng client nếu chưa có; không ghi đè file đang dùng. Không commit secret hoặc log chứa secret.

## 3. Hạ tầng và backend

Trong clone mới, cấu hình các cổng không bị chiếm. Mặc định PostgreSQL 5432, Maildev 1080/1025, MinIO 9000/9001. Nếu cần đổi PostgreSQL, đặt cùng `POSTGRES_PORT` cho Compose và backend. Đối chiếu tên database/user/password với cấu hình backend; không ghi đè hạ tầng dự án khác hoặc xóa volume để thử.

```powershell
docker compose config --quiet
docker compose up -d
Push-Location backend
.\mvnw.cmd --batch-mode --no-transfer-progress clean verify
Pop-Location
```

Mong đợi backend build thành công, hiện có 7 test với 0 failure/error/skipped, báo cáo `backend/target/surefire-reports/`. Maildev và MinIO cần được gọi HTTP trực tiếp tại `/healthz` và `/minio/health/live`; healthcheck hiện có vẫn có tồn đọng báo healthy giả từ P0-03.

Chạy backend ở terminal riêng; tạo khóa thử riêng cho tiến trình thay vì dựa vào fallback hiện có:

```powershell
$p006Key = New-Object byte[] 32
$p006Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$p006Rng.GetBytes($p006Key)
$p006Rng.Dispose()
$env:JWT_SECRET = [Convert]::ToBase64String($p006Key)
Set-Location backend
.\mvnw.cmd spring-boot:run
```

Mở `http://localhost:8082/api/v1/health`: HTTP 200, `status=UP`, `service=dorm-trading-backend`, `database=CONNECTED`. Khóa fallback vẫn thuộc P1-01 xử lý, chưa được sửa bởi việc cấp khóa thử này.

## 4. Hai client

Trong thư mục từng app trên Node 24:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Mong đợi TypeScript đạt, mỗi client hiện có 5 test đạt, web build và mobile export Android đạt. `lint` hiện là `tsc --noEmit`. Lưu exit code/kết quả từng bước; npm audit được ghi riêng, không tự chạy `audit fix --force` trong lượt smoke test.

- Web `.env`: `VITE_API_URL=http://localhost:8082/api/v1`. Chạy `npm.cmd run dev`; mở `http://localhost:5173` thấy form đăng nhập. Backend cho phép origin này; nếu đổi origin, cấu hình `CORS_ALLOWED_ORIGINS` tương ứng.
- Mobile `.env`: `EXPO_PUBLIC_API_URL=http://10.0.2.2:8082/api/v1` cho Android Emulator chuẩn; LDPlayer/điện thoại dùng IP LAN của máy backend. Chạy `npm.cmd start`; Expo Go cần tương thích SDK 53. Xem [README mobile](../../mobile/README.md).
- Từ origin web, kiểm tra request health và CORS trong trình duyệt. Từ giả lập/điện thoại, kiểm tra health qua địa chỉ backend thiết bị truy cập được. Lưu công cụ, URL, HTTP status và response đã dùng; công cụ mạng trên thiết bị chứng minh đường mạng, chưa chứng minh app gọi API nghiệp vụ.
- Lưu bằng chứng UI mobile thực sự mở được. Export Android không thay thế lượt chạy này, cũng không tạo APK. Đăng nhập/xác minh/duyệt với API thật tiếp tục thuộc Phase 1.

Nếu Expo không khởi động: lưu toàn bộ lỗi terminal, phiên bản Node/Expo và cổng. Phân biệt lỗi công cụ chạy lệnh, Metro/JS, xung đột cổng, Expo Go không khớp SDK và lỗi mạng thiết bị. Lượt agent bị chặn trước khi tạo tiến trình không phải bằng chứng lỗi Metro.

## 5. PR mẫu và ca lỗi

Mở PR dùng [template](../../.github/pull_request_template.md), ghi P0-06 và mục tiêu hạ tầng, không gắn UC nghiệp vụ. CI cuối phải có đủ sáu job xanh gồm năm job thành phần và gate `required`; Surefire artifact đọc được.

Để chứng minh gate bắt lỗi client, chỉ trên PR nháp P0-06: thêm một test cố ý thất bại, chạy CI và ghi URL run/job. Sau khi thấy job client và `required` thất bại, xóa test thử, chạy lại và lưu run đạt. Không merge commit còn test lỗi. Với cancelled/skipped, có thể thử nguyên logic gate local nhưng phải ghi rõ loại bằng chứng.

Đọc ruleset đang áp dụng cho main: yêu cầu một người approve, PR, squash và check `required` của GitHub Actions. Gate báo đỏ và cấu hình chặn merge là hai bằng chứng cần đối chiếu riêng.

## 6. Gửi kết quả

Điền dòng của mình trong [bảng kết quả local](../specs/P0-06.md#theo-dõi-pr-và-kết-quả-local): OS/công cụ/revision, kết quả backend và hạ tầng, từng client, UI, kết nối API chung, link log/ảnh và xác nhận. Mọi người dùng cùng revision nghiệm thu; nếu revision đổi, ghi rõ phần cần chạy lại.

Không đánh dấu đạt cho mục chưa chạy. Hết lượt thử, dừng tiến trình/stack do mình mở; giữ dữ liệu cần thiết. Không dừng container hoặc xóa volume của thành viên/dự án khác.
