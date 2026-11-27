package com.dormtrading.gov;

final class GovernanceFailure extends RuntimeException {
    final int status;
    final String code;

    GovernanceFailure(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
