-- ==============================================================================
-- Flyway Migration V14: Xử lý giao dịch quá hạn / tranh chấp & Bằng chứng bổ sung
-- Task: P3-03 (UC-29)
-- Tham chiếu: FR-05, FR-08, FR-09, FR-10, FR-12, FR-13, NFR-01, NFR-02, NFR-03
-- Thiết kế 100% idempotent với cả V13 trên main (P2-04/P2-05) và P3-02 (PR #38)
-- ==============================================================================

-- 1. Mở rộng bảng giao_dichs phục vụ chuyển xử lý, SLA 3 ngày làm việc & hạn đánh giá 15 ngày
ALTER TABLE giao_dichs
  ADD COLUMN IF NOT EXISTS thoi_diem_bat_dau_giao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ghi_chu_ban_giao TEXT,
  ADD COLUMN IF NOT EXISTS nguoi_huy_id UUID REFERENCES thanh_viens(user_id),
  ADD COLUMN IF NOT EXISTS thoi_diem_huy TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ly_do_cho_xu_ly VARCHAR(40),
  ADD COLUMN IF NOT EXISTS thoi_diem_chuyen_xu_ly TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS han_phan_hoi_kdv TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS han_danh_gia_den TIMESTAMPTZ,
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

CREATE INDEX IF NOT EXISTS idx_giao_dichs_overdue_confirm
  ON giao_dichs(thoi_diem_bao_giao, ma_giao_dich)
  WHERE trang_thai = 'CHO_XAC_NHAN' AND thoi_diem_bao_giao IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_giao_dichs_dispute_queue
  ON giao_dichs(thoi_diem_chuyen_xu_ly DESC, ma_giao_dich DESC)
  WHERE trang_thai = 'CHO_XU_LY';

-- 2. Mở rộng tương thích bảng ma_xac_nhan_otp (vô hiệu hóa mã khi KDV ra quyết định - UC-29 / FR-09)
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
END $$;

ALTER TABLE ma_xac_nhan_otp
  DROP CONSTRAINT IF EXISTS chk_otp_invalidation_reason;

ALTER TABLE ma_xac_nhan_otp
  ADD CONSTRAINT chk_otp_invalidation_reason
    CHECK (
      ly_do_vo_hieu IS NULL OR ly_do_vo_hieu IN (
        'CAP_LAI',
        'VUOT_SO_LAN_SAI',
        'DA_HUY_GIAO_DICH',
        'HET_HAN',
        'QUYET_DINH_KIEM_DUYET'
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_otp_active_per_order
  ON ma_xac_nhan_otp(ma_giao_dich)
  WHERE da_dung = FALSE AND bi_vo_hieu = FALSE;

CREATE INDEX IF NOT EXISTS idx_otp_order_issued
  ON ma_xac_nhan_otp(ma_giao_dich, thoi_diem_phat DESC, id DESC);

-- 3. Khởi tạo idempotent các bảng liên thông với P3-02 (PR #38) nếu chưa tồn tại
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

-- 4. Mở rộng danh mục action_type trong nhat_ky_kiem_duyet để ghi nhận kiểm duyệt tranh chấp (UC-29)
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conrelid = 'nhat_ky_kiem_duyet'::regclass
      AND n.nspname = current_schema()
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%action_type%'
  LOOP
    EXECUTE format('ALTER TABLE nhat_ky_kiem_duyet DROP CONSTRAINT %I', v_conname);
  END LOOP;

  ALTER TABLE nhat_ky_kiem_duyet
    ADD CONSTRAINT chk_nhat_ky_kiem_duyet_action_type
      CHECK (action_type IN (
        'UPDATE_IDENTITY',
        'LOCK_TEMPORARY',
        'LOCK_PERMANENT',
        'UNLOCK_MANUAL',
        'UNLOCK_EXPIRED_TEMP',
        'THRESHOLD_LOCK_TEMPORARY',
        'THRESHOLD_LOCK_PERMANENT',
        'DISPUTE_DECIDED_COMPLETE',
        'DISPUTE_DECIDED_CANCEL',
        'DISPUTE_EVIDENCE_REQUESTED'
      ));
END $$;

-- 5. Các bảng nghiệp vụ cốt lõi cho P3-03 (UC-29)

-- 5.1 Quyết định xử lý tranh chấp bất biến 1-1 trên mỗi giao dịch (UC-29 §4, NFR-03)
CREATE TABLE IF NOT EXISTS quyet_dinh_giao_dichs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  nguoi_quyet_dinh_id UUID NOT NULL REFERENCES thanh_viens(user_id),
  ket_luan VARCHAR(30) NOT NULL,
  can_cu TEXT NOT NULL,
  tin_dang_trang_thai_sau VARCHAR(30),
  ly_do_an_tin TEXT,
  thoi_diem TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_quyet_dinh_gd UNIQUE (ma_giao_dich),
  CONSTRAINT chk_quyet_dinh_gd_ket_luan CHECK (ket_luan IN ('HOAN_TAT', 'HUY')),
  CONSTRAINT chk_quyet_dinh_gd_can_cu CHECK (length(btrim(can_cu)) >= 10)
);

CREATE INDEX IF NOT EXISTS idx_quyet_dinh_gd_decided_at
  ON quyet_dinh_giao_dichs(thoi_diem DESC, id DESC);

-- 5.2 Yêu cầu bổ sung bằng chứng từ Kiểm duyệt viên (UC-29 Alt 2)
CREATE TABLE IF NOT EXISTS yeu_cau_bo_sung_giao_dichs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  nguoi_yeu_cau_id UUID NOT NULL REFERENCES thanh_viens(user_id),
  ben_duoc_yeu_cau VARCHAR(20) NOT NULL,
  noi_dung TEXT NOT NULL,
  han_bo_sung TIMESTAMPTZ NOT NULL,
  trang_thai VARCHAR(30) NOT NULL DEFAULT 'CHO_BO_SUNG',
  thoi_diem_tao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  thoi_diem_phan_hoi TIMESTAMPTZ,
  CONSTRAINT chk_yc_bo_sung_target CHECK (ben_duoc_yeu_cau IN ('BUYER', 'SELLER', 'BOTH')),
  CONSTRAINT chk_yc_bo_sung_noi_dung CHECK (length(btrim(noi_dung)) >= 5),
  CONSTRAINT chk_yc_bo_sung_trang_thai CHECK (trang_thai IN ('CHO_BO_SUNG', 'DA_PHAN_HOI', 'QUA_HAN', 'DA_DONG'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_yc_bo_sung_open_per_order
  ON yeu_cau_bo_sung_giao_dichs(ma_giao_dich)
  WHERE trang_thai = 'CHO_BO_SUNG';

CREATE INDEX IF NOT EXISTS idx_yc_bo_sung_order_created
  ON yeu_cau_bo_sung_giao_dichs(ma_giao_dich, thoi_diem_tao DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_yc_bo_sung_due_open
  ON yeu_cau_bo_sung_giao_dichs(han_bo_sung, id)
  WHERE trang_thai = 'CHO_BO_SUNG';

-- 5.3 Phản hồi bổ sung của người mua / người bán (mỗi vai trò tối đa 1 phản hồi trên mỗi yêu cầu)
CREATE TABLE IF NOT EXISTS phan_hoi_bo_sung_giao_dichs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yeu_cau_id UUID NOT NULL REFERENCES yeu_cau_bo_sung_giao_dichs(id) ON DELETE CASCADE,
  ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  nguoi_gui_id UUID NOT NULL REFERENCES thanh_viens(user_id),
  vai_tro_gui VARCHAR(20) NOT NULL,
  noi_dung TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_phan_hoi_yeu_cau_role UNIQUE (yeu_cau_id, vai_tro_gui),
  CONSTRAINT chk_phan_hoi_vai_tro CHECK (vai_tro_gui IN ('BUYER', 'SELLER')),
  CONSTRAINT chk_phan_hoi_noi_dung CHECK (length(btrim(noi_dung)) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_phan_hoi_yeu_cau_created
  ON phan_hoi_bo_sung_giao_dichs(yeu_cau_id, created_at ASC, id ASC);

-- 5.4 Ảnh bằng chứng bổ sung riêng tư (tách biệt hoàn toàn khỏi media_files công khai - NFR-01)
CREATE TABLE IF NOT EXISTS bang_chung_bo_sung_giao_dichs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phan_hoi_id UUID NOT NULL REFERENCES phan_hoi_bo_sung_giao_dichs(id) ON DELETE CASCADE,
  ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  nguoi_tai_len_id UUID NOT NULL REFERENCES thanh_viens(user_id),
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  original_filename VARCHAR(255),
  content_type VARCHAR(50) NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_bang_chung_content_type CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT chk_bang_chung_size_bytes CHECK (size_bytes > 0 AND size_bytes <= 5242880)
);

CREATE INDEX IF NOT EXISTS idx_bang_chung_phan_hoi_uploaded
  ON bang_chung_bo_sung_giao_dichs(phan_hoi_id, uploaded_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_bang_chung_order
  ON bang_chung_bo_sung_giao_dichs(ma_giao_dich);
