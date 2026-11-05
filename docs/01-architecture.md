# Kiến trúc mục tiêu và cách kiểm tra

Tại commit nền `4d8216a`, repo chỉ theo dõi `.gitignore` và `LICENSE`. Sơ đồ dưới đây mô tả kiến trúc mục tiêu của Phase 0. Khi một module được bàn giao, cập nhật tài liệu này bằng đường dẫn và lệnh chạy đã kiểm chứng từ bản clone mới.

```mermaid
flowchart LR
    M["mobile/ · React Native + Expo"] -->|HTTPS / JSON| B["backend/ · Spring Boot Modular Monolith"]
    A["admin-web/ · React + Vite"] -->|HTTPS / JSON| B
    B --> D[("PostgreSQL")]
    B --> F["Kho ảnh và bằng chứng"]
    B --> S["SMTP / OTP"]
```

P0-02 tạo `mobile/` và `admin-web/`. P0-03 tạo `infra/` cho cấu hình dịch vụ dùng chung. `docs/` chứa quy trình, kế hoạch, spec và quyết định kỹ thuật. Theo workbook, P0-01 dựng backend Modular Monolith. Backend dùng một Maven module, tổ chức mã theo [quyết định P0-01](decisions/P0-01-khung-backend.md). Các miền nghiệp vụ trong workbook gồm `iam` (tài khoản và quyền), `catalog` (kho và tin), `chat` (thương lượng), `order` (giữ chỗ và bàn giao), `review` (đánh giá và uy tín), `gov` (kiểm duyệt và quản trị).

## Mốc chốt công nghệ

| Task | Công cụ theo bảng stack | Việc cần ghi nhận khi triển khai |
|---|---|---|
| P0-01 | Temurin JDK 21 LTS, Spring Boot, Maven Wrapper | Spring Boot 3.5.14 và Maven 3.9.16. Xem [POM](../backend/pom.xml) và [cấu hình wrapper](../backend/.mvn/wrapper/maven-wrapper.properties). |
| P0-02 | Node 24 LTS, npm, TypeScript, React/Vite, React Native/Expo | Đã chốt: `mobile/` dùng Expo SDK 53, React Native 0.79.5, React 19.0.0, TypeScript 5.8.3; `admin-web/` dùng React 18.3.1, Vite 6.3.5, React Router 6.30.1, Vitest. Hai app giữ `package-lock.json` kiểu 3 và script `start`/`dev`, `lint` (`tsc --noEmit`), `test`, `build`. Xem [spec P0-02](specs/P0-02.md). |
| P0-03 | PostgreSQL, Flyway, Docker Compose | Chọn một major PostgreSQL và dùng cùng major trong Compose và Testcontainers. Tạo migration có phiên bản, kiểm tra cả DB mới và DB từ bản trước. |
| P0-04 | GitHub Actions trên Ubuntu do GitHub cung cấp | Đã thiết lập CI pipeline gồm: `repository` (kiểm tra khoảng trắng), `workflow-lint` (actionlint) và `backend` (Temurin 21, cache Maven, clean verify 4 test bảo mật, upload Surefire artifact). Cổng hợp nhất `required` xuất Step Summary làm điều kiện merge. Xem [spec P0-04](specs/P0-04.md). |

## Kiểm tra theo phần thay đổi

- **Backend** · Chạy trong `backend/` lệnh `.\mvnw.cmd clean verify` trên Windows hoặc `./mvnw clean verify` trên Ubuntu. Đối chiếu test với tiêu chí của task. Khi đã cấu hình profile integration test, ghi rõ lệnh kích hoạt và yêu cầu Docker.
- **Mobile và web** · Từ đúng thư mục app có lockfile, chạy `npm ci`, sau đó `npm run` để xem script thật. Chạy lint, test và build tương ứng với nền tảng. Với thay đổi quyền camera hoặc URL kết nối, thử trên giả lập hoặc thiết bị theo tiêu chí task.
- **Hạ tầng và liên ứng dụng** · Tại P0-03, kiểm tra cấu hình Compose, chạy migration và thử cả hai client gọi cùng API. Tại P0-06, lưu kết quả PR mẫu và xác nhận local của 5 thành viên. P4-02 nghiệm thu xuyên ứng dụng bằng Maestro và Playwright.
- **Tài liệu** · Kiểm tra mã task/UC, liên kết tương đối và `git diff --cached --check`. Nếu dự án chưa có manifest hoặc job tương ứng, ghi chính xác phép kiểm tra còn chờ.

## Chạy backend P0-01

Trỏ `JAVA_HOME` đến Temurin JDK 21. Trong [backend/](../backend/), chạy Maven Wrapper theo mục kiểm tra ở trên. Lần đầu cần kết nối Internet để tải Maven và dependency. Bộ test tự cung cấp khóa, khởi động server trên cổng ngẫu nhiên và gọi HTTP. Có thể chạy khi chưa có DB hoặc Docker.

Để chạy ứng dụng trên Windows, tạo khóa thử riêng cho phiên PowerShell rồi khởi động từ thư mục backend.

```powershell
$key = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($key)
$rng.Dispose()
$env:JWT_SECRET = [Convert]::ToBase64String($key)
.\mvnw.cmd spring-boot:run
```

Trên Ubuntu, dùng `export JWT_SECRET="$(openssl rand -base64 32)"` rồi chạy `./mvnw spring-boot:run`. Mở [health trên máy local](http://localhost:8082/api/v1/health). API trả HTTP 200 và JSON gồm `status` bằng `UP`, `service` bằng `dorm-trading-backend` và `timestamp`. Dùng `SERVER_PORT` để đổi cổng. Web Vite ở origin `http://localhost:5173` được phép gọi API. Đặt `CORS_ALLOWED_ORIGINS` thành danh sách origin phân tách bằng dấu phẩy khi chạy web ở địa chỉ khác. Client di động dùng địa chỉ backend mà thiết bị truy cập được, ví dụ `http://10.0.2.2:8082` trên Android Emulator.
