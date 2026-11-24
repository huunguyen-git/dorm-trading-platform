package com.dormtrading.iam.management;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class UserManagementDtos {

    private UserManagementDtos() {
    }

    public record UserSearchFilter(
            String q,
            String accountStatus,
            String studentStatus,
            Boolean emailVerified,
            Boolean profileApproved,
            String role,
            Integer minReputation,
            Integer maxReputation,
            int page,
            int size
    ) {
    }

    public record PageResult<T>(
            List<T> items,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {
    }

    public record UserSummary(
            UUID id,
            String fullName,
            String email,
            String studentId,
            String phone,
            String studentStatus,
            String accountStatus,
            String restrictionType,
            Instant lockedUntil,
            boolean emailVerified,
            boolean profileApproved,
            int reputationScore,
            List<String> systemRoles,
            Instant createdAt
    ) {
    }

    public record UserDetail(
            UUID id,
            String fullName,
            String email,
            String studentId,
            String phone,
            String university,
            String campus,
            String major,
            String cohort,
            String studentStatus,
            String studentCardFront,
            String studentCardBack,
            boolean hasStudentCardFront,
            boolean hasStudentCardBack,
            boolean emailVerified,
            boolean profileApproved,
            int reputationScore,
            String accountStatus,
            String restrictionType,
            String restrictionReason,
            Instant lockedUntil,
            boolean appealable,
            List<String> systemRoles,
            Instant createdAt,
            Instant updatedAt,
            long version
    ) {
    }

    public record UserTransactionItem(
            UUID transactionId,
            UUID listingId,
            String listingTitle,
            String transactionRole,
            UUID counterpartyId,
            String counterpartyName,
            String counterpartyStudentId,
            int agreedPrice,
            String status,
            Instant scheduledAt,
            Instant completedAt,
            Instant createdAt
    ) {
    }

    public record UserReputationHistoryItem(
            UUID id,
            String changeType,
            int delta,
            int scoreBefore,
            int scoreAfter,
            String reason,
            String referenceSource,
            String referenceId,
            UUID actorId,
            String actorName,
            Instant createdAt
    ) {
    }

    public record ReputationHistoryPage(
            int currentScore,
            List<UserReputationHistoryItem> items,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {
    }

    public record UserModerationLogItem(
            UUID id,
            String actionType,
            String reason,
            String previousStatus,
            String newStatus,
            String lockType,
            Instant lockedUntil,
            boolean appealable,
            UUID actorId,
            String actorName,
            Map<String, Object> details,
            Instant createdAt
    ) {
    }
}
