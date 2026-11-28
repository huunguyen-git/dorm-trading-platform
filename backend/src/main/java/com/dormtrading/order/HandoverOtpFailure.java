package com.dormtrading.order;

import com.dormtrading.iam.auth.AuthFailure;
import java.time.Instant;

/**
 * Structured OTP verification failure for UC-27 / FR-09.
 * Used with {@code @Transactional(noRollbackFor = HandoverOtpFailure.class)} so failed attempt
 * counts and 5th-attempt lockout/ciphertext wipes are atomically persisted.
 */
public class HandoverOtpFailure extends AuthFailure {

    public final int attemptsUsed;
    public final int maxAttempts;
    public final int remainingAttempts;
    public final boolean locked;
    public final Instant expiresAt;

    public HandoverOtpFailure(
            int status,
            String code,
            String message,
            int attemptsUsed,
            int maxAttempts,
            int remainingAttempts,
            boolean locked,
            Instant expiresAt
    ) {
        super(status, code, message);
        this.attemptsUsed = attemptsUsed;
        this.maxAttempts = maxAttempts;
        this.remainingAttempts = remainingAttempts;
        this.locked = locked;
        this.expiresAt = expiresAt;
    }
}
