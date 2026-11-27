package com.dormtrading.catalog.media;

import com.dormtrading.catalog.ListingValidation;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/media")
public class MediaController {

    private static final CacheControl PUBLIC_MEDIA_CACHE =
            CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic().mustRevalidate();
    private static final CacheControl PRIVATE_MEDIA_CACHE =
            CacheControl.noStore().cachePrivate();

    private final MediaService mediaService;

    public MediaController(MediaService mediaService) {
        this.mediaService = mediaService;
    }

    @PostMapping(value = "/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MediaDtos.MediaUploadResponse> uploadImages(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam("files") List<MultipartFile> files
    ) {
        UUID ownerId = ListingValidation.requireUserId(jwt);
        MediaDtos.MediaUploadResponse response = mediaService.uploadImages(ownerId, files);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Resource> getMedia(
            @PathVariable UUID id,
            @AuthenticationPrincipal Jwt jwt,
            Authentication authentication,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch
    ) {
        UUID viewerId = ListingValidation.optionalUserId(jwt);
        boolean isModerator = authentication != null && authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_MODERATOR".equals(authority.getAuthority())
                        || "ROLE_SENIOR_ADMIN".equals(authority.getAuthority()));

        MediaDtos.MediaContent media = mediaService.loadMedia(id, viewerId, isModerator);
        CacheControl cacheControl = media.publiclyVisible() ? PUBLIC_MEDIA_CACHE : PRIVATE_MEDIA_CACHE;

        if (media.publiclyVisible() && matchesETag(ifNoneMatch, media.eTag())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .eTag(media.eTag())
                    .cacheControl(cacheControl)
                    .varyBy(HttpHeaders.AUTHORIZATION)
                    .header("X-Content-Type-Options", "nosniff")
                    .build();
        }

        ResponseEntity.BodyBuilder builder = ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(media.contentType()))
                .contentLength(media.sizeBytes())
                .header("X-Content-Type-Options", "nosniff")
                .varyBy(HttpHeaders.AUTHORIZATION)
                .cacheControl(cacheControl);

        if (media.publiclyVisible()) {
            builder.eTag(media.eTag());
        }

        return builder.body(media.resource());
    }

    private static boolean matchesETag(String ifNoneMatch, String currentETag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank() || currentETag == null || currentETag.isBlank()) {
            return false;
        }
        String trimmed = ifNoneMatch.strip();
        if ("*".equals(trimmed)) {
            return true;
        }
        for (String candidate : trimmed.split(",")) {
            String normalized = candidate.strip();
            if (normalized.startsWith("W/")) {
                normalized = normalized.substring(2).strip();
            }
            if (normalized.equals(currentETag)) {
                return true;
            }
        }
        return false;
    }
}
