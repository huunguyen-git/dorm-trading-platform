package com.dormtrading.catalog.discovery;

import com.dormtrading.catalog.ListingDtos;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class ReferenceDataController {

    private final DiscoveryService discoveryService;

    public ReferenceDataController(DiscoveryService discoveryService) {
        this.discoveryService = discoveryService;
    }

    @GetMapping("/categories")
    public ListingDtos.CategoriesResponse getCategories() {
        return discoveryService.getCategories();
    }

    @GetMapping("/locations")
    public ListingDtos.LocationsResponse getLocations() {
        return discoveryService.getLocations();
    }
}
