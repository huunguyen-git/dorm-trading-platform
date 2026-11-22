package com.dormtrading.catalog.inventory;

import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import com.dormtrading.iam.auth.AuthFailure;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor = AuthFailure.class)
@SuppressWarnings("null")
public class InventoryService {

    private final JdbcTemplate db;
    private final Clock clock;

    public InventoryService(JdbcTemplate db, Clock clock) {
        this.db = db;
        this.clock = clock != null ? clock : Clock.systemUTC();
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private final RowMapper<InventoryItem> itemRowMapper = (rs, rowNum) -> new InventoryItem(
            rs.getObject("ma_vat", UUID.class),
            rs.getObject("user_id", UUID.class),
            rs.getString("ten"),
            rs.getString("tinh_trang"),
            extractArray(rs, "hinh_anh"),
            rs.getString("trang_thai"),
            rs.getLong("version"),
            rs.getTimestamp("created_at").toInstant(),
            rs.getTimestamp("updated_at").toInstant()
    );

    private List<String> extractArray(ResultSet rs, String column) throws SQLException {
        Array sqlArray = rs.getArray(column);
        if (sqlArray == null) {
            return List.of();
        }
        Object obj = sqlArray.getArray();
        if (obj instanceof String[] arr) {
            return List.of(arr);
        }
        return List.of();
    }

    public void checkUserActive(UUID userId) {
        if (userId == null) {
            throw new AuthFailure(401, "UNAUTHENTICATED", "Yêu cầu đăng nhập.");
        }
        var rows = db.queryForList("SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ?", String.class, userId);
        if (rows.isEmpty()) {
            throw new AuthFailure(401, "USER_NOT_FOUND", "Người dùng không tồn tại.");
        }
        String status = rows.getFirst();
        if ("BI_KHOA".equals(status) || "VO_HIEU_HOA".equals(status)) {
            throw new AuthFailure(403, "ACCOUNT_LOCKED", "Tài khoản đang bị khóa.");
        }
        if (!"HOAT_DONG".equals(status)) {
            throw new AuthFailure(403, "ACCOUNT_NOT_ACTIVE", "Tài khoản chưa được kích hoạt hoặc phê duyệt.");
        }
    }

    @Transactional(readOnly = true)
    public List<InventoryItemDto> listItems(UUID userId) {
        checkUserActive(userId);
        String sql = """
                SELECT v.ma_vat, v.user_id, v.ten, v.tinh_trang, v.hinh_anh, v.trang_thai, v.version, v.created_at, v.updated_at,
                       COUNT(td.ma_tin) AS linked_count
                FROM do_vats v
                LEFT JOIN tin_dang_do_vat td ON v.ma_vat = td.ma_vat
                WHERE v.user_id = ?
                GROUP BY v.ma_vat, v.user_id, v.ten, v.tinh_trang, v.hinh_anh, v.trang_thai, v.version, v.created_at, v.updated_at
                ORDER BY v.created_at DESC
                """;

        return db.query(sql, (rs, rowNum) -> {
            InventoryItem item = itemRowMapper.mapRow(rs, rowNum);
            int linkedCount = rs.getInt("linked_count");
            return InventoryItemDto.from(Objects.requireNonNull(item), linkedCount);
        }, userId);
    }

    @Transactional(readOnly = true)
    public InventoryDetailDto getItemDetail(UUID userId, UUID itemId) {
        checkUserActive(userId);
        if (itemId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã đồ vật không hợp lệ.");
        }

        List<InventoryItem> items = db.query(
                "SELECT ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai, version, created_at, updated_at FROM do_vats WHERE ma_vat = ?",
                itemRowMapper, itemId);

        if (items.isEmpty() || !items.getFirst().userId().equals(userId)) {
            throw new AuthFailure(404, "ITEM_NOT_FOUND", "Không tìm thấy đồ vật trong kho.");
        }

        InventoryItem item = items.getFirst();
        List<LinkedListingDto> linkedListings = getLinkedListings(itemId);

        return InventoryDetailDto.from(item, linkedListings);
    }

    private List<LinkedListingDto> getLinkedListings(UUID itemId) {
        String sql = """
                SELECT t.ma_tin, t.tieu_de, t.trang_thai, t.gia_vnd
                FROM tin_dang_do_vat td
                JOIN tin_dangs t ON td.ma_tin = t.ma_tin
                WHERE td.ma_vat = ?
                ORDER BY t.created_at DESC
                """;

        return db.query(sql, (rs, rowNum) -> LinkedListingDto.of(
                rs.getObject("ma_tin", UUID.class),
                rs.getString("tieu_de"),
                rs.getString("trang_thai"),
                rs.getInt("gia_vnd")
        ), itemId);
    }

    public InventoryDetailDto createItem(UUID userId, CreateInventoryItemRequest req) {
        checkUserActive(userId);
        if (req == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Dữ liệu yêu cầu không hợp lệ.");
        }

        String ten = req.resolveTen();
        if (ten == null || ten.isBlank()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Tên đồ vật không được để trống.");
        }
        if (ten.length() > 255) {
            throw new AuthFailure(400, "INVALID_INPUT", "Tên đồ vật không được vượt quá 255 ký tự.");
        }

        String tinhTrang = req.resolveTinhTrang();
        if (tinhTrang == null || tinhTrang.isBlank()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mô tả tình trạng không được để trống.");
        }

        List<String> rawImages = req.resolveHinhAnh();
        if (rawImages == null || rawImages.isEmpty()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Đồ vật phải có từ 1 đến 5 hình ảnh thực tế.");
        }
        if (rawImages.size() > 5) {
            throw new AuthFailure(400, "INVALID_INPUT", "Đồ vật chỉ được có tối đa 5 hình ảnh thực tế.");
        }

        List<String> cleanImages = new ArrayList<>();
        for (String img : rawImages) {
            if (img == null || img.isBlank()) {
                throw new AuthFailure(400, "INVALID_INPUT", "Đường dẫn hình ảnh không được để trống.");
            }
            cleanImages.add(img.strip());
        }

        UUID maVat = UUID.randomUUID();
        Instant timestamp = now();

        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO do_vats (ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai, version, created_at, updated_at) " +
                    "VALUES (?, ?, ?, ?, ?, 'KHA_DUNG', 0, ?, ?)");
            ps.setObject(1, maVat);
            ps.setObject(2, userId);
            ps.setString(3, ten);
            ps.setString(4, tinhTrang);
            ps.setArray(5, con.createArrayOf("text", cleanImages.toArray(new String[0])));
            ps.setTimestamp(6, Timestamp.from(timestamp));
            ps.setTimestamp(7, Timestamp.from(timestamp));
            return ps;
        });

        InventoryItem created = new InventoryItem(maVat, userId, ten, tinhTrang, cleanImages, "KHA_DUNG", 0L, timestamp, timestamp);
        return InventoryDetailDto.from(created, List.of());
    }

    public InventoryDetailDto updateItem(UUID userId, UUID itemId, UpdateInventoryItemRequest req) {
        checkUserActive(userId);
        if (itemId == null || req == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Dữ liệu yêu cầu không hợp lệ.");
        }

        // Lock row for optimistic / concurrency verification
        List<InventoryItem> items = db.query(
                "SELECT ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai, version, created_at, updated_at FROM do_vats WHERE ma_vat = ? FOR UPDATE",
                itemRowMapper, itemId);

        if (items.isEmpty() || !items.getFirst().userId().equals(userId)) {
            throw new AuthFailure(404, "ITEM_NOT_FOUND", "Không tìm thấy đồ vật trong kho.");
        }

        InventoryItem current = items.getFirst();

        if (!"KHA_DUNG".equals(current.trangThai())) {
            throw new AuthFailure(409, "ITEM_STATUS_CONFLICT", "Đồ vật không ở trạng thái khả dụng để chỉnh sửa (trạng thái: " + current.trangThai() + ").");
        }

        Integer linkedCount = db.queryForObject("SELECT COUNT(*) FROM tin_dang_do_vat WHERE ma_vat = ?", Integer.class, itemId);
        if (linkedCount != null && linkedCount > 0) {
            throw new AuthFailure(409, "ITEM_LINKED_TO_LISTING", "Đồ vật đã được liên kết với tin đăng, không thể chỉnh sửa.");
        }

        if (req.version() != null && !req.version().equals(current.version())) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Xung đột phiên bản dữ liệu. Vui lòng làm mới trang.");
        }

        String tinhTrang = req.resolveTinhTrang();
        if (tinhTrang == null || tinhTrang.isBlank()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mô tả tình trạng không được để trống.");
        }

        List<String> rawImages = req.resolveHinhAnh();
        if (rawImages == null || rawImages.isEmpty()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Đồ vật phải có từ 1 đến 5 hình ảnh thực tế.");
        }
        if (rawImages.size() > 5) {
            throw new AuthFailure(400, "INVALID_INPUT", "Đồ vật chỉ được có tối đa 5 hình ảnh thực tế.");
        }

        List<String> cleanImages = new ArrayList<>();
        for (String img : rawImages) {
            if (img == null || img.isBlank()) {
                throw new AuthFailure(400, "INVALID_INPUT", "Đường dẫn hình ảnh không được để trống.");
            }
            cleanImages.add(img.strip());
        }

        String resolvedTen = req.resolveTen();
        String ten = resolvedTen != null && !resolvedTen.isBlank() ? resolvedTen : current.ten();
        if (ten.length() > 255) {
            throw new AuthFailure(400, "INVALID_INPUT", "Tên đồ vật không được vượt quá 255 ký tự.");
        }

        Instant timestamp = now();
        long targetVersion = current.version();

        int updated = db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "UPDATE do_vats SET ten = ?, tinh_trang = ?, hinh_anh = ?, version = version + 1, updated_at = ? " +
                    "WHERE ma_vat = ? AND user_id = ? AND version = ?");
            ps.setString(1, ten);
            ps.setString(2, tinhTrang);
            ps.setArray(3, con.createArrayOf("text", cleanImages.toArray(new String[0])));
            ps.setTimestamp(4, Timestamp.from(timestamp));
            ps.setObject(5, itemId);
            ps.setObject(6, userId);
            ps.setLong(7, targetVersion);
            return ps;
        });

        if (updated == 0) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Xung đột đồng thời khi cập nhật đồ vật.");
        }

        InventoryItem updatedItem = new InventoryItem(itemId, userId, ten, tinhTrang, cleanImages, current.trangThai(), targetVersion + 1, current.createdAt(), timestamp);
        return InventoryDetailDto.from(updatedItem, List.of());
    }

    public void deleteItem(UUID userId, UUID itemId, Long expectedVersion) {
        checkUserActive(userId);
        if (itemId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã đồ vật không hợp lệ.");
        }

        // Lock row for optimistic / concurrency verification
        List<InventoryItem> items = db.query(
                "SELECT ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai, version, created_at, updated_at FROM do_vats WHERE ma_vat = ? FOR UPDATE",
                itemRowMapper, itemId);

        if (items.isEmpty() || !items.getFirst().userId().equals(userId)) {
            throw new AuthFailure(404, "ITEM_NOT_FOUND", "Không tìm thấy đồ vật trong kho.");
        }

        InventoryItem current = items.getFirst();

        if (!"KHA_DUNG".equals(current.trangThai())) {
            throw new AuthFailure(409, "ITEM_STATUS_CONFLICT", "Đồ vật không ở trạng thái khả dụng để xóa (trạng thái: " + current.trangThai() + ").");
        }

        Integer linkedCount = db.queryForObject("SELECT COUNT(*) FROM tin_dang_do_vat WHERE ma_vat = ?", Integer.class, itemId);
        if (linkedCount != null && linkedCount > 0) {
            throw new AuthFailure(409, "ITEM_LINKED_TO_LISTING", "Đồ vật đã được liên kết với tin đăng, không thể xóa.");
        }

        if (expectedVersion != null && !expectedVersion.equals(current.version())) {
            throw new AuthFailure(409, "VERSION_CONFLICT", "Xung đột phiên bản dữ liệu. Vui lòng làm mới trang.");
        }

        try {
            int deleted = db.update("DELETE FROM do_vats WHERE ma_vat = ? AND user_id = ? AND version = ?", itemId, userId, current.version());
            if (deleted == 0) {
                throw new AuthFailure(409, "VERSION_CONFLICT", "Xung đột đồng thời khi xóa đồ vật.");
            }
        } catch (DataIntegrityViolationException e) {
            throw new AuthFailure(409, "ITEM_LINKED_TO_LISTING", "Đồ vật đã được liên kết với tin đăng, không thể xóa.");
        }
    }
}
