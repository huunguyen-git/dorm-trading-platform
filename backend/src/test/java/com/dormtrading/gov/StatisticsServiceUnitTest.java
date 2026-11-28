package com.dormtrading.gov;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class StatisticsServiceUnitTest {
    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    @Test
    void semesterForDateResolvesAcademicTerms() {
        var hk1 = StatisticsService.semesterForDate(LocalDate.of(2026, 10, 15));
        assertThat(hk1.code()).isEqualTo("2026-HK1");
        assertThat(hk1.from()).isEqualTo(LocalDate.of(2026, 9, 1).atStartOfDay(VN).toInstant());
        assertThat(hk1.to()).isEqualTo(LocalDate.of(2027, 1, 1).atStartOfDay(VN).toInstant());

        var hk2 = StatisticsService.semesterForDate(LocalDate.of(2026, 3, 20));
        assertThat(hk2.code()).isEqualTo("2025-HK2");
        assertThat(hk2.from()).isEqualTo(LocalDate.of(2026, 1, 1).atStartOfDay(VN).toInstant());
        assertThat(hk2.to()).isEqualTo(LocalDate.of(2026, 6, 1).atStartOfDay(VN).toInstant());

        var hk3 = StatisticsService.semesterForDate(LocalDate.of(2026, 7, 10));
        assertThat(hk3.code()).isEqualTo("2025-HK3");
        assertThat(hk3.from()).isEqualTo(LocalDate.of(2026, 6, 1).atStartOfDay(VN).toInstant());
        assertThat(hk3.to()).isEqualTo(LocalDate.of(2026, 9, 1).atStartOfDay(VN).toInstant());
    }

    @Test
    void semestersReturnsSixRecentTerms() {
        Clock clock = Clock.fixed(Instant.parse("2026-11-28T07:00:00Z"), VN);
        var service = new StatisticsService(new JdbcTemplate(), clock);
        var list = service.semesters();
        assertThat(list).hasSize(6);
        assertThat(list).extracting(StatisticsService.SemesterOption::code)
                .containsExactly("2026-HK1", "2025-HK3", "2025-HK2", "2025-HK1", "2024-HK3", "2024-HK2");
    }

    @Test
    void rejectsInvalidSemesterOrRange() {
        Clock clock = Clock.fixed(Instant.parse("2026-11-28T07:00:00Z"), VN);
        var service = new StatisticsService(new JdbcTemplate(), clock);

        assertThatThrownBy(() -> service.resolvePeriod("2026-HK9", null, null))
                .isInstanceOf(GovernanceFailure.class)
                .hasMessageContaining("Mã học kỳ không hợp lệ");

        Instant now = Instant.parse("2026-11-28T00:00:00Z");
        assertThatThrownBy(() -> service.resolvePeriod(null, now, now.minusSeconds(60)))
                .isInstanceOf(GovernanceFailure.class);

        assertThatThrownBy(() -> service.topSubjects(null, null, null, 0))
                .isInstanceOf(GovernanceFailure.class);

        assertThatThrownBy(() -> service.lowReputationDisputes(101, 1, 0, 20))
                .isInstanceOf(GovernanceFailure.class);
    }

    @Test
    void percentageCalculationHandlesZeroTotalAndRounding() {
        assertThat(StatisticsService.pct(0, 0)).isEqualTo(0.0);
        assertThat(StatisticsService.pct(1, 3)).isEqualTo(33.33);
        assertThat(StatisticsService.pct(2, 3)).isEqualTo(66.67);
    }
}
