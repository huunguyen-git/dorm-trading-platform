package com.dormtrading.chat;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;
import com.dormtrading.chat.ChatDtos.ChatMessageDto;
import com.dormtrading.chat.ChatDtos.ConversationDetailDto;
import com.dormtrading.chat.ChatDtos.ConversationSummaryDto;
import com.dormtrading.chat.ChatDtos.CreateOfferRequest;
import com.dormtrading.chat.ChatDtos.ListingSummaryDto;
import com.dormtrading.chat.ChatDtos.OpenConversationRequest;
import com.dormtrading.chat.ChatDtos.ParticipantDto;
import com.dormtrading.chat.ChatDtos.RespondOfferRequest;
import com.dormtrading.chat.ChatDtos.SendMessageRequest;
import com.dormtrading.iam.auth.AccountRestrictedFailure;
import com.dormtrading.iam.auth.AccountRestrictedFailure.RestrictionPayload;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.review.reputation.ReputationLedgerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@Transactional
public class ChatService {

    public static final String MSG_TEXT = "VAN_BAN";
    public static final String MSG_OFFER = "DE_NGHI_GIA";

    public static final String OFFER_PENDING = "CHO_PHAN_HOI";
    public static final String OFFER_ACCEPTED = "DA_DONG_Y";
    public static final String OFFER_REJECTED = "DA_TU_CHOI";
    public static final String OFFER_SUPERSEDED = "DA_THAY_THE";

    public static final String ACTION_ACCEPT = "ACCEPT";
    public static final String ACTION_REJECT = "REJECT";
    public static final String ACTION_COUNTER = "COUNTER";

    public static final String REASON_COUNTERPARTY_RESTRICTED = "COUNTERPARTY_RESTRICTED";
    public static final String REASON_LISTING_NOT_AVAILABLE = "LISTING_NOT_AVAILABLE";
    public static final String REASON_FREE_LISTING = "FREE_LISTING_NO_NEGOTIATION";

    public static final String PUBLIC_STATUS_ACTIVE = "HOAT_DONG";
    public static final String PUBLIC_STATUS_RESTRICTED = "HAN_CHE";

    private static final int MAX_MESSAGE_LENGTH = 2000;
    private static final int MAX_NOTE_LENGTH = 1000;
    private static final int MAX_CLIENT_MSG_ID_LENGTH = 120;
    private static final int DEFAULT_CONVERSATION_LIMIT = 50;
    private static final int MAX_CONVERSATION_LIMIT = 100;
    private static final int MAX_MESSAGE_HISTORY_LIMIT = 500;
    private static final Pattern STRICT_DIGITS_PATTERN = Pattern.compile("^\\d+$");

    private final JdbcTemplate db;
    private final Clock clock;
    private final ReputationLedgerService reputationLedger;
    private final TransactionTemplate requiresNewTx;

    @Autowired
    public ChatService(
            JdbcTemplate db,
            Clock clock,
            ReputationLedgerService reputationLedger,
            PlatformTransactionManager txManager) {
        this.db = db;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.reputationLedger = reputationLedger;
        if (txManager != null) {
            TransactionTemplate tpl = new TransactionTemplate(txManager);
            tpl.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            this.requiresNewTx = tpl;
        } else {
            this.requiresNewTx = null;
        }
    }

    public ChatService(JdbcTemplate db, Clock clock, ReputationLedgerService reputationLedger) {
        this(db, clock, reputationLedger, null);
    }

