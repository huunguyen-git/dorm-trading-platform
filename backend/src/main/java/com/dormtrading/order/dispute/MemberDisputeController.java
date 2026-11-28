package com.dormtrading.order.dispute;

import com.dormtrading.catalog.ListingValidation;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Member-facing dispute status, private evidence view (read-only allowed for BI_KHOA participants),
 * and supplementary evidence submission API (requires ROLE_MEMBER / HOAT_DONG).
 */
@RestController
@RequestMapping("/api/v1/orders/{orderId}/dispute")
public class MemberDisputeController {

    private final DisputeService disputeService;

    public MemberDisputeController(DisputeService disputeService) {
        this.disputeService = disputeService;
    }

    @GetMapping
    public ResponseEntity<DisputeDtos.MemberDisputeDto> getMemberDispute(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId
    ) {
        UUID viewerId = ListingValidation.requireUserId(jwt);
        DisputeDtos.MemberDisputeDto dto = disputeService.getMemberDispute(viewerId, orderId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, AdminDisputeController.PRIVATE_NO_STORE)
                .body(dto);
    }

    @GetMapping("/evidence/{attachmentId}")
    public ResponseEntity<Resource> getMemberEvidenceAttachment(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @PathVariable UUID attachmentId
    ) {
        UUID viewerId = ListingValidation.requireUserId(jwt);
        DisputeDtos.EvidenceBinaryContent content =
                disputeService.loadMemberSupplementaryAttachment(viewerId, orderId, attachmentId);
        return AdminDisputeController.buildPrivateImageResponse(content);
    }

    @PostMapping(
            value = "/evidence-requests/{requestId}/responses",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<DisputeDtos.MemberDisputeDto> submitEvidenceResponse(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @PathVariable UUID requestId,
            @RequestParam("note") String note,
            @RequestParam(value = "files", required = false) List<MultipartFile> files
    ) {
        UUID senderId = ListingValidation.requireUserId(jwt);
        DisputeDtos.MemberDisputeDto updated =
                disputeService.submitEvidenceResponse(senderId, orderId, requestId, note, files);
        return ResponseEntity.status(HttpStatus.CREATED)
                .header(HttpHeaders.CACHE_CONTROL, AdminDisputeController.PRIVATE_NO_STORE)
                .body(updated);
    }
}
