# Hướng dẫn Demo CD (GitHub Actions → Docker Hub → Local Compose)

Gói `infra/demo/` được thiết kế **độc lập hoàn toàn**: bạn có thể sao chép riêng thư mục này sang một máy tính chỉ cài Docker (không cần mã nguồn, JDK 21, Maven hay Node 24) để triển khai và quay demo CD.

> [!IMPORTANT]
> Luôn mở Admin Web tại **`http://localhost:8080`** (không dùng `127.0.0.1` hay địa chỉ IP LAN qua HTTP). Backend đặt refresh cookie `dorm_refresh` với thuộc tính `Secure; HttpOnly; SameSite=Strict` và kiểm tra header `Origin`; trình duyệt chỉ coi `localhost` (hoặc HTTPS) là Secure Context để giữ cookie qua F5.

---

## Quy trình 5 bước chạy Demo CD

### Bước 1 — Tạo Access Token Docker Hub và cấu hình GitHub Secrets

1. Đăng nhập [Docker Hub](https://hub.docker.com/) → **Account Settings → Personal access tokens → Generate new token** với quyền **Read & Write** (sao chép token ngay).
2. Trên GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, tạo 2 secret:
   - `DOCKERHUB_USERNAME`: tên tài khoản Docker Hub của bạn (chữ thường).
   - `DOCKERHUB_TOKEN`: Access Token vừa tạo ở trên.

### Bước 2 — Kích hoạt luồng CD trên GitHub Actions

- **Tự động:** Khi PR được merge vào `main` và workflow **`CI`** chạy xanh toàn bộ, workflow **`CD`** (`.github/workflows/cd.yml`) sẽ tự động build multi-stage Docker images cho `backend` & `admin-web` song song với Buildx GHA cache để push tag `:sha-<7-ký-tự>`, sau đó job `promote-latest` (chỉ chạy khi cả 2 build đạt và có concurrency khóa toàn repo) mới gắn tag `:latest`.
- **Kích hoạt thủ công khi quay demo:** Mở tab **Actions → CD → Run workflow**. Mặc định `publish_latest = false` (chỉ đẩy `:sha-<7-ký-tự>`). Nếu muốn đồng thời cập nhật `:latest` khi quay demo, chỉ chọn nhánh **`main`** đã có lượt **`CI`** xanh và tick `publish_latest = true`.
- Khi chạy xong, mở **Summary** của lần chạy để xem bảng image, digest và lệnh deploy/rollback dựng sẵn.

### Bước 3 — Khởi chạy trên máy Demo (không cần mã nguồn)

Sao chép thư mục `infra/demo/` sang máy demo, mở terminal tại thư mục đó (mọi cổng dịch vụ đều chỉ bind về `127.0.0.1`, không mở ra mạng LAN/Wi-Fi):

```bash
cp .env.demo.example .env
# Tạo JWT_SECRET ngẫu nhiên (BẮT BUỘC — >= 32 bytes Base64):
openssl rand -base64 48
# (Trên Windows PowerShell 5.1:
#   $b = New-Object byte[] 48; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
# )
# Mở .env và điền DOCKERHUB_USERNAME=<tên-dockerhub-của-bạn> cùng JWT_SECRET vừa tạo

docker compose -f docker-compose.demo.yml pull
docker compose -f docker-compose.demo.yml up -d
docker compose -f docker-compose.demo.yml ps
```

Chờ đến khi cả **5 container** (`postgres`, `maildev`, `minio`, `backend`, `admin-web`) đều đạt trạng thái **`healthy`**.

### Bước 4 — Kiểm chứng dịch vụ đang chạy

1. **API Health qua Nginx reverse-proxy:**
   ```bash
   curl -i http://localhost:8080/api/v1/health
   ```
   Kết quả trả về HTTP `200` với `"status":"UP"` và `"database":"CONNECTED"`.
2. **Giao diện Admin Web & Cookie `Secure`:**
   - Mở `http://localhost:8080` trên trình duyệt.
   - Mở Maildev tại `http://localhost:1080` để nhận email OTP khi thử luồng **Quên mật khẩu**.
   - Đăng nhập bằng tài khoản quản trị, kiểm tra không phát sinh lỗi `403 INVALID_ORIGIN` và nhấn **F5 reload** để xác nhận phiên vẫn được giữ qua cookie `dorm_refresh`.
3. **MinIO Console (tùy chọn):** Mở `http://localhost:9001` với tài khoản trong `.env`.

### Bước 5 — Demo Rollback trong 5 giây (và tùy chọn Auto-CD với Watchtower)

- **Rollback tức thì về bản cũ** (lấy mã `sha-<7-ký-tự>` từ lịch sử tab Actions → CD → Summary):
  - **Linux / macOS / Git Bash:**
    ```bash
    IMAGE_TAG=sha-<7-ký-tự-cũ> docker compose -f docker-compose.demo.yml pull
    IMAGE_TAG=sha-<7-ký-tự-cũ> docker compose -f docker-compose.demo.yml up -d
    ```
  - **Windows PowerShell:**
    ```powershell
    $env:IMAGE_TAG = "sha-<7-ký-tự-cũ>"
    docker compose -f docker-compose.demo.yml pull
    docker compose -f docker-compose.demo.yml up -d
    ```
  - Hoặc sửa trực tiếp `IMAGE_TAG=sha-<7-ký-tự-cũ>` trong file `.env` rồi chạy lại `pull` + `up -d`.
- **Tùy chọn bật Auto-CD (Watchtower tự động pull bản `:latest` mỗi 15 giây):**
  ```bash
  docker compose -f docker-compose.demo.yml --profile auto-cd up -d
  ```
  Watchtower chỉ theo dõi các container có nhãn `com.centurylinklabs.watchtower.enable=true` (`backend` và `admin-web`). Nginx cấu hình `resolver 127.0.0.11 valid=10s` nên tự cập nhật IP mới của `backend` mà không bị lỗi `502`.

---

## Dọn dẹp & xử lý nhanh

- **Nếu máy demo đã có tiến trình dùng cổng `8080` hoặc `9000`:** đổi `ADMIN_WEB_PORT` (ví dụ `18080`) kèm thêm `http://localhost:18080` vào `CORS_ALLOWED_ORIGINS` (hoặc đổi `MINIO_API_PORT`) trong file `.env`, sau đó chạy lại `docker compose -f docker-compose.demo.yml up -d`.

```bash
# Dừng dịch vụ nhưng giữ lại dữ liệu DB / MinIO / ảnh upload
docker compose -f docker-compose.demo.yml --profile auto-cd down

# Dừng và xóa sạch toàn bộ volume dữ liệu demo
docker compose -f docker-compose.demo.yml --profile auto-cd down -v
```
