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

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = GovernanceController.class)
class GovernanceErrors {
    private static final Logger LOG = LoggerFactory.getLogger(GovernanceErrors.class);

    @ExceptionHandler(GovernanceFailure.class)
    ResponseEntity<Map<String, String>> business(GovernanceFailure failure) {
        return error(failure.status, failure.code, failure.getMessage());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class})
    ResponseEntity<Map<String, String>> input(Exception failure) {
        return error(400, "INVALID_INPUT", "Dữ liệu không hợp lệ hoặc thiếu tham số bắt buộc.");
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<Map<String, String>> duplicate(DuplicateKeyException failure) {
        if (isActivePenaltyNameConstraint(failure))
            return error(409, "DUPLICATE_NAME", "Tên mức phạt đã tồn tại; vui lòng chọn tên khác.");
        LOG.error("Governance unique constraint failed", failure);
        return error(503, "GOVERNANCE_UNAVAILABLE", "Chưa lưu được thay đổi. Không có thay đổi nào được áp dụng; vui lòng thử lại.");
    }

    private boolean isActivePenaltyNameConstraint(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && sql.getMessage() != null
                    && sql.getMessage().contains("uq_penalty_name_active")) return true;
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
