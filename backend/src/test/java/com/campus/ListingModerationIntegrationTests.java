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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ListingModerationIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private UUID member() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into members(id,email,display_name,password_hash) values (?,?,'Synthetic fixture','not-a-login-hash')",
                id, id + "@example.edu.vn");
        return id;
    }

    private record Listing(UUID id, UUID revisionId) { }

    private Listing pendingListing(UUID seller) {
        UUID listing = UUID.randomUUID(), revision = UUID.randomUUID();
        UUID item = UUID.randomUUID(), photo = UUID.randomUUID();
        jdbc.update("insert into inventory_items(id,seller_id,name,condition_description) values (?,?,'Fixture chair','Used')", item, seller);
        jdbc.update("insert into media_assets(id,owner_id,purpose,storage_key,content_type,byte_size) values (?,?,'LISTING',?,'image/png',1)",
                photo, seller, UUID.randomUUID());
        jdbc.update("insert into listings(id,seller_id) values (?,?)", listing, seller);
        jdbc.update("""
                insert into listing_revisions(id,listing_id,seller_id,revision_number,review_state,title,description,category_id,offer_type,price_vnd,area_label)
                values (?,?,?,1,'PENDING','Fixture listing','Synthetic',
                    (select id from categories where code='FURNITURE'),'SALE',10000,'Campus')
                """, revision, listing, seller);
        jdbc.update("insert into listing_revision_items(revision_id,item_id,seller_id) values (?,?,?)", revision, item, seller);
        jdbc.update("insert into listing_revision_photos(revision_id,media_id,seller_id,position) values (?,?,?,1)", revision, photo, seller);
        return new Listing(listing, revision);
    }

    private String decisionBody(Listing listing, String verdict) {
        return """
                {"expectedVersion":0,"revisionId":"%s","verdict":"%s","reason":"Kiểm tra nội dung"}
                """.formatted(listing.revisionId(), verdict);
    }

    @Test void approvalReplayProducesOneReviewAndSellerNotification() throws Exception {
        UUID seller = member(), moderator = member(), key = UUID.randomUUID();
        Listing listing = pendingListing(seller);
        for (int attempt = 0; attempt < 2; attempt++) {
            mvc.perform(post("/api/v1/moderation/listings/" + listing.id() + "/decisions")
                            .contentType(MediaType.APPLICATION_JSON).content(decisionBody(listing, "APPROVED"))
                            .header("Idempotency-Key", key)
                            .with(user(moderator.toString()).roles("MODERATOR")).with(csrf()))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.reviewState").value("APPROVED"));
        }
        assertThat(jdbc.queryForObject("select count(*) from listing_reviews where revision_id=?", Long.class, listing.revisionId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notifications where recipient_id=?", Long.class, seller)).isEqualTo(1);
        mvc.perform(get("/api/v1/notifications").with(user(seller.toString()).roles("MEMBER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].kind").value("LISTING_APPROVED"));
    }

    @Test void ordinaryMemberCannotReview() throws Exception {
        Listing listing = pendingListing(member());
        mvc.perform(post("/api/v1/moderation/listings/" + listing.id() + "/decisions")
                        .contentType(MediaType.APPLICATION_JSON).content(decisionBody(listing, "REJECTED"))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .with(user(member().toString()).roles("MEMBER")).with(csrf()))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from listing_reviews where revision_id=?", Long.class, listing.revisionId())).isZero();
    }
}