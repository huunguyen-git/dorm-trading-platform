package com.campus.shared.web;

import com.campus.shared.api.SharedDtos.ApiProblem;
import com.campus.shared.api.SharedDtos.FieldViolation;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class ApiExceptionHandler {

    private ApiProblem problem(HttpServletRequest req, int status, String code, String detail, List<FieldViolation> violations) {
        String title = switch (status) {
            case 400 -> "Yêu cầu không hợp lệ";
            case 401 -> "Chưa xác thực";
            case 403 -> "Không có quyền";
            case 404 -> "Không tìm thấy";
            case 409 -> "Xung đột";
            case 413 -> "Dung lượng vượt giới hạn";
            case 415 -> "Định dạng không hỗ trợ";
            case 429 -> "Quá nhiều yêu cầu";
            default -> "Lỗi";
        };
        return new ApiProblem(
            "about:blank",
            title,
            status,
            detail,
            req.getRequestURI(),
            code,
            violations == null ? List.of() : violations
        );
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiProblem> handleApi(ApiException ex, HttpServletRequest req) {
        ApiProblem body = problem(req, ex.getStatus(), ex.getCode(), ex.getDetail(), ex.getViolations());
        return ResponseEntity.status(ex.getStatus())
            .contentType(MediaType.parseMediaType("application/problem+json"))
            .body(body);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiProblem> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest req) {
        List<FieldViolation> violations = ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> new FieldViolation(fe.getField(), fe.getDefaultMessage()))
            .toList();
        String detail = "Dữ liệu không hợp lệ";
        if (!violations.isEmpty()) {
            // Keep Vietnamese detail for evidenceIds case
            boolean hasEvidence = violations.stream().anyMatch(v -> v.field().contains("evidenceIds"));
            if (hasEvidence) detail = "Vui lòng gửi ít nhất một bằng chứng";
        }
        ApiProblem body = problem(req, 400, "VALIDATION_ERROR", detail, violations);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .contentType(MediaType.parseMediaType("application/problem+json"))
            .body(body);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiProblem> handleMaxUpload(MaxUploadSizeExceededException ex, HttpServletRequest req) {
        ApiProblem body = problem(req, 413, "PAYLOAD_TOO_LARGE", "Tệp vượt quá dung lượng cho phép (tối đa 10MB)", List.of());
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
            .contentType(MediaType.parseMediaType("application/problem+json"))
            .body(body);
    }

    @ExceptionHandler(org.springframework.web.multipart.MultipartException.class)
    public ResponseEntity<ApiProblem> handleMultipart(org.springframework.web.multipart.MultipartException ex, HttpServletRequest req) {
        ApiProblem body = problem(req, 400, "VALIDATION_ERROR", "Yêu cầu multipart không hợp lệ", List.of());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .contentType(MediaType.parseMediaType("application/problem+json"))
            .body(body);
    }

    @ExceptionHandler({
        org.springframework.web.bind.MissingRequestHeaderException.class,
        org.springframework.web.bind.MissingServletRequestParameterException.class,
        org.springframework.web.multipart.support.MissingServletRequestPartException.class,
        org.springframework.http.converter.HttpMessageNotReadableException.class,
        org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
        jakarta.validation.ConstraintViolationException.class
    })
    public ResponseEntity<ApiProblem> handleBadRequest(Exception ex, HttpServletRequest req) {
        ApiProblem body = problem(req, 400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", List.of());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .contentType(MediaType.parseMediaType("application/problem+json"))
            .body(body);
    }
}
