# P0-06 · Chốt cấu trúc backend, migration và phạm vi CI

Trạng thái: **Chấp nhận theo xác nhận của người dùng ngày 08/11/2026**.

## Bối cảnh

Tài liệu P0-05 vừa merge mô tả Maven multi-module, Spring Boot 4, PostgreSQL 17 và migration theo timestamp. Mã đã chạy đạt của P0-01/03 dùng một Maven module, Spring Boot 3.5.14, PostgreSQL 16 và V1/V2. P0-04 có CI backend, chưa kiểm tra hai client hoặc bắt buộc check trên main. Người dùng đã xem so sánh về trải nghiệm, chức năng và kỹ thuật rồi chấp thuận gói đề xuất.

## Quyết định

1. Giữ một Maven module trong `backend/`, một JAR Spring Boot và các package miền dưới `com.dormtrading`. Tiếp tục Temurin 21, Spring Boot 3.5.14, Maven Wrapper 3.9.16, PostgreSQL 16. Không tái cấu trúc hoặc nâng stack trong P0-06.
2. Giữ V1/V2 đã merge; migration mới dùng `V3__<mo_ta>.sql`, `V4__<mo_ta>.sql` theo số tăng. Nguyễn Quốc Nguyên điều phối số phiên bản theo phân công Phase 1. Chủ task vẫn chịu trách nhiệm SQL và test; không sửa migration đã áp dụng, không tự trộn timestamp vào chuỗi phiên bản này.
3. Thêm job `admin-web` và `mobile` vào CI dùng Node 24, cài bằng lockfile, chạy TypeScript, test và build/export Android. `required` phụ thuộc đủ năm job `repository`, `workflow-lint`, `backend`, `admin-web`, `mobile`; chỉ chấp nhận kết quả success cho tất cả.
4. Bắt buộc check `required` do GitHub Actions phát hành trên main; giữ yêu cầu PR, một người khác approve, giải quyết hội thoại và squash merge. Không thêm quyền bypass.
5. Mobile CI dùng script build hiện có: Expo export Android. Prebuild/Gradle/ký APK thuộc kế hoạch phát hành P4-01; export không chứng minh cấu hình native hay app chạy được trên thiết bị.

Quyết định này thay thế phần cấu trúc Maven, stack, cách đánh số migration và khẳng định ArchUnit đã có của [ADR-001 P0-05](../architecture/adr/ADR-001-modular-monolith-maven-multi-module.md). Giữ nguyên nội dung ADR cũ để truy lịch sử. Các ranh giới miền và nguyên tắc giao dịch vẫn là mục tiêu tổ chức nghiệp vụ; chưa có ArchUnit/JaCoCo trong CI hiện tại. Quyết định không sửa hợp đồng xác thực hoặc UC.

## Phương án đã cân nhắc và hệ quả

| Lựa chọn | Đánh giá và tác động |
|---|---|
| Một module chia package (chọn) | Giữ nền đã kiểm tra, ít thay đổi build. Phụ thuộc giữa miền cần review; Maven chưa cưỡng chế ranh giới package. |
| Maven multi-module | Khai báo dependency rõ và có thể build theo module; cần di chuyển code/test/resource và chỉnh build/CI. Có thể cân nhắc riêng mà không buộc nâng Spring Boot/PostgreSQL. |
| Nâng Spring Boot 4/PostgreSQL 17 | Không có UC hiện tại buộc nâng; phát sinh kiểm tra tương thích và nâng dữ liệu DB. Tách thành task riêng khi có nhu cầu. |
| Migration timestamp | Giảm trùng số khi làm song song nhưng vẫn phải điều phối phụ thuộc/thứ tự. Nhóm giữ đầu mối và chuỗi số hiện tại. |
| Chỉ CI backend | Chưa phát hiện lỗi TypeScript/test/build client. Bổ sung client tăng thời gian và tài nguyên CI nhưng phù hợp PR mẫu cho cả monorepo. |

## Cách xác nhận

Xem [spec P0-06](../specs/P0-06.md), [bằng chứng local](../specs/P0-06-local-evidence.md) và [checklist nhóm](../conventions/P0-06-checklist.md). Kiểm tra actionlint, gate success/failure/cancelled/skipped với đủ năm job; chạy PR mẫu có ca lỗi rồi sửa; đọc ruleset main sau cập nhật. Xác nhận trên 5 máy và bằng chứng UI/API vẫn là các tiêu chí riêng, không suy ra từ CI xanh.
