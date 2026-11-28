package com.dormtrading.gov;

import com.dormtrading.gov.StatisticsService.*;
import java.time.Instant;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/senior/statistics")
public class StatisticsController {
    private final StatisticsService service;

    public StatisticsController(StatisticsService service) {
        this.service = service;
    }

    @GetMapping("/semesters")
    public List<SemesterOption> semesters() {
        return service.semesters();
    }

    @GetMapping("/top-subjects")
    public TopSubjectsResponse topSubjects(
            @RequestParam(required = false) String semester,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "10") int limit) {
        return service.topSubjects(semester, from, to, limit);
    }

    @GetMapping("/low-reputation-disputes")
    public GovernanceService.Page<LowReputationUser> lowReputationDisputes(
            @RequestParam(defaultValue = "60") int maxScore,
            @RequestParam(defaultValue = "1") int minDisputes,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.lowReputationDisputes(maxScore, minDisputes, page, size);
    }

    @GetMapping("/category-location")
    public CategoryLocationResponse categoryLocation(
            @RequestParam(required = false) String semester,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to) {
        return service.categoryLocation(semester, from, to);
    }

    @GetMapping("/zero-price")
    public ZeroPriceResponse zeroPrice(
            @RequestParam(required = false) String semester,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to) {
        return service.zeroPrice(semester, from, to);
    }
}
