package com.campus.media;

import com.campus.media.api.MediaDtos.MediaPurpose;
import com.campus.media.api.MediaDtos.MediaView;
import com.campus.shared.security.SecurityUtils;
import com.campus.shared.web.ApiException;
import java.io.IOException;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/media")
public class MediaController {
    private final MediaService service;

    public MediaController(MediaService service) {
        this.service = service;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MediaView> upload(
        @org.springframework.web.bind.annotation.RequestParam("purpose") MediaPurpose purpose,
        @org.springframework.web.bind.annotation.RequestParam("file") MultipartFile file,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) throws IOException {
        UUID owner = SecurityUtils.currentMemberId();
        if (owner == null) {
            throw ApiException.forbidden("FORBIDDEN", "Cần đăng nhập để tải tệp lên");
        }
        MediaView view = service.store(owner, purpose, idempotencyKey, file.getBytes());
        return ResponseEntity.status(201).body(view);
    }

    /**
     * REPORT evidence is readable by its uploader or a case handler. Possession of the ID alone
     * grants nothing, so an unauthorized caller receives 404 instead of 403 to avoid leaking existence.
     */
    @GetMapping("/{mediaId}")
    public ResponseEntity<byte[]> read(@PathVariable UUID mediaId) {
        MediaRepository.Asset asset = service.find(mediaId);
        if (asset == null) {
            throw ApiException.notFound("NOT_FOUND", "Không tìm thấy tệp");
        }
        UUID member = SecurityUtils.currentMemberId();
        boolean uploader = member != null && member.equals(asset.ownerId());
        boolean handler = SecurityUtils.hasRole("MODERATOR") || SecurityUtils.hasRole("ADMIN");
        if (!uploader && !handler) {
            throw ApiException.notFound("NOT_FOUND", "Không tìm thấy tệp");
        }
        byte[] bytes = service.bytes(mediaId);
        if (bytes == null) {
            throw ApiException.notFound("NOT_FOUND", "Không tìm thấy tệp");
        }
        // Never expose storage_key and never let a private evidence image be cached.
        return ResponseEntity.ok()
            .header(HttpHeaders.CACHE_CONTROL, CacheControl.noStore().getHeaderValue())
            .header("X-Content-Type-Options", "nosniff")
            .contentType(MediaType.parseMediaType(asset.contentType()))
            .body(bytes);
    }
}
