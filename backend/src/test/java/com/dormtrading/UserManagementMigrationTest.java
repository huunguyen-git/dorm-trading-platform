package com.dormtrading;

import com.dormtrading.config.PostgresTestContainer;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("Kiểm thử Migration V5: Quản lý người dùng, khóa tài khoản & sổ cái điểm uy tín")
class UserManagementMigrationTest {

    @Test
    @DisplayName("Chạy sạch V1..V5 tạo đủ cột, bảng và chỉ mục cần thiết")
    void cleanMigrateV1ThroughV5CreatesTablesColumnsAndIndexes() throws Exception {
        var pg = PostgresTestContainer.getInstance();
        String schema = "v5_clean_" + UUID.randomUUID().toString().replace("-", "");
        var flyway = Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(schema)
                .defaultSchema(schema)
                .target("5")
                .load();
        var result = flyway.migrate();
        assertThat(result.migrationsExecuted).isEqualTo(5);

        try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             Statement stmt = conn.createStatement()) {
            stmt.execute("SET search_path TO " + schema);

            try (var rs = stmt.executeQuery(
                    "SELECT column_name FROM information_schema.columns " +
                    "WHERE table_schema = '" + schema + "' AND table_name = 'thanh_viens'")) {
                var cols = new java.util.HashSet<String>();
                while (rs.next()) {
                    cols.add(rs.getString(1));
                }
                assertThat(cols).contains(
                        "loai_han_che",
                        "ly_do_han_che",
                        "cho_phep_khieu_nai",
                        "diem_da_khoa_tam"
                );
            }

            try (var rs = stmt.executeQuery(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = '" + schema + "'")) {
                var tables = new java.util.HashSet<String>();
                while (rs.next()) {
                    tables.add(rs.getString(1));
                }
                assertThat(tables).contains("lich_su_diem_uy_tin", "nhat_ky_kiem_duyet");
            }

            try (var rs = stmt.executeQuery(
                    "SELECT indexname FROM pg_indexes WHERE schemaname = '" + schema + "'")) {
                var indexes = new java.util.HashSet<String>();
                while (rs.next()) {
                    indexes.add(rs.getString(1));
                }
                assertThat(indexes).contains(
                        "idx_lich_su_diem_user_time",
                        "idx_nhat_ky_kiem_duyet_target_time"
                );
            }
        }
    }

    @Test
    @DisplayName("Nâng cấp V4 -> V5 bảo toàn dữ liệu hiện có và chuẩn hóa mặc định an toàn")
    void upgradesV4ToV5PreservingExistingAccounts() throws Exception {
        var pg = PostgresTestContainer.getInstance();
        String schema = "v5_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var config = Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(schema)
                .defaultSchema(schema);

        config.target("4").load().migrate();

        UUID existingUserId = UUID.randomUUID();
        try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             Statement stmt = conn.createStatement()) {
            stmt.execute("SET search_path TO " + schema);
            stmt.execute(
                    "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, trang_thai_sv, diem_uy_tin, trang_thai_tai_khoan) " +
                    "VALUES ('" + existingUserId + "', 'existing@student.edu.vn', 'hash', 'Sinh Viên Cũ', '22520001', NULL, 85, 'HOAT_DONG')"
            );

            config.target("5").load().migrate();

            try (var rs = stmt.executeQuery(
                    "SELECT trang_thai_sv, diem_uy_tin, trang_thai_tai_khoan, loai_han_che, ly_do_han_che, cho_phep_khieu_nai, diem_da_khoa_tam " +
                    "FROM thanh_viens WHERE user_id = '" + existingUserId + "'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString("trang_thai_sv")).isEqualTo("DANG_HOC");
                assertThat(rs.getInt("diem_uy_tin")).isEqualTo(85);
                assertThat(rs.getString("trang_thai_tai_khoan")).isEqualTo("HOAT_DONG");
                assertThat(rs.getString("loai_han_che")).isNull();
                assertThat(rs.getString("ly_do_han_che")).isNull();
                assertThat(rs.getBoolean("cho_phep_khieu_nai")).isFalse();
                assertThat(rs.getObject("diem_da_khoa_tam")).isNull();
            }
        }
    }

