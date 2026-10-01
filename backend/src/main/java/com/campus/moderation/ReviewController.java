package com.campus.moderation;

import com.campus.listing.api.ListingDtos.ListingView;
import com.campus.moderation.api.ModerationDtos.ReviewListingRequest;
import com.campus.shared.security.SecurityUtils;
import com.campus.shared.web.ApiException;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/moderation/listings")
public class ReviewController {
    private final ReviewService service;

    public ReviewController(ReviewService service) { this.service = service; }

    @PostMapping("/{listingId}/decisions")
    public ResponseEntity<ListingView> reviewListing(
        @PathVariable UUID listingId,
        @Valid @RequestBody ReviewListingRequest request,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) {
        UUID moderatorId = SecurityUtils.currentMemberId();
        if (moderatorId == null) throw ApiException.forbidden("FORBIDDEN", "Cần đăng nhập để duyệt tin đăng");
        if (!SecurityUtils.hasRole("MODERATOR") && !SecurityUtils.hasRole("ADMIN")) {
            throw ApiException.forbidden("FORBIDDEN", "Bạn không có quyền duyệt tin đăng");
        }
        return ResponseEntity.ok(service.review(moderatorId, listingId, idempotencyKey, request));
    }
}
