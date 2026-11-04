# P0-01 · Tổ chức backend và hợp đồng xác thực

Một ứng dụng Maven, một JAR Spring Boot và sáu package miền dưới `com.dormtrading`. Cách tổ chức này cho phép P0-02 và P0-03 làm việc với cùng một tiến trình và đường dẫn API. Java package thể hiện ranh giới tổ chức mã. Khi thêm luồng nghiệp vụ, người review cần kiểm tra phụ thuộc giữa các miền.

Giữ lớp khởi động và cổng 8082 của nhánh P0-03. Dùng Temurin 21, Spring Boot 3.5.14 và Maven Wrapper dạng script tải Maven 3.9.16. Health báo tiến trình backend đang phục vụ HTTP. P0-02 có thể thử kết nối trước khi có PostgreSQL.

Spring Security xác minh chữ ký HS256 bằng khóa ngẫu nhiên tối thiểu 32 byte, truyền dưới dạng Base64 qua `JWT_SECRET`. Mỗi môi trường dùng khóa riêng. Khi cấp token ở P1-01, backend đặt thời hạn `exp` và danh sách quyền hệ thống trong claim `roles`. Bên cấp token và bên kiểm tra cùng nằm trong backend. Khóa chỉ được cấp cho backend.

Dành `/api/v1/admin/**` cho quyền `ADMIN` (quản trị viên cấp cao). Quyền của kiểm duyệt viên đối với từng thao tác sẽ xác định theo UC tương ứng. Health công khai. Các route còn lại mặc định yêu cầu token hợp lệ, các task nghiệp vụ bổ sung kiểm tra quyền thao tác và quyền trên từng tài nguyên. Route thử quyền quản trị chỉ có trong tập test.

Xem [bàn giao tích hợp cho từng task](../specs/P0-01.md#hướng-dẫn-tích-hợp).
