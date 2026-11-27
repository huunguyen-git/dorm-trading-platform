package com.dormtrading.gov;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/senior")
public class GovernanceController {
    private final GovernanceService governance;

    public GovernanceController(GovernanceService governance) { this.governance = governance; }

    public record Appointment(UUID userId) {}
    // JsonNode prevents Jackson's default floating-point-to-integer coercion.
    public record PenaltyInput(String name, JsonNode points, String description, JsonNode version) {}
    public record VersionInput(JsonNode version) {}

    @GetMapping("/moderators")
    public GovernanceService.Page<GovernanceService.Moderator> moderators(
            @RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return governance.moderators(q, page, size);
    }

    @GetMapping("/moderator-candidates")
    public GovernanceService.Page<GovernanceService.Candidate> candidates(
            @RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return governance.candidates(q, page, size);
    }

    @PostMapping("/moderators")
    @ResponseStatus(HttpStatus.CREATED)
    public GovernanceService.Moderator appoint(@AuthenticationPrincipal Jwt actor, @RequestBody Appointment input) {
        return governance.appoint(actor, input.userId());
    }

    @DeleteMapping("/moderators/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@AuthenticationPrincipal Jwt actor, @PathVariable UUID userId, @RequestParam UUID assignmentId) {
        governance.revoke(actor, userId, assignmentId);
    }

    @GetMapping("/penalties")
    public GovernanceService.Page<GovernanceService.Penalty> penalties(
            @RequestParam(defaultValue = "") String q, @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return governance.penalties(q, status, page, size);
    }

    @PostMapping("/penalties")
    @ResponseStatus(HttpStatus.CREATED)
    public GovernanceService.Penalty createPenalty(@AuthenticationPrincipal Jwt actor, @RequestBody PenaltyInput input) {
        return governance.createPenalty(actor, input);
    }

    @PutMapping("/penalties/{id}")
    public GovernanceService.Penalty updatePenalty(@AuthenticationPrincipal Jwt actor, @PathVariable String id,
            @RequestBody PenaltyInput input) {
        return governance.updatePenalty(actor, id, input);
    }

    @PostMapping("/penalties/{id}/deactivate")
    public GovernanceService.Penalty deactivate(@AuthenticationPrincipal Jwt actor, @PathVariable String id,
            @RequestBody VersionInput input) {
        return governance.deactivate(actor, id, input.version());
    }

    @GetMapping("/audit")
    public GovernanceService.Page<GovernanceService.Audit> audit(
            @RequestParam(required = false) String resourceType, @RequestParam(required = false) String resourceId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return governance.audit(resourceType, resourceId, page, size);
    }
}
