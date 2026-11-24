package com.dormtrading.catalog;

import com.dormtrading.catalog.discovery.DiscoveryService;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public discovery and listing detail endpoints (P2-02: UC-19, UC-20, FR-06, NFR-01).
 */
@RestController
@RequestMapping("/api/v1/listings")
public class PublicListingsController {

    private final DiscoveryService discoveryService;

    public PublicListingsController(DiscoveryService discoveryService) {
        this.discoveryService = discoveryService;
    }

    @GetMapping
    public ListingDtos.ListingPageDto searchListings(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String courseCode,
            @RequestParam(required = false) Integer minPrice,
            @RequestParam(required = false) Integer maxPrice,
            @RequestParam(required = false) Boolean freeOnly,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String locationCode,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(required = false, defaultValue = "newest") String sort,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer offset
    ) {
        DiscoveryService.SearchCriteria criteria = new DiscoveryService.SearchCriteria(
                q,
                categoryId,
                courseCode,
                minPrice,
                maxPrice,
                freeOnly,
                type,
                locationCode,
                location,
                lat,
                lng,
                radiusKm,
                sort,
                page,
                size,
                offset
        );
        return discoveryService.searchListings(criteria);
    }

    @GetMapping("/{id:[0-9a-fA-F-]{36}}")
    public ListingDtos.ListingDetailDto getListingDetail(
            @PathVariable("id") UUID id,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @AuthenticationPrincipal Jwt jwt,
            Authentication authentication
    ) {
        boolean isActiveMember = authentication != null
                && authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_MEMBER".equals(authority.getAuthority()));
        return discoveryService.getListingDetail(id, jwt, isActiveMember, lat, lng);
    }
}
