package com.dormtrading.iam.auth;

import java.time.Instant;

public class AccountRestrictedFailure extends AuthFailure {

    public record RestrictionPayload(
            String accountStatus,
            String lockType,
            String reason,
            Instant lockedUntil,
            boolean appealable,
            int reputationScore
    ) {
    }

    public record ErrorBody(
            String code,
            String message,
            RestrictionPayload restriction
    ) {
    }

    public final RestrictionPayload restriction;

    public AccountRestrictedFailure(RestrictionPayload restriction) {
        super(403, "ACCOUNT_RESTRICTED", defaultMessageFor(restriction == null ? null : restriction.lockType()));
        this.restriction = restriction;
    }

    public ErrorBody toBody() {
        return new ErrorBody(code, getMessage(), restriction);
    }

    public static String defaultMessageFor(String lockType) {
        if ("KHOA_TAM_THOI".equals(lockType)) {
            return "Tài khoản đang bị khóa tạm thời.";
        }
        if ("KHOA_VINH_VIEN".equals(lockType)) {
            return "Tài khoản bị khóa vĩnh viễn.";
        }
        return "Tài khoản đang bị hạn chế.";
    }
}
