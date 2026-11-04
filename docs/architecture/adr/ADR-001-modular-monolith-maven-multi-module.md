# ADR-001: Backend modular monolith, Maven multi-module theo bounded context

Trạng thái: Chấp nhận
Ngày: 2026-10-28
Người quyết định: Tô Thành Nguyên (P0-05); Liên quan: Nguyễn Hữu Nguyên (P0-01, dựng khung), Nguyễn Quốc Nguyên (P0-03, DB)

## Bối cảnh

Dự án 8 tuần, 5 sinh viên, mục tiêu vừa có ứng dụng chạy được vừa có hồ sơ OOAD. Nghiệp vụ có nhiều bất biến xuyên khái niệm cần giao dịch nguyên tử: chấp nhận giữ chỗ phải khóa tin và mọi đồ vật dùng chung (FR-08, NFR-02); hoàn tất và tính điểm không được lặp (NFR-03). Kế hoạch dự án (Phase 0, P0-01) yêu cầu "Maven multi-module/package cho Modular Monolith". Phiên bản stack kế thừa từ quyết định trước của nhóm: Java 21 (Temurin), Spring Boot 4.0.x, Maven 3.9.x qua wrapper, PostgreSQL 17, Flyway, Testcontainers.

## Quyết định

Chúng tôi xây dựng **một ứng dụng Spring Boot duy nhất** (một tiến trình, một cơ sở dữ liệu) tổ chức thành **Maven multi-module**, mỗi bounded context là một module:

```text
backend/
├── pom.xml            parent: quản lý phiên bản, plugin, JaCoCo, ArchUnit
├── app/               lớp khởi động Spring Boot, cấu hình chung, gom tất cả module
├── shared/            bảo mật JWT/RBAC, lỗi chuẩn, phân trang, sự kiện nội bộ
├── iam/  catalog/  chat/  order/  review/  gov/  notification/  media/
```

Ràng buộc:

- Module chỉ phụ thuộc module khác qua gói `application` (service + DTO); không import `domain`, `infrastructure` hay `api` của module khác. Hướng phụ thuộc theo bảng trong [kiến trúc](../README.md#2-module-backend-và-ranh-giới); Maven sẽ từ chối vòng phụ thuộc.
- Mỗi module sở hữu bảng và migration Flyway của mình, đặt tên `V<yyyyMMddHHmm>__<module>_<mô tả>.sql` để tránh trùng số giữa các thành viên.
- Phản hồi ngược giữa module dùng Spring application event trong cùng giao dịch; không gọi vòng.
- Giao dịch nguyên tử xuyên module (giữ chỗ, hoàn tất) nằm trong application service của module chủ (`order`), gọi service của `catalog`/`iam` trong cùng `@Transactional`.
- ArchUnit kiểm tra quy tắc trên trong CI (P0-04).

## Phương án đã cân nhắc

- **Monolith một module, chia theo package** (quyết định cũ của nhóm): đơn giản hơn, nhưng ranh giới chỉ là quy ước, dễ bị vi phạm khi 5 người làm song song; khó tách sau này.
- **Microservices**: tách được team, nhưng giữ chỗ nguyên tử xuyên dịch vụ cần saga/2PC, quá nặng cho 8 tuần và không tăng điểm OOAD.
- **Modular monolith multi-module** (chọn): ranh giới được Maven thực thi, vẫn giữ một giao dịch DB cho bất biến quan trọng, build và test đơn giản.

## Hệ quả

- Dễ hơn: phân công theo module trùng với phân công trong kế hoạch (iam, catalog, order, chat, review, gov); review PR theo module; ArchUnit bắt vi phạm sớm.
- Khó hơn: thêm pom cho mỗi module; thay đổi DTO công khai của module phải báo module phụ thuộc; phải kỷ luật khi đặt tên migration.
- Việc tiếp theo: P0-01 dựng parent pom và module rỗng theo cây trên; P0-04 thêm ArchUnit và JaCoCo gộp báo cáo đa module.
