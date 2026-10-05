package com.campus.shared.web;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CommandReceiptRepository {
    private final JdbcTemplate jdbc;

    public CommandReceiptRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Receipt(UUID actorId, String operation, UUID key, String requestHash, UUID resourceId) { }

    public boolean claim(UUID actorId, String operation, UUID key, String requestHash, UUID resourceId, int httpStatus) {
        int inserted = jdbc.update("""
            insert into command_receipts(actor_id, operation, idempotency_key, request_hash, resource_id, http_status)
            values (?,?,?,?,?,?)
            on conflict (actor_id, operation, idempotency_key) do nothing
            """, actorId, operation, key, requestHash, resourceId, httpStatus);
        return inserted == 1;
    }

    public Optional<Receipt> find(UUID actorId, String operation, UUID key) {
        List<Receipt> rows = jdbc.query(
            "select actor_id, operation, idempotency_key, request_hash, resource_id from command_receipts where actor_id=? and operation=? and idempotency_key=?",
            (rs, n) -> new Receipt(
                rs.getObject("actor_id", UUID.class),
                rs.getString("operation"),
                rs.getObject("idempotency_key", UUID.class),
                rs.getString("request_hash"),
                rs.getObject("resource_id", UUID.class)),
            actorId, operation, key);
        return rows.stream().findFirst();
    }

    public Optional<UUID> replayTarget(UUID actorId, String operation, UUID key, String requestHash, UUID candidateResourceId, int status) {
        if (claim(actorId, operation, key, requestHash, candidateResourceId, status)) {
            return Optional.empty();
        }
        Receipt existing = find(actorId, operation, key)
            .orElseThrow(() -> new IllegalStateException("Receipt biến mất sau khi xung đột"));
        if (!existing.requestHash().equals(requestHash)) {
            throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "Idempotency-Key đã được dùng với nội dung khác");
        }
        return Optional.of(existing.resourceId());
    }
}