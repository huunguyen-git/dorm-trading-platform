package com.dormtrading.catalog.inventory;

import java.util.List;

public record CreateInventoryItemRequest(
        String ten,
        String name,
        String tinhTrang,
        String description,
        List<String> hinhAnh,
        List<String> images
) {
    public String resolveTen() {
        return ten != null && !ten.isBlank() ? ten.strip() : (name != null ? name.strip() : null);
    }

    public String resolveTinhTrang() {
        return tinhTrang != null && !tinhTrang.isBlank() ? tinhTrang.strip() : (description != null ? description.strip() : null);
    }

    public List<String> resolveHinhAnh() {
        return hinhAnh != null && !hinhAnh.isEmpty() ? hinhAnh : images;
    }
}
