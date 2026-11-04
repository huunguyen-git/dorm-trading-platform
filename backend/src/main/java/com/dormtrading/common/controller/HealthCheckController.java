package com.dormtrading.common.controller;

import java.sql.Connection;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthCheckController {

    private final Optional<DataSource> dataSource;

    public HealthCheckController(@Autowired(required = false) DataSource dataSource) {
        this.dataSource = Optional.ofNullable(dataSource);
    }

    @GetMapping("/api/v1/health")
    public Map<String, Object> health() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("status", "UP");
        response.put("service", "dorm-trading-backend");
        response.put("timestamp", Instant.now());

        if (dataSource.isPresent()) {
            try (Connection conn = dataSource.get().getConnection()) {
                if (conn.isValid(2)) {
                    response.put("database", "CONNECTED");
                } else {
                    response.put("database", "DISCONNECTED");
                }
            } catch (Exception e) {
                response.put("database", "ERROR");
            }
        }
        return response;
    }
}
