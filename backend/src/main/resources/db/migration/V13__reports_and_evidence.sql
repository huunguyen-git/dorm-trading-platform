-- ==============================================================================
-- Flyway Migration V13: Báo cáo Người dùng & Báo cáo Tin đăng (P2-06 / UC-35, UC-36)
-- Tham chiếu: FR-11, FR-05, NFR-01, NFR-03; nối tiếp P1-06 (V6) và bàn giao cho P3-06 (UC-37)
-- ==============================================================================

-- 1. Danh mục báo cáo có sẵn cho Người dùng (UC-35) và Tin đăng (UC-36)
CREATE TABLE IF NOT EXISTS danh_muc_bao_caos (
    ma_danh_muc VARCHAR(100) PRIMARY KEY,
    loai_doi_tuong VARCHAR(30) NOT NULL CHECK (loai_doi_tuong IN ('NGUOI_DUNG', 'TIN_DANG')),
    ten VARCHAR(150) NOT NULL,
    mo_ta TEXT NOT NULL DEFAULT '',
    thu_tu INT NOT NULL DEFAULT 0,
    hien_thi BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO danh_muc_bao_caos (ma_danh_muc, loai_doi_tuong, ten, mo_ta, thu_tu, hien_thi) VALUES
    ('NGUOI_DUNG_LUA_DAO', 'NGUOI_DUNG', 'Lừa đảo / Gian lận giao dịch', 'Dấu hiệu chiếm đoạt tiền, đồ dùng hoặc cố tình gian lận khi trao đổi.', 1, TRUE),
    ('NGUOI_DUNG_NGON_TU_XUC_PHAM', 'NGUOI_DUNG', 'Ngôn từ xúc phạm / Quấy rối', 'Sử dụng lời lẽ thô tục, đe dọa hoặc quấy rối sinh viên khác.', 2, TRUE),
    ('NGUOI_DUNG_GIA_MAO', 'NGUOI_DUNG', 'Giả mạo thông tin / Danh tính', 'Cung cấp thông tin cá nhân, MSSV hoặc tài khoản không trung thực.', 3, TRUE),
    ('NGUOI_DUNG_BO_HEN', 'NGUOI_DUNG', 'Bỏ hẹn / Không hợp tác giao dịch', 'Nhiều lần hủy hẹn đột ngột hoặc không thực hiện thỏa thuận giao dịch.', 4, TRUE),
    ('NGUOI_DUNG_SPAM', 'NGUOI_DUNG', 'Spam / Làm phiền', 'Gửi tin nhắn rác, quảng cáo trái phép hoặc làm phiền liên tục.', 5, TRUE),
    ('NGUOI_DUNG_KHAC', 'NGUOI_DUNG', 'Vi phạm khác', 'Hành vi vi phạm quy định cộng đồng ĐHQG-HCM chưa nằm trong các mục trên.', 6, TRUE),
    ('TIN_DANG_HANG_CAM', 'TIN_DANG', 'Hàng cấm / Không hợp lệ', 'Mặt hàng vi phạm pháp luật hoặc nội quy ký túc xá, trường học.', 1, TRUE),
    ('TIN_DANG_SAI_SU_THAT', 'TIN_DANG', 'Nội dung hoặc ảnh sai sự thật', 'Hình ảnh, tình trạng hoặc mô tả không đúng với đồ vật thực tế.', 2, TRUE),
    ('TIN_DANG_GAY_HIEU_NHAM', 'TIN_DANG', 'Thông tin gây hiểu nhầm', 'Giá bán, hình thức cho tặng, combo hoặc địa điểm giao dịch không trung thực.', 3, TRUE),
    ('TIN_DANG_TRUNG_LAP_SPAM', 'TIN_DANG', 'Tin trùng lặp / Spam', 'Đăng lặp nhiều tin giống nhau hoặc nội dung quảng cáo không phù hợp.', 4, TRUE),
    ('TIN_DANG_KHAC', 'TIN_DANG', 'Vi phạm khác', 'Nội dung tin đăng vi phạm quy định khác của hệ thống.', 5, TRUE)
ON CONFLICT (ma_danh_muc) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_danh_muc_bao_caos_loai
    ON danh_muc_bao_caos(loai_doi_tuong, thu_tu)
    WHERE hien_thi = TRUE;

-- 2. Nhóm báo cáo tự gom theo (loai_doi_tuong, doi_tuong_id, danh_muc_vi_pham) khi chưa xử lý (UC-35, UC-36, UC-37)
CREATE TABLE IF NOT EXISTS nhom_bao_caos (
    ma_nhom UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loai_doi_tuong VARCHAR(30) NOT NULL CHECK (loai_doi_tuong IN ('NGUOI_DUNG', 'TIN_DANG')),
    doi_tuong_id UUID NOT NULL,
    danh_muc_vi_pham VARCHAR(100) NOT NULL,
    trang_thai VARCHAR(30) NOT NULL DEFAULT 'CHO_XU_LY'
        CHECK (trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY', 'DA_XU_LY')),
    so_luong_bao_cao INT NOT NULL DEFAULT 0 CHECK (so_luong_bao_cao >= 0),
    thoi_diem_tao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    thoi_diem_gui_gan_nhat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nguoi_xu_ly_id UUID REFERENCES thanh_viens(user_id),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);

-- Mỗi cặp (đối tượng, danh mục) chỉ có tối đa một nhóm đang chờ/đang xử lý để chống nhân phạt (FR-11)
CREATE UNIQUE INDEX IF NOT EXISTS uq_nhom_bao_caos_open
    ON nhom_bao_caos (loai_doi_tuong, doi_tuong_id, danh_muc_vi_pham)
    WHERE trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY');

CREATE INDEX IF NOT EXISTS idx_nhom_bao_caos_queue
    ON nhom_bao_caos (trang_thai, thoi_diem_gui_gan_nhat DESC, ma_nhom DESC);

CREATE INDEX IF NOT EXISTS idx_nhom_bao_caos_assignee
    ON nhom_bao_caos (nguoi_xu_ly_id)
    WHERE trang_thai = 'DANG_XU_LY';

-- 3. Mở rộng bảng bao_caos (giữ tương thích ngược hoàn toàn với V1 & V6)
ALTER TABLE bao_caos
    ADD COLUMN IF NOT EXISTS ma_nhom_bao_cao UUID REFERENCES nhom_bao_caos(ma_nhom),
    ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(100);

ALTER TABLE bao_caos
    ADD CONSTRAINT ck_bao_caos_loai_doi_tuong
        CHECK (loai_doi_tuong IN ('NGUOI_DUNG', 'TIN_DANG')),
    ADD CONSTRAINT ck_bao_caos_trang_thai
        CHECK (trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY', 'DA_XU_LY'));

-- Một người dùng không thể gửi trùng báo cáo đang mở cùng đối tượng và danh mục (UC-35 §3.3, UC-36 §3.3)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bao_caos_active_reporter_target_category
    ON bao_caos (nguoi_bao_cao_id, loai_doi_tuong, doi_tuong_id, danh_muc_vi_pham)
    WHERE trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY');

-- Chống tạo trùng báo cáo khi bấm gửi lặp lại hoặc retry mạng (UC-35 §4, UC-36 §4, NFR-03)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bao_caos_reporter_client_req
    ON bao_caos (nguoi_bao_cao_id, client_request_id)
    WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bao_caos_nhom
    ON bao_caos (ma_nhom_bao_cao, thoi_diem_tao DESC)
    WHERE ma_nhom_bao_cao IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bao_caos_reporter
    ON bao_caos (nguoi_bao_cao_id, thoi_diem_tao DESC, ma_bao_cao DESC);

-- 4. Bảng bằng chứng riêng tư của báo cáo (tách biệt media công khai theo NFR-01 & UC-35/36 §4)
CREATE TABLE IF NOT EXISTS bao_cao_bang_chungs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_bao_cao UUID REFERENCES bao_caos(ma_bao_cao) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    loai_bang_chung VARCHAR(20) NOT NULL CHECK (loai_bang_chung IN ('HINH_ANH', 'NHAT_KY_CHAT')),
    storage_key VARCHAR(255) UNIQUE,
    original_filename VARCHAR(255),
    content_type VARCHAR(50),
    size_bytes BIGINT,
    sha256 CHAR(64),
    ma_hoi_thoai UUID REFERENCES hoi_thoais(ma_hoi_thoai) ON DELETE SET NULL,
    chat_log_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_bao_cao_bang_chung_payload CHECK (
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

CREATE INDEX IF NOT EXISTS idx_bao_cao_bang_chungs_report
    ON bao_cao_bang_chungs (ma_bao_cao, created_at ASC)
    WHERE ma_bao_cao IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bao_cao_bang_chungs_uploader
    ON bao_cao_bang_chungs (uploader_id, created_at DESC);
