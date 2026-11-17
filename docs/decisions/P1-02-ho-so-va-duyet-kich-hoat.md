# P1-02 · Hồ sơ chờ duyệt dạng snapshot, ảnh thẻ trong DB và lớp tải tệp dùng chung

| Mục | Nội dung |
|---|---|
| Ngày | 17/11/2026 |
| Task | P1-02 (UC-02, UC-05, UC-06) |
| Người quyết định | Nguyễn Bảo Việt |
| Liên quan | P1-01 (`auth_challenge`, outbox SMTP, lớp API client), P1-04 (dùng chung DTO hồ sơ), P1-05 (trạng thái khóa) |

## 1. Bản cập nhật hồ sơ lưu ở bảng riêng, không ghi đè `thanh_viens`

**Bối cảnh.** UC-05 nói thay đổi định danh/học tập phải chờ kiểm duyệt, nhưng cũng nói tài khoản đã kích hoạt vẫn dùng được hệ thống. Nếu ghi thẳng vào `thanh_viens` rồi đặt lại `profile_approved=false`, tài khoản mất quyền MEMBER ngay khi sửa hồ sơ — sai với luồng phụ "chỉ đổi số điện thoại thì lưu ngay" và với kỳ vọng không gián đoạn quyền.

**Lựa chọn.** Bảng `ho_so_cap_nhat` giữ một bản chờ duyệt cho mỗi người dùng; `thanh_viens.cho_duyet_lai` đánh dấu có bản chờ. `GET /profile/me` trả giá trị đang chờ (overlay) để người dùng thấy mình vừa gửi gì; quyền và dữ liệu hiệu lực vẫn là bản cũ cho tới khi chấp thuận.

**Phương án đã loại.** (a) Ghi đè trực tiếp + hạ `profile_approved` — mất quyền tạm thời, phải chờ duyệt lại mới dùng được. (b) Lưu lịch sử nhiều bản chờ — không cần: UC chỉ cần bản gửi gần nhất, bản cũ bị thay khi gửi lại.

**Hệ quả.** Cần unique index `uq_ho_so_cap_nhat_mssv` để hai hồ sơ chờ không nhận cùng MSSV; khi duyệt phải xử lý `DataIntegrityViolationException` → 409 `STUDENT_ID_IN_USE` phòng trường hợp tranh chấp với `thanh_viens`.

## 2. Điểm uy tín 100 khởi tạo đúng một lần

**Bối cảnh.** FR-03: kích hoạt khởi tạo 100 điểm. UC-02 cũng cho duyệt bản cập nhật của tài khoản đã kích hoạt; nếu cấp lại 100 điểm mỗi lần duyệt thì người dùng xóa được điểm bị trừ.

**Lựa chọn.** Cột `diem_khoi_tao BOOLEAN`, backfill `TRUE` cho tài khoản đã duyệt. Câu lệnh duyệt dùng `diem_uy_tin = case when diem_khoi_tao then diem_uy_tin else 100 end` và đặt `diem_khoi_tao=true`, nên idempotent cả khi duyệt lặp.

## 3. Ảnh thẻ sinh viên lưu BYTEA, chưa dùng MinIO

**Bối cảnh.** `application.properties` đã có `storage.s3.*` nhưng chưa có hạ tầng MinIO trong compose lẫn CI; P0-03 còn tồn đọng.

**Lựa chọn.** Bảng `the_sinh_viens` giữ ảnh (≤ 5MB, MIME xác định bằng magic bytes), trả qua endpoint có kiểm quyền, `Cache-Control: no-store`.

**Đánh đổi đã chấp nhận.** Ảnh nằm trong DB làm phình bảng và tăng tải backup, đổi lại không phụ thuộc hạ tầng chưa có. Khi MinIO/S3 sẵn sàng: thay cột `noi_dung` bằng `object_key`, giữ nguyên `mime`/`kich_thuoc` và hợp đồng endpoint nên client không phải sửa.

## 4. Đổi email dùng lại `auth_challenge` của P1-01

**Bối cảnh.** UC-06 cần OTP nhưng `auth_challenge.purpose` chỉ cho `REGISTER`,`RESET` và không gắn người dùng.

**Lựa chọn.** V5 mở rộng CHECK thêm `CHANGE_EMAIL` và thêm `user_id`. Dùng lại cooldown, đếm lỗi, HMAC digest và outbox mã hóa sẵn có — không tạo bảng OTP thứ hai. Xác minh bọc advisory lock theo email để hai tài khoản không cùng nhận một email.

**Hệ quả với P1-01.** Thay đổi nằm trong migration mới, không sửa code `AuthService`; `OtpDelivery` chỉ thêm nhánh subject `CHANGE_EMAIL`. Nguyễn Hữu Nguyên review phần này.

## 5. Không dùng `version` từ client để chống duyệt đè

Kế hoạch ban đầu ghi `{version}` cho `approve`/`reject`. Thực tế khóa dòng `thanh_viens` bằng `select ... for update` rồi kiểm lại trạng thái chờ trong cùng transaction; kiểm duyệt viên thua nhận 409. Bỏ tham số `version` khỏi hợp đồng để client không phải giữ trạng thái, hành vi chống đè vẫn đúng và đã có test đồng thời.

## 6. Tải ảnh thẻ qua lớp client dùng chung, không `fetch` trong module nghiệp vụ

**Bối cảnh.** Hai màn cần tải ảnh thẻ dạng nhị phân có kiểm quyền (`/profile/student-cards/{id}`, `/admin/profiles/{id}/student-card`). Gọi `fetch` thẳng trong module `profile` sẽ bỏ qua bearer token, refresh single-flight và xử lý lỗi chung của P1-01.

**Lựa chọn.** Thêm `attachment(path)` vào `mobile/src/api/client.ts` và `admin-web/src/api/client.ts`: trả `null` khi 404 (hồ sơ không có ảnh), trả bytes/blob khi 200, ném `ApiError` khi lỗi khác; web thử refresh một lần khi 401. `cardUri`/`cardUrl` trong module `profile` chỉ chuyển kết quả thành `data:` URI hoặc `ObjectURL`.

**Hệ quả.** Ảnh không bị tải lại khi token hết hạn giữa phiên; đổi cách lưu ảnh sang MinIO sau này chỉ cần sửa một hàm.

## 7. 409 khi duyệt: tải lại trước, báo lỗi sau

**Bối cảnh.** `load()` của trang chi tiết xóa thông báo lỗi cũ để tránh hiển thị lỗi cũ; nếu đặt thông báo 409 trước khi `await load()` thì thông báo bị xóa ngay.

**Lựa chọn.** Khi nhận 409, `await load()` rồi mới đặt thông báo "Trạng thái hồ sơ đã thay đổi, đang tải lại thông tin mới nhất." Người dùng thấy dữ liệu mới và lời giải thích cùng lúc. Test `reports a stale profile on approve 409 and reloads it` giữ hành vi này.
