package com.dormtrading.order.dispute;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.config.PostgresTestContainer;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class V14MigrationIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private JdbcTemplate db;

    @Test
    void migrationV14CreatesAllDisputeTablesColumnsConstraintsAndIndexes() {
        Boolean v14Applied = db.queryForObject(
                "SELECT success FROM flyway_schema_history WHERE version = '14'",
                Boolean.class
        );
        assertThat(v14Applied).isTrue();

        List<String> tables = db.queryForList(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN (
                      'anh_ban_giao_giao_dichs',
                      'yeu_cau_huy_giao_dichs',
                      'lich_su_trang_thai_giao_dich',
                      'quyet_dinh_giao_dichs',
                      'yeu_cau_bo_sung_giao_dichs',
                      'phan_hoi_bo_sung_giao_dichs',
                      'bang_chung_bo_sung_giao_dichs'
                  )
                """,
                String.class
        );
        assertThat(tables).containsExactlyInAnyOrder(
                "anh_ban_giao_giao_dichs",
                "yeu_cau_huy_giao_dichs",
                "lich_su_trang_thai_giao_dich",
                "quyet_dinh_giao_dichs",
                "yeu_cau_bo_sung_giao_dichs",
                "phan_hoi_bo_sung_giao_dichs",
                "bang_chung_bo_sung_giao_dichs"
        );

        List<String> orderColumns = db.queryForList(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'giao_dichs'
                  AND column_name IN (
                      'ghi_chu_ban_giao', 'ly_do_cho_xu_ly', 'thoi_diem_chuyen_xu_ly',
                      'han_phan_hoi_kdv', 'han_danh_gia_den'
                  )
                """,
                String.class
        );
        assertThat(orderColumns).containsExactlyInAnyOrder(
                "ghi_chu_ban_giao",
                "ly_do_cho_xu_ly",
                "thoi_diem_chuyen_xu_ly",
                "han_phan_hoi_kdv",
                "han_danh_gia_den"
        );

        String maOtpNullable = db.queryForObject(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'ma_xac_nhan_otp' AND column_name = 'ma_otp'
                """,
                String.class
        );
        assertThat(maOtpNullable).isEqualTo("YES");

        List<String> indexes = db.queryForList(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND indexname IN (
                      'idx_giao_dichs_overdue_confirm',
                      'idx_giao_dichs_dispute_queue',
                      'uq_otp_active_per_order',
                      'uq_yc_bo_sung_open_per_order'
                  )
                """,
                String.class
        );
        assertThat(indexes).containsExactlyInAnyOrder(
                "idx_giao_dichs_overdue_confirm",
                "idx_giao_dichs_dispute_queue",
                "uq_otp_active_per_order",
                "uq_yc_bo_sung_open_per_order"
        );

        List<String> constraints = db.queryForList(
                """
                SELECT conname
                FROM pg_constraint
                WHERE connamespace = 'public'::regnamespace
                  AND conname IN (
                      'uq_quyet_dinh_gd',
                      'chk_quyet_dinh_gd_ket_luan',
                      'chk_quyet_dinh_gd_can_cu',
                      'chk_otp_invalidation_reason',
                      'chk_nhat_ky_kiem_duyet_action_type'
                  )
                """,
                String.class
        );
        assertThat(constraints).containsExactlyInAnyOrder(
                "uq_quyet_dinh_gd",
                "chk_quyet_dinh_gd_ket_luan",
                "chk_quyet_dinh_gd_can_cu",
                "chk_otp_invalidation_reason",
                "chk_nhat_ky_kiem_duyet_action_type"
        );
    }

    @Test
    void freshV1ToV14UpgradeV13ToV14AndIdempotentReapplicationOnP302PreExistingObjectsSucceed() throws Exception {
        var pg = PostgresTestContainer.getInstance();

        // 1. Fresh V1 -> V14
        String cleanSchema = "v14_clean_" + UUID.randomUUID().toString().replace("-", "");
        var cleanResult = Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(cleanSchema)
                .defaultSchema(cleanSchema)
                .target("14")
                .load()
                .migrate();
        assertThat(cleanResult.migrationsExecuted).isEqualTo(14);

        // 2. Upgrade V13 -> V14 preserving existing rows & verifying idempotency with P3-02 constraints
        String upgradeSchema = "v14_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var upgradeConfig = Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(upgradeSchema)
                .defaultSchema(upgradeSchema);
        var v13Result = upgradeConfig.target("13").load().migrate();
        assertThat(v13Result.migrationsExecuted).isEqualTo(13);

        UUID sellerId = UUID.randomUUID();
        UUID buyerId = UUID.randomUUID();
        UUID modId = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID req1Id = UUID.randomUUID();

        try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                Statement stmt = conn.createStatement()) {
            stmt.execute("SET search_path TO " + upgradeSchema);

            // Simulate P3-02 PR #38 already having added 4-value chk_otp_invalidation_reason before V14
            stmt.execute("""
                    ALTER TABLE ma_xac_nhan_otp ADD COLUMN IF NOT EXISTS ly_do_vo_hieu VARCHAR(40);
                    ALTER TABLE ma_xac_nhan_otp ADD CONSTRAINT chk_otp_invalidation_reason
                      CHECK (ly_do_vo_hieu IS NULL OR ly_do_vo_hieu IN ('CAP_LAI', 'VUOT_SO_LAN_SAI', 'DA_HUY_GIAO_DICH', 'HET_HAN'));
                    """);

            stmt.execute(
                    "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, trang_thai_tai_khoan) VALUES "
                            + "('" + sellerId + "', 'v14s@student.edu.vn', 'hash', 'Seller', '23529001', 'HOAT_DONG'), "
                            + "('" + buyerId + "', 'v14b@student.edu.vn', 'hash', 'Buyer', '23529002', 'HOAT_DONG'), "
                            + "('" + modId + "', 'v14m@student.edu.vn', 'hash', 'Mod', '23529003', 'HOAT_DONG')"
            );
            stmt.execute(
                    "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) "
                            + "VALUES ('" + listingId + "', '" + sellerId + "', 'Tin V13', 80000, 'GIU_CHO')"
            );
            stmt.execute(
                    "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai) "
                            + "VALUES ('" + orderId + "', '" + listingId + "', '" + sellerId + "', '" + buyerId + "', 80000, 'CHO_XU_LY')"
            );

            var v14Upgrade = upgradeConfig.target("14").load().migrate();
            assertThat(v14Upgrade.migrationsExecuted).isEqualTo(1);

            // Re-execute entire V14 script directly to prove 100% idempotency!
            String v14Sql = new ClassPathResource("db/migration/V14__dispute_resolution_and_evidence.sql")
                    .getContentAsString(StandardCharsets.UTF_8);
            stmt.execute(v14Sql);

            // Verify QUYET_DINH_KIEM_DUYET is allowed on ma_xac_nhan_otp after upgrade
            stmt.execute(
                    "INSERT INTO ma_xac_nhan_otp(ma_giao_dich, ma_otp, thoi_diem_phat, thoi_diem_het_han, bi_vo_hieu, ly_do_vo_hieu) "
                            + "VALUES ('" + orderId + "', NULL, NOW(), NOW() + INTERVAL '10 minutes', TRUE, 'QUYET_DINH_KIEM_DUYET')"
            );

            // Verify quyet_dinh_giao_dichs checks & uq_quyet_dinh_gd
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO quyet_dinh_giao_dichs(ma_giao_dich, nguoi_quyet_dinh_id, ket_luan, can_cu) "
                            + "VALUES ('" + orderId + "', '" + modId + "', 'HOAN_TAT', 'ngan')"))
                    .isInstanceOf(SQLException.class);

            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO quyet_dinh_giao_dichs(ma_giao_dich, nguoi_quyet_dinh_id, ket_luan, can_cu) "
                            + "VALUES ('" + orderId + "', '" + modId + "', 'INVALID', 'Can cu du muoi ky tu')"))
                    .isInstanceOf(SQLException.class);

            stmt.execute(
                    "INSERT INTO quyet_dinh_giao_dichs(ma_giao_dich, nguoi_quyet_dinh_id, ket_luan, can_cu) "
                            + "VALUES ('" + orderId + "', '" + modId + "', 'HOAN_TAT', 'Can cu xac nhan hoan tat hop le')"
            );
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO quyet_dinh_giao_dichs(ma_giao_dich, nguoi_quyet_dinh_id, ket_luan, can_cu) "
                            + "VALUES ('" + orderId + "', '" + modId + "', 'HUY', 'Quyet dinh thu hai bi chan boi UNIQUE')"))
                    .isInstanceOf(SQLException.class);

            // Verify uq_yc_bo_sung_open_per_order & uq_phan_hoi_yeu_cau_role
            stmt.execute(
                    "INSERT INTO yeu_cau_bo_sung_giao_dichs(id, ma_giao_dich, nguoi_yeu_cau_id, ben_duoc_yeu_cau, noi_dung, han_bo_sung, trang_thai) "
                            + "VALUES ('" + req1Id + "', '" + orderId + "', '" + modId + "', 'BOTH', 'Bo sung anh chup', NOW() + INTERVAL '48 hours', 'CHO_BO_SUNG')"
            );
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO yeu_cau_bo_sung_giao_dichs(ma_giao_dich, nguoi_yeu_cau_id, ben_duoc_yeu_cau, noi_dung, han_bo_sung, trang_thai) "
                            + "VALUES ('" + orderId + "', '" + modId + "', 'BUYER', 'Yeu cau trung', NOW() + INTERVAL '48 hours', 'CHO_BO_SUNG')"))
                    .isInstanceOf(SQLException.class);

            UUID respId = UUID.randomUUID();
            stmt.execute(
                    "INSERT INTO phan_hoi_bo_sung_giao_dichs(id, yeu_cau_id, ma_giao_dich, nguoi_gui_id, vai_tro_gui, noi_dung) "
                            + "VALUES ('" + respId + "', '" + req1Id + "', '" + orderId + "', '" + buyerId + "', 'BUYER', 'Da bo sung')"
            );
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO phan_hoi_bo_sung_giao_dichs(yeu_cau_id, ma_giao_dich, nguoi_gui_id, vai_tro_gui, noi_dung) "
                            + "VALUES ('" + req1Id + "', '" + orderId + "', '" + buyerId + "', 'BUYER', 'Gui trung lan 2')"))
                    .isInstanceOf(SQLException.class);

            // Verify bang_chung_bo_sung_giao_dichs content_type & size checks
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO bang_chung_bo_sung_giao_dichs(phan_hoi_id, ma_giao_dich, nguoi_tai_len_id, storage_key, content_type, size_bytes, sha256) "
                            + "VALUES ('" + respId + "', '" + orderId + "', '" + buyerId + "', 'k/1.pdf', 'application/pdf', 1000, repeat('a', 64))"))
                    .isInstanceOf(SQLException.class);

            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO bang_chung_bo_sung_giao_dichs(phan_hoi_id, ma_giao_dich, nguoi_tai_len_id, storage_key, content_type, size_bytes, sha256) "
                            + "VALUES ('" + respId + "', '" + orderId + "', '" + buyerId + "', 'k/2.png', 'image/png', 5242881, repeat('b', 64))"))
                    .isInstanceOf(SQLException.class);

            // Verify nhat_ky_kiem_duyet allows DISPUTE_DECIDED_COMPLETE
            stmt.execute(
                    "INSERT INTO nhat_ky_kiem_duyet(target_user_id, actor_user_id, action_type, reason) "
                            + "VALUES ('" + sellerId + "', '" + modId + "', 'DISPUTE_DECIDED_COMPLETE', 'Kiem duyet tranh chap')"
            );
        }
    }
}
