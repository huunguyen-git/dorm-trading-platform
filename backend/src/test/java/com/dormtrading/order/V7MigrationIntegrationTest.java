package com.dormtrading.order;

import com.dormtrading.common.BaseIntegrationTest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class V7MigrationIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private JdbcTemplate db;

    @Test
    void migrationV7CreatesOrderTablesColumnsConstraintsAndPartialUniqueIndexes() {
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

        List<String> indexes = db.queryForList(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND indexname IN (
                      'uq_giao_dichs_active_listing',
                      'uq_giao_dichs_pending_buyer_listing',
                      'uq_giao_dich_do_vat_active_item',
                      'uq_lich_hen_pending_per_order',
                      'idx_thong_baos_recipient'
                  )
                """,
                String.class
        );
        assertThat(indexes).containsExactlyInAnyOrder(
                "uq_giao_dichs_active_listing",
                "uq_giao_dichs_pending_buyer_listing",
                "uq_giao_dich_do_vat_active_item",
                "uq_lich_hen_pending_per_order",
                "idx_thong_baos_recipient"
        );

        List<String> constraints = db.queryForList(
                """
                SELECT conname
                FROM pg_constraint
                WHERE connamespace = 'public'::regnamespace
                  AND conname IN ('chk_giao_dichs_trang_thai', 'chk_giao_dichs_distinct_parties', 'chk_lich_hen_trang_thai')
                """,
                String.class
        );
        assertThat(constraints).containsExactlyInAnyOrder(
                "chk_giao_dichs_trang_thai",
                "chk_giao_dichs_distinct_parties",
                "chk_lich_hen_trang_thai"
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
        assertThat(itemFkDeleteRule).isEqualTo("CASCADE");
    }
}
