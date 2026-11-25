package com.dormtrading.order;

import com.dormtrading.catalog.ListingValidation;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Order Reservation, Scheduling & Start-Delivery API (P2-04: UC-22..24, P2-05: UC-25..26).
 * Protected by {@code ROLE_MEMBER} via {@code SecurityConfig}.
 */
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    public ResponseEntity<OrderDtos.OrderDetailDto> createReservationRequest(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody(required = false) OrderDtos.CreateOrderRequest request
    ) {
        UUID buyerId = ListingValidation.requireUserId(jwt);
        OrderDtos.OrderDetailDto created = orderService.createReservationRequest(buyerId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    public OrderDtos.OrderPageDto listOrders(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "ALL") String role,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) UUID listingId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        UUID userId = ListingValidation.requireUserId(jwt);
        return orderService.listOrders(userId, role, status, listingId, page, size);
    }

    @GetMapping("/{id}")
    public OrderDtos.OrderDetailDto getOrderDetail(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id
    ) {
        UUID userId = ListingValidation.requireUserId(jwt);
        return orderService.getOrderDetail(userId, id);
    }

    @PostMapping("/{id}/accept")
    public OrderDtos.OrderDetailDto acceptReservation(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) OrderDtos.AcceptOrderRequest request
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        return orderService.acceptReservation(sellerId, id, request);
    }

    @PostMapping("/{id}/reject")
    public OrderDtos.OrderDetailDto rejectReservation(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) OrderDtos.RejectOrderRequest request
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        return orderService.rejectReservation(sellerId, id, request);
    }

    @PostMapping("/{id}/cancel")
    public OrderDtos.OrderDetailDto cancelReservation(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) OrderDtos.CancelOrderRequest request
    ) {
        UUID userId = ListingValidation.requireUserId(jwt);
        return orderService.cancelReservation(userId, id, request);
    }

    @PostMapping("/{id}/schedules")
    public ResponseEntity<OrderDtos.OrderDetailDto> proposeSchedule(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) OrderDtos.ProposeScheduleRequest request
    ) {
        UUID userId = ListingValidation.requireUserId(jwt);
        OrderDtos.OrderDetailDto updated = orderService.proposeSchedule(userId, id, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(updated);
    }

    @PostMapping("/{id}/schedules/{proposalId}/confirm")
    public OrderDtos.OrderDetailDto confirmSchedule(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @PathVariable UUID proposalId
    ) {
        UUID userId = ListingValidation.requireUserId(jwt);
        return orderService.confirmSchedule(userId, id, proposalId);
    }

    @PostMapping("/{id}/schedules/{proposalId}/reject")
    public OrderDtos.OrderDetailDto rejectSchedule(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @PathVariable UUID proposalId,
            @RequestBody(required = false) OrderDtos.RejectScheduleRequest request
    ) {
        UUID userId = ListingValidation.requireUserId(jwt);
        return orderService.rejectSchedule(userId, id, proposalId, request);
    }

    @PostMapping("/{id}/start-delivery")
    public OrderDtos.OrderDetailDto startDelivery(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody(required = false) OrderDtos.StartDeliveryRequest request
    ) {
        UUID sellerId = ListingValidation.requireUserId(jwt);
        return orderService.startDelivery(sellerId, id, request);
    }
}
