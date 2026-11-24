package com.dormtrading.iam.auth;

public class AuthFailure extends RuntimeException {
    public final int status;
    public final String code;
    public final Long retryAfter;
    public AuthFailure(int status, String code, String message) {
        this(status, code, message, null);
    }
    public AuthFailure(int status, String code, String message, Long retryAfter) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfter = retryAfter;
    }
}