    @Test
    @DisplayName("Ràng buộc CHECK trên thanh_viens, lich_su_diem_uy_tin và nhat_ky_kiem_duyet chặn dữ liệu sai quy tắc")
    void enforcesDatabaseCheckAndUniquenessConstraints() throws Exception {
        var pg = PostgresTestContainer.getInstance();
        String schema = "v5_constraints_" + UUID.randomUUID().toString().replace("-", "");
        Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(schema)
                .defaultSchema(schema)
                .target("5")
                .load()
                .migrate();

        UUID userId = UUID.randomUUID();
        try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             Statement stmt = conn.createStatement()) {
            stmt.execute("SET search_path TO " + schema);
            stmt.execute(
                    "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, diem_uy_tin, trang_thai_tai_khoan, trang_thai_sv) " +
                    "VALUES ('" + userId + "', 'valid@student.edu.vn', 'hash', 'Hợp Lệ', '23520099', 100, 'HOAT_DONG', 'DANG_HOC')"
            );

            assertThatThrownBy(() -> stmt.execute(
                    "UPDATE thanh_viens SET trang_thai_tai_khoan = 'INVALID_STATUS' WHERE user_id = '" + userId + "'"))
                    .isInstanceOf(SQLException.class);

            assertThatThrownBy(() -> stmt.execute(
                    "UPDATE thanh_viens SET trang_thai_sv = 'BAO_LUU' WHERE user_id = '" + userId + "'"))
                    .isInstanceOf(SQLException.class);

            assertThatThrownBy(() -> stmt.execute(
                    "UPDATE thanh_viens SET diem_uy_tin = -1 WHERE user_id = '" + userId + "'"))
                    .isInstanceOf(SQLException.class);

            assertThatThrownBy(() -> stmt.execute(
                    "UPDATE thanh_viens SET loai_han_che = 'SHADOW_BAN' WHERE user_id = '" + userId + "'"))
                    .isInstanceOf(SQLException.class);

            stmt.execute(
                    "INSERT INTO lich_su_diem_uy_tin(user_id, loai_bien_dong, diem_thay_doi, diem_truoc, diem_sau, ly_do, nguon_tham_chieu, idempotency_key) " +
                    "VALUES ('" + userId + "', 'KHOI_TAO_KICH_HOAT', 100, 0, 100, 'Kích hoạt', 'ACTIVATION', 'ACT:" + userId + "')"
            );

            // Duplicate idempotency_key must fail
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO lich_su_diem_uy_tin(user_id, loai_bien_dong, diem_thay_doi, diem_truoc, diem_sau, ly_do, nguon_tham_chieu, idempotency_key) " +
                    "VALUES ('" + userId + "', 'KHOI_TAO_KICH_HOAT', 100, 0, 100, 'Kích hoạt lại', 'ACTIVATION', 'ACT:" + userId + "')"))
                    .isInstanceOf(SQLException.class);

            // Arithmetic mismatch diem_truoc + diem_thay_doi != diem_sau must fail
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO lich_su_diem_uy_tin(user_id, loai_bien_dong, diem_thay_doi, diem_truoc, diem_sau, ly_do, nguon_tham_chieu, idempotency_key) " +
                    "VALUES ('" + userId + "', 'XU_PHAT_THANG_PHAT', -10, 100, 95, 'Sai số học', 'PENALTY', 'PEN:1')"))
                    .isInstanceOf(SQLException.class);

            // Invalid moderation action_type must fail
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO nhat_ky_kiem_duyet(target_user_id, action_type, reason) " +
                    "VALUES ('" + userId + "', 'UNKNOWN_ACTION', 'Không hợp lệ')"))
                    .isInstanceOf(SQLException.class);
        }
    }
}
