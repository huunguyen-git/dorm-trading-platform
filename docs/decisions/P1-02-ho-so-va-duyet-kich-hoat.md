# P1-02 · Hồ sơ chờ duyệt dạng snapshot, ảnh thẻ ở object storage và lớp tải tệp dùng chung

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

## 3. Ảnh thẻ sinh viên lưu object storage, có công tắc `local`/`s3`

**Bối cảnh.** NFR-01 yêu cầu xác định nơi lưu ảnh thẻ trước khi dùng dữ liệu thật; `docs/architecture/README.md` §4 quy định ảnh hạn chế nằm ở object storage riêng và chỉ đọc qua endpoint có kiểm quyền. Bản đầu của P1-02 lưu `BYTEA` trong `the_sinh_viens` với lý do "chưa có hạ tầng MinIO trong compose lẫn CI" — tiền đề này không còn đúng: `docker-compose.yml` đã có service `minio` và `application.properties` đã có `storage.s3.*`.

**Lựa chọn.** Ảnh thẻ lưu ngoài Postgres, sau interface `CardStorage`. Công tắc `storage.backend` chọn backend:

- `local` (mặc định, `matchIfMissing`): ghi thư mục `storage.local.dir` (`.local/student-cards`, đã nằm trong `.gitignore`). Dev/test không cần chạy MinIO, CI không cần thêm service.
- `s3`: `S3CardStorage` dùng MinIO client với `storage.s3.*` sẵn có, tự tạo bucket `student-cards` khi chưa có.

Key do server sinh dạng `<userId>/<uuid>.<ext>`; `LocalCardStorage` kiểm tra lại key bằng regex để chặn path traversal nếu dữ liệu DB bị sửa.

**Hệ quả.** Migration `V8__student_card_object_storage.sql` tạo lại `the_sinh_viens(object_key, mime, kich_thuoc, uploaded_at)` và bỏ `noi_dung` (không chuyển được BYTEA sang object storage bằng SQL, chưa có dữ liệu thật). Hợp đồng `GET /api/v1/profile/student-cards/{ownerId}` và `GET /api/v1/admin/profiles/{userId}/student-card` giữ nguyên bytes + MIME + `Cache-Control: no-store` nên `mobile/` và `admin-web/` không phải sửa.

**ponytail:** nhánh `s3` chưa có test tự động (chỉ smoke tay khi bật `STORAGE_BACKEND=s3`); thêm Testcontainers MinIO khi CI cần kiểm chứng đường object storage.

## 4. Đổi email dùng lại `auth_challenge` của P1-01

**Bối cảnh.** UC-06 cần OTP nhưng `auth_challenge.purpose` chỉ cho `REGISTER`,`RESET` và không gắn người dùng.

**Lựa chọn.** V6 (đổi từ V5 để không trùng `V5__user_management_and_reputation_ledger` của P1-04/P1-05) mở rộng CHECK thêm `CHANGE_EMAIL` và thêm `user_id`. Dùng lại cooldown, đếm lỗi, HMAC digest và outbox mã hóa sẵn có — không tạo bảng OTP thứ hai. Xác minh bọc advisory lock theo email để hai tài khoản không cùng nhận một email.

**Hệ quả với P1-01.** Thay đổi nằm trong migration mới, không sửa code `AuthService`; `OtpDelivery` chỉ thêm nhánh subject `CHANGE_EMAIL`. Nguyễn Hữu Nguyên review phần này.

## 5. `expectedVersion` từ client cho `approve`/`reject`

**Bối cảnh.** Kế hoạch ban đầu bỏ `version` vì cho rằng khóa dòng `thanh_viens` bằng `select ... for update` là đủ. Không đủ: khóa chỉ chống hai kiểm duyệt viên duyệt cùng lúc, không chống trường hợp người dùng sửa hồ sơ **sau khi** kiểm duyệt viên đã đọc nội dung. Kiểm duyệt viên sẽ duyệt một bản chờ duyệt khác với bản mình đã xem trên màn hình.

**Lựa chọn.** Thêm `version` vào DTO hồ sơ (lấy từ `thanh_viens.version`) và `expectedVersion` tuỳ chọn vào **query param** của `approve`/`reject`. Lệch phiên bản → 409 `PROFILE_CHANGED` với thông điệp "Hồ sơ đã thay đổi sau khi bạn xem…". `expectedVersion = null` giữ tương thích với client cũ và test hiện có. Mã lỗi tách khỏi `PROFILE_ALREADY_HANDLED` để web hiện hai lời giải thích khác nhau.

**Vì sao query param, không phải body.** `approve` không cần body. Đặt `@RequestBody(required = false)` khiến client POST không body (RestAssured, curl, health-check) bị Spring ném `HttpMediaTypeNotSupportedException` vì Content-Type mặc định là `application/x-www-form-urlencoded`. Query param giữ `approve` là POST không body, còn `reject` vẫn nhận `{reason}` trong body.

## 5a. `/error` phải `permitAll()`

`anyRequest().denyAll()` chặn cả forward nội bộ sang `/error`, nên mọi lỗi 4xx/5xx thật (415, 400, 500) đều bị trả về **403** và che mất nguyên nhân. Thêm `requestMatchers("/error").permitAll()` trước các rule khác. Không có dòng này thì test nào assert 4xx cụ thể cũng có thể "đỏ" vì lý do sai.

**Hệ quả.** Vẫn giữ `for update` cho trường hợp đồng thời. Admin-web gửi `profile.version` của bản đã render; 409 `PROFILE_CHANGED` thì tải lại và **vẫn cho quyết định** (hồ sơ còn `CHO_DUYET`), khác 409 `PROFILE_ALREADY_HANDLED` (đã xử lý, khoá nút).

