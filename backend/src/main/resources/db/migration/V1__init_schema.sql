-- ==============================================================================
-- Flyway Migration V1: Khởi tạo toàn bộ Lược đồ CSDL cho Dorm Trading Platform
-- Tham chiếu trực tiếp: docs/3-Phân tích_Nhóm 14.docx (Sơ đồ lớp & Sơ đồ trạng thái)
-- Module phụ trách chính: Nguyễn Quốc Nguyên (24521197)
-- ==============================================================================

-- 1. BẢNG THÀNH VIÊN (thanhVien - Member / User)
CREATE TABLE IF NOT EXISTS thanh_viens (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    mat_khau_hash VARCHAR(255) NOT NULL,
    ho_ten VARCHAR(150) NOT NULL,
    mssv VARCHAR(20) NOT NULL UNIQUE,
    so_dien_thoai VARCHAR(20),
    truong VARCHAR(150) DEFAULT 'ĐHQG-HCM',
    co_so VARCHAR(150),
    nganh_hoc VARCHAR(150),
    nien_khoa VARCHAR(50),
    trang_thai_sv VARCHAR(50) DEFAULT 'DANG_HOC', -- DANG_HOC, DA_TOT_NGHIEP
    anh_the_sv_truoc TEXT,
    anh_the_sv_sau TEXT,
    diem_uy_tin INT NOT NULL DEFAULT 100,
    trang_thai_tai_khoan VARCHAR(30) NOT NULL DEFAULT 'CHO_KICH_HOAT',
    -- TrangThai: CHO_KICH_HOAT, HOAT_DONG, BI_KHOA, VO_HIEU_HOA
    khoa_den_ngay TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0
);

-- 2. BẢNG VAI TRÒ QUẢN TRỊ / KIỂM DUYỆT (AdminRole)
CREATE TABLE IF NOT EXISTS vai_tro_quan_tri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    loai_vai_tro VARCHAR(50) NOT NULL, -- KIEM_DUYET_VIEN, QUAN_TRI_VIEN_CAP_CAO
    bat_dau TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ket_thuc TIMESTAMP WITH TIME ZONE,
    trang_thai_hieu_luc BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. BẢNG DANH MỤC (danhMuc - Category)
