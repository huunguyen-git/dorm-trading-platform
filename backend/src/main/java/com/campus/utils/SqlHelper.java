package com.campus.utils;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
public class SqlHelper {
    public static final RowMapper<UUID> UUID_COL = (rs, n) -> rs.getObject(1, UUID.class);

    private final JdbcTemplate jdbc;

    public SqlHelper(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public <T> Optional<T> one(String sql, RowMapper<T> mapper, Object... args) {
        return jdbc.query(sql, mapper, args).stream().findFirst();
    }

    // table is always a hardcoded constant above, never user input
    public void lock(String table, UUID id) {
        jdbc.query("select id from " + table + " where id = ? for update",
                (rs, n) -> rs.getObject(1, UUID.class), id);
    }
}