    public ChatService(JdbcTemplate db, Clock clock) {
        this(db, clock, null, null);
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private String resolveEffectiveListingStatus(String rawStatus, Timestamp expiresAtTs) {
        if ("CONG_KHAI".equals(rawStatus) && expiresAtTs != null && !now().isBefore(expiresAtTs.toInstant())) {
            return "HET_HAN";
        }
        return rawStatus;
    }

    public record OpenResult(ConversationDetailDto conversation, boolean created) {}

    public record MessageSendResult(ChatMessageDto message, boolean created) {}

    public record OfferCreateResult(ConversationDetailDto conversation, boolean created) {}

    private record ListingSnapshot(
            UUID id,
            UUID sellerId,
            String sellerName,
            String sellerStatus,
            String title,
            String description,
            int price,
            String listingType,
            String status) {}

    private record ConversationRow(
            UUID id,
            UUID listingId,
            String listingTitle,
            String listingDescription,
            Integer listingPrice,
            String listingType,
            String listingStatus,
            UUID buyerId,
            String buyerName,
            String buyerStatus,
            UUID sellerId,
            String sellerName,
            String sellerStatus,
            Integer agreedPrice,
            UUID agreedOfferId,
            UUID pendingOfferId,
            Integer pendingOfferPrice,
            UUID pendingOfferSenderId,
            long version,
            Instant createdAt,
            Instant updatedAt) {}

    private record OfferRow(
            UUID id,
            UUID conversationId,
            UUID senderId,
            int offeredPrice,
            String offerStatus,
            String clientMessageId) {}

    private record CapabilityState(
            boolean canSendMessage,
            boolean canMakeOffer,
            String restrictionReason) {}

    private void reconcileTemporaryLockIfApplicable(UUID targetUserId) {
        if (reputationLedger == null || targetUserId == null) {
            return;
        }
        if (requiresNewTx != null) {
            requiresNewTx.executeWithoutResult(status -> reputationLedger.reconcileExpiredTemporaryLock(targetUserId));
        } else {
            reputationLedger.reconcileExpiredTemporaryLock(targetUserId);
        }
    }

    private String sanitizePublicCounterpartyStatus(String rawAccountStatus) {
        return PUBLIC_STATUS_ACTIVE.equals(rawAccountStatus) ? PUBLIC_STATUS_ACTIVE : PUBLIC_STATUS_RESTRICTED;
    }

    public void checkCallerActive(UUID userId) {
        if (userId == null) {
            throw new AuthFailure(401, "UNAUTHENTICATED", "Yêu cầu đăng nhập.");
        }
        reconcileTemporaryLockIfApplicable(userId);
        List<Map<String, Object>> rows = db.queryForList("""
                SELECT trang_thai_tai_khoan, loai_han_che, ly_do_han_che,
                       khoa_den_ngay, cho_phep_khieu_nai, diem_uy_tin
                FROM thanh_viens
                WHERE user_id = ?
                """,
                userId);
        if (rows.isEmpty()) {
            throw new AuthFailure(401, "USER_NOT_FOUND", "Người dùng không tồn tại.");
        }
        Map<String, Object> row = rows.getFirst();
        String status = (String) row.get("trang_thai_tai_khoan");
        if ("BI_KHOA".equals(status) || "VO_HIEU_HOA".equals(status)) {
            String lockType = (String) row.get("loai_han_che");
            String reason = (String) row.get("ly_do_han_che");
            Object lockedUntilRaw = row.get("khoa_den_ngay");
            Instant lockedUntil = lockedUntilRaw instanceof Timestamp ts ? ts.toInstant() : null;
            boolean appealable = Boolean.TRUE.equals(row.get("cho_phep_khieu_nai"));
            int score = row.get("diem_uy_tin") instanceof Number n ? n.intValue() : 0;
            throw new AccountRestrictedFailure(new RestrictionPayload(
                    status,
                    lockType,
                    reason,
                    lockedUntil,
                    appealable,
                    score));
        }
        if (!PUBLIC_STATUS_ACTIVE.equals(status)) {
            throw new AuthFailure(403, "ACCOUNT_NOT_ACTIVE", "Tài khoản chưa được kích hoạt hoặc phê duyệt.");
        }
    }

    public List<ConversationSummaryDto> listConversations(UUID userId) {
        return listConversations(userId, 0, DEFAULT_CONVERSATION_LIMIT);
    }

    public List<ConversationSummaryDto> listConversations(UUID userId, int offset, int limit) {
        checkCallerActive(userId);
        if (offset < 0 || offset > 10000 || limit <= 0 || limit > MAX_CONVERSATION_LIMIT) {
            throw new AuthFailure(400, "INVALID_INPUT", "Tham số phân trang hộp thư không hợp lệ.");
        }

        // Chỉ reconcile những đối phương đang có khóa tạm đã hết hạn (DISTINCT + ORDER BY user_id ASC chống deadlock)
        List<UUID> expiredCounterpartyIds = db.queryForList("""
                SELECT DISTINCT cp.user_id
                FROM hoi_thoais h
                JOIN thanh_viens cp ON cp.user_id = CASE WHEN h.nguoi_mua_id = ? THEN h.nguoi_ban_id ELSE h.nguoi_mua_id END
                WHERE (h.nguoi_mua_id = ? OR h.nguoi_ban_id = ?)
                  AND cp.trang_thai_tai_khoan = 'BI_KHOA'
                  AND cp.loai_han_che = 'KHOA_TAM_THOI'
                  AND cp.khoa_den_ngay IS NOT NULL
                  AND cp.khoa_den_ngay <= ?
                ORDER BY cp.user_id ASC
                """,
                UUID.class,
                userId,
                userId,
                userId,
                Timestamp.from(now()));
        for (UUID cpId : expiredCounterpartyIds) {
            reconcileTemporaryLockIfApplicable(cpId);
        }

        // Gộp lấy hội thoại + lastMessage + pendingOffer trong 1 truy vấn LATERAL duy nhất
        String sql = """
                SELECT h.ma_hoi_thoai, h.ma_tin,
                       t.tieu_de AS listing_title,
                       t.mo_ta AS listing_description,
                       t.gia_vnd AS listing_price,
                       t.hinh_thuc AS listing_type,
                       t.trang_thai AS listing_status,
                       t.expires_at AS listing_expires_at,
                       h.nguoi_mua_id, bm.ho_ten AS buyer_name, bm.trang_thai_tai_khoan AS buyer_status,
                       h.nguoi_ban_id, sm.ho_ten AS seller_name, sm.trang_thai_tai_khoan AS seller_status,
                       h.gia_thoa_thuan, h.de_nghi_da_dong_y_id, h.version, h.thoi_diem_tao, h.updated_at,
                       lm.ma_tin_nhan AS lm_id, lm.sequence_no AS lm_seq, lm.nguoi_gui_id AS lm_sender_id,
                       lm.sender_name AS lm_sender_name, lm.loai_tin_nhan AS lm_type, lm.noi_dung AS lm_content,
                       lm.gia_de_nghi AS lm_offered_price, lm.trang_thai_de_nghi AS lm_offer_status,
                       lm.hanh_dong_phan_hoi AS lm_resp_action, lm.ghi_chu_phan_hoi AS lm_resp_note,
                       lm.phan_hoi_boi_id AS lm_resp_by, lm.de_nghi_goc_id AS lm_parent_id,
                       lm.client_message_id AS lm_client_id, lm.thoi_diem_gui AS lm_created_at,
                       lm.updated_at AS lm_updated_at, lm.thoi_diem_phan_hoi AS lm_responded_at,
                       po.ma_tin_nhan AS po_id, po.gia_de_nghi AS po_price, po.nguoi_gui_id AS po_sender_id
                FROM hoi_thoais h
                JOIN thanh_viens bm ON bm.user_id = h.nguoi_mua_id
                JOIN thanh_viens sm ON sm.user_id = h.nguoi_ban_id
                LEFT JOIN tin_dangs t ON t.ma_tin = h.ma_tin
                LEFT JOIN LATERAL (
                    SELECT m.ma_tin_nhan, m.sequence_no, m.nguoi_gui_id, u.ho_ten AS sender_name,
                           m.loai_tin_nhan, m.noi_dung, m.gia_de_nghi, m.trang_thai_de_nghi,
                           m.hanh_dong_phan_hoi, m.ghi_chu_phan_hoi, m.phan_hoi_boi_id, m.de_nghi_goc_id,
                           m.client_message_id, m.thoi_diem_gui, m.updated_at, m.thoi_diem_phan_hoi
                    FROM tin_nhans m
                    JOIN thanh_viens u ON u.user_id = m.nguoi_gui_id
                    WHERE m.ma_hoi_thoai = h.ma_hoi_thoai
                    ORDER BY m.thoi_diem_gui DESC, m.sequence_no DESC, m.ma_tin_nhan DESC
                    LIMIT 1
                ) lm ON TRUE
                LEFT JOIN LATERAL (
                    SELECT p.ma_tin_nhan, p.gia_de_nghi, p.nguoi_gui_id
                    FROM tin_nhans p
                    WHERE p.ma_hoi_thoai = h.ma_hoi_thoai
                      AND p.loai_tin_nhan = 'DE_NGHI_GIA'
                      AND p.trang_thai_de_nghi = 'CHO_PHAN_HOI'
                    LIMIT 1
                ) po ON TRUE
                WHERE h.nguoi_mua_id = ? OR h.nguoi_ban_id = ?
                ORDER BY h.updated_at DESC, h.ma_hoi_thoai ASC
                LIMIT ? OFFSET ?
                """;
        return db.query(sql, (rs, rowNum) -> mapSummaryDtoFromLateralRow(rs, userId), userId, userId, limit, offset);
    }

    public OpenResult openOrCreateConversation(UUID userId, OpenConversationRequest req) {
        checkCallerActive(userId);
        if (req == null || req.listingId() == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã tin đăng không được để trống.");
        }

        List<ListingSnapshot> listings = db.query("""
                SELECT t.ma_tin, t.nguoi_dang_id, u.ho_ten, u.trang_thai_tai_khoan,
                       t.tieu_de, t.mo_ta, t.gia_vnd, t.hinh_thuc, t.trang_thai, t.expires_at
                FROM tin_dangs t
                JOIN thanh_viens u ON u.user_id = t.nguoi_dang_id
                WHERE t.ma_tin = ?
                """,
                (rs, i) -> new ListingSnapshot(
                        rs.getObject("ma_tin", UUID.class),
                        rs.getObject("nguoi_dang_id", UUID.class),
                        rs.getString("ho_ten"),
                        rs.getString("trang_thai_tai_khoan"),
                        rs.getString("tieu_de"),
                        rs.getString("mo_ta"),
                        rs.getInt("gia_vnd"),
                        rs.getString("hinh_thuc"),
                        resolveEffectiveListingStatus(rs.getString("trang_thai"), rs.getTimestamp("expires_at"))),
                req.listingId());

        if (listings.isEmpty()) {
            throw new AuthFailure(404, "LISTING_NOT_FOUND", "Không tìm thấy tin đăng.");
        }
        ListingSnapshot listing = listings.getFirst();

        if (listing.sellerId().equals(userId)) {
            throw new AuthFailure(
                    400,
                    "SELF_CONVERSATION_NOT_ALLOWED",
                    "Bạn không thể tự nhắn tin hoặc thương lượng trên chính tin đăng của mình.");
        }

        List<UUID> existingIds = db.queryForList(
                "SELECT ma_hoi_thoai FROM hoi_thoais WHERE ma_tin = ? AND nguoi_mua_id = ? AND nguoi_ban_id = ?",
                UUID.class,
                listing.id(),
                userId,
                listing.sellerId());

        if (!existingIds.isEmpty()) {
            // Existing conversation can be reopened even if listing is no longer CONG_KHAI
            return new OpenResult(getConversationDetail(userId, existingIds.getFirst()), false);
        }

        // Kiểm tra tính hiển thị của tin trước khi kiểm tra trạng thái chủ tin (NFR-01 & DiscoveryService: ẩn NHAP/CHO_DUYET/AN)
        if ("NHAP".equals(listing.status()) || "CHO_DUYET".equals(listing.status()) || "AN".equals(listing.status())) {
            throw new AuthFailure(404, "LISTING_NOT_FOUND", "Không tìm thấy tin đăng.");
        }
        if (!"CONG_KHAI".equals(listing.status()) && !"GIU_CHO".equals(listing.status())) {
            throw new AuthFailure(
                    409,
                    "LISTING_NOT_AVAILABLE",
                    "Tin đăng không còn ở trạng thái cho phép mở cuộc hội thoại mới.");
        }

        reconcileTemporaryLockIfApplicable(listing.sellerId());
        String effectiveSellerStatus = db.queryForObject(
                "SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ?",
                String.class,
                listing.sellerId());

        if (!PUBLIC_STATUS_ACTIVE.equals(effectiveSellerStatus)) {
            throw new AuthFailure(
                    403,
                    "COUNTERPARTY_RESTRICTED",
                    "Tài khoản của người bán hiện đang bị khóa hoặc hạn chế giao dịch.");
        }

        UUID newId = UUID.randomUUID();
        Timestamp nowTs = Timestamp.from(now());
        int inserted = db.update("""
                INSERT INTO hoi_thoais (ma_hoi_thoai, ma_tin, nguoi_mua_id, nguoi_ban_id, thoi_diem_tao, updated_at, version)
                SELECT ?, t.ma_tin, ?, ?, ?, ?, 0
                FROM tin_dangs t
                WHERE t.ma_tin = ?
                ON CONFLICT (ma_tin, nguoi_mua_id, nguoi_ban_id) DO NOTHING
                """,
                newId,
                userId,
                listing.sellerId(),
                nowTs,
                nowTs,
                listing.id());

        if (inserted == 1) {
            return new OpenResult(getConversationDetail(userId, newId), true);
        }

        List<UUID> concurrentIds = db.queryForList(
                "SELECT ma_hoi_thoai FROM hoi_thoais WHERE ma_tin = ? AND nguoi_mua_id = ? AND nguoi_ban_id = ?",
                UUID.class,
                listing.id(),
                userId,
                listing.sellerId());
        if (concurrentIds.isEmpty()) {
            throw new AuthFailure(404, "LISTING_NOT_FOUND", "Không tìm thấy tin đăng.");
        }
        return new OpenResult(getConversationDetail(userId, concurrentIds.getFirst()), false);
    }

    public ConversationDetailDto getConversationDetail(UUID userId, UUID conversationId) {
        checkCallerActive(userId);
        ConversationRow row = loadConversationForParticipant(userId, conversationId, false);
        return buildDetailDto(row, userId);
    }

    public MessageSendResult sendMessage(UUID userId, UUID conversationId, SendMessageRequest req) {
        checkCallerActive(userId);
        if (req == null) {
            throw new AuthFailure(400, "INVALID_MESSAGE", "Nội dung tin nhắn không được để trống.");
        }
        String content = req.content() != null ? req.content().strip() : "";
        if (content.isEmpty()) {
            throw new AuthFailure(400, "INVALID_MESSAGE", "Nội dung tin nhắn không được để trống.");
        }
        if (content.length() > MAX_MESSAGE_LENGTH) {
            throw new AuthFailure(400, "INVALID_MESSAGE", "Nội dung tin nhắn không được vượt quá 2000 ký tự.");
        }
        String clientMessageId = normalizeClientMessageId(req.clientMessageId());

        ConversationRow conv = loadConversationForParticipant(userId, conversationId, true);
        CapabilityState cap = computeCapabilities(conv, userId);

        if (clientMessageId != null) {
            ChatMessageDto replay = findExistingMessageByClientId(
                    conversationId, userId, clientMessageId, MSG_TEXT, content, null, null, cap.canMakeOffer(), conv.version());
            if (replay != null) {
                return new MessageSendResult(replay, false);
            }
        }

        ensureCanSendMessage(conv, userId);

        UUID msgId = UUID.randomUUID();
        Timestamp nowTs = Timestamp.from(now());
        int inserted = db.update("""
                INSERT INTO tin_nhans (
                    ma_tin_nhan, ma_hoi_thoai, nguoi_gui_id, loai_tin_nhan,
                    noi_dung, client_message_id, thoi_diem_gui, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (ma_hoi_thoai, nguoi_gui_id, client_message_id)
                WHERE client_message_id IS NOT NULL
                DO NOTHING
                """,
                msgId,
                conversationId,
                userId,
                MSG_TEXT,
                content,
                clientMessageId,
                nowTs,
                nowTs);

        if (inserted == 0) {
            ChatMessageDto replay = findExistingMessageByClientId(
                    conversationId, userId, Objects.requireNonNull(clientMessageId), MSG_TEXT, content, null, null, cap.canMakeOffer(), conv.version());
            return new MessageSendResult(Objects.requireNonNull(replay), false);
        }

        long nextVersion = conv.version() + 1;
        db.update(
                "UPDATE hoi_thoais SET updated_at = ?, version = ? WHERE ma_hoi_thoai = ?",
                nowTs,
                nextVersion,
                conversationId);

        return new MessageSendResult(loadSingleMessageDto(msgId, userId, cap.canMakeOffer(), nextVersion), true);
    }

    public OfferCreateResult createOffer(UUID userId, UUID conversationId, CreateOfferRequest req) {
        checkCallerActive(userId);
        if (req == null) {
            throw new AuthFailure(400, "INVALID_OFFER_PRICE", "Vui lòng nhập mức giá đề nghị hợp lệ.");
        }
        int offeredPrice = parseStrictVndPrice(req.offeredPrice());
        String note = normalizeOptionalNote(req.note());
        String clientMessageId = normalizeClientMessageId(req.clientMessageId());
        String content = note != null ? note : "";

        ConversationRow conv = loadConversationForParticipant(userId, conversationId, true);
        CapabilityState cap = computeCapabilities(conv, userId);

        if (clientMessageId != null) {
            ChatMessageDto replay = findExistingMessageByClientId(
                    conversationId, userId, clientMessageId, MSG_OFFER, content, offeredPrice, null, cap.canMakeOffer(), conv.version());
            if (replay != null) {
                return new OfferCreateResult(buildDetailDto(conv, userId), false);
            }
        }

        ensureCanMakeOffer(conv, userId);
        validateOfferedPrice(offeredPrice, Objects.requireNonNull(conv.listingPrice()));

        Timestamp nowTs = Timestamp.from(now());

        List<UUID> pendingIds = db.queryForList("""
                SELECT ma_tin_nhan FROM tin_nhans
                WHERE ma_hoi_thoai = ? AND loai_tin_nhan = 'DE_NGHI_GIA' AND trang_thai_de_nghi = 'CHO_PHAN_HOI'
                FOR UPDATE
                """,
                UUID.class,
                conversationId);

        UUID parentOfferId = pendingIds.isEmpty() ? null : pendingIds.getFirst();
        if (parentOfferId != null) {
            db.update("""
                    UPDATE tin_nhans
                    SET trang_thai_de_nghi = 'DA_THAY_THE',
                        phan_hoi_boi_id = ?,
                        thoi_diem_phan_hoi = ?,
                        updated_at = ?
                    WHERE ma_tin_nhan = ? AND trang_thai_de_nghi = 'CHO_PHAN_HOI'
                    """,
                    userId,
                    nowTs,
                    nowTs,
                    parentOfferId);
        }

        UUID offerId = UUID.randomUUID();
        int inserted = db.update("""
                INSERT INTO tin_nhans (
                    ma_tin_nhan, ma_hoi_thoai, nguoi_gui_id, loai_tin_nhan,
                    noi_dung, gia_de_nghi, trang_thai_de_nghi, de_nghi_goc_id,
                    client_message_id, thoi_diem_gui, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (ma_hoi_thoai, nguoi_gui_id, client_message_id)
                WHERE client_message_id IS NOT NULL
                DO NOTHING
                """,
                offerId,
                conversationId,
                userId,
                MSG_OFFER,
                content,
                offeredPrice,
                OFFER_PENDING,
                parentOfferId,
                clientMessageId,
                nowTs,
                nowTs);

        if (inserted == 0) {
            findExistingMessageByClientId(
                    conversationId, userId, Objects.requireNonNull(clientMessageId), MSG_OFFER, content, offeredPrice, null, cap.canMakeOffer(), conv.version());
            return new OfferCreateResult(buildDetailDto(conv, userId), false);
        }

        long nextVersion = conv.version() + 1;
        db.update(
                "UPDATE hoi_thoais SET updated_at = ?, version = ? WHERE ma_hoi_thoai = ?",
                nowTs,
                nextVersion,
                conversationId);

        ConversationRow updated = withUpdatedConversation(
                conv,
                conv.agreedPrice(),
                conv.agreedOfferId(),
                offerId,
                offeredPrice,
                userId,
                nextVersion,
                nowTs.toInstant());
        return new OfferCreateResult(buildDetailDto(updated, userId), true);
    }

    public ConversationDetailDto respondToOffer(
            UUID userId,
            UUID conversationId,
            UUID offerMessageId,
            RespondOfferRequest req) {
        checkCallerActive(userId);
        if (offerMessageId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã đề nghị giá không hợp lệ.");
        }
        if (req == null || req.action() == null || req.action().isBlank()) {
            throw new AuthFailure(400, "INVALID_OFFER_ACTION", "Hành động phản hồi đề nghị giá không hợp lệ.");
        }

        String action = req.action().strip().toUpperCase(Locale.ROOT);
        if (!ACTION_ACCEPT.equals(action) && !ACTION_REJECT.equals(action) && !ACTION_COUNTER.equals(action)) {
            throw new AuthFailure(
                    400,
                    "INVALID_OFFER_ACTION",
                    "Hành động phản hồi phải là ACCEPT, REJECT hoặc COUNTER.");
        }

        String note = normalizeOptionalNote(req.note());
        String clientMessageId = normalizeClientMessageId(req.clientMessageId());

        ConversationRow conv = loadConversationForParticipant(userId, conversationId, true);
        CapabilityState cap = computeCapabilities(conv, userId);

        Integer parsedCounterPrice = null;
        String counterContent = note != null ? note : "";
        if (ACTION_COUNTER.equals(action)) {
            parsedCounterPrice = parseStrictVndPrice(req.counterPrice());
        }

        // Kiểm tra idempotency/conflict của clientMessageId TRƯỚC ensureCanMakeOffer để replay COUNTER không bị chặn nếu tin đổi trạng thái sau đó
        if (clientMessageId != null) {
            if (ACTION_COUNTER.equals(action)) {
                ChatMessageDto replay = findExistingMessageByClientId(
                        conversationId,
                        userId,
                        clientMessageId,
                        MSG_OFFER,
                        counterContent,
                        parsedCounterPrice,
                        offerMessageId,
                        cap.canMakeOffer(),
                        conv.version());
                if (replay != null) {
                    return buildDetailDto(conv, userId);
                }
            } else {
                Integer conflictCount = db.queryForObject(
                        "SELECT count(*) FROM tin_nhans WHERE ma_hoi_thoai = ? AND nguoi_gui_id = ? AND client_message_id = ?",
                        Integer.class,
                        conversationId,
                        userId,
                        clientMessageId);
                if (conflictCount != null && conflictCount > 0) {
                    throw new AuthFailure(
                            409,
                            "CLIENT_MESSAGE_ID_CONFLICT",
                            "Mã clientMessageId đã được sử dụng cho một thao tác khác.");
                }
            }
        }

        ensureCanMakeOffer(conv, userId);
        if (ACTION_COUNTER.equals(action)) {
            validateOfferedPrice(Objects.requireNonNull(parsedCounterPrice), Objects.requireNonNull(conv.listingPrice()));
        }

        List<OfferRow> offers = db.query("""
                SELECT ma_tin_nhan, ma_hoi_thoai, nguoi_gui_id, gia_de_nghi, trang_thai_de_nghi, client_message_id
                FROM tin_nhans
                WHERE ma_tin_nhan = ? AND ma_hoi_thoai = ? AND loai_tin_nhan = 'DE_NGHI_GIA'
                FOR UPDATE
                """,
                (rs, i) -> new OfferRow(
                        rs.getObject("ma_tin_nhan", UUID.class),
                        rs.getObject("ma_hoi_thoai", UUID.class),
                        rs.getObject("nguoi_gui_id", UUID.class),
                        rs.getInt("gia_de_nghi"),
                        rs.getString("trang_thai_de_nghi"),
                        rs.getString("client_message_id")),
                offerMessageId,
                conversationId);

        if (offers.isEmpty()) {
            throw new AuthFailure(404, "OFFER_NOT_FOUND", "Không tìm thấy đề nghị giá trong cuộc hội thoại này.");
        }

        OfferRow targetOffer = offers.getFirst();
        if (targetOffer.senderId().equals(userId)) {
            throw new AuthFailure(
                    403,
                    "OFFER_RESPONSE_FORBIDDEN",
                    "Bạn không thể tự phản hồi đề nghị giá do chính mình gửi.");
        }

        if (!OFFER_PENDING.equals(targetOffer.offerStatus())) {
            throw new AuthFailure(
                    409,
                    "OFFER_NOT_PENDING",
                    "Đề nghị giá này đã được phản hồi hoặc đã bị thay thế.");
        }

        Timestamp nowTs = Timestamp.from(now());
        long nextVersion = conv.version() + 1;
        Integer nextAgreedPrice = conv.agreedPrice();
        UUID nextAgreedOfferId = conv.agreedOfferId();
        UUID nextPendingOfferId = null;
        Integer nextPendingOfferPrice = null;
        UUID nextPendingOfferSenderId = null;

        if (ACTION_ACCEPT.equals(action)) {
            int currentListingPrice = Objects.requireNonNull(conv.listingPrice());
            if (targetOffer.offeredPrice() <= 0 || targetOffer.offeredPrice() > currentListingPrice) {
                throw new AuthFailure(
                        409,
                        "OFFER_NOT_PENDING",
                        "Mức giá đề nghị hiện cao hơn giá niêm yết mới của tin đăng (" + currentListingPrice + " ₫). Vui lòng đề xuất mức giá mới.");
            }

            int updatedRows = db.update("""
                    UPDATE tin_nhans
                    SET trang_thai_de_nghi = 'DA_DONG_Y',
                        hanh_dong_phan_hoi = 'ACCEPT',
                        ghi_chu_phan_hoi = ?,
                        phan_hoi_boi_id = ?,
                        thoi_diem_phan_hoi = ?,
                        updated_at = ?
                    WHERE ma_tin_nhan = ? AND trang_thai_de_nghi = 'CHO_PHAN_HOI'
                    """,
                    note,
                    userId,
                    nowTs,
                    nowTs,
                    offerMessageId);
            if (updatedRows != 1) {
                throw new AuthFailure(409, "OFFER_NOT_PENDING", "Đề nghị giá này đã được phản hồi hoặc đã bị thay thế.");
            }

            nextAgreedPrice = targetOffer.offeredPrice();
            nextAgreedOfferId = offerMessageId;

            // Ghi nhận giá thỏa thuận vào hoi_thoais; KHÔNG tự động giữ chỗ tin đăng hay đồ vật (FR-07, FR-08)
            db.update("""
                    UPDATE hoi_thoais
                    SET gia_thoa_thuan = ?,
                        de_nghi_da_dong_y_id = ?,
                        updated_at = ?,
                        version = ?
                    WHERE ma_hoi_thoai = ?
                    """,
                    nextAgreedPrice,
                    nextAgreedOfferId,
                    nowTs,
                    nextVersion,
                    conversationId);

        } else if (ACTION_REJECT.equals(action)) {
            int updatedRows = db.update("""
                    UPDATE tin_nhans
                    SET trang_thai_de_nghi = 'DA_TU_CHOI',
                        hanh_dong_phan_hoi = 'REJECT',
                        ghi_chu_phan_hoi = ?,
                        phan_hoi_boi_id = ?,
                        thoi_diem_phan_hoi = ?,
                        updated_at = ?
                    WHERE ma_tin_nhan = ? AND trang_thai_de_nghi = 'CHO_PHAN_HOI'
                    """,
                    note,
                    userId,
                    nowTs,
                    nowTs,
                    offerMessageId);
            if (updatedRows != 1) {
                throw new AuthFailure(409, "OFFER_NOT_PENDING", "Đề nghị giá này đã được phản hồi hoặc đã bị thay thế.");
            }

            db.update(
                    "UPDATE hoi_thoais SET updated_at = ?, version = ? WHERE ma_hoi_thoai = ?",
                    nowTs,
                    nextVersion,
                    conversationId);

        } else {
            // ACTION_COUNTER: đề xuất lại mức giá khác (đổi đề nghị cũ sang DA_THAY_THE + tạo đề nghị mới nguyên tử)
            int counterPrice = Objects.requireNonNull(parsedCounterPrice);

            int updatedRows = db.update("""
                    UPDATE tin_nhans
                    SET trang_thai_de_nghi = 'DA_THAY_THE',
                        hanh_dong_phan_hoi = 'COUNTER',
                        ghi_chu_phan_hoi = ?,
                        phan_hoi_boi_id = ?,
                        thoi_diem_phan_hoi = ?,
                        updated_at = ?
                    WHERE ma_tin_nhan = ? AND trang_thai_de_nghi = 'CHO_PHAN_HOI'
                    """,
                    note,
                    userId,
                    nowTs,
                    nowTs,
                    offerMessageId);
            if (updatedRows != 1) {
                throw new AuthFailure(409, "OFFER_NOT_PENDING", "Đề nghị giá này đã được phản hồi hoặc đã bị thay thế.");
            }

            // Đề nghị mới mang trang_thai_de_nghi = CHO_PHAN_HOI, hanh_dong_phan_hoi = NULL, de_nghi_goc_id = offerMessageId
            UUID counterOfferId = UUID.randomUUID();
            int inserted = db.update("""
                    INSERT INTO tin_nhans (
                        ma_tin_nhan, ma_hoi_thoai, nguoi_gui_id, loai_tin_nhan,
                        noi_dung, gia_de_nghi, trang_thai_de_nghi, hanh_dong_phan_hoi,
                        de_nghi_goc_id, client_message_id, thoi_diem_gui, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
                    ON CONFLICT (ma_hoi_thoai, nguoi_gui_id, client_message_id)
                    WHERE client_message_id IS NOT NULL
                    DO NOTHING
                    """,
                    counterOfferId,
                    conversationId,
                    userId,
                    MSG_OFFER,
                    counterContent,
                    counterPrice,
                    OFFER_PENDING,
                    offerMessageId,
                    clientMessageId,
                    nowTs,
                    nowTs);
            if (inserted == 0) {
                throw new AuthFailure(
                        409,
                        "CLIENT_MESSAGE_ID_CONFLICT",
                        "Mã clientMessageId đã được sử dụng cho một thao tác khác.");
            }

            nextPendingOfferId = counterOfferId;
            nextPendingOfferPrice = counterPrice;
            nextPendingOfferSenderId = userId;

            db.update(
                    "UPDATE hoi_thoais SET updated_at = ?, version = ? WHERE ma_hoi_thoai = ?",
                    nowTs,
                    nextVersion,
                    conversationId);
        }

        ConversationRow updated = withUpdatedConversation(
                conv,
                nextAgreedPrice,
                nextAgreedOfferId,
                nextPendingOfferId,
                nextPendingOfferPrice,
                nextPendingOfferSenderId,
                nextVersion,
                nowTs.toInstant());
        return buildDetailDto(updated, userId);
    }

    private ConversationRow withUpdatedConversation(
            ConversationRow base,
            Integer agreedPrice,
            UUID agreedOfferId,
            UUID pendingOfferId,
            Integer pendingOfferPrice,
            UUID pendingOfferSenderId,
            long version,
            Instant updatedAt) {
        return new ConversationRow(
                base.id(),
                base.listingId(),
                base.listingTitle(),
                base.listingDescription(),
                base.listingPrice(),
                base.listingType(),
                base.listingStatus(),
                base.buyerId(),
                base.buyerName(),
                base.buyerStatus(),
                base.sellerId(),
                base.sellerName(),
                base.sellerStatus(),
                agreedPrice,
                agreedOfferId,
                pendingOfferId,
                pendingOfferPrice,
                pendingOfferSenderId,
                version,
                base.createdAt(),
                updatedAt);
    }

    private int parseStrictVndPrice(Object rawPrice) {
        if (rawPrice == null) {
            throw new AuthFailure(400, "INVALID_OFFER_PRICE", "Vui lòng nhập mức giá đề nghị hợp lệ.");
        }
        if (rawPrice instanceof Integer i) {
            return i;
        }
        if (rawPrice instanceof Long l) {
            if (l > Integer.MAX_VALUE || l < Integer.MIN_VALUE) {
                throw new AuthFailure(400, "INVALID_OFFER_PRICE", "Mức giá đề nghị vượt quá giới hạn cho phép.");
            }
            return l.intValue();
        }
        if (rawPrice instanceof BigDecimal bd) {
            if (bd.scale() > 0) {
                throw new AuthFailure(400, "INVALID_OFFER_PRICE", "Mức giá đề nghị phải là số nguyên VND thuần (không dùng dấu chấm/phẩy).");
            }
            try {
                return bd.intValueExact();
            } catch (ArithmeticException e) {
                throw new AuthFailure(400, "INVALID_OFFER_PRICE", "Mức giá đề nghị phải là số nguyên VND hợp lệ.");
            }
        }
        if (rawPrice instanceof Number n) {
            double d = n.doubleValue();
            if (!Double.isFinite(d) || d != Math.rint(d) || d > Integer.MAX_VALUE || d < Integer.MIN_VALUE) {
                throw new AuthFailure(400, "INVALID_OFFER_PRICE", "Mức giá đề nghị phải là số nguyên VND hợp lệ.");
            }
            return (int) d;
        }
        if (rawPrice instanceof String s) {
            String trimmed = s.strip();
            if (!STRICT_DIGITS_PATTERN.matcher(trimmed).matches()) {
                throw new AuthFailure(
                        400,
                        "INVALID_OFFER_PRICE",
                        "Mức giá đề nghị phải gồm các chữ số nguyên VND thuần (không dùng dấu chấm hoặc dấu phẩy).");
            }
            try {
                long parsed = Long.parseLong(trimmed);
                if (parsed > Integer.MAX_VALUE) {
                    throw new AuthFailure(400, "INVALID_OFFER_PRICE", "Mức giá đề nghị vượt quá giới hạn cho phép.");
                }
                return (int) parsed;
            } catch (NumberFormatException e) {
                throw new AuthFailure(400, "INVALID_OFFER_PRICE", "Mức giá đề nghị phải là số nguyên VND hợp lệ.");
            }
        }
        throw new AuthFailure(400, "INVALID_OFFER_PRICE", "Mức giá đề nghị phải là số nguyên VND hợp lệ.");
    }

    private void validateOfferedPrice(int offeredPrice, int listingPrice) {
        if (offeredPrice <= 0) {
            throw new AuthFailure(
                    400,
                    "INVALID_OFFER_PRICE",
                    "Mức giá đề nghị phải lớn hơn 0 ₫.");
        }
        if (offeredPrice > listingPrice) {
            throw new AuthFailure(
                    400,
                    "INVALID_OFFER_PRICE",
                    "Mức giá đề nghị không được cao hơn giá niêm yết (" + listingPrice + " ₫).");
        }
    }

    private void ensureCanSendMessage(ConversationRow conv, UUID userId) {
        String counterpartyStatus = conv.buyerId().equals(userId) ? conv.sellerStatus() : conv.buyerStatus();
        if (!PUBLIC_STATUS_ACTIVE.equals(counterpartyStatus)) {
            throw new AuthFailure(
                    403,
                    "COUNTERPARTY_RESTRICTED",
                    "Tài khoản của đối phương hiện đang bị khóa hoặc hạn chế giao dịch.");
        }
        if (conv.listingId() == null
                || (!"CONG_KHAI".equals(conv.listingStatus()) && !"GIU_CHO".equals(conv.listingStatus()))) {
            throw new AuthFailure(
                    409,
                    "LISTING_NOT_AVAILABLE",
                    "Tin đăng không còn ở trạng thái công khai hoặc giữ chỗ để tiếp tục nhắn tin.");
        }
    }

    private void ensureCanMakeOffer(ConversationRow conv, UUID userId) {
        String counterpartyStatus = conv.buyerId().equals(userId) ? conv.sellerStatus() : conv.buyerStatus();
        if (!PUBLIC_STATUS_ACTIVE.equals(counterpartyStatus)) {
            throw new AuthFailure(
                    403,
                    "COUNTERPARTY_RESTRICTED",
                    "Tài khoản của đối phương hiện đang bị khóa hoặc hạn chế giao dịch.");
        }
        if (conv.listingId() == null || !"CONG_KHAI".equals(conv.listingStatus())) {
            throw new AuthFailure(
                    409,
                    "LISTING_NOT_AVAILABLE",
                    "Chỉ có thể thương lượng giá khi tin đăng đang ở trạng thái công khai.");
        }
        if ("CHO_TANG".equals(conv.listingType()) || conv.listingPrice() == null || conv.listingPrice() <= 0) {
            throw new AuthFailure(
                    409,
                    "FREE_LISTING_NO_NEGOTIATION",
                    "Tin đăng cho tặng miễn phí (0đ) không hỗ trợ thương lượng giá.");
        }
    }

    private CapabilityState computeCapabilities(ConversationRow conv, UUID userId) {
        String counterpartyStatus = conv.buyerId().equals(userId) ? conv.sellerStatus() : conv.buyerStatus();
        if (!PUBLIC_STATUS_ACTIVE.equals(counterpartyStatus)) {
            return new CapabilityState(false, false, REASON_COUNTERPARTY_RESTRICTED);
        }
        if (conv.listingId() == null) {
            return new CapabilityState(false, false, REASON_LISTING_NOT_AVAILABLE);
        }
        if ("GIU_CHO".equals(conv.listingStatus())) {
            return new CapabilityState(true, false, REASON_LISTING_NOT_AVAILABLE);
        }
        if (!"CONG_KHAI".equals(conv.listingStatus())) {
            return new CapabilityState(false, false, REASON_LISTING_NOT_AVAILABLE);
        }
        if ("CHO_TANG".equals(conv.listingType()) || conv.listingPrice() == null || conv.listingPrice() <= 0) {
            return new CapabilityState(true, false, REASON_FREE_LISTING);
        }
        return new CapabilityState(true, true, null);
    }

    private record ConversationHeader(UUID buyerId, UUID sellerId, UUID listingId) {}

    private ConversationRow loadConversationForParticipant(UUID userId, UUID conversationId, boolean forUpdate) {
        if (conversationId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã cuộc hội thoại không hợp lệ.");
        }

        // Bước 1: Đọc nguoi_mua_id, nguoi_ban_id, ma_tin không khóa để kiểm tra quyền participant
        List<ConversationHeader> headers = db.query(
                "SELECT nguoi_mua_id, nguoi_ban_id, ma_tin FROM hoi_thoais WHERE ma_hoi_thoai = ?",
                (rs, i) -> new ConversationHeader(
                        rs.getObject("nguoi_mua_id", UUID.class),
                        rs.getObject("nguoi_ban_id", UUID.class),
                        rs.getObject("ma_tin", UUID.class)),
                conversationId);
        if (headers.isEmpty()) {
            throw new AuthFailure(404, "CONVERSATION_NOT_FOUND", "Không tìm thấy cuộc hội thoại.");
        }
        ConversationHeader header = headers.getFirst();
        if (!header.buyerId().equals(userId) && !header.sellerId().equals(userId)) {
            throw new AuthFailure(404, "CONVERSATION_NOT_FOUND", "Không tìm thấy cuộc hội thoại.");
        }

        // Bước 2: Đối soát khóa tạm hết hạn trên thanh_viens (chạy ở REQUIRES_NEW) TRƯỚC khi giữ khóa tin_dangs/hoi_thoais
        UUID counterpartyId = header.buyerId().equals(userId) ? header.sellerId() : header.buyerId();
        reconcileTemporaryLockIfApplicable(counterpartyId);

        // Bước 3: Nếu là mutation, khóa tin_dangs FOR SHARE trước rồi mới khóa hoi_thoais FOR UPDATE (thứ tự thanh_viens -> tin_dangs -> hoi_thoais -> tin_nhans)
        if (forUpdate) {
            if (header.listingId() != null) {
                db.queryForList(
                        "SELECT ma_tin FROM tin_dangs WHERE ma_tin = ? FOR SHARE",
                        UUID.class,
                        header.listingId());
            }
            List<UUID> locked = db.queryForList(
                    "SELECT ma_hoi_thoai FROM hoi_thoais WHERE ma_hoi_thoai = ? AND (nguoi_mua_id = ? OR nguoi_ban_id = ?) FOR UPDATE",
                    UUID.class,
                    conversationId,
                    userId,
                    userId);
            if (locked.isEmpty()) {
                throw new AuthFailure(404, "CONVERSATION_NOT_FOUND", "Không tìm thấy cuộc hội thoại.");
            }
        }

        String sql = """
                SELECT h.ma_hoi_thoai, h.ma_tin,
                       t.tieu_de AS listing_title,
                       t.mo_ta AS listing_description,
                       t.gia_vnd AS listing_price,
                       t.hinh_thuc AS listing_type,
                       t.trang_thai AS listing_status,
                       t.expires_at AS listing_expires_at,
                       h.nguoi_mua_id, bm.ho_ten AS buyer_name, bm.trang_thai_tai_khoan AS buyer_status,
                       h.nguoi_ban_id, sm.ho_ten AS seller_name, sm.trang_thai_tai_khoan AS seller_status,
                       h.gia_thoa_thuan, h.de_nghi_da_dong_y_id,
                       po.ma_tin_nhan AS po_id, po.gia_de_nghi AS po_price, po.nguoi_gui_id AS po_sender_id,
                       h.version, h.thoi_diem_tao, h.updated_at
                FROM hoi_thoais h
                JOIN thanh_viens bm ON bm.user_id = h.nguoi_mua_id
                JOIN thanh_viens sm ON sm.user_id = h.nguoi_ban_id
                LEFT JOIN tin_dangs t ON t.ma_tin = h.ma_tin
                LEFT JOIN tin_nhans po ON po.ma_hoi_thoai = h.ma_hoi_thoai
                     AND po.loai_tin_nhan = 'DE_NGHI_GIA'
                     AND po.trang_thai_de_nghi = 'CHO_PHAN_HOI'
                WHERE h.ma_hoi_thoai = ?
                """;
        List<ConversationRow> rows = db.query(sql, this::mapConversationRow, conversationId);
        if (rows.isEmpty()) {
            throw new AuthFailure(404, "CONVERSATION_NOT_FOUND", "Không tìm thấy cuộc hội thoại.");
        }
        return rows.getFirst();
    }

    private ConversationRow mapConversationRow(ResultSet rs, int rowNum) throws SQLException {
        UUID listingId = rs.getObject("ma_tin", UUID.class);
        Integer listingPrice = listingId != null ? (Integer) rs.getObject("listing_price") : null;
        String effectiveListingStatus = listingId != null
                ? resolveEffectiveListingStatus(rs.getString("listing_status"), rs.getTimestamp("listing_expires_at"))
                : null;
        Integer agreedPrice = (Integer) rs.getObject("gia_thoa_thuan");
        UUID pendingOfferId = rs.getObject("po_id", UUID.class);
        Integer pendingOfferPrice = (Integer) rs.getObject("po_price");
        UUID pendingOfferSenderId = rs.getObject("po_sender_id", UUID.class);
        return new ConversationRow(
                rs.getObject("ma_hoi_thoai", UUID.class),
                listingId,
                rs.getString("listing_title"),
                rs.getString("listing_description"),
                listingPrice,
                rs.getString("listing_type"),
                effectiveListingStatus,
                rs.getObject("nguoi_mua_id", UUID.class),
                rs.getString("buyer_name"),
                rs.getString("buyer_status"),
                rs.getObject("nguoi_ban_id", UUID.class),
                rs.getString("seller_name"),
                rs.getString("seller_status"),
                agreedPrice,
                rs.getObject("de_nghi_da_dong_y_id", UUID.class),
                pendingOfferId,
                pendingOfferPrice,
                pendingOfferSenderId,
                rs.getLong("version"),
                rs.getTimestamp("thoi_diem_tao").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }

    private ListingSummaryDto toListingSummary(ConversationRow row) {
        if (row.listingId() == null) {
            return null;
        }
        return new ListingSummaryDto(
                row.listingId(),
                row.listingTitle(),
                row.listingDescription(),
                row.listingPrice() != null ? row.listingPrice() : 0,
                row.sellerName(),
                row.sellerId(),
                row.listingType(),
                row.listingStatus());
    }

    private ConversationSummaryDto mapSummaryDtoFromLateralRow(ResultSet rs, UUID currentUserId) throws SQLException {
        ConversationRow row = mapConversationRow(rs, 0);
        boolean isBuyer = row.buyerId().equals(currentUserId);
        UUID counterpartyId = isBuyer ? row.sellerId() : row.buyerId();
        String counterpartyName = isBuyer ? row.sellerName() : row.buyerName();
        String rawCounterpartyStatus = isBuyer ? row.sellerStatus() : row.buyerStatus();
        String publicCounterpartyStatus = sanitizePublicCounterpartyStatus(rawCounterpartyStatus);
        boolean counterpartyRestricted = !PUBLIC_STATUS_ACTIVE.equals(publicCounterpartyStatus);
        CapabilityState cap = computeCapabilities(row, currentUserId);

        UUID lmId = rs.getObject("lm_id", UUID.class);
        ChatMessageDto lastMsg = null;
        if (lmId != null) {
            UUID senderId = rs.getObject("lm_sender_id", UUID.class);
            String msgType = rs.getString("lm_type");
            String offerStatus = rs.getString("lm_offer_status");
            Integer offeredPrice = (Integer) rs.getObject("lm_offered_price");
            Timestamp createdTs = rs.getTimestamp("lm_created_at");
            Timestamp updatedTs = rs.getTimestamp("lm_updated_at");
            Timestamp respondedTs = rs.getTimestamp("lm_responded_at");
            Instant createdAt = createdTs.toInstant();
            Instant updatedAt = updatedTs != null ? updatedTs.toInstant() : createdAt;
            boolean canRespond = cap.canMakeOffer()
                    && MSG_OFFER.equals(msgType)
                    && OFFER_PENDING.equals(offerStatus)
                    && !senderId.equals(currentUserId);
            lastMsg = new ChatMessageDto(
                    lmId,
                    row.id(),
                    rs.getLong("lm_seq"),
                    row.version(),
                    senderId,
                    rs.getString("lm_sender_name"),
                    msgType,
                    msgType,
                    rs.getString("lm_content"),
                    offeredPrice,
                    offerStatus,
                    rs.getString("lm_resp_action"),
                    rs.getString("lm_resp_note"),
                    rs.getObject("lm_resp_by", UUID.class),
                    rs.getObject("lm_parent_id", UUID.class),
                    rs.getString("lm_client_id"),
                    canRespond,
                    createdAt,
                    updatedAt,
                    respondedTs != null ? respondedTs.toInstant() : null);
        }

        return new ConversationSummaryDto(
                row.id(),
                toListingSummary(row),
                row.listingId(),
                row.listingTitle(),
                row.listingPrice(),
                row.listingType(),
                row.listingStatus(),
                new ParticipantDto(row.buyerId(), row.buyerName()),
                row.buyerId(),
                row.buyerName(),
                new ParticipantDto(row.sellerId(), row.sellerName()),
                row.sellerId(),
                row.sellerName(),
                counterpartyId,
                counterpartyName,
                publicCounterpartyStatus,
                counterpartyRestricted,
                row.agreedPrice(),
                row.pendingOfferId(),
                row.pendingOfferPrice(),
                row.pendingOfferSenderId(),
                lastMsg,
                cap.canSendMessage(),
                cap.canMakeOffer(),
                cap.restrictionReason(),
                row.version(),
                row.createdAt(),
                row.updatedAt());
    }

    private ConversationDetailDto buildDetailDto(ConversationRow row, UUID currentUserId) {
        boolean isBuyer = row.buyerId().equals(currentUserId);
        UUID counterpartyId = isBuyer ? row.sellerId() : row.buyerId();
        String counterpartyName = isBuyer ? row.sellerName() : row.buyerName();
        String rawCounterpartyStatus = isBuyer ? row.sellerStatus() : row.buyerStatus();
        String publicCounterpartyStatus = sanitizePublicCounterpartyStatus(rawCounterpartyStatus);
        boolean counterpartyRestricted = !PUBLIC_STATUS_ACTIVE.equals(publicCounterpartyStatus);
        CapabilityState cap = computeCapabilities(row, currentUserId);

        // Lấy MAX_MESSAGE_HISTORY_LIMIT (500) tin nhắn MỚI NHẤT bằng subquery DESC rồi sắp lại ASC
        List<ChatMessageDto> messages = db.query("""
                SELECT * FROM (
                    SELECT m.ma_tin_nhan, m.ma_hoi_thoai, m.sequence_no, m.nguoi_gui_id, u.ho_ten AS sender_name,
                           m.loai_tin_nhan, m.noi_dung, m.gia_de_nghi, m.trang_thai_de_nghi,
                           m.hanh_dong_phan_hoi, m.ghi_chu_phan_hoi, m.phan_hoi_boi_id, m.de_nghi_goc_id,
                           m.client_message_id, m.thoi_diem_gui, m.updated_at, m.thoi_diem_phan_hoi
                    FROM tin_nhans m
                    JOIN thanh_viens u ON u.user_id = m.nguoi_gui_id
                    WHERE m.ma_hoi_thoai = ?
                    ORDER BY m.thoi_diem_gui DESC, m.sequence_no DESC, m.ma_tin_nhan DESC
                    LIMIT ?
                ) recent
                ORDER BY recent.thoi_diem_gui ASC, recent.sequence_no ASC, recent.ma_tin_nhan ASC
                """,
                (rs, i) -> mapMessageDto(rs, currentUserId, cap.canMakeOffer(), row.version()),
                row.id(),
                MAX_MESSAGE_HISTORY_LIMIT);

        String reservationNotice = row.agreedPrice() != null ? ChatDtos.RESERVATION_NOTICE : null;

        return new ConversationDetailDto(
                row.id(),
                currentUserId,
                toListingSummary(row),
                row.listingId(),
                row.listingTitle(),
                row.listingPrice(),
                row.listingType(),
                row.listingStatus(),
                new ParticipantDto(row.buyerId(), row.buyerName()),
                row.buyerId(),
                row.buyerName(),
                new ParticipantDto(row.sellerId(), row.sellerName()),
                row.sellerId(),
                row.sellerName(),
                counterpartyId,
                counterpartyName,
                publicCounterpartyStatus,
                counterpartyRestricted,
                row.agreedPrice(),
                row.agreedOfferId(),
                row.pendingOfferId(),
                row.pendingOfferPrice(),
                row.pendingOfferSenderId(),
                reservationNotice,
                cap.canSendMessage(),
                cap.canMakeOffer(),
                cap.restrictionReason(),
                messages,
                row.version(),
                row.createdAt(),
                row.updatedAt());
    }

    private ChatMessageDto loadSingleMessageDto(UUID messageId, UUID currentUserId, boolean canMakeOffer, long conversationVersion) {
        List<ChatMessageDto> rows = db.query("""
                SELECT m.ma_tin_nhan, m.ma_hoi_thoai, m.sequence_no, m.nguoi_gui_id, u.ho_ten AS sender_name,
                       m.loai_tin_nhan, m.noi_dung, m.gia_de_nghi, m.trang_thai_de_nghi,
                       m.hanh_dong_phan_hoi, m.ghi_chu_phan_hoi, m.phan_hoi_boi_id, m.de_nghi_goc_id,
                       m.client_message_id, m.thoi_diem_gui, m.updated_at, m.thoi_diem_phan_hoi
                FROM tin_nhans m
                JOIN thanh_viens u ON u.user_id = m.nguoi_gui_id
                WHERE m.ma_tin_nhan = ?
                """,
                (rs, i) -> mapMessageDto(rs, currentUserId, canMakeOffer, conversationVersion),
                messageId);
        return rows.getFirst();
    }

    private ChatMessageDto findExistingMessageByClientId(
            UUID conversationId,
            UUID senderId,
            String clientMessageId,
            String expectedType,
            String expectedContent,
            Integer expectedOfferedPrice,
            UUID expectedParentOfferId,
            boolean canMakeOffer,
            long conversationVersion) {
        List<ChatMessageDto> rows = db.query("""
                SELECT m.ma_tin_nhan, m.ma_hoi_thoai, m.sequence_no, m.nguoi_gui_id, u.ho_ten AS sender_name,
                       m.loai_tin_nhan, m.noi_dung, m.gia_de_nghi, m.trang_thai_de_nghi,
                       m.hanh_dong_phan_hoi, m.ghi_chu_phan_hoi, m.phan_hoi_boi_id, m.de_nghi_goc_id,
                       m.client_message_id, m.thoi_diem_gui, m.updated_at, m.thoi_diem_phan_hoi
                FROM tin_nhans m
                JOIN thanh_viens u ON u.user_id = m.nguoi_gui_id
                WHERE m.ma_hoi_thoai = ? AND m.nguoi_gui_id = ? AND m.client_message_id = ?
                """,
                (rs, i) -> mapMessageDto(rs, senderId, canMakeOffer, conversationVersion),
                conversationId,
                senderId,
                clientMessageId);
        if (rows.isEmpty()) {
            return null;
        }
        ChatMessageDto existing = rows.getFirst();
        if (!expectedType.equals(existing.messageType())) {
            throw new AuthFailure(
                    409,
                    "CLIENT_MESSAGE_ID_CONFLICT",
                    "Mã clientMessageId đã được sử dụng cho một tin nhắn khác.");
        }
        if (expectedContent != null && !expectedContent.equals(existing.content())) {
            throw new AuthFailure(
                    409,
                    "CLIENT_MESSAGE_ID_CONFLICT",
                    "Mã clientMessageId đã được sử dụng với nội dung khác.");
        }
        if (expectedOfferedPrice != null && !expectedOfferedPrice.equals(existing.offeredPrice())) {
            throw new AuthFailure(
                    409,
                    "CLIENT_MESSAGE_ID_CONFLICT",
                    "Mã clientMessageId đã được sử dụng với mức giá đề nghị khác.");
        }
        if (expectedParentOfferId != null && !expectedParentOfferId.equals(existing.parentOfferId())) {
            throw new AuthFailure(
                    409,
                    "CLIENT_MESSAGE_ID_CONFLICT",
                    "Mã clientMessageId đã được sử dụng cho một đề nghị giá khác.");
        }
        return existing;
    }

    private ChatMessageDto mapMessageDto(
            ResultSet rs,
            UUID currentUserId,
            boolean canMakeOffer,
            long conversationVersion) throws SQLException {
        UUID senderId = rs.getObject("nguoi_gui_id", UUID.class);
        String messageType = rs.getString("loai_tin_nhan");
        String offerStatus = rs.getString("trang_thai_de_nghi");
        Integer offeredPrice = (Integer) rs.getObject("gia_de_nghi");
        Timestamp createdTs = rs.getTimestamp("thoi_diem_gui");
        Timestamp updatedTs = rs.getTimestamp("updated_at");
        Timestamp respondedTs = rs.getTimestamp("thoi_diem_phan_hoi");

        boolean canRespond = canMakeOffer
                && MSG_OFFER.equals(messageType)
                && OFFER_PENDING.equals(offerStatus)
                && !senderId.equals(currentUserId);

        Instant createdAt = createdTs.toInstant();
        Instant updatedAt = updatedTs != null ? updatedTs.toInstant() : createdAt;

        return new ChatMessageDto(
                rs.getObject("ma_tin_nhan", UUID.class),
                rs.getObject("ma_hoi_thoai", UUID.class),
                rs.getLong("sequence_no"),
                conversationVersion,
                senderId,
                rs.getString("sender_name"),
                messageType,
                messageType,
                rs.getString("noi_dung"),
                offeredPrice,
                offerStatus,
                rs.getString("hanh_dong_phan_hoi"),
                rs.getString("ghi_chu_phan_hoi"),
                rs.getObject("phan_hoi_boi_id", UUID.class),
                rs.getObject("de_nghi_goc_id", UUID.class),
                rs.getString("client_message_id"),
                canRespond,
                createdAt,
                updatedAt,
                respondedTs != null ? respondedTs.toInstant() : null);
    }

    private String normalizeClientMessageId(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String trimmed = raw.strip();
        if (trimmed.length() > MAX_CLIENT_MSG_ID_LENGTH) {
            throw new AuthFailure(400, "INVALID_INPUT", "Mã clientMessageId không được vượt quá 120 ký tự.");
        }
        return trimmed;
    }

    private String normalizeOptionalNote(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String trimmed = raw.strip();
        if (trimmed.length() > MAX_NOTE_LENGTH) {
            throw new AuthFailure(400, "INVALID_MESSAGE", "Ghi chú kèm đề nghị giá không được vượt quá 1000 ký tự.");
        }
        return trimmed;
    }
}
