package com.campus.notification;

import com.campus.notification.api.NotificationDtos.NotificationPage;
import com.campus.notification.api.NotificationDtos.NotificationView;
import com.campus.shared.web.ApiException;
import com.campus.shared.web.CommandReceiptRepository;
import com.campus.shared.web.RequestHash;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class NotificationService {
    private static final String OPERATION = "markNotificationRead";

    private final NotificationRepository repository;
    private final CommandReceiptRepository receipts;

    public NotificationService(
        NotificationRepository repository,
        CommandReceiptRepository receipts
    ) {
        this.repository = repository;
        this.receipts = receipts;
    }

    public NotificationPage list(
        UUID memberId,
        Integer requestedPage,
        Integer requestedSize
    ) {
        int page = requestedPage == null ? 0 : requestedPage;
        int size = requestedSize == null ? 20 : requestedSize;
        if (page < 0 || size < 1 || size > 100) {
            throw ApiException.badRequest(
                    "VALIDATION_ERROR",
                    "Tham số phân trang không hợp lệ",
                    List.of());
        }
        return new NotificationPage(
                repository.page(memberId, size, (long) page * size),
                page,
                size,
                repository.count(memberId));
    }

    @Transactional
    public NotificationView markRead(
        UUID memberId,
        UUID notificationId,
        UUID idempotencyKey
    ) {
        NotificationView existing = repository.findOwned(notificationId, memberId)
                .orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy thông báo"));
        repository.lock(notificationId, memberId);
        String hash = RequestHash.sha256Hex(OPERATION + "|" + memberId + "|" + notificationId);
        UUID replay = receipts.replayTarget(
                memberId, OPERATION, idempotencyKey, hash, notificationId, 200
        ).orElse(null);
        if (replay != null) {
            return repository.findOwned(replay, memberId)
                    .orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy thông báo"));
        }
        repository.markRead(notificationId, memberId);
        return repository.findOwned(notificationId, memberId)
                .orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy thông báo"));
    }
}
