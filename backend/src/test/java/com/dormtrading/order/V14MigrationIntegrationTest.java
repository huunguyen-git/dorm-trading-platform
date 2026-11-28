package com.dormtrading.order;

import com.dormtrading.config.PostgresTestContainer;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("Kiểm thử Migration V14: Hoàn tất giao dịch OTP & Yêu cầu hủy sau báo giao (P3-02)")
class V14MigrationIntegrationTest {

    @Test
    @DisplayName("Chạy sạch V1..V14 tạo đủ bảng, cột mới và chỉ mục duy nhất một phần")
    void cleanMigrateV1ThroughV14CreatesTablesColumnsAndIndexes() throws Exception {
        var pg = PostgresTestContainer.getInstance();
        String schema = "v14_clean_" + UUID.randomUUID().toString().replace("-", "");
        var flyway = Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(schema)
                .defaultSchema(schema)
                .target("14")
                .load();
        var result = flyway.migrate();
        assertThat(result.migrationsExecuted).isEqualTo(14);

        try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             Statement stmt = conn.createStatement()) {
            stmt.execute("SET search_path TO " + schema);

            Set<String> tables = new HashSet<>();
            try (var rs = stmt.executeQuery(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = '" + schema + "'")) {
                while (rs.next()) {
                    tables.add(rs.getString(1));
                }
            }
            assertThat(tables).contains(
                    "giao_dichs",
                    "giao_dich_do_vat",
                    "lich_hen_giao_dichs",
                    "thong_baos",
                    "ma_xac_nhan_otp",
                    "anh_ban_giao_giao_dichs",
                    "yeu_cau_huy_giao_dichs",
                    "lich_su_trang_thai_giao_dich"
            );

            Set<String> otpCols = new HashSet<>();
            try (var rs = stmt.executeQuery(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema = '"
                            + schema + "' AND table_name = 'ma_xac_nhan_otp'")) {
                while (rs.next()) {
                    otpCols.add(rs.getString(1));
                }
            }
            assertThat(otpCols).contains(
                    "otp_hash",
                    "otp_ciphertext",
                    "so_lan_thu_toi_da",
                    "bi_vo_hieu",
                    "ly_do_vo_hieu",
                    "thoi_diem_dung",
                    "nguoi_cap_id"
            );

            // ma_otp must now be nullable so plaintext OTP is never required
            try (var rs = stmt.executeQuery(
                    "SELECT is_nullable FROM information_schema.columns WHERE table_schema = '"
                            + schema + "' AND table_name = 'ma_xac_nhan_otp' AND column_name = 'ma_otp'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString(1)).isEqualTo("YES");
            }

            Set<String> indexes = new HashSet<>();
            try (var rs = stmt.executeQuery(
                    "SELECT indexname FROM pg_indexes WHERE schemaname = '" + schema + "'")) {
                while (rs.next()) {
                    indexes.add(rs.getString(1));
                }
            }
            assertThat(indexes).contains(
                    "idx_giao_dichs_buyer_updated",
                    "idx_giao_dichs_seller_updated",
                    "idx_giao_dichs_overdue_confirm",
                    "uq_otp_active_per_order",
                    "idx_otp_order_issued",
                    "idx_anh_ban_giao_order",
                    "uq_yc_huy_pending_per_order",
                    "idx_yc_huy_order_created",
                    "idx_lich_su_gd_order_created"
            );
        }
    }

    @Test
    @DisplayName("Nâng cấp V13 -> V14 bảo toàn dữ liệu hiện có và thực thi ràng buộc CHECK/UNIQUE")
    void upgradesV13ToV14PreservingExistingRowsAndEnforcingConstraints() throws Exception {
        var pg = PostgresTestContainer.getInstance();
        String schema = "v14_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var config = Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(schema)
                .defaultSchema(schema);

        config.target("13").load().migrate();

        UUID sellerId = UUID.randomUUID();
        UUID buyerId = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();

        try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             Statement stmt = conn.createStatement()) {
            stmt.execute("SET search_path TO " + schema);
            stmt.execute("INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, trang_thai_tai_khoan) "
                    + "VALUES ('" + sellerId + "', 'v14seller@student.edu.vn', 'h', 'Người Bán', '23521001', 'HOAT_DONG')");
            stmt.execute("INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, trang_thai_tai_khoan) "
                    + "VALUES ('" + buyerId + "', 'v14buyer@student.edu.vn', 'h', 'Người Mua', '23521002', 'HOAT_DONG')");
            stmt.execute("INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) "
                    + "VALUES ('" + listingId + "', '" + sellerId + "', 'Bàn học cũ', 120000, 'GIU_CHO')");
            stmt.execute("INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai) "
                    + "VALUES ('" + orderId + "', '" + listingId + "', '" + sellerId + "', '" + buyerId + "', 120000, 'DANG_GIAO')");

            var v14Result = config.target("14").load().migrate();
            assertThat(v14Result.migrationsExecuted).isEqualTo(1);

            // Existing row preserved cleanly
            try (var rs = stmt.executeQuery("SELECT trang_thai, ly_do_cho_xu_ly FROM giao_dichs WHERE ma_giao_dich = '" + orderId + "'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString("trang_thai")).isEqualTo("DANG_GIAO");
                assertThat(rs.getObject("ly_do_cho_xu_ly")).isNull();
            }

            // Self-trade rejected by chk_giao_dichs_distinct_parties
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO giao_dichs(ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai) "
                            + "VALUES ('" + listingId + "', '" + sellerId + "', '" + sellerId + "', 10000, 'YEU_CAU')"))
                    .isInstanceOf(SQLException.class);

            // Invalid escalation reason rejected
            assertThatThrownBy(() -> stmt.execute(
                    "UPDATE giao_dichs SET ly_do_cho_xu_ly = 'UNKNOWN' WHERE ma_giao_dich = '" + orderId + "'"))
                    .isInstanceOf(SQLException.class);

            // OTP constraints: only 1 active OTP per order (uq_otp_active_per_order), attempts <= 5, expiry > issue
            String hash = "a".repeat(64);
            stmt.execute("INSERT INTO ma_xac_nhan_otp(ma_giao_dich, ma_otp, otp_hash, thoi_diem_phat, thoi_diem_het_han, so_lan_thu_sai, da_dung, bi_vo_hieu) "
                    + "VALUES ('" + orderId + "', NULL, '" + hash + "', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '10 minutes', 0, FALSE, FALSE)");

            // Second active OTP on same order must fail partial unique index
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO ma_xac_nhan_otp(ma_giao_dich, ma_otp, otp_hash, thoi_diem_phat, thoi_diem_het_han, so_lan_thu_sai, da_dung, bi_vo_hieu) "
                            + "VALUES ('" + orderId + "', NULL, '" + hash + "', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '10 minutes', 0, FALSE, FALSE)"))
                    .isInstanceOf(SQLException.class);

            // Attempts > 5 rejected
            assertThatThrownBy(() -> stmt.execute(
                    "UPDATE ma_xac_nhan_otp SET so_lan_thu_sai = 6 WHERE ma_giao_dich = '" + orderId + "'"))
                    .isInstanceOf(SQLException.class);

            // Proof photo content_type & size_bytes constraints
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO anh_ban_giao_giao_dichs(ma_giao_dich, nguoi_tai_len_id, storage_key, content_type, size_bytes, sha256) "
                            + "VALUES ('" + orderId + "', '" + sellerId + "', 'k/1.svg', 'image/svg+xml', 100, '" + hash + "')"))
                    .isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO anh_ban_giao_giao_dichs(ma_giao_dich, nguoi_tai_len_id, storage_key, content_type, size_bytes, sha256) "
                            + "VALUES ('" + orderId + "', '" + sellerId + "', 'k/2.jpg', 'image/jpeg', 5242881, '" + hash + "')"))
                    .isInstanceOf(SQLException.class);

            // Cancel request self-response rejected by chk_yc_huy_distinct_responder & duplicate pending rejected by uq_yc_huy_pending_per_order
            UUID cancelReqId = UUID.randomUUID();
            stmt.execute("INSERT INTO yeu_cau_huy_giao_dichs(id, ma_giao_dich, nguoi_yeu_cau_id, ma_ly_do, ly_do, trang_thai) "
                    + "VALUES ('" + cancelReqId + "', '" + orderId + "', '" + buyerId + "', 'MUTUAL_AGREEMENT', 'Thống nhất hủy', 'CHO_XAC_NHAN')");

            assertThatThrownBy(() -> stmt.execute(
                    "UPDATE yeu_cau_huy_giao_dichs SET nguoi_phan_hoi_id = '" + buyerId + "' WHERE id = '" + cancelReqId + "'"))
                    .isInstanceOf(SQLException.class);

            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO yeu_cau_huy_giao_dichs(ma_giao_dich, nguoi_yeu_cau_id, ma_ly_do, trang_thai) "
                            + "VALUES ('" + orderId + "', '" + sellerId + "', 'OTHER', 'CHO_XAC_NHAN')"))
                    .isInstanceOf(SQLException.class);
        }
    }
}
