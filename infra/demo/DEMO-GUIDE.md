# Hướng dẫn sử dụng & Kịch bản quay Demo CD (Dorm Trading Platform)

Tài liệu này hướng dẫn đầy đủ phần còn lại sau khi bạn đã chạy thành công workflow **CD** trên GitHub Actions (Bước 2.3): kiểm tra kết quả trên Docker Hub, dựng hệ thống trên máy demo không cần mã nguồn, quay video demo theo từng phân cảnh, thử rollback 5 giây và xử lý sự cố nhanh.

---

## 1. Xác nhận sau bước 2.3 (Checklist trước khi quay demo)

Trước khi bấm quay màn hình, kiểm tra nhanh 4 điểm sau:

- [ ] **GitHub Actions → CD** có đủ 5 job xanh: `prepare` → `build-backend` & `build-admin-web` (chạy song song) → `promote-latest` (nếu chạy trên `main` đã qua CI) → `summary`.
- [ ] Mở tab **Summary** của lượt chạy CD vừa xong: thấy bảng tổng hợp gồm repository, tag (`latest`, `sha-<7-ký-tự>`), Digest SHA256 và lệnh deploy/rollback dựng sẵn.
- [ ] Mở [Docker Hub](https://hub.docker.com/) kiểm tra đã xuất hiện đủ 2 repository:
  - `<DOCKERHUB_USERNAME>/dorm-trading-backend` (có tag `latest` và `sha-<7-ký-tự>`)
  - `<DOCKERHUB_USERNAME>/dorm-trading-admin-web` (có tag `latest` và `sha-<7-ký-tự>`)
- [ ] **Mẹo quay rollback thuyết phục:** Nếu muốn demo rollback giữa **2 phiên bản khác nhau thật**, bạn có thể push thêm 1 commit nhỏ (ví dụ sửa mô tả/docs) để Docker Hub có ít nhất 2 tag `sha-<cũ>` và `sha-<mới>`. Nếu chưa cần, vẫn có thể demo chuyển đổi giữa `:latest` và `:sha-<7-ký-tự>` hiện tại để minh họa cơ chế ghim phiên bản.

---

## 2. Chuẩn bị máy Demo độc lập (không cần mã nguồn / JDK / Maven / Node)

Chỉ cần sao chép **duy nhất thư mục `infra/demo/`** (chứa `docker-compose.demo.yml`, `.env.demo.example`, `init-db.sql`, `README.md`) sang một thư mục riêng bất kỳ, ví dụ `C:\demo-dorm-trading\` (hoặc sang một máy tính khác chỉ cài sẵn Docker Desktop / Docker Engine).

```powershell
# PowerShell (Windows)
cd C:\demo-dorm-trading
Copy-Item .env.demo.example .env
```

```bash
# Bash (Linux / macOS / Git Bash)
cd /path/to/demo-dorm-trading
cp .env.demo.example .env
```

Mở file `.env` và cấu hình theo đúng trường hợp máy demo của bạn:

1. **Tạo `JWT_SECRET` (BẮT BUỘC — file `.env.demo.example` để trống để tránh lộ khóa trong Git):**
   - Linux / macOS / Git Bash:
     ```bash
     openssl rand -base64 48
     ```
   - Windows PowerShell 5.1:
     ```powershell
     $b = New-Object byte[] 48; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
     ```
   Dán chuỗi vừa tạo vào dòng `JWT_SECRET=` trong `.env`.

2. **Điền biến môi trường theo máy demo** *(mọi cổng được Compose bind chặt vào `127.0.0.1`, không phơi ra mạng LAN/Wi-Fi)*:

| Biến môi trường | Máy demo sạch (cổng trống) | Máy bị chiếm cổng `8080` / `9000` (VD: máy dev hiện tại) |
|---|---|---|
| `DOCKERHUB_USERNAME` | `<username-dockerhub-của-bạn>` *(bắt buộc)* | `<username-dockerhub-của-bạn>` *(bắt buộc)* |
| `JWT_SECRET` | `<chuỗi-tạo-ở-trên>` *(bắt buộc)* | `<chuỗi-tạo-ở-trên>` *(bắt buộc)* |
| `IMAGE_TAG` | `latest` | `latest` |
| `ADMIN_WEB_PORT` | `8080` *(mặc định)* | `18080` *(tránh tiến trình `AgentService`)* |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:8080,http://localhost:5173` | `http://localhost:18080,http://localhost:8080,http://localhost:5173` |
| `MINIO_API_PORT` | `9000` *(mặc định)* | `19000` *(tránh tiến trình `stratafs`)* |
| `MINIO_CONSOLE_PORT` | `9001` *(mặc định)* | `19001` |

> [!IMPORTANT]
> **3 quy tắc bắt buộc khi demo:**
> 1. **Luôn mở bằng `http://localhost:<ADMIN_WEB_PORT>`** (tuyệt đối không dùng `http://127.0.0.1:...` hay IP LAN qua HTTP) vì backend cấp refresh cookie `dorm_refresh` với cờ `Secure; HttpOnly; SameSite=Strict` — trình duyệt chỉ coi `localhost` hoặc HTTPS là Secure Context.
> 2. **`JWT_SECRET` phải đủ >= 32 bytes sau giải mã Base64** (`.env.demo.example` cố tình để trống `JWT_SECRET=` nên bắt buộc tự tạo trước khi `up -d`).
> 3. **`CORS_ALLOWED_ORIGINS` phải chứa đúng origin trên thanh địa chỉ trình duyệt** (nếu mở `http://localhost:18080` thì danh sách phải có `http://localhost:18080`), nếu không backend sẽ chặn `403 INVALID_ORIGIN`.

*(Lưu ý: Nếu repository trên Docker Hub bạn đặt chế độ Private, chạy `docker login` trước khi `docker compose pull`. Nếu để Public thì không cần đăng nhập trên máy demo.)*

---

## 3. Kịch bản quay video Demo CD chi tiết (4–6 phút)

### Cảnh 1 — Giới thiệu Pipeline CI → CD & Docker Hub (khoảng 1 phút)

1. Mở file [`.github/workflows/cd.yml`](../../.github/workflows/cd.yml) để chỉ nhanh 4 điểm thiết kế:
   - Tự chạy sau khi workflow `CI` thành công trên `main` (`workflow_run`), kèm `workflow_dispatch` (mặc định `publish_latest = false`; chỉ cho promote `:latest` từ nhánh `main` đã qua `CI` xanh).
   - `permissions: contents: read` tối thiểu (riêng `prepare` thêm `actions: read` để kiểm tra `CI`), toàn bộ action (`checkout`, `setup-buildx`, `login`, `metadata`, `build-push`) đều pin theo **commit SHA** (vượt qua `actionlint` & CodeQL).
   - Build **multi-stage** song song `backend` và `admin-web` với cache Buildx `type=gha` chỉ gắn `:sha-<7-ký-tự>`, sau đó job `promote-latest` (khóa `concurrency` toàn repo) mới gắn `:latest` khi cả hai cùng thành công — tránh lệch phiên bản (split-brain).
   - `admin-web` build sẵn `VITE_API_URL=/api/v1` để đi qua Nginx reverse-proxy cùng origin (có `X-Forwarded-For $remote_addr` + Spring `server.forward-headers-strategy=native` giữ đúng rate-limit theo từng IP thật).
2. Chuyển sang tab **GitHub Actions → CD**: chỉ đồ thị 5 job xanh (`prepare` → `build-backend` + `build-admin-web` → `promote-latest` → `summary`) và bảng **CD Release Summary** ở cuối trang.
3. Chuyển sang tab **Docker Hub**: chỉ 2 image `dorm-trading-backend` và `dorm-trading-admin-web` cùng các tag đã được đẩy lên.

### Cảnh 2 — Deploy trên máy đích không có mã nguồn (khoảng 1 phút)

1. Mở terminal tại thư mục demo độc lập (ví dụ `C:\demo-dorm-trading`), gõ `dir` (hoặc `ls -la`) để chứng minh **chỉ có 4 file cấu hình deploy**, không có mã nguồn Java/React, không cần JDK hay Node:
   - `docker-compose.demo.yml`, `.env.demo.example`, `.env`, `init-db.sql`, `README.md`.
2. Pull ảnh từ Docker Hub và khởi động toàn bộ cụm 5 dịch vụ:
   ```powershell
   docker compose -f docker-compose.demo.yml pull
   docker compose -f docker-compose.demo.yml up -d
   docker compose -f docker-compose.demo.yml ps
   ```
   *(Nói thêm khi chờ ~30 giây: `postgres`, `maildev`, `minio` khởi động trước và có healthcheck thật; khi cả 3 `healthy` thì `backend` mới boot và tự chạy Flyway migration; sau cùng `admin-web` mới lên `healthy`.)*
3. Kiểm tra healthcheck tổng hợp qua Nginx reverse-proxy:
   ```powershell
   # Thay 8080 bằng 18080 nếu bạn đổi ADMIN_WEB_PORT
   curl.exe -i http://localhost:8080/api/v1/health
   ```
   Kết quả kỳ vọng: `HTTP/1.1 200` với JSON `{"status":"UP","service":"dorm-trading-backend",...,"database":"CONNECTED"}`.

### Cảnh 3 — Kiểm chứng Admin Web, Cookie `Secure` qua F5 & Maildev OTP (khoảng 1.5–2 phút)

1. **Tạo nhanh 1 tài khoản quản trị mẫu** trong DB demo vừa khởi tạo (tài khoản đăng ký qua API thật → gửi email OTP thật sang Maildev → cấp quyền `KIEM_DUYET_VIEN` trong PostgreSQL):

   **Windows PowerShell** *(đổi `8080` → `18080` nếu bạn đổi cổng)*:
   ```powershell
   '{"name":"Admin Demo","studentId":"22520001","email":"admin.demo@gm.uit.edu.vn","password":"DormAdmin!2026"}' | curl.exe -sS -X POST http://localhost:8080/api/v1/auth/register -H "Content-Type: application/json" --data-binary "@-"

   docker compose -f docker-compose.demo.yml exec -T postgres psql -U dorm_user -d dorm_trading -c "UPDATE thanh_viens SET email_verified = true, profile_approved = true, trang_thai_tai_khoan = 'HOAT_DONG', diem_uy_tin = 100 WHERE lower(email) = 'admin.demo@gm.uit.edu.vn'; INSERT INTO vai_tro_quan_tri (user_id, loai_vai_tro) SELECT user_id, 'KIEM_DUYET_VIEN' FROM thanh_viens WHERE lower(email) = 'admin.demo@gm.uit.edu.vn';"
   ```

   **Linux / macOS / Git Bash**:
   ```bash
   curl -sS -X POST http://localhost:8080/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"name":"Admin Demo","studentId":"22520001","email":"admin.demo@gm.uit.edu.vn","password":"DormAdmin!2026"}'

   docker compose -f docker-compose.demo.yml exec -T postgres psql -U dorm_user -d dorm_trading -c "UPDATE thanh_viens SET email_verified = true, profile_approved = true, trang_thai_tai_khoan = 'HOAT_DONG', diem_uy_tin = 100 WHERE lower(email) = 'admin.demo@gm.uit.edu.vn'; INSERT INTO vai_tro_quan_tri (user_id, loai_vai_tro) SELECT user_id, 'KIEM_DUYET_VIEN' FROM thanh_viens WHERE lower(email) = 'admin.demo@gm.uit.edu.vn';"
   ```

2. Mở trình duyệt tại **`http://localhost:8080`** (hoặc `http://localhost:18080`), bấm **`F12` → tab Network** (lọc Fetch/XHR).
3. Đăng nhập với:
   - **Email:** `admin.demo@gm.uit.edu.vn`
   - **Mật khẩu:** `DormAdmin!2026`
4. Chỉ cho người xem trong tab Network:
   - Request `POST /api/v1/auth/login` trả **`200 OK`** (không bị `403 INVALID_ORIGIN` nhờ Nginx truyền đúng header `Origin` và cấu hình `CORS_ALLOWED_ORIGINS`).
   - Response Header có `Set-Cookie: dorm_refresh=...; Path=/api/v1/auth/refresh; ...; Secure; HttpOnly; SameSite=Strict`.
5. **Bấm `F5` tải lại trang:**
   - Trong Network thấy `POST /api/v1/auth/refresh` trả **`200 OK`**.
   - Trang vẫn giữ nguyên phiên đăng nhập (`Admin Demo`) — chứng minh cookie `Secure` hoạt động chuẩn qua Nginx reverse-proxy.
6. Mở **`http://localhost:1080` (Maildev)**:
   - Cho xem email OTP `Xác minh đăng ký Dorm Trading` đã gửi tới `admin.demo@gm.uit.edu.vn`.
   - *(Tùy chọn)* Quay lại Admin Web bấm đăng xuất → **Quên mật khẩu** → nhập `admin.demo@gm.uit.edu.vn` → quay lại Maildev thấy ngay email `Đặt lại mật khẩu Dorm Trading`.

### Cảnh 4 — Demo Rollback tức thì trong 5 giây (khoảng 1 phút)

Chuyển `IMAGE_TAG` về một tag `sha-<7-ký-tự-cũ>` lấy từ GitHub Actions Summary hoặc Docker Hub:

```powershell
# Windows PowerShell
$env:IMAGE_TAG = "sha-<7-ký-tự-cũ>"
docker compose -f docker-compose.demo.yml pull
docker compose -f docker-compose.demo.yml up -d
docker compose -f docker-compose.demo.yml ps
curl.exe -i http://localhost:8080/api/v1/health
```

```bash
# Linux / macOS / Git Bash
IMAGE_TAG=sha-<7-ký-tự-cũ> docker compose -f docker-compose.demo.yml pull
IMAGE_TAG=sha-<7-ký-tự-cũ> docker compose -f docker-compose.demo.yml up -d
docker compose -f docker-compose.demo.yml ps
curl -i http://localhost:8080/api/v1/health
```

> **Điểm nhấn khi thuyết minh:** Chỉ thay đổi Container `backend` và `admin-web` sang đúng tag `sha-<cũ>`, toàn bộ dữ liệu PostgreSQL và MinIO trong named volume được giữ nguyên; Nginx cấu hình `resolver 127.0.0.11 valid=10s` nên tự phân giải lại IP mới của `backend` mà **không bị lỗi `502 Bad Gateway`**.

Sau khi quay xong cảnh rollback, đưa lại về `latest` (xóa biến môi trường tạm trong PowerShell bằng `Remove-Item Env:IMAGE_TAG` rồi `up -d`).

### Cảnh 5 — (Tùy chọn) Demo Auto-CD với Watchtower (khoảng 30 giây)

Nếu muốn trình diễn khả năng máy demo tự động kéo bản build mới nhất mà không cần gõ tay:

```bash
docker compose -f docker-compose.demo.yml --profile auto-cd up -d
```

- Watchtower chạy kiểm tra mỗi 15 giây (`--interval 15 --cleanup --label-enable`), chỉ cập nhật các service có nhãn `com.centurylinklabs.watchtower.enable=true` (`backend` và `admin-web`).
- Không ảnh hưởng tới `postgres`, `maildev`, `minio`.

---

## 4. Dọn dẹp sau khi demo

```bash
# Dừng các container nhưng GIỮ LẠI dữ liệu DB / MinIO / ảnh upload
docker compose -f docker-compose.demo.yml --profile auto-cd down

# Dừng và XÓA SẠCH toàn bộ volume dữ liệu demo
docker compose -f docker-compose.demo.yml --profile auto-cd down -v
```

---

## 5. Xử lý sự cố nhanh (Troubleshooting)

| Triệu chứng | Nguyên nhân phổ biến | Cách khắc phục |
|---|---|---|
| Lỗi `ports are not available` / đụng cổng `8080` hoặc `9000` | Tiến trình khác trên máy đang dùng cổng đó (trên Windows dev thường là `AgentService` ở `8080` và `stratafs` ở `9000`). | Sửa `ADMIN_WEB_PORT=18080`, `MINIO_API_PORT=19000`, `MINIO_CONSOLE_PORT=19001` và thêm `http://localhost:18080` vào `CORS_ALLOWED_ORIGINS` trong `.env`, rồi chạy lại `docker compose -f docker-compose.demo.yml up -d`. |
| Đăng nhập trả `403 INVALID_ORIGIN` | Origin trên thanh địa chỉ trình duyệt chưa có trong `CORS_ALLOWED_ORIGINS`. | Đảm bảo `CORS_ALLOWED_ORIGINS` chứa đúng `http://localhost:<ADMIN_WEB_PORT>` (không có dấu `/` ở cuối) và recreate container `backend`. |
| Đăng nhập thành công nhưng bấm `F5` bị văng về màn hình Login | Mở trình duyệt bằng `http://127.0.0.1:...` hoặc IP LAN qua HTTP nên trình duyệt từ chối lưu cookie `Secure`. | Đổi thanh địa chỉ sang **`http://localhost:<ADMIN_WEB_PORT>`**. |
| Container `backend` thoát ngay khi boot (Exit 1) | Thiếu `JWT_SECRET` hoặc chuỗi `JWT_SECRET` giải mã Base64 nhỏ hơn 32 bytes. | Kiểm tra `.env` có `JWT_SECRET`, hoặc tạo mới bằng `openssl rand -base64 48`. |
| `docker compose pull` báo `unauthorized` / `pull access denied` | Sai `DOCKERHUB_USERNAME`, ảnh chưa từng được CD push lên Docker Hub, hoặc repo Docker Hub đang ở chế độ Private. | Kiểm tra đúng tên username chữ thường và tag tồn tại trên Docker Hub; nếu repo Private thì chạy `docker login` trước khi `pull`. |
