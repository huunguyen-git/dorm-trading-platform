package com.dormtrading.review.moderation;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Member-facing Review Complaint API (P3-05 / UC-33).
 * Protected by /api/v1/** -> ROLE_MEMBER in SecurityConfig.
 */
@RestController
@RequestMapping("/api/v1/review-complaints")
public class ReviewComplaintController {

    private final ReviewModerationService service;

    public ReviewComplaintController(ReviewModerationService service) {
        this.service = service;
    }

    @GetMapping("/reasons")
    public ReviewModerationDtos.ComplaintReasonListResponse reasons() {
        return service.listComplaintReasons();
    }

    @GetMapping("/received")
    public ReviewModerationDtos.SellerReceivedReviewsResponse receivedReviews(@AuthenticationPrincipal Jwt jwt) {
        return service.listSellerReceivedReviews(jwt);
    }

    @GetMapping("/notifications")
    public ReviewModerationDtos.ReviewNotificationsResponse notifications(@AuthenticationPrincipal Jwt jwt) {
        return service.listMyNotifications(jwt);
    }

    @GetMapping("/chat-evidence-options")
    public ReviewModerationDtos.ChatEvidenceOptionsResponse chatEvidenceOptions(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam UUID reviewId
    ) {
        return service.listChatEvidenceOptionsForReview(jwt, reviewId);
    }

    @PostMapping(value = "/evidence", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReviewModerationDtos.EvidenceUploadResponse> uploadEvidence(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam("files") List<MultipartFile> files
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.uploadEvidence(jwt, files));
    }

    @PostMapping
    public ResponseEntity<ReviewModerationDtos.ComplaintSummaryDto> submitComplaint(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody ReviewModerationDtos.CreateComplaintRequest request
    ) {
        ReviewModerationDtos.ComplaintSummaryDto result = service.submitComplaint(jwt, request);
        HttpStatus status = result.idempotentReplay() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(result);
    }

    @PostMapping("/{id}/withdraw")
    public ReviewModerationDtos.ComplaintSummaryDto withdrawComplaint(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id
    ) {
        return service.withdrawComplaint(jwt, id);
    }

    @PostMapping("/supplemental/{requestId}/respond")
    public ReviewModerationDtos.SupplementalRequestDto respondSupplemental(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId,
            @RequestBody ReviewModerationDtos.RespondSupplementalRequest request
    ) {
        return service.respondToSupplementalRequest(jwt, requestId, request);
    }
}
