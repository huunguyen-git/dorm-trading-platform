# P0-01 · Tổ chức backend và hợp đồng xác thực

Một ứng dụng Maven, một JAR Spring Boot và sáu package miền dưới `com.dormtrading`. Cách tổ chức này cho phép P0-02 và P0-03 làm việc với cùng một tiến trình và đường dẫn API. Java package thể hiện ranh giới tổ chức mã. Khi thêm luồng nghiệp vụ, người review cần kiểm tra phụ thuộc giữa các miền.

Giữ lớp khởi động và cổng 8082 của nhánh P0-03. Dùng Temurin 21, Spring Boot 3.5.14 và Maven Wrapper dạng script tải Maven 3.9.16. Health trả trạng thái sống của tiến trình ở trường `status` và trạng thái kết nối ở trường `database`. Điều này cho phép P0-02 thử kết nối trước khi có PostgreSQL, còn P0-03 kiểm tra `CONNECTED` khi tích hợp DataSource.

Spring Security xác minh chữ ký HS256 bằng khóa ngẫu nhiên tối thiểu 32 byte, truyền dưới dạng Base64 qua `JWT_SECRET`. Mỗi môi trường dùng khóa riêng. Khi cấp token ở P1-01, backend đặt thời hạn `exp` và danh sách quyền hệ thống trong claim `roles`. Bên cấp token và bên kiểm tra cùng nằm trong backend. Khóa chỉ được cấp cho backend.

Dành `/api/v1/admin/**` cho quyền `ADMIN` (quản trị viên cấp cao). Quyền của kiểm duyệt viên đối với từng thao tác sẽ xác định theo UC tương ứng. Health công khai. Các route còn lại mặc định yêu cầu token hợp lệ, các task nghiệp vụ bổ sung kiểm tra quyền thao tác và quyền trên từng tài nguyên. Route thử quyền quản trị chỉ có trong tập test.

Khi tích hợp nhánh P0-03, giữ một lớp khởi động, một controller health và một chuỗi lọc bảo mật. Giữ POM và wrapper của P0-01, bổ sung dependency DB và migration từ P0-03, cấp khóa riêng trong môi trường test của P0-03, sau đó chạy lại integration test với PostgreSQL. P0-03 phụ trách phép thử này.
