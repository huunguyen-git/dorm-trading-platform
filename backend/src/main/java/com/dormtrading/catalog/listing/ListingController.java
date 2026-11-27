package com.dormtrading.catalog.listing;

import com.dormtrading.catalog.ListingDtos;
import com.dormtrading.catalog.ListingValidation;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Seller-facing Listing Management API (P2-01: UC-10, UC-17, UC-18, FR-04, FR-05, FR-13).
 * Public discovery ({@code GET /api/v1/listings}) and detail ({@code GET /api/v1/listings/{id}})
 * live outside this controller.
 */
@RestController
@RequestMapping("/api/v1/listings")
public class ListingController {

    private final ListingService listingService;

    public ListingController(ListingService listingService) {
        this.listingService = listingService;
    }

    @GetMapping("/quota")
    public ListingDtos.ListingQuotaDto getQuota(@AuthenticationPrincipal Jwt jwt) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        return listingService.getQuota(sellerId);
    }

    @GetMapping("/mine")
    public ListingDtos.MyListingsPageDto getMyListings(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        return listingService.getMyListings(sellerId, status, page, size);
    }

    @PostMapping
    public ResponseEntity<ListingDtos.ListingMutationResponse> createListing(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody(required = false) ListingDtos.CreateListingRequest request
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        ListingDtos.ListingMutationResponse created = listingService.createListing(sellerId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    public ListingDtos.ListingMutationResponse updateListing(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) ListingDtos.UpdateListingRequest request
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        return listingService.updateListing(sellerId, id, request);
    }

    @PostMapping("/{id}/publish")
    public ListingDtos.ListingMutationResponse publishListing(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) ListingDtos.VersionRequest request
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        return listingService.publishListing(sellerId, id, request);
    }

    @PostMapping("/{id}/withdraw")
    public ListingDtos.ListingMutationResponse withdrawListing(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) ListingDtos.VersionRequest request
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        return listingService.withdrawListing(sellerId, id, request);
    }

    @PostMapping("/{id}/renew")
    public ListingDtos.ListingMutationResponse renewListing(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) ListingDtos.VersionRequest request
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        return listingService.renewListing(sellerId, id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteListing(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestParam(required = false) Long version
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        listingService.deleteListing(sellerId, id, version);
        return ResponseEntity.noContent().build();
    }
}
