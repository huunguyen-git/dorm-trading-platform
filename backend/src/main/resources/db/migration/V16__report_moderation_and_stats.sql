-- P3-06 / UC-37, UC-38: Report moderation decision link, duplicate-link column, and statistics indexes.
ALTER TABLE bao_caos
    ADD COLUMN IF NOT EXISTS quyet_dinh_id UUID REFERENCES quyet_dinhs(ma_quyet_dinh);

ALTER TABLE quyet_dinhs
    ADD COLUMN IF NOT EXISTS quyet_dinh_goc_id UUID REFERENCES quyet_dinhs(ma_quyet_dinh);

CREATE INDEX IF NOT EXISTS idx_bao_caos_group_status
    ON bao_caos(loai_doi_tuong, doi_tuong_id, danh_muc_vi_pham, trang_thai, thoi_diem_tao DESC);

CREATE INDEX IF NOT EXISTS idx_bao_caos_quyet_dinh
    ON bao_caos(quyet_dinh_id)
    WHERE quyet_dinh_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_giao_dichs_stats_completed
    ON giao_dichs(trang_thai, thoi_diem_hoan_tat DESC)
    WHERE trang_thai = 'HOAN_TAT';
