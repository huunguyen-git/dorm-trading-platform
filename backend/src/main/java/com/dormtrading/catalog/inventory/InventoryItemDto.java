package com.dormtrading.catalog.inventory;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record InventoryItemDto(
        UUID id,
        UUID maVat,
        String ten,
        String name,
        String tinhTrang,
        String description,
        List<String> hinhAnh,
        List<String> images,
        String trangThai,
        String status,
        int linkedListingCount,
        int soTinDangLienKet,
        boolean canEdit,
        boolean canDelete,
        long version,
        Instant createdAt,
        Instant updatedAt
) {
    public static InventoryItemDto from(InventoryItem item, int linkedCount) {
        boolean canAction = "KHA_DUNG".equals(item.trangThai()) && linkedCount == 0;
        return new InventoryItemDto(
                item.maVat(),
                item.maVat(),
                item.ten(),
                item.ten(),
                item.tinhTrang(),
                item.tinhTrang(),
                item.hinhAnh(),
                item.hinhAnh(),
                item.trangThai(),
                item.trangThai(),
                linkedCount,
                linkedCount,
                canAction,
                canAction,
                item.version(),
                item.createdAt(),
                item.updatedAt()
        );
    }
}
