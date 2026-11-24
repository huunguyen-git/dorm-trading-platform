-- ==============================================================================
-- Flyway Migration V6: Tin đăng, Tìm kiếm/Khám phá (P2-01, P2-02) & Lưu trữ Media
-- Tasks: P2-01 (UC-10, UC-17, UC-18), P2-02 (UC-19, UC-20)
-- Tham chiếu: FR-04, FR-05, FR-06, FR-13, NFR-01, NFR-02
-- ==============================================================================

-- 1. Bảng danh mục khu vực ĐHQG-HCM phục vụ chuẩn hóa vị trí & lọc khoảng cách (FR-04, FR-06)
CREATE TABLE IF NOT EXISTS khu_vucs (
  ma_khu_vuc VARCHAR(50) PRIMARY KEY,
  ten VARCHAR(150) NOT NULL,
  nhom VARCHAR(30) NOT NULL CHECK (nhom IN ('KTX', 'TRUONG', 'LAN_CAN')),
  vi_do DOUBLE PRECISION NOT NULL CHECK (vi_do BETWEEN -90 AND 90),
  kinh_do DOUBLE PRECISION NOT NULL CHECK (kinh_do BETWEEN -180 AND 180),
  hien_thi BOOLEAN NOT NULL DEFAULT TRUE,
  thu_tu INT NOT NULL DEFAULT 0
);

INSERT INTO khu_vucs (ma_khu_vuc, ten, nhom, vi_do, kinh_do, hien_thi, thu_tu) VALUES
  ('KTX_KHU_A', 'KTX Khu A ĐHQG-HCM', 'KTX', 10.8782, 106.8063, TRUE, 1),
  ('KTX_KHU_B', 'KTX Khu B ĐHQG-HCM', 'KTX', 10.8824, 106.7825, TRUE, 2),
  ('UIT', 'Trường ĐH Công nghệ Thông tin (UIT)', 'TRUONG', 10.8700, 106.8031, TRUE, 3),
  ('BACH_KHOA_CS2', 'Trường ĐH Bách Khoa (CS2 - Dĩ An)', 'TRUONG', 10.8806, 106.8054, TRUE, 4),
  ('KHTN', 'Trường ĐH Khoa học Tự nhiên (CS Linh Trung)', 'TRUONG', 10.8756, 106.7991, TRUE, 5),
  ('KHXH_NV', 'Trường ĐH Khoa học Xã hội & Nhân văn (CS Thủ Đức)', 'TRUONG', 10.8719, 106.8016, TRUE, 6),
  ('UEL', 'Trường ĐH Kinh tế - Luật (UEL)', 'TRUONG', 10.8706, 106.7782, TRUE, 7),
  ('IU', 'Trường ĐH Quốc tế (IU)', 'TRUONG', 10.8776, 106.8017, TRUE, 8),
  ('NVH_SV', 'Nhà Văn hóa Sinh viên ĐHQG-HCM', 'LAN_CAN', 10.8752, 106.8007, TRUE, 9)
ON CONFLICT (ma_khu_vuc) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_khu_vucs_hien_thi_thu_tu ON khu_vucs(hien_thi, thu_tu);

-- 2. Bổ sung danh mục con idempotent (giữ nguyên toàn bộ 7 danh mục V2)
INSERT INTO danh_mucs (ma_danh_muc, ten, danh_muc_cha_id, mo_ta, hien_thi) VALUES
  ('GT_DAI_CUONG', 'Giáo trình Đại cương', 'GIAO_TRINH', 'Giáo trình toán cao cấp, vật lý đại cương, lý luận chính trị ĐHQG-HCM', TRUE),
  ('GT_NGOAI_NGU', 'Sách Ngoại ngữ', 'GIAO_TRINH', 'Sách luyện thi TOEIC, IELTS, tiếng Anh, tiếng Nhật sinh viên', TRUE),
  ('TB_DIEN_TU', 'Thiết bị học tập & điện tử', 'THIET_BI_DIEN', 'Máy tính bỏ túi, phụ kiện máy tính, tai nghe, thiết bị học tập', TRUE)
ON CONFLICT (ma_danh_muc) DO NOTHING;

