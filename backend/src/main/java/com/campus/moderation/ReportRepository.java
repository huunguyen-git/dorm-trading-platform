package com.campus.moderation;

import com.campus.moderation.api.ModerationDtos.ReportState;
import com.campus.moderation.api.ModerationDtos.ReportView;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReportRepository {
    private final JdbcTemplate jdbc;

    public ReportRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean memberExists(UUID memberId) {
        Boolean exists = jdbc.queryForObject("select exists(select 1 from members where id = ?)", Boolean.class, memberId);
        return Boolean.TRUE.equals(exists);
    }

    public Optional<UUID> listingSeller(UUID listingId) {
        List<UUID> rows = jdbc.query("select seller_id from listings where id = ?",
            (rs, n) -> rs.getObject("seller_id", UUID.class), listingId);
        return rows.stream().findFirst();
    }

    public Optional<List<UUID>> tradeParties(UUID tradeId) {
        List<List<UUID>> rows = jdbc.query("select seller_id, buyer_id from trades where id = ?",
            (rs, n) -> List.of(rs.getObject("seller_id", UUID.class), rs.getObject("buyer_id", UUID.class)), tradeId);
        return rows.stream().findFirst();
    }

    /** Evidence must already be a REPORT asset owned by the reporter; the composite FK enforces it too. */
    public boolean evidenceBelongsToReporter(UUID mediaId, UUID reporterId) {
        Boolean ok = jdbc.queryForObject(
            "select exists(select 1 from media_assets where id = ? and owner_id = ? and purpose = 'REPORT')",
            Boolean.class, mediaId, reporterId);
        return Boolean.TRUE.equals(ok);
    }

    public void insertReport(UUID id, UUID reporterId, UUID reportedMemberId, UUID listingId, UUID tradeId, String description) {
        jdbc.update("""
            insert into reports(id, reporter_id, reported_member_id, listing_id, trade_id, description)
            values (?,?,?,?,?,?)
            """, id, reporterId, reportedMemberId, listingId, tradeId, description);
    }

    public void attachEvidence(UUID reportId, UUID mediaId, UUID reporterId) {
        jdbc.update("insert into report_evidence(report_id, media_id, reporter_id) values (?,?,?)",
            reportId, mediaId, reporterId);
    }

    /**
     * One inbox row per moderator, deduplicated by (recipient_id, event_key) so a retry never
     * duplicates the notification. Numeric sanction stays HOLD A08: no reputation entry is written.
     * UUIDs are generated in Java so no pgcrypto extension is required.
     */
    public void notifyModerators(String eventKey, String message) {
        List<UUID> handlers = jdbc.query("select member_id from member_roles where role in ('MODERATOR','ADMIN')",
            (rs, n) -> rs.getObject("member_id", UUID.class));
        for (UUID recipient : handlers) {
            jdbc.update("""
                insert into notifications(id, recipient_id, event_key, kind, message)
                values (?,?,?,?,?)
                on conflict (recipient_id, event_key) do nothing
                """, UUID.randomUUID(), recipient, eventKey, "REPORT_SUBMITTED", message);
        }
    }

    public Optional<ReportView> find(UUID reportId) {
        List<ReportView> rows = jdbc.query("""
            select id, reported_member_id, listing_id, trade_id, state, created_at
            from reports where id = ?
            """,
            (rs, n) -> new ReportView(
                rs.getObject("id", UUID.class),
                rs.getObject("reported_member_id", UUID.class),
                rs.getObject("listing_id", UUID.class),
                rs.getObject("trade_id", UUID.class),
                ReportState.valueOf(rs.getString("state")),
                rs.getTimestamp("created_at").toInstant()),
            reportId);
        return rows.stream().findFirst();
    }

    public Optional<UUID> reporterOf(UUID reportId) {
        List<UUID> rows = jdbc.query("select reporter_id from reports where id = ?",
            (rs, n) -> rs.getObject("reporter_id", UUID.class), reportId);
        return rows.stream().findFirst();
    }
}
