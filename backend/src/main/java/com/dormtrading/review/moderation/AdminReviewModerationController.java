package com.dormtrading.review.moderation;

import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Moderator & Senior Admin Review Moderation API (P3-05 / UC-34).
 * Protected by /api/v1/admin/** -> ROLE_MODERATOR (includes SENIOR_ADMIN on admin-web sessions).
 */
@RestController
@RequestMapping("/api/v1/admin/review-moderation")
public class AdminReviewModerationController {

    private static final CacheControl PRIVATE_NO_STORE = CacheControl.noStore().cachePrivate();

    private final ReviewModerationService service;

    public AdminReviewModerationController(ReviewModerationService service) {
        this.service = service;
    }

    @GetMapping("/queue")
    public ReviewModerationDtos.Page<ReviewModerationDtos.ModerationQueueItemDto> queue(
            @AuthenticationPrincipal Jwt actor,
            Authentication authentication,
            @RequestParam(defaultValue = "ALL") String type,
            @RequestParam(defaultValue = "PENDING") String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return service.listModerationQueue(actor, isSeniorAdmin(authentication), type, status, page, size);
    }

    @GetMapping("/cases/{caseType}/{caseId}")
    public ReviewModerationDtos.ModerationCaseDetailDto caseDetail(
            @AuthenticationPrincipal Jwt actor,
            Authentication authentication,
            @PathVariable String caseType,
            @PathVariable UUID caseId
    ) {
        return service.getModerationCaseDetail(actor, isSeniorAdmin(authentication), caseType, caseId);
    }

    @PostMapping("/reviews/{reviewId}/decide")
    public ReviewModerationDtos.ModerationDecisionResponse decideReview(
            @AuthenticationPrincipal Jwt actor,
            Authentication authentication,
            @PathVariable UUID reviewId,
            @RequestBody ReviewModerationDtos.DecideReviewRequest request
    ) {
        return service.decideLowStarReview(actor, isSeniorAdmin(authentication), reviewId, request);
    }

    @PostMapping("/complaints/{complaintId}/decide")
    public ReviewModerationDtos.ModerationDecisionResponse decideComplaint(
            @AuthenticationPrincipal Jwt actor,
            Authentication authentication,
            @PathVariable UUID complaintId,
            @RequestBody ReviewModerationDtos.DecideComplaintRequest request
    ) {
        return service.decideComplaint(actor, isSeniorAdmin(authentication), complaintId, request);
    }

    @GetMapping("/evidence/{id}")
    public ResponseEntity<?> getEvidence(
            @AuthenticationPrincipal Jwt actor,
            Authentication authentication,
            @PathVariable UUID id
    ) {
        ReviewModerationDtos.EvidenceDownloadResult result =
                service.loadEvidenceForAdmin(actor, isSeniorAdmin(authentication), id);
        if (ReviewModerationService.EVIDENCE_CHAT_LOG.equals(result.evidenceType())) {
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
