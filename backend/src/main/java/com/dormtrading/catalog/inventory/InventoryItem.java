package com.dormtrading.catalog.inventory;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record InventoryItem(
        UUID maVat,
        UUID userId,
        String ten,
        String tinhTrang,
        List<String> hinhAnh,
        String trangThai,
        long version,
        Instant createdAt,
        Instant updatedAt
) {}
