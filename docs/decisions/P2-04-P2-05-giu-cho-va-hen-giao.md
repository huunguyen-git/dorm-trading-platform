# P2-04, P2-05 · Giữ chỗ nguyên tử, hẹn lịch giao nhận hai bên và thông báo bắt đầu giao

Ngày: **25–26/11/2026** · Trạng thái: **Đã triển khai, xử lý review PR #34 và kiểm chứng tự động (Chờ review)** trên nhánh `feat/p2-04-p2-05-order-reservation` (xếp chồng trên `origin/feat/p2-01-p2-02-listings-discovery` `V6` cho đến khi PR #33 merge vào `main`; đã đánh số sẵn migration `V10` để chừa `V7–V9` cho các PR song song).

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
  1. **Lớp ứng dụng (Pessimistic Locking `FOR NO KEY UPDATE` / `FOR KEY SHARE` theo thứ tự toàn cục chống AB-BA deadlock PG16)**:
     - Mọi thao tác ghi trong `OrderService` (`accept`, `reject`, `cancel`, `startDelivery`, `scheduleOps`) sử dụng **`FOR NO KEY UPDATE`** thay cho `FOR UPDATE` trên `thanh_viens`, `tin_dangs`, `giao_dichs`, `lich_hen_giao_dichs`, `do_vats` theo đúng thứ tự toàn cục:
       `thanh_viens (UUID tăng dần khi chạm cả người mua và người bán)` → `tin_dangs (ma_tin)` → `giao_dichs (ma_giao_dich)` → `do_vats (ORDER BY ma_vat ASC)`.
     - Lý do (fix review PR #34 #2): trên PostgreSQL 16, `INSERT INTO giao_dichs` / `INSERT INTO thong_baos` tự động lấy khóa khóa ngoại **`FOR KEY SHARE`** trên `thanh_viens` và `tin_dangs`, vốn **xung đột** với `FOR UPDATE` nhưng **tương thích** với `FOR NO KEY UPDATE`. Riêng `createReservationRequest` lấy **`FOR KEY SHARE`** trên `thanh_viens(buyer, seller)` theo thứ tự UUID tăng dần **trước** khi khóa `tin_dangs` để đồng nhất thứ tự khóa với `ListingService.updateListing` (`FOR UPDATE`) và không chặn đồng thời các giao dịch `OrderService` (`FOR NO KEY UPDATE`).
  2. **Lớp cơ sở dữ liệu (`V10` Partial Unique Indexes, bảo toàn snapshot lịch sử & tương thích `UC-09`)**:
     - `uq_giao_dichs_active_listing ON giao_dichs(ma_tin) WHERE trang_thai IN ('GIU_CHO', 'DANG_GIAO', 'CHO_XAC_NHAN', 'CHO_XU_LY')` — bảo đảm tối đa 1 giữ chỗ hiệu lực/tin.
     - Bảng `giao_dich_do_vat(id UUID PK, ma_giao_dich, ma_vat REFERENCES do_vats ON DELETE SET NULL, ten_vat_snapshot, tinh_trang_snapshot, giu_hieu_luc)` kèm 2 partial unique index `uq_giao_dich_do_vat_order_item(ma_giao_dich, ma_vat) WHERE ma_vat IS NOT NULL` và `uq_giao_dich_do_vat_active_item(ma_vat) WHERE giu_hieu_luc = TRUE AND ma_vat IS NOT NULL`, cùng `idx_giao_dich_do_vat_ma_giao_dich` — bảo đảm tối đa 1 giữ chỗ hiệu lực/đồ vật ở cấp PostgreSQL, cho phép `InventoryService.deleteItem` (`UC-09`, `204`) xóa đồ vật `KHA_DUNG` sau khi rút tin và hủy đơn, **đồng thời bảo toàn nguyên vẹn tên/tình trạng lịch sử trên đơn đã hủy** (`LEFT JOIN do_vats` fallback `'DA_XOA'`).
     - `uq_giao_dichs_pending_buyer_listing ON giao_dichs(ma_tin, nguoi_mua_id) WHERE trang_thai = 'YEU_CAU'` — ngăn nhấn đúp tạo nhiều yêu cầu trùng trên cùng một tin trong khi vẫn cho phép người mua gửi không giới hạn yêu cầu trên các tin khác nhau.
  3. **Bảo toàn tính toàn vẹn giá (`FR-07`) & trạng thái khi hủy (`UC-24` bước 6 & `E3`)**:
     - Loại bỏ hoàn toàn khả năng người bán ghi đè đơn phương `agreedPriceVnd` trên `POST /api/v1/orders/{id}/accept` (giữ nguyên `order.agreedPriceVnd()`). Chặn `agreedPriceVnd == 0` trên tin có phí (`priceVnd > 0`) bằng `400 INVALID_INPUT` và giữ bắt buộc `0đ` cho tin cho tặng (`priceVnd == 0`).
     - Khi hủy giữ chỗ trên tin đang `GIU_CHO` và không còn giữ chỗ hiệu lực nào, `cancelReservation` đối chiếu mở khóa tạm `FR-12` và kiểm tra trạng thái tài khoản người bán đã khóa `FOR NO KEY UPDATE`: chỉ mở lại `tin_dangs` về `CONG_KHAI` khi người bán đang hoạt động (`HOAT_DONG && email_verified && profile_approved`), chưa quá hạn `FR-13` và toàn bộ đồ vật `KHA_DUNG`; ngược lại chuyển `HET_HAN` nếu quá hạn hoặc `DA_RUT` (`closed_at = now`) nếu người bán bị khóa/vô hiệu hóa hoặc còn đồ vật `DA_CHUYEN_GIAO`/bị giữ ở đơn khác.

### 2. Tách biệt rạch ròi `thoi_diem_bat_dau_giao` (`UC-26`) và `thoi_diem_bao_giao` (`UC-27`)
- Bổ sung cột `thoi_diem_bat_dau_giao TIMESTAMPTZ` trên `giao_dichs` trong `V10`, giữ nguyên `thoi_diem_bao_giao` và `anh_ban_giao` cho `P3-02` (`UC-27`).
- `UC-24` kiểm tra `trang_thai IN ('CHO_XAC_NHAN', 'CHO_XU_LY') OR thoi_diem_bao_giao IS NOT NULL` để từ chối bằng `409 POST_DELIVERY_CANCELLATION_REQUIRED` và hướng sang `UC-28`; ngược lại khi mới ở `DANG_GIAO` (`thoi_diem_bao_giao IS NULL`), `UC-24` vẫn cho phép hủy hợp lệ theo `UC-24 A3`.

### 3. Đề xuất & xác nhận lịch hẹn hai bên (`lich_hen_giao_dichs`, `UC-25`)
- Tách bảng `lich_hen_giao_dichs` lưu toàn bộ đề xuất (`CHO_XAC_NHAN`, `DA_XAC_NHAN`, `TU_CHOI`, `DA_THAY_THE`) kèm ràng buộc `chk_lich_hen_distinct_responder CHECK (nguoi_phan_hoi_id IS NULL OR nguoi_phan_hoi_id <> nguoi_de_xuat_id)` ở tầng CSDL.
- Đề xuất từ một bên (kể cả lịch dự kiến người mua gửi ở `UC-22`) **không bao giờ** tự đánh dấu `lich_hen_da_xac_nhan = TRUE`. Chỉ khi **bên còn lại** gọi `POST /orders/{id}/schedules/{proposalId}/confirm` trên đúng đề xuất đang `CHO_XAC_NHAN` và **chưa quá thời gian** (`proposedTime >= now`; ngược lại từ chối `409 PROPOSAL_EXPIRED`), lịch chung mới được ghi nhận vào `giao_dichs.thoi_gian_hen` / `dia_diem_hen` / `lich_hen_da_xac_nhan = TRUE`.
- Khi đổi lịch (`UC-25 A3`, `UC-26 A3`), lịch đã thống nhất trước đó được bảo toàn cho đến khi đề xuất mới được hai bên đồng ý.

### 4. Hộp thông báo trong ứng dụng (`thong_baos`) và consumer sự kiện `P2-01`
- Bổ sung bảng `thong_baos` phục vụ thông báo theo giao dịch (`UC-22`–`UC-26`) và gắn `@EventListener` cho `ListingUpdatedWithPendingRequestsEvent` do `ListingService` phát ra khi người bán sửa tin đang có `YEU_CAU` (đồng bộ snapshot `giao_dich_do_vat` **và tăng `giao_dichs.version = version + 1, updated_at`** để các yêu cầu `/accept` dùng `expectedVersion` cũ nhận `409 VERSION_CONFLICT`).

### 5. Đồng bộ hệ thiết kế Editorial Commerce & Lucian UX/UI và gia cố trạng thái Mobile
- Toàn bộ màn hình `ReservationRequestScreen`, `OrdersScreen`, `OrderDetailScreen` và các điểm nối người bán tại `ListingScreen`, `MyListingsScreen`, `ProfileScreen` sử dụng nhất quán `SafeAreaInsetsContext`, `theme.ts`, `useReduceMotion()` và bố cục phẳng + `HairlineDivider` + sticky CTA dock của `P2-01`/`P2-02`.
- Cổng mới hai thành phần tương tác từ Lucian UX/UI Prompt (giữ đầy đủ header MIT và token nội bộ): `#444` (`OrderProgressStepper.tsx`, `https://lucianlabs.dev/uxui-prompt/#444`) cho tiến trình 4 mốc đơn hàng kèm nhánh hủy và `#072` (`CollapsibleAlert.tsx`, `https://lucianlabs.dev/uxui-prompt/#072`) cho thông báo chưa đọc & phản hồi thu gọn; tái sử dụng `#048` (`UnderlineTabs`), `#305` (`BottomSheet`), `#416` (`SegmentedControl`), `#434` (`FormField`) và `#092` (`EmptyState`).
- Gia cố client theo review PR #34: khóa race condition & post-logout write trong `useOrders` (`ordersReqSeq`/`detailReqSeq`/`notificationsReqSeq`/`sessionEpoch`), chỉ hiện `"0đ · Cho tặng"` từ `listing.isFree`, hiển thị rõ `Giá thỏa thuận` + `Giá niêm yết`, chặn nhập giờ/phút tràn trong `parseMeetingTimeInput`, mở đơn từ tin `GIU_CHO` với `initialStatus: 'ALL'`, chặn submit khi `!preview`, khử gọi trùng mount+focus, và đồng bộ badge chưa đọc trên `ProfileScreen`.

## Tác động lên các task tiếp theo

- **`P2-03` (Chat & thương lượng giá — `UC-21`)**: khi hai bên chốt giá thương lượng, client chỉ cần truyền `agreedPriceVnd` sang `ReservationRequestScreen` (`POST /api/v1/orders`).
- **`P3-02` (Hoàn tất giao dịch OTP & hủy sau báo giao — `UC-27`, `UC-28`)**: kế thừa trạng thái `DANG_GIAO`, `thoi_diem_bat_dau_giao`, bảng snapshot `giao_dich_do_vat` và cột `thoi_diem_bao_giao` / `anh_ban_giao` đã phân tách sẵn; khi hoàn tất (`HOAN_TAT`), chuyển `do_vats.trang_thai = 'DA_CHUYEN_GIAO'`, `tin_dangs.trang_thai = 'KET_THUC'` và đặt `giao_dich_do_vat.giu_hieu_luc = FALSE`.
- **`P4-03` (k6 load test & PIT mutation test)**: bộ `OrderConcurrencyTest` và `OrderService` là mục tiêu trực tiếp cho kiểm thử tải giữ chỗ đồng thời và mutation testing module `order`.
