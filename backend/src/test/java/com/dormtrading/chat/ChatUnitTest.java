package com.dormtrading.chat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.dormtrading.chat.ChatDtos.ChatMessageDto;
import com.dormtrading.chat.ChatDtos.ConversationDetailDto;
import com.dormtrading.chat.ChatDtos.CreateOfferRequest;
import com.dormtrading.chat.ChatDtos.ListingSummaryDto;
import com.dormtrading.chat.ChatDtos.OpenConversationRequest;
import com.dormtrading.chat.ChatDtos.ParticipantDto;
import com.dormtrading.chat.ChatDtos.RespondOfferRequest;
import com.dormtrading.chat.ChatDtos.SendMessageRequest;
import com.dormtrading.iam.auth.AccountRestrictedFailure;
import com.dormtrading.iam.auth.AuthFailure;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatUnitTest {

    private JdbcTemplate db;
    private ChatService chatService;
    private UUID activeUserId;

    @BeforeEach
    void setUp() {
        db = mock(JdbcTemplate.class);
        chatService = new ChatService(db, Clock.fixed(Instant.parse("2026-11-25T06:45:00Z"), ZoneOffset.UTC));
        activeUserId = UUID.randomUUID();
        when(db.queryForList(anyString(), eq(activeUserId)))
                .thenReturn(List.of(Map.of(
                        "trang_thai_tai_khoan", "HOAT_DONG",
                        "cho_phep_khieu_nai", false,
                        "diem_uy_tin", 100)));
    }

    @Test
    void checkCallerActiveRejectsNullAndLockedWithRestrictionPayloadAndPendingAccounts() {
        assertThatThrownBy(() -> chatService.checkCallerActive(null))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(401);
                    assertThat(af.code).isEqualTo("UNAUTHENTICATED");
                });

        UUID lockedUser = UUID.randomUUID();
        when(db.queryForList(anyString(), eq(lockedUser)))
                .thenReturn(List.of(Map.of(
                        "trang_thai_tai_khoan", "BI_KHOA",
                        "loai_han_che", "KHOA_TAM_THOI",
                        "ly_do_han_che", "Vi phạm quy định",
                        "cho_phep_khieu_nai", true,
                        "diem_uy_tin", 45)));
        assertThatThrownBy(() -> chatService.checkCallerActive(lockedUser))
                .isInstanceOf(AccountRestrictedFailure.class)
                .satisfies(ex -> {
                    AccountRestrictedFailure arf = (AccountRestrictedFailure) ex;
                    assertThat(arf.status).isEqualTo(403);
                    assertThat(arf.code).isEqualTo("ACCOUNT_RESTRICTED");
                    assertThat(arf.restriction.lockType()).isEqualTo("KHOA_TAM_THOI");
                    assertThat(arf.restriction.reason()).isEqualTo("Vi phạm quy định");
                    assertThat(arf.restriction.appealable()).isTrue();
                    assertThat(arf.restriction.reputationScore()).isEqualTo(45);
                });

        UUID disabledUser = UUID.randomUUID();
        when(db.queryForList(anyString(), eq(disabledUser)))
                .thenReturn(List.of(Map.of(
                        "trang_thai_tai_khoan", "VO_HIEU_HOA",
                        "ly_do_han_che", "Tài khoản vô hiệu hóa",
                        "cho_phep_khieu_nai", false,
                        "diem_uy_tin", 0)));
        assertThatThrownBy(() -> chatService.checkCallerActive(disabledUser))
                .isInstanceOf(AccountRestrictedFailure.class)
                .satisfies(ex -> {
                    AccountRestrictedFailure arf = (AccountRestrictedFailure) ex;
                    assertThat(arf.status).isEqualTo(403);
                    assertThat(arf.code).isEqualTo("ACCOUNT_RESTRICTED");
                    assertThat(arf.restriction.accountStatus()).isEqualTo("VO_HIEU_HOA");
                });

        UUID pendingUser = UUID.randomUUID();
        when(db.queryForList(anyString(), eq(pendingUser)))
                .thenReturn(List.of(Map.of(
                        "trang_thai_tai_khoan", "CHO_KICH_HOAT",
                        "cho_phep_khieu_nai", false,
                        "diem_uy_tin", 100)));
        assertThatThrownBy(() -> chatService.checkCallerActive(pendingUser))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(403);
                    assertThat(af.code).isEqualTo("ACCOUNT_NOT_ACTIVE");
                });
    }

    @Test
    void openConversationRejectsMissingListingId() {
        assertThatThrownBy(() -> chatService.openOrCreateConversation(activeUserId, null))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(400);
                    assertThat(af.code).isEqualTo("INVALID_INPUT");
                });

        assertThatThrownBy(() -> chatService.openOrCreateConversation(activeUserId, new OpenConversationRequest(null)))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(400);
                    assertThat(af.code).isEqualTo("INVALID_INPUT");
                });
    }

    @Test
    void sendMessageRejectsBlankOrOversizedContentAndLongClientMessageId() {
        UUID convId = UUID.randomUUID();

        assertThatThrownBy(() -> chatService.sendMessage(activeUserId, convId, new SendMessageRequest("   ", null)))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(400);
                    assertThat(af.code).isEqualTo("INVALID_MESSAGE");
                });

        String tooLong = "a".repeat(2001);
        assertThatThrownBy(() -> chatService.sendMessage(activeUserId, convId, new SendMessageRequest(tooLong, null)))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(400);
                    assertThat(af.code).isEqualTo("INVALID_MESSAGE");
                });

        String longClientId = "c".repeat(121);
        assertThatThrownBy(() -> chatService.sendMessage(activeUserId, convId, new SendMessageRequest("Xin chào", longClientId)))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(400);
                    assertThat(af.code).isEqualTo("INVALID_INPUT");
                });
    }

    @Test
    void createOfferAndRespondValidateStrictVndPricesAndRejectDotFormattedStrings() {
        UUID convId = UUID.randomUUID();
        UUID offerId = UUID.randomUUID();

        assertThatThrownBy(() -> chatService.createOffer(activeUserId, convId, new CreateOfferRequest(null, null, null)))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(400);
                    assertThat(af.code).isEqualTo("INVALID_OFFER_PRICE");
                });

        // Reject "120.000", "120,000", scientific notation "1e5", and fractional numbers
        for (Object invalidPrice : List.of("120.000", "120,000", "1e5", 12500.5, (long) Integer.MAX_VALUE + 10L)) {
            assertThatThrownBy(() -> chatService.createOffer(activeUserId, convId, new CreateOfferRequest(invalidPrice, null, null)))
                    .isInstanceOf(AuthFailure.class)
                    .satisfies(ex -> {
                        AuthFailure af = (AuthFailure) ex;
                        assertThat(af.status).isEqualTo(400);
                        assertThat(af.code).isEqualTo("INVALID_OFFER_PRICE");
                    });
        }

        String oversizedNote = "n".repeat(1001);
        assertThatThrownBy(() -> chatService.createOffer(activeUserId, convId, new CreateOfferRequest(50000, oversizedNote, null)))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(400);
                    assertThat(af.code).isEqualTo("INVALID_MESSAGE");
                });

        assertThatThrownBy(() -> chatService.respondToOffer(activeUserId, convId, offerId, new RespondOfferRequest("INVALID", null, null, null)))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(400);
                    assertThat(af.code).isEqualTo("INVALID_OFFER_ACTION");
                });
    }

    @Test
    void chatControllerMapsOpenSendAndCreateOfferStatusCodesAndValidatesJwtSubject() {
        ChatService mockService = mock(ChatService.class);
        ChatController controller = new ChatController(mockService);

        assertThatThrownBy(() -> controller.list(null, 0, 50))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(401);
                    assertThat(af.code).isEqualTo("UNAUTHENTICATED");
                });

        Jwt invalidJwt = Jwt.withTokenValue("tok").header("alg", "HS256").subject("not-a-uuid").build();
        assertThatThrownBy(() -> controller.list(invalidJwt, 0, 50))
                .isInstanceOf(AuthFailure.class)
                .satisfies(ex -> {
                    AuthFailure af = (AuthFailure) ex;
                    assertThat(af.status).isEqualTo(401);
                    assertThat(af.code).isEqualTo("INVALID_TOKEN");
                });

        UUID userId = UUID.randomUUID();
        UUID sellerId = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        UUID convId = UUID.randomUUID();
        Jwt validJwt = Jwt.withTokenValue("tok").header("alg", "HS256").subject(userId.toString()).build();

        ConversationDetailDto sampleDetail = new ConversationDetailDto(
                convId, userId,
                new ListingSummaryDto(listingId, "Bàn học", "Mô tả", 150000, "Seller", sellerId, "BAN_LE", "CONG_KHAI"),
                listingId, "Bàn học", 150000, "BAN_LE", "CONG_KHAI",
                new ParticipantDto(userId, "Buyer"), userId, "Buyer",
                new ParticipantDto(sellerId, "Seller"), sellerId, "Seller",
                sellerId, "Seller", "HOAT_DONG", false,
                140000, UUID.randomUUID(), null, null, null, ChatDtos.RESERVATION_NOTICE,
                true, true, null, List.<ChatMessageDto>of(), 1L,
                Instant.now(), Instant.now());

        OpenConversationRequest req = new OpenConversationRequest(listingId);
        when(mockService.openOrCreateConversation(userId, req))
                .thenReturn(new ChatService.OpenResult(sampleDetail, true))
                .thenReturn(new ChatService.OpenResult(sampleDetail, false));

        var createdResp = controller.openOrCreate(validJwt, req);
        assertThat(createdResp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(createdResp.getBody()).isEqualTo(sampleDetail);

        var existingResp = controller.openOrCreate(validJwt, req);
        assertThat(existingResp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(existingResp.getBody()).isEqualTo(sampleDetail);

        ChatMessageDto sampleMsg = new ChatMessageDto(
                UUID.randomUUID(), convId, 1L, 2L, userId, "Buyer",
                "VAN_BAN", "VAN_BAN", "Xin chào", null, null, null, null, null, null,
                "key-1", false, Instant.now(), Instant.now(), null);
        SendMessageRequest msgReq = new SendMessageRequest("Xin chào", "key-1");
        when(mockService.sendMessage(userId, convId, msgReq))
                .thenReturn(new ChatService.MessageSendResult(sampleMsg, true))
                .thenReturn(new ChatService.MessageSendResult(sampleMsg, false));

        assertThat(controller.sendMessage(validJwt, convId, msgReq).getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(controller.sendMessage(validJwt, convId, msgReq).getStatusCode()).isEqualTo(HttpStatus.OK);

        CreateOfferRequest offerReq = new CreateOfferRequest(120000, "Ghi chú", "offer-key-1");
        when(mockService.createOffer(userId, convId, offerReq))
                .thenReturn(new ChatService.OfferCreateResult(sampleDetail, true))
                .thenReturn(new ChatService.OfferCreateResult(sampleDetail, false));

        assertThat(controller.createOffer(validJwt, convId, offerReq).getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(controller.createOffer(validJwt, convId, offerReq).getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
