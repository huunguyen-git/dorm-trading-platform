package com.dormtrading.order;

import com.dormtrading.catalog.ListingValidation;
import java.util.ArrayList;
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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * P3-02 Transaction Handover, 6-Digit OTP Completion & Post-Delivery Mutual Cancellation Controller
 * (UC-27, UC-28; FR-08, FR-09, NFR-01, NFR-03).
 */
@RestController
@RequestMapping("/api/v1/transactions")
public class TransactionController {

    private static final CacheControl PRIVATE_NO_STORE = CacheControl.noStore().cachePrivate();

    private final TransactionHandoverService handoverService;

    public TransactionController(TransactionHandoverService handoverService) {
        this.handoverService = handoverService;
    }

    @GetMapping
    public ResponseEntity<TransactionDtos.TransactionPageDto> listTransactions(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "ALL") String role,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        UUID viewerId = ListingValidation.requireUserId(jwt);
        TransactionDtos.TransactionPageDto result = handoverService.listTransactions(viewerId, role, status, q, page, size);
        return ResponseEntity.ok()
                .cacheControl(PRIVATE_NO_STORE)
                .header(HttpHeaders.PRAGMA, "no-cache")
                .varyBy(HttpHeaders.AUTHORIZATION)
                .body(result);
    }

    @GetMapping("/{id}")
    public ResponseEntity<TransactionDtos.TransactionDetailDto> getTransactionDetail(
            @AuthenticationPrincipal Jwt jwt,
            Authentication authentication,
            @PathVariable UUID id
    ) {
        UUID viewerId = ListingValidation.requireUserId(jwt);
        TransactionDtos.AdminViewerRole adminRole = resolveAdminViewerRole(authentication);
        TransactionDtos.TransactionDetailDto detail = handoverService.getTransactionDetail(viewerId, adminRole, id);
        return privateDetailResponse(HttpStatus.OK, detail);
    }

    @PostMapping(value = "/{id}/deliver", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<TransactionDtos.TransactionDetailDto> reportDelivered(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestPart(value = "file", required = false) MultipartFile singleFile,
            @RequestPart(value = "files", required = false) List<MultipartFile> multiFiles,
            @RequestParam(value = "note", required = false) String note,
            @RequestParam(value = "version", required = false) Long version
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        List<MultipartFile> mergedFiles = new ArrayList<>();
        if (singleFile != null) {
            mergedFiles.add(singleFile);
        }
        if (multiFiles != null) {
            mergedFiles.addAll(multiFiles);
        }
        TransactionDtos.TransactionDetailDto updated = handoverService.reportDelivered(
                sellerId,
                id,
                mergedFiles,
                note,
                version
        );
        return privateDetailResponse(HttpStatus.OK, updated);
    }

    @GetMapping("/{id}/handover-photo")
    public ResponseEntity<Resource> getPrimaryHandoverPhoto(
            @AuthenticationPrincipal Jwt jwt,
            Authentication authentication,
            @PathVariable UUID id
    ) {
        UUID viewerId = ListingValidation.requireUserId(jwt);
        TransactionDtos.AdminViewerRole adminRole = resolveAdminViewerRole(authentication);
        TransactionDtos.HandoverPhotoContent photo = handoverService.loadHandoverPhoto(viewerId, adminRole, id, null);
        return privatePhotoResponse(photo);
    }

    @GetMapping("/{id}/handover-photos/{photoId}")
    public ResponseEntity<Resource> getSpecificHandoverPhoto(
            @AuthenticationPrincipal Jwt jwt,
            Authentication authentication,
            @PathVariable UUID id,
            @PathVariable UUID photoId
    ) {
        UUID viewerId = ListingValidation.requireUserId(jwt);
        TransactionDtos.AdminViewerRole adminRole = resolveAdminViewerRole(authentication);
        TransactionDtos.HandoverPhotoContent photo = handoverService.loadHandoverPhoto(viewerId, adminRole, id, photoId);
        return privatePhotoResponse(photo);
    }

    @PostMapping("/{id}/complete")
    public ResponseEntity<TransactionDtos.TransactionDetailDto> completeTransaction(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) TransactionDtos.CompleteTransactionRequest request
    ) {
        UUID buyerId = ListingValidation.requireUserId(jwt);
        TransactionDtos.TransactionDetailDto updated = handoverService.completeTransaction(buyerId, id, request);
        return privateDetailResponse(HttpStatus.OK, updated);
    }

    @PostMapping("/{id}/otp/reissue")
    public ResponseEntity<TransactionDtos.TransactionDetailDto> reissueOtp(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) TransactionDtos.ReissueOtpRequest request
    ) {
        UUID callerId = ListingValidation.requireUserId(jwt);
        TransactionDtos.TransactionDetailDto updated = handoverService.reissueOtp(callerId, id, request);
        return privateDetailResponse(HttpStatus.OK, updated);
    }

    @PostMapping("/{id}/cancel-requests")
    public ResponseEntity<TransactionDtos.TransactionDetailDto> createCancelRequest(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) TransactionDtos.CreateCancelRequest request
    ) {
        UUID callerId = ListingValidation.requireUserId(jwt);
        TransactionDtos.CancelRequestMutationResult result = handoverService.createCancelRequest(callerId, id, request);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return privateDetailResponse(status, result.detail());
    }

    @PostMapping("/{id}/cancel-requests/{reqId}/respond")
    public ResponseEntity<TransactionDtos.TransactionDetailDto> respondCancelRequest(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @PathVariable UUID reqId,
            @RequestBody(required = false) TransactionDtos.RespondCancelRequest request
    ) {
        UUID responderId = ListingValidation.requireUserId(jwt);
        TransactionDtos.TransactionDetailDto updated = handoverService.respondCancelRequest(responderId, id, reqId, request);
        return privateDetailResponse(HttpStatus.OK, updated);
    }

    private static ResponseEntity<TransactionDtos.TransactionDetailDto> privateDetailResponse(
            HttpStatus status,
            TransactionDtos.TransactionDetailDto detail
    ) {
        return ResponseEntity.status(status)
                .cacheControl(PRIVATE_NO_STORE)
                .header(HttpHeaders.PRAGMA, "no-cache")
                .varyBy(HttpHeaders.AUTHORIZATION)
                .body(detail);
    }

    private static ResponseEntity<Resource> privatePhotoResponse(TransactionDtos.HandoverPhotoContent photo) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .contentLength(photo.sizeBytes())
                .cacheControl(PRIVATE_NO_STORE)
                .header(HttpHeaders.PRAGMA, "no-cache")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .varyBy(HttpHeaders.AUTHORIZATION)
                .body(photo.resource());
    }

    private static TransactionDtos.AdminViewerRole resolveAdminViewerRole(Authentication authentication) {
        if (authentication == null) {
            return TransactionDtos.AdminViewerRole.NONE;
        }
        boolean hasModerator = false;
        for (var authority : authentication.getAuthorities()) {
            String role = authority.getAuthority();
            if ("ROLE_SENIOR_ADMIN".equals(role)) {
                return TransactionDtos.AdminViewerRole.SENIOR_ADMIN;
            }
            if ("ROLE_MODERATOR".equals(role)) {
                hasModerator = true;
            }
        }
        return hasModerator ? TransactionDtos.AdminViewerRole.MODERATOR : TransactionDtos.AdminViewerRole.NONE;
    }
}
