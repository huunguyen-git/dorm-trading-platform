package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Kiểm thử Tích hợp Flyway Migrations & CSDL")
class FlywayMigrationIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("Toàn bộ các bảng cốt lõi theo OOAD phải được tạo thành công bởi Flyway")
    void shouldCreateAllCoreTablesSuccessfully() {
        // Kiểm tra sự tồn tại của 13 bảng cốt lõi
        String[] coreTables = {
            "thanh_viens",
            "vai_tro_quan_tri",
            "danh_mucs",
            "do_vats",
            "tin_dangs",
            "tin_dang_do_vat",
            "hoi_thoais",
            "tin_nhans",
            "giao_dichs",
            "ma_xac_nhan_otp",
            "danh_gias",
            "khieu_nais",
            "bao_caos",
            "thang_phats",
            "quyet_dinhs"
        };

        for (String table : coreTables) {
            Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?",
                Integer.class,
                table
            );
            assertThat(count)
                .withFailMessage("Bảng %s chưa được tạo bởi Flyway!", table)
                .isEqualTo(1);
        }
    }

    @Test
    @DisplayName("Dữ liệu hạt giống ban đầu (Danh mục & Thang phạt) phải được nạp đầy đủ")
    void shouldSeedInitialData() {
        Integer danhMucCount = jdbcTemplate.queryForObject("SELECT count(*) FROM danh_mucs", Integer.class);
        assertThat(danhMucCount).isGreaterThanOrEqualTo(7);

        Integer thangPhatCount = jdbcTemplate.queryForObject("SELECT count(*) FROM thang_phats", Integer.class);
        assertThat(thangPhatCount).isGreaterThanOrEqualTo(6);
    }
}
