package com.campus.media.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** Shared contract types; business authorization and transactional services are separate work. */
public final class MediaDtos {
    private MediaDtos() { }

    public enum MediaPurpose { LISTING, STUDENT_CARD, HANDOVER, REPORT }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MediaView(
        @NotNull UUID id,
        @NotNull @Valid MediaPurpose purpose,
        @NotBlank String contentType,
        @NotNull Long byteSize
    ) {
    }
}
