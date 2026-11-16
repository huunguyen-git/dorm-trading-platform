-- Keep email delivery out of public reset response latency. Payload is AES-GCM encrypted.
CREATE TABLE auth_otp_delivery (
    challenge_id UUID PRIMARY KEY REFERENCES auth_challenge(id) ON DELETE CASCADE,
    payload TEXT NOT NULL,
    sent BOOLEAN NOT NULL DEFAULT FALSE,
    failures INTEGER NOT NULL DEFAULT 0
);
