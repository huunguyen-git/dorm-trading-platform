-- ==============================================================================
-- Flyway Migration V14: Khiếu nại & Kiểm duyệt Đánh giá (P3-05 / UC-33, UC-34)
-- Tham chiếu: FR-10, FR-12, NFR-01, NFR-03; nối tiếp V5 (Reputation Ledger) & V13
-- ==============================================================================

-- 1. Mở rộng bảng danh_gias để hỗ trợ xét duyệt 1-3 sao (UC-34) và khóa sửa khi có khiếu nại (UC-33)
ALTER TABLE danh_gias
    ADD COLUMN IF NOT EXISTS thoi_diem_cong_khai TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS nguoi_xet_id UUID REFERENCES thanh_viens(user_id),
    ADD COLUMN IF NOT EXISTS can_cu_xet TEXT,
    ADD COLUMN IF NOT EXISTS diem_tac_dong INT,
    ADD COLUMN IF NOT EXISTS khoa_chinh_sua BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS yeu_cau_bo_sung_trang_thai VARCHAR(30);

ALTER TABLE danh_gias
    ADD CONSTRAINT ck_danh_gias_trang_thai
        CHECK (trang_thai IN ('CHO_XET', 'CHAP_NHAN', 'BI_BAC', 'DA_GO', 'DA_XOA')),
    ADD CONSTRAINT ck_danh_gias_bo_sung
        CHECK (yeu_cau_bo_sung_trang_thai IS NULL OR yeu_cau_bo_sung_trang_thai IN ('CHO_BO_SUNG', 'DA_BO_SUNG'));

CREATE INDEX IF NOT EXISTS idx_danh_gias_moderation_queue
    ON danh_gias (trang_thai, thoi_diem_tao DESC, ma_danh_gia DESC)
    WHERE trang_thai = 'CHO_XET';

CREATE INDEX IF NOT EXISTS idx_danh_gias_seller_created
    ON danh_gias (nguoi_bi_danh_gia_id, thoi_diem_tao DESC, ma_danh_gia DESC);

-- 2. Mở rộng bảng khieu_nais cho luồng UC-33 & UC-34
ALTER TABLE khieu_nais
    ADD COLUMN IF NOT EXISTS ma_ly_do VARCHAR(100),
    ADD COLUMN IF NOT EXISTS mo_ta TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS phien_ban_danh_gia BIGINT NOT NULL DEFAULT 0 CHECK (phien_ban_danh_gia >= 0),
    ADD COLUMN IF NOT EXISTS noi_dung_danh_gia_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS ket_luan VARCHAR(30),
    ADD COLUMN IF NOT EXISTS can_cu_xu_ly TEXT,
    ADD COLUMN IF NOT EXISTS nguoi_xu_ly_id UUID REFERENCES thanh_viens(user_id),
    ADD COLUMN IF NOT EXISTS thoi_diem_xu_ly TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS thoi_diem_rut TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS yeu_cau_bo_sung_trang_thai VARCHAR(30),
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0);

ALTER TABLE khieu_nais
    ADD CONSTRAINT ck_khieu_nais_trang_thai
        CHECK (trang_thai IN ('CHO_XU_LY', 'DA_XU_LY', 'DA_RUT')),
    ADD CONSTRAINT ck_khieu_nais_ket_luan
        CHECK (ket_luan IS NULL OR ket_luan IN ('CHAP_NHAN_KHIEU_NAI', 'BAC_KHIEU_NAI')),
    ADD CONSTRAINT ck_khieu_nais_bo_sung
        CHECK (yeu_cau_bo_sung_trang_thai IS NULL OR yeu_cau_bo_sung_trang_thai IN ('CHO_BO_SUNG', 'DA_BO_SUNG'));

-- Mỗi đánh giá chỉ được tạo tối đa một khiếu nại (kể cả đã rút hoặc đã xử lý theo UC-33 §2, §3.2, §3.3)
CREATE UNIQUE INDEX IF NOT EXISTS uq_khieu_nais_ma_danh_gia
    ON khieu_nais (ma_danh_gia);

-- Chống tạo trùng khiếu nại khi bấm gửi lặp lại hoặc retry mạng (UC-33 §4, NFR-03)
CREATE UNIQUE INDEX IF NOT EXISTS uq_khieu_nais_seller_client_req
    ON khieu_nais (nguoi_khieu_nai_id, client_request_id)
    WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_khieu_nais_queue
    ON khieu_nais (trang_thai, thoi_diem_tao DESC, ma_khieu_nai DESC);

CREATE INDEX IF NOT EXISTS idx_khieu_nais_seller
    ON khieu_nais (nguoi_khieu_nai_id, thoi_diem_tao DESC, ma_khieu_nai DESC);

