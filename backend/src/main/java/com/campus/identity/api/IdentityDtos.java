package com.campus.identity.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/** Shared contract types; business authorization and transactional services are separate work. */
public final class IdentityDtos {
    private IdentityDtos() { }

    public enum Role { MEMBER, MODERATOR, ADMIN }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MemberView(
        @NotNull UUID id,
        @NotBlank String displayName,
        @NotNull List<@NotNull Role> roles,
        @NotNull Boolean activated,
        @NotNull Integer reputation,
        @NotNull Boolean graduated
    ) {
        public MemberView {
            roles = roles == null ? null : java.util.Collections.unmodifiableList(new java.util.ArrayList<>(roles));
        }
    }
}
