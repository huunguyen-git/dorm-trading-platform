package com.dormtrading.gov;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Member-facing Report API (P2-06 / UC-35, UC-36).
 * Protected by /api/v1/** -> ROLE_MEMBER in SecurityConfig.
 */
@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @GetMapping("/categories")
    public ReportDtos.ReportCategoryListResponse categories(
            @RequestParam(required = false) String targetType
    ) {
        return reportService.listCategories(targetType);
    }

    @PostMapping(value = "/evidence", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReportDtos.EvidenceUploadResponse> uploadEvidence(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam("files") List<MultipartFile> files
    ) {
        ReportDtos.EvidenceUploadResponse response = reportService.uploadEvidence(jwt, files);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/chat-evidence-options")
    public ReportDtos.ChatEvidenceOptionsResponse chatEvidenceOptions(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam String targetType,
            @RequestParam UUID targetId
    ) {
        return reportService.listChatEvidenceOptions(jwt, targetType, targetId);
    }

    @PostMapping
    public ResponseEntity<ReportDtos.ReportSubmissionResponse> submitReport(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody ReportDtos.CreateReportRequest request
    ) {
        ReportDtos.ReportSubmissionResponse response = reportService.submitReport(jwt, request);
        HttpStatus status = response.idempotentReplay() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(response);
    }

    @GetMapping("/mine")
    public GovernanceService.Page<ReportDtos.MyReportSummaryDto> myReports(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return reportService.listMyReports(jwt, page, size);
    }
}
