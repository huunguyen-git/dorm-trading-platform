-- P1-01: no implicit verification/backfill of legacy accounts.
ALTER TABLE thanh_viens ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE thanh_viens ADD COLUMN profile_approved BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX uq_member_email_normalized ON thanh_viens (lower(email));

CREATE TABLE auth_challenge (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('REGISTER','RESET')),
    secret_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_auth_challenge_email ON auth_challenge(email, purpose);
CREATE TABLE auth_reset_grant (
    secret_hash VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE auth_session (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES thanh_viens(user_id),
    client VARCHAR(20) NOT NULL CHECK (client IN ('mobile','admin-web')),
    generation INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_auth_session_user ON auth_session(user_id);
CREATE TABLE auth_refresh (
    secret_hash VARCHAR(64) PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES auth_session(id),
    used BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE auth_event (
    id BIGSERIAL PRIMARY KEY,
    subject VARCHAR(300) NOT NULL,
    kind VARCHAR(30) NOT NULL,
    happened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_auth_event_limit ON auth_event(subject, kind, happened_at);
CREATE TABLE auth_login_guard (
    email VARCHAR(255) PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    blocked_until TIMESTAMPTZ
);
CREATE TABLE auth_notice (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent BOOLEAN NOT NULL DEFAULT FALSE
);
