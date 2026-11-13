package com.dormtrading;

import com.dormtrading.config.PostgresTestContainer;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import java.sql.DriverManager;
import static org.assertj.core.api.Assertions.*;

class AuthMigrationTest {
    @Test void upgradesV2WithoutVerifyingExistingUsers() throws Exception {
        var pg=PostgresTestContainer.getInstance();
        String schema="upgrade_"+java.util.UUID.randomUUID().toString().replace("-","");
        var config=Flyway.configure().dataSource(pg.getJdbcUrl(),pg.getUsername(),pg.getPassword()).schemas(schema).defaultSchema(schema);
        config.target("2").load().migrate();
        try(var connection=DriverManager.getConnection(pg.getJdbcUrl(),pg.getUsername(),pg.getPassword());var sql=connection.createStatement()) {
            sql.execute("set search_path to " + schema);
            sql.execute("insert into thanh_viens(email,mat_khau_hash,ho_ten,mssv,trang_thai_tai_khoan) values ('legacy@uni.edu.vn','legacy','Legacy','LEGACY','HOAT_DONG')");
            config.target("latest").load().migrate();
            try(var result=sql.executeQuery("select email_verified,profile_approved from thanh_viens where email='legacy@uni.edu.vn'")) {
                assertThat(result.next()).isTrue(); assertThat(result.getBoolean(1)).isFalse(); assertThat(result.getBoolean(2)).isFalse();
            }
        }
    }
}
