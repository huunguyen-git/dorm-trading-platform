package com.campus;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class Slice2ModerationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    UUID member() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into members(id,email,display_name,password_hash) values (?,?,'Synthetic fixture','not-a-login-hash')", id, id + "@example.edu.vn");
        return id;
    }

    record Listing(UUID id, UUID revisionId) { }
    Listing pendingListing(UUID seller) {
        UUID listing = UUID.randomUUID(), revision = UUID.randomUUID(), item = UUID.randomUUID(), photo = UUID.randomUUID();
        jdbc.update("insert into inventory_items(id,seller_id,name,condition_description) values (?,?,'Fixture chair','Used')", item, seller);
        jdbc.update("insert into media_assets(id,owner_id,purpose,storage_key,content_type,byte_size) values (?,?,'LISTING',?,'image/png',1)", photo, seller, UUID.randomUUID());
        jdbc.update("insert into listings(id,seller_id) values (?,?)", listing, seller);
        jdbc.update("""
            insert into listing_revisions(id,listing_id,seller_id,revision_number,review_state,title,description,category_id,offer_type,price_vnd,area_label)
            values (?,?,?,1,'PENDING','Fixture listing','Synthetic',(select id from categories where code='FURNITURE'),'SALE',10000,'Campus')
            """, revision, listing, seller);
        jdbc.update("insert into listing_revision_items values (?,?,?)", revision, item, seller);
        jdbc.update("insert into listing_revision_photos(revision_id,media_id,seller_id,position) values (?,?,?,1)", revision, photo, seller);
        return new Listing(listing, revision);
    }

    @Test void moderatorApprovesOnceReplaysAndSellerReadsNotification() throws Exception {
        UUID seller = member(), moderator = member();
        Listing listing = pendingListing(seller);
        UUID key = UUID.randomUUID();
        String body = "{\"expectedVersion\":0,\"revisionId\":\"%s\",\"verdict\":\"APPROVED\",\"reason\":\"Đủ điều kiện\"}".formatted(listing.revisionId());
        mvc.perform(post("/api/v1/moderation/listings/" + listing.id() + "/decisions").contentType(MediaType.APPLICATION_JSON).content(body).header("Idempotency-Key", key).with(user(moderator.toString()).roles("MODERATOR")).with(csrf())).andExpect(status().isOk());
        mvc.perform(post("/api/v1/moderation/listings/" + listing.id() + "/decisions").contentType(MediaType.APPLICATION_JSON).content(body).header("Idempotency-Key", key).with(user(moderator.toString()).roles("MODERATOR")).with(csrf())).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from listing_reviews where revision_id=?", Long.class, listing.revisionId())).isEqualTo(1);
        var inbox = mvc.perform(get("/api/v1/notifications").with(user(seller.toString()).roles("MEMBER"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(inbox).contains("LISTING_APPROVED");
    }

    @Test void ordinaryMemberCannotReviewAndInvalidPageFails() throws Exception {
        Listing listing = pendingListing(member());
        UUID actor = member();
        String body = "{\"expectedVersion\":0,\"revisionId\":\"%s\",\"verdict\":\"REJECTED\",\"reason\":\"Không đủ ảnh\"}".formatted(listing.revisionId());
        mvc.perform(post("/api/v1/moderation/listings/" + listing.id() + "/decisions").contentType(MediaType.APPLICATION_JSON).content(body).header("Idempotency-Key", UUID.randomUUID()).with(user(actor.toString()).roles("MEMBER")).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/notifications?page=-1").with(user(actor.toString()).roles("MEMBER"))).andExpect(status().isBadRequest());
    }
}
