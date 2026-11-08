# Architecture Decision Records (ADR)

ADR ghi lại một quyết định kiến trúc quan trọng, bối cảnh và hệ quả, để người sau hiểu vì sao hệ thống có hình dạng này. Quyết định đã chấp nhận chỉ bị thay thế bằng một ADR mới, không sửa lịch sử.

## Danh sách

| Mã | Tiêu đề | Trạng thái | Ngày |
| --- | --- | --- | --- |
| [ADR-001](ADR-001-modular-monolith-maven-multi-module.md) | Backend modular monolith, Maven multi-module theo bounded context | Thay thế một phần bởi P0-06; giữ lịch sử | 2026-10-28 |
| [ADR-002](ADR-002-shared-backend-api-for-mobile-and-admin-web.md) | Một Backend API dùng chung cho mobile và web quản trị | Chấp nhận | 2026-10-28 |
| [ADR-003](ADR-003-jwt-rbac-role-boundaries.md) | Xác thực JWT và phân quyền RBAC theo ranh giới vai trò | Chấp nhận | 2026-10-28 |
| [P0-06](../../decisions/P0-06-quy-uoc-va-ci.md) | Một Maven module, stack hiện tại, migration số tăng và CI đủ hai client | Chấp nhận theo người dùng | 2026-11-08 |

Dự kiến: ADR-004 phiên bản Expo và cách phân phối bản mobile (chờ P0-02, P4-01); ADR-005 chiến lược storage ảnh (MinIO hay volume) (chờ P0-03).

## Quy trình

1. Tạo file `ADR-<số 3 chữ số>-<slug-kebab>.md` từ mẫu bên dưới, trạng thái **Đề xuất**.
2. Mở PR nhãn `adr`, gắn người sở hữu module bị ảnh hưởng làm reviewer.
3. Khi đồng thuận, đổi trạng thái thành **Chấp nhận** và cập nhật bảng trên. Khi bị thay thế, đổi thành **Thay thế bởi ADR-xxx** và giữ nguyên nội dung.
4. Quyết định về nghiệp vụ (chính sách của khách hàng) không ghi trong ADR; ADR chỉ ghi cách hiện thực kỹ thuật cho chính sách đã chốt.

## Mẫu

```markdown
# ADR-xxx: <Tiêu đề quyết định>

Trạng thái: Đề xuất | Chấp nhận | Thay thế bởi ADR-yyy
Ngày: YYYY-MM-DD
Người quyết định: <tên>; Liên quan: <tên>

## Bối cảnh
Vấn đề cần quyết định, ràng buộc, yêu cầu liên quan (FR/NFR/UC).

## Quyết định
Nội dung đã chọn, viết ở thì hiện tại ("Chúng tôi dùng ...").

## Phương án đã cân nhắc
- Phương án A: ưu / nhược
- Phương án B: ưu / nhược

## Hệ quả
Điều gì dễ hơn, điều gì khó hơn, việc phải làm tiếp.
```
