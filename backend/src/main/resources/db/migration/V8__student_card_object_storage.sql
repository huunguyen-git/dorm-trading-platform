-- P1-02 (bổ sung): ảnh thẻ sinh viên chuyển khỏi Postgres sang object storage.
-- Căn cứ: NFR-01 (nơi lưu ảnh thẻ phải xác định trước khi dùng dữ liệu thật) và
-- docs/architecture/README.md §4 (ảnh lưu object storage riêng, chỉ đọc qua endpoint có kiểm quyền).
-- Không chuyển được BYTEA sang object storage bằng SQL nên bảng được tạo lại; người dùng tải lại ảnh thẻ.
DROP TABLE the_sinh_viens;

CREATE TABLE the_sinh_viens (
    user_id UUID PRIMARY KEY REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    object_key VARCHAR(255) NOT NULL,
    mime VARCHAR(50) NOT NULL,
    kich_thuoc INTEGER NOT NULL CHECK (kich_thuoc > 0),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
