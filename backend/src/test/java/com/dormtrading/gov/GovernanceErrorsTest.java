package com.dormtrading.gov;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

class GovernanceErrorsTest {
    private final GovernanceErrors errors = new GovernanceErrors();

    @Test
    void reportsPenaltyNameConflictOnlyForItsNamedUniqueConstraint() {
        var penaltyConflict = errors.duplicate(new DuplicateKeyException(
                "duplicate", new SQLException("duplicate key violates uq_penalty_name_active")));
        var unrelatedConflict = errors.duplicate(new DuplicateKeyException(
                "duplicate", new SQLException("duplicate key violates another_constraint")));

        assertThat(penaltyConflict.getStatusCode().value()).isEqualTo(409);
        assertThat(penaltyConflict.getBody()).containsEntry("code", "DUPLICATE_NAME");
        assertThat(unrelatedConflict.getStatusCode().value()).isEqualTo(503);
        assertThat(unrelatedConflict.getBody()).containsEntry("code", "GOVERNANCE_UNAVAILABLE");
    }
}
