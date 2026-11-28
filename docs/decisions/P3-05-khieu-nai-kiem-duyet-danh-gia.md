# Quyết định kỹ thuật P3-05 · Khiếu nại & Kiểm duyệt Đánh giá

- **Mã task:** P3-05 (`UC-33`, `UC-34`)
- **Điều khoản tham chiếu:** `FR-10`, `FR-12`, `NFR-01`, `NFR-03`
- **Ngày chốt:** 28/11/2026

## 1. Mở rộng `danh_gias`, `khieu_nais`, `quyet_dinhs` qua migration `V14` tương thích ngược

- **Lựa chọn:** Thêm các cột nullable/DEFAULT vào `danh_gias` (`thoi_diem_cong_khai`, `nguoi_xet_id`, `can_cu_xet`, `diem_tac_dong`, `khoa_chinh_sua`, `yeu_cau_bo_sung_trang_thai`), `khieu_nais` (`ma_ly_do`, `mo_ta`, `phien_ban_danh_gia`, `noi_dung_danh_gia_snapshot`, `client_request_id`, `ket_luan`, `can_cu_xu_ly`, `nguoi_xu_ly_id`, `thoi_diem_xu_ly`, `thoi_diem_rut`, `version`) và `quyet_dinhs` (`ma_danh_gia`, `diem_tac_dong`), cùng 3 bảng phụ trợ (`danh_gia_bang_chungs`, `yeu_cau_bo_sung_danh_gia`, `thong_bao_danh_gias`).
- **Lý do:** Hoạt động độc lập trên schema `V1`–`V13` mà không phụ thuộc `P3-04` đã merge hay chưa; khi `P3-04` triển khai `UC-30`/`UC-31`/`UC-32`, chỉ cần đọc `danh_gias.khoa_chinh_sua` (chặn sửa/xóa khi có khiếu nại chờ xử lý) và ghi `thoi_diem_cong_khai` + `diem_tac_dong`.
- **Tác động:** Unique index `uq_khieu_nais_ma_danh_gia` bảo đảm mỗi đánh giá chỉ có tối đa một khiếu nại (kể cả sau khi rút theo `UC-33 §3.2`). Unique index `uq_khieu_nais_seller_client_req` bảo đảm idempotency khi bấm gửi lặp/retry mạng (`UC-33 §4`, `NFR-03`).

## 2. Áp dụng và đảo điểm uy tín qua `ReputationLedgerService` (`FR-10`, `FR-12`, `NFR-03`)

- **Lựa chọn:** Tái sử dụng trực tiếp `ReputationLedgerService.recordScoreChange(...)` với:
  - Duyệt đánh giá 1–3 sao (`UC-34 §3.2`): `CHANGE_TRANSACTION_REVIEW` (`DANH_GIA_GIAO_DICH`), điểm chuẩn `FR-10` (`3 sao → -1`, `2 sao → -3`, `1 sao → -5`), `idempotencyKey = "REVIEW_APPROVAL:" + reviewId`, tự kích hoạt ngưỡng khóa `FR-12` (`30 < điểm ≤ 50` khóa tạm 14 ngày; `điểm ≤ 30` khóa vĩnh viễn).
  - Chấp nhận khiếu nại (`UC-34 §3.1`): `CHANGE_COMPLAINT_RESTORE` (`KHIEU_NAI_HOAN_DIEM`), đảo ngược đúng khoản `diem_tac_dong` đã ghi (`reversalDelta = -originalDelta`), `idempotencyKey = "COMPLAINT_REVERSAL:" + complaintId`.
- **Lý do:** Đảm bảo mọi biến động điểm đều nguyên tử, truy vết đầy đủ trong `lich_su_diem_uy_tin` và không bao giờ trừ hoặc hoàn điểm hai lần ngay cả khi hai Kiểm duyệt viên thao tác đồng thời (`NFR-03`).
- **Tác động:** Sau khi đảo điểm tăng lên, `reviewRestrictionAfterReversal(...)` kiểm tra nhật ký khóa tự động gần nhất trong `nhat_ky_kiem_duyet`; **chỉ** khi trạng thái `BI_KHOA` phát sinh trực tiếp từ chính đánh giá vừa gỡ (`details->>'referenceId' = reviewId`), hệ thống mới tự mở khóa (`score > 50`) hoặc hạ từ khóa vĩnh viễn xuống khóa tạm 14 ngày (`30 < score ≤ 50`). Các khoản xử phạt từ báo cáo vi phạm (`UC-37`) hoàn toàn độc lập và không bị ảnh hưởng (`UC-34 §4`).

## 3. Phân quyền bằng chứng riêng tư & tách biệt Kiểm duyệt viên (`NFR-01`, `UC-34 §4`)

- **Lựa chọn:** Tách kho lưu ảnh bằng chứng khiếu nại sang `app.reviews.evidence-dir` (`LocalReviewEvidenceStorage`), tái sử dụng `MediaMagicBytes`/`MediaImageSanitizer` gỡ EXIF/GPS/XMP, chụp bất biến nhật ký chat dạng JSONB và chỉ mở qua `GET /api/v1/admin/review-moderation/evidence/{id}` (bảo vệ bởi `/api/v1/admin/**` → `ROLE_MODERATOR` phiên `admin-web`, gồm `SENIOR_ADMIN`).
- **Lý do:** Đáp ứng `UC-33 §4`, `UC-34 §4` và `NFR-01`. Đồng thời ẩn khỏi hàng chờ và chặn `403 CONFLICT_OF_INTEREST` mọi hồ sơ mà Kiểm duyệt viên là người mua hoặc người bán; chặn `403 PRIOR_REVIEWER_CONFLICT` khi Kiểm duyệt viên đã xét đánh giá 1–3 sao trước đó định xét khiếu nại cùng đánh giá (nếu hệ thống chỉ còn duy nhất Kiểm duyệt viên đó hiệu lực thì cho phép và ghi nhận tình huống vào căn cứ quyết định theo đúng `UC-34 §4`).
- **Tác động:** Trên `admin-web`, nút kết luận bị khóa cho tới khi toàn bộ bằng chứng của hồ sơ tải thành công (`UC-34 §3.3`), kèm nút **Tải lại bằng chứng** khi gặp lỗi tải.
