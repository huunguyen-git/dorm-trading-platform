# P2-03 · Quyết định kỹ thuật: Nhắn tin trực tiếp và thương lượng giá (UC-21)

## 1. Bối cảnh
- Task **P2-03** triển khai [UC-21: Nhắn tin và thương lượng giá](../use-cases/UC-21.md) thuộc Phase 2, chịu sự chi phối của các điều khoản `FR-07`, `FR-08`, `FR-12`, `NFR-01`.
- Lược đồ gốc `V1__init_schema.sql` đã có hai bảng `hoi_thoais` và `tin_nhans`, nhưng chưa có:
  1. Cột lưu mức giá thỏa thuận hiện hành (`gia_thoa_thuan`) và phiên bản hội thoại (`version`, `updated_at`) trên `hoi_thoais`.
  2. Phân loại tin nhắn (`VAN_BAN`, `DE_NGHI_GIA`) và trạng thái vòng đời của từng đề nghị giá (`CHO_PHAN_HOI`, `DA_DONG_Y`, `DA_TU_CHOI`, `DA_THAY_THE`) cùng thông tin người phản hồi (`phan_hoi_boi_id`, `ghi_chu_phan_hoi`, `thoi_diem_phan_hoi`).
  3. Cơ chế chống tạo trùng tin nhắn khi mạng chập chờn và người dùng bấm **Thử gửi lại** (`client_message_id` - `UC-21` ngoại lệ 3.3 bước 3).
  4. Thứ tự hiển thị tất định (`sequence_no`) khi nhiều tin nhắn/phản hồi phát sinh trong cùng một mili-giây.

## 2. Các quyết định kỹ thuật đã chốt

