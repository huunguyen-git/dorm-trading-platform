package com.dormtrading.iam.auth;

public class AuthFailure extends RuntimeException {
    public final int status;
    public final String code;
    public AuthFailure(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
