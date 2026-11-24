package com.dormtrading.catalog;

import com.dormtrading.iam.auth.AuthFailure;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;

public final class ListingValidation {

    public static final int MAX_TITLE_LENGTH = 255;
    public static final int MAX_DESCRIPTION_LENGTH = 5000;
    public static final int MAX_CONDITION_LENGTH = 2000;
    public static final int MAX_LOCATION_TEXT_LENGTH = 255;
    public static final int MAX_COURSE_CODE_LENGTH = 50;
    public static final int MAX_COURSE_NAME_LENGTH = 200;
    public static final int MAX_AUTHOR_LENGTH = 200;
    public static final int MAX_IMAGE_URL_LENGTH = 1000;
    public static final int MAX_IMAGES = 5;
    public static final int MAX_ITEMS_PER_LISTING = 20;
    public static final int MAX_PAGE_SIZE = 100;
    public static final double EARTH_RADIUS_KM = 6371.0;

    private ListingValidation() {
    }

    public static UUID requireUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException e) {
            throw new AuthFailure(401, "UNAUTHORIZED", "Mã xác thực không hợp lệ.");
        }
    }

    public static UUID optionalUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    public static String requiredText(String value, int maxLength, String emptyMessage, String tooLongMessage) {
        if (value == null || value.isBlank()) {
            throw new AuthFailure(400, "INVALID_INPUT", emptyMessage);
        }
        String trimmed = value.strip();
        if (trimmed.length() > maxLength) {
            throw new AuthFailure(400, "INVALID_INPUT", tooLongMessage);
        }
        return trimmed;
    }

    public static String optionalText(String value, int maxLength, String tooLongMessage) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.strip();
        if (trimmed.length() > maxLength) {
            throw new AuthFailure(400, "INVALID_INPUT", tooLongMessage);
        }
        return trimmed;
    }

    public static int validatePriceVnd(Integer priceVnd, boolean required) {
        if (priceVnd == null) {
            if (required) {
                throw new AuthFailure(400, "INVALID_INPUT", "Vui lòng nhập giá bán (0đ nếu cho tặng).");
            }
            return 0;
        }
        if (priceVnd < 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Giá bán không được nhỏ hơn 0 đồng.");
        }
        return priceVnd;
    }

    public static void validatePriceRange(Integer minPrice, Integer maxPrice) {
        if (minPrice != null && minPrice < 0) {
            throw new AuthFailure(400, "INVALID_PRICE_RANGE", "Giá tối thiểu không được nhỏ hơn 0 đồng.");
        }
        if (maxPrice != null && maxPrice < 0) {
            throw new AuthFailure(400, "INVALID_PRICE_RANGE", "Giá tối đa không được nhỏ hơn 0 đồng.");
        }
        if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
            throw new AuthFailure(400, "INVALID_PRICE_RANGE", "Giá tối thiểu không được lớn hơn giá tối đa.");
        }
    }

    public static String validateImageUrl(String url) {
        if (url == null || url.isBlank()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Đường dẫn hình ảnh không được để trống.");
        }
        String trimmed = url.strip();
        if (trimmed.length() > MAX_IMAGE_URL_LENGTH) {
            throw new AuthFailure(400, "INVALID_INPUT", "Đường dẫn hình ảnh không được vượt quá 1000 ký tự.");
        }
        try {
            URI uri = URI.create(trimmed);
            String scheme = uri.getScheme();
            String authority = uri.getRawAuthority();
            if (scheme == null
                    || (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme))
                    || authority == null
                    || authority.isBlank()) {
                throw new AuthFailure(400, "INVALID_INPUT", "Đường dẫn hình ảnh phải là URL http:// hoặc https:// hợp lệ.");
            }
            return trimmed;
        } catch (IllegalArgumentException e) {
            throw new AuthFailure(400, "INVALID_INPUT", "Đường dẫn hình ảnh phải là URL http:// hoặc https:// hợp lệ.");
        }
    }

    public static List<String> validateImages(List<String> images, boolean required) {
        if (images == null || images.isEmpty()) {
            if (required) {
                throw new AuthFailure(400, "INVALID_INPUT", "Tin đăng phải có từ 1 đến 5 hình ảnh.");
            }
            return List.of();
        }
        if (images.size() > MAX_IMAGES) {
            throw new AuthFailure(400, "INVALID_INPUT", "Tin đăng chỉ được có tối đa 5 hình ảnh.");
        }
        List<String> cleaned = new ArrayList<>(images.size());
        for (String img : images) {
            cleaned.add(validateImageUrl(img));
        }
        return List.copyOf(cleaned);
    }

    public static List<UUID> deduplicateItemIds(List<UUID> itemIds, boolean required) {
        if (itemIds == null || itemIds.isEmpty()) {
            if (required) {
                throw new AuthFailure(400, "INVALID_INPUT", "Tin đăng phải gắn ít nhất 1 đồ vật từ kho cá nhân.");
            }
            return List.of();
        }
        LinkedHashSet<UUID> deduplicated = new LinkedHashSet<>();
        for (UUID itemId : itemIds) {
            if (itemId == null) {
                throw new AuthFailure(400, "INVALID_INPUT", "Danh sách đồ vật chứa mã không hợp lệ.");
            }
            deduplicated.add(itemId);
        }
        if (deduplicated.size() > MAX_ITEMS_PER_LISTING) {
            throw new AuthFailure(400, "INVALID_INPUT", "Tin đăng chỉ được gắn tối đa " + MAX_ITEMS_PER_LISTING + " đồ vật.");
        }
        return List.copyOf(deduplicated);
    }

    public static void validateCoordinates(Double latitude, Double longitude) {
        if (latitude == null && longitude == null) {
            return;
        }
        if (latitude == null || longitude == null) {
            throw new AuthFailure(400, "INVALID_LOCATION", "Vui lòng cung cấp đầy đủ cả vĩ độ và kinh độ.");
        }
        if (Double.isNaN(latitude) || Double.isInfinite(latitude) || latitude < -90.0 || latitude > 90.0) {
            throw new AuthFailure(400, "INVALID_LOCATION", "Vĩ độ phải nằm trong khoảng từ -90 đến 90.");
        }
        if (Double.isNaN(longitude) || Double.isInfinite(longitude) || longitude < -180.0 || longitude > 180.0) {
            throw new AuthFailure(400, "INVALID_LOCATION", "Kinh độ phải nằm trong khoảng từ -180 đến 180.");
        }
    }

    public static void validateRadiusSearch(Double lat, Double lng, Double radiusKm) {
        if (radiusKm != null) {
            if (Double.isNaN(radiusKm) || Double.isInfinite(radiusKm) || radiusKm <= 0.0) {
                throw new AuthFailure(400, "INVALID_LOCATION", "Bán kính tìm kiếm phải lớn hơn 0 km.");
            }
            if (lat == null || lng == null) {
                throw new AuthFailure(400, "INVALID_LOCATION", "Tìm kiếm theo bán kính yêu cầu đầy đủ tọa độ lat và lng.");
            }
        }
        validateCoordinates(lat, lng);
    }

    public static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double radLat1 = Math.toRadians(lat1);
        double radLat2 = Math.toRadians(lat2);
        double sinLat = Math.sin(dLat / 2.0);
        double sinLng = Math.sin(dLng / 2.0);
        double a = sinLat * sinLat + Math.cos(radLat1) * Math.cos(radLat2) * sinLng * sinLng;
        double clampedA = Math.min(1.0, Math.max(0.0, a));
        return 2.0 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(clampedA));
    }

    public static double roundDistanceKm(double distanceKm) {
        return Math.round(distanceKm * 100.0) / 100.0;
    }

    public static int validatePage(int page) {
        if (page < 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Số trang không hợp lệ.");
        }
        return page;
    }

    public static int validateSize(int size) {
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new AuthFailure(400, "INVALID_INPUT", "Kích thước trang phải từ 1 đến " + MAX_PAGE_SIZE + ".");
        }
        return size;
    }

    public static int calculateTotalPages(long totalElements, int size) {
        if (totalElements <= 0 || size <= 0) {
            return 0;
        }
        return (int) Math.ceil((double) totalElements / size);
    }
}
