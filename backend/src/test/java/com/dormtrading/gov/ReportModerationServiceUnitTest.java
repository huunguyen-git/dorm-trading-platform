package com.dormtrading.gov;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dormtrading.review.reputation.ReputationLedgerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;

class ReportModerationServiceUnitTest {
    private static final Clock FIXED_CLOCK = Clock.fixed(Instant.parse("2026-11-28T07:00:00Z"), ZoneOffset.UTC);

    private Jwt adminWebJwt(UUID sub) {
        return Jwt.withTokenValue("tok")
                .header("alg", "none")
                .subject(sub.toString())
                .claim("client", "admin-web")
                .build();
    }

    private ReportModerationService service() {
        JdbcTemplate db = new JdbcTemplate();
        return new ReportModerationService(db, new ReputationLedgerService(db, FIXED_CLOCK, new ObjectMapper()), FIXED_CLOCK);
    }

    @Test
    void rejectsNonAdminWebClientJwt() {
        Jwt mobileJwt = Jwt.withTokenValue("tok")
                .header("alg", "none")
                .subject(UUID.randomUUID().toString())
                .claim("client", "mobile")
                .build();

        assertThatThrownBy(() -> service().groups(mobileJwt, "CHO_XU_LY", null, null, null, 0, 20))
                .isInstanceOf(GovernanceFailure.class)
                .satisfies(ex -> assertThat(((GovernanceFailure) ex).status).isEqualTo(403));
    }

    @Test
    void resolveValidatesConclusionPenaltyAndBasisBeforeDbAccess() {
        Jwt jwt = adminWebJwt(UUID.randomUUID());
        UUID targetId = UUID.randomUUID();
        var svc = service();

        assertThatThrownBy(() -> svc.resolve(jwt,
                new ReportModerationService.ResolveInput("TIN_DANG", targetId, "SPAM", "VI_PHAM", "", "Có vi phạm", null)))
                .isInstanceOf(GovernanceFailure.class)
                .hasMessageContaining("mức phạt");

        assertThatThrownBy(() -> svc.resolve(jwt,
                new ReportModerationService.ResolveInput("TIN_DANG", targetId, "SPAM", "KHONG_VI_PHAM", "SPAM_01", "Không vi phạm", null)))
                .isInstanceOf(GovernanceFailure.class)
                .hasMessageContaining("Chỉ được chọn mức phạt");

        assertThatThrownBy(() -> svc.resolve(jwt,
                new ReportModerationService.ResolveInput("TIN_DANG", targetId, "SPAM", "TRUNG", null, "", null)))
                .isInstanceOf(GovernanceFailure.class)
                .hasMessageContaining("quyết định gốc");

        assertThatThrownBy(() -> svc.resolve(jwt,
                new ReportModerationService.ResolveInput("TIN_DANG", targetId, "SPAM", "INVALID", null, "Lý do", null)))
                .isInstanceOf(GovernanceFailure.class)
                .hasMessageContaining("Kết luận xử lý không hợp lệ");
    }
}
