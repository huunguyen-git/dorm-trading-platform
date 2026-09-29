package com.campus;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.*;

/** Exercises PostgreSQL constraints, not yet-unimplemented business services/authorization. */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class SharedSchemaIntegrationTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired PlatformTransactionManager transactionManager;

    UUID member() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into members(id,email,display_name,password_hash) values (?,?,'Synthetic fixture','not-a-login-hash')",
            id, id + "@example.edu.vn");
        return id;
    }
    UUID item(UUID seller) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into inventory_items(id,seller_id,name,condition_description) values (?,?,'Fixture chair','Used')", id,seller);
        return id;
    }
    record Offer(UUID listing, UUID revision, UUID seller) { }
    Offer offer(UUID seller, UUID... items) {
        UUID listing = UUID.randomUUID(), revision = UUID.randomUUID();
        jdbc.update("insert into listings(id,seller_id) values (?,?)",listing,seller);
        jdbc.update("""
            insert into listing_revisions(id,listing_id,seller_id,revision_number,title,description,category_id,offer_type,price_vnd,area_label)
            values (?,?,?,1,'Fixture listing','Synthetic', (select id from categories where code='FURNITURE'),'SALE',10000,'Campus')
            """, revision,listing,seller);
        for (UUID item : items) jdbc.update("insert into listing_revision_items values (?,?,?)",revision,item,seller);
        return new Offer(listing,revision,seller);
    }
    UUID request(Offer offer, UUID buyer) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into reservations(id,listing_id,seller_id,buyer_id,revision_id) values (?,?,?,?,?)",
            id,offer.listing,offer.seller,buyer,offer.revision);
        return id;
    }
    void allocate(UUID reservation, UUID seller, UUID... items) {
        jdbc.update("update reservations set state='ACCEPTED', accepted_at=now(), agreed_price_vnd=10000, listing_snapshot='{}'::jsonb where id=?",reservation);
        for (UUID item : items) jdbc.update("insert into reservation_items values (?,?,?,'Snapshot chair','Used','HELD')",reservation,item,seller);
    }
    UUID trade(UUID reservation, UUID seller, UUID buyer) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into trades(id,reservation_id,seller_id,buyer_id) values (?,?,?,?)",id,reservation,seller,buyer);
        return id;
    }

    @Test void existingV1DatabaseUpgradesWithoutLosingReferenceData() {
        String schema="upgrade_"+UUID.randomUUID().toString().replace("-", "");
        Flyway old=Flyway.configure().dataSource(dataSource).schemas(schema).target("1").load();
        old.migrate();
        jdbc.update("insert into "+schema+".categories(code,name) values ('EXISTING','Existing reference')");
        Flyway upgraded=Flyway.configure().dataSource(dataSource).schemas(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from "+schema+".categories",Long.class)).isEqualTo(4);
        upgraded.validate();
        assertThat(upgraded.migrate().migrationsExecuted).isZero();
    }

    @Test void twoListingsSharingOneItemHaveExactlyOneWinner() throws Exception {
        UUID seller=member(), shared=item(seller);
        UUID first=request(offer(seller,shared),member()), second=request(offer(seller,shared),member());
        CountDownLatch ready=new CountDownLatch(2), start=new CountDownLatch(1);
        try (var pool=Executors.newFixedThreadPool(2)) {
            var futures=List.of(first,second).stream().map(id -> pool.submit(() -> {
                ready.countDown();
                if (!start.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Race did not start");
                try {
                    new TransactionTemplate(transactionManager).executeWithoutResult(status -> allocate(id,seller,shared));
                    return true;
                } catch (DataIntegrityViolationException expected) { return false; }
            })).toList();
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(List.of(futures.get(0).get(20,TimeUnit.SECONDS),futures.get(1).get(20,TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(true,false);
        }
        assertThat(jdbc.queryForObject("select count(*) from reservation_items where item_id=? and allocation_state='HELD'",Long.class,shared)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from reservations where id in (?,?) and state='ACCEPTED'",Long.class,first,second)).isEqualTo(1);
    }

    @Test void failedComboRollsBackEveryAllocationAndReservationState() {
        UUID seller=member(), free=item(seller), occupied=item(seller);
        UUID held=request(offer(seller,occupied),member());
        new TransactionTemplate(transactionManager).executeWithoutResult(s -> allocate(held,seller,occupied));
        UUID combo=request(offer(seller,free,occupied),member());
        assertThatThrownBy(() -> new TransactionTemplate(transactionManager).executeWithoutResult(s -> allocate(combo,seller,free,occupied)))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("select count(*) from reservation_items where reservation_id=?",Long.class,combo)).isZero();
        assertThat(jdbc.queryForObject("select state from reservations where id=?",String.class,combo)).isEqualTo("REQUESTED");
    }

    @Test void buyerCanHoldFourUnrelatedItemsAndSoldItemCannotBeReused() {
        UUID seller=member(), buyer=member();
        for (int n=0;n<4;n++) {
            UUID item=item(seller), reservation=request(offer(seller,item),buyer);
            new TransactionTemplate(transactionManager).executeWithoutResult(s -> allocate(reservation,seller,item));
        }
        assertThat(jdbc.queryForObject("select count(*) from reservations where buyer_id=? and state='ACCEPTED'",Long.class,buyer)).isEqualTo(4);
        UUID sold=item(seller), original=request(offer(seller,sold),buyer);
        allocate(original,seller,sold);
        jdbc.update("update reservation_items set allocation_state='SOLD' where reservation_id=?",original);
        assertThatThrownBy(() -> jdbc.update("update reservation_items set allocation_state='RELEASED' where reservation_id=?",original))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("delete from reservation_items where reservation_id=?",original))
            .isInstanceOf(DataIntegrityViolationException.class);
        UUID another=request(offer(seller,sold),member());
        assertThatThrownBy(() -> new TransactionTemplate(transactionManager).executeWithoutResult(s -> allocate(another,seller,sold)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test void sameListingCannotHaveTwoLiveHoldsOrTwoCompletedTrades() {
        UUID seller=member(), item=item(seller), buyer=member();
        Offer offer=offer(seller,item);
        UUID first=request(offer,buyer), second=request(offer,member());
        allocate(first,seller,item);
        assertThatThrownBy(() -> allocate(second,seller,item)).isInstanceOf(DataIntegrityViolationException.class);
        trade(first,seller,buyer);
        assertThatThrownBy(() -> trade(first,seller,buyer)).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("update reservations set state='COMPLETED' where id=?",first);
        assertThatThrownBy(() -> allocate(second,seller,item)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test void crossOwnerItemsAndEvidenceAreRejectedButOtherListingRevisionIsAllowed() {
        UUID seller=member(), outsider=member(), item=item(seller);
        Offer original=offer(seller,item);
        UUID reservation=request(original,member());
        allocate(reservation,seller,item);
        Offer other=offer(seller,item); // A14: shared-item hold must not block an unheld listing's revision.
        assertThat(other.listing).isNotEqualTo(original.listing);
        Offer foreign=offer(outsider);
        assertThatThrownBy(() -> jdbc.update("insert into listing_revision_items values (?,?,?)",foreign.revision,item,outsider))
            .isInstanceOf(DataIntegrityViolationException.class);
        UUID privatePhoto=UUID.randomUUID();
        jdbc.update("insert into media_assets(id,owner_id,purpose,storage_key,content_type,byte_size) values (?,?,'HANDOVER',?,'image/png',10)",privatePhoto,seller,UUID.randomUUID());
        assertThatThrownBy(() -> jdbc.update("insert into listing_revision_photos(revision_id,media_id,seller_id,position) values (?,?,?,1)",other.revision,privatePhoto,seller))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("select item_name_snapshot from reservation_items where reservation_id=?",String.class,reservation)).isEqualTo("Snapshot chair");
        assertThatThrownBy(() -> jdbc.update("update reservation_items set item_name_snapshot='Changed' where reservation_id=?",reservation))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update reservations set agreed_price_vnd=1 where id=?",reservation))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test void invalidActivationGiveawayAndSelfPurchaseFail() {
        UUID seller=member(); Offer offer=offer(seller);
        assertThatThrownBy(() -> jdbc.update("update members set activated_at=now() where id=?",seller)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update listing_revisions set offer_type='GIVEAWAY' where id=?",offer.revision)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> request(offer,seller)).isInstanceOf(DataIntegrityViolationException.class);
        UUID request=request(offer,member());
        assertThatThrownBy(() -> jdbc.update("update reservations set state='ACCEPTED' where id=?",request)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test void ratingSubmissionEvenRejectedExcludesNoRatingAndDuplicatePoints() {
        UUID seller=member(),buyer=member();
        UUID reservation=request(offer(seller),buyer), trade=trade(reservation,seller,buyer);
        jdbc.update("insert into rating_outcomes(trade_id,seller_id,buyer_id,outcome,stars,review_state,created_at) values (?,?,?,'SUBMITTED',1,'REJECTED',now())",trade,seller,buyer);
        assertThatThrownBy(() -> jdbc.update("insert into rating_outcomes(trade_id,seller_id,buyer_id,outcome,created_at) values (?,?,?,'NO_RATING',now())",trade,seller,buyer))
            .isInstanceOf(DataIntegrityViolationException.class);
        // Separate eligible fixture: DB enforces uniqueness; service must verify state, author and deadline.
        UUID second=trade(request(offer(seller),buyer),seller,buyer);
        jdbc.update("insert into rating_outcomes(trade_id,seller_id,buyer_id,outcome,created_at) values (?,?,?,'NO_RATING',now())",second,seller,buyer);
        jdbc.update("insert into reputation_entries(id,member_id,source_key,kind,trade_id,delta) values (?,?,?,'NO_RATING',?,1)",UUID.randomUUID(),seller,UUID.randomUUID().toString(),second);
        assertThatThrownBy(() -> jdbc.update("insert into reputation_entries(id,member_id,source_key,kind,trade_id,delta) values (?,?,?,'RATING',?,2)",UUID.randomUUID(),seller,UUID.randomUUID().toString(),second))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test void challengeBindsBuyerAndEnforcesLifetimeAttemptsAndReissue() {
        UUID seller=member(),buyer=member(),other=member(),trade=trade(request(offer(seller),buyer),seller,buyer);
        String sql="insert into completion_challenges(id,trade_id,buyer_id,verifier,issued_at,expires_at) values (?,?,?,'synthetic-keyed-verifier',now(),now()+interval '10 minutes')";
        UUID first=UUID.randomUUID();
        assertThatThrownBy(() -> jdbc.update(sql,first,trade,other)).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update(sql,first,trade,buyer);
        assertThatThrownBy(() -> jdbc.update(sql,UUID.randomUUID(),trade,buyer)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update completion_challenges set failed_attempts=6 where id=?",first)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update completion_challenges set expires_at=issued_at+interval '11 minutes' where id=?",first)).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("update completion_challenges set invalidated_at=now() where id=?",first);
        jdbc.update(sql,UUID.randomUUID(),trade,buyer);
        assertThatThrownBy(() -> jdbc.update("update trades set state='AWAITING_CONFIRMATION',handover_reported_at=now() where id=?",trade)).isInstanceOf(DataIntegrityViolationException.class);
    }
}
