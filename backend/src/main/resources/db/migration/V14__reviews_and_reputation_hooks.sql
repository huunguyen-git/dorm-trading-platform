-- ==============================================================================
-- Flyway Migration V14: Đánh giá giao dịch, Lịch sử phiên bản, Bằng chứng riêng tư
--                       & Thưởng +1 điểm sau 15 ngày không đánh giá
-- Tasks: P3-04 (UC-30, UC-31, UC-32); tương thích tiến P3-05 (UC-33, UC-34)
-- Tham chiếu: FR-10, FR-12, NFR-01, NFR-03
-- ==============================================================================

-- 1. Bổ sung cột theo dõi thưởng +1 sau 15 ngày không đánh giá trên giao_dichs (FR-10, NFR-03)
ALTER TABLE giao_dichs
  ADD COLUMN IF NOT EXISTS da_cong_diem_khong_danh_gia BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS thoi_diem_cong_diem_khong_danh_gia TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_giao_dichs_no_review_bonus_due
  ON giao_dichs(thoi_diem_hoan_tat, ma_giao_dich)
  WHERE trang_thai = 'HOAN_TAT'
    AND thoi_diem_hoan_tat IS NOT NULL
    AND da_cong_diem_khong_danh_gia = FALSE;

-- 2. Mở rộng bảng danh_gias & thay ràng buộc UNIQUE vô điều kiện bằng partial unique (UC-31, UC-32, UC-33, UC-34)
ALTER TABLE danh_gias
  ADD COLUMN IF NOT EXISTS phien_ban_hien_tai INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS diem_da_ap_dung INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queue_entered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thoi_diem_cong_khai TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nguoi_xet_id UUID REFERENCES thanh_viens(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS create_idempotency_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Gỡ ràng buộc UNIQUE(ma_giao_dich) vô điều kiện từ V1 để giữ lịch sử bản ghi DA_XOA
-- và cho phép người mua đánh giá lại trong hạn 15 ngày sau khi xóa mềm (UC-32)
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'danh_gias'::regclass
      AND c.contype = 'u'
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'ma_giao_dich'
  LOOP
    EXECUTE format('ALTER TABLE danh_gias DROP CONSTRAINT %I', v_conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_danh_gias_trang_thai'
      AND conrelid = 'danh_gias'::regclass
  ) THEN
    ALTER TABLE danh_gias
      ADD CONSTRAINT chk_danh_gias_trang_thai
        CHECK (trang_thai IN ('CHO_XET', 'CHAP_NHAN', 'BI_BAC', 'DA_GO', 'DA_XOA'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_danh_gias_distinct_parties'
      AND conrelid = 'danh_gias'::regclass
  ) THEN
    ALTER TABLE danh_gias
      ADD CONSTRAINT chk_danh_gias_distinct_parties
        CHECK (nguoi_danh_gia_id <> nguoi_bi_danh_gia_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_danh_gias_phien_ban_hien_tai'
      AND conrelid = 'danh_gias'::regclass
  ) THEN
    ALTER TABLE danh_gias
      ADD CONSTRAINT chk_danh_gias_phien_ban_hien_tai
        CHECK (phien_ban_hien_tai >= 1);
  END IF;
END $$;

-- Tối đa 1 đánh giá hiệu lực (không phải DA_XOA) cho mỗi giao dịch (FR-10, NFR-03, UC-32)
CREATE UNIQUE INDEX IF NOT EXISTS uq_danh_gias_active_order
  ON danh_gias(ma_giao_dich)
  WHERE trang_thai <> 'DA_XOA';

-- Hàng đợi kiểm duyệt 1-3 sao giữ nguyên thứ tự FIFO theo queue_entered_at khi sửa (UC-31 Alt 2, UC-34)
CREATE INDEX IF NOT EXISTS idx_danh_gias_moderation_queue
  ON danh_gias(queue_entered_at ASC, ma_danh_gia ASC)
  WHERE trang_thai = 'CHO_XET';

-- Chỉ mục truy vấn danh sách đánh giá công khai theo người bán
CREATE INDEX IF NOT EXISTS idx_danh_gias_seller_public_created
  ON danh_gias(nguoi_bi_danh_gia_id, (COALESCE(thoi_diem_cong_khai, thoi_diem_tao)) DESC, ma_danh_gia DESC)
  WHERE trang_thai = 'CHAP_NHAN';

-- Chỉ mục đối chiếu idempotency key gửi lặp đánh giá (UC-30, NFR-03)
CREATE INDEX IF NOT EXISTS idx_danh_gias_order_idemp
  ON danh_gias(ma_giao_dich, create_idempotency_key)
  WHERE trang_thai <> 'DA_XOA' AND create_idempotency_key IS NOT NULL;

-- Backfill dữ liệu đánh giá cũ (nếu nâng cấp từ V13 -> V14)
UPDATE danh_gias
SET thoi_diem_cong_khai = COALESCE(thoi_diem_xet, thoi_diem_tao)
WHERE trang_thai = 'CHAP_NHAN'
  AND thoi_diem_cong_khai IS NULL;

UPDATE danh_gias
SET queue_entered_at = thoi_diem_tao
WHERE trang_thai = 'CHO_XET'
  AND queue_entered_at IS NULL;

-- 3. Bảng lịch sử phiên bản đánh giá (UC-30, UC-31, UC-32, UC-33, UC-34)
CREATE TABLE IF NOT EXISTS danh_gia_phien_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_danh_gia UUID NOT NULL REFERENCES danh_gias(ma_danh_gia) ON DELETE CASCADE,
  version_no INT NOT NULL CHECK (version_no >= 1),
  so_sao INT NOT NULL CHECK (so_sao BETWEEN 1 AND 5),
  nhan_xet TEXT,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  evidence_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  trang_thai VARCHAR(30) NOT NULL CHECK (trang_thai IN ('CHO_XET', 'CHAP_NHAN', 'BI_BAC', 'DA_GO', 'DA_XOA')),
  score_delta_applied INT NOT NULL DEFAULT 0,
  apply_ledger_entry_id UUID REFERENCES lich_su_diem_uy_tin(id) ON DELETE SET NULL,
  reverse_ledger_entry_id UUID REFERENCES lich_su_diem_uy_tin(id) ON DELETE SET NULL,
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_danh_gia_phien_ban UNIQUE (ma_danh_gia, version_no)
);

CREATE INDEX IF NOT EXISTS idx_danh_gia_phien_bans_review
  ON danh_gia_phien_bans(ma_danh_gia, version_no DESC);

-- Backfill phiên bản 1 cho các đánh giá đã tồn tại trước V14 (nếu có)
INSERT INTO danh_gia_phien_bans(
  ma_danh_gia, version_no, so_sao, nhan_xet, evidence_ids, evidence_snapshot,
  trang_thai, score_delta_applied, created_at
)
SELECT
  d.ma_danh_gia,
  1,
  d.so_sao,
  d.nhan_xet,
  '{}'::uuid[],
  '[]'::jsonb,
  d.trang_thai,
  d.diem_da_ap_dung,
  d.thoi_diem_tao
FROM danh_gias d
ON CONFLICT (ma_danh_gia, version_no) DO NOTHING;

-- 4. Bảng bằng chứng đánh giá riêng tư (NFR-01 — tách biệt hoàn toàn với media_files công khai)
CREATE TABLE IF NOT EXISTS danh_gia_bang_chungs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
  ma_danh_gia UUID REFERENCES danh_gias(ma_danh_gia) ON DELETE SET NULL,
  nguoi_tai_len_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  original_filename VARCHAR(255),
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256 CHAR(64) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_danh_gia_bang_chungs_review
  ON danh_gia_bang_chungs(ma_danh_gia)
  WHERE ma_danh_gia IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_danh_gia_bang_chungs_order_uploader
  ON danh_gia_bang_chungs(ma_giao_dich, nguoi_tai_len_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_danh_gia_bang_chungs_uploader
  ON danh_gia_bang_chungs(nguoi_tai_len_id);

CREATE INDEX IF NOT EXISTS idx_danh_gia_bang_chungs_draft_created
  ON danh_gia_bang_chungs(created_at ASC, id ASC)
  WHERE ma_danh_gia IS NULL;

-- 5. Chỉ mục hỗ trợ kiểm tra khóa khiếu nại & quyết định kiểm duyệt (P3-04 <-> P3-05)
CREATE INDEX IF NOT EXISTS idx_khieu_nais_danh_gia_trang_thai
  ON khieu_nais(ma_danh_gia, trang_thai);

CREATE INDEX IF NOT EXISTS idx_quyet_dinhs_khieu_nai
  ON quyet_dinhs(ma_khieu_nai)
  WHERE ma_khieu_nai IS NOT NULL;
