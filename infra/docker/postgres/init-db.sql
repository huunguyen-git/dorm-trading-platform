-- Khởi tạo Database cho Dự án Sàn Trao Đổi Đồ Dùng Phòng Trọ Sinh Viên (Dorm Trading Platform)
-- File: infra/docker/postgres/init-db.sql

-- Kích hoạt extension hỗ trợ UUID và Pgcrypto
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Thiết lập timezone mặc định theo giờ Việt Nam (UTC+7)
SET timezone = 'Asia/Ho_Chi_Minh';
