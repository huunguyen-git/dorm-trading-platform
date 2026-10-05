package com.campus.notification.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Shared contract types; business authorization and transactional services are separate work.
 */
public final class NotificationDtos {
    private NotificationDtos() {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NotificationView(
            @NotNull UUID id,
            @NotBlank String kind,
            @NotBlank String message,
            @NotNull Instant createdAt,
            Instant readAt
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NotificationPage(
            @NotNull List<@NotNull NotificationView> items,
            @NotNull Integer page,
            @NotNull Integer size,
            @NotNull Long totalElements
    ) {
        public NotificationPage {
            items = items == null
                    ? null
                    : Collections.unmodifiableList(new ArrayList<>(items));
        }
    }
}
