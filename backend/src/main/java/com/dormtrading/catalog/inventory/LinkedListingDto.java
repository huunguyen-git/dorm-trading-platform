package com.dormtrading.catalog.inventory;

import java.util.UUID;

public record LinkedListingDto(
        UUID maTin,
        UUID id,
        String tieuDe,
        String title,
        String trangThai,
        String status,
        int giaVnd,
        int price
) {
    public static LinkedListingDto of(UUID maTin, String tieuDe, String trangThai, int giaVnd) {
        return new LinkedListingDto(maTin, maTin, tieuDe, tieuDe, trangThai, trangThai, giaVnd, giaVnd);
    }
}
