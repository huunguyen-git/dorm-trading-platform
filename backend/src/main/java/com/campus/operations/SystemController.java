package com.campus.operations;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/system")
public class SystemController {
    @GetMapping("/status")
    public SystemStatus status() {
        return new SystemStatus("dorm-trading-platform", "v1");
    }
    public record SystemStatus(String application, String apiVersion) { }
}
