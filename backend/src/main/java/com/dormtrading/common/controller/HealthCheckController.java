package com.dormtrading.common.controller;

import java.sql.SQLException;
import java.time.Instant;
import java.util.Map;
import javax.sql.DataSource;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthCheckController {
    private final ObjectProvider<DataSource> dataSource;

    public HealthCheckController(ObjectProvider<DataSource> dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping("/api/v1/health")
    public Map<String, Object> health() {
        return Map.of("status", "UP", "service", "dorm-trading-backend",
                "timestamp", Instant.now(), "database", databaseStatus());
    }

    private String databaseStatus() {
        var source = dataSource.getIfAvailable();
        if (source != null) {
            try (var connection = source.getConnection()) {
                if (connection.isValid(2)) {
                    return "CONNECTED";
                }
            } catch (SQLException ignored) {
                // Liveness remains available when the database is offline.
            }
        }
        return "DISCONNECTED";
    }
}
