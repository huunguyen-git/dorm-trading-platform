package com.dormtrading.iam.auth;

import java.util.Map;
import org.springframework.http.*;
import org.springframework.mail.MailException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
public class AuthErrors {
    @ExceptionHandler(AccountRestrictedFailure.class)
    ResponseEntity<AccountRestrictedFailure.ErrorBody> restricted(AccountRestrictedFailure e) {
        return ResponseEntity.status(e.status).body(e.toBody());
    }
    @ExceptionHandler(AuthFailure.class)
    ResponseEntity<Map<String,Object>> auth(AuthFailure e) {
        var body = new java.util.LinkedHashMap<String,Object>();
        body.put("code", e.code); body.put("message", e.getMessage());
        var response = ResponseEntity.status(e.status);
        if (e.retryAfter != null) {
            body.put("retryAfter", e.retryAfter);
            response.header(HttpHeaders.RETRY_AFTER, e.retryAfter.toString());
        }
        return response.body(body);
    }
    @ExceptionHandler(MailException.class)
    ResponseEntity<Map<String,String>> mail() {
        return ResponseEntity.status(503).body(Map.of("code","MAIL_UNAVAILABLE","message","Chưa gửi được email. Vui lòng thử lại."));
    }
    /** Ảnh thẻ vượt giới hạn multipart: trả 413 kèm mã riêng thay vì lỗi 500 của container. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String,String>> tooLarge() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("code","PAYLOAD_TOO_LARGE","message","Ảnh thẻ tối đa 5MB."));
    }
    @ExceptionHandler(MissingServletRequestPartException.class)
    ResponseEntity<Map<String,String>> missingPart() {
        return ResponseEntity.badRequest().body(Map.of("code","INVALID_INPUT","message","Thiếu tệp ảnh thẻ."));
    }
    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class
    })
    ResponseEntity<Map<String,String>> invalid() {
        return ResponseEntity.badRequest().body(Map.of("code","INVALID_INPUT","message","Thông tin không hợp lệ."));
    }
}
