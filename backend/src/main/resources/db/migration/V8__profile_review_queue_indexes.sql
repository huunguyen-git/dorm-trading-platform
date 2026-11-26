-- P1-02 (bổ sung review): hàng đợi duyệt và tra cứu challenge.
-- Hồ sơ đã bị từ chối mà chưa gửi lại KHÔNG còn nằm trong hàng đợi, khớp với điều kiện của
-- ProfileService.pending()/pendingOrThrow(). Không sửa V6/V7 (đã áp dụng).
DROP INDEX IF EXISTS idx_thanh_viens_cho_duyet;
CREATE INDEX idx_thanh_viens_cho_duyet ON thanh_viens(updated_at DESC)
    WHERE email_verified AND ly_do_tu_choi IS NULL AND (NOT profile_approved OR cho_duyet_lai);

-- Đổi email (UC-06) tra challenge theo user_id ở mỗi lần phát hành/xác minh.
CREATE INDEX IF NOT EXISTS idx_auth_challenge_user ON auth_challenge(user_id);
