package com.dormtrading.iam.profile;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/profiles")
public class AdminProfileController {
    private final ProfileService profiles;
    public AdminProfileController(ProfileService profiles) { this.profiles = profiles; }

    public record Decision(String reason) {}

    @GetMapping("/pending")
    public List<ProfileService.Pending> pending(@RequestParam(defaultValue = "0") int offset,
                                                @RequestParam(defaultValue = "20") int limit) {
        return profiles.pending(Math.max(0, offset), Math.clamp(limit, 1, 100));
    }

    @GetMapping("/{userId}")
    public ProfileService.Profile detail(@PathVariable UUID userId) { return profiles.detail(userId); }

    @GetMapping("/{userId}/student-card")
    public org.springframework.http.ResponseEntity<byte[]> card(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID userId) {
        var card = profiles.card(jwt, userId);
        return org.springframework.http.ResponseEntity.ok()
                .contentType(org.springframework.http.MediaType.parseMediaType(card.mime()))
                .header(org.springframework.http.HttpHeaders.CACHE_CONTROL, "no-store").body(card.bytes());
    }

    @PostMapping("/{userId}/approve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void approve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID userId) {
        profiles.approve(jwt, userId);
    }

    @PostMapping("/{userId}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reject(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID userId, @RequestBody Decision body) {
        profiles.reject(jwt, userId, body.reason());
    }
}
