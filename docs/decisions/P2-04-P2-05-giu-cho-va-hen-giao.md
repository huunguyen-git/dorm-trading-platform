# P2-04, P2-05 · Giữ chỗ nguyên tử, hẹn lịch giao nhận hai bên và thông báo bắt đầu giao

Ngày: **25/11/2026** · Trạng thái: **Đã triển khai và kiểm chứng tự động (Chờ review)** trên nhánh `feat/p2-04-p2-05-order-reservation` (tách từ `origin/feat/p2-01-p2-02-listings-discovery`).

## Bối cảnh và căn cứ

Hai tác vụ `P2-04` ([UC-22](../use-cases/UC-22.md), [UC-23](../use-cases/UC-23.md), [UC-24](../use-cases/UC-24.md)) và `P2-05` ([UC-25](../use-cases/UC-25.md), [UC-26](../use-cases/UC-26.md)) xây dựng lõi module `order` trên nền định danh (`P1-01`), kho đồ vật (`P1-03`), khóa tài khoản theo uy tín (`P1-05`) và tin đăng / tìm kiếm (`P2-01`, `P2-02`).

Các yêu cầu cốt lõi bắt buộc:
- [FR-04](../03-requirements.md#fr-04--kho-cá-nhân-và-tin-lẻcombo), [FR-07](../03-requirements.md#fr-07--thương-lượng-giá), [FR-08](../03-requirements.md#fr-08--giữ-chỗ-và-hủy-giữ-chỗ): gửi yêu cầu đặt hàng chưa tự giữ hàng; chỉ khi người bán chấp nhận mới giữ tin và toàn bộ đồ vật thành phần (combo giữ nguyên bộ); tối đa một giữ hiệu lực trên mỗi tin và trên mỗi đồ vật; người mua không bị giới hạn số giữ; không tự hủy giữ chỗ sau 24 giờ.
- [FR-09](../03-requirements.md#fr-09--bàn-giao-và-xác-nhận-hoàn-tất): phân biệt tuyệt đối giữa **thông báo bắt đầu giao hàng** (`UC-26`, `DANG_GIAO`, chưa có ảnh/OTP, vẫn hủy được theo `UC-24`) và **báo đã giao kèm ảnh bàn giao + OTP 6 số** (`UC-27`, `CHO_XAC_NHAN`, phải đi qua `UC-28` nếu muốn hủy).
- [NFR-01](../03-requirements.md#nfr-01--quyền-truy-cập-dữ-liệu): giới hạn truy cập dữ liệu giao dịch và lịch hẹn cho đúng hai bên tham gia; Zero-PII trong DTO đối tác.
- [NFR-02](../03-requirements.md#nfr-02--giữ-chỗ-và-hạn-mức-khi-có-thao-tác-đồng-thời): hai lượt chấp nhận cạnh tranh trên cùng tin hoặc hai tin dùng chung đồ vật chỉ được tạo tối đa một giữ chỗ hợp lệ, không giữ một phần combo và không deadlock với `catalog`/`iam`.
- [NFR-03](../03-requirements.md#nfr-03--gửi-lại-yêu-cầu-và-tính-điểm-một-lần): gửi lại thao tác chấp nhận (`UC-23 E4`), hủy đã hủy (`UC-24 E2`) và bắt đầu giao (`UC-26 A2`) phải lũy đẳng.

## Quyết định kỹ thuật

### 1. Phòng vệ hai lớp cho bất biến giữ chỗ (`FR-08`, `NFR-02`) và thứ tự khóa chống deadlock
- **Vấn đề**: Một đồ vật (`do_vats`) có thể tham gia đồng thời nhiều tin lẻ/combo của cùng một người bán. Cần bảo đảm tuyệt đối không xảy ra bán/giữ trùng kể cả dưới tải đồng thời cao, đồng thời không phát sinh deadlock với `ListingService` (`P2-01`) và `InventoryService` (`P1-03`).
- **Quyết định**:
  1. **Lớp ứng dụng (Pessimistic Locking theo thứ tự toàn cục)**: Mọi thao tác ghi trong `OrderService` (`accept`, `cancel`, `startDelivery`) tuân thủ nghiêm ngặt thứ tự khóa tương thích với `P2-01`:
     `thanh_viens (nguoi_ban_id)` → `tin_dangs (ma_tin)` → `giao_dichs (ma_giao_dich)` → `do_vats (ORDER BY ma_vat ASC)`.
     (Riêng `createReservationRequest` chỉ đọc trạng thái người mua rồi khóa `tin_dangs` → `do_vats ORDER BY ma_vat ASC`, không bao giờ khóa ngược chiều.)
  2. **Lớp cơ sở dữ liệu (`V7` Partial Unique Indexes)**:
     - `uq_giao_dichs_active_listing ON giao_dichs(ma_tin) WHERE trang_thai IN ('GIU_CHO', 'DANG_GIAO', 'CHO_XAC_NHAN', 'CHO_XU_LY')` — bảo đảm tối đa 1 giữ chỗ hiệu lực/tin.
     - Bảng `giao_dich_do_vat(ma_giao_dich, ma_vat, giu_hieu_luc)` kèm `uq_giao_dich_do_vat_active_item ON giao_dich_do_vat(ma_vat) WHERE giu_hieu_luc = TRUE` — bảo đảm tối đa 1 giữ chỗ hiệu lực/đồ vật ở cấp PostgreSQL và lưu snapshot chính xác các đồ vật mà giao dịch đã khóa để `UC-24` giải phóng an toàn.
     - `uq_giao_dichs_pending_buyer_listing ON giao_dichs(ma_tin, nguoi_mua_id) WHERE trang_thai = 'YEU_CAU'` — ngăn nhấn đúp tạo nhiều yêu cầu trùng trên cùng một tin trong khi vẫn cho phép người mua gửi không giới hạn yêu cầu trên các tin khác nhau.

### 2. Tách biệt rạch ròi `thoi_diem_bat_dau_giao` (`UC-26`) và `thoi_diem_bao_giao` (`UC-27`)
- Bổ sung cột `thoi_diem_bat_dau_giao TIMESTAMPTZ` trên `giao_dichs` trong `V7`, giữ nguyên `thoi_diem_bao_giao` và `anh_ban_giao` cho `P3-02` (`UC-27`).
- `UC-24` kiểm tra `trang_thai IN ('CHO_XAC_NHAN', 'CHO_XU_LY') OR thoi_diem_bao_giao IS NOT NULL` để từ chối bằng `409 POST_DELIVERY_CANCELLATION_REQUIRED` và hướng sang `UC-28`; ngược lại khi mới ở `DANG_GIAO` (`thoi_diem_bao_giao IS NULL`), `UC-24` vẫn cho phép hủy hợp lệ theo `UC-24 A3`.

### 3. Đề xuất & xác nhận lịch hẹn hai bên (`lich_hen_giao_dichs`, `UC-25`)
- Tách bảng `lich_hen_giao_dichs` lưu toàn bộ đề xuất (`CHO_XAC_NHAN`, `DA_XAC_NHAN`, `TU_CHOI`, `DA_THAY_THE`).
- Đề xuất từ một bên (kể cả lịch dự kiến người mua gửi ở `UC-22`) **không bao giờ** tự đánh dấu `lich_hen_da_xac_nhan = TRUE`. Chỉ khi **bên còn lại** gọi `POST /orders/{id}/schedules/{proposalId}/confirm` trên đúng đề xuất đang `CHO_XAC_NHAN`, lịch chung mới được ghi nhận vào `giao_dichs.thoi_gian_hen` / `dia_diem_hen` / `lich_hen_da_xac_nhan = TRUE`.
- Khi đổi lịch (`UC-25 A3`, `UC-26 A3`), lịch đã thống nhất trước đó được bảo toàn cho đến khi đề xuất mới được hai bên đồng ý.

### 4. Hộp thông báo trong ứng dụng (`thong_baos`) và consumer sự kiện `P2-01`
- Bổ sung bảng `thong_baos` phục vụ thông báo theo giao dịch (`UC-22`–`UC-26`) và gắn `@EventListener` cho `ListingUpdatedWithPendingRequestsEvent` do `ListingService` phát ra khi người bán sửa tin đang có `YEU_CAU`.

## Tác động lên các task tiếp theo

- **`P2-03` (Chat & thương lượng giá — `UC-21`)**: khi hai bên chốt giá thương lượng, client chỉ cần truyền `agreedPriceVnd` sang `ReservationRequestScreen` (`POST /api/v1/orders`).
- **`P3-02` (Hoàn tất giao dịch OTP & hủy sau báo giao — `UC-27`, `UC-28`)**: kế thừa trạng thái `DANG_GIAO`, `thoi_diem_bat_dau_giao`, bảng snapshot `giao_dich_do_vat` và cột `thoi_diem_bao_giao` / `anh_ban_giao` đã phân tách sẵn; khi hoàn tất (`HOAN_TAT`), chuyển `do_vats.trang_thai = 'DA_CHUYEN_GIAO'`, `tin_dangs.trang_thai = 'KET_THUC'` và đặt `giao_dich_do_vat.giu_hieu_luc = FALSE`.
- **`P4-03` (k6 load test & PIT mutation test)**: bộ `OrderConcurrencyTest` và `OrderService` là mục tiêu trực tiếp cho kiểm thử tải giữ chỗ đồng thời và mutation testing module `order`.
