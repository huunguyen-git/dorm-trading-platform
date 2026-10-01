package com.campus.moderation;

import com.campus.listing.api.ListingDtos.ListingView;
import com.campus.moderation.api.ModerationDtos.ListingVerdict;
import com.campus.moderation.api.ModerationDtos.ReviewListingRequest;
import com.campus.shared.web.ApiException;
import com.campus.shared.web.CommandReceiptRepository;
import com.campus.shared.web.RequestHash;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReviewService {
    private static final String OPERATION = "reviewListing";
    private final ReviewRepository repository;
    private final CommandReceiptRepository receipts;

    public ReviewService(ReviewRepository repository, CommandReceiptRepository receipts) {
        this.repository = repository;
        this.receipts = receipts;
    }

    @Transactional
    public ListingView review(UUID moderatorId, UUID listingId, UUID idempotencyKey, ReviewListingRequest request) {
        String reason = request.reason() == null ? "" : request.reason().trim();
        if (reason.isEmpty()) throw ApiException.badRequest("VALIDATION_ERROR", "Lý do duyệt không được để trống", List.of());

        UUID sellerId = repository.sellerOf(listingId).orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy tin đăng"));
        if (!repository.listingOfRevision(request.revisionId()).filter(listingId::equals).isPresent()) {
            throw ApiException.notFound("NOT_FOUND", "Không tìm thấy phiên bản tin đăng");
        }
        repository.lockMember(sellerId);
        repository.lockListing(listingId);
        repository.lockRevision(request.revisionId());

        long version = repository.versionOf(listingId).orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy tin đăng"));
        String hash = RequestHash.sha256Hex(OPERATION + "|" + moderatorId + "|" + listingId + "|" + request.expectedVersion() + "|" + request.revisionId() + "|" + request.verdict() + "|" + reason);
        var existingReceipt = receipts.find(moderatorId, OPERATION, idempotencyKey);
        if (existingReceipt.isPresent()) {
            if (!existingReceipt.get().requestHash().equals(hash)) {
                throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "Idempotency-Key đã được dùng với nội dung khác");
            }
            return repository.view(existingReceipt.get().resourceId(), request.revisionId())
                .orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy tin đăng"));
        }
        if (version != request.expectedVersion()) throw ApiException.conflict("CONFLICT", "Phiên bản đã cũ, vui lòng tải lại");
        if (!"PENDING".equals(repository.revisionState(request.revisionId()).orElse(null))) {
            throw ApiException.conflict("CONFLICT", "Phiên bản tin đăng không ở trạng thái chờ duyệt");
        }
        receipts.replayTarget(moderatorId, OPERATION, idempotencyKey, hash, listingId, 200);

        if (request.verdict() == ListingVerdict.APPROVED) {
            // ponytail: A14 counts only PUBLISHED listings until M2 settles unavailable-listing classification.
            long limit = repository.reputation(sellerId) < 120 ? 5 : 10;
            if (repository.countPublished(sellerId) >= limit) throw ApiException.conflict("CONFLICT", "Người bán đã đạt giới hạn tin công khai");
            repository.publish(listingId, request.revisionId());
        }
        repository.updateReviewState(request.revisionId(), request.verdict().name());
        repository.insertReview(UUID.randomUUID(), request.revisionId(), moderatorId, request.verdict().name(), reason);
        repository.insertEvent(UUID.randomUUID(), listingId, moderatorId, request.verdict().name(), reason);
        boolean approved = request.verdict() == ListingVerdict.APPROVED;
        repository.notifySeller(UUID.randomUUID(), sellerId, "listing:" + request.verdict().name().toLowerCase() + ":" + listingId,
            "LISTING_" + request.verdict().name(), approved ? "Tin đăng của bạn đã được duyệt" : "Tin đăng của bạn đã bị từ chối");
        return repository.view(listingId, request.revisionId()).orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy tin đăng"));
    }
}
