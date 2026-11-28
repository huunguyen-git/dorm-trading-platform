package com.dormtrading.order;

import com.dormtrading.catalog.ListingValidation;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * In-app Notifications API for Order & Pending Listing Update events (P2-04/P2-05).
 */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final OrderNotificationService notificationService;

    public NotificationController(OrderNotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public OrderDtos.NotificationsPageDto listNotifications(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        UUID userId = ListingValidation.requireUserId(jwt);
        return notificationService.listNotifications(userId, unreadOnly, page, size);
    }

    @PostMapping("/{id}/read")
    public OrderDtos.NotificationDto markAsRead(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id
    ) {
        UUID userId = ListingValidation.requireUserId(jwt);
        return notificationService.markAsRead(userId, id);
    }

    @PostMapping("/read-all")
    public Map<String, Integer> markAllAsRead(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = ListingValidation.requireUserId(jwt);
        int updated = notificationService.markAllAsRead(userId);
        return Map.of("updatedCount", updated);
    }
}
