-- ==============================================================================
-- Flyway Migration V13: Hoàn tất giao dịch (Ảnh bàn giao, OTP 6 số) & Hủy sau báo giao
-- Tasks: P3-02 (UC-27, UC-28)
-- Tham chiếu: FR-04, FR-08, FR-09, FR-13, NFR-01, NFR-03
-- ==============================================================================

-- 1. Mở rộng bảng giao_dichs (tương thích ngược V1..V12 & sẵn sàng ghép P2-04/P2-05)
ALTER TABLE giao_dichs
  ADD COLUMN IF NOT EXISTS thoi_diem_bat_dau_giao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ghi_chu_ban_giao TEXT,
  ADD COLUMN IF NOT EXISTS nguoi_huy_id UUID REFERENCES thanh_viens(user_id),
  ADD COLUMN IF NOT EXISTS thoi_diem_huy TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ly_do_cho_xu_ly VARCHAR(40),
  ADD COLUMN IF NOT EXISTS thoi_diem_chuyen_xu_ly TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'chk_giao_dichs_trang_thai' AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE giao_dichs
      ADD CONSTRAINT chk_giao_dichs_trang_thai
        CHECK (trang_thai IN ('YEU_CAU', 'GIU_CHO', 'DANG_GIAO', 'CHO_XAC_NHAN', 'CHO_XU_LY', 'HOAN_TAT', 'HUY'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'chk_giao_dichs_distinct_parties' AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE giao_dichs
      ADD CONSTRAINT chk_giao_dichs_distinct_parties
        CHECK (nguoi_ban_id <> nguoi_mua_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'chk_giao_dichs_ly_do_cho_xu_ly' AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE giao_dichs
      ADD CONSTRAINT chk_giao_dichs_ly_do_cho_xu_ly
        CHECK (ly_do_cho_xu_ly IS NULL OR ly_do_cho_xu_ly IN ('OVERDUE_24H', 'CANCEL_DISPUTE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_giao_dichs_buyer_updated
  ON giao_dichs(nguoi_mua_id, updated_at DESC, ma_giao_dich DESC);

CREATE INDEX IF NOT EXISTS idx_giao_dichs_seller_updated
  ON giao_dichs(nguoi_ban_id, updated_at DESC, ma_giao_dich DESC);

CREATE INDEX IF NOT EXISTS idx_giao_dichs_overdue_confirm
  ON giao_dichs(thoi_diem_bao_giao, ma_giao_dich)
  WHERE trang_thai = 'CHO_XAC_NHAN' AND thoi_diem_bao_giao IS NOT NULL;

-- 2. Nâng cấp bảo mật bảng ma_xac_nhan_otp (NFR-01, FR-09, NFR-03)
-- Không còn ghi mã OTP dạng văn bản rõ vào ma_otp; lưu HMAC-SHA256 hash + AES-256-GCM ciphertext (xóa ngay khi hết hiệu lực)
ALTER TABLE ma_xac_nhan_otp
  ALTER COLUMN ma_otp DROP NOT NULL;

ALTER TABLE ma_xac_nhan_otp
  ADD COLUMN IF NOT EXISTS otp_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS otp_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS so_lan_thu_toi_da INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS bi_vo_hieu BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ly_do_vo_hieu VARCHAR(40),
  ADD COLUMN IF NOT EXISTS thoi_diem_dung TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nguoi_cap_id UUID REFERENCES thanh_viens(user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'chk_otp_max_attempts' AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE ma_xac_nhan_otp
      ADD CONSTRAINT chk_otp_max_attempts
        CHECK (so_lan_thu_toi_da = 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'chk_otp_attempts_bounds' AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE ma_xac_nhan_otp
      ADD CONSTRAINT chk_otp_attempts_bounds
        CHECK (so_lan_thu_sai >= 0 AND so_lan_thu_sai <= so_lan_thu_toi_da);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'chk_otp_expiry_after_issue' AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE ma_xac_nhan_otp
      ADD CONSTRAINT chk_otp_expiry_after_issue
        CHECK (thoi_diem_het_han > thoi_diem_phat);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'chk_otp_invalidation_reason' AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE ma_xac_nhan_otp
      ADD CONSTRAINT chk_otp_invalidation_reason
        CHECK (ly_do_vo_hieu IS NULL OR ly_do_vo_hieu IN ('CAP_LAI', 'VUOT_SO_LAN_SAI', 'DA_HUY_GIAO_DICH', 'HET_HAN'));
  END IF;
END $$;

-- Đảm bảo ở tầng CSDL mỗi giao dịch chỉ có tối đa 1 mã OTP đang hoạt động tại một thời điểm (FR-09)
CREATE UNIQUE INDEX IF NOT EXISTS uq_otp_active_per_order
  ON ma_xac_nhan_otp(ma_giao_dich)
  WHERE da_dung = FALSE AND bi_vo_hieu = FALSE;

CREATE INDEX IF NOT EXISTS idx_otp_order_issued
  ON ma_xac_nhan_otp(ma_giao_dich, thoi_diem_phat DESC, id DESC);

-- 3. Bảng ảnh bằng chứng bàn giao (tách biệt hoàn toàn khỏi media_files công khai theo NFR-01)
CREATE TABLE IF NOT EXISTS anh_ban_giao_giao_dichs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  nguoi_tai_len_id UUID NOT NULL REFERENCES thanh_viens(user_id),
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  original_filename VARCHAR(255),
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256 CHAR(64) NOT NULL,
  thu_tu INT NOT NULL DEFAULT 0 CHECK (thu_tu >= 0),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_anh_ban_giao_order
  ON anh_ban_giao_giao_dichs(ma_giao_dich, thu_tu ASC, uploaded_at ASC);

-- 4. Bảng yêu cầu hủy giao dịch sau báo giao & đồng thuận hai bên (UC-28, FR-08, NFR-03)
CREATE TABLE IF NOT EXISTS yeu_cau_huy_giao_dichs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  nguoi_yeu_cau_id UUID NOT NULL REFERENCES thanh_viens(user_id),
  ma_ly_do VARCHAR(50) NOT NULL DEFAULT 'OTHER'
    CHECK (ma_ly_do IN ('ITEM_NOT_AS_DESCRIBED', 'DEFECT_AT_HANDOVER', 'COMBO_MISSING_ITEM', 'MUTUAL_AGREEMENT', 'OTHER')),
  ly_do TEXT,
  trang_thai VARCHAR(30) NOT NULL DEFAULT 'CHO_XAC_NHAN'
    CHECK (trang_thai IN ('CHO_XAC_NHAN', 'DONG_Y', 'TU_CHOI', 'DA_DONG_DO_HOAN_TAT')),
  nguoi_phan_hoi_id UUID REFERENCES thanh_viens(user_id),
  phan_hoi_ghi_chu TEXT,
  thoi_diem_phan_hoi TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_yc_huy_distinct_responder
    CHECK (nguoi_phan_hoi_id IS NULL OR nguoi_phan_hoi_id <> nguoi_yeu_cau_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_yc_huy_pending_per_order
  ON yeu_cau_huy_giao_dichs(ma_giao_dich)
  WHERE trang_thai = 'CHO_XAC_NHAN';

CREATE INDEX IF NOT EXISTS idx_yc_huy_order_created
  ON yeu_cau_huy_giao_dichs(ma_giao_dich, created_at DESC, id DESC);

-- 5. Bảng nhật ký chuyển trạng thái giao dịch (truy vết UC-27, UC-28, UC-29)
CREATE TABLE IF NOT EXISTS lich_su_trang_thai_giao_dich (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  hanh_dong VARCHAR(60) NOT NULL,
  trang_thai_truoc VARCHAR(30),
  trang_thai_sau VARCHAR(30) NOT NULL,
  nguoi_thuc_hien_id UUID REFERENCES thanh_viens(user_id),
  vai_tro_thuc_hien VARCHAR(20) NOT NULL DEFAULT 'SYSTEM'
    CHECK (vai_tro_thuc_hien IN ('SELLER', 'BUYER', 'SYSTEM', 'MODERATOR')),
  ghi_chu TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lich_su_gd_order_created
  ON lich_su_trang_thai_giao_dich(ma_giao_dich, created_at ASC, id ASC);
