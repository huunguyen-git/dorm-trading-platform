package com.campus.media;

import java.util.Optional;
import java.util.UUID;

import com.campus.utils.SqlHelper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class MediaRepository {

    public record Asset(UUID id, UUID ownerId, String purpose, String contentType, long byteSize) { }

    private static final RowMapper<Asset> ASSET_MAPPER = (rs, n) -> new Asset(
            rs.getObject("id", UUID.class),
            rs.getObject("owner_id", UUID.class),
            rs.getString("purpose"),
            rs.getString("content_type"),
            rs.getLong("byte_size"));

    private final JdbcTemplate jdbc;
    private final SqlHelper sqlHelper;

    public MediaRepository(JdbcTemplate jdbc, SqlHelper sqlHelper) {
        this.jdbc = jdbc;
        this.sqlHelper = sqlHelper;
    }

    public void insertAsset(UUID id, UUID ownerId, String purpose, UUID storageKey,
                            String contentType, long byteSize) {
        jdbc.update("""
                insert into media_assets (id, owner_id, purpose, storage_key, content_type, byte_size)
                values (?, ?, ?, ?, ?, ?)
                """, id, ownerId, purpose, storageKey, contentType, byteSize);
    }

    public void insertBlob(UUID mediaId, byte[] bytes) {
        jdbc.update("insert into media_blobs (media_id, bytes) values (?, ?)", mediaId, bytes);
    }

    public Optional<Asset> findAsset(UUID id) {
        return sqlHelper.one("""
                select id, owner_id, purpose, content_type, byte_size
                from media_assets
                where id = ?
                """, ASSET_MAPPER, id);
    }

    public Optional<byte[]> findBytes(UUID mediaId) {
        return sqlHelper.one("select bytes from media_blobs where media_id = ?",
                (rs, n) -> rs.getBytes("bytes"), mediaId);
    }
}