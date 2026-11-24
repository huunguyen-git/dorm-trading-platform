package com.dormtrading.catalog.media;

import java.util.List;
import java.util.UUID;

public final class MediaDtos {

    private MediaDtos() {
    }

    public record UploadedMediaItemDto(
            UUID id,
            String url,
            String contentType,
            long sizeBytes
    ) {
    }

    public record MediaUploadResponse(
            List<UploadedMediaItemDto> items
    ) {
    }

    public record MediaContent(
            UUID id,
            String contentType,
            long sizeBytes,
            byte[] bytes
    ) {
    }
}
