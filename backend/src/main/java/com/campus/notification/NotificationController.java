package com.campus.notification;

import com.campus.notification.api.NotificationDtos.NotificationPage;
import com.campus.notification.api.NotificationDtos.NotificationView;
import com.campus.shared.security.SecurityUtils;
import com.campus.shared.web.ApiException;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {
    private final NotificationService service;

    public NotificationController(NotificationService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<NotificationPage> listNotifications(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        UUID memberId = requireMember();
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, CacheControl.noStore().getHeaderValue()).body(service.list(memberId, page, size));
    }

    @PostMapping("/{notificationId}/read")
    public ResponseEntity<NotificationView> markNotificationRead(
        @PathVariable UUID notificationId,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) {
        UUID memberId = requireMember();
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, CacheControl.noStore().getHeaderValue()).body(service.markRead(memberId, notificationId, idempotencyKey));
    }

    private UUID requireMember() {
        UUID id = SecurityUtils.currentMemberId();
        if (id == null) throw ApiException.forbidden("FORBIDDEN", "Cần đăng nhập để xem thông báo");
        return id;
    }
}
