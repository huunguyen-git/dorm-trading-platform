package com.campus.shared.web;

import com.campus.shared.api.SharedDtos.FieldViolation;
import java.util.List;

public class ApiException extends RuntimeException {
    private final int status;
    private final String code;
    private final String detail;
    private final List<FieldViolation> violations;

    public ApiException(int status, String code, String detail, List<FieldViolation> violations) {
        super(detail);
        this.status = status;
        this.code = code;
        this.detail = detail;
        this.violations = violations == null ? List.of() : List.copyOf(violations);
    }

    public ApiException(int status, String code, String detail) {
        this(status, code, detail, List.of());
    }

    public int getStatus() { return status; }
    public String getCode() { return code; }
    public String getDetail() { return detail; }
    public List<FieldViolation> getViolations() { return violations; }

    public static ApiException badRequest(String code, String detail, List<FieldViolation> violations) {
        return new ApiException(400, code, detail, violations);
    }

    public static ApiException forbidden(String code, String detail) {
        return new ApiException(403, code, detail);
    }

    public static ApiException notFound(String code, String detail) {
        return new ApiException(404, code, detail);
    }

    public static ApiException conflict(String code, String detail) {
        return new ApiException(409, code, detail);
    }

    public static ApiException payloadTooLarge(String detail) {
        return new ApiException(413, "PAYLOAD_TOO_LARGE", detail);
    }

    public static ApiException unsupported(String detail) {
        return new ApiException(415, "UNSUPPORTED_MEDIA", detail);
    }
}
