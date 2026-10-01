package com.campus.moderation;

import com.campus.listing.api.ListingDtos.*;
import com.campus.utils.SqlHelper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.campus.utils.SqlHelper.UUID_COL;

@Repository
public class ReviewRepository {
    private final JdbcTemplate jdbc;
    private final SqlHelper ssqlHelper;

    public ReviewRepository(JdbcTemplate jdbc, SqlHelper ssqlHelper) {
        this.jdbc = jdbc;
        this.ssqlHelper = ssqlHelper;
    }

    public Optional<UUID> sellerOf(UUID listingId) {
        return ssqlHelper.one("select seller_id from listings where id = ?", UUID_COL, listingId);
    }

    public Optional<Long> versionOf(UUID listingId) {
        return ssqlHelper.one("select version from listings where id = ?",
                (rs, n) -> rs.getLong(1), listingId);
    }

    public Optional<UUID> listingOfRevision(UUID revisionId) {
        return ssqlHelper.one("select listing_id from listing_revisions where id = ?", UUID_COL, revisionId);
    }

    public Optional<String> revisionState(UUID revisionId) {
        return ssqlHelper.one("select review_state from listing_revisions where id = ?",
                (rs, n) -> rs.getString(1), revisionId);
    }

    public long countPublished(UUID sellerId) {
        Long value = jdbc.queryForObject("""
            select count(*) from listings
            where seller_id = ? and publication_state = 'PUBLISHED'
            """, Long.class, sellerId);
        return value == null ? 0 : value;
    }

    public int reputation(UUID memberId) {
        Integer value = jdbc.queryForObject(
                "select reputation from members where id = ?",
                Integer.class, memberId);
        return value == null ? 0 : value;
    }

    public void lockMember(UUID id)   { ssqlHelper.lock("members", id); }
    public void lockListing(UUID id)  { ssqlHelper.lock("listings", id); }
    public void lockRevision(UUID id) { ssqlHelper.lock("listing_revisions", id); }

    public void publish(UUID listingId, UUID revisionId) {
        jdbc.update("""
                update listings
                set publication_state = 'PUBLISHED',
                    published_revision_id = ?,
                    version = version + 1
                where id = ?
                """, revisionId, listingId);
    }

    public void updateReviewState(UUID revisionId, String state) {
        jdbc.update("update listing_revisions set review_state = ? where id = ?",
                state, revisionId);
    }

    public void insertReview(UUID id, UUID revisionId, UUID reviewerId, String verdict, String reason) {
        jdbc.update("""
                insert into listing_reviews (id, revision_id, reviewer_id, verdict, reason)
                values (?, ?, ?, ?, ?)
                """, id, revisionId, reviewerId, verdict, reason);
    }

    public void insertEvent(UUID id, UUID listingId, UUID actorId, String action, String reason) {
        jdbc.update("""
                insert into listing_events (id, listing_id, actor_id, action, reason)
                values (?, ?, ?, ?, ?)
                """, id, listingId, actorId, action, reason);
    }

    public void notifySeller(UUID id, UUID sellerId, String eventKey, String kind, String message) {
        jdbc.update("""
                insert into notifications (id, recipient_id, event_key, kind, message)
                values (?, ?, ?, ?, ?)
                on conflict (recipient_id, event_key) do nothing
                """, id, sellerId, eventKey, kind, message);
    }

    public Optional<ListingView> view(UUID listingId, UUID revisionId) {
        return ssqlHelper.one("""
                select l.id, l.seller_id, l.version, l.publication_state, l.created_at,
                       lr.review_state, lr.title, lr.description, lr.category_id,
                       lr.offer_type, lr.price_vnd, lr.area_label,
                       lr.author, lr.publisher, lr.course_code, lr.lecturer
                from listings l
                join listing_revisions lr on lr.id = ? and lr.listing_id = l.id
                where l.id = ?
                """,
                (rs, n) -> toView(rs, revisionId),
                revisionId, listingId);
    }

    private ListingView toView(ResultSet rs, UUID revisionId) throws SQLException {
        var content = new ListingContent(
                rs.getString("title"),
                rs.getString("description"),
                rs.getLong("category_id"),
                OfferType.valueOf(rs.getString("offer_type")),
                rs.getLong("price_vnd"),
                rs.getString("area_label"),
                itemIds(revisionId),
                photoIds(revisionId),
                rs.getString("author"),
                rs.getString("publisher"),
                rs.getString("course_code"),
                rs.getString("lecturer"));

        return new ListingView(
                rs.getObject("id", UUID.class),
                rs.getObject("seller_id", UUID.class),
                revisionId,
                rs.getLong("version"),
                PublicationState.valueOf(rs.getString("publication_state")),
                ReviewState.valueOf(rs.getString("review_state")),
                availabilityOf(revisionId),
                content,
                rs.getTimestamp("created_at").toInstant());
    }

    private List<UUID> itemIds(UUID revisionId) {
        return jdbc.query("select item_id from listing_revision_items where revision_id = ? order by item_id",
                UUID_COL, revisionId);
    }

    private List<UUID> photoIds(UUID revisionId) {
        return jdbc.query("select media_id from listing_revision_photos where revision_id = ? order by position",
                UUID_COL, revisionId);
    }

    // one query instead of two "exists" queries
    private Availability availabilityOf(UUID revisionId) {
        List<String> states = jdbc.queryForList("""
                select distinct ri.allocation_state
                from reservation_items ri
                join listing_revision_items li on li.item_id = ri.item_id
                where li.revision_id = ?
                  and ri.allocation_state in ('SOLD', 'HELD')
                """, String.class, revisionId);

        if (states.contains("SOLD")) return Availability.SOLD;
        if (states.contains("HELD")) return Availability.HELD;
        return Availability.AVAILABLE;
    }
}