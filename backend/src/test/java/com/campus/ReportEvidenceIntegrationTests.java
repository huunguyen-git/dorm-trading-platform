package com.campus;

import java.util.Base64;
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
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** HTTP authorization, evidence validation and atomic report intake; no sanction policy is enabled. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ReportEvidenceIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper mapper;

    // A complete 1x1 PNG, not merely a matching signature.
    private static final byte[] PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9foAAAAASUVORK5CYII=");

    private UUID member() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into members(id,email,display_name,password_hash) values (?,?,'Synthetic fixture','not-a-login-hash')",
                id, id + "@example.edu.vn");
        return id;
    }

    private String upload(UUID owner, byte[] bytes, UUID key) throws Exception {
        String response = mvc.perform(multipart("/api/v1/media")
                        .file(new MockMultipartFile("file", "evidence.png", "image/png", bytes))
                        .param("purpose", "REPORT").header("Idempotency-Key", key)
                        .with(user(owner.toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.purpose").value("REPORT"))
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).get("id").asString();
    }

    private String reportBody(UUID reported, String evidenceIds) {
        return """
                {"reportedMemberId":"%s","description":"Hàng sai mô tả","evidenceIds":%s}
                """.formatted(reported, evidenceIds);
    }

    private String submit(UUID reporter, UUID reported, String evidenceId, UUID key) throws Exception {
        String response = mvc.perform(post("/api/v1/reports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reportBody(reported, "[\"" + evidenceId + "\"]"))
                        .header("Idempotency-Key", key)
                        .with(user(reporter.toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.state").value("SUBMITTED"))
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).get("id").asString();
    }

    @Test void uploaderReadsEvidenceWithoutCaching() throws Exception {
        UUID owner = member();
        String id = upload(owner, PNG, UUID.randomUUID());
        mvc.perform(get("/api/v1/media/" + id).with(user(owner.toString()).roles("MEMBER")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test void strangerCannotReadEvidence() throws Exception {
        String id = upload(member(), PNG, UUID.randomUUID());
        mvc.perform(get("/api/v1/media/" + id).with(user(member().toString()).roles("MEMBER")))
                .andExpect(status().isNotFound());
    }

    @Test void moderatorReadsEvidence() throws Exception {
        String id = upload(member(), PNG, UUID.randomUUID());
        mvc.perform(get("/api/v1/media/" + id).with(user(member().toString()).roles("MODERATOR")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test void unimplementedMediaPurposeIsRejected() throws Exception {
        mvc.perform(multipart("/api/v1/media")
                        .file(new MockMultipartFile("file", "evidence.png", "image/png", PNG))
                        .param("purpose", "LISTING").header("Idempotency-Key", UUID.randomUUID())
                        .with(user(member().toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNSUPPORTED_PURPOSE"));
    }

    @Test void unsupportedBytesAreRejected() throws Exception {
        mvc.perform(multipart("/api/v1/media")
                        .file(new MockMultipartFile("file", "evidence.bin", "image/png", new byte[]{1, 2, 3}))
                        .param("purpose", "REPORT").header("Idempotency-Key", UUID.randomUUID())
                        .with(user(member().toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test void uploadReplayReturnsSameAsset() throws Exception {
        UUID owner = member(), key = UUID.randomUUID();
        assertThat(upload(owner, PNG, key)).isEqualTo(upload(owner, PNG, key));
    }

    @Test void uploadKeyCannotBeReusedWithDifferentPayload() throws Exception {
        UUID owner = member(), key = UUID.randomUUID();
        upload(owner, PNG, key);
        byte[] changed = PNG.clone();
        changed[changed.length - 1] ^= 1;
        mvc.perform(multipart("/api/v1/media")
                        .file(new MockMultipartFile("file", "changed.png", "image/png", changed))
                        .param("purpose", "REPORT").header("Idempotency-Key", key)
                        .with(user(owner.toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
    }

    @Test void reportReplayPreservesOneReportWithoutReputationEffects() throws Exception {
        UUID reporter = member(), reported = member(), key = UUID.randomUUID();
        String evidence = upload(reporter, PNG, UUID.randomUUID());
        String id = submit(reporter, reported, evidence, key);
        assertThat(submit(reporter, reported, evidence, key)).isEqualTo(id);
        assertThat(jdbc.queryForObject("select count(*) from reports where reporter_id=?", Long.class, reporter)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from reputation_entries where member_id=?", Long.class, reported)).isZero();
        mvc.perform(get("/api/v1/reports/" + id).with(user(reporter.toString()).roles("MEMBER")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(get("/api/v1/reports/" + id).with(user(member().toString()).roles("MEMBER")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/reports/" + id).with(user(member().toString()).roles("MODERATOR")))
                .andExpect(status().isOk());
    }

    @Test void selfReportIsForbidden() throws Exception {
        UUID reporter = member();
        String evidence = upload(reporter, PNG, UUID.randomUUID());
        mvc.perform(post("/api/v1/reports").contentType(MediaType.APPLICATION_JSON)
                        .content(reportBody(reporter, "[\"" + evidence + "\"]"))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .with(user(reporter.toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test void reportRequiresEvidence() throws Exception {
        mvc.perform(post("/api/v1/reports").contentType(MediaType.APPLICATION_JSON)
                        .content(reportBody(member(), "[]")).header("Idempotency-Key", UUID.randomUUID())
                        .with(user(member().toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test void reportRejectsEvidenceOwnedByAnotherMember() throws Exception {
        String evidence = upload(member(), PNG, UUID.randomUUID());
        mvc.perform(post("/api/v1/reports").contentType(MediaType.APPLICATION_JSON)
                        .content(reportBody(member(), "[\"" + evidence + "\"]"))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .with(user(member().toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isBadRequest());
    }
}