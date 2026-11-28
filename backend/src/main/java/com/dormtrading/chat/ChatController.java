package com.dormtrading.chat;

import java.util.List;
import java.util.UUID;
import com.dormtrading.chat.ChatDtos.ChatMessageDto;
import com.dormtrading.chat.ChatDtos.ConversationDetailDto;
import com.dormtrading.chat.ChatDtos.ConversationSummaryDto;
import com.dormtrading.chat.ChatDtos.CreateOfferRequest;
import com.dormtrading.chat.ChatDtos.OpenConversationRequest;
import com.dormtrading.chat.ChatDtos.RespondOfferRequest;
import com.dormtrading.chat.ChatDtos.SendMessageRequest;
import com.dormtrading.iam.auth.AuthFailure;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/conversations")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @GetMapping
    public List<ConversationSummaryDto> list(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "50") int limit) {
        return chatService.listConversations(userId(jwt), offset, limit);
    }

    @PostMapping
    public ResponseEntity<ConversationDetailDto> openOrCreate(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody(required = false) OpenConversationRequest req) {
        ChatService.OpenResult result = chatService.openOrCreateConversation(userId(jwt), req);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(result.conversation());
    }

    @GetMapping("/{conversationId}")
    public ConversationDetailDto getDetail(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId) {
        return chatService.getConversationDetail(userId(jwt), conversationId);
    }

    @PostMapping("/{conversationId}/messages")
    public ResponseEntity<ChatMessageDto> sendMessage(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId,
            @RequestBody(required = false) SendMessageRequest req) {
        ChatService.MessageSendResult result = chatService.sendMessage(userId(jwt), conversationId, req);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(result.message());
    }

    @PostMapping("/{conversationId}/offers")
    public ResponseEntity<ConversationDetailDto> createOffer(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId,
            @RequestBody(required = false) CreateOfferRequest req) {
        ChatService.OfferCreateResult result = chatService.createOffer(userId(jwt), conversationId, req);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(result.conversation());
    }

    @PostMapping("/{conversationId}/offers/{messageId}/respond")
    public ConversationDetailDto respondToOffer(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId,
            @PathVariable UUID messageId,
            @RequestBody(required = false) RespondOfferRequest req) {
        return chatService.respondToOffer(userId(jwt), conversationId, messageId, req);
    }

    private UUID userId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null) {
            throw new AuthFailure(401, "UNAUTHENTICATED", "Yêu cầu đăng nhập.");
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException e) {
            throw new AuthFailure(401, "INVALID_TOKEN", "Mã xác thực không hợp lệ.");
        }
    }
}
