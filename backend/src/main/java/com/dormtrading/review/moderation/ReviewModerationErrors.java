package com.dormtrading.review.moderation;

import java.sql.SQLException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = {ReviewComplaintController.class, AdminReviewModerationController.class})
class ReviewModerationErrors {

    private static final Logger LOG = LoggerFactory.getLogger(ReviewModerationErrors.class);

    @ExceptionHandler(ReviewModerationFailure.class)
    ResponseEntity<Map<String, String>> business(ReviewModerationFailure failure) {
        return error(failure.status, failure.code, failure.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, String>> fileTooLarge() {
        return error(413, "FILE_TOO_LARGE", "Kích thước tệp bằng chứng vượt quá giới hạn cho phép (5MB).");
    }

    @ExceptionHandler({MissingServletRequestPartException.class, MultipartException.class})
    ResponseEntity<Map<String, String>> multipart(Exception failure) {
        if (failure instanceof MaxUploadSizeExceededException) {
            return fileTooLarge();
        }
        return error(400, "INVALID_MEDIA", "Yêu cầu tải lên tệp bằng chứng không hợp lệ.");
    }

    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class
    })
    ResponseEntity<Map<String, String>> input(Exception failure) {
        return error(400, "INVALID_INPUT", "Dữ liệu không hợp lệ hoặc thiếu tham số bắt buộc.");
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<Map<String, String>> duplicate(DuplicateKeyException failure) {
        if (hasConstraint(failure, "uq_khieu_nais_ma_danh_gia")) {
            return error(409, "COMPLAINT_ALREADY_EXISTS", "Đánh giá này đã có khiếu nại trước đó.");
        }
        if (hasConstraint(failure, "uq_khieu_nais_seller_client_req")) {
            return error(409, "CLIENT_REQUEST_ID_CONFLICT", "Mã yêu cầu khiếu nại này đã được sử dụng cho đánh giá khác.");
        }
        LOG.error("Review moderation unique constraint failed", failure);
        return error(503, "MODERATION_UNAVAILABLE", "Chưa lưu được thay đổi. Vui lòng thử lại.");
    }

    @ExceptionHandler(ConcurrencyFailureException.class)
    ResponseEntity<Map<String, String>> concurrent(ConcurrencyFailureException failure) {
        return error(409, "CONCURRENT_CHANGE", "Hồ sơ vừa thay đổi bởi thao tác khác. Vui lòng tải lại.");
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<Map<String, String>> database(DataAccessException failure) {
        LOG.error("Review moderation transaction failed", failure);
        return error(503, "MODERATION_UNAVAILABLE", "Chưa lưu được thay đổi. Toàn bộ thao tác đã được hoàn tác; vui lòng thử lại.");
    }

    private boolean hasConstraint(Throwable failure, String constraintName) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && sql.getMessage() != null
                    && sql.getMessage().contains(constraintName)) {
                return true;
            }
        }
        return false;
    }

    private ResponseEntity<Map<String, String>> error(int status, String code, String message) {
        return ResponseEntity.status(status).body(Map.of("code", code, "message", message));
    }
}
