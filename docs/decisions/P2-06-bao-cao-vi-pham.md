# Quyết định kỹ thuật P2-06 · Báo cáo Người dùng & Báo cáo Tin đăng

- **Mã task:** P2-06 (`UC-35`, `UC-36`)
- **Điều khoản tham chiếu:** `FR-11`, `FR-05`, `NFR-01`, `NFR-03`
- **Ngày chốt:** 28/11/2026

## 1. Tách riêng bảng nhóm báo cáo (`nhom_bao_caos`) và giữ tương thích ngược `bao_caos`

- **Lựa chọn:** Tạo bảng `nhom_bao_caos` gom báo cáo theo `(loai_doi_tuong, doi_tuong_id, danh_muc_vi_pham)` với partial unique index `uq_nhom_bao_caos_open` khi `trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY')`; bổ sung cột nullable `ma_nhom_bao_cao` và `client_request_id` vào `bao_caos` (migration `V13`).
- **Lý do:** Đáp ứng yêu cầu gom nhóm tự động của `UC-35`, `UC-36` và danh sách chờ nhóm báo cáo của `UC-37` (`P3-06`) để mỗi nhóm chỉ bị xử phạt một lần (`FR-11`), đồng thời giữ tương thích 100% với schema `V1`/`V6` và các integration test hiện có của `P1-06`.
- **Tác động:** `GovernanceService.revoke(...)` đồng thời trả cả `bao_caos` và `nhom_bao_caos` đang `DANG_XU_LY` về `CHO_XU_LY`. Khi nhóm đã `DA_XU_LY`, vi phạm mới cùng đối tượng/danh mục sẽ mở một nhóm chờ xử lý mới.

## 2. Lưu trữ bằng chứng báo cáo tách biệt hoàn toàn với media công khai (`NFR-01`)

- **Lựa chọn:** Không dùng `/api/v1/media/images` cho ảnh bằng chứng báo cáo; tạo bảng riêng `bao_cao_bang_chungs` và lưu file tại thư mục riêng `app.reports.evidence-dir` (qua `ReportEvidenceStorage` / `LocalReportEvidenceStorage`), tái sử dụng `MediaMagicBytes` và `MediaImageSanitizer` để xác thực magic bytes và gỡ toàn bộ EXIF/GPS/XMP.
- **Lý do:** `UC-35 §4`, `UC-36 §4` và `NFR-01` quy định nghiêm ngặt bằng chứng và nhật ký chat chỉ Kiểm duyệt viên và Quản trị viên cấp cao được truy cập. API tải bằng chứng đặt tại `GET /api/v1/admin/reports/evidence/{id}` (bảo vệ bởi `/api/v1/admin/**` → `ROLE_MODERATOR` trên phiên `admin-web`, bao gồm cả `SENIOR_ADMIN`), từ chối guest (`401`), thành viên thường kể cả người báo cáo và người bị báo cáo (`403`), phiên mobile (`403`), và chặn xung đột lợi ích (`403 CONFLICT_OF_INTEREST`) theo `UC-37 §4`.
- **Tác động:** Endpoint tải ảnh bằng chứng (`POST /api/v1/reports/evidence`) chỉ trả về `id` và metadata, không phát URL công khai; mobile hiển thị preview bằng `localUri` cục bộ trước khi gửi.

## 3. Chụp bất biến nhật ký chat (`NHAT_KY_CHAT`) trên schema `V1`

- **Lựa chọn:** Cho phép người dùng chọn cuộc hội thoại và tối đa 30 tin nhắn từ `hoi_thoais` / `tin_nhans` (chỉ đọc các cột đã có từ `V1`), kiểm tra quyền thành viên hội thoại và khớp đúng đối tượng bị báo cáo, sau đó chụp thành JSONB bất biến trong `bao_cao_bang_chungs`.
- **Lý do:** Hoạt động độc lập trên `main` hiện tại và tương thích liền mạch sau khi `P2-03` merge; đồng thời bảo toàn nguyên vẹn bằng chứng chat cho `UC-37` ngay cả khi tin đăng bị xóa (`ma_tin SET NULL`).
- **Tác động:** `ReportScreen` nhận thêm tham số tùy chọn `conversationId` để màn hình chat (`P2-03`) có thể nối trực tiếp luồng thay thế `UC-35 §3.2` / `UC-36 §3.2`.

## 4. Đồng thời, chống trùng và idempotency khi gửi lặp (`NFR-03`)

- **Lựa chọn:** Kết hợp `pg_advisory_xact_lock` theo thứ tự cố định (`report:grp:...` → `report:req:...`) với hai partial unique index: `uq_bao_caos_active_reporter_target_category` (chặn báo cáo trùng khi đang mở → `409 DUPLICATE_REPORT`) và `uq_bao_caos_reporter_client_req` (replay cùng `clientRequestId` và cùng đối tượng/danh mục trả `200 OK` với `idempotentReplay = true`; tái sử dụng cho đối tượng khác trả `409 CLIENT_REQUEST_ID_CONFLICT`).
- **Lý do:** Đảm bảo bấm gửi lặp/retry mạng chỉ tạo đúng một báo cáo (`UC-35 §4`, `UC-36 §4`, `NFR-03`) và nhiều người cùng báo cáo đồng thời vẫn gom gọn vào đúng một nhóm.
- **Tác động:** Mobile sinh `clientRequestId` ổn định cho mỗi phiên lập báo cáo và giữ nguyên dữ liệu nhập khi gặp lỗi mạng/5xx để người dùng bấm gửi lại an toàn.

## 5. Điều kiện mô tả và/hoặc bằng chứng (`UC-35/36` vs `FR-11`)

- **Lựa chọn:** Áp dụng đúng đặc tả `UC-35 §3.3` và `UC-36 §3.3`: yêu cầu có ít nhất **một trong hai** — mô tả không rỗng (tối đa 2.000 ký tự) hoặc ít nhất một bằng chứng (ảnh bằng chứng hoặc nhật ký chat).
- **Lý do:** `UC-36 §4` ghi nhận rõ đây là quy tắc nới so với `FR-11`/GL-12 ("bắt buộc có bằng chứng") và cần xác nhận/CR ở cấp nhóm. Nếu nhóm chốt siết bắt buộc có bằng chứng ở mọi báo cáo, chỉ cần đổi một điều kiện kiểm tra trong `ReportService.submitReport` và `ReportScreen.handleSubmit`.
