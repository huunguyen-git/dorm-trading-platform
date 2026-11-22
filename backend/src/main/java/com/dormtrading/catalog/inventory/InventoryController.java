package com.dormtrading.catalog.inventory;

import java.util.List;
import java.util.UUID;
import com.dormtrading.iam.auth.AuthFailure;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/inventory")
public class InventoryController {

    private final InventoryService inventoryService;

    public InventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    public record DeleteInventoryItemRequest(Long version) {}

    @GetMapping
    public List<InventoryItemDto> list(@AuthenticationPrincipal Jwt jwt) {
        return inventoryService.listItems(userId(jwt));
    }

    @GetMapping("/{id}")
    public InventoryDetailDto getDetail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return inventoryService.getItemDetail(userId(jwt), id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public InventoryDetailDto create(@AuthenticationPrincipal Jwt jwt, @RequestBody CreateInventoryItemRequest req) {
        return inventoryService.createItem(userId(jwt), req);
    }

    @PutMapping("/{id}")
    public InventoryDetailDto update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestParam(required = false) Long version,
            @RequestBody UpdateInventoryItemRequest req) {
        Long targetVersion = req.version() != null ? req.version() : version;
        UpdateInventoryItemRequest effectiveReq = new UpdateInventoryItemRequest(
                req.ten(), req.name(), req.tinhTrang(), req.description(), req.hinhAnh(), req.images(), targetVersion);
        return inventoryService.updateItem(userId(jwt), id, effectiveReq);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestParam(required = false) Long version,
            @RequestBody(required = false) DeleteInventoryItemRequest body) {
        Long targetVersion = version != null ? version : (body != null ? body.version() : null);
        inventoryService.deleteItem(userId(jwt), id, targetVersion);
    }

    private UUID userId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null) {
            throw new AuthFailure(401, "UNAUTHENTICATED", "Yêu cầu đăng nhập.");
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException e) {
            throw new AuthFailure(401, "INVALID_TOKEN", "Mã xác thực không hợp lệ.");
        }
    }
}
