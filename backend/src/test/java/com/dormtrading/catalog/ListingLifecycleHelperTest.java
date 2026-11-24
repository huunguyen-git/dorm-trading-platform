package com.dormtrading.catalog;

import com.dormtrading.iam.auth.AuthFailure;
import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowCallbackHandler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ListingLifecycleHelperTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-11-24T12:00:00Z");

    private JdbcTemplate db;
    private Clock clock;
    private ListingLifecycleHelper helper;

    @BeforeEach
    void setup() {
        db = Mockito.mock(JdbcTemplate.class);
        clock = Clock.fixed(FIXED_NOW, ZoneOffset.UTC);
        helper = new ListingLifecycleHelper(db, clock, "AUTO_PRECHECK");
    }

    @Test
    void calculatesQuotaLimitAtThresholdBoundary() {
        assertThat(ListingLifecycleHelper.calculateQuotaLimit(0)).isEqualTo(5);
        assertThat(ListingLifecycleHelper.calculateQuotaLimit(100)).isEqualTo(5);
        assertThat(ListingLifecycleHelper.calculateQuotaLimit(119)).isEqualTo(5);
        assertThat(ListingLifecycleHelper.calculateQuotaLimit(120)).isEqualTo(10);
        assertThat(ListingLifecycleHelper.calculateQuotaLimit(150)).isEqualTo(10);
    }

    @Test
    void buildsQuotaDtoIncludingScoreDropBelow120() {
        ListingDtos.ListingQuotaDto standard = ListingLifecycleHelper.buildQuota(100, 4);
        assertThat(standard.limit()).isEqualTo(5);
        assertThat(standard.remaining()).isEqualTo(1);
        assertThat(standard.canPublish()).isTrue();
        assertThat(standard.highTierThreshold()).isEqualTo(120);
        assertThat(standard.standardLimit()).isEqualTo(5);
        assertThat(standard.highTierLimit()).isEqualTo(10);

        ListingDtos.ListingQuotaDto scoreDropped = ListingLifecycleHelper.buildQuota(110, 8);
        assertThat(scoreDropped.limit()).isEqualTo(5);
        assertThat(scoreDropped.remaining()).isEqualTo(0);
        assertThat(scoreDropped.canPublish()).isFalse();

        ListingDtos.ListingQuotaDto highTier = ListingLifecycleHelper.buildQuota(120, 9);
        assertThat(highTier.limit()).isEqualTo(10);
        assertThat(highTier.remaining()).isEqualTo(1);
        assertThat(highTier.canPublish()).isTrue();
    }

    @Test
    void derivesListingTypeForSingleFreeAndComboListings() {
        assertThat(ListingLifecycleHelper.deriveListingType(1, 50000)).isEqualTo("BAN_LE");
        assertThat(ListingLifecycleHelper.deriveListingType(1, 0)).isEqualTo("CHO_TANG");
        assertThat(ListingLifecycleHelper.deriveListingType(2, 120000)).isEqualTo("BAN_COMBO");
        assertThat(ListingLifecycleHelper.deriveListingType(3, 0)).isEqualTo("BAN_COMBO");
    }

    @Test
    void evaluatesRenewalReminderAndExpiryWindowsAccurately() {
        Instant expiresAt = FIXED_NOW.plus(30, ChronoUnit.DAYS);

        // 8 days before expiry -> reminder not due
        assertThat(ListingLifecycleHelper.isRenewalReminderDue(
                "CONG_KHAI", expiresAt, expiresAt.minus(8, ChronoUnit.DAYS))).isFalse();

        // Exactly 7 days before expiry -> reminder due
        assertThat(ListingLifecycleHelper.isRenewalReminderDue(
                "CONG_KHAI", expiresAt, expiresAt.minus(7, ChronoUnit.DAYS))).isTrue();

        // 1 second before expiry -> reminder due, not expired
        assertThat(ListingLifecycleHelper.isRenewalReminderDue(
                "CONG_KHAI", expiresAt, expiresAt.minusSeconds(1))).isTrue();
        assertThat(ListingLifecycleHelper.isExpired(
                "CONG_KHAI", expiresAt, expiresAt.minusSeconds(1))).isFalse();

        // At exact expiry -> expired, reminder no longer due
        assertThat(ListingLifecycleHelper.isRenewalReminderDue("CONG_KHAI", expiresAt, expiresAt)).isFalse();
        assertThat(ListingLifecycleHelper.isExpired("CONG_KHAI", expiresAt, expiresAt)).isTrue();

        // GIU_CHO is never reminder-due or auto-expired
        assertThat(ListingLifecycleHelper.isRenewalReminderDue(
                "GIU_CHO", expiresAt, expiresAt.minus(2, ChronoUnit.DAYS))).isFalse();
        assertThat(ListingLifecycleHelper.isExpired("GIU_CHO", expiresAt, expiresAt.plusSeconds(60))).isFalse();

        // Null expiresAt -> safe false
        assertThat(ListingLifecycleHelper.isRenewalReminderDue("CONG_KHAI", null, FIXED_NOW)).isFalse();
        assertThat(ListingLifecycleHelper.isExpired("CONG_KHAI", null, FIXED_NOW)).isFalse();
    }

    @Test
    void reconcilesOnlyPublicExpiredListingsWithSkipLockedBumpsItemVersionAndLoadsQuota() throws Exception {
        UUID sellerId = UUID.randomUUID();
        UUID expiredListingId = UUID.randomUUID();
        UUID linkedItemId = UUID.randomUUID();
        List<String> executedSql = new ArrayList<>();

        Connection conn = Mockito.mock(Connection.class);
        PreparedStatement ps = Mockito.mock(PreparedStatement.class);
        Array sqlArray = Mockito.mock(Array.class);
        when(conn.createArrayOf(eq("uuid"), any(Object[].class))).thenReturn(sqlArray);
        when(conn.prepareStatement(anyString())).thenAnswer(inv -> {
            executedSql.add(inv.getArgument(0, String.class));
            return ps;
        });

        when(db.queryForList(anyString(), eq(UUID.class), eq(sellerId), eq(Timestamp.from(FIXED_NOW))))
                .thenReturn(List.of(expiredListingId));
        when(db.update(any(PreparedStatementCreator.class))).thenAnswer(inv -> {
            PreparedStatementCreator psc = inv.getArgument(0);
            psc.createPreparedStatement(conn);
            return 1;
        });
        doAnswer(inv -> {
            PreparedStatementCreator psc = inv.getArgument(0);
            RowCallbackHandler rch = inv.getArgument(1);
            psc.createPreparedStatement(conn);
            String lastSql = executedSql.getLast();
            if (lastSql.contains("FROM tin_dang_do_vat")) {
                ResultSet rs = Mockito.mock(ResultSet.class);
                when(rs.getObject("ma_vat", UUID.class)).thenReturn(linkedItemId);
                rch.processRow(rs);
            }
            return null;
        }).when(db).query(any(PreparedStatementCreator.class), any(RowCallbackHandler.class));
        when(db.queryForList(anyString(), eq(Integer.class), eq(sellerId))).thenReturn(List.of(125));
        when(db.queryForObject(anyString(), eq(Integer.class), eq(sellerId), eq(Timestamp.from(FIXED_NOW))))
                .thenReturn(4);

        ListingDtos.ListingQuotaDto quota = helper.loadQuota(sellerId);

        assertThat(quota.reputationScore()).isEqualTo(125);
        assertThat(quota.activeCount()).isEqualTo(4);
        assertThat(quota.limit()).isEqualTo(10);
        assertThat(quota.remaining()).isEqualTo(6);
        assertThat(quota.canPublish()).isTrue();

        ArgumentCaptor<String> selectSqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(db).queryForList(
                selectSqlCaptor.capture(),
                eq(UUID.class),
                eq(sellerId),
                eq(Timestamp.from(FIXED_NOW))
        );
        assertThat(selectSqlCaptor.getValue())
                .contains("trang_thai = 'CONG_KHAI'")
                .contains("ORDER BY ma_tin ASC")
                .contains("FOR UPDATE SKIP LOCKED")
                .doesNotContain("GIU_CHO");

        assertThat(executedSql).anySatisfy(sql -> assertThat(sql)
                .contains("UPDATE tin_dangs")
                .contains("SET trang_thai = 'HET_HAN'")
                .contains("version = version + 1"));
        assertThat(executedSql).anySatisfy(sql -> assertThat(sql)
                .contains("FROM do_vats")
                .contains("ORDER BY ma_vat ASC")
                .contains("FOR UPDATE"));
        assertThat(executedSql).anySatisfy(sql -> assertThat(sql)
                .contains("UPDATE do_vats SET version = version + 1"));
    }

    @Test
    void resolvesModerationModeAndTargetPublishStatus() {
        assertThat(helper.moderationMode()).isEqualTo(ListingDtos.ModerationMode.AUTO_PRECHECK);
        assertThat(helper.targetPublishStatus()).isEqualTo("CONG_KHAI");

        ListingLifecycleHelper manualHelper = new ListingLifecycleHelper(db, clock, "MANUAL_QUEUE");
        assertThat(manualHelper.moderationMode()).isEqualTo(ListingDtos.ModerationMode.MANUAL_QUEUE);
        assertThat(manualHelper.targetPublishStatus()).isEqualTo("CHO_DUYET");
    }

    @Test
    void validatesUrlsPriceRangeLocationRadiusAndHaversineDistance() {
        assertThat(ListingValidation.validateImageUrl(" https://example.com/a.jpg "))
                .isEqualTo("https://example.com/a.jpg");

        assertThatThrownBy(() -> ListingValidation.validateImageUrl("javascript:alert(1)"))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_INPUT");

        assertThatThrownBy(() -> ListingValidation.validatePriceRange(200000, 100000))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_PRICE_RANGE");

        // Open radius (> 3km allowed per FR-06)
        ListingValidation.validateRadiusSearch(10.8782, 106.8063, 15.0);

        // Missing lng or non-positive radius rejected
        assertThatThrownBy(() -> ListingValidation.validateRadiusSearch(10.8782, null, 5.0))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_LOCATION");
        assertThatThrownBy(() -> ListingValidation.validateRadiusSearch(10.8782, 106.8063, 0.0))
                .isInstanceOf(AuthFailure.class)
                .extracting("status", "code")
                .containsExactly(400, "INVALID_LOCATION");

        // Haversine distance between KTX Khu A and UIT (~0.98 km)
        double km = ListingValidation.haversineKm(10.8782, 106.8063, 10.8700, 106.8031);
        assertThat(km).isCloseTo(0.98, within(0.05));

        // Item ID deduplication preserves order
        UUID id1 = UUID.randomUUID();
        UUID id2 = UUID.randomUUID();
        assertThat(ListingValidation.deduplicateItemIds(List.of(id1, id2, id1), true))
                .containsExactly(id1, id2);
    }
}