CREATE TABLE IF NOT EXISTS danh_mucs (
    ma_danh_muc VARCHAR(50) PRIMARY KEY,
    ten VARCHAR(150) NOT NULL,
    danh_muc_cha_id VARCHAR(50) REFERENCES danh_mucs(ma_danh_muc),
    mo_ta TEXT,
    hien_thi BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4. BẢNG ĐỒ VẬT TRONG KHO CÁ NHÂN (doVat - Item)
-- RÀNG BUỘC SỐNG CÒN: Mỗi đồ vật là 1 thực thể vật lý duy nhất, không nhân bản SKU
CREATE TABLE IF NOT EXISTS do_vats (
    ma_vat UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    ten VARCHAR(255) NOT NULL,
    tinh_trang TEXT NOT NULL, -- Tình trạng thực tế sử dụng
    hinh_anh TEXT[] NOT NULL DEFAULT '{}', -- 1..5 ảnh thực tế
    trang_thai VARCHAR(30) NOT NULL DEFAULT 'KHA_DUNG',
    -- TrangThaiDoVat: KHA_DUNG, DANG_GIU, DA_CHUYEN_GIAO
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0
);

-- 5. BẢNG TIN ĐĂNG (tinDang - Listing)
CREATE TABLE IF NOT EXISTS tin_dangs (
    ma_tin UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nguoi_dang_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    tieu_de VARCHAR(255) NOT NULL,
    mo_ta TEXT,
    gia_vnd INT NOT NULL DEFAULT 0 CHECK (gia_vnd >= 0), -- Cho tặng niêm yết 0đ
    hinh_anh TEXT[] NOT NULL DEFAULT '{}', -- 1..5 ảnh hiển thị
    khu_vuc VARCHAR(255), -- KTX Khu A, KTX Khu B, Trường ĐH Bách Khoa, v.v.
    ma_danh_muc VARCHAR(50) REFERENCES danh_mucs(ma_danh_muc),
    hinh_thuc VARCHAR(30) NOT NULL DEFAULT 'BAN_LE', -- BAN_LE, BAN_COMBO, CHO_TANG
    trang_thai VARCHAR(30) NOT NULL DEFAULT 'NHAP',
    -- TrangThaiTinDang: NHAP, CONG_KHAI, GIU_CHO, DA_RUT, AN, KET_THUC
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0
);

-- 6. BẢNG LIÊN KẾT TIN ĐĂNG VÀ ĐỒ VẬT (tinDang 0..* -- 1..* doVat)
-- Một tin đăng gồm 1 hoặc nhiều đồ vật; 1 đồ vật có thể nằm trong nhiều tin nháp/tin rao khác nhau
CREATE TABLE IF NOT EXISTS tin_dang_do_vat (
    ma_tin UUID NOT NULL REFERENCES tin_dangs(ma_tin) ON DELETE CASCADE,
    ma_vat UUID NOT NULL REFERENCES do_vats(ma_vat) ON DELETE RESTRICT,
    PRIMARY KEY (ma_tin, ma_vat)
);

-- 7. BẢNG HỘI THOẠI & TIN NHẮN (hoiThoai & tinNhan)
CREATE TABLE IF NOT EXISTS hoi_thoais (
    ma_hoi_thoai UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_tin UUID REFERENCES tin_dangs(ma_tin) ON DELETE SET NULL,
    nguoi_mua_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    nguoi_ban_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    thoi_diem_tao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_hoi_thoai UNIQUE (ma_tin, nguoi_mua_id, nguoi_ban_id)
);

CREATE TABLE IF NOT EXISTS tin_nhans (
    ma_tin_nhan UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_hoi_thoai UUID NOT NULL REFERENCES hoi_thoais(ma_hoi_thoai) ON DELETE CASCADE,
    nguoi_gui_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    noi_dung TEXT NOT NULL,
    gia_de_nghi INT, -- Thỏa thuận giá trực tiếp qua tin nhắn
    thoi_diem_gui TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. BẢNG GIAO DỊCH (giaoDich - Order / Reservation)
-- PHỤ TRÁCH CHÍNH: NGUYỄN QUỐC NGUYÊN (UC-23 -> UC-28)
CREATE TABLE IF NOT EXISTS giao_dichs (
    ma_giao_dich UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_tin UUID NOT NULL REFERENCES tin_dangs(ma_tin) ON DELETE RESTRICT,
    nguoi_ban_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    nguoi_mua_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    gia_thoa_thuan INT NOT NULL DEFAULT 0 CHECK (gia_thoa_thuan >= 0),
    thoi_gian_hen TIMESTAMP WITH TIME ZONE,
    dia_diem_hen VARCHAR(255),
    anh_ban_giao TEXT, -- Ảnh thực tế người bán chụp khi bàn giao đồ vật
    trang_thai VARCHAR(30) NOT NULL DEFAULT 'YEU_CAU',
    -- TrangThaiGiaoDich: YEU_CAU, GIU_CHO, DANG_GIAO, CHO_XAC_NHAN, CHO_XU_LY, HOAN_TAT, HUY
    ly_do_huy TEXT,
    thoi_diem_tao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    thoi_diem_giu_cho TIMESTAMP WITH TIME ZONE,
    thoi_diem_bao_giao TIMESTAMP WITH TIME ZONE,
    thoi_diem_hoan_tat TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0
);

-- 9. BẢNG MÃ OTP XÁC NHẬN BÀN GIAO GIAO DỊCH (UC-27)
CREATE TABLE IF NOT EXISTS ma_xac_nhan_otp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_giao_dich UUID NOT NULL REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
    ma_otp VARCHAR(6) NOT NULL, -- Mã OTP 6 chữ số phát hành cho người bán/người mua
    thoi_diem_phat TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    thoi_diem_het_han TIMESTAMP WITH TIME ZONE NOT NULL, -- Hiệu lực đúng 10 phút
    so_lan_thu_sai INT NOT NULL DEFAULT 0, -- Tối đa 5 lần
    da_dung BOOLEAN NOT NULL DEFAULT FALSE
);

-- 10. BẢNG ĐÁNH GIÁ GIAO DỊCH (danhGia - Review)
CREATE TABLE IF NOT EXISTS danh_gias (
    ma_danh_gia UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_giao_dich UUID NOT NULL UNIQUE REFERENCES giao_dichs(ma_giao_dich) ON DELETE CASCADE,
    nguoi_danh_gia_id UUID NOT NULL REFERENCES thanh_viens(user_id), -- Luôn là người mua
    nguoi_bi_danh_gia_id UUID NOT NULL REFERENCES thanh_viens(user_id), -- Luôn là người bán
    so_sao INT NOT NULL CHECK (so_sao BETWEEN 1 AND 5),
    nhan_xet TEXT,
    trang_thai VARCHAR(30) NOT NULL DEFAULT 'CHO_XET',
    -- TrangThaiDanhGia: CHO_XET (1-3 sao), CHAP_NHAN (4-5 sao hoặc sau duyệt), BI_BAC, DA_GO, DA_XOA
    thoi_diem_tao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    thoi_diem_xet TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0
);

-- 11. BẢNG KHIẾU NẠI ĐÁNH GIÁ (khieuNai - Complaint)
CREATE TABLE IF NOT EXISTS khieu_nais (
    ma_khieu_nai UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_danh_gia UUID NOT NULL REFERENCES danh_gias(ma_danh_gia) ON DELETE CASCADE,
    nguoi_khieu_nai_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    ly_do TEXT NOT NULL,
    bang_chung TEXT[] NOT NULL DEFAULT '{}',
    trang_thai VARCHAR(30) NOT NULL DEFAULT 'CHO_XU_LY',
    -- TrangThaiKhieuNai: CHO_XU_LY, DA_XU_LY, DA_RUT
    thoi_diem_tao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. BẢNG BÁO CÁO VI PHẠM (baoCao - Report)
CREATE TABLE IF NOT EXISTS bao_caos (
    ma_bao_cao UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nguoi_bao_cao_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    loai_doi_tuong VARCHAR(30) NOT NULL, -- NGUOI_DUNG, TIN_DANG
    doi_tuong_id UUID NOT NULL,
    danh_muc_vi_pham VARCHAR(100) NOT NULL,
    noi_dung TEXT NOT NULL,
    bang_chung TEXT[] NOT NULL DEFAULT '{}',
    trang_thai VARCHAR(30) NOT NULL DEFAULT 'CHO_XU_LY',
    -- TrangThaiBaoCao: CHO_XU_LY, DA_XU_LY
    thoi_diem_tao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. BẢNG THANG PHẠT (thangPhat - Penalty Scale)
CREATE TABLE IF NOT EXISTS thang_phats (
    ma_thang_phat VARCHAR(50) PRIMARY KEY,
    ten VARCHAR(255) NOT NULL,
    diem_tru INT NOT NULL CHECK (diem_tru > 0),
    trang_thai VARCHAR(30) NOT NULL DEFAULT 'DANG_DUNG'
);

-- 14. BẢNG QUYẾT ĐỊNH XỬ LÝ (quyetDinh - Decision)
CREATE TABLE IF NOT EXISTS quyet_dinhs (
    ma_quyet_dinh UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nguoi_ra_quyet_dinh_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    ma_bao_cao UUID REFERENCES bao_caos(ma_bao_cao),
    ma_khieu_nai UUID REFERENCES khieu_nais(ma_khieu_nai),
    ma_thang_phat VARCHAR(50) REFERENCES thang_phats(ma_thang_phat),
    ket_luan TEXT NOT NULL,
    can_cu TEXT NOT NULL,
    thoi_diem TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- CHỈ MỤC (INDEXES) TỐI ƯU HÓA TRUY VẤN & KHÓA TRANH CHẤP
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_thanh_viens_email ON thanh_viens(email);
CREATE INDEX IF NOT EXISTS idx_thanh_viens_mssv ON thanh_viens(mssv);
CREATE INDEX IF NOT EXISTS idx_thanh_viens_diem_uy_tin ON thanh_viens(diem_uy_tin);

CREATE INDEX IF NOT EXISTS idx_do_vats_user_id ON do_vats(user_id);
CREATE INDEX IF NOT EXISTS idx_do_vats_trang_thai ON do_vats(trang_thai);

CREATE INDEX IF NOT EXISTS idx_tin_dangs_trang_thai ON tin_dangs(trang_thai);
CREATE INDEX IF NOT EXISTS idx_tin_dangs_nguoi_dang ON tin_dangs(nguoi_dang_id);
CREATE INDEX IF NOT EXISTS idx_tin_dangs_danh_muc ON tin_dangs(ma_danh_muc);

CREATE INDEX IF NOT EXISTS idx_giao_dichs_tin_dang ON giao_dichs(ma_tin);
CREATE INDEX IF NOT EXISTS idx_giao_dichs_nguoi_mua ON giao_dichs(nguoi_mua_id);
CREATE INDEX IF NOT EXISTS idx_giao_dichs_nguoi_ban ON giao_dichs(nguoi_ban_id);
CREATE INDEX IF NOT EXISTS idx_giao_dichs_trang_thai ON giao_dichs(trang_thai);

CREATE INDEX IF NOT EXISTS idx_otp_giao_dich ON ma_xac_nhan_otp(ma_giao_dich);
CREATE INDEX IF NOT EXISTS idx_danh_gias_giao_dich ON danh_gias(ma_giao_dich);
CREATE INDEX IF NOT EXISTS idx_bao_caos_doi_tuong ON bao_caos(loai_doi_tuong, doi_tuong_id);