## 5b. Bỏ `PATCH /api/v1/auth/profile`

**Bối cảnh.** Route cũ cho phép đổi `ho_ten` trực tiếp, bỏ qua bước duyệt, trong khi UC-05 yêu cầu mọi thay đổi định danh phải qua kiểm duyệt.

**Lựa chọn.** Xoá route, `AuthService.updateProfile` và validate `INVALID_PROFILE_FIELDS`. Mọi thay đổi hồ sơ đi qua `PATCH /api/v1/profile/me`. Test `ApiSecurityTest` khẳng định route cũ trả 404/405 và `ho_ten` không đổi.

## 5c. Bản chờ duyệt là nguồn sự thật khi đọc hàng đợi

**Bối cảnh.** `pending()` đọc thẳng `thanh_viens` nên kiểm duyệt viên thấy giá trị **hiện tại** chứ không phải giá trị người dùng vừa gửi, và `view()` trộn bản chờ duyệt với cột NOT NULL của `thanh_viens`, làm mất giá trị `null` hợp lệ khi người dùng xoá trắng một trường.

**Lựa chọn.** `pending()` dùng `left join ho_so_cap_nhat` + `coalesce` cho các trường định danh. `view()` đọc `trang_thai_sv` từ bản chờ duyệt, `null` thì rơi về cột live (vì cột live NOT NULL). Gửi lại đúng giá trị đang hiệu lực → xoá `ho_so_cap_nhat`, đưa hồ sơ về `DA_DUYET` thay vì để hàng đợi chứa bản trùng.

## 5d. `trang_thai_sv` trong bản chờ duyệt bằng migration V11

**Bối cảnh.** `thanh_viens.trang_thai_sv` là NOT NULL, nên không biểu diễn được "người dùng xoá trắng" và không lưu được giá trị chờ duyệt tách khỏi giá trị đang hiệu lực.

**Lựa chọn.** `V11__pending_study_status.sql` thêm `ho_so_cap_nhat.trang_thai_sv VARCHAR(50)` với CHECK cho phép NULL hoặc `DANG_HOC`/`DA_TOT_NGHIEP`. Duyệt thì `coalesce(p.trang_thai_sv, v.trang_thai_sv)`. Giá trị lạ → 400 `INVALID_INPUT` tại service.

**Hệ quả.** Giá trị đang hiệu lực không đổi cho tới khi duyệt, kể cả khi tài khoản đã `HOAT_DONG`.

## 6. Tải ảnh thẻ qua lớp client dùng chung, không `fetch` trong module nghiệp vụ

**Bối cảnh.** Hai màn cần tải ảnh thẻ dạng nhị phân có kiểm quyền (`/profile/student-cards/{id}`, `/admin/profiles/{id}/student-card`). Gọi `fetch` thẳng trong module `profile` sẽ bỏ qua bearer token, refresh single-flight và xử lý lỗi chung của P1-01.

**Lựa chọn.** Thêm `attachment(path)` vào `mobile/src/api/client.ts` và `admin-web/src/api/client.ts`: trả `null` khi 404 (hồ sơ không có ảnh), trả bytes/blob khi 200, ném `ApiError` khi lỗi khác; web thử refresh một lần khi 401. `cardUri`/`cardUrl` trong module `profile` chỉ chuyển kết quả thành `data:` URI hoặc `ObjectURL`.

**Hệ quả.** Ảnh không bị tải lại khi token hết hạn giữa phiên; đổi cách lưu ảnh sang MinIO sau này chỉ cần sửa một hàm.

## 7. 409 khi duyệt: tải lại trước, báo lỗi sau

**Bối cảnh.** `load()` của trang chi tiết xóa thông báo lỗi cũ để tránh hiển thị lỗi cũ; nếu đặt thông báo 409 trước khi `await load()` thì thông báo bị xóa ngay.

**Lựa chọn.** Khi nhận 409, `await load()` rồi mới đặt thông báo "Trạng thái hồ sơ đã thay đổi, đang tải lại thông tin mới nhất." Người dùng thấy dữ liệu mới và lời giải thích cùng lúc. Test `reports a stale profile on approve 409 and reloads it` giữ hành vi này.

## 8. Chỉnh index hàng đợi duyệt bằng migration V9, không sửa V7/V8

**Bối cảnh.** Review PR #25 chỉ ra partial index `idx_thanh_viens_cho_duyet` của V7 không khớp vị từ thật của `ProfileService.pending()` (thiếu `cho_duyet_lai`), và `auth_challenge` thiếu index theo `user_id` cho truy vấn đổi email. Sửa thẳng V7/V8 là sai: hai migration đó đã áp dụng ở môi trường dev/CI và checksum Flyway sẽ lệch; PR #33/#34 cũng đang giữ V7/V8 ở nhánh của họ.

**Lựa chọn.** Thêm `V9__profile_review_queue_indexes.sql`: `DROP INDEX IF EXISTS` index cũ rồi tạo lại đúng vị từ (`email_verified AND ly_do_tu_choi IS NULL AND (NOT profile_approved OR cho_duyet_lai)`), kèm `CREATE INDEX IF NOT EXISTS idx_auth_challenge_user ON auth_challenge(user_id)`. V7/V8 giữ nguyên byte-for-byte.

**Hệ quả.** PR #25 không còn phụ thuộc thứ tự merge với #33/#34 ở V7/V8; nếu #33/#34 lên trước thì chúng nhận V10/V11. Index bán phần chỉ chứa hàng đợi thật nên giữ nhỏ khi `thanh_viens` lớn dần.
