package com.dormtrading.catalog.inventory;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record InventoryDetailDto(
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
        Instant updatedAt,
        List<LinkedListingDto> linkedListings
) {
    public static InventoryDetailDto from(InventoryItem item, List<LinkedListingDto> linkedListings) {
        int count = linkedListings != null ? linkedListings.size() : 0;
        boolean canAction = "KHA_DUNG".equals(item.trangThai()) && count == 0;
        return new InventoryDetailDto(
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
                count,
                count,
                canAction,
                canAction,
                item.version(),
                item.createdAt(),
                item.updatedAt(),
                linkedListings != null ? linkedListings : List.of()
        );
    }
}
