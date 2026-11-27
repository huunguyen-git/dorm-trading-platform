package com.dormtrading.iam.profile;

import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/profile")
public class ProfileController {
    private final ProfileService profiles;
    public ProfileController(ProfileService profiles) { this.profiles = profiles; }

    public record Email(String currentPassword, String newEmail) {}
    public record EmailVerify(UUID challengeId, String code) {}

    @GetMapping("/me")
    public ProfileService.Profile me(@AuthenticationPrincipal Jwt jwt) { return profiles.me(jwt); }

    @PatchMapping("/me")
    public ProfileService.Profile update(@AuthenticationPrincipal Jwt jwt, @RequestBody ProfileService.Update body) {
        return profiles.update(jwt, body);
    }

    @PostMapping(value = "/me/student-card", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void uploadCard(@AuthenticationPrincipal Jwt jwt, @RequestPart("file") MultipartFile file) {
        profiles.uploadCard(jwt, file);
    }

    @GetMapping("/student-cards/{ownerId}")
    public ResponseEntity<byte[]> card(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID ownerId) {
        var card = profiles.card(jwt, ownerId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(card.mime()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store").body(card.bytes());
    }

    @PatchMapping("/email")
    public ProfileService.Challenge changeEmail(@AuthenticationPrincipal Jwt jwt, @RequestBody Email body) {
        return profiles.changeEmail(jwt, body.currentPassword(), body.newEmail());
    }

    @PostMapping("/email/verify")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void verifyEmail(@AuthenticationPrincipal Jwt jwt, @RequestBody EmailVerify body) {
        profiles.verifyEmailChange(jwt, body.challengeId(), body.code());
    }
}
