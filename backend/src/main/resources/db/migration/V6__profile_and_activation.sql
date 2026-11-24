-- P1-02: hồ sơ cá nhân, duyệt kích hoạt, đổi email. Không sửa V1–V4.
-- UC-05: đổi định danh/học tập/ảnh thẻ phải chờ duyệt, nhưng tài khoản đã kích hoạt vẫn giữ
-- quyền trong lúc chờ nên bản cập nhật lưu riêng ở ho_so_cap_nhat, chỉ áp dụng khi chấp thuận.
ALTER TABLE thanh_viens ADD COLUMN ly_do_tu_choi TEXT;
ALTER TABLE thanh_viens ADD COLUMN cho_duyet_lai BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE thanh_viens ADD COLUMN diem_khoi_tao BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE thanh_viens SET diem_khoi_tao = TRUE WHERE profile_approved;

CREATE INDEX idx_thanh_viens_cho_duyet ON thanh_viens(updated_at DESC)
    WHERE email_verified AND (NOT profile_approved OR cho_duyet_lai);

CREATE TABLE ho_so_cap_nhat (
    user_id UUID PRIMARY KEY REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    ho_ten VARCHAR(150) NOT NULL,
    mssv VARCHAR(20) NOT NULL,
    truong VARCHAR(150),
    co_so VARCHAR(150),
    nganh_hoc VARCHAR(150),
    nien_khoa VARCHAR(50),
    gui_luc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Hai hồ sơ chờ duyệt không được cùng nhận một MSSV.
CREATE UNIQUE INDEX uq_ho_so_cap_nhat_mssv ON ho_so_cap_nhat(mssv);

-- Ảnh thẻ sinh viên là dữ liệu định danh: chỉ chủ sở hữu và kiểm duyệt viên đọc (NFR-01).
CREATE TABLE the_sinh_viens (
    user_id UUID PRIMARY KEY REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    mime VARCHAR(50) NOT NULL,
    kich_thuoc INTEGER NOT NULL CHECK (kich_thuoc > 0),
    noi_dung BYTEA NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kiem_duyet_ho_so (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES thanh_viens(user_id) ON DELETE CASCADE,
    nguoi_duyet_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    ket_qua VARCHAR(20) NOT NULL CHECK (ket_qua IN ('CHAP_THUAN','TU_CHOI')),
    ly_do TEXT,
    thoi_diem TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_kiem_duyet_ho_so_user ON kiem_duyet_ho_so(user_id, thoi_diem DESC);

CREATE TABLE ho_so_thong_bao (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ly_do TEXT,
    sent BOOLEAN NOT NULL DEFAULT FALSE,
    failures INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ho_so_thong_bao_pending ON ho_so_thong_bao(sent, id);

-- Đổi email (UC-06) tái dùng challenge + outbox SMTP đã mã hóa của P1-01.
ALTER TABLE auth_challenge DROP CONSTRAINT auth_challenge_purpose_check;
ALTER TABLE auth_challenge ADD CONSTRAINT auth_challenge_purpose_check
    CHECK (purpose IN ('REGISTER','RESET','CHANGE_EMAIL'));
ALTER TABLE auth_challenge ADD COLUMN user_id UUID REFERENCES thanh_viens(user_id);
