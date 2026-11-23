package com.dormtrading.iam.restriction;

import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.iam.management.UserManagementDtos.UserDetail;
import com.dormtrading.iam.restriction.AccountRestrictionService.LockRequest;
import com.dormtrading.iam.restriction.AccountRestrictionService.UnlockRequest;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/users/{userId}")
public class AdminUserRestrictionController {

    private final AccountRestrictionService restrictionService;
    private final Set<String> allowedOrigins;

    public AdminUserRestrictionController(
            AccountRestrictionService restrictionService,
            @Value("${app.cors.origins}") List<String> origins
    ) {
        this.restrictionService = restrictionService;
        this.allowedOrigins = Set.copyOf(origins);
    }

    @PostMapping("/lock")
    public UserDetail lockAccount(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID userId,
            @RequestBody LockRequest request,
            HttpServletRequest httpRequest
    ) {
        requireValidOrigin(httpRequest);
        UUID actorId = UUID.fromString(jwt.getSubject());
        return restrictionService.lockAccount(actorId, userId, request);
    }

    @PostMapping("/unlock")
    public UserDetail unlockAccount(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID userId,
            @RequestBody UnlockRequest request,
            HttpServletRequest httpRequest
    ) {
        requireValidOrigin(httpRequest);
        UUID actorId = UUID.fromString(jwt.getSubject());
        return restrictionService.unlockAccount(actorId, userId, request);
    }

    private void requireValidOrigin(HttpServletRequest request) {
        if (!allowedOrigins.contains(Objects.toString(request.getHeader("Origin"), ""))) {
            throw new AuthFailure(403, "INVALID_ORIGIN", "Origin không được phép.");
        }
    }
}
