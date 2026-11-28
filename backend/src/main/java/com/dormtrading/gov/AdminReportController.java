package com.dormtrading.gov;

import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Moderator & Senior Admin report queue and private evidence access (NFR-01, UC-35/36 §4, UC-37).
 * Protected by /api/v1/admin/** -> ROLE_MODERATOR (includes SENIOR_ADMIN on admin-web sessions).
 */
@RestController
@RequestMapping("/api/v1/admin/reports")
public class AdminReportController {

    private static final CacheControl PRIVATE_NO_STORE = CacheControl.noStore().cachePrivate();

    private final ReportService reportService;

    public AdminReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @GetMapping("/groups")
    public GovernanceService.Page<ReportDtos.AdminReportGroupDto> listGroups(
            @AuthenticationPrincipal Jwt actor,
            Authentication authentication,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String targetType,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return reportService.listAdminReportGroups(actor, isSeniorAdmin(authentication), status, targetType, page, size);
    }

    @GetMapping("/evidence/{id}")
    public ResponseEntity<?> getEvidence(
            @AuthenticationPrincipal Jwt actor,
            Authentication authentication,
            @PathVariable UUID id
    ) {
        ReportDtos.EvidenceDownloadResult result = reportService.loadEvidenceForAdmin(actor, id, isSeniorAdmin(authentication));
        if (ReportService.EVIDENCE_CHAT_LOG.equals(result.evidenceType())) {
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .cacheControl(PRIVATE_NO_STORE)
                    .header("X-Content-Type-Options", "nosniff")
                    .body(result.chatLogJson());
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(result.contentType()))
                .contentLength(result.sizeBytes())
                .cacheControl(PRIVATE_NO_STORE)
                .header("X-Content-Type-Options", "nosniff")
                .body(result.imageResource());
    }

    private static boolean isSeniorAdmin(Authentication authentication) {
        return authentication != null && authentication.getAuthorities().stream()
                .anyMatch(a -> "ROLE_SENIOR_ADMIN".equals(a.getAuthority()));
    }
}