-- 3. Bảng bằng chứng riêng tư cho đánh giá & khiếu nại đánh giá (tách biệt media công khai theo NFR-01)
CREATE TABLE IF NOT EXISTS danh_gia_bang_chungs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_khieu_nai UUID REFERENCES khieu_nais(ma_khieu_nai) ON DELETE CASCADE,
    ma_danh_gia UUID REFERENCES danh_gias(ma_danh_gia) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    nguon_bang_chung VARCHAR(30) NOT NULL
        CHECK (nguon_bang_chung IN ('KHIEU_NAI_NGUOI_BAN', 'DANH_GIA_NGUOI_MUA', 'BO_SUNG')),
    loai_bang_chung VARCHAR(20) NOT NULL CHECK (loai_bang_chung IN ('HINH_ANH', 'NHAT_KY_CHAT')),
    storage_key VARCHAR(255) UNIQUE,
    original_filename VARCHAR(255),
    content_type VARCHAR(50),
    size_bytes BIGINT,
    sha256 CHAR(64),
    ma_hoi_thoai UUID REFERENCES hoi_thoais(ma_hoi_thoai) ON DELETE SET NULL,
    chat_log_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_danh_gia_bang_chung_payload CHECK (
        (loai_bang_chung = 'HINH_ANH'
            AND storage_key IS NOT NULL
            AND content_type IN ('image/jpeg', 'image/png', 'image/webp')
            AND size_bytes IS NOT NULL AND size_bytes > 0 AND size_bytes <= 5242880
            AND sha256 IS NOT NULL
            AND chat_log_snapshot IS NULL)
        OR
        (loai_bang_chung = 'NHAT_KY_CHAT'
            AND storage_key IS NULL
            AND chat_log_snapshot IS NOT NULL
            AND jsonb_typeof(chat_log_snapshot) = 'object')
    )
);

CREATE INDEX IF NOT EXISTS idx_danh_gia_bang_chungs_complaint
    ON danh_gia_bang_chungs (ma_khieu_nai, created_at ASC)
    WHERE ma_khieu_nai IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_danh_gia_bang_chungs_review
    ON danh_gia_bang_chungs (ma_danh_gia, created_at ASC)
    WHERE ma_danh_gia IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_danh_gia_bang_chungs_uploader
    ON danh_gia_bang_chungs (uploader_id, created_at DESC);

-- 4. Bảng yêu cầu bổ sung thông tin / bằng chứng từ Kiểm duyệt viên (UC-34 §3.2)
CREATE TABLE IF NOT EXISTS yeu_cau_bo_sung_danh_gia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loai_ho_so VARCHAR(20) NOT NULL CHECK (loai_ho_so IN ('KHIEU_NAI', 'DANH_GIA')),
    ho_so_id UUID NOT NULL,
    nguoi_yeu_cau_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    doi_tuong_nhan_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    vai_tro_nhan VARCHAR(20) NOT NULL CHECK (vai_tro_nhan IN ('NGUOI_BAN', 'NGUOI_MUA')),
    noi_dung_yeu_cau TEXT NOT NULL,
    phan_hoi TEXT,
    trang_thai VARCHAR(20) NOT NULL DEFAULT 'CHO_PHAN_HOI'
        CHECK (trang_thai IN ('CHO_PHAN_HOI', 'DA_PHAN_HOI')),
    thoi_diem_tao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    thoi_diem_phan_hoi TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_yeu_cau_bo_sung_case
    ON yeu_cau_bo_sung_danh_gia (loai_ho_so, ho_so_id, thoi_diem_tao DESC);

CREATE INDEX IF NOT EXISTS idx_yeu_cau_bo_sung_recipient
    ON yeu_cau_bo_sung_danh_gia (doi_tuong_nhan_id, trang_thai, thoi_diem_tao DESC);

-- 5. Bảng thông báo kết quả kiểm duyệt đánh giá / khiếu nại cho hai bên (UC-34 §2, §3.2)
CREATE TABLE IF NOT EXISTS thong_bao_danh_gias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    loai VARCHAR(50) NOT NULL,
    ma_danh_gia UUID REFERENCES danh_gias(ma_danh_gia) ON DELETE CASCADE,
    ma_khieu_nai UUID REFERENCES khieu_nais(ma_khieu_nai) ON DELETE CASCADE,
    tieu_de VARCHAR(200) NOT NULL,
    noi_dung TEXT NOT NULL,
    da_doc BOOLEAN NOT NULL DEFAULT FALSE,
    thoi_diem_tao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_thong_bao_danh_gias_user
    ON thong_bao_danh_gias (user_id, thoi_diem_tao DESC, id DESC);

-- 6. Mở rộng quyet_dinhs để truy vết cả quyết định xét đánh giá 1-3 sao và tác động điểm (UC-34 §4)
ALTER TABLE quyet_dinhs
    ADD COLUMN IF NOT EXISTS ma_danh_gia UUID REFERENCES danh_gias(ma_danh_gia),
    ADD COLUMN IF NOT EXISTS diem_tac_dong INT;

CREATE INDEX IF NOT EXISTS idx_quyet_dinhs_khieu_nai
    ON quyet_dinhs (ma_khieu_nai, thoi_diem DESC)
    WHERE ma_khieu_nai IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quyet_dinhs_danh_gia
    ON quyet_dinhs (ma_danh_gia, thoi_diem DESC)
    WHERE ma_danh_gia IS NOT NULL;
