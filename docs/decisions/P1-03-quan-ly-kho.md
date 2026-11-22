# P1-03 · Quản lý Kho hàng cá nhân và Kiểm soát tương tranh

Ngày: **22/11/2026** · Trạng thái: **Đã thống nhất trong đội phát triển Phase 1**

## Phạm vi và Căn cứ

- **Task**: P1-03 → [UC-09](../use-cases/UC-09.md) · Quản lý kho hàng cá nhân
- **Yêu cầu căn cứ**: [FR-04](../03-requirements.md) (Kho cá nhân và tin lẻ/combo), [FR-08](../03-requirements.md) (Giữ chỗ và hủy giữ chỗ), [FR-12](../03-requirements.md) (Khóa tài khoản theo điểm), [NFR-01](../03-requirements.md) (Quyền truy cập dữ liệu), [NFR-02](../03-requirements.md) (Kiểm soát tương tranh khi giữ chỗ/công khai tin).
- **Mục tiêu**: Thống nhất hợp đồng dữ liệu, quy tắc ràng buộc trạng thái và cơ chế xử lý đồng thời (concurrency control) cho đồ vật trong kho cá nhân trước khi bước sang Phase 2 (Đăng tin và Giữ chỗ).

## Quyết định Kỹ thuật

### 1. Định danh và Tính duy nhất của Đồ vật (FR-04)
- Mỗi đồ vật trong kho (`do_vats`) đại diện cho một thực thể vật lý duy nhất ngoài đời thực của sinh viên, được định danh bằng khóa chính `ma_vat` (UUID).
- Hệ thống tuyệt đối không nhân bản SKU hay tạo nhiều bản ghi đại diện cho cùng một đồ vật vật lý.
- Một đồ vật có thể được tham chiếu bởi các tin đăng nháp hoặc tin đăng lẻ/combo, nhưng tại một thời điểm chỉ được phép có tối đa một giao dịch giữ chỗ có hiệu lực (tuân thủ FR-08).

### 2. Vòng đời Trạng thái Đồ vật (Item Lifecycle)
Bảng `do_vats` duy trì cột `trang_thai VARCHAR(30)` với 3 trạng thái chuẩn:
1. `KHA_DUNG` (Khả dụng): Đồ vật đang nằm trong kho của người dùng, sẵn sàng để tạo tin đăng hoặc chỉnh sửa thông tin.
2. `DANG_GIU` (Đang giữ chỗ): Đồ vật nằm trong một tin đăng đã được người bán chấp nhận yêu cầu giữ chỗ (Phase 2).
3. `DA_CHUYEN_GIAO` (Đã chuyển giao): Giao dịch hoàn tất thành công sau khi xác thực OTP bàn giao (Phase 3).

### 3. Ràng buộc Chỉnh sửa và Xóa Đồ vật (UC-09, FR-04, FR-08)
Để bảo đảm tính toàn vẹn dữ liệu cho các phân hệ Sàn giao dịch (Phase 2) và Bàn giao (Phase 3):
- **Điều kiện sửa (PUT)**:
  - Tài khoản người dùng có quyền `ROLE_MEMBER` và trạng thái `HOAT_DONG` (không bị `BI_KHOA`).
  - Đồ vật thuộc quyền sở hữu của chính người dùng (`user_id == currentUser.id`).
  - Trạng thái đồ vật bắt buộc phải là `KHA_DUNG`.
  - Đồ vật **chưa được gắn vào bất kỳ tin đăng nào** (kiểm tra `COUNT(*) == 0` trong bảng `tin_dang_do_vat`).
  - Phải vượt qua kiểm tra khóa lạc quan (`version`).
- **Điều kiện xóa (DELETE)**:
  - Tương tự như sửa, đồ vật chỉ được phép xóa khi thuộc sở hữu người dùng, trạng thái là `KHA_DUNG`, và **chưa từng được gắn vào tin đăng nào** (`tin_dang_do_vat` liên kết = 0).
- **Mã lỗi phản hồi khi vi phạm**:
  - Trả về HTTP `409 Conflict` nếu đồ vật đã gắn tin hoặc trạng thái khác `KHA_DUNG`.
  - Trả về HTTP `403 Forbidden` nếu tài khoản bị khóa hoặc thao tác trên đồ vật của người dùng khác.

### 4. Kiểm soát Tương tranh Lạc quan (Optimistic Concurrency Control - NFR-02)
- Bảng `do_vats` đã có sẵn cột `version BIGINT NOT NULL DEFAULT 0` từ migration V1.
- Entity JPA / Spring Data áp dụng chú thích `@Version` trên trường `version`.
- Khi client gửi yêu cầu cập nhật (`PUT /api/v1/inventory/{id}`), client gửi kèm trường `version`.
- Nếu có hai phiên thao tác đồng thời (hoặc một phiên sửa đồ vật trong khi phiên khác vừa tạo tin đăng liên kết đồ vật), giao dịch nào ghi nhận sự thay đổi trạng thái trước sẽ làm tăng `version`. Giao dịch còn lại sẽ gặp `OptimisticLockingFailureException` và hệ thống trả về mã lỗi HTTP `409 Conflict`, buộc client tải lại trạng thái mới nhất.

### 5. Quy chuẩn Dữ liệu Đầu vào (Validation)
- `ten`: Chuỗi không rỗng, tối thiểu 1 ký tự, tối đa 255 ký tự sau khi trim khoảng trắng.
- `tinhTrang`: Chuỗi mô tả thực tế, không rỗng, tối đa 2000 ký tự.
- `hinhAnh`: Mảng URL/chuỗi ảnh thực tế. Bắt buộc có tối thiểu 1 ảnh và tối đa 5 ảnh (nghiêm ngặt theo đặc tả FR-04). Vi phạm sẽ bị từ chối với HTTP `400 Bad Request`.

### 6. Phân quyền và Bảo mật (NFR-01, FR-12)
- Đường dẫn cơ sở: `/api/v1/inventory/**`.
- Yêu cầu xác thực Bearer token thông qua `SecurityConfig`.
- Endpoint chỉ mở cho tài khoản đã kích hoạt có vai trò `ROLE_MEMBER`.
- Tài khoản ở trạng thái `BI_KHOA` (theo FR-12) bị từ chối mọi thao tác ghi dữ liệu kho (HTTP `403 Forbidden`).
