package com.campus.moderation;

import com.campus.moderation.api.ModerationDtos.CreateReportRequest;
import com.campus.moderation.api.ModerationDtos.ReportView;
import com.campus.shared.api.SharedDtos.FieldViolation;
import com.campus.shared.web.ApiException;
import com.campus.shared.web.CommandReceiptRepository;
import com.campus.shared.web.RequestHash;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Slice 1 report intake. FR-11 is settled: evidence is mandatory and submission carries no penalty.
 * A08 stays OPEN, so nothing here writes reputation_entries or account restrictions.
 */
@Service
public class ReportService {
    public static final String OPERATION = "submitReport";

    private final ReportRepository repository;
    private final CommandReceiptRepository commandReceipts;

    public ReportService(
        ReportRepository repository,
        CommandReceiptRepository commandReceipts
    ) {
        this.repository = repository;
        this.commandReceipts = commandReceipts;
    }

    @Transactional
    public ReportView submit(
        UUID reporterId,
        UUID idempotencyKey,
        CreateReportRequest request
    ) {
        String description = request.description() == null ? "" : request.description().trim();
        if (description.isEmpty()) {
            throw ApiException.badRequest(
                    "VALIDATION_ERROR",
                    "Vui lòng mô tả nội dung báo cáo",
                    List.of());
        }
        List<UUID> evidence = request.evidenceIds();
        if (evidence == null || evidence.isEmpty()) {
            throw ApiException.badRequest(
                    "VALIDATION_ERROR",
                    "Vui lòng gửi ít nhất một bằng chứng",
                    List.of());
        }

        // All validations happen before claiming the receipt so a rejected report
        // leaves no receipt row and the key stays reusable.
        if (request.reportedMemberId().equals(reporterId)) {
            throw ApiException.forbidden("FORBIDDEN", "Không thể tự báo cáo chính mình");
        }
        if (!repository.memberExists(request.reportedMemberId())) {
            throw ApiException.notFound("NOT_FOUND", "Không tìm thấy thành viên bị báo cáo");
        }
        if (request.listingId() != null) {
            UUID seller = repository.listingSeller(request.listingId())
                    .orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy tin đăng"));
            if (!seller.equals(request.reportedMemberId())) {
                throw ApiException.conflict(
                        "CONFLICT",
                        "Người bị báo cáo không phải người bán của tin đăng này");
            }
        }
        if (request.tradeId() != null) {
            List<UUID> parties = repository.tradeParties(request.tradeId())
                    .orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy giao dịch"));
            if (!parties.contains(request.reportedMemberId())) {
                throw ApiException.conflict(
                        "CONFLICT",
                        "Người bị báo cáo không thuộc giao dịch này");
            }
        }
        List<FieldViolation> violations = new ArrayList<>();
        for (UUID mediaId : evidence) {
            if (!repository.evidenceBelongsToReporter(mediaId, reporterId)) {
                violations.add(
                        new FieldViolation(
                                "evidenceIds",
                                "Bằng chứng không hợp lệ hoặc không thuộc về bạn"));
            }
        }
        if (!violations.isEmpty()) {
            throw ApiException.badRequest(
                    "VALIDATION_ERROR",
                    "Bằng chứng phải là tệp bạn đã tải lên với mục đích REPORT",
                    violations);
        }

        String hash = canonicalHash(reporterId, request, description);
        UUID id = UUID.randomUUID();
        UUID replayId = commandReceipts.replayTarget(
                        reporterId,
                        OPERATION,
                        idempotencyKey,
                        hash,
                        id,
                        201)
                .orElse(null);
        if (replayId != null) {
            return repository.find(replayId)
                    .orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy báo cáo"));
        }

        repository.insertReport(
                id,
                reporterId,
                request.reportedMemberId(),
                request.listingId(),
                request.tradeId(),
                description);
        for (UUID mediaId : evidence) {
            repository.attachEvidence(id, mediaId, reporterId);
        }
        repository.notifyModerators(
                "report:submitted:" + id,
                "Có báo cáo vi phạm mới cần xem xét");

        return repository.find(id)
                .orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy báo cáo"));
    }

    /**
     * Reporter or case handler only; every other caller gets a concealed 404.
     */
    public ReportView read(UUID reportId, UUID memberId, boolean handler) {
        boolean reporter = repository.reporterOf(reportId)
                .filter(reporterId -> reporterId.equals(memberId))
                .isPresent();
        if (!reporter && !handler) {
            throw ApiException.notFound("NOT_FOUND", "Không tìm thấy báo cáo");
        }
        return repository.find(reportId)
                .orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy báo cáo"));
    }

    private String canonicalHash(
            UUID reporterId,
            CreateReportRequest request,
            String description
    ) {
        StringBuilder canonical = new StringBuilder(OPERATION)
                .append('|').append(reporterId)
                .append('|').append(request.reportedMemberId())
                .append('|').append(request.listingId())
                .append('|').append(request.tradeId())
                .append('|').append(description);
        for (UUID mediaId : request.evidenceIds()) {
            canonical.append('|').append(mediaId);
        }
        return RequestHash.sha256Hex(canonical.toString());
    }
}