-- 3. Bổ sung cột mới trên tin_dangs (nullable/DEFAULT để tương thích ngược với dữ liệu/test hiện có)
ALTER TABLE tin_dangs
  ADD COLUMN IF NOT EXISTS tinh_trang TEXT,
  ADD COLUMN IF NOT EXISTS ma_mon_hoc VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ten_mon_hoc VARCHAR(200),
  ADD COLUMN IF NOT EXISTS tac_gia VARCHAR(200),
  ADD COLUMN IF NOT EXISTS ma_khu_vuc VARCHAR(50) REFERENCES khu_vucs(ma_khu_vuc),
  ADD COLUMN IF NOT EXISTS vi_do DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS kinh_do DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renewal_reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS so_lan_gia_han INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ly_do_an TEXT;

ALTER TABLE tin_dangs
  ADD CONSTRAINT chk_tin_dangs_vi_do
    CHECK (vi_do IS NULL OR vi_do BETWEEN -90 AND 90),
  ADD CONSTRAINT chk_tin_dangs_kinh_do
    CHECK (kinh_do IS NULL OR kinh_do BETWEEN -180 AND 180),
  ADD CONSTRAINT chk_tin_dangs_so_lan_gia_han
    CHECK (so_lan_gia_han >= 0),
  ADD CONSTRAINT chk_tin_dangs_hinh_thuc
    CHECK (hinh_thuc IN ('BAN_LE', 'BAN_COMBO', 'CHO_TANG')),
  ADD CONSTRAINT chk_tin_dangs_cho_tang_gia
    CHECK (hinh_thuc <> 'CHO_TANG' OR gia_vnd = 0),
  ADD CONSTRAINT chk_tin_dangs_trang_thai
    CHECK (trang_thai IN ('NHAP', 'CHO_DUYET', 'CONG_KHAI', 'GIU_CHO', 'DA_RUT', 'HET_HAN', 'AN', 'KET_THUC'));

ALTER TABLE do_vats
  ADD CONSTRAINT chk_do_vats_trang_thai
    CHECK (trang_thai IN ('KHA_DUNG', 'DANG_GIU', 'DA_CHUYEN_GIAO'));

-- 4. Bảng siêu dữ liệu tệp hình ảnh tải lên (Media Upload - FR-04)
CREATE TABLE IF NOT EXISTS media_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  original_filename VARCHAR(255),
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Chỉ mục tối ưu truy vấn hạn mức, khám phá công khai, hết hạn FR-13 & đánh giá người bán
CREATE INDEX IF NOT EXISTS idx_tin_dang_do_vat_ma_vat ON tin_dang_do_vat(ma_vat);
CREATE INDEX IF NOT EXISTS idx_danh_mucs_cha ON danh_mucs(danh_muc_cha_id);
CREATE INDEX IF NOT EXISTS idx_tin_dangs_nguoi_dang_trang_thai ON tin_dangs(nguoi_dang_id, trang_thai);

CREATE INDEX IF NOT EXISTS idx_tin_dangs_public_created
  ON tin_dangs(created_at DESC, ma_tin)
  WHERE trang_thai = 'CONG_KHAI';

CREATE INDEX IF NOT EXISTS idx_tin_dangs_public_price
  ON tin_dangs(gia_vnd, created_at DESC)
  WHERE trang_thai = 'CONG_KHAI';

CREATE INDEX IF NOT EXISTS idx_tin_dangs_public_category
  ON tin_dangs(ma_danh_muc)
  WHERE trang_thai = 'CONG_KHAI';

CREATE INDEX IF NOT EXISTS idx_tin_dangs_public_course
  ON tin_dangs(lower(ma_mon_hoc))
  WHERE trang_thai = 'CONG_KHAI' AND ma_mon_hoc IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tin_dangs_public_zone
  ON tin_dangs(ma_khu_vuc)
  WHERE trang_thai = 'CONG_KHAI' AND ma_khu_vuc IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tin_dangs_expires_at
  ON tin_dangs(expires_at)
  WHERE trang_thai = 'CONG_KHAI' AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_danh_gias_seller_approved
  ON danh_gias(nguoi_bi_danh_gia_id)
  WHERE trang_thai = 'CHAP_NHAN';

CREATE INDEX IF NOT EXISTS idx_media_files_owner
  ON media_files(owner_id, created_at DESC);
