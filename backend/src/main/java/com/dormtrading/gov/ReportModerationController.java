package com.dormtrading.gov;

import com.dormtrading.gov.ReportModerationService.*;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/reports")
public class ReportModerationController {
    private final ReportModerationService service;

    public ReportModerationController(ReportModerationService service) {
        this.service = service;
    }

    @GetMapping("/groups")
    public GovernanceService.Page<ReportGroup> groups(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "CHO_XU_LY") String status,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.groups(jwt, status, category, targetType, q, page, size);
    }

    @GetMapping("/groups/detail")
    public ReportGroupDetail groupDetail(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam String targetType,
            @RequestParam UUID targetId,
            @RequestParam String category,
            @RequestParam(defaultValue = "CHO_XU_LY") String status,
            @RequestParam(required = false) UUID decisionId) {
        return service.groupDetail(jwt, targetType, targetId, category, status, decisionId);
    }

    @GetMapping("/penalties")
    public List<ActivePenalty> activePenalties() {
        return service.activePenalties();
    }

    @GetMapping("/duplicate-candidates")
    public List<DuplicateCandidate> duplicateCandidates(@AuthenticationPrincipal Jwt jwt) {
        return service.duplicateCandidates(jwt);
    }

    @PostMapping("/groups/resolve")
    public ResolveResult resolve(@AuthenticationPrincipal Jwt jwt, @RequestBody ResolveInput input) {
        return service.resolve(jwt, input);
    }
}
