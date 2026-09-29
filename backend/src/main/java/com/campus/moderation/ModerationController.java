package com.campus.moderation;

import com.campus.moderation.api.ModerationDtos.CreateReportRequest;
import com.campus.moderation.api.ModerationDtos.ReportView;
import com.campus.shared.security.SecurityUtils;
import com.campus.shared.web.ApiException;
import jakarta.validation.Valid;

import java.util.Objects;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reports")
public class ModerationController {
    private final ReportService service;

    public ModerationController(ReportService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<ReportView> submit(
        @Valid @RequestBody CreateReportRequest request,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) {
        UUID reporter = SecurityUtils.currentMemberId();
        if (reporter == null) {
            throw ApiException.forbidden("FORBIDDEN", "Cần đăng nhập để gửi báo cáo");
        }
        return ResponseEntity.status(201).body(service.submit(reporter, idempotencyKey, request));
    }

    @GetMapping("/{reportId}")
    public ResponseEntity<ReportView> read(@PathVariable UUID reportId) {
        UUID member = SecurityUtils.currentMemberId();
        boolean handler = SecurityUtils.hasRole("MODERATOR") || SecurityUtils.hasRole("ADMIN");
        // Report content is case material: never cached, never widened beyond reporter/handler.
        return ResponseEntity.ok()
            .header(HttpHeaders.CACHE_CONTROL, Objects.requireNonNull(CacheControl.noStore().getHeaderValue()))
            .body(service.read(reportId, member, handler));
    }
}
