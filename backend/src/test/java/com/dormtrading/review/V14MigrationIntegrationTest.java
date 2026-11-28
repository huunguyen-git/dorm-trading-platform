package com.dormtrading.review;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.config.PostgresTestContainer;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class V14MigrationIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private JdbcTemplate db;

    @Test
    void migrationV14CreatesReviewTablesColumnsConstraintsAndPartialUniqueIndexes() {
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
                  AND table_name IN ('danh_gia_phien_bans', 'danh_gia_bang_chungs')
                """,
                String.class
        );
        assertThat(tables).containsExactlyInAnyOrder("danh_gia_phien_bans", "danh_gia_bang_chungs");

        List<String> orderColumns = db.queryForList(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'giao_dichs'
                  AND column_name IN ('da_cong_diem_khong_danh_gia', 'thoi_diem_cong_diem_khong_danh_gia')
                """,
                String.class
        );
        assertThat(orderColumns).containsExactlyInAnyOrder(
                "da_cong_diem_khong_danh_gia",
                "thoi_diem_cong_diem_khong_danh_gia"
        );

        List<String> reviewColumns = db.queryForList(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'danh_gias'
                  AND column_name IN (
                      'phien_ban_hien_tai', 'diem_da_ap_dung', 'queue_entered_at',
                      'thoi_diem_cong_khai', 'nguoi_xet_id', 'create_idempotency_key',
                      'deleted_at', 'updated_at'
                  )
                """,
                String.class
        );
        assertThat(reviewColumns).containsExactlyInAnyOrder(
                "phien_ban_hien_tai",
                "diem_da_ap_dung",
                "queue_entered_at",
                "thoi_diem_cong_khai",
                "nguoi_xet_id",
                "create_idempotency_key",
                "deleted_at",
                "updated_at"
        );

        // V1 unconditional UNIQUE(ma_giao_dich) constraint MUST have been dropped!
        Integer unconditionalOrderUnique = db.queryForObject(
                """
                SELECT COUNT(*)
                FROM pg_constraint c
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
                WHERE c.conrelid = 'public.danh_gias'::regclass
                  AND c.contype = 'u'
                  AND array_length(c.conkey, 1) = 1
                  AND a.attname = 'ma_giao_dich'
                """,
                Integer.class
        );
        assertThat(unconditionalOrderUnique).isZero();

        List<String> indexes = db.queryForList(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND indexname IN (
                      'idx_giao_dichs_no_review_bonus_due',
                      'uq_danh_gias_active_order',
                      'idx_danh_gias_moderation_queue',
                      'idx_danh_gias_seller_public_created',
                      'idx_danh_gias_order_idemp',
                      'idx_danh_gia_phien_bans_review',
                      'idx_danh_gia_bang_chungs_review',
                      'idx_danh_gia_bang_chungs_order_uploader',
                      'idx_danh_gia_bang_chungs_uploader',
                      'idx_danh_gia_bang_chungs_draft_created',
                      'idx_khieu_nais_danh_gia_trang_thai',
                      'idx_quyet_dinhs_khieu_nai'
                  )
                """,
                String.class
        );
        assertThat(indexes).containsExactlyInAnyOrder(
                "idx_giao_dichs_no_review_bonus_due",
                "uq_danh_gias_active_order",
                "idx_danh_gias_moderation_queue",
                "idx_danh_gias_seller_public_created",
                "idx_danh_gias_order_idemp",
                "idx_danh_gia_phien_bans_review",
                "idx_danh_gia_bang_chungs_review",
                "idx_danh_gia_bang_chungs_order_uploader",
                "idx_danh_gia_bang_chungs_uploader",
                "idx_danh_gia_bang_chungs_draft_created",
                "idx_khieu_nais_danh_gia_trang_thai",
                "idx_quyet_dinhs_khieu_nai"
        );

        List<String> constraints = db.queryForList(
                """
                SELECT conname
                FROM pg_constraint
                WHERE connamespace = 'public'::regnamespace
                  AND conname IN (
                      'chk_danh_gias_trang_thai',
                      'chk_danh_gias_distinct_parties',
                      'chk_danh_gias_phien_ban_hien_tai',
                      'uq_danh_gia_phien_ban'
                  )
                """,
                String.class
        );
        assertThat(constraints).containsExactlyInAnyOrder(
                "chk_danh_gias_trang_thai",
                "chk_danh_gias_distinct_parties",
                "chk_danh_gias_phien_ban_hien_tai",
                "uq_danh_gia_phien_ban"
        );
    }

    @Test
    void cleanMigrateV1ThroughV14AndUpgradeV13ToV14PreserveDataAndEnforcePartialUnique() throws Exception {
        var pg = PostgresTestContainer.getInstance();

        String cleanSchema = "v14_clean_" + UUID.randomUUID().toString().replace("-", "");
        var cleanResult = Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(cleanSchema)
                .defaultSchema(cleanSchema)
                .target("14")
                .load()
                .migrate();
        assertThat(cleanResult.migrationsExecuted).isEqualTo(14);

        String upgradeSchema = "v14_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var upgradeConfig = Flyway.configure()
                .dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(upgradeSchema)
                .defaultSchema(upgradeSchema);
        var v13Result = upgradeConfig.target("13").load().migrate();
        assertThat(v13Result.migrationsExecuted).isEqualTo(13);

        UUID sellerId = UUID.randomUUID();
        UUID buyerId = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        UUID orderAcceptedId = UUID.randomUUID();
        UUID orderPendingId = UUID.randomUUID();
        UUID existingAcceptedReviewId = UUID.randomUUID();
        UUID existingPendingReviewId = UUID.randomUUID();

        try (Connection conn = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                Statement stmt = conn.createStatement()) {
            stmt.execute("SET search_path TO " + upgradeSchema);
            stmt.execute(
                    "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, trang_thai_tai_khoan) "
                            + "VALUES ('" + sellerId + "', 'v14seller@student.edu.vn', 'hash', 'Seller V14', '24521001', 'HOAT_DONG'), "
                            + "('" + buyerId + "', 'v14buyer@student.edu.vn', 'hash', 'Buyer V14', '24521002', 'HOAT_DONG')"
            );
            stmt.execute(
                    "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) "
                            + "VALUES ('" + listingId + "', '" + sellerId + "', 'Tin V13', 50000, 'KET_THUC')"
            );
            stmt.execute(
                    "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai, thoi_diem_hoan_tat) "
                            + "VALUES ('" + orderAcceptedId + "', '" + listingId + "', '" + sellerId + "', '" + buyerId + "', 50000, 'HOAN_TAT', NOW()), "
                            + "('" + orderPendingId + "', '" + listingId + "', '" + sellerId + "', '" + buyerId + "', 50000, 'HOAN_TAT', NOW())"
            );
            stmt.execute(
                    "INSERT INTO danh_gias(ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id, so_sao, nhan_xet, trang_thai) "
                            + "VALUES ('" + existingAcceptedReviewId + "', '" + orderAcceptedId + "', '" + buyerId + "', '" + sellerId + "', 5, 'Rất tốt', 'CHAP_NHAN'), "
                            + "('" + existingPendingReviewId + "', '" + orderPendingId + "', '" + buyerId + "', '" + sellerId + "', 2, 'Giao thiếu phụ kiện', 'CHO_XET')"
            );

            var v14Upgrade = upgradeConfig.target("14").load().migrate();
            assertThat(v14Upgrade.migrationsExecuted).isEqualTo(1);

            // Verify backfill of thoi_diem_cong_khai, queue_entered_at, and v1 rows in danh_gia_phien_bans
            try (var rs = stmt.executeQuery(
                    "SELECT trang_thai, phien_ban_hien_tai, thoi_diem_cong_khai, queue_entered_at "
                            + "FROM danh_gias WHERE ma_danh_gia = '" + existingAcceptedReviewId + "'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("phien_ban_hien_tai")).isEqualTo(1);
                assertThat(rs.getTimestamp("thoi_diem_cong_khai")).isNotNull();
                assertThat(rs.getTimestamp("queue_entered_at")).isNull();
            }
            try (var rs = stmt.executeQuery(
                    "SELECT trang_thai, queue_entered_at FROM danh_gias WHERE ma_danh_gia = '" + existingPendingReviewId + "'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getTimestamp("queue_entered_at")).isNotNull();
            }
            try (var rs = stmt.executeQuery("SELECT COUNT(*) FROM danh_gia_phien_bans")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt(1)).isEqualTo(2);
            }

            // Prove partial unique index behavior (UC-32):
            // Soft-delete existing review -> insert new active review for SAME order succeeds -> second active review fails!
            stmt.execute("UPDATE danh_gias SET trang_thai = 'DA_XOA', deleted_at = NOW() WHERE ma_danh_gia = '" + existingAcceptedReviewId + "'");
            UUID reReviewId = UUID.randomUUID();
            stmt.execute(
                    "INSERT INTO danh_gias(ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id, so_sao, nhan_xet, trang_thai) "
                            + "VALUES ('" + reReviewId + "', '" + orderAcceptedId + "', '" + buyerId + "', '" + sellerId + "', 4, 'Đánh giá lại', 'CHAP_NHAN')"
            );

            UUID duplicateActiveId = UUID.randomUUID();
            assertThatThrownBy(() -> stmt.execute(
                    "INSERT INTO danh_gias(ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id, so_sao, nhan_xet, trang_thai) "
                            + "VALUES ('" + duplicateActiveId + "', '" + orderAcceptedId + "', '" + buyerId + "', '" + sellerId + "', 5, 'Trùng lặp', 'CHAP_NHAN')"
            )).isInstanceOf(SQLException.class);
        }
    }
}
