# Kiến trúc hệ thống

Trạng thái: kiến trúc mục tiêu P0-05, đồng bộ cấu trúc/stack/CI theo [quyết định P0-06](../decisions/P0-06-quy-uoc-va-ci.md) ngày 08/11/2026. Bảng nghiệp vụ và vai trò bên dưới là mục tiêu, chưa phải toàn bộ chức năng đã triển khai. Hiện trạng scaffold và tồn đọng xem các spec P0-01 đến P0-04.

## 1. Tổng quan

Một **modular monolith** Spring Boot làm Backend API duy nhất. Hai ứng dụng khách dùng chung API đó:

| Ứng dụng | Công nghệ | Người dùng | Phạm vi |
| --- | --- | --- | --- |
| Mobile | React Native + Expo | Người đăng ký, Thành viên (mua/bán) | Tài khoản, kho cá nhân, tin đăng, tìm kiếm, chat/trả giá, giữ chỗ, bàn giao, đánh giá, gửi báo cáo/khiếu nại |
| Web quản trị | React + Vite | Kiểm duyệt viên, Quản trị viên cấp cao | Duyệt kích hoạt, tra cứu/sửa/khóa/xóa người dùng, duyệt tin, xử lý báo cáo, khiếu nại, tranh chấp, thang phạt, kiểm duyệt viên, thống kê |

Không có nghiệp vụ nào nằm ở phía client. Mọi quy tắc (hạn mức tin, khóa giữ chỗ, mã hoàn tất, điểm uy tín, ngưỡng khóa) chỉ được thực thi trong Backend API.

Sơ đồ chi tiết: [C4 mức 1 – Ngữ cảnh](c4/c4-level1-system-context.md), [C4 mức 2 – Container](c4/c4-level2-container.md), [C4 mức 3 – Module backend](c4/c4-level3-backend-components.md).

## 2. Module backend và ranh giới

Backend hiện có **một Maven module**, chia miền bằng package dưới `com.dormtrading`: `iam`, `catalog`, `chat`, `order`, `review`, `gov` và `common`. Dùng Temurin 21, Spring Boot 3.5.14, Maven Wrapper 3.9.16 và PostgreSQL 16. Bảng sau mô tả các module logic mục tiêu, không phải các Maven module đã tạo; `shared`, `notification`, `media` chưa được tách thành package riêng theo bảng. Xem [quyết định P0-06](../decisions/P0-06-quy-uoc-va-ci.md), thay thế phần tương ứng của ADR-001.

| Module | Trách nhiệm | UC chính | Sở hữu dữ liệu |
| --- | --- | --- | --- |
| `iam` | Đăng ký, OTP, duyệt thẻ, đăng nhập, mật khẩu, hồ sơ, vai trò, khóa/mở khóa, xóa tài khoản | UC-01..08, UC-11..16 | member, email_verification, student_card_review, admin_role, account_restriction |
| `catalog` | Kho cá nhân, tin đăng, phiên bản tin, ảnh, danh mục, khu vực, tìm kiếm | UC-09, UC-10, UC-17..20 | item, listing, listing_version, listing_photo, category, area |
| `chat` | Hội thoại, tin nhắn, đề nghị giá | UC-21 | conversation, message, price_offer |
| `order` | Yêu cầu đặt hàng, giữ chỗ, lịch hẹn, giao dịch, ảnh bàn giao, mã hoàn tất, hủy, quá hạn/tranh chấp | UC-22..29 | order_request, reservation, appointment, transaction, handover_photo, completion_code, cancellation_request |
| `review` | Đánh giá, khiếu nại đánh giá, sổ cái điểm uy tín | UC-30..34 | rating, appeal, reputation_entry |
| `gov` | Báo cáo vi phạm, nhóm báo cáo, bằng chứng, quyết định kiểm duyệt, thang phạt, quản lý kiểm duyệt viên, thống kê | UC-35..40 | violation_report, report_group, evidence, moderation_decision, penalty_level |
| `notification` | Hộp thư thông báo trong ứng dụng, gửi email qua SMTP | FR-13 | notification |
| `media` | Lưu/đọc file ảnh, kiểm quyền truy cập file hạn chế | NFR-01 | media_object |
| `shared` | Bảo mật (JWT, RBAC), lỗi chuẩn, phân trang, sự kiện nội bộ, cấu hình | – | không có bảng nghiệp vụ |

Quy tắc phụ thuộc:

- Module chỉ gọi module khác qua **application service hoặc DTO công khai** của module đó, không truy cập entity hay repository của nhau.
- Hướng phụ thuộc cho phép: `order → catalog, iam`; `review → order, iam`; `gov → catalog, iam, order, review`; `chat → catalog, iam`; mọi module → `shared`, `notification`, `media`. Không có vòng phụ thuộc. Khi cần phản hồi ngược (ví dụ `review` cập nhật điểm cho `iam`) dùng sự kiện nội bộ (Spring application event) trong cùng giao dịch.
- Chủ task sở hữu SQL/test của miền mình; Nguyễn Quốc Nguyên điều phối phiên bản Flyway số tăng V3, V4… tại `backend/src/main/resources/db/migration/`. Giữ V1/V2; không sửa migration đã merge. Ranh giới package được review; chưa có ArchUnit trong CI.

## 3. Ranh giới vai trò

| Vai trò | Ứng dụng | Được làm | Không được làm |
| --- | --- | --- | --- |
| Người đăng ký (chưa kích hoạt) | Mobile | Đăng ký, OTP email, nộp ảnh thẻ, xem trạng thái chờ duyệt | Tìm kiếm, mua/bán |
| Thành viên | Mobile | Toàn bộ nghiệp vụ mua/bán; vai trò người mua/người bán xác định theo từng giao dịch, không phải hai loại tài khoản | Mọi chức năng kiểm duyệt |
| Kiểm duyệt viên | Web quản trị | Duyệt kích hoạt, tra cứu/sửa/khóa/mở khóa/xóa người dùng, duyệt tin, xử lý báo cáo, khiếu nại đánh giá, giao dịch quá hạn/tranh chấp | Bổ nhiệm kiểm duyệt viên, sửa thang phạt, xem thống kê toàn hệ thống |
| Quản trị viên cấp cao | Web quản trị | Tất cả quyền kiểm duyệt viên; quản lý kiểm duyệt viên, thang phạt, thống kê | – |
| Hệ thống (scheduler) | Backend | Nhắc giữ chỗ, chuyển giao dịch quá hạn 24h, cộng +1 sau 15 ngày không đánh giá, nhắc gia hạn/đóng tin | – |

Thực thi bằng JWT + RBAC theo [ADR-003](adr/ADR-003-jwt-rbac-role-boundaries.md). Mobile chỉ dùng token vai trò Thành viên; web quản trị chỉ chấp nhận token có vai trò kiểm duyệt. Một thành viên được bổ nhiệm kiểm duyệt viên dùng cùng tài khoản nhưng đăng nhập trên web để kiểm duyệt.

## 4. Giao tiếp và dữ liệu

- REST JSON tại `/api/v1`; hợp đồng OpenAPI 3.1 là nguồn sự thật cho cả hai client ([ADR-002](adr/ADR-002-shared-backend-api-for-mobile-and-admin-web.md)).
- PostgreSQL duy nhất, Flyway migration, giao dịch và khóa hàng ở tầng application service. Testcontainers cho kiểm thử tích hợp.
- Ảnh lưu object storage riêng (volume cục bộ khi phát triển). File hạn chế (thẻ sinh viên, ảnh bàn giao, bằng chứng) chỉ được đọc qua endpoint có kiểm quyền.
- Email OTP qua SMTP; môi trường phát triển dùng Maildev.
- Chat dùng polling; chưa dùng WebSocket cho đến khi có nhu cầu đo được.

## 5. Môi trường

| Môi trường | Backend | DB / Mail / Storage | Mobile | Web quản trị |
| --- | --- | --- | --- | --- |
| Local | Maven Wrapper, cổng 8082, `/api/v1` | Docker Compose (P0-03), PostgreSQL 16 | Expo SDK 53, `EXPO_PUBLIC_API_URL` qua LAN/giả lập | Vite cổng 5173, `VITE_API_URL` gọi trực tiếp backend có CORS |
| CI | GitHub Actions, Temurin 21, clean verify | PostgreSQL 16 qua Testcontainers | Node 24, TypeScript, Jest, export Android | Node 24, TypeScript, Vitest, Vite build |
| Staging / Prod | Docker image trên GHCR, Compose + Nginx/Traefik (P4-01) | Compose prod, volume bền | Bản cài APK nội bộ ([quy trình](mobile-build-and-distribution.md)) | File tĩnh phục vụ qua Nginx |

## 6. Tài liệu liên quan

- [Danh sách ADR](adr/README.md)
- [Quy trình đóng gói và phân phối bản mobile](mobile-build-and-distribution.md)
- [Quy ước Git](../conventions/git-conventions.md)
