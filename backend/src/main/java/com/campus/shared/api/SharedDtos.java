package com.campus.shared.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Shared contract types; business authorization and transactional services are separate work. */
public final class SharedDtos {
    private SharedDtos() { }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FieldViolation(
        @NotBlank String field,
        @NotBlank String message
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ApiProblem(
        @NotBlank String type,
        @NotBlank String title,
        @NotNull Integer status,
        @NotBlank String detail,
        @NotBlank String instance,
        @NotBlank String code,
        @NotNull List<@NotNull FieldViolation> violations
    ) {
        public ApiProblem {
            violations = violations == null ? null : java.util.Collections.unmodifiableList(new java.util.ArrayList<>(violations));
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record VersionRequest(
        @NotNull @Min(0L) Long expectedVersion
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ReasonRequest(
        @NotNull @Min(0L) Long expectedVersion,
        @NotBlank @Size(max = 4000) String reason
    ) {
    }
}
