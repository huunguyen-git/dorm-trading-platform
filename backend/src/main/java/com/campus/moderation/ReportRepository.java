package com.campus.moderation;

import com.campus.moderation.api.ModerationDtos.ReportState;
import com.campus.moderation.api.ModerationDtos.ReportView;
import com.campus.utils.SqlHelper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ReportRepository {

    private static final RowMapper<ReportView> REPORT_MAPPER = (rs, n) -> new ReportView(
            rs.getObject("id", UUID.class),
            rs.getObject("reported_member_id", UUID.class),
            rs.getObject("listing_id", UUID.class),
            rs.getObject("trade_id", UUID.class),
            ReportState.valueOf(rs.getString("state")),
            rs.getTimestamp("created_at").toInstant());

    private final JdbcTemplate jdbc;
    private final SqlHelper sqlHelper;

    public ReportRepository(
        JdbcTemplate jdbc,
        SqlHelper sqlHelper
    ) {
        this.jdbc = jdbc;
        this.sqlHelper = sqlHelper;
    }

    public boolean memberExists(UUID memberId) {
        Boolean exists = jdbc.queryForObject(
                "select exists(select 1 from members where id = ?)",
                Boolean.class, memberId);
        return Boolean.TRUE.equals(exists);
    }

    public Optional<UUID> listingSeller(UUID listingId) {
        return sqlHelper.one("select seller_id from listings where id = ?",
                SqlHelper.UUID_COL, listingId);
    }

    public Optional<List<UUID>> tradeParties(UUID tradeId) {
        return sqlHelper.one("select seller_id, buyer_id from trades where id = ?",
                (rs, n) -> List.of(
                        rs.getObject("seller_id", UUID.class),
                        rs.getObject("buyer_id", UUID.class)),
                tradeId);
    }

    /**
     * Evidence must already be a REPORT asset owned by the reporter; the composite FK enforces it too.
     */
    public boolean evidenceBelongsToReporter(UUID mediaId, UUID reporterId) {
        Boolean ok = jdbc.queryForObject("""
                select exists(
                    select 1 from media_assets
                    where id = ? and owner_id = ? and purpose = 'REPORT'
                )
                """, Boolean.class, mediaId, reporterId);
        return Boolean.TRUE.equals(ok);
    }

    public Optional<ReportView> find(UUID reportId) {
        return sqlHelper.one("""
                select id, reported_member_id, listing_id, trade_id, state, created_at
                from reports
                where id = ?
                """, REPORT_MAPPER, reportId);
    }

    public Optional<UUID> reporterOf(UUID reportId) {
        return sqlHelper.one("select reporter_id from reports where id = ?",
                SqlHelper.UUID_COL, reportId);
    }

    public void insertReport(UUID id, UUID reporterId, UUID reportedMemberId,
                             UUID listingId, UUID tradeId, String description) {
        jdbc.update("""
                insert into reports (id, reporter_id, reported_member_id, listing_id, trade_id, description)
                values (?, ?, ?, ?, ?, ?)
                """, id, reporterId, reportedMemberId, listingId, tradeId, description);
    }

    public void attachEvidence(UUID reportId, UUID mediaId, UUID reporterId) {
        jdbc.update("insert into report_evidence (report_id, media_id, reporter_id) values (?, ?, ?)",
                reportId, mediaId, reporterId);
    }

    /**
     * One inbox row per moderator, deduplicated by (recipient_id, event_key) so a retry never
     * duplicates the notification. Numeric sanction stays HOLD A08: no reputation entry is written.
     * UUIDs are generated in Java so no pgcrypto extension is required.
     */
    public void notifyModerators(String eventKey, String message) {
        List<UUID> handlers = jdbc.query(
                "select member_id from member_roles where role in ('MODERATOR', 'ADMIN')",
                SqlHelper.UUID_COL);

        for (UUID recipient : handlers) {
            jdbc.update("""
                    insert into notifications (id, recipient_id, event_key, kind, message)
                    values (?, ?, ?, ?, ?)
                    on conflict (recipient_id, event_key) do nothing
                    """, UUID.randomUUID(), recipient, eventKey, "REPORT_SUBMITTED", message);
        }
    }
}
