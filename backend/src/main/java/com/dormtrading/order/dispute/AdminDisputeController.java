package com.dormtrading.order.dispute;

import com.dormtrading.catalog.ListingValidation;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
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

/**
 * Moderation REST API for P3-03 (UC-29: Xử lý giao dịch quá hạn / tranh chấp).
 * Protected by {@code ROLE_MODERATOR} (which includes {@code SENIOR_ADMIN}) in {@code SecurityConfig}.
 */
@RestController
@RequestMapping("/api/v1/admin/disputes")
public class AdminDisputeController {

    static final String PRIVATE_NO_STORE = "private, no-store";

    private final DisputeService disputeService;

    public AdminDisputeController(DisputeService disputeService) {
        this.disputeService = disputeService;
    }

    @GetMapping
    public ResponseEntity<DisputeDtos.DisputePageDto> listDisputes(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "ALL") String reason,
            @RequestParam(defaultValue = "ALL") String queueState,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        UUID moderatorId = ListingValidation.requireUserId(jwt);
        DisputeDtos.DisputePageDto result = disputeService.listAdminDisputes(moderatorId, reason, queueState, q, page, size);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, PRIVATE_NO_STORE)
                .body(result);
    }

    @GetMapping("/{orderId}")
    public ResponseEntity<DisputeDtos.DisputeDetailDto> getDisputeDetail(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId
    ) {
        UUID moderatorId = ListingValidation.requireUserId(jwt);
        DisputeDtos.DisputeDetailDto detail = disputeService.getAdminDisputeDetail(moderatorId, orderId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, PRIVATE_NO_STORE)
                .body(detail);
    }

    @GetMapping("/{orderId}/evidence/handover/{photoId}")
    public ResponseEntity<Resource> getHandoverPhoto(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @PathVariable UUID photoId
    ) {
        UUID moderatorId = ListingValidation.requireUserId(jwt);
        DisputeDtos.EvidenceBinaryContent content = disputeService.loadAdminHandoverPhoto(moderatorId, orderId, photoId);
        return buildPrivateImageResponse(content);
    }

    @GetMapping("/{orderId}/evidence/supplementary/{attachmentId}")
    public ResponseEntity<Resource> getSupplementaryAttachment(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @PathVariable UUID attachmentId
    ) {
        UUID moderatorId = ListingValidation.requireUserId(jwt);
        DisputeDtos.EvidenceBinaryContent content =
                disputeService.loadAdminSupplementaryAttachment(moderatorId, orderId, attachmentId);
        return buildPrivateImageResponse(content);
    }

    @PostMapping("/{orderId}/complete")
    public ResponseEntity<DisputeDtos.DisputeDetailDto> completeDispute(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @RequestBody(required = false) DisputeDtos.ResolveDisputeRequest request
    ) {
        UUID moderatorId = ListingValidation.requireUserId(jwt);
        DisputeDtos.DisputeDetailDto updated = disputeService.completeDispute(moderatorId, orderId, request);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, PRIVATE_NO_STORE)
                .body(updated);
    }

    @PostMapping("/{orderId}/cancel")
    public ResponseEntity<DisputeDtos.DisputeDetailDto> cancelDispute(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @RequestBody(required = false) DisputeDtos.ResolveDisputeRequest request
    ) {
        UUID moderatorId = ListingValidation.requireUserId(jwt);
        DisputeDtos.DisputeDetailDto updated = disputeService.cancelDispute(moderatorId, orderId, request);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, PRIVATE_NO_STORE)
                .body(updated);
    }

    @PostMapping("/{orderId}/request-evidence")
    public ResponseEntity<DisputeDtos.DisputeDetailDto> requestEvidence(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @RequestBody(required = false) DisputeDtos.RequestEvidenceBody request
    ) {
        UUID moderatorId = ListingValidation.requireUserId(jwt);
        DisputeDtos.DisputeDetailDto updated = disputeService.requestEvidence(moderatorId, orderId, request);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, PRIVATE_NO_STORE)
                .body(updated);
    }

    static ResponseEntity<Resource> buildPrivateImageResponse(DisputeDtos.EvidenceBinaryContent content) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(content.contentType()))
                .header(HttpHeaders.CACHE_CONTROL, PRIVATE_NO_STORE)
                .header(HttpHeaders.PRAGMA, "no-cache")
                .header("X-Content-Type-Options", "nosniff")
                .varyBy(HttpHeaders.AUTHORIZATION);
        if (content.sizeBytes() > 0) {
            builder.contentLength(content.sizeBytes());
        }
        return builder.body(content.resource());
    }
}