### 2.1. Mở rộng lược đồ tại `V8__chat_and_price_negotiation.sql` (không sửa các migration đã có)
- Chọn phiên bản **`V8`** để tránh xung đột với các PR đang mở trong repo (`V6` ở PR #33, `V7` ở PR #34).
- **`hoi_thoais`**:
  - Bổ sung `gia_thoa_thuan INT NULL CHECK (gia_thoa_thuan > 0)`, `de_nghi_da_dong_y_id UUID NULL REFERENCES tin_nhans(ma_tin_nhan)`, `updated_at TIMESTAMPTZ`, `version BIGINT`.
  - Bổ sung `CHECK (nguoi_mua_id <> nguoi_ban_id)` để bảo đảm chủ tin không tự tạo hội thoại với chính mình ở cả tầng ứng dụng và cơ sở dữ liệu.
  - Backfill an toàn `updated_at = GREATEST(h.thoi_diem_tao, COALESCE(MAX(m.thoi_diem_gui), h.thoi_diem_tao))`.
- **`tin_nhans`**:
  - Bổ sung `sequence_no BIGSERIAL`, `loai_tin_nhan` (`VAN_BAN` | `DE_NGHI_GIA`), `trang_thai_de_nghi` (`CHO_PHAN_HOI` | `DA_DONG_Y` | `DA_TU_CHOI` | `DA_THAY_THE`), `hanh_dong_phan_hoi` (`ACCEPT` | `REJECT` | `COUNTER`), `ghi_chu_phan_hoi TEXT`, `de_nghi_goc_id`, `client_message_id`, `phan_hoi_boi_id`, `thoi_diem_phan_hoi`, `updated_at`.
  - Backfill dữ liệu cũ an toàn: làm sạch `gia_de_nghi <= 0` thành `NULL` và dùng `ROW_NUMBER() OVER (PARTITION BY ma_hoi_thoai ...)` để chỉ bản ghi mới nhất mang `CHO_PHAN_HOI`, các bản ghi cũ hơn chuyển sang `DA_THAY_THE` trước khi tạo index và constraint.
  - Tạo partial unique index `uq_tin_nhans_pending_offer` trên `(ma_hoi_thoai) WHERE loai_tin_nhan = 'DE_NGHI_GIA' AND trang_thai_de_nghi = 'CHO_PHAN_HOI'` để bảo đảm tại mọi thời điểm mỗi cuộc hội thoại có tối đa một đề nghị giá đang chờ phản hồi.
  - Tạo partial unique index `uq_tin_nhans_client_msg` trên `(ma_hoi_thoai, nguoi_gui_id, client_message_id) WHERE client_message_id IS NOT NULL` và sử dụng `INSERT ... ON CONFLICT (ma_hoi_thoai, nguoi_gui_id, client_message_id) WHERE client_message_id IS NOT NULL DO NOTHING` để đảm bảo tính idempotent khi gửi lại tin nhắn/đề nghị giá/phản hồi (`201 Created` cho lần đầu, `200 OK` cho lần replay cùng payload, `409 CLIENT_MESSAGE_ID_CONFLICT` khi dùng lại key với nội dung/mức giá/ghi chú khác) mà không làm abort transaction PostgreSQL (`25P02`).

### 2.2. Kiểm soát tương tranh, thứ tự khóa chống Deadlock, đối soát khóa tạm 14 ngày (`FR-12`) và tính nguyên tử
- **Mở hội thoại (`POST /api/v1/conversations`)**: Kiểm tra trạng thái tin đăng (`NHAP`/`AN` -> `404 LISTING_NOT_FOUND`, khác `CONG_KHAI` -> `409 LISTING_NOT_AVAILABLE`) trước khi kiểm tra trạng thái đối phương (`403 COUNTERPARTY_RESTRICTED`). Sử dụng `INSERT ... ON CONFLICT (ma_tin, nguoi_mua_id, nguoi_ban_id) DO NOTHING` kết hợp truy vấn lại theo khóa duy nhất, giúp hai yêu cầu mở hội thoại đồng thời từ cùng người mua luôn trả về cùng một `conversationId`.
- **Thứ tự khóa nhất quán chống Deadlock `AB-BA` và đối soát khóa tạm 14 ngày (`FR-12`)**: Trước khi khóa hàng `hoi_thoais` (`SELECT ... FOR UPDATE`), `ChatService` đọc nhanh `nguoi_mua_id`, `nguoi_ban_id` và gọi `ReputationLedgerService.reconcileExpiredTemporaryLock(counterpartyId)` (khóa `thanh_viens` trước, `hoi_thoais` sau). Nhờ đó mọi luồng đồng thời giữa hai người dùng đối xứng luôn khóa `thanh_viens -> hoi_thoais` theo cùng thứ tự, đồng thời tự động mở khóa nếu thời hạn 14 ngày (`khoa_den_ngay`) đã hết.
- **Tạo/thay thế/phản hồi đề nghị giá**: Khóa hàng `hoi_thoais` bằng `SELECT ... FOR UPDATE` trong cùng transaction:
  - `ACCEPT` kiểm tra lại `targetOffer.offeredPrice() <= currentListingPrice` tại thời điểm chấp nhận (nếu chủ tin đã giảm giá tin đăng xuống thấp hơn giá đề nghị cũ thì từ chối `409 OFFER_NOT_PENDING`) và cập nhật trực tiếp bản ghi `DE_NGHI_GIA`.
  - `REJECT` cập nhật trực tiếp bản ghi `DE_NGHI_GIA` (`trang_thai_de_nghi`, `hanh_dong_phan_hoi`, `ghi_chu_phan_hoi`, `phan_hoi_boi_id`, `thoi_diem_phan_hoi`, `updated_at`).
  - `COUNTER` (hoặc tạo đề nghị mới khi đang có đề nghị `CHO_PHAN_HOI`) hỗ trợ đầy đủ idempotency theo `clientMessageId`, chuyển nguyên tử bản ghi cũ sang `DA_THAY_THE` (`hanh_dong_phan_hoi = 'COUNTER'`) và chèn bản ghi `DE_NGHI_GIA` mới với trạng thái `CHO_PHAN_HOI`, `hanh_dong_phan_hoi = NULL`, `content = note ?? ""`.
  - Khi hai phản hồi đồng thời cùng tác động vào một đề nghị `CHO_PHAN_HOI`, câu lệnh `UPDATE ... WHERE ma_tin_nhan = ? AND trang_thai_de_nghi = 'CHO_PHAN_HOI'` bảo đảm chỉ đúng một giao dịch thắng (`200 OK`), giao dịch còn lại nhận `409 OFFER_NOT_PENDING`.
- **Truy vấn hộp thư không N+1**: `GET /api/v1/conversations` đối soát khóa tạm theo tập `DISTINCT counterpartyId` rồi lấy toàn bộ danh sách hội thoại kèm `lastMessage` và `pendingOffer` trong một truy vấn `LEFT JOIN LATERAL` duy nhất có phân trang `LIMIT/OFFSET`.
- **Quy tắc `agreedPrice` khi thương lượng tiếp sau một lần `ACCEPT`**:
  - `hoi_thoais.gia_thoa_thuan` giữ mức giá của đề nghị được `ACCEPT` gần nhất. Nếu sau đó một bên gửi đề nghị mới nhưng đề nghị mới chưa được `ACCEPT` (hoặc bị `REJECT`), mức giá đã đồng ý trước đó vẫn được giữ cho đến khi có một lượt `ACCEPT` mới ghi đè.

### 2.3. Bảo toàn bất biến không tự giữ chỗ (`FR-07`, `FR-08`) và giữ bằng chứng (`NFR-01`)
- Hành động `ACCEPT` đề nghị giá chỉ cập nhật `tin_nhans` và `hoi_thoais.gia_thoa_thuan`, kèm thông điệp `reservationNotice`; tuyệt đối không ghi vào `giao_dichs` và không đổi `tin_dangs.trang_thai` hay `do_vats.trang_thai`. Task `P2-04` (`UC-22`) sẽ đọc `gia_thoa_thuan` này khi người mua gửi yêu cầu giữ chỗ.
- Khi đối phương bị khóa (`BI_KHOA`) hoặc tin đăng không còn `CONG_KHAI` (hoặc bị xóa làm `ma_tin = NULL`), thành viên đang hoạt động của hội thoại vẫn được phép gọi `GET` (và `POST /api/v1/conversations` với hội thoại đã tồn tại) để đọc lịch sử tin nhắn làm bằng chứng ở chế độ read-only (`canSendMessage = false`, `canMakeOffer = false`, `restrictionReason` có mã lỗi rõ ràng), trong khi mọi thao tác ghi (`POST /messages`, `/offers`, `/respond`) đều bị chặn ở backend.
- Mã `403 ACCOUNT_RESTRICTED` chỉ dùng khi chính người gọi bị khóa để tương thích với cơ chế hạ quyền phiên trong `mobile/src/api/client.ts`; khi đối phương bị hạn chế luôn trả `403 COUNTERPARTY_RESTRICTED`.
- Người thứ ba không thuộc hội thoại (`userId != buyerId && userId != sellerId`) luôn nhận `404 CONVERSATION_NOT_FOUND` ở mọi endpoint để không làm lộ sự tồn tại của cuộc hội thoại.

### 2.4. Chính sách cập nhật tin nhắn & đề nghị giá trên Mobile (Phase 2)
- Để đáp ứng bước "thông báo cho đối phương" trong `UC-21` mà không mở rộng hạ tầng sang WebSocket hay Push Notification ngoài phạm vi:
  - Mobile thực hiện fetch khi màn hình `ConversationsScreen` / `ChatScreen` nhận focus và hỗ trợ kéo/bấm làm mới thủ công.
  - Khi màn hình đang có focus và ứng dụng ở trạng thái foreground, Mobile polling định kỳ mỗi **5 giây** với cơ chế chống chồng request (`in-flight guard`).
  - Khi màn hình blur, hoặc người dùng đăng xuất / chuyển tài khoản / mất quyền (`401`, `403 ACCOUNT_RESTRICTED`), Mobile dừng polling ngay và vô hiệu hóa mọi response về muộn bằng `generation / userId guard`. Khi lỗi mạng tạm thời trong lúc tải lại, giữ nguyên dữ liệu đã hiển thị và chỉ báo lỗi tải.
