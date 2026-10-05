-- Slice 1: store binary bytes for REPORT evidence; V2 only had metadata.
CREATE TABLE IF NOT EXISTS media_blobs (
    media_id UUID PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
    bytes BYTEA NOT NULL CHECK (octet_length(bytes) > 0)
);
