package com.campus;

import com.campus.notification.NotificationService;
import com.campus.notification.api.NotificationDtos.NotificationView;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class NotificationIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired NotificationService notifications;

    private UUID member() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into members(id,email,display_name,password_hash) values (?,?,'Synthetic fixture','not-a-login-hash')",
                id, id + "@example.edu.vn");
        return id;
    }

    private UUID notification(UUID recipient, String eventKey, Instant createdAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into notifications(id,recipient_id,event_key,kind,message,created_at)
                values (?,?,?,'TEST','Thông báo kiểm thử',?)
                """, id, recipient, eventKey, Timestamp.from(createdAt));
        return id;
    }

    @Test void inboxIsRecipientScopedOrderedPaginatedAndNeverCached() throws Exception {
        UUID owner = member(), stranger = member();
        UUID older = notification(owner, "older", Instant.parse("2026-10-01T00:00:00Z"));
        UUID newer = notification(owner, "newer", Instant.parse("2026-10-02T00:00:00Z"));
        notification(stranger, "private", Instant.parse("2026-10-03T00:00:00Z"));
        mvc.perform(get("/api/v1/notifications?page=0&size=1").with(user(owner.toString()).roles("MEMBER")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(newer.toString()));
        mvc.perform(get("/api/v1/notifications?page=1&size=1").with(user(owner.toString()).roles("MEMBER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(older.toString()));
    }

    @Test void readIsOwnerScopedCsrfProtectedAndIdempotent() throws Exception {
        UUID owner = member(), outsider = member();
        UUID id = notification(owner, "readable", Instant.now()), key = UUID.randomUUID();
        mvc.perform(post("/api/v1/notifications/" + id + "/read")
                        .header("Idempotency-Key", key).with(user(owner.toString()).roles("MEMBER")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/notifications/" + id + "/read")
                        .header("Idempotency-Key", key).with(user(outsider.toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isNotFound());
        String first = mvc.perform(post("/api/v1/notifications/" + id + "/read")
                        .header("Idempotency-Key", key).with(user(owner.toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.readAt").exists())
                .andReturn().getResponse().getContentAsString();
        String replay = mvc.perform(post("/api/v1/notifications/" + id + "/read")
                        .header("Idempotency-Key", key).with(user(owner.toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(replay).isEqualTo(first);
    }

    @Test void invalidPaginationAndAnonymousAccessReturnDocumented4xx() throws Exception {
        UUID owner = member();
        mvc.perform(get("/api/v1/notifications")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/notifications?page=-1").with(user(owner.toString()).roles("MEMBER")))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/notifications?size=101").with(user(owner.toString()).roles("MEMBER")))
                .andExpect(status().isBadRequest());
    }

    @Test void concurrentReadsPreserveOneReadTimestamp() throws Exception {
        UUID owner = member(), id = notification(owner, "concurrent", Instant.now());
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<NotificationView>> results = List.of(
                    executor.submit(() -> readAfterStart(ready, start, owner, id)),
                    executor.submit(() -> readAfterStart(ready, start, owner, id)));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            NotificationView first = results.get(0).get(10, TimeUnit.SECONDS);
            NotificationView second = results.get(1).get(10, TimeUnit.SECONDS);
            assertThat(first.readAt()).isNotNull().isEqualTo(second.readAt());
        }
        assertThat(jdbc.queryForObject("select count(*) from command_receipts where resource_id=?", Long.class, id)).isEqualTo(2);
    }

    private NotificationView readAfterStart(CountDownLatch ready, CountDownLatch start, UUID owner, UUID id) throws Exception {
        ready.countDown();
        if (!start.await(5, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Concurrent read did not start");
        }
        return notifications.markRead(owner, id, UUID.randomUUID());
    }
}