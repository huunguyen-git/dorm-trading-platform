package com.dormtrading.iam.management;

import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.iam.management.UserManagementDtos.PageResult;
import com.dormtrading.iam.management.UserManagementDtos.ReputationHistoryPage;
import com.dormtrading.iam.management.UserManagementDtos.UserDetail;
import com.dormtrading.iam.management.UserManagementDtos.UserModerationLogItem;
import com.dormtrading.iam.management.UserManagementDtos.UserSearchFilter;
import com.dormtrading.iam.management.UserManagementDtos.UserSummary;
import com.dormtrading.iam.management.UserManagementDtos.UserTransactionItem;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/users")
public class AdminUserController {

    private final UserManagementService userManagement;
    private final Set<String> allowedOrigins;

    public AdminUserController(
            UserManagementService userManagement,
            @Value("${app.cors.origins}") List<String> origins
    ) {
        this.userManagement = userManagement;
        this.allowedOrigins = Set.copyOf(origins);
    }

    @GetMapping
    public PageResult<UserSummary> listUsers(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String accountStatus,
            @RequestParam(required = false) String studentStatus,
            @RequestParam(required = false) Boolean emailVerified,
            @RequestParam(required = false) Boolean profileApproved,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) Integer minReputation,
            @RequestParam(required = false) Integer maxReputation,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return userManagement.listUsers(new UserSearchFilter(
                q,
                accountStatus,
                studentStatus,
                emailVerified,
                profileApproved,
                role,
                minReputation,
                maxReputation,
                page,
                size
        ));
    }

    @GetMapping("/{userId}")
    public UserDetail getUserDetail(@PathVariable UUID userId) {
        return userManagement.getUserDetail(userId);
    }

    @GetMapping("/{userId}/transactions")
    public PageResult<UserTransactionItem> getUserTransactions(
            @PathVariable UUID userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return userManagement.getUserTransactions(userId, page, size);
    }

    @GetMapping("/{userId}/reputation-history")
    public ReputationHistoryPage getUserReputationHistory(
            @PathVariable UUID userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return userManagement.getUserReputationHistory(userId, page, size);
    }

    @GetMapping("/{userId}/moderation-logs")
    public PageResult<UserModerationLogItem> getUserModerationLogs(
            @PathVariable UUID userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return userManagement.getUserModerationLogs(userId, page, size);
    }

    @PatchMapping("/{userId}")
    public UserDetail updateUserIdentity(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID userId,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        requireValidOrigin(request);
        UUID actorId = UUID.fromString(jwt.getSubject());
        return userManagement.updateUserIdentity(actorId, userId, body);
    }

    private void requireValidOrigin(HttpServletRequest request) {
        if (!allowedOrigins.contains(Objects.toString(request.getHeader("Origin"), ""))) {
            throw new AuthFailure(403, "INVALID_ORIGIN", "Origin không được phép.");
        }
    }
}
