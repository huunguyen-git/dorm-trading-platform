package com.campus.media;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MediaRepository {
    private final JdbcTemplate jdbc;

    public MediaRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Asset(UUID id, UUID ownerId, String purpose, String contentType, long byteSize) { }

    public void insertAsset(UUID id, UUID ownerId, String purpose, UUID storageKey, String contentType, long byteSize) {
        jdbc.update("""
            insert into media_assets(id, owner_id, purpose, storage_key, content_type, byte_size)
            values (?,?,?,?,?,?)
            """, id, ownerId, purpose, storageKey, contentType, byteSize);
    }

    public void insertBlob(UUID mediaId, byte[] bytes) {
        jdbc.update("insert into media_blobs(media_id, bytes) values (?,?)", mediaId, bytes);
    }

    public Optional<Asset> findAsset(UUID id) {
        List<Asset> rows = jdbc.query(
            "select id, owner_id, purpose, content_type, byte_size from media_assets where id = ?",
            (rs, n) -> new Asset(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getString("purpose"),
                rs.getString("content_type"),
                rs.getLong("byte_size")),
            id);
        return rows.stream().findFirst();
    }

    public Optional<byte[]> findBytes(UUID mediaId) {
        List<byte[]> rows = jdbc.query(
            "select bytes from media_blobs where media_id = ?",
            (rs, n) -> rs.getBytes("bytes"),
            mediaId);
        return rows.stream().findFirst();
    }
}