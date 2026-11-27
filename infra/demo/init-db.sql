-- Khởi tạo Database cho gói chạy demo độc lập (Dorm Trading Platform)
-- Bản sao tự chứa của infra/docker/postgres/init-db.sql để thư mục infra/demo/ chạy được không cần mã nguồn.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SET timezone = 'Asia/Ho_Chi_Minh';
