package com.dormtrading.common.controller;

import java.time.Instant;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthCheckController {
    @GetMapping("/api/v1/health")
    public Map<String, Object> health() {
        return Map.of("status", "UP", "service", "dorm-trading-backend",
                "timestamp", Instant.now());
    }
}
