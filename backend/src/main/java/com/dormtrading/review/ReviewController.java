package com.dormtrading.review;

import com.dormtrading.catalog.ListingValidation;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * REST endpoints for P3-04 Reviews (UC-30, UC-31, UC-32; FR-10, FR-12, NFR-01, NFR-03).
 */
@RestController
@RequestMapping("/api/v1")
public class ReviewController {

    private static final CacheControl PRIVATE_NO_STORE = CacheControl.noStore().cachePrivate();

    private final ReviewService reviewService;
    private final ReviewEvidenceService evidenceService;

    public ReviewController(ReviewService reviewService, ReviewEvidenceService evidenceService) {
        this.reviewService = reviewService;
        this.evidenceService = evidenceService;
    }

    @PostMapping(value = "/orders/{orderId}/review/evidence", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReviewDtos.EvidenceUploadResponse> uploadEvidence(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @RequestParam("files") List<MultipartFile> files
    ) {
        UUID buyerId = ListingValidation.requireUserId(jwt);
        ReviewDtos.EvidenceUploadResponse response = evidenceService.uploadEvidence(buyerId, orderId, files);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @DeleteMapping("/orders/{orderId}/review/evidence/{evidenceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDraftEvidence(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @PathVariable UUID evidenceId
    ) {
        UUID buyerId = ListingValidation.requireUserId(jwt);
        evidenceService.deleteDraftEvidence(buyerId, orderId, evidenceId);
    }

    @GetMapping("/reviews/evidence/{evidenceId}")
    public ResponseEntity<Resource> downloadEvidence(
            @PathVariable UUID evidenceId,
            @AuthenticationPrincipal Jwt jwt,
            Authentication authentication
    ) {
        UUID viewerId = ListingValidation.requireUserId(jwt);
        boolean isModerator = hasModeratorOrSeniorRole(authentication);

        ReviewDtos.EvidenceContent content = evidenceService.loadEvidence(evidenceId, viewerId, isModerator);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(content.contentType()))
                .contentLength(content.sizeBytes())
                .cacheControl(PRIVATE_NO_STORE)
                .header("X-Content-Type-Options", "nosniff")
                .varyBy(HttpHeaders.AUTHORIZATION)
                .body(content.resource());
    }

    @GetMapping("/orders/{orderId}/review")
    public ReviewDtos.OrderReviewStateDto getOrderReviewState(
            @PathVariable UUID orderId,
            @AuthenticationPrincipal Jwt jwt,
            Authentication authentication
    ) {
        UUID viewerId = ListingValidation.requireUserId(jwt);
        boolean isModerator = hasModeratorOrSeniorRole(authentication);
        return reviewService.getOrderReviewState(orderId, viewerId, isModerator);
    }

    @PostMapping("/orders/{orderId}/review")
    public ResponseEntity<ReviewDtos.ReviewMutationResponse> createReview(
            @PathVariable UUID orderId,
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "Idempotency-Key", required = false) String headerIdempotencyKey,
            @RequestBody(required = false) ReviewDtos.CreateReviewRequest request
    ) {
        UUID buyerId = ListingValidation.requireUserId(jwt);
        ReviewDtos.ReviewMutationResponse response = reviewService.createReview(buyerId, orderId, request, headerIdempotencyKey);
        HttpStatus status = response.idempotentReplay() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(response);
    }

    @PutMapping("/reviews/{reviewId}")
    public ReviewDtos.ReviewMutationResponse editReview(
            @PathVariable UUID reviewId,
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody(required = false) ReviewDtos.UpdateReviewRequest request
    ) {
        UUID buyerId = ListingValidation.requireUserId(jwt);
        return reviewService.editReview(buyerId, reviewId, request);
    }

    @DeleteMapping("/reviews/{reviewId}")
    public ReviewDtos.ReviewMutationResponse deleteReview(
            @PathVariable UUID reviewId,
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) Long expectedVersion
    ) {
        UUID buyerId = ListingValidation.requireUserId(jwt);
        return reviewService.deleteReview(buyerId, reviewId, expectedVersion);
    }

    @GetMapping("/sellers/{sellerId}/reviews")
    public ReviewDtos.SellerReviewsResponse getSellerPublicReviews(
            @PathVariable UUID sellerId,
            @RequestParam(required = false) Integer rating,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return reviewService.getPublicSellerReviews(sellerId, rating, page, size);
    }

    private static boolean hasModeratorOrSeniorRole(Authentication authentication) {
        return authentication != null && authentication.getAuthorities().stream()
                .anyMatch(a -> "ROLE_MODERATOR".equals(a.getAuthority())
                        || "ROLE_SENIOR_ADMIN".equals(a.getAuthority()));
    }
}
