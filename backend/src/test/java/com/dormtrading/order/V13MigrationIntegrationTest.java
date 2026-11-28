package com.dormtrading.order;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.config.PostgresTestContainer;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class V13MigrationIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private JdbcTemplate db;

    @Test
    void migrationV13CreatesOrderTablesColumnsConstraintsAndPartialUniqueIndexes() {
        Boolean v13Applied = db.queryForObject(
                "SELECT success FROM flyway_schema_history WHERE version = '13'",
                Boolean.class
        );
        assertThat(v13Applied).isTrue();
        List<String> tables = db.queryForList(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN ('giao_dich_do_vat', 'lich_hen_giao_dichs', 'thong_baos')
                """,
                String.class
        );
        assertThat(tables).containsExactlyInAnyOrder("giao_dich_do_vat", "lich_hen_giao_dichs", "thong_baos");

        List<String> orderColumns = db.queryForList(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'giao_dichs'
                  AND column_name IN (
                      'ghi_chu', 'thoi_gian_hen_du_kien', 'dia_diem_hen_du_kien',
                      'lich_hen_da_xac_nhan', 'thoi_diem_bat_dau_giao',
                      'nguoi_huy_id', 'thoi_diem_huy', 'updated_at'
                  )
                """,
                String.class
        );
        assertThat(orderColumns).containsExactlyInAnyOrder(
                "ghi_chu",
                "thoi_gian_hen_du_kien",
                "dia_diem_hen_du_kien",
                "lich_hen_da_xac_nhan",
                "thoi_diem_bat_dau_giao",
                "nguoi_huy_id",
                "thoi_diem_huy",
                "updated_at"
        );

        List<String> orderItemColumns = db.queryForList(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'giao_dich_do_vat'
                  AND column_name IN (
                      'id', 'ma_giao_dich', 'ma_vat', 'ten_vat_snapshot', 'tinh_trang_snapshot', 'giu_hieu_luc'
                  )
                """,
                String.class
        );
        assertThat(orderItemColumns).containsExactlyInAnyOrder(
                "id",
                "ma_giao_dich",
                "ma_vat",
                "ten_vat_snapshot",
                "tinh_trang_snapshot",
                "giu_hieu_luc"
        );

        List<String> indexes = db.queryForList(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND indexname IN (
                      'uq_giao_dichs_active_listing',
                      'uq_giao_dichs_pending_buyer_listing',
                      'uq_giao_dich_do_vat_order_item',
                      'uq_giao_dich_do_vat_active_item',
                      'idx_giao_dich_do_vat_ma_giao_dich',
                      'uq_lich_hen_pending_per_order',
                      'idx_thong_baos_recipient'
                  )
                """,
                String.class
        );
        assertThat(indexes).containsExactlyInAnyOrder(
                "uq_giao_dichs_active_listing",
                "uq_giao_dichs_pending_buyer_listing",
                "uq_giao_dich_do_vat_order_item",
                "uq_giao_dich_do_vat_active_item",
                "idx_giao_dich_do_vat_ma_giao_dich",
                "uq_lich_hen_pending_per_order",
                "idx_thong_baos_recipient"
        );

        List<String> constraints = db.queryForList(
                """
                SELECT conname
                FROM pg_constraint
                WHERE connamespace = 'public'::regnamespace
                  AND conname IN (
                      'chk_giao_dichs_trang_thai',
                      'chk_giao_dichs_distinct_parties',
                      'chk_lich_hen_trang_thai',
                      'chk_lich_hen_distinct_responder'
                  )
                """,
                String.class
        );
        assertThat(constraints).containsExactlyInAnyOrder(
                "chk_giao_dichs_trang_thai",
                "chk_giao_dichs_distinct_parties",
                "chk_lich_hen_trang_thai",
                "chk_lich_hen_distinct_responder"
        );

        String itemFkDeleteRule = db.queryForObject(
                """
                SELECT rc.delete_rule
                FROM information_schema.referential_constraints rc
                JOIN information_schema.key_column_usage kcu
                  ON kcu.constraint_name = rc.constraint_name
                 AND kcu.constraint_schema = rc.constraint_schema
                WHERE kcu.table_schema = 'public'
                  AND kcu.table_name = 'giao_dich_do_vat'
                  AND kcu.column_name = 'ma_vat'
                """,
                String.class
        );
        assertThat(itemFkDeleteRule).isEqualTo("SET NULL");
    }

    @Test
    void cleanMigrateV1ThroughV13AndUpgradeV12ToV13PreserveExistingData() throws Exception {
        var pg = PostgresTestContainer.getInstance();

        String cleanSchema = "v13_clean_" + UUID.randomUUID().toString().replace("-", "");
        var cleanResult = Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(cleanSchema)
                .defaultSchema(cleanSchema)
                .target("13")
                .load()
                .migrate();
        assertThat(cleanResult.migrationsExecuted).isEqualTo(13);

        String upgradeSchema = "v13_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var upgradeConfig = Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(upgradeSchema)
                .defaultSchema(upgradeSchema);
        var v12Result = upgradeConfig.target("12").load().migrate();
        assertThat(v12Result.migrationsExecuted).isEqualTo(12);

        UUID sellerId = UUID.randomUUID();
        UUID buyerId = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();

        try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             Statement stmt = conn.createStatement()) {
            stmt.execute("SET search_path TO " + upgradeSchema);
            stmt.execute(
                    "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, trang_thai_tai_khoan) "
                            + "VALUES ('" + sellerId + "', 'v13seller@student.edu.vn', 'hash', 'Seller', '23521001', 'HOAT_DONG'), "
                            + "('" + buyerId + "', 'v13buyer@student.edu.vn', 'hash', 'Buyer', '23521002', 'HOAT_DONG')"
            );
            stmt.execute(
                    "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) "
                            + "VALUES ('" + listingId + "', '" + sellerId + "', 'Tin V12', 50000, 'CONG_KHAI')"
            );
            stmt.execute(
                    "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai) "
                            + "VALUES ('" + orderId + "', '" + listingId + "', '" + sellerId + "', '" + buyerId + "', 50000, 'YEU_CAU')"
            );

            var v13Upgrade = upgradeConfig.target("13").load().migrate();
            assertThat(v13Upgrade.migrationsExecuted).isEqualTo(1);

            try (var rs = stmt.executeQuery(
                    "SELECT trang_thai, lich_hen_da_xac_nhan, thoi_diem_bat_dau_giao "
                            + "FROM giao_dichs WHERE ma_giao_dich = '" + orderId + "'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString("trang_thai")).isEqualTo("YEU_CAU");
                assertThat(rs.getBoolean("lich_hen_da_xac_nhan")).isFalse();
                assertThat(rs.getObject("thoi_diem_bat_dau_giao")).isNull();
            }
        }
    }
}
