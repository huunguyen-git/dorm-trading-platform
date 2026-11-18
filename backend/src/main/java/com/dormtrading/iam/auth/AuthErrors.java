package com.dormtrading.iam.auth;

import java.util.Map;
import org.springframework.http.*;
import org.springframework.mail.MailException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class AuthErrors {
    @ExceptionHandler(AccountRestrictedFailure.class)
    ResponseEntity<AccountRestrictedFailure.ErrorBody> restricted(AccountRestrictedFailure e) {
        return ResponseEntity.status(e.status).body(e.toBody());
    }
    @ExceptionHandler(AuthFailure.class)
    ResponseEntity<Map<String,String>> auth(AuthFailure e) {
        return ResponseEntity.status(e.status).body(Map.of("code",e.code,"message",e.getMessage()));
    }
    @ExceptionHandler(MailException.class)
    ResponseEntity<Map<String,String>> mail() {
        return ResponseEntity.status(503).body(Map.of("code","MAIL_UNAVAILABLE","message","Chưa gửi được email. Vui lòng thử lại."));
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
