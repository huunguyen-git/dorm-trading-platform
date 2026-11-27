package com.dormtrading.common;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

/** Test-only active penalties; production V2 sample penalties remain inactive after V6. */
public final class ActivePenaltyFixtures {

    public static final String PENALTY_5 = "TEST_ACTIVE_PENALTY_5";
    public static final String PENALTY_10 = "TEST_ACTIVE_PENALTY_10";
    public static final String PENALTY_15 = "TEST_ACTIVE_PENALTY_15";
    public static final String PENALTY_20 = "TEST_ACTIVE_PENALTY_20";
    public static final String PENALTY_30 = "TEST_ACTIVE_PENALTY_30";
    public static final String PENALTY_50 = "TEST_ACTIVE_PENALTY_50";

    private record Fixture(String code, int points) {}

    private static final List<Fixture> FIXTURES = List.of(
            new Fixture(PENALTY_5, 5),
            new Fixture(PENALTY_10, 10),
            new Fixture(PENALTY_15, 15),
            new Fixture(PENALTY_20, 20),
            new Fixture(PENALTY_30, 30),
            new Fixture(PENALTY_50, 50)
    );

    private ActivePenaltyFixtures() {}

    public static void seed(JdbcTemplate db) {
        for (var fixture : FIXTURES) {
            db.update("""
                    INSERT INTO thang_phats (ma_thang_phat, ten, diem_tru, trang_thai)
                    VALUES (?, ?, ?, 'DANG_DUNG')
                    ON CONFLICT (ma_thang_phat) DO UPDATE SET
                        ten = EXCLUDED.ten,
                        diem_tru = EXCLUDED.diem_tru,
                        trang_thai = EXCLUDED.trang_thai
                    """, fixture.code(), "Test active penalty " + fixture.points(), fixture.points());
        }
    }

    public static void clear(JdbcTemplate db) {
        for (var fixture : FIXTURES) {
            db.update("DELETE FROM thang_phats WHERE ma_thang_phat = ?", fixture.code());
        }
    }
}
