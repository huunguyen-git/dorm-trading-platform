# P0-03 · Hạ tầng Docker, CSDL PostgreSQL và Kiểm thử Testcontainers

## Bối cảnh và Quyết định

Dự án monorepo backend của Nhóm 14 cần một hạ tầng CSDL quan hệ chuẩn hóa để lưu trữ và quản lý toàn bộ thực thể nghiệp vụ (UC-01 đến UC-40), dịch vụ giả lập email phục vụ OTP/thông báo, cùng cơ chế lưu trữ file ảnh vật phẩm/thẻ sinh viên.

1. **Hạ tầng Docker cục bộ**:
   - Sử dụng `docker-compose.yml` để điều phối 3 dịch vụ: PostgreSQL 16 Alpine (cổng 5432), Maildev (SMTP cổng 1025, Web UI cổng 1080) và MinIO S3 (cổng 9000, Web Console cổng 9001).
   - Thiết lập volume bền vững (`postgres_data`, `minio_data`) và kiểm tra sức khỏe `pg_isready` để đảm bảo cơ sở dữ liệu sẵn sàng trước khi kết nối.

2. **Quản lý phiên bản CSDL với Flyway**:
   - `V1__init_schema.sql`: Khởi tạo 15 bảng thực thể miền chuẩn hóa theo OOAD (vai_tro_quan_tri, thanh_viens, danh_mucs, do_vats, tin_dangs, tin_dang_do_vat, hoi_thoais, tin_nhans, giao_dichs, ma_xac_nhan_otp, danh_gias, bao_caos, khieu_nais, quyet_dinhs, thang_phats) kèm khóa chính UUID/BIGSERIAL, khóa ngoại tham chiếu chặt chẽ và ràng buộc CHECK enum.
   - `V2__seed_initial_data.sql`: Nạp trước 7 danh mục vật phẩm phòng trọ / KTX và các vai trò hệ thống mẫu phục vụ thử nghiệm.

3. **Chiến lược Kiểm thử Tích hợp Độc lập (Testcontainers & Spring Profiles)**:
   - Tích hợp `testcontainers-postgresql` qua `PostgresTestContainer.java` (Singleton pattern) kế thừa trong `BaseIntegrationTest.java`. Toàn bộ migration Flyway được áp dụng tự động trên container độc lập khi chạy test.
   - Tách bạch profile giữa test tầng Web/Bảo mật và test tầng Dữ liệu:
     - Profile `default` (`ApiSecurityTest` từ P0-01) loại trừ auto-configuration CSDL để chạy kiểm thử HTTP/JWT độc lập và cực nhanh mà không đòi hỏi CSDL thật.
     - Profile `test` (`FlywayMigrationIntegrationTest`, `HealthCheckIntegrationTest`) nạp toàn bộ cấu hình JPA, Flyway và tiêm URL động từ Testcontainers.
   - Endpoint `/api/v1/health` được mở rộng linh hoạt: khi không có DataSource vẫn trả về `status: UP` theo hợp đồng P0-01; khi DataSource sẵn sàng và kết nối hợp lệ, bổ sung `"database": "CONNECTED"`.

Xem thêm [đặc tả nghiệm thu P0-03](../specs/P0-03.md).
