package com.campus.notification;

import com.campus.notification.api.NotificationDtos.NotificationView;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.campus.utils.SqlHelper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationRepository {
    private static final String SELECT_VIEW = """
            select id, kind, message, created_at, read_at
            from notifications
            """;

    private static final RowMapper<NotificationView> VIEW_MAPPER = (rs, n) -> {
        Timestamp readAt = rs.getTimestamp("read_at");
        return new NotificationView(
                rs.getObject("id", UUID.class),
                rs.getString("kind"),
                rs.getString("message"),
                rs.getTimestamp("created_at").toInstant(),
                readAt == null ? null : readAt.toInstant());
    };

    private final JdbcTemplate jdbc;
    private final SqlHelper sqlHelper;

    public NotificationRepository(JdbcTemplate jdbc, SqlHelper sqlHelper) {
        this.jdbc = jdbc;
        this.sqlHelper = sqlHelper;
    }

    public long count(UUID recipientId) {
        Long value = jdbc.queryForObject(
                "select count(*) from notifications where recipient_id = ?",
                Long.class, recipientId);
        return value == null ? 0 : value;
    }

    public List<NotificationView> page(UUID recipientId, int size, long offset) {
        return jdbc.query(SELECT_VIEW + """
                where recipient_id = ?
                order by created_at desc, id desc
                limit ? offset ?
                """,
                VIEW_MAPPER, recipientId, size, offset);
    }

    public Optional<NotificationView> findOwned(UUID id, UUID recipientId) {
        return sqlHelper.one(SELECT_VIEW + "where id = ? and recipient_id = ?",
                VIEW_MAPPER, id, recipientId);
    }

    public void lock(UUID id, UUID recipientId) {
        jdbc.query("select id from notifications where id = ? and recipient_id = ? for update",
                SqlHelper.UUID_COL, id, recipientId);
    }

    public void markRead(UUID id, UUID recipientId) {
        jdbc.update("""
                update notifications
                set read_at = coalesce(read_at, now())
                where id = ? and recipient_id = ?
                """, id, recipientId);
    }
}