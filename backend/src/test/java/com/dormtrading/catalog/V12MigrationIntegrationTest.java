package com.dormtrading.catalog;

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

@DisplayName("Kiểm thử Migration V12: Tin đăng, tìm kiếm khám phá, khu vực & media")
class V12MigrationIntegrationTest {

        @Test
        @DisplayName("Chạy sạch V1..V12 tạo đủ bảng, cột mới, dữ liệu hạt giống và chỉ mục")
        void cleanMigrateV1ThroughV12CreatesTablesColumnsSeedsAndIndexes() throws Exception {
                var pg = PostgresTestContainer.getInstance();
                String schema = "v12_clean_" + UUID.randomUUID().toString().replace("-", "");
                var flyway = Flyway.configure()
                                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                                .schemas(schema)
                                .defaultSchema(schema)
                                .target("12")
                                .load();
                var result = flyway.migrate();
                assertThat(result.migrationsExecuted).isEqualTo(12);

                try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                                Statement stmt = conn.createStatement()) {
                        stmt.execute("SET search_path TO " + schema);

                        Set<String> tables = new HashSet<>();
                        try (var rs = stmt.executeQuery(
                                        "SELECT table_name FROM information_schema.tables WHERE table_schema = '"
                                                        + schema + "'")) {
                                while (rs.next()) {
                                        tables.add(rs.getString(1));
                                }
                        }
                        assertThat(tables).contains("khu_vucs", "media_files", "tin_dangs", "danh_mucs", "do_vats");

                        Set<String> zoneCodes = new HashSet<>();
                        try (var rs = stmt.executeQuery("SELECT ma_khu_vuc FROM khu_vucs")) {
                                while (rs.next()) {
                                        zoneCodes.add(rs.getString(1));
                                }
                        }
                        assertThat(zoneCodes).containsExactlyInAnyOrder(
                                        "KTX_KHU_A",
                                        "KTX_KHU_B",
                                        "UIT",
                                        "BACH_KHOA_CS2",
                                        "KHTN",
                                        "KHXH_NV",
                                        "UEL",
                                        "IU",
                                        "NVH_SV");

                        Set<String> categories = new HashSet<>();
                        try (var rs = stmt.executeQuery("SELECT ma_danh_muc FROM danh_mucs")) {
                                while (rs.next()) {
                                        categories.add(rs.getString(1));
                                }
                        }
                        assertThat(categories).contains(
                                        "GIAO_TRINH",
                                        "GT_CNTT",
                                        "GT_KINH_TE",
                                        "DO_GIA_DUNG",
                                        "THIET_BI_DIEN",
                                        "NOI_THAT_TRO",
                                        "DO_CHO_TANG",
                                        "GT_DAI_CUONG",
                                        "GT_NGOAI_NGU",
                                        "TB_DIEN_TU");

                        Set<String> listingCols = new HashSet<>();
                        try (var rs = stmt.executeQuery(
                                        "SELECT column_name FROM information_schema.columns " +
                                                        "WHERE table_schema = '" + schema
                                                        + "' AND table_name = 'tin_dangs'")) {
                                while (rs.next()) {
                                        listingCols.add(rs.getString(1));
                                }
                        }
                        assertThat(listingCols).contains(
                                        "tinh_trang",
                                        "ma_mon_hoc",
                                        "ten_mon_hoc",
                                        "tac_gia",
                                        "ma_khu_vuc",
                                        "vi_do",
                                        "kinh_do",
                                        "published_at",
                                        "expires_at",
                                        "renewal_reminded_at",
                                        "closed_at",
                                        "so_lan_gia_han",
                                        "ly_do_an");

                        Set<String> indexes = new HashSet<>();
                        try (var rs = stmt.executeQuery(
                                        "SELECT indexname FROM pg_indexes WHERE schemaname = '" + schema + "'")) {
                                while (rs.next()) {
                                        indexes.add(rs.getString(1));
                                }
                        }
                        assertThat(indexes).contains(
                                        "idx_tin_dang_do_vat_ma_vat",
                                        "idx_danh_mucs_cha",
                                        "idx_tin_dangs_nguoi_dang_trang_thai",
                                        "idx_tin_dangs_public_published",
                                        "idx_tin_dangs_public_price",
                                        "idx_tin_dangs_public_category",
                                        "idx_tin_dangs_public_course_trgm",
                                        "idx_tin_dangs_public_search_trgm",
                                        "idx_tin_dangs_public_location_trgm",
                                        "idx_do_vats_ten_trgm",
                                        "idx_tin_dangs_public_zone",
                                        "idx_tin_dangs_expires_at",
                                        "idx_danh_gias_seller_approved",
                                        "idx_media_files_owner");

                        try (var rs = stmt.executeQuery(
                                        "SELECT indexdef FROM pg_indexes WHERE schemaname = '" + schema
                                                        + "' AND indexname = 'idx_tin_dangs_public_published'")) {
                                assertThat(rs.next()).isTrue();
                                assertThat(rs.getString(1)).contains("COALESCE(published_at, created_at)");
                        }
                        try (var rs = stmt.executeQuery(
                                        "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'")) {
                                assertThat(rs.next()).isTrue();
                        }

                        // Seed 2000 realistic listings & inventory items + VACUUM ANALYZE (flushes GIN
                        // pending list)
                        // so PostgreSQL 16's real cost-based planner chooses V12 indexes naturally
                        // without planner overrides
                        stmt.execute("SET search_path TO " + schema + ", public");
                        UUID seedUser = UUID.randomUUID();
                        stmt.execute(
                                        "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, trang_thai_tai_khoan) "
                                                        +
                                                        "VALUES ('" + seedUser
                                                        + "', 'planner@student.edu.vn', 'hash', 'Planner User', '23529999', 'HOAT_DONG')");
                        stmt.execute(
                                        "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, mo_ta, ma_mon_hoc, ten_mon_hoc, tac_gia, khu_vuc, gia_vnd, trang_thai, published_at) "
                                                        +
                                                        "SELECT gen_random_uuid(), '" + seedUser + "', " +
                                                        "  'Do dung phong tro so ' || g, " +
                                                        "  'Mo ta chi tiet san pham sinh vien ' || g, " +
                                                        "  CASE WHEN g = 42 THEN 'SE100' ELSE 'CS' || (1000 + g) END, "
                                                        +
                                                        "  CASE WHEN g = 42 THEN 'Nhap mon Cong nghe phan mem' ELSE 'Mon hoc so ' || g END, "
                                                        +
                                                        "  CASE WHEN g = 42 THEN 'Ian Sommerville' ELSE 'Tac gia ' || g END, "
                                                        +
                                                        "  'KTX Khu A toa B' || (g % 10), " +
                                                        "  10000 + (g * 1000), 'CONG_KHAI', CURRENT_TIMESTAMP - (g || ' minutes')::interval "
                                                        +
                                                        "FROM generate_series(1, 2000) AS g");
                        stmt.execute(
                                        "INSERT INTO do_vats(ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai) " +
                                                        "SELECT gen_random_uuid(), '" + seedUser + "', " +
                                                        "  CASE WHEN g = 42 THEN 'Giao trinh SE100 ban in dep' ELSE 'Vat dung sinh vien ' || g END, "
                                                        +
                                                        "  'Moi 95%', ARRAY['/api/v1/media/' || gen_random_uuid()], 'KHA_DUNG' "
                                                        +
                                                        "FROM generate_series(1, 2000) AS g");
                        stmt.execute("VACUUM ANALYZE tin_dangs");
                        stmt.execute("VACUUM ANALYZE do_vats");
                        stmt.execute("VACUUM ANALYZE tin_dang_do_vat");

                        String newestPlan = explainPlan(stmt,
                                        "SELECT ma_tin FROM tin_dangs WHERE trang_thai = 'CONG_KHAI' " +
                                                        "ORDER BY COALESCE(published_at, created_at) DESC, ma_tin DESC LIMIT 20");
                        assertThat(newestPlan).contains("idx_tin_dangs_public_published");

                        String coursePlan = explainPlan(stmt,
                                        "SELECT ma_tin FROM tin_dangs WHERE trang_thai = 'CONG_KHAI' AND ma_mon_hoc ILIKE '%SE100%' ESCAPE '\\'");
                        assertThat(coursePlan).contains("idx_tin_dangs_public_course_trgm");

                        String combinedSearchPlan = explainPlan(stmt,
                                        "SELECT t.ma_tin FROM tin_dangs t WHERE t.trang_thai = 'CONG_KHAI' AND (" +
                                                        "(COALESCE(t.tieu_de, '') || E'\\n' || COALESCE(t.mo_ta, '') || E'\\n' || COALESCE(t.ma_mon_hoc, '') || E'\\n' || COALESCE(t.ten_mon_hoc, '') || E'\\n' || COALESCE(t.tac_gia, '')) ILIKE '%Sommerville%' ESCAPE '\\' "
                                                        +
                                                        "OR t.ma_tin = ANY(ARRAY(SELECT DISTINCT tdv_q.ma_tin FROM tin_dang_do_vat tdv_q JOIN do_vats dv_q ON dv_q.ma_vat = tdv_q.ma_vat WHERE dv_q.ten ILIKE '%Sommerville%' ESCAPE '\\'))"
                                                        +
                                                        ")");
                        assertThat(combinedSearchPlan)
                                        .contains("idx_tin_dangs_public_search_trgm")
                                        .contains("BitmapOr");

                        String itemNamePlan = explainPlan(stmt,
                                        "SELECT ma_vat FROM do_vats WHERE ten ILIKE '%SE100%' ESCAPE '\\'");
                        assertThat(itemNamePlan).contains("idx_do_vats_ten_trgm");
                }
        }

        private static String explainPlan(Statement stmt, String sql) throws SQLException {
                StringBuilder plan = new StringBuilder();
                try (var rs = stmt.executeQuery("EXPLAIN " + sql)) {
                        while (rs.next()) {
                                plan.append(rs.getString(1)).append('\n');
                        }
                }
                return plan.toString();
        }

        @Test
        @DisplayName("Nâng cấp V11 -> V12 bảo toàn dữ liệu hiện có và tương thích ngược câu lệnh INSERT tối giản")
        void upgradesV11ToV12PreservingExistingRowsAndRawSqlInserts() throws Exception {
                var pg = PostgresTestContainer.getInstance();
                String schema = "v12_upgrade_" + UUID.randomUUID().toString().replace("-", "");
                var config = Flyway.configure()
                                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                                .schemas(schema)
                                .defaultSchema(schema);

                config.target("11").load().migrate();

                UUID userId = UUID.randomUUID();
                UUID publicListingId = UUID.randomUUID();
                UUID draftListingId = UUID.randomUUID();
                UUID itemId = UUID.randomUUID();

                try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                                Statement stmt = conn.createStatement()) {
                        stmt.execute("SET search_path TO " + schema);
                        stmt.execute(
                                        "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, trang_thai_tai_khoan) "
                                                        +
                                                        "VALUES ('" + userId
                                                        + "', 'v12upgrade@student.edu.vn', 'hash', 'Sinh Viên', '23520101', 'HOAT_DONG')");
                        stmt.execute(
                                        "INSERT INTO do_vats(ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai) " +
                                                        "VALUES ('" + itemId + "', '" + userId
                                                        + "', 'Đèn bàn', 'Mới 90%', ARRAY['https://img.example/1.jpg'], 'KHA_DUNG')");
                        // Mirrors raw SQL inserts in ApiSecurityTest and InventoryIntegrationTest
                        stmt.execute(
                                        "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) " +
                                                        "VALUES ('" + publicListingId + "', '" + userId
                                                        + "', 'Tin công khai cũ', 0, 'CONG_KHAI')");
                        stmt.execute(
                                        "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) " +
                                                        "VALUES ('" + draftListingId + "', '" + userId
                                                        + "', 'Tin nháp cũ', 0, 'NHAP')");

                        config.target("12").load().migrate();

                        try (var rs = stmt.executeQuery(
                                        "SELECT trang_thai, hinh_thuc, so_lan_gia_han, ma_khu_vuc, expires_at " +
                                                        "FROM tin_dangs WHERE ma_tin = '" + publicListingId + "'")) {
                                assertThat(rs.next()).isTrue();
                                assertThat(rs.getString("trang_thai")).isEqualTo("CONG_KHAI");
                                assertThat(rs.getString("hinh_thuc")).isEqualTo("BAN_LE");
                                assertThat(rs.getInt("so_lan_gia_han")).isEqualTo(0);
                                assertThat(rs.getObject("ma_khu_vuc")).isNull();
                                assertThat(rs.getObject("expires_at")).isNull();
                        }

                        // Minimal raw SQL insert must continue working after V12
                        UUID postV12ListingId = UUID.randomUUID();
                        stmt.execute(
                                        "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) " +
                                                        "VALUES ('" + postV12ListingId + "', '" + userId
                                                        + "', 'Tin mới tối giản', 0, 'CONG_KHAI')");
                }
        }

        @Test
        @DisplayName("Ràng buộc CHECK trên tin_dangs, do_vats và media_files chặn dữ liệu sai quy tắc")
        void enforcesV12DatabaseCheckConstraints() throws Exception {
                var pg = PostgresTestContainer.getInstance();
                String schema = "v12_checks_" + UUID.randomUUID().toString().replace("-", "");
                Flyway.configure()
                                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                                .schemas(schema)
                                .defaultSchema(schema)
                                .target("12")
                                .load()
                                .migrate();

                UUID userId = UUID.randomUUID();
                UUID itemId = UUID.randomUUID();
                UUID listingId = UUID.randomUUID();

                try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                                Statement stmt = conn.createStatement()) {
                        stmt.execute("SET search_path TO " + schema);
                        stmt.execute(
                                        "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, trang_thai_tai_khoan) "
                                                        +
                                                        "VALUES ('" + userId
                                                        + "', 'v12checks@student.edu.vn', 'hash', 'Sinh Viên', '23520102', 'HOAT_DONG')");
                        stmt.execute(
                                        "INSERT INTO do_vats(ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai) " +
                                                        "VALUES ('" + itemId + "', '" + userId
                                                        + "', 'Quạt mini', 'Tốt', ARRAY['https://img.example/1.jpg'], 'KHA_DUNG')");

                        // do_vats.trang_thai CHECK
                        assertThatThrownBy(() -> stmt.execute(
                                        "UPDATE do_vats SET trang_thai = 'KHONG_HOP_LE' WHERE ma_vat = '" + itemId
                                                        + "'"))
                                        .isInstanceOf(SQLException.class);

                        // Valid CHO_DUYET, HET_HAN, free BAN_COMBO, and CHO_TANG at 0 VND
                        stmt.execute(
                                        "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, hinh_thuc, trang_thai) "
                                                        +
                                                        "VALUES ('" + listingId + "', '" + userId
                                                        + "', 'Combo tặng', 0, 'BAN_COMBO', 'CHO_DUYET')");
                        stmt.execute("UPDATE tin_dangs SET trang_thai = 'HET_HAN' WHERE ma_tin = '" + listingId + "'");
                        stmt.execute("UPDATE tin_dangs SET hinh_thuc = 'CHO_TANG', gia_vnd = 0 WHERE ma_tin = '"
                                        + listingId + "'");

                        // CHO_TANG with price > 0 must fail
                        assertThatThrownBy(() -> stmt.execute(
                                        "UPDATE tin_dangs SET hinh_thuc = 'CHO_TANG', gia_vnd = 10000 WHERE ma_tin = '"
                                                        + listingId + "'"))
                                        .isInstanceOf(SQLException.class);

                        // Invalid listing status must fail
                        assertThatThrownBy(() -> stmt.execute(
                                        "UPDATE tin_dangs SET trang_thai = 'DA_XOA' WHERE ma_tin = '" + listingId
                                                        + "'"))
                                        .isInstanceOf(SQLException.class);

                        // Invalid listing type must fail
                        assertThatThrownBy(() -> stmt.execute(
                                        "UPDATE tin_dangs SET hinh_thuc = 'DAU_GIA' WHERE ma_tin = '" + listingId
                                                        + "'"))
                                        .isInstanceOf(SQLException.class);

                        // Invalid coordinates & negative renewal count must fail
                        assertThatThrownBy(() -> stmt.execute(
                                        "UPDATE tin_dangs SET vi_do = 95.0 WHERE ma_tin = '" + listingId + "'"))
                                        .isInstanceOf(SQLException.class);
                        assertThatThrownBy(() -> stmt.execute(
                                        "UPDATE tin_dangs SET kinh_do = -181.0 WHERE ma_tin = '" + listingId + "'"))
                                        .isInstanceOf(SQLException.class);
                        assertThatThrownBy(() -> stmt.execute(
                                        "UPDATE tin_dangs SET so_lan_gia_han = -1 WHERE ma_tin = '" + listingId + "'"))
                                        .isInstanceOf(SQLException.class);

                        // media_files constraints
                        String sha = "a".repeat(64);
                        assertThatThrownBy(() -> stmt.execute(
                                        "INSERT INTO media_files(owner_id, storage_key, content_type, size_bytes, sha256) "
                                                        +
                                                        "VALUES ('" + userId
                                                        + "', '2026/11/bad.svg', 'image/svg+xml', 100, '" + sha + "')"))
                                        .isInstanceOf(SQLException.class);
                        assertThatThrownBy(() -> stmt.execute(
                                        "INSERT INTO media_files(owner_id, storage_key, content_type, size_bytes, sha256) "
                                                        +
                                                        "VALUES ('" + userId
                                                        + "', '2026/11/empty.jpg', 'image/jpeg', 0, '" + sha + "')"))
                                        .isInstanceOf(SQLException.class);
                        assertThatThrownBy(() -> stmt.execute(
                                        "INSERT INTO media_files(owner_id, storage_key, content_type, size_bytes, sha256) "
                                                        +
                                                        "VALUES ('" + userId
                                                        + "', '2026/11/big.jpg', 'image/jpeg', 5242881, '" + sha
                                                        + "')"))
                                        .isInstanceOf(SQLException.class);
                }
        }
}
