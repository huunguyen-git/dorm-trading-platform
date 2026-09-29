package com.campus;

import com.campus.moderation.api.ModerationDtos.ReportView;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Slice 1: REPORT media upload/read + report submit/read, with Vietnamese error codes. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class Slice1ModerationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper mapper;

    static final byte[] PNG = new byte[] {
        (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x00, 0x01, 0x02, 0x03 };

    UUID member() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into members(id,email,display_name,password_hash) values (?,?,'Synthetic fixture','not-a-login-hash')",
            id, id + "@example.edu.vn");
        return id;
    }

    void moderator(UUID id) {
        jdbc.update("insert into member_roles(member_id, role) values (?, 'MODERATOR')", id);
    }

    String upload(UUID owner, String purpose, byte[] bytes, UUID key) throws Exception {
        var result = mvc.perform(multipart("/api/v1/media")
                .file(new MockMultipartFile("file", "evidence.png", "image/png", bytes))
                .param("purpose", purpose)
                .header("Idempotency-Key", key.toString())
                .with(user(owner.toString()).roles("MEMBER"))
                .with(csrf()))
            .andExpect(status().isCreated())
            .andReturn();
        JsonNode tree = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(tree.get("purpose").asString()).isEqualTo(purpose);
        return tree.get("id").asString();
    }

    String submitReport(UUID reporter, UUID reported, String evidenceId, UUID key) throws Exception {
        String body = """
            {"reportedMemberId":"%s","description":"Hàng sai mô tả, ảnh khác thực tế","evidenceIds":["%s"]}
            """.formatted(reported, evidenceId);
        var result = mvc.perform(post("/api/v1/reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .header("Idempotency-Key", key.toString())
                .with(user(reporter.toString()).roles("MEMBER"))
                .with(csrf()))
            .andExpect(status().isCreated())
            .andReturn();
        JsonNode tree = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(tree.get("state").asString()).isEqualTo(ReportView.class.getSimpleName().isEmpty() ? "" : "SUBMITTED");
        return tree.get("id").asString();
    }

    @Test void uploadAndReadReportEvidenceAsOwner() throws Exception {
        UUID owner = member();
        String mediaId = upload(owner, "REPORT", PNG, UUID.randomUUID());
        mvc.perform(get("/api/v1/media/" + mediaId)
                .with(user(owner.toString()).roles("MEMBER")))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test void strangerCannotReadEvidenceAndGetsConcealed404() throws Exception {
        UUID owner = member();
        String mediaId = upload(owner, "REPORT", PNG, UUID.randomUUID());
        mvc.perform(get("/api/v1/media/" + mediaId)
                .with(user(member().toString()).roles("MEMBER")))
            .andExpect(status().isNotFound());
    }

    @Test void moderatorCanReadEvidence() throws Exception {
        UUID owner = member();
        UUID mod = member();
        moderator(mod);
        String mediaId = upload(owner, "REPORT", PNG, UUID.randomUUID());
        mvc.perform(get("/api/v1/media/" + mediaId)
                .with(user(mod.toString()).roles("MODERATOR")))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test void nonReportPurposeIsRefused() throws Exception {
        UUID owner = member();
        mvc.perform(multipart("/api/v1/media")
                .file(new MockMultipartFile("file", "a.png", "image/png", PNG))
                .param("purpose", "LISTING")
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .with(user(owner.toString()).roles("MEMBER"))
                .with(csrf()))
            .andExpect(status().isBadRequest());
    }

    @Test void invalidBytesAreRejectedWith415() throws Exception {
        UUID owner = member();
        mvc.perform(multipart("/api/v1/media")
                .file(new MockMultipartFile("file", "a.bin", "application/octet-stream", new byte[] {1, 2, 3, 4}))
                .param("purpose", "REPORT")
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .with(user(owner.toString()).roles("MEMBER"))
                .with(csrf()))
            .andExpect(status().isUnsupportedMediaType());
    }

    @Test void sameKeySamePayloadReplaysSameMedia() throws Exception {
        UUID owner = member();
        UUID key = UUID.randomUUID();
        String first = upload(owner, "REPORT", PNG, key);
        String second = upload(owner, "REPORT", PNG, key);
        assertThat(second).isEqualTo(first);
    }

    @Test void sameKeyDifferentPayloadConflicts() throws Exception {
        UUID owner = member();
        UUID key = UUID.randomUUID();
        upload(owner, "REPORT", PNG, key);
        byte[] other = new byte[] {
            (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08 };
        mvc.perform(multipart("/api/v1/media")
                .file(new MockMultipartFile("file", "b.jpg", "image/jpeg", other))
                .param("purpose", "REPORT")
                .header("Idempotency-Key", key.toString())
                .with(user(owner.toString()).roles("MEMBER"))
                .with(csrf()))
            .andExpect(status().isConflict());
    }

    @Test void reportLifecycleWithConcealmentAndIdempotency() throws Exception {
        UUID reporter = member();
        UUID reported = member();
        String evidenceId = upload(reporter, "REPORT", PNG, UUID.randomUUID());
        UUID key = UUID.randomUUID();
        String reportId = submitReport(reporter, reported, evidenceId, key);
        // Replay returns the same report.
        String replayed = submitReport(reporter, reported, evidenceId, key);
        assertThat(replayed).isEqualTo(reportId);
        // Reporter reads with no-store.
        mvc.perform(get("/api/v1/reports/" + reportId)
                .with(user(reporter.toString()).roles("MEMBER")))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"));
        // Stranger gets concealed 404.
        mvc.perform(get("/api/v1/reports/" + reportId)
                .with(user(member().toString()).roles("MEMBER")))
            .andExpect(status().isNotFound());
        // Moderator reads.
        UUID mod = member();
        moderator(mod);
        mvc.perform(get("/api/v1/reports/" + reportId)
                .with(user(mod.toString()).roles("MODERATOR")))
            .andExpect(status().isOk());
    }

    @Test void selfReportIsForbidden() throws Exception {
        UUID reporter = member();
        String evidenceId = upload(reporter, "REPORT", PNG, UUID.randomUUID());
        String body = """
            {"reportedMemberId":"%s","description":"Tự báo cáo","evidenceIds":["%s"]}
            """.formatted(reporter, evidenceId);
        mvc.perform(post("/api/v1/reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .with(user(reporter.toString()).roles("MEMBER"))
                .with(csrf()))
            .andExpect(status().isForbidden());
    }

    @Test void emptyEvidenceIsRejectedInVietnamese() throws Exception {
        UUID reporter = member();
        String body = """
            {"reportedMemberId":"%s","description":"Thiếu bằng chứng","evidenceIds":[]}
            """.formatted(member());
        mvc.perform(post("/api/v1/reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .with(user(reporter.toString()).roles("MEMBER"))
                .with(csrf()))
            .andExpect(status().isBadRequest())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                .jsonPath("$.detail").value("Vui lòng gửi ít nhất một bằng chứng"));
    }

    @Test void foreignEvidenceIsRejected() throws Exception {
        UUID reporter = member();
        UUID stranger = member();
        String foreignId = upload(stranger, "REPORT", PNG, UUID.randomUUID());
        String body = """
            {"reportedMemberId":"%s","description":"Dùng bằng chứng của người khác","evidenceIds":["%s"]}
            """.formatted(member(), foreignId);
        mvc.perform(post("/api/v1/reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .with(user(reporter.toString()).roles("MEMBER"))
                .with(csrf()))
            .andExpect(status().isBadRequest());
    }
}
