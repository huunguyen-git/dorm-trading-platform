# P3-03 · Xử lý giao dịch quá hạn, tranh chấp và bằng chứng kiểm duyệt

Ngày: **28/11/2026** · Trạng thái: **Đang thực hiện (chốt kiến trúc cho nhánh `feat/p3-03-dispute-resolution`, migration `V14`)**.

## Bối cảnh và căn cứ

Tác vụ `P3-03` triển khai trọn gói [UC-29](../use-cases/UC-29.md) (*Xử lý giao dịch quá hạn / tranh chấp*) trên cả ba tầng `backend/` (`com.dormtrading.order.dispute`), `admin-web/` (`/disputes`, `/disputes/:id`) và `mobile/` (`OrderDisputeSection` trong `OrderDetailScreen`), kế thừa trực tiếp hạ tầng định danh/RBAC của [P1-01](../specs/P1-01.md), khóa tài khoản theo uy tín của [P1-05](../specs/P1-05.md), vòng đời tin đăng & làm sạch ảnh của [P2-01](../specs/P2-01.md), và lõi giữ chỗ `V13` của [P2-04](../specs/P2-04.md)/[P2-05](../specs/P2-05.md), đồng thời phát triển song song với `P3-02` (PR #38 — [UC-27](../use-cases/UC-27.md), [UC-28](../use-cases/UC-28.md)).

Căn cứ yêu cầu bắt buộc đã đối chiếu:
- [FR-05](../03-requirements.md#fr-05--kiểm-duyệt-và-hạn-mức-tin): hạn mức tin mở/giữ chỗ tối đa `5` khi `diem_uy_tin < 120` và `10` khi `diem_uy_tin >= 120` (chỉ tính tin `CONG_KHAI` còn hạn và `GIU_CHO`; không tính `NHAP`, `CHO_DUYET`, `DA_RUT`, `AN`, `HET_HAN`, `KET_THUC`).
- [FR-08](../03-requirements.md#fr-08--giữ-chỗ-và-hủy-giữ-chỗ): tối đa một giữ chỗ hiệu lực/tin và một giữ chỗ hiệu lực/đồ vật; sau mốc báo đã giao chỉ được hủy khi hai bên đồng thuận ([UC-28](../use-cases/UC-28.md)) hoặc có quyết định của Kiểm duyệt viên ([UC-29](../use-cases/UC-29.md)).
- [FR-09](../03-requirements.md#fr-09--bàn-giao-và-xác-nhận-hoàn-tất): sau 24 giờ kể từ lúc báo đã giao mà người mua chưa xác nhận thì chuyển quản trị xử lý, **không** tự hoàn tất hay tự mở hàng; mã hoàn tất chỉ dùng một lần và không chứng minh thanh toán.
- [FR-12](../03-requirements.md#fr-12--khóa-tài-khoản-theo-điểm): tôn trọng trạng thái khóa tạm 14 ngày (hết hạn tự mở lại giữ nguyên điểm) và khóa vĩnh viễn khi xét quyền thao tác lẫn điều kiện mở lại tin đăng.
- [FR-13](../03-requirements.md#fr-13--gia-hạn-và-đóng-tin-cũ): tin đăng quá thời hạn 30 ngày không còn đủ điều kiện công khai lại.
- [NFR-01](../03-requirements.md#nfr-01--quyền-truy-cập-dữ-liệu): ảnh bàn giao, bằng chứng bổ sung và nhật ký chat chỉ hai bên giao dịch, Kiểm duyệt viên và Quản trị viên cấp cao được xem; tách biệt kho lưu trữ bằng chứng với ảnh tin đăng công khai; Zero-PII trong DTO đối tác.
- [NFR-02](../03-requirements.md#nfr-02--giữ-chỗ-và-hạn-mức-khi-có-thao-tác-đồng-thời) & [NFR-03](../03-requirements.md#nfr-03--gửi-lại-yêu-cầu-và-tính-điểm-một-lần): hai thao tác đồng thời trên cùng giao dịch chỉ ghi nhận đúng một quyết định; quyết định của Kiểm duyệt viên và mã hoàn tất/đồng thuận hủy của hai bên không bao giờ cùng có hiệu lực; không mở lại tin vượt hạn mức và không giải phóng nhầm đồ vật đang chịu giữ ở giao dịch khác.
- **Đối chiếu mã UC nguồn**: các liên kết cũ `UC-16`/`UC-17`/`UC-18`/`UC-25`/`UC-26` ghi trong [UC-29](../use-cases/UC-29.md) tương ứng theo [danh mục chuẩn 40 UC](../use-cases/README.md) lần lượt là [UC-27](../use-cases/UC-27.md), [UC-28](../use-cases/UC-28.md) và [UC-35](../use-cases/UC-35.md)/[UC-36](../use-cases/UC-36.md)/[UC-37](../use-cases/UC-37.md).

## Quyết định kỹ thuật

### 1. Thiết kế migration `V14` lũy đẳng chung sống sạch với `V13` (`P2-04`/`P2-05`) và `P3-02` (PR #38)
- **Vấn đề**: Nhánh `main` hiện kết thúc ở `V13__order_reservation_and_scheduling.sql` (`P2-04`/`P2-05`), trong khi `P3-02` (PR #38 — [UC-27](../use-cases/UC-27.md), [UC-28](../use-cases/UC-28.md)) cũng mở rộng `giao_dichs`, `ma_xac_nhan_otp` và bổ sung các bảng `anh_ban_giao_giao_dichs`, `yeu_cau_huy_giao_dichs`, `lich_su_trang_thai_giao_dich`. Theo [quy ước Git/CI P0-06](P0-06-quy-uoc-va-ci.md), tuyệt đối không được sửa các file `V1..V13` đã merge (làm hỏng Flyway checksum). Nếu `P3-03` viết DDL không lũy đẳng hoặc phụ thuộc cứng vào nhánh `P3-02` chưa merge, cả CI hiện tại lẫn bước hợp nhất sau khi PR #38 merge sẽ thất bại.
- **Các phương án cân nhắc**:
  - *Phương án A*: Chờ PR #38 merge xong mới bắt đầu viết migration và code `P3-03` → chặn chéo tiến độ Phase 3.
  - *Phương án B*: Sửa trực tiếp `V1` hoặc `V13` → vi phạm bất biến Flyway checksum và phá lịch sử migration đã kiểm chứng.
  - *Phương án C (chọn)*: Tạo mới `V14__dispute_resolution_and_evidence.sql` lũy đẳng `100%` bằng `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` và khối `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_constraint ...) THEN ALTER TABLE ... END IF; END $$;` cho mọi ràng buộc.
- **Quyết định & lý do**:
  - Mở rộng lũy đẳng `giao_dichs` (`ghi_chu_ban_giao`, `ly_do_cho_xu_ly`, `thoi_diem_chuyen_xu_ly`, `han_phan_hoi_kdv`, `han_danh_gia_den` + partial index `idx_giao_dichs_overdue_confirm`, `idx_giao_dichs_dispute_queue`), `ma_xac_nhan_otp` (`otp_hash`, `otp_ciphertext`, `so_lan_thu_toi_da`, `bi_vo_hieu`, `ly_do_vo_hieu` gồm `'QUYET_DINH_KIEM_DUYET'`, `thoi_diem_dung`, `nguoi_cap_id`, cùng `ALTER COLUMN ma_otp DROP NOT NULL` để tương thích với cơ chế băm/mã hóa OTP của `P3-02`) và ràng buộc `chk_nhat_ky_kiem_duyet_action_type` trên `nhat_ky_kiem_duyet` để bổ sung mã hành động kiểm duyệt tranh chấp mà vẫn giữ nguyên các loại hành động từ `V5`.
  - Khởi tạo `IF NOT EXISTS` ba bảng dùng chung với `P3-02` (`anh_ban_giao_giao_dichs`, `yeu_cau_huy_giao_dichs`, `lich_su_trang_thai_giao_dich`) và bốn bảng chuyên biệt của `P3-03` (`quyet_dinh_giao_dichs`, `yeu_cau_bo_sung_giao_dichs`, `phan_hoi_bo_sung_giao_dichs`, `bang_chung_bo_sung_giao_dichs`).
  - Đọc ảnh bàn giao ưu tiên từ `anh_ban_giao_giao_dichs`, đồng thời giữ fallback đọc cột kế thừa `giao_dichs.anh_ban_giao` (`V1`) khi bảng mới rỗng để tương thích dữ liệu cũ/test nền.
- **Tác động**: `V14` vượt qua cả kiểm thử cài mới `V1 → V14` lẫn nâng cấp `V13 → V14` trên PostgreSQL 16 Testcontainers; khi hợp nhất với `P3-02` (PR #38), hai nhánh chỉ cần sắp lại số phiên bản Flyway (`V14`/`V15`) mà không xung đột cột, bảng hay constraint.

### 2. Tạo bảng chuyên biệt `quyet_dinh_giao_dichs` (`UNIQUE(ma_giao_dich)`) thay vì tái sử dụng `quyet_dinhs`
- **Vấn đề**: Migration `V1` đã có bảng `quyet_dinhs` và `V6` (`P1-06`) đã mở rộng bảng này kèm trigger `trg_decision_penalty_snapshot`. Cần chọn giữa việc tái sử dụng `quyet_dinhs` cho `UC-29` hoặc tạo bảng riêng `quyet_dinh_giao_dichs`.
- **Các phương án cân nhắc**:
  - *Phương án A*: Thêm cột `ma_giao_dich` vào `quyet_dinhs` (`V1`/`V6`).
  - *Phương án B (chọn)*: Tạo bảng riêng `quyet_dinh_giao_dichs` có `ma_giao_dich UUID NOT NULL UNIQUE`, `ket_luan CHECK IN ('HOAN_TAT', 'HUY')`, `can_cu CHECK (length(btrim(can_cu)) >= 10)`, `tin_dang_trang_thai_sau`, `ly_do_an_tin` và không có khóa ngoại sang `thang_phats`.
- **Quyết định & lý do**:
  - Bảng `quyet_dinhs` trong `V1`/`V6` được thiết kế riêng cho miền xử lý vi phạm và khiếu nại (`ma_bao_cao`, `ma_khieu_nai`), gắn chặt với `thang_phats`, ba cột snapshot mức phạt (`ten_thang_phat_snapshot`, `diem_tru_snapshot`, `mo_ta_thang_phat_snapshot`), ràng buộc `ck_decision_penalty_snapshot` và trigger `preserve_decision_penalty()` của [P1-06](P1-06-quan-tri-va-lich-su.md).
  - Ngược lại, [UC-29](../use-cases/UC-29.md) **cấm tuyệt đối** áp dụng thang phạt hay thay đổi `diem_uy_tin` (*"Điểm uy tín của hai bên không thay đổi trong use case này"*), chỉ cho phép tập kết luận đóng `('HOAN_TAT', 'HUY')`, cần ghi lại kết quả hậu kiểm tin đăng (`tin_dang_trang_thai_sau`, `ly_do_an_tin` cho Ngoại lệ 4) và đòi hỏi quan hệ **1–1 bất biến** mỗi giao dịch có tối đa một quyết định (`UNIQUE(ma_giao_dich)`).
  - Nếu nhét `ma_giao_dich` vào `quyet_dinhs`, bảng sẽ vừa có nhiều cột nullable chéo miền, vừa có nguy cơ gắn nhầm `ma_thang_phat` vào quyết định tranh chấp, vừa phải sửa đổi constraint/trigger nhạy cảm của `P1-06`/`P3-06`.
- **Tác động**: Miền `order.dispute` sở hữu mô hình dữ liệu rõ ràng, khóa cứng bất biến "không phạt điểm" và "tối đa 1 quyết định/giao dịch" ngay ở tầng PostgreSQL, hoàn toàn không ảnh hưởng `V6` và `P3-06`.

### 3. Phòng vệ đồng thời đa tầng: thứ tự khóa (`thanh_viens → tin_dangs → giao_dichs → do_vats ORDER BY ma_vat ASC`) + `expectedVersion` + `UNIQUE(ma_giao_dich)` (`NFR-02`, `NFR-03`)
- **Vấn đề**: Trên một giao dịch đang `CHO_XU_LY`, nhiều tác nhân có thể thao tác đồng thời: (1) hai Kiểm duyệt viên cùng bấm `Xác nhận hoàn tất` và `Hủy giao dịch` (`UC-29` Ngoại lệ 1), (2) Kiểm duyệt viên ra quyết định đúng lúc người mua nhập mã OTP ([UC-27](../use-cases/UC-27.md), `UC-29` Alt 3) hoặc hai bên đồng thuận hủy ([UC-28](../use-cases/UC-28.md), `UC-29` Alt 4), và (3) Kiểm duyệt viên hủy giao dịch (kiểm tra hạn mức `FR-05` & mở lại tin) đồng thời với thao tác công khai/sửa tin khác của người bán trong `ListingService` (`P2-01`), `InventoryService` (`P1-03`) hoặc luồng giữ chỗ/hủy của `OrderService` (`P2-04`), cũng như scheduler hết hạn yêu cầu bổ sung chạy đồng thời với nộp bằng chứng/quyết định.
- **Các phương án cân nhắc**:
  - *Phương án A*: Chỉ đọc `giao_dichs` không khóa rồi `UPDATE` theo `WHERE trang_thai = 'CHO_XU_LY'` → dễ đua lệnh khi tính hạn mức `FR-05` lúc mở lại tin, giải phóng nhầm `do_vats`, hoặc tạo deadlock AB-BA với `ListingService`/`OrderService`.
  - *Phương án B (chọn)*: Kết hợp 3 lớp phòng vệ đồng bộ từ tầng ứng dụng đến tầng CSDL.
- **Quyết định & lý do**:
  1. **Thứ tự khóa bi quan toàn cục (`FOR NO KEY UPDATE`)**:
     - Tuân thủ tuyệt đối cùng thứ tự khóa chống deadlock toàn cục với `OrderService` (`P2-04`), `ListingService` (`P2-01`), `InventoryService` (`P1-03`) và `ReputationLedgerService` (`P1-05`):
       **`thanh_viens (seller) → tin_dangs (ma_tin) → giao_dichs (ma_giao_dich) → do_vats (ORDER BY ma_vat ASC)`**.
     - Sử dụng **`FOR NO KEY UPDATE`** (tương thích với khóa khóa ngoại `FOR KEY SHARE` mà PostgreSQL 16 tự lấy khi `INSERT` vào bảng con như `thong_baos`, `quyet_dinh_giao_dichs`, `lich_su_trang_thai_giao_dich`, tránh AB-BA deadlock đã được xử lý ở [ADR P2-04/P2-05](P2-04-P2-05-giu-cho-va-hen-giao.md)), đồng thời khóa `tin_dangs` trước `giao_dichs` để không bao giờ đảo chiều khóa với `OrderService`.
     - Với mọi thao tác chạm bảng yêu cầu bổ sung (`complete`, `cancel`, `requestEvidence`, `submitEvidenceResponse` và tác vụ nền `expireOverdueEvidenceRequestsBatch`), luôn giữ nhất quán thứ tự khóa **`giao_dichs → yeu_cau_bo_sung_giao_dichs`** (khóa `giao_dichs` trước bằng `FOR NO KEY UPDATE` / `FOR NO KEY UPDATE SKIP LOCKED` theo `ma_giao_dich ASC`, sau đó mới cập nhật `yeu_cau_bo_sung_giao_dichs`) để triệt tiêu hoàn toàn nguy cơ AB-BA deadlock giữa scheduler và luồng nộp bằng chứng/kiểm duyệt.
  2. **Khóa lạc quan `expectedVersion` & kiểm trạng thái sau khóa**:
     - Sau khi giữ khóa dòng `giao_dichs`, kiểm tra ngay: nếu `trang_thai IN ('HOAN_TAT', 'HUY')` → ném `409 DISPUTE_ALREADY_RESOLVED`; nếu `trang_thai <> 'CHO_XU_LY'` → ném `409 INVALID_STATE_TRANSITION`; nếu `expectedVersion != null && expectedVersion != order.version` → ném `409 VERSION_CONFLICT`.
     - Trong cùng transaction quyết định (`HOAN_TAT` hoặc `HUY`), lập tức vô hiệu mọi mã OTP đang hiệu lực (`bi_vo_hieu = TRUE`, `ly_do_vo_hieu = 'QUYET_DINH_KIEM_DUYET'`, `otp_ciphertext = NULL`), bảo đảm quyết định của Kiểm duyệt viên và mã xác nhận của hai bên không bao giờ cùng có hiệu lực (`UC-29 §4`).
  3. **Ràng buộc duy nhất ở tầng PostgreSQL**:
     - `UNIQUE(ma_giao_dich)` trên `quyet_dinh_giao_dichs` bảo vệ tuyệt đối chống ghi quyết định thứ hai ở cấp CSDL.
     - `uq_yc_bo_sung_open_per_order ON yeu_cau_bo_sung_giao_dichs(ma_giao_dich) WHERE trang_thai = 'CHO_BO_SUNG'` ngăn hai Kiểm duyệt viên gửi trùng yêu cầu bổ sung đang mở (`409 EVIDENCE_REQUEST_ALREADY_OPEN`).
     - Khi hủy giao dịch, chỉ chuyển từng `do_vats` sang `KHA_DUNG` nếu trạng thái hiện tại chưa phải `DA_CHUYEN_GIAO` và không còn bản ghi `giao_dich_do_vat(giu_hieu_luc = TRUE)` nào khác trỏ tới đồ vật đó.
- **Tác động**: Đảm bảo `NFR-02`/`NFR-03` trong các kịch bản đua lệnh đa luồng (`DisputeConcurrencyTest`: 2 KDV cạnh tranh `complete` vs `cancel`, KDV vs thay đổi trạng thái giao dịch) mà không phát sinh deadlock hay trạng thái bán phần.

### 4. Điều kiện công khai lại tin đăng và nhánh chuyển `AN` khi hủy giao dịch (`UC-29` Ngoại lệ 4 × `FR-05`, `FR-12`, `FR-13`)
- **Vấn đề**: Ở `UC-24` (`P2-04`, hủy giữ chỗ trước khi báo giao), khi tin không đủ điều kiện mở lại (người bán bị khóa/vô hiệu hóa, tin quá hạn, đồ vật bị bán), hệ thống chuyển tin sang `HET_HAN` hoặc `DA_RUT`. Tuy nhiên, tại [UC-29](../use-cases/UC-29.md) Ngoại lệ 4 quy định cụ thể: *"Tin đăng không còn đủ điều kiện công khai khi hủy: Đồ vật vẫn về 'Còn hàng' nhưng tin đăng giữ trạng thái Ẩn; hệ thống thông báo cho người bán lý do."*
- **Các phương án cân nhắc**:
  - *Phương án A*: Luôn mở lại `CONG_KHAI` bất chấp hạn mức/hết hạn/khóa tài khoản → vi phạm trực tiếp `FR-05`, `FR-12`, `FR-13`.
  - *Phương án B*: Tái sử dụng logic `DA_RUT`/`HET_HAN` của `UC-24` → sai hậu điều kiện *trạng thái `Ẩn`* và thiếu lưu vết `ly_do_an_tin` của `UC-29` Ngoại lệ 4.
  - *Phương án C (chọn)*: Tách rõ bước giải phóng đồ vật khỏi bước đánh giá 4 điều kiện công khai lại tin đăng, chuyển sang `AN` kèm lý do tiếng Việt cụ thể khi không đủ điều kiện.
- **Quyết định & lý do**:
  - Đồ vật thuộc giao dịch luôn được giải phóng về `KHA_DUNG` trước (nếu không `DA_CHUYEN_GIAO` và không bị giao dịch hợp lệ khác giữ).
  - Sau khi khóa `thanh_viens` của người bán và đối chiếu hết hạn khóa tạm 14 ngày (`FR-12`), chỉ chuyển `tin_dangs` từ `GIU_CHO` về `CONG_KHAI` khi đạt đủ cả **4 tiêu chí**:
    1. Tài khoản người bán ở trạng thái `HOAT_DONG` (`email_verified = TRUE AND profile_approved = TRUE`, tôn trọng `FR-12`).
    2. Tin đăng chưa quá thời hạn 30 ngày (`expires_at IS NULL OR expires_at > now`, `FR-13`).
    3. Toàn bộ đồ vật gắn với tin đăng trong `tin_dang_do_vat` đều ở trạng thái `KHA_DUNG` (tránh mở lại tin combo thiếu đồ).
    4. Tổng số tin đang tính hạn mức (chỉ gồm tin `CONG_KHAI` còn hạn và `GIU_CHO` khác theo đúng `FR-05`, không tính `NHAP`/`CHO_DUYET`/`AN`/`DA_RUT`/`HET_HAN`/`KET_THUC`) nhỏ hơn hạn mức `FR-05` (`5` khi `diem_uy_tin < 120`, `10` khi `diem_uy_tin >= 120`) — đặc biệt quan trọng khi điểm uy tín của người bán đã giảm xuống `< 120` trong thời gian giao dịch diễn ra.
  - Nếu vi phạm bất kỳ tiêu chí nào (khi tin đang `GIU_CHO`): đặt `tin_dangs.trang_thai = 'AN'`, ghi `tin_dangs.ly_do_an = <lý do tiếng Việt cụ thể>`, lưu đồng bộ `tin_dang_trang_thai_sau = 'AN'` và `ly_do_an_tin` trong `quyet_dinh_giao_dichs`, đồng thời gửi thông báo rõ lý do cho người bán (`DISPUTE_RESOLVED_CANCELLED`) và hiển thị nổi bật trên `mobile` (`OrderDisputeSection`) lẫn `admin-web`. Nếu tin đăng trước đó đã ở trạng thái `AN` hoặc `KET_THUC` thì giữ nguyên, không ghi đè.
- **Tác động**: Nhất quán hoàn toàn giữa `UC-29` Ngoại lệ 4 với 3 quy tắc nguồn `FR-05`, `FR-12`, `FR-13`; người bán hiểu rõ vì sao tin ở trạng thái `AN` trong khi đồ vật vẫn khả dụng trong kho.

### 5. Tính hạn phản hồi Kiểm duyệt viên 3 ngày làm việc (`Asia/Ho_Chi_Minh`) mang tính SLA thông tin
- **Vấn đề**: [UC-29 §4](../use-cases/UC-29.md) quy định *"Kiểm duyệt viên phản hồi hồ sơ trong 3 ngày làm việc kể từ khi giao dịch chuyển 'Chờ xử lý'; đây là hạn phản hồi, không bắt buộc giải quyết xong"*, còn [FR-09](../03-requirements.md#fr-09--bàn-giao-và-xác-nhận-hoàn-tất) cấm tự động hoàn tất hoặc tự động mở hàng.
- **Các phương án cân nhắc**:
  - *Phương án A*: Cộng cứng `72 giờ` (3 ngày dương lịch) → tính sai cuối tuần (giao dịch chuyển Thứ Sáu sẽ báo quá hạn ngay Thứ Hai).
  - *Phương án B*: Tự động hủy hoặc hoàn tất giao dịch khi quá 3 ngày làm việc → vi phạm cả `FR-09` lẫn `UC-29 §4`.
  - *Phương án C (chọn)*: Tính `han_phan_hoi_kdv = addBusinessDays(escalatedAt, 3)` bỏ qua Thứ Bảy và Chủ Nhật theo múi giờ vận hành `Asia/Ho_Chi_Minh` (UTC+7), chỉ đóng vai trò chỉ báo SLA (`overdueSla`) không tự đóng giao dịch.
- **Quyết định & lý do**:
  - Sử dụng `Clock` tiêm qua Spring chuyển sang `ZoneId.of("Asia/Ho_Chi_Minh")` để cộng tuần tự từng ngày cho đến khi đủ `3` ngày từ Thứ Hai đến Thứ Sáu (giữ nguyên giờ/phút/giây trong ngày); nếu `escalatedAt` rơi vào Thứ Bảy/Chủ Nhật thì bắt đầu đếm từ ngày làm việc kế tiếp, giúp toàn bộ test đơn vị/tích hợp hoàn toàn tất định.
  - Cột `han_phan_hoi_kdv` được trả ra cho cả `admin-web` (tô màu cảnh báo `overdueSla = true` khi `now > han_phan_hoi_kdv` và giao dịch vẫn `CHO_XU_LY`) lẫn `mobile` (hiển thị hạn phản hồi dự kiến). Hệ thống **không** tự đóng, không tự hoàn tất và không tự hủy giao dịch khi vượt mốc này.
- **Điểm mở ghi nhận**: Lịch nghỉ lễ quốc gia Việt Nam (Tết Nguyên Đán, 30/04, 02/09…) chưa có bảng danh mục chuẩn trong phạm vi Phase 3; việc tính ngày làm việc hiện loại trừ Thứ Bảy/Chủ Nhật và có thể nạp thêm bảng ngày lễ sau này mà không thay đổi API hay lược đồ `giao_dichs`.

### 6. Kho lưu trữ bằng chứng tranh chấp riêng tư tách biệt `media_files` (`NFR-01`) & cổng kiểm tra tải ảnh phía `admin-web` (`UC-29` Ngoại lệ 3)
- **Vấn đề**:
  1. Theo [NFR-01](../03-requirements.md#nfr-01--quyền-truy-cập-dữ-liệu) và [UC-29 §4](../use-cases/UC-29.md), ảnh bàn giao và bằng chứng tranh chấp là dữ liệu nhạy cảm chỉ 4 đối tượng được xem (người mua, người bán, Kiểm duyệt viên, Quản trị viên cấp cao), tuyệt đối không được để lọt qua endpoint ảnh tin đăng công khai (`GET /api/v1/media/{id}` vốn có `permitAll()` và cache công khai 300s).
  2. Theo [UC-29 §3.3 Ngoại lệ 3](../use-cases/UC-29.md), khi không tải được ảnh bàn giao hoặc bằng chứng, hệ thống phải thông báo lỗi, cho phép tải lại và **chưa cho ra quyết định cho đến khi xem được hồ sơ**.
- **Các phương án cân nhắc**:
  - *Phương án A*: Dùng chung `media_files` + `GET /api/v1/media/{id}` và dùng thẻ `<img src="...">` trực tiếp trên `admin-web` → rủi ro rò rỉ dữ liệu nhạy cảm qua cache/route công khai, không gửi được header `Authorization: Bearer` trên thẻ `<img>`, và không kiểm soát chắc chắn trạng thái tải ảnh trước khi quyết định.
  - *Phương án B (chọn)*: Cô lập hoàn toàn hạ tầng lưu trữ & API bằng chứng tranh chấp, kết hợp cơ chế tải có xác thực + khóa nút quyết định trên `admin-web`.
- **Quyết định & lý do**:
  - **Tách kho lưu trữ (`DisputeEvidenceStorage` / `LocalDisputeEvidenceStorage`)**: lưu tệp vào thư mục riêng `app.dispute.evidence.local-dir` (tiền tố `dispute-evidence/`), ghi metadata tại `bang_chung_bo_sung_giao_dichs` — **tuyệt đối không** ghi vào `media_files`.
  - **Tái sử dụng lớp vệ sinh ảnh an toàn**: kiểm magic bytes (`MediaMagicBytes`: chỉ JPEG/PNG/WebP `<= 5 MB`) và làm sạch toàn bộ EXIF/GPS/XMP/chống bom giải nén qua `MediaImageSanitizer` **trước khi** mở/giữ khóa dòng CSDL; đăng ký dọn tệp đã ghi nếu transaction rollback.
  - **Stream có xác thực & chống rò rỉ cache**: mọi endpoint tải ảnh (`/api/v1/admin/disputes/{orderId}/evidence/**` và `/api/v1/orders/{orderId}/dispute/evidence/{attachmentId}`) kiểm chuẩn hóa đường dẫn chống path traversal, kiểm quyền chặt (chặn `403 SELF_DISPUTE_FORBIDDEN` với KDV tự xử lý đơn của mình và `403 DISPUTE_FORBIDDEN` với người ngoài), luôn gắn `Cache-Control: private, no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, `Vary: Authorization`.
  - **Cổng tải ảnh bắt buộc phía `admin-web` (`DisputeDetailPage`)**: nạp từng ảnh bàn giao và ảnh bổ sung qua `attachment()` thành Blob Object URL (có thu hồi `URL.revokeObjectURL` khi unmount/nạp lại), theo dõi trạng thái `loading | loaded | error` cho từng ảnh. Nếu bất kỳ ảnh nào ở trạng thái `error`, giao diện hiển thị cảnh báo lỗi nổi bật kèm nút **`Tải lại ảnh bằng chứng`** và **vô hiệu hóa** cả hai nút `Xác nhận hoàn tất` & `Hủy giao dịch` cùng giải thích rõ cho đến khi toàn bộ ảnh hồ sơ tải thành công.
- **Tác động**: Bảo vệ chặt dữ liệu riêng tư theo `NFR-01` (sẵn sàng chuyển `DisputeEvidenceStorage` sang MinIO/S3 private bucket ở `P4-01`) và bảo đảm thực thi chính xác `UC-29` Ngoại lệ 3 ở tầng giao diện kiểm duyệt.

## Tổng hợp các phương án đã cân nhắc

| Chủ đề | Phương án chọn | Phương án thay thế & lý do loại bỏ |
|---|---|---|
| Lược đồ `V14` & tương thích `P3-02` | `V14__dispute_resolution_and_evidence.sql` lũy đẳng toàn phần (`IF NOT EXISTS` + `DO $$`), không sửa `V1..V13` | Sửa `V1`/`V13` (hỏng Flyway checksum) hoặc chờ PR #38 merge xong mới làm (chặn tiến độ Phase 3) |
| Lưu quyết định tranh chấp | Bảng riêng `quyet_dinh_giao_dichs` với `UNIQUE(ma_giao_dich)`, không FK `thang_phats` | Tái sử dụng `quyet_dinhs` (`V1`/`V6`): trộn miền xử phạt vi phạm, xung đột trigger `preserve_decision_penalty()` và không khóa cứng quy tắc cấm trừ điểm |
| Kiểm soát đồng thời (`NFR-02`/`NFR-03`) | Thứ tự khóa `thanh_viens → tin_dangs → giao_dichs → do_vats ORDER BY ma_vat ASC` (và `giao_dichs → yeu_cau_bo_sung_giao_dichs`, dùng `FOR NO KEY UPDATE`) + `expectedVersion` + `UNIQUE(ma_giao_dich)` + vô hiệu OTP cùng transaction | Chỉ dùng `UPDATE WHERE` không khóa hoặc đảo thứ tự khóa: đua lệnh hạn mức `FR-05`, deadlock với `ListingService`/`OrderService`/scheduler hoặc quyết định KDV và OTP cùng hiệu lực |
| Hủy giao dịch khi tin không đủ điều kiện (`UC-29` E4) | Đồ vật vẫn về `KHA_DUNG`; tin đăng chuyển `AN` + lưu `ly_do_an_tin` + thông báo người bán | Luôn mở `CONG_KHAI` (vi phạm `FR-05`/`FR-12`/`FR-13`) hoặc chuyển `DA_RUT` như `UC-24` (trái hậu điều kiện `Ẩn` của `UC-29` E4) |
| Hạn phản hồi 3 ngày làm việc | Cộng 3 ngày làm việc bỏ Thứ Bảy/Chủ Nhật (`Asia/Ho_Chi_Minh`), chỉ báo SLA thông tin không tự đóng | Cộng cứng 72h dương lịch (sai cuối tuần) hoặc tự đóng/hủy giao dịch (vi phạm `FR-09` và `UC-29 §4`) |
| Lưu trữ & hiển thị bằng chứng (`NFR-01`, `UC-29` E3) | `DisputeEvidenceStorage` riêng tách khỏi `media_files` + `Cache-Control: private, no-store` + cổng khóa nút quyết định khi ảnh lỗi trên `admin-web` | Dùng `media_files` công khai hoặc thẻ `<img>` không khóa nút quyết định: rủi ro lộ ảnh riêng tư và cho phép quyết định mù khi chưa xem bằng chứng |

## Tác động lên các task tiếp theo

- **`P3-02` ([UC-27](../use-cases/UC-27.md), [UC-28](../use-cases/UC-28.md) — PR #38)**: dùng chung cấu trúc bảng `anh_ban_giao_giao_dichs`, `yeu_cau_huy_giao_dichs`, `lich_su_trang_thai_giao_dich` và các cột `ma_xac_nhan_otp`/`giao_dichs` đã thiết kế lũy đẳng trong `V14`; khi `P3-02` đánh dấu tranh chấp hủy (`CANCEL_DISPUTE`) sẽ đặt `trang_thai = 'CHO_XU_LY'`, `ly_do_cho_xu_ly = 'CANCEL_DISPUTE'`, `thoi_diem_chuyen_xu_ly = now` và `han_phan_hoi_kdv = addBusinessDays(now, 3)` để hồ sơ xuất hiện ngay trên hàng đợi `P3-03`.
- **`P3-04` ([UC-30](../use-cases/UC-30.md)–[UC-32](../use-cases/UC-32.md))**: kế thừa trực tiếp cột `giao_dichs.han_danh_gia_den` (`thoi_diem_hoan_tat + 15 ngày`) do `P3-03` khởi tạo khi Kiểm duyệt viên chốt `HOAN_TAT`, phục vụ kiểm tra hạn đánh giá 15 ngày và cộng `+1` tự động khi hết hạn không đánh giá (`FR-10`).
- **`P3-06` ([UC-37](../use-cases/UC-37.md), [UC-38](../use-cases/UC-38.md))**: báo cáo tranh chấp hằng tháng (`FR-16`) truy vấn trực tiếp từ `giao_dichs` (`thoi_diem_chuyen_xu_ly`, `ly_do_cho_xu_ly`) kết hợp `quyet_dinh_giao_dichs`; nếu phát hiện vi phạm trong hồ sơ tranh chấp, Kiểm duyệt viên hoặc thành viên tiếp tục tạo/xử lý qua báo cáo vi phạm (`UC-35`–`UC-37`).
- **`P4-01` & `P4-04` (Triển khai & Bảo mật)**: giao diện `DisputeEvidenceStorage` cho phép thay thế `LocalDisputeEvidenceStorage` bằng MinIO/S3 private bucket mà không sửa `DisputeService`; các điểm kiểm tra trọng yếu của `P4-04` gồm cách ly bằng chứng riêng tư (`private, no-store`), path traversal, EXIF/magic bytes và `403 SELF_DISPUTE_FORBIDDEN`.
- **`P4-02` & `P4-03` (E2E & Tải/Đột biến)**: kịch bản E2E xuyên ứng dụng (Mobile nộp bằng chứng → Admin Web tải ảnh, kiểm tra cổng lỗi ảnh và ra quyết định → Mobile nhận kết quả) và bộ `DisputeConcurrencyTest` làm nền kiểm thử Playwright/Maestro, k6 và PIT.
