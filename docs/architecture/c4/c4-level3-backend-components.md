# C4 mức 3 – Module bên trong Backend API

Các component là module logic mục tiêu trong **một Maven module**, gốc package `com.dormtrading` theo [quyết định P0-06](../../decisions/P0-06-quy-uoc-va-ci.md). Hiện có sáu package miền và `common`; `shared`, `notification`, `media` là mục tiêu tổ chức, chưa phải package/module đã tạo. Mũi tên là phụ thuộc nghiệp vụ cho phép, không khẳng định các luồng đã triển khai.

```mermaid
C4Component
    title Backend API – Module (modular monolith)

    Container_Boundary(api, "Backend API") {
        Component(shared, "shared", "Spring Security, JWT, RBAC, lỗi chuẩn, phân trang, sự kiện nội bộ", "Hạt nhân dùng chung, không có bảng nghiệp vụ")
        Component(iam, "iam", "UC-01..08, UC-11..16", "Đăng ký, OTP, duyệt thẻ, đăng nhập, hồ sơ, vai trò, khóa/mở khóa, xóa tài khoản")
        Component(catalog, "catalog", "UC-09, UC-10, UC-17..20", "Kho cá nhân, tin đăng, phiên bản, ảnh, danh mục, khu vực, tìm kiếm, hạn mức 5/10")
        Component(chat, "chat", "UC-21", "Hội thoại, tin nhắn, đề nghị giá")
        Component(order, "order", "UC-22..29", "Yêu cầu, giữ chỗ (khóa đồ vật), hẹn, giao dịch, ảnh bàn giao, mã 6 số, hủy, quá hạn/tranh chấp")
        Component(review, "review", "UC-30..34", "Đánh giá, khiếu nại, sổ cái điểm uy tín")
        Component(gov, "gov", "UC-35..40", "Báo cáo, nhóm báo cáo, bằng chứng, quyết định kiểm duyệt, thang phạt, kiểm duyệt viên, thống kê")
        Component(notification, "notification", "FR-13", "Hộp thư trong ứng dụng, gửi email")
        Component(media, "media", "NFR-01", "Lưu/đọc file, kiểm quyền file hạn chế")
    }

    ContainerDb(db, "PostgreSQL", "Mỗi module sở hữu bảng và migration của mình")
    System_Ext(storage, "Object storage")
    System_Ext(smtp, "SMTP")

    Rel(chat, catalog, "Tra tin đăng")
    Rel(chat, iam, "Tra thành viên")
    Rel(order, catalog, "Khóa tin và đồ vật")
    Rel(order, iam, "Tra thành viên, hạn chế")
    Rel(review, order, "Tra giao dịch hoàn tất")
    Rel(review, iam, "Cập nhật điểm (sự kiện)")
    Rel(gov, catalog, "Ẩn tin")
    Rel(gov, iam, "Khóa tài khoản, vai trò")
    Rel(gov, order, "Quyết định tranh chấp")
    Rel(gov, review, "Xét đánh giá, khiếu nại")
    Rel(iam, notification, "Thông báo")
    Rel(order, notification, "Thông báo")
    Rel(catalog, media, "Ảnh tin")
    Rel(order, media, "Ảnh bàn giao")
    Rel(media, storage, "S3 API")
    Rel(notification, smtp, "Email OTP")
    Rel(iam, db, "JDBC")
    Rel(order, db, "JDBC")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Cấu trúc bên trong một module

```text
backend/src/main/java/com/dormtrading/<mien>/
├── api/            REST controller + DTO request/response (chỉ lớp này được expose ra HTTP)
├── application/    Application service: giao dịch, kiểm quyền, điều phối; API công khai cho module khác
├── domain/         Entity, value object, quy tắc nghiệp vụ, domain event
└── infrastructure/ JPA repository, adapter SMTP/storage, scheduler
backend/src/main/resources/db/migration/   Flyway V1/V2; tiếp theo V3__<mo_ta>.sql
backend/src/test/java/com/dormtrading/      Unit test + integration test Testcontainers
```

Các tầng trong cây trên là quy ước cho nghiệp vụ mới, không phải tất cả package đã có ở scaffold. Ranh giới cần review: gói `api` không được tham chiếu từ miền khác; chỉ service/DTO công khai được gọi chéo miền. ArchUnit là hướng mở rộng chưa triển khai; CI P0-06 chưa kiểm tra tự động ranh giới này.

## Giao dịch và khóa quan trọng

| Nghiệp vụ | Module chủ | Bất biến phải giữ | Cách giữ |
| --- | --- | --- | --- |
| Chấp nhận giữ chỗ (UC-23) | `order` | Một đồ vật có tối đa một giữ chỗ hiệu lực trên mọi tin; combo giữ hết hoặc không | Khóa hàng đồ vật theo thứ tự id tăng dần trong một giao dịch DB; kiểm lại phiên bản tin |
| Hoàn tất bằng mã (UC-27) | `order` | Nhập đúng mã chỉ hoàn tất một lần; tối đa 5 lần sai, hết hạn 10 phút | Mã lưu dạng băm, cập nhật trạng thái có điều kiện (idempotent) |
| Áp dụng điểm (UC-30, UC-34, UC-37) | `review` | Mỗi nguồn sinh tối đa một khoản | Khóa duy nhất trên (nguồn, mã nguồn) của `reputation_entry` |
| Đăng tin / hạn mức (UC-10) | `catalog` | Không vượt 5 hoặc 10 tin mở + giữ | Đếm trong cùng giao dịch dưới khóa hàng thành viên |
