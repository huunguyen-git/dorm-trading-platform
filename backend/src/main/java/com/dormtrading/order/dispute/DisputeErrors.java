package com.dormtrading.order.dispute;

import com.dormtrading.iam.auth.AccountRestrictedFailure;
import com.dormtrading.iam.auth.AuthFailure;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

/**
 * Dedicated exception handler for P3-03 dispute controllers (UC-29), ensuring consistent
 * error codes and UC-29 Exception 5 safe 503 reporting when DB/system failures trigger rollback.
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = {AdminDisputeController.class, MemberDisputeController.class})
public class DisputeErrors {

    private static final Logger log = LoggerFactory.getLogger(DisputeErrors.class);

    @ExceptionHandler(AccountRestrictedFailure.class)
    ResponseEntity<AccountRestrictedFailure.ErrorBody> restricted(AccountRestrictedFailure e) {
        return ResponseEntity.status(e.status).body(e.toBody());
    }

    @ExceptionHandler(AuthFailure.class)
    ResponseEntity<Map<String, Object>> business(AuthFailure e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", e.code);
        body.put("message", e.getMessage());
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(e.status);
        if (e.retryAfter != null) {
            body.put("retryAfter", e.retryAfter);
            builder.header(HttpHeaders.RETRY_AFTER, e.retryAfter.toString());
        }
        return builder.body(body);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, String>> fileTooLarge() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of(
                        "code", "FILE_TOO_LARGE",
                        "message", "Kích thước mỗi ảnh bằng chứng không được vượt quá 5MB."
                ));
    }

    @ExceptionHandler({MissingServletRequestPartException.class, MultipartException.class})
    ResponseEntity<Map<String, String>> invalidMultipart(Exception e) {
        if (e instanceof MaxUploadSizeExceededException) {
            return fileTooLarge();
        }
        if (e instanceof MissingServletRequestPartException part && "note".equals(part.getRequestPartName())) {
            return ResponseEntity.badRequest()
                    .body(Map.of(
                            "code", "INVALID_INPUT",
                            "message", "Vui lòng nhập nội dung giải trình (từ 3 đến 2000 ký tự)."
                    ));
        }
        return ResponseEntity.badRequest()
                .body(Map.of(
                        "code", "INVALID_MEDIA",
                        "message", "Yêu cầu tải lên bằng chứng không hợp lệ."
                ));
    }

    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class
    })
    ResponseEntity<Map<String, String>> invalidInput() {
        return ResponseEntity.badRequest()
                .body(Map.of("code", "INVALID_INPUT", "message", "Dữ liệu đầu vào không hợp lệ."));
    }

    @ExceptionHandler(ConcurrencyFailureException.class)
    ResponseEntity<Map<String, String>> concurrencyConflict() {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of(
                        "code", "VERSION_CONFLICT",
                        "message", "Hồ sơ giao dịch vừa được cập nhật đồng thời. Vui lòng tải lại và thử lại."
                ));
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<Map<String, String>> databaseFailure(DataAccessException e) {
        log.error("Dispute transaction failed and rolled back", e);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of(
                        "code", "DISPUTE_UNAVAILABLE",
                        "message", "Không thể lưu quyết định do lỗi hệ thống. Giao dịch vẫn giữ trạng thái Chờ xử lý, vui lòng thử lại."
                ));
    }
}
