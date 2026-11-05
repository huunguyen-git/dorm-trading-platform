package com.dormtrading.config;

import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Singleton Container cho PostgreSQL trong quá trình chạy Integration Tests.
 * Khởi động một lần duy nhất cho toàn bộ test suite để tối ưu thời gian thực thi.
 */
public class PostgresTestContainer extends PostgreSQLContainer<PostgresTestContainer> {

    private static final String IMAGE_VERSION = "postgres:16-alpine";
    private static PostgresTestContainer container;

    private PostgresTestContainer() {
        super(IMAGE_VERSION);
    }

    public static synchronized PostgresTestContainer getInstance() {
        if (container == null) {
            PostgresTestContainer testContainer = new PostgresTestContainer();
            testContainer.withDatabaseName("dorm_trading_test");
            testContainer.withUsername("test_user");
            testContainer.withPassword("test_password");
            testContainer.withReuse(true);
            testContainer.start();
            container = testContainer;
        }
        return container;
    }

    @Override
    public void stop() {
        // Do nothing - để JVM shutdown hook hoặc Ryuk tự dọn dẹp khi toàn bộ tests hoàn tất
    }
}
