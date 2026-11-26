-- ==============================================================================
-- Flyway Migration V7: Giữ chỗ nguyên tử, Lịch hẹn hai bên & Thông báo giao dịch
-- Tasks: P2-04 (UC-22, UC-23, UC-24), P2-05 (UC-25, UC-26)
-- Tham chiếu: FR-04, FR-07, FR-08, FR-09, NFR-01, NFR-02, NFR-03
-- ==============================================================================

-- 1. Bổ sung cột trên giao_dichs (tương thích ngược 100% với V1-V6)
-- Tách biệt thoi_diem_bat_dau_giao (UC-26) với thoi_diem_bao_giao / anh_ban_giao (UC-27)
ALTER TABLE giao_dichs
  ADD COLUMN IF NOT EXISTS ghi_chu TEXT,
  ADD COLUMN IF NOT EXISTS thoi_gian_hen_du_kien TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dia_diem_hen_du_kien VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lich_hen_da_xac_nhan BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS thoi_diem_bat_dau_giao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nguoi_huy_id UUID REFERENCES thanh_viens(user_id),
  ADD COLUMN IF NOT EXISTS thoi_diem_huy TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE giao_dichs
  ADD CONSTRAINT chk_giao_dichs_trang_thai
    CHECK (trang_thai IN ('YEU_CAU', 'GIU_CHO', 'DANG_GIAO', 'CHO_XAC_NHAN', 'CHO_XU_LY', 'HOAN_TAT', 'HUY')),
  ADD CONSTRAINT chk_giao_dichs_distinct_parties
    CHECK (nguoi_ban_id <> nguoi_mua_id);

-- Phòng vệ tầng CSDL (FR-08, NFR-02): tối đa 1 giữ chỗ hiệu lực trên mỗi tin đăng
CREATE UNIQUE INDEX IF NOT EXISTS uq_giao_dichs_active_listing
  ON giao_dichs(ma_tin)
  WHERE trang_thai IN ('GIU_CHO', 'DANG_GIAO', 'CHO_XAC_NHAN', 'CHO_XU_LY');

-- Ngăn gửi trùng yêu cầu YEU_CAU từ cùng người mua trên cùng tin (NFR-03),
-- vẫn cho phép người mua gửi không giới hạn yêu cầu trên các tin khác nhau (FR-08)
CREATE UNIQUE INDEX IF NOT EXISTS uq_giao_dichs_pending_buyer_listing
  ON giao_dichs(ma_tin, nguoi_mua_id)
  WHERE trang_thai = 'YEU_CAU';

CREATE INDEX IF NOT EXISTS idx_giao_dichs_buyer_status_created
  ON giao_dichs(nguoi_mua_id, trang_thai, thoi_diem_tao DESC);

CREATE INDEX IF NOT EXISTS idx_giao_dichs_seller_status_created
  ON giao_dichs(nguoi_ban_id, trang_thai, thoi_diem_tao DESC);

-- 2. Bảng liên kết snapshot đồ vật thuộc giao dịch (giao_dich_do_vat)
-- Phòng vệ tầng CSDL (FR-08, NFR-02): tối đa 1 giữ chỗ hiệu lực (giu_hieu_luc = TRUE) trên mỗi đồ vật,
-- đồng thời bảo toàn snapshot lịch sử đồ vật trên đơn đã hủy ngay cả khi xóa đồ vật ở kho cá nhân (UC-09).
CREATE TABLE IF NOT EXISTS giao_dich_do_vat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  ma_vat UUID REFERENCES do_vats(ma_vat) ON DELETE SET NULL,
  ten_vat_snapshot VARCHAR(255) NOT NULL DEFAULT '',
  tinh_trang_snapshot TEXT NOT NULL DEFAULT '',
  giu_hieu_luc BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_giao_dich_do_vat_order_item
  ON giao_dich_do_vat(ma_giao_dich, ma_vat)
  WHERE ma_vat IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_giao_dich_do_vat_active_item
  ON giao_dich_do_vat(ma_vat)
  WHERE giu_hieu_luc = TRUE AND ma_vat IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_giao_dich_do_vat_ma_giao_dich
  ON giao_dich_do_vat(ma_giao_dich);

CREATE INDEX IF NOT EXISTS idx_giao_dich_do_vat_ma_vat
  ON giao_dich_do_vat(ma_vat)
  WHERE ma_vat IS NOT NULL;

-- 3. Bảng đề xuất & xác nhận lịch hẹn giao nhận hai bên (UC-25)
CREATE TABLE IF NOT EXISTS lich_hen_giao_dichs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  nguoi_de_xuat_id UUID NOT NULL REFERENCES thanh_viens(user_id),
  thoi_gian_de_xuat TIMESTAMPTZ NOT NULL,
  dia_diem_de_xuat VARCHAR(255) NOT NULL,
  ghi_chu TEXT,
  trang_thai VARCHAR(30) NOT NULL DEFAULT 'CHO_XAC_NHAN',
  nguoi_phan_hoi_id UUID REFERENCES thanh_viens(user_id),
  thoi_diem_phan_hoi TIMESTAMPTZ,
  ly_do_tu_choi TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_lich_hen_trang_thai
    CHECK (trang_thai IN ('CHO_XAC_NHAN', 'DA_XAC_NHAN', 'TU_CHOI', 'DA_THAY_THE')),
  CONSTRAINT chk_lich_hen_distinct_responder
    CHECK (nguoi_phan_hoi_id IS NULL OR nguoi_phan_hoi_id <> nguoi_de_xuat_id)
);

CREATE INDEX IF NOT EXISTS idx_lich_hen_giao_dich_created
  ON lich_hen_giao_dichs(ma_giao_dich, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lich_hen_pending_per_order
  ON lich_hen_giao_dichs(ma_giao_dich)
  WHERE trang_thai = 'CHO_XAC_NHAN';

-- 4. Bảng thông báo trong ứng dụng (UC-22..26 & consumer ListingUpdatedWithPendingRequestsEvent từ P2-01)
CREATE TABLE IF NOT EXISTS thong_baos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nguoi_nhan_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
  loai VARCHAR(60) NOT NULL,
  tieu_de VARCHAR(255) NOT NULL,
  noi_dung TEXT NOT NULL,
  ma_tin UUID REFERENCES tin_dangs(ma_tin) ON DELETE SET NULL,
  ma_giao_dich UUID REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  da_doc BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_thong_baos_recipient
  ON thong_baos(nguoi_nhan_id, da_doc, created_at DESC);
