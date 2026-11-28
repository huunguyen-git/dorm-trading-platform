package com.dormtrading.gov;

import java.sql.SQLException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.*;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = {GovernanceController.class, ReportController.class, AdminReportController.class})
class GovernanceErrors {
    private static final Logger LOG = LoggerFactory.getLogger(GovernanceErrors.class);

    @ExceptionHandler(GovernanceFailure.class)
    ResponseEntity<Map<String, String>> business(GovernanceFailure failure) {
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

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class})
    ResponseEntity<Map<String, String>> input(Exception failure) {
        return error(400, "INVALID_INPUT", "Dữ liệu không hợp lệ hoặc thiếu tham số bắt buộc.");
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<Map<String, String>> duplicate(DuplicateKeyException failure) {
        if (hasConstraint(failure, "uq_penalty_name_active"))
            return error(409, "DUPLICATE_NAME", "Tên mức phạt đã tồn tại; vui lòng chọn tên khác.");
        if (hasConstraint(failure, "uq_bao_caos_active_reporter_target_category"))
            return error(409, "DUPLICATE_REPORT",
                    "Bạn đã gửi báo cáo cho đối tượng và danh mục này; báo cáo trước đó đang được xử lý.");
        if (hasConstraint(failure, "uq_bao_caos_reporter_client_req"))
            return error(409, "CLIENT_REQUEST_ID_CONFLICT",
                    "Mã yêu cầu này đã được sử dụng cho một báo cáo khác.");
        LOG.error("Governance unique constraint failed", failure);
        return error(503, "GOVERNANCE_UNAVAILABLE", "Chưa lưu được thay đổi. Không có thay đổi nào được áp dụng; vui lòng thử lại.");
    }

    private boolean hasConstraint(Throwable failure, String constraintName) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && sql.getMessage() != null
                    && sql.getMessage().contains(constraintName)) return true;
        }
        return false;
    }

    @ExceptionHandler(ConcurrencyFailureException.class)
    ResponseEntity<Map<String, String>> concurrent(ConcurrencyFailureException failure) {
        return error(409, "CONCURRENT_CHANGE", "Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.");
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<Map<String, String>> database(DataAccessException failure) {
        LOG.error("Governance transaction failed", failure);
        return error(503, "GOVERNANCE_UNAVAILABLE", "Chưa lưu được thay đổi. Không có thay đổi nào được áp dụng; vui lòng thử lại.");
    }

    private ResponseEntity<Map<String, String>> error(int status, String code, String message) {
        return ResponseEntity.status(status).body(Map.of("code", code, "message", message));
    }
}
