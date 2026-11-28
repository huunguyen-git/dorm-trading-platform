-- ==============================================================================
-- Flyway Migration V15: Nhắn tin trực tiếp & Thương lượng giá (P2-03 / UC-21)
-- Tham chiếu: UC-21, FR-07, FR-08, FR-12, NFR-01
-- Phiên bản V15 được điều phối theo thứ tự merge sau V12 (PR #33), V13 (PR #38) và V14 (PR #39).
-- ==============================================================================

-- 1. Mở rộng bảng hoi_thoais để lưu mức giá thỏa thuận hiện hành và kiểm soát phiên bản
ALTER TABLE hoi_thoais
    ADD COLUMN gia_thoa_thuan INT,
    ADD COLUMN de_nghi_da_dong_y_id UUID,
    ADD COLUMN updated_at TIMESTAMPTZ,
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

-- Backfill updated_at từ thời điểm tin nhắn mới nhất hoặc thoi_diem_tao của hội thoại
UPDATE hoi_thoais h
SET updated_at = GREATEST(
    h.thoi_diem_tao,
    COALESCE((SELECT MAX(m.thoi_diem_gui) FROM tin_nhans m WHERE m.ma_hoi_thoai = h.ma_hoi_thoai), h.thoi_diem_tao)
)
WHERE h.updated_at IS NULL;

ALTER TABLE hoi_thoais
    ALTER COLUMN updated_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE hoi_thoais
    ADD CONSTRAINT chk_hoi_thoais_participants_distinct
        CHECK (nguoi_mua_id <> nguoi_ban_id),
    ADD CONSTRAINT chk_hoi_thoais_gia_thoa_thuan
        CHECK (gia_thoa_thuan IS NULL OR gia_thoa_thuan > 0);

CREATE INDEX idx_hoi_thoais_nguoi_mua_updated ON hoi_thoais(nguoi_mua_id, updated_at DESC, ma_hoi_thoai ASC);
CREATE INDEX idx_hoi_thoais_nguoi_ban_updated ON hoi_thoais(nguoi_ban_id, updated_at DESC, ma_hoi_thoai ASC);
CREATE INDEX idx_hoi_thoais_ma_tin ON hoi_thoais(ma_tin);

-- 2. Mở rộng bảng tin_nhans để hỗ trợ phân loại tin nhắn, vòng đời đề nghị giá và idempotency
ALTER TABLE tin_nhans
    ADD COLUMN sequence_no BIGSERIAL NOT NULL,
    ADD COLUMN loai_tin_nhan VARCHAR(30) NOT NULL DEFAULT 'VAN_BAN',
    ADD COLUMN trang_thai_de_nghi VARCHAR(30),
    ADD COLUMN hanh_dong_phan_hoi VARCHAR(30),
    ADD COLUMN ghi_chu_phan_hoi TEXT,
    ADD COLUMN de_nghi_goc_id UUID REFERENCES tin_nhans(ma_tin_nhan) ON DELETE SET NULL,
    ADD COLUMN client_message_id VARCHAR(120),
    ADD COLUMN phan_hoi_boi_id UUID REFERENCES thanh_viens(user_id) ON DELETE SET NULL,
    ADD COLUMN thoi_diem_phan_hoi TIMESTAMPTZ,
    ADD COLUMN updated_at TIMESTAMPTZ;

-- Chuẩn hóa updated_at và dữ liệu cũ (nếu có bản ghi tin_nhans từ trước V15)
UPDATE tin_nhans
SET updated_at = COALESCE(thoi_diem_gui, CURRENT_TIMESTAMP)
WHERE updated_at IS NULL;

ALTER TABLE tin_nhans
    ALTER COLUMN updated_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

-- Chuẩn hóa các dòng cũ có gia_de_nghi <= 0 thành NULL để thỏa mãn ràng buộc VAN_BAN
UPDATE tin_nhans
SET gia_de_nghi = NULL
WHERE gia_de_nghi IS NOT NULL AND gia_de_nghi <= 0;

-- Với các dòng cũ có gia_de_nghi > 0, chỉ giữ dòng mới nhất mỗi hội thoại là CHO_PHAN_HOI, các dòng cũ hơn là DA_THAY_THE
WITH ranked_legacy_offers AS (
    SELECT ma_tin_nhan,
           ROW_NUMBER() OVER (
               PARTITION BY ma_hoi_thoai
               ORDER BY thoi_diem_gui DESC, sequence_no DESC, ma_tin_nhan DESC
           ) AS rn
    FROM tin_nhans
    WHERE gia_de_nghi IS NOT NULL AND gia_de_nghi > 0
)
UPDATE tin_nhans m
SET loai_tin_nhan = 'DE_NGHI_GIA',
    trang_thai_de_nghi = CASE WHEN r.rn = 1 THEN 'CHO_PHAN_HOI' ELSE 'DA_THAY_THE' END
FROM ranked_legacy_offers r
WHERE m.ma_tin_nhan = r.ma_tin_nhan;

ALTER TABLE tin_nhans
    ADD CONSTRAINT chk_tin_nhans_loai
        CHECK (loai_tin_nhan IN ('VAN_BAN', 'DE_NGHI_GIA')),
    ADD CONSTRAINT chk_tin_nhans_trang_thai_de_nghi
        CHECK (trang_thai_de_nghi IS NULL OR trang_thai_de_nghi IN ('CHO_PHAN_HOI', 'DA_DONG_Y', 'DA_TU_CHOI', 'DA_THAY_THE')),
    ADD CONSTRAINT chk_tin_nhans_hanh_dong_phan_hoi
        CHECK (hanh_dong_phan_hoi IS NULL OR hanh_dong_phan_hoi IN ('ACCEPT', 'REJECT', 'COUNTER')),
    ADD CONSTRAINT chk_tin_nhans_de_nghi_integrity
        CHECK (
            (loai_tin_nhan = 'DE_NGHI_GIA' AND gia_de_nghi IS NOT NULL AND gia_de_nghi > 0 AND trang_thai_de_nghi IS NOT NULL)
            OR (loai_tin_nhan = 'VAN_BAN' AND gia_de_nghi IS NULL AND trang_thai_de_nghi IS NULL)
        );

ALTER TABLE hoi_thoais
    ADD CONSTRAINT fk_hoi_thoais_de_nghi_da_dong_y
        FOREIGN KEY (de_nghi_da_dong_y_id) REFERENCES tin_nhans(ma_tin_nhan) ON DELETE SET NULL;

-- Tối đa 1 đề nghị giá đang chờ phản hồi (CHO_PHAN_HOI) trong mỗi hội thoại
CREATE UNIQUE INDEX uq_tin_nhans_pending_offer
    ON tin_nhans(ma_hoi_thoai)
    WHERE loai_tin_nhan = 'DE_NGHI_GIA' AND trang_thai_de_nghi = 'CHO_PHAN_HOI';

-- Chống tạo trùng tin nhắn khi client gửi lại cùng client_message_id
CREATE UNIQUE INDEX uq_tin_nhans_client_msg
    ON tin_nhans(ma_hoi_thoai, nguoi_gui_id, client_message_id)
    WHERE client_message_id IS NOT NULL;

-- Thứ tự hiển thị ổn định theo thời gian và sequence_no
CREATE INDEX idx_tin_nhans_hoi_thoai_order
    ON tin_nhans(ma_hoi_thoai, thoi_diem_gui ASC, sequence_no ASC, ma_tin_nhan ASC);
