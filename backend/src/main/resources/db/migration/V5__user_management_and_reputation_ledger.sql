-- ==============================================================================
-- Flyway Migration V5: Quản lý người dùng, hạn chế tài khoản & sổ cái điểm uy tín
-- Tasks: P1-04 (UC-11, UC-12), P1-05 (UC-13, UC-14)
-- Tham chiếu: FR-01, FR-02, FR-03, FR-12, NFR-01, NFR-03
-- ==============================================================================

-- 1. Bổ sung cột hạn chế tài khoản và ràng buộc toàn vẹn cho thanh_viens
UPDATE thanh_viens
SET trang_thai_sv = 'DANG_HOC'
WHERE trang_thai_sv IS NULL;

ALTER TABLE thanh_viens
    ALTER COLUMN trang_thai_sv SET NOT NULL,
    ADD COLUMN loai_han_che VARCHAR(30),
    ADD COLUMN ly_do_han_che TEXT,
    ADD COLUMN cho_phep_khieu_nai BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN diem_da_khoa_tam INT;

ALTER TABLE thanh_viens
    ADD CONSTRAINT chk_thanh_viens_trang_thai_tk
        CHECK (trang_thai_tai_khoan IN ('CHO_KICH_HOAT', 'HOAT_DONG', 'BI_KHOA', 'VO_HIEU_HOA')),
    ADD CONSTRAINT chk_thanh_viens_trang_thai_sv
        CHECK (trang_thai_sv IN ('DANG_HOC', 'DA_TOT_NGHIEP')),
    ADD CONSTRAINT chk_thanh_viens_diem_uy_tin
        CHECK (diem_uy_tin >= 0),
    ADD CONSTRAINT chk_thanh_viens_loai_han_che
        CHECK (loai_han_che IS NULL OR loai_han_che IN ('KHOA_TAM_THOI', 'KHOA_VINH_VIEN'));

CREATE INDEX idx_thanh_viens_trang_thai_tk ON thanh_viens(trang_thai_tai_khoan);

-- 2. Bảng sổ cái biến động điểm uy tín (Reputation Ledger - FR-03, FR-12, NFR-03)
CREATE TABLE lich_su_diem_uy_tin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    loai_bien_dong VARCHAR(50) NOT NULL CHECK (loai_bien_dong IN (
        'KHOI_TAO_KICH_HOAT',
        'XU_PHAT_THANG_PHAT',
        'DIEU_CHINH_KIEM_DUYET',
        'DANH_GIA_GIAO_DICH',
        'KHIEU_NAI_HOAN_DIEM'
    )),
    diem_thay_doi INT NOT NULL,
    diem_truoc INT NOT NULL CHECK (diem_truoc >= 0),
    diem_sau INT NOT NULL CHECK (diem_sau >= 0 AND diem_truoc + diem_thay_doi = diem_sau),
    ly_do TEXT NOT NULL,
    nguon_tham_chieu VARCHAR(50) NOT NULL,
    ma_tham_chieu VARCHAR(100),
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    nguoi_thuc_hien_id UUID REFERENCES thanh_viens(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lich_su_diem_user_time ON lich_su_diem_uy_tin(user_id, created_at DESC);

-- 3. Bảng nhật ký kiểm duyệt hồ sơ & khóa tài khoản (Moderation Audit Trail - UC-12, UC-13, UC-14)
CREATE TABLE nhat_ky_kiem_duyet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES thanh_viens(user_id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN (
        'UPDATE_IDENTITY',
        'LOCK_TEMPORARY',
        'LOCK_PERMANENT',
        'UNLOCK_MANUAL',
        'UNLOCK_EXPIRED_TEMP',
        'THRESHOLD_LOCK_TEMPORARY',
        'THRESHOLD_LOCK_PERMANENT'
    )),
    reason TEXT NOT NULL,
    previous_status VARCHAR(30),
    new_status VARCHAR(30),
    lock_type VARCHAR(30),
    locked_until TIMESTAMPTZ,
    appealable BOOLEAN NOT NULL DEFAULT FALSE,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_nhat_ky_kiem_duyet_target_time ON nhat_ky_kiem_duyet(target_user_id, created_at DESC);
