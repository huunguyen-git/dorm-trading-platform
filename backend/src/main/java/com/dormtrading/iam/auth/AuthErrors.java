package com.dormtrading.iam.auth;

import java.util.Map;
import org.springframework.http.*;
import org.springframework.mail.MailException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

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
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String,String>> fileTooLarge() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("code","FILE_TOO_LARGE","message","Kích thước tệp vượt quá giới hạn cho phép (5MB)."));
    }
    @ExceptionHandler({
            MissingServletRequestPartException.class,
            MultipartException.class
    })
    ResponseEntity<Map<String,String>> invalidMedia(Exception e) {
        if (e instanceof MaxUploadSizeExceededException) {
            return fileTooLarge();
        }
        return ResponseEntity.badRequest()
                .body(Map.of("code","INVALID_MEDIA","message","Yêu cầu tải lên hình ảnh không hợp lệ."));
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
