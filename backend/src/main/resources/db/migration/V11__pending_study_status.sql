-- P1-02 (review vòng 3): tình trạng học tập là trường học tập nên phải chờ duyệt như trường/ngành/niên khóa.
-- UC-05 cho phép người dùng tự khai DANG_HOC/DA_TOT_NGHIEP; giá trị chỉ có hiệu lực sau khi kiểm duyệt viên chấp thuận.
ALTER TABLE ho_so_cap_nhat ADD COLUMN trang_thai_sv VARCHAR(50);
ALTER TABLE ho_so_cap_nhat ADD CONSTRAINT chk_ho_so_cap_nhat_trang_thai_sv
    CHECK (trang_thai_sv IS NULL OR trang_thai_sv IN ('DANG_HOC', 'DA_TOT_NGHIEP'));
