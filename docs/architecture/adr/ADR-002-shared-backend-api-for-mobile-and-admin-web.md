# ADR-002: Một Backend API dùng chung cho mobile và web quản trị

Trạng thái: Chấp nhận
Ngày: 2026-10-28
Người quyết định: Tô Thành Nguyên (P0-05); Liên quan: Nguyễn Bảo Việt (P0-02, mobile và web), Nguyễn Hữu Nguyên (P0-01, API)

## Bối cảnh

Phạm vi dự án tách rõ hai nhóm người dùng: thành viên dùng **mobile** (React Native + Expo) cho toàn bộ nghiệp vụ mua/bán; kiểm duyệt viên và quản trị viên dùng **web quản trị** (React + Vite). Hai ứng dụng thao tác trên cùng dữ liệu (tài khoản, tin, giao dịch, báo cáo) và cùng quy tắc (hạn mức, khóa, điểm uy tín). Cần tránh hai bộ nghiệp vụ lệch nhau và tránh hai backend.

## Quyết định

Chúng tôi dùng **một Backend API REST duy nhất** tại `/api/v1` cho cả hai client.

- Hợp đồng là file **OpenAPI 3.1** trong `docs/api/openapi.yaml`; mobile và web sinh client TypeScript từ file này, không viết tay kiểu dữ liệu.
- Mọi quy tắc nghiệp vụ nằm ở backend. Client chỉ kiểm tra hình thức đầu vào (bắt buộc, định dạng) để phản hồi nhanh; backend luôn kiểm lại.
- Lỗi trả về theo một cấu trúc chung: `{ "code": "LISTING_QUOTA_EXCEEDED", "message": "...", "details": {...} }` với HTTP status đúng nghĩa (400 dữ liệu sai, 401 chưa đăng nhập, 403 không đủ quyền, 404, 409 xung đột trạng thái/khóa, 422 vi phạm quy tắc nghiệp vụ). Client dịch `code` sang thông điệp theo nền tảng.
- Phân trang dạng `?page=&size=` trả `{ items, page, size, total }`. Thời gian ISO-8601 UTC; tiền tệ số nguyên VND.
- Endpoint được gắn nhãn theo nhóm vai trò trong OpenAPI (`x-roles: [MEMBER]`, `[MODERATOR, SENIOR_ADMIN]`) để client biết màn nào gọi được và backend sinh kiểm quyền tương ứng ([ADR-003](ADR-003-jwt-rbac-role-boundaries.md)).
- Thay đổi hợp đồng làm gãy client (xóa trường, đổi kiểu, đổi mã lỗi) phải có PR riêng, gắn cả người làm mobile và web làm reviewer; thêm trường mới không gãy thì không cần.
- Không có BFF riêng cho từng client ở giai đoạn này; nếu màn hình quản trị cần dữ liệu tổng hợp, backend thêm endpoint đọc riêng trong module `gov`.

## Phương án đã cân nhắc

- **Hai backend (mobile API và admin API)**: tách được deploy, nhưng nhân đôi nghiệp vụ và DB access, trái mục tiêu modular monolith.
- **GraphQL**: linh hoạt cho mobile, nhưng nhóm chưa quen, công cụ kiểm thử (REST Assured, ZAP) và tài liệu khóa học nghiêng về REST.
- **REST + OpenAPI dùng chung** (chọn): đơn giản, sinh client tự động, kiểm thử hợp đồng bằng REST Assured, quét bảo mật bằng ZAP.

## Hệ quả

- Dễ hơn: một nguồn sự thật cho nghiệp vụ; mobile và web có thể làm song song dựa trên OpenAPI trước khi backend xong (mock server từ OpenAPI).
- Khó hơn: OpenAPI phải được cập nhật trước hoặc cùng PR với code; cần kỷ luật versioning (`/api/v1`, không phá hợp đồng trong cùng version).
- Việc tiếp theo: P0-01 khởi tạo `docs/api/openapi.yaml` với nhóm endpoint `auth`, `system`; P0-02 cấu hình sinh client TypeScript cho mobile và web từ file này.
