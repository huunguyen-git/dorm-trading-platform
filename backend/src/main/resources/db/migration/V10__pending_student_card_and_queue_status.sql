-- P1-02 (review vòng 2): ảnh thẻ mới chờ duyệt và hàng đợi loại tài khoản vô hiệu hóa.
-- UC-02/UC-05: đổi ảnh thẻ là thay đổi định danh nên phải chờ duyệt. Trước đây ảnh mới ghi thẳng
-- vào the_sinh_viens nên kiểm duyệt viên thấy hồ sơ "đã có ảnh" trong khi hồ sơ còn chờ duyệt và
-- ảnh cũ bị mất ngay. Nay ảnh chờ duyệt lưu riêng, chỉ chuyển sang the_sinh_viens khi chấp thuận.
CREATE TABLE the_sinh_viens_cho_duyet (
    user_id UUID PRIMARY KEY REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    object_key VARCHAR(255) NOT NULL,
    mime VARCHAR(50) NOT NULL,
    kich_thuoc INTEGER NOT NULL CHECK (kich_thuoc > 0),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tài khoản VO_HIEU_HOA không còn là hồ sơ chờ duyệt: ProfileService.pending() lọc đúng trạng thái này.
DROP INDEX IF EXISTS idx_thanh_viens_cho_duyet;
CREATE INDEX idx_thanh_viens_cho_duyet ON thanh_viens(updated_at DESC)
    WHERE email_verified AND ly_do_tu_choi IS NULL AND trang_thai_tai_khoan <> 'VO_HIEU_HOA'
      AND (NOT profile_approved OR cho_duyet_lai);
