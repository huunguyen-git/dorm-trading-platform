-- P1-06 / UC-39, UC-40. No administrator accounts or approved penalty policy are seeded.
ALTER TABLE bao_caos ADD COLUMN nguoi_xu_ly_id UUID REFERENCES thanh_viens(user_id);
CREATE INDEX idx_report_assignee ON bao_caos(nguoi_xu_ly_id) WHERE trang_thai = 'DANG_XU_LY';
CREATE INDEX idx_governance_roles ON vai_tro_quan_tri(user_id, loai_vai_tro) WHERE trang_thai_hieu_luc;

ALTER TABLE thang_phats ADD COLUMN mo_ta TEXT NOT NULL DEFAULT '';
ALTER TABLE thang_phats ADD COLUMN version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE thang_phats ADD CONSTRAINT ck_penalty_name CHECK (length(btrim(ten)) > 0);
ALTER TABLE thang_phats ADD CONSTRAINT ck_penalty_status CHECK (trang_thai IN ('DANG_DUNG', 'NGUNG_SU_DUNG'));
CREATE UNIQUE INDEX uq_penalty_name_active ON thang_phats(lower(btrim(ten))) WHERE trang_thai = 'DANG_DUNG';

CREATE TABLE governance_audit (
    id UUID PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    actor_name VARCHAR(150) NOT NULL,
    action VARCHAR(40) NOT NULL,
    resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('MODERATOR', 'PENALTY')),
    resource_id VARCHAR(50) NOT NULL,
    before_value JSONB,
    after_value JSONB,
    happened_at TIMESTAMPTZ NOT NULL,
    CHECK (before_value IS NULL OR jsonb_typeof(before_value) = 'object'),
    CHECK (after_value IS NULL OR jsonb_typeof(after_value) = 'object')
);
CREATE INDEX idx_governance_audit_resource ON governance_audit(resource_type, resource_id, happened_at DESC, id DESC);
CREATE INDEX idx_governance_audit_time ON governance_audit(happened_at DESC, id DESC);

ALTER TABLE quyet_dinhs ADD COLUMN ten_thang_phat_snapshot VARCHAR(255);
ALTER TABLE quyet_dinhs ADD COLUMN diem_tru_snapshot INTEGER;
ALTER TABLE quyet_dinhs ADD COLUMN mo_ta_thang_phat_snapshot TEXT;
-- Historical values were not captured by V1: this is only a best-effort backfill
-- from today's penalty records, not a reconstruction of values at decision time.
UPDATE quyet_dinhs q SET ten_thang_phat_snapshot = p.ten,
    diem_tru_snapshot = p.diem_tru, mo_ta_thang_phat_snapshot = p.mo_ta
FROM thang_phats p WHERE q.ma_thang_phat = p.ma_thang_phat;
ALTER TABLE quyet_dinhs ADD CONSTRAINT ck_decision_penalty_snapshot CHECK (
    (ma_thang_phat IS NULL AND ten_thang_phat_snapshot IS NULL
        AND diem_tru_snapshot IS NULL AND mo_ta_thang_phat_snapshot IS NULL)
    OR (ma_thang_phat IS NOT NULL AND ten_thang_phat_snapshot IS NOT NULL
        AND diem_tru_snapshot IS NOT NULL AND diem_tru_snapshot > 0
        AND mo_ta_thang_phat_snapshot IS NOT NULL)
);

CREATE FUNCTION preserve_decision_penalty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    penalty thang_phats%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.ma_thang_phat IS DISTINCT FROM OLD.ma_thang_phat
            OR NEW.ten_thang_phat_snapshot IS DISTINCT FROM OLD.ten_thang_phat_snapshot
            OR NEW.diem_tru_snapshot IS DISTINCT FROM OLD.diem_tru_snapshot
            OR NEW.mo_ta_thang_phat_snapshot IS DISTINCT FROM OLD.mo_ta_thang_phat_snapshot THEN
            RAISE EXCEPTION 'Decision penalty reference and snapshot are immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.ma_thang_phat IS NULL THEN
        NEW.ten_thang_phat_snapshot := NULL;
        NEW.diem_tru_snapshot := NULL;
        NEW.mo_ta_thang_phat_snapshot := NULL;
        RETURN NEW;
    END IF;
    -- SHARE, not KEY SHARE: edits/deactivation must wait until decision insert commits.
    SELECT * INTO penalty FROM thang_phats WHERE ma_thang_phat = NEW.ma_thang_phat FOR SHARE;
    IF NOT FOUND OR penalty.trang_thai <> 'DANG_DUNG' THEN
        RAISE EXCEPTION 'New decisions require an active penalty' USING ERRCODE = '23514';
    END IF;
    NEW.ten_thang_phat_snapshot := penalty.ten;
    NEW.diem_tru_snapshot := penalty.diem_tru;
    NEW.mo_ta_thang_phat_snapshot := penalty.mo_ta;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_decision_penalty_snapshot BEFORE INSERT OR UPDATE ON quyet_dinhs
FOR EACH ROW EXECUTE FUNCTION preserve_decision_penalty();

-- Preserve V2 identifiers/FKs, but these sample numbers are not approved policy.
UPDATE thang_phats SET trang_thai = 'NGUNG_SU_DUNG', version = version + 1
WHERE ma_thang_phat IN ('TP_BO_HEN_LAN_1', 'TP_BO_HEN_TAI_PHAM', 'TP_HANG_KHONG_DUNG_MO_TA',
    'TP_GIA_MAO_THONG_TIN', 'TP_NGON_TU_XUC_PHAM', 'TP_KHONG_BAN_GIAO');
