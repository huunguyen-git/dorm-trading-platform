package com.campus;

import com.campus.listing.Category;
import com.campus.listing.CategoryRepository;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class BackendIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired CategoryRepository categories;
    @Autowired Flyway flyway;
    @Autowired JdbcTemplate jdbc;

    @Test void statusIsPublicWithoutLeakingSecrets() throws Exception {
        mvc.perform(get("/api/v1/system/status"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.application").value("dorm-trading-platform"))
            .andExpect(jsonPath("$.apiVersion").value("v1"));
    }
    @Test void healthIncludesWorkingDatabaseButHidesDetails() throws Exception {
        mvc.perform(get("/actuator/health"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"))
            .andExpect(jsonPath("$.components").doesNotExist());
    }
    @Test void anonymousCannotAccessFutureBusinessEndpoints() throws Exception {
        mvc.perform(get("/api/v1/members/me")).andExpect(status().isUnauthorized());
    }
    @Test void unsafeRequestsRequireCsrf() throws Exception {
        mvc.perform(post("/api/v1/listings")).andExpect(status().isForbidden());
    }
    @Test void migrationsSeedReferenceDataAndCanRunAgainSafely() {
        assertThat(categories.findAll()).extracting(Category::getCode)
            .containsExactlyInAnyOrder("TEXTBOOKS", "APPLIANCES", "FURNITURE");
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(categories.count()).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where success = true", Long.class)).isEqualTo(1);
    }
}
