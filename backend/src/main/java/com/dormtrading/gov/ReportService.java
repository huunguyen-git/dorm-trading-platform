package com.dormtrading.gov;

import com.dormtrading.catalog.media.MediaImageSanitizer;
import com.dormtrading.catalog.media.MediaMagicBytes;
import com.dormtrading.iam.auth.AuthFailure;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class ReportService {

    public static final String TARGET_USER = "NGUOI_DUNG";
    public static final String TARGET_LISTING = "TIN_DANG";
    public static final String EVIDENCE_IMAGE = "HINH_ANH";
    public static final String EVIDENCE_CHAT_LOG = "NHAT_KY_CHAT";

    public static final int MAX_DESCRIPTION_LENGTH = 2000;
    public static final int MAX_CLIENT_REQUEST_ID_LENGTH = 100;
    public static final int MAX_CHAT_MESSAGES_PER_REPORT = 30;
    public static final int MAX_CHAT_OPTIONS_MESSAGES = 50;
    public static final long DEFAULT_MAX_EVIDENCE_SIZE_BYTES = 5L * 1024 * 1024;
    public static final int DEFAULT_MAX_EVIDENCE_PER_REPORT = 5;
    public static final int DEFAULT_MAX_EVIDENCE_FILES_PER_USER = 50;
    public static final long DEFAULT_MAX_EVIDENCE_BYTES_PER_USER = 50L * 1024 * 1024;

    private static final Set<String> VALID_TARGET_TYPES = Set.of(TARGET_USER, TARGET_LISTING);
    private static final Set<String> VALID_GROUP_STATUSES = Set.of("CHO_XU_LY", "DANG_XU_LY", "DA_XU_LY");

    private final JdbcTemplate db;
    private final ReportEvidenceStorage storage;
    private final ObjectMapper json;
    private final Clock clock;
    private final long maxEvidenceSizeBytes;
    private final int maxEvidencePerReport;
    private final int maxEvidenceFilesPerUser;
    private final long maxEvidenceBytesPerUser;

    @Autowired
    public ReportService(
            JdbcTemplate db,
            ReportEvidenceStorage storage,
            ObjectMapper json,
            Clock clock,
            @Value("${app.reports.max-evidence-size-bytes:5242880}") long maxEvidenceSizeBytes,
            @Value("${app.reports.max-evidence-per-report:5}") int maxEvidencePerReport,
            @Value("${app.reports.max-evidence-files-per-user:50}") int maxEvidenceFilesPerUser,
            @Value("${app.reports.max-evidence-bytes-per-user:52428800}") long maxEvidenceBytesPerUser
    ) {
        this.db = db;
        this.storage = storage;
        this.json = json;
        this.clock = clock != null ? clock : Clock.systemUTC();
        this.maxEvidenceSizeBytes = maxEvidenceSizeBytes > 0 ? maxEvidenceSizeBytes : DEFAULT_MAX_EVIDENCE_SIZE_BYTES;
        this.maxEvidencePerReport = maxEvidencePerReport > 0 ? maxEvidencePerReport : DEFAULT_MAX_EVIDENCE_PER_REPORT;
        this.maxEvidenceFilesPerUser = maxEvidenceFilesPerUser > 0 ? maxEvidenceFilesPerUser : DEFAULT_MAX_EVIDENCE_FILES_PER_USER;
        this.maxEvidenceBytesPerUser = maxEvidenceBytesPerUser > 0 ? maxEvidenceBytesPerUser : DEFAULT_MAX_EVIDENCE_BYTES_PER_USER;
    }

    private record ValidatedEvidenceUpload(
            UUID id,
            String storageKey,
            String originalFilename,
            String contentType,
            long sizeBytes,
            String sha256,
            byte[] bytes
    ) {}

    private record ResolvedTarget(String targetType, UUID targetId, String summary) {}

    private record ResolvedChatSnapshot(UUID conversationId, String snapshotJson) {}

    @Transactional(readOnly = true)
    public ReportDtos.ReportCategoryListResponse listCategories(String targetType) {
        String normalizedType = normalizeOptionalTargetType(targetType);
        List<ReportDtos.ReportCategoryDto> items;
        if (normalizedType == null) {
            items = db.query(
                    """
                    SELECT ma_danh_muc, loai_doi_tuong, ten, mo_ta, thu_tu
                    FROM danh_muc_bao_caos
                    WHERE hien_thi = TRUE
                    ORDER BY loai_doi_tuong ASC, thu_tu ASC, ma_danh_muc ASC
                    """,
                    (rs, n) -> new ReportDtos.ReportCategoryDto(
                            rs.getString("ma_danh_muc"),
                            rs.getString("loai_doi_tuong"),
                            rs.getString("ten"),
                            rs.getString("mo_ta"),
                            rs.getInt("thu_tu")
                    )
            );
        } else {
            items = db.query(
                    """
                    SELECT ma_danh_muc, loai_doi_tuong, ten, mo_ta, thu_tu
                    FROM danh_muc_bao_caos
                    WHERE hien_thi = TRUE AND loai_doi_tuong = ?
                    ORDER BY thu_tu ASC, ma_danh_muc ASC
                    """,
                    (rs, n) -> new ReportDtos.ReportCategoryDto(
                            rs.getString("ma_danh_muc"),
                            rs.getString("loai_doi_tuong"),
                            rs.getString("ten"),
                            rs.getString("mo_ta"),
                            rs.getInt("thu_tu")
                    ),
                    normalizedType
            );
        }
        return new ReportDtos.ReportCategoryListResponse(List.copyOf(items));
    }

    public ReportDtos.EvidenceUploadResponse uploadEvidence(Jwt jwt, List<MultipartFile> files) {
        UUID uploaderId = requireUserId(jwt);
        if (files == null || files.isEmpty()) {
            throw new GovernanceFailure(400, "INVALID_MEDIA",
                    "Vui lòng chọn từ 1 đến " + maxEvidencePerReport + " ảnh bằng chứng.");
        }
        if (files.size() > maxEvidencePerReport) {
            throw new GovernanceFailure(400, "INVALID_MEDIA",
                    "Chỉ được tải lên tối đa " + maxEvidencePerReport + " ảnh bằng chứng mỗi lần.");
        }

        Instant createdAt = now();
        ZonedDateTime utcTime = createdAt.atZone(ZoneOffset.UTC);

        List<ValidatedEvidenceUpload> validated = new ArrayList<>(files.size());
        long batchTotalBytes = 0L;
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                throw new GovernanceFailure(400, "INVALID_MEDIA", "Tệp bằng chứng trống hoặc không hợp lệ.");
            }
            if (file.getSize() > maxEvidenceSizeBytes) {
                throw new GovernanceFailure(413, "FILE_TOO_LARGE",
                        "Kích thước mỗi tệp bằng chứng không được vượt quá 5MB.");
            }
            byte[] rawBytes;
            try {
                rawBytes = file.getBytes();
            } catch (IOException e) {
                throw new GovernanceFailure(400, "INVALID_MEDIA", "Không thể đọc dữ liệu tệp bằng chứng.");
            }
            if (rawBytes.length == 0) {
                throw new GovernanceFailure(400, "INVALID_MEDIA", "Tệp bằng chứng trống hoặc không hợp lệ.");
            }
            if (rawBytes.length > maxEvidenceSizeBytes) {
                throw new GovernanceFailure(413, "FILE_TOO_LARGE",
                        "Kích thước mỗi tệp bằng chứng không được vượt quá 5MB.");
            }

            MediaMagicBytes.DetectedImageType detected = MediaMagicBytes.detect(rawBytes)
                    .orElseThrow(() -> new GovernanceFailure(
                            400,
                            "INVALID_MEDIA",
                            "Tệp bằng chứng sai định dạng. Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP."
                    ));

            byte[] sanitizedBytes;
            try {
                sanitizedBytes = MediaImageSanitizer.sanitize(rawBytes, detected, maxEvidenceSizeBytes);
            } catch (AuthFailure e) {
                throw new GovernanceFailure(e.status, e.code, e.getMessage());
            }
            batchTotalBytes += sanitizedBytes.length;

            UUID evidenceId = UUID.randomUUID();
            String storageKey = String.format(
                    "%04d/%02d/%s.%s",
                    utcTime.getYear(),
                    utcTime.getMonthValue(),
                    evidenceId,
                    detected.extension()
            );

            validated.add(new ValidatedEvidenceUpload(
                    evidenceId,
                    storageKey,
                    MediaMagicBytes.sanitizeFilename(file.getOriginalFilename()),
                    detected.contentType(),
                    sanitizedBytes.length,
                    MediaMagicBytes.sha256Hex(sanitizedBytes),
                    sanitizedBytes
            ));
        }

        lockAndVerifyEvidenceQuota(uploaderId, validated.size(), batchTotalBytes);

        List<String> storedKeys = new ArrayList<>(validated.size());
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        for (String key : storedKeys) {
                            storage.deleteQuietly(key);
                        }
                    }
                }
            });
        }

        List<ReportDtos.UploadedEvidenceDto> uploaded = new ArrayList<>(validated.size());
        try {
            Timestamp createdTs = Timestamp.from(createdAt);
            for (ValidatedEvidenceUpload item : validated) {
                storage.store(item.storageKey(), item.bytes());
                storedKeys.add(item.storageKey());

                db.update(
                        """
                        INSERT INTO bao_cao_bang_chungs(
                            id, ma_bao_cao, uploader_id, loai_bang_chung,
                            storage_key, original_filename, content_type, size_bytes, sha256, created_at
                        ) VALUES (?, NULL, ?, 'HINH_ANH', ?, ?, ?, ?, ?, ?)
                        """,
                        item.id(),
                        uploaderId,
                        item.storageKey(),
                        item.originalFilename(),
                        item.contentType(),
                        item.sizeBytes(),
                        item.sha256(),
                        createdTs
                );

                uploaded.add(new ReportDtos.UploadedEvidenceDto(
                        item.id(),
                        item.originalFilename(),
                        item.contentType(),
                        item.sizeBytes()
                ));
            }
        } catch (RuntimeException e) {
            for (String key : storedKeys) {
                storage.deleteQuietly(key);
            }
            throw e;
        }

        return new ReportDtos.EvidenceUploadResponse(List.copyOf(uploaded));
    }

    @Transactional(readOnly = true)
    public ReportDtos.ChatEvidenceOptionsResponse listChatEvidenceOptions(Jwt jwt, String rawTargetType, UUID targetId) {
        UUID reporterId = requireUserId(jwt);
        String targetType = requireTargetType(rawTargetType);
        if (targetId == null) {
            throw new GovernanceFailure(400, "INVALID_INPUT", "Thiếu mã đối tượng cần báo cáo.");
        }

        List<Map<String, Object>> convRows;
        if (TARGET_USER.equals(targetType)) {
            convRows = db.queryForList(
                    """
                    SELECT h.ma_hoi_thoai, h.ma_tin, t.tieu_de AS listing_title,
                           CASE WHEN h.nguoi_mua_id = ? THEN h.nguoi_ban_id ELSE h.nguoi_mua_id END AS counterparty_id,
                           u.ho_ten AS counterparty_name
                    FROM hoi_thoais h
                    LEFT JOIN tin_dangs t ON t.ma_tin = h.ma_tin
                    JOIN thanh_viens u ON u.user_id = CASE WHEN h.nguoi_mua_id = ? THEN h.nguoi_ban_id ELSE h.nguoi_mua_id END
                    WHERE (h.nguoi_mua_id = ? AND h.nguoi_ban_id = ?)
                       OR (h.nguoi_ban_id = ? AND h.nguoi_mua_id = ?)
                    ORDER BY h.thoi_diem_tao DESC
                    LIMIT 20
                    """,
                    reporterId, reporterId, reporterId, targetId, reporterId, targetId
            );
        } else {
            convRows = db.queryForList(
                    """
                    SELECT h.ma_hoi_thoai, h.ma_tin, t.tieu_de AS listing_title,
                           CASE WHEN h.nguoi_mua_id = ? THEN h.nguoi_ban_id ELSE h.nguoi_mua_id END AS counterparty_id,
                           u.ho_ten AS counterparty_name
                    FROM hoi_thoais h
                    LEFT JOIN tin_dangs t ON t.ma_tin = h.ma_tin
                    JOIN thanh_viens u ON u.user_id = CASE WHEN h.nguoi_mua_id = ? THEN h.nguoi_ban_id ELSE h.nguoi_mua_id END
                    WHERE h.ma_tin = ?
                      AND (h.nguoi_mua_id = ? OR h.nguoi_ban_id = ?)
                    ORDER BY h.thoi_diem_tao DESC
                    LIMIT 20
                    """,
                    reporterId, reporterId, targetId, reporterId, reporterId
            );
        }

        List<ReportDtos.ChatConversationOptionDto> result = new ArrayList<>(convRows.size());
        for (Map<String, Object> row : convRows) {
            UUID convId = (UUID) row.get("ma_hoi_thoai");
            List<ReportDtos.ChatMessageOptionDto> newestDesc = db.query(
                    """
                    SELECT m.ma_tin_nhan, m.nguoi_gui_id, u.ho_ten AS sender_name,
                           m.noi_dung, m.gia_de_nghi, m.thoi_diem_gui
                    FROM tin_nhans m
                    JOIN thanh_viens u ON u.user_id = m.nguoi_gui_id
                    WHERE m.ma_hoi_thoai = ?
                    ORDER BY m.thoi_diem_gui DESC, m.ma_tin_nhan DESC
                    LIMIT ?
                    """,
                    (rs, n) -> {
                        Object priceObj = rs.getObject("gia_de_nghi");
                        Integer price = priceObj == null ? null : ((Number) priceObj).intValue();
                        return new ReportDtos.ChatMessageOptionDto(
                                rs.getObject("ma_tin_nhan", UUID.class),
                                rs.getObject("nguoi_gui_id", UUID.class),
                                rs.getString("sender_name"),
                                rs.getString("noi_dung"),
                                price,
                                rs.getTimestamp("thoi_diem_gui").toInstant()
                        );
                    },
                    convId,
                    MAX_CHAT_OPTIONS_MESSAGES
            );
            List<ReportDtos.ChatMessageOptionDto> chronological = new ArrayList<>(newestDesc);
            chronological.sort(Comparator.comparing(ReportDtos.ChatMessageOptionDto::sentAt)
                    .thenComparing(ReportDtos.ChatMessageOptionDto::id));
            if (chronological.isEmpty()) {
                continue;
            }
            result.add(new ReportDtos.ChatConversationOptionDto(
                    convId,
                    (UUID) row.get("ma_tin"),
                    (String) row.get("listing_title"),
                    (UUID) row.get("counterparty_id"),
                    (String) row.get("counterparty_name"),
                    List.copyOf(chronological)
            ));
        }

        return new ReportDtos.ChatEvidenceOptionsResponse(List.copyOf(result));
    }

    public ReportDtos.ReportSubmissionResponse submitReport(Jwt jwt, ReportDtos.CreateReportRequest input) {
        UUID reporterId = requireUserId(jwt);
        if (input == null) {
            throw new GovernanceFailure(400, "INVALID_INPUT", "Thiếu thông tin báo cáo.");
        }

        String targetType = requireTargetType(input.targetType());
        UUID targetId = input.targetId();
        if (targetId == null) {
            throw new GovernanceFailure(400, "INVALID_INPUT", "Thiếu đối tượng cần báo cáo.");
        }

        String categoryCode = normalizeCategoryCode(input.categoryCode());
        if (categoryCode == null) {
            throw new GovernanceFailure(400, "MISSING_CATEGORY", "Vui lòng chọn danh mục báo cáo.");
        }

        String description = normalizeDescription(input.description());
        String clientRequestId = normalizeClientRequestId(input.clientRequestId());

        List<UUID> evidenceIds = deduplicateIds(input.evidenceIds());
        if (evidenceIds.size() > maxEvidencePerReport) {
            throw new GovernanceFailure(400, "TOO_MANY_EVIDENCE",
                    "Chỉ được đính kèm tối đa " + maxEvidencePerReport + " ảnh bằng chứng cho mỗi báo cáo.");
        }

        List<UUID> chatMessageIds = deduplicateIds(input.chatMessageIds());
        if (!chatMessageIds.isEmpty() && input.chatConversationId() == null) {
            throw new GovernanceFailure(400, "INVALID_CHAT_EVIDENCE",
                    "Thiếu mã cuộc hội thoại khi đính kèm tin nhắn làm bằng chứng.");
        }
        if (chatMessageIds.size() > MAX_CHAT_MESSAGES_PER_REPORT) {
            throw new GovernanceFailure(400, "INVALID_CHAT_EVIDENCE",
                    "Chỉ được chọn tối đa " + MAX_CHAT_MESSAGES_PER_REPORT + " tin nhắn trong nhật ký chat.");
        }

        boolean wantsChatLog = input.chatConversationId() != null
                && (Boolean.TRUE.equals(input.attachChatLog()) || !chatMessageIds.isEmpty());

        // Require at least description or evidence (UC-35 §3.3, UC-36 §3.3)
        if (description.isEmpty() && evidenceIds.isEmpty() && !wantsChatLog) {
            throw new GovernanceFailure(400, "MISSING_CONTENT_OR_EVIDENCE",
                    "Vui lòng nhập mô tả báo cáo hoặc đính kèm ít nhất một bằng chứng.");
        }

        // Validate category belongs to targetType and is active
        Map<String, Object> categoryRow = findActiveCategory(categoryCode, targetType);
        if (categoryRow == null) {
            throw new GovernanceFailure(400, "INVALID_CATEGORY",
                    "Danh mục báo cáo không hợp lệ cho đối tượng này.");
        }
        String categoryName = String.valueOf(categoryRow.get("ten"));

        // Lock group key first, then clientRequestId key (strict total order prevents deadlocks)
        advisoryLock("report:grp:" + targetType + ":" + targetId + ":" + categoryCode);
        if (clientRequestId != null) {
            advisoryLock("report:req:" + reporterId + ":" + clientRequestId);
        }

        // Verify reporter account is active
        ensureReporterActive(reporterId);

        // Idempotent replay check (UC-35 §4, UC-36 §4, NFR-03)
        if (clientRequestId != null) {
            ReportDtos.ReportSubmissionResponse replayed = findReplayByClientRequestId(
                    reporterId, clientRequestId, targetType, targetId, categoryCode, categoryName
            );
            if (replayed != null) {
                return replayed;
            }
        }

        // Validate target preconditions (UC-35 §2, UC-36 §2 & §3.3)
        Instant now = now();
        ResolvedTarget resolvedTarget = resolveAndValidateTarget(reporterId, targetType, targetId, now);

        // Reject duplicate open report by same user for same target + category (UC-35 §3.3, UC-36 §3.3)
        List<UUID> existingOpen = db.queryForList(
                """
                SELECT ma_bao_cao
                FROM bao_caos
                WHERE nguoi_bao_cao_id = ?
                  AND loai_doi_tuong = ?
                  AND doi_tuong_id = ?
                  AND danh_muc_vi_pham = ?
                  AND trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY')
                LIMIT 1
                """,
                UUID.class,
                reporterId,
                targetType,
                targetId,
                categoryCode
        );
        if (!existingOpen.isEmpty()) {
            throw new GovernanceFailure(409, "DUPLICATE_REPORT",
                    "Bạn đã gửi báo cáo cho đối tượng và danh mục này; báo cáo trước đó đang được xử lý.");
        }

        // Validate image evidence ownership & availability
        validatePendingImageEvidences(reporterId, evidenceIds);

        // Validate & snapshot chat log if requested
        ResolvedChatSnapshot chatSnapshot = wantsChatLog
                ? buildValidatedChatSnapshot(reporterId, targetType, targetId, input.chatConversationId(), chatMessageIds, now)
                : null;

        // Re-check content/evidence invariant after resolving chat log
        if (description.isEmpty() && evidenceIds.isEmpty() && chatSnapshot == null) {
            throw new GovernanceFailure(400, "MISSING_CONTENT_OR_EVIDENCE",
                    "Vui lòng nhập mô tả báo cáo hoặc đính kèm ít nhất một bằng chứng.");
        }

        // Upsert open report group (nhom_bao_caos)
        Timestamp nowTs = Timestamp.from(now);
        UUID groupId;
        int groupReportCount;
        List<Map<String, Object>> openGroups = db.queryForList(
                """
                SELECT ma_nhom, so_luong_bao_cao
                FROM nhom_bao_caos
                WHERE loai_doi_tuong = ?
                  AND doi_tuong_id = ?
                  AND danh_muc_vi_pham = ?
                  AND trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY')
                FOR UPDATE
                """,
                targetType,
                targetId,
                categoryCode
        );
        if (openGroups.isEmpty()) {
            groupId = UUID.randomUUID();
            groupReportCount = 1;
            db.update(
                    """
                    INSERT INTO nhom_bao_caos(
                        ma_nhom, loai_doi_tuong, doi_tuong_id, danh_muc_vi_pham,
                        trang_thai, so_luong_bao_cao, thoi_diem_tao, thoi_diem_gui_gan_nhat, version
                    ) VALUES (?, ?, ?, ?, 'CHO_XU_LY', 1, ?, ?, 0)
                    """,
                    groupId,
                    targetType,
                    targetId,
                    categoryCode,
                    nowTs,
                    nowTs
            );
        } else {
            Map<String, Object> existingGroup = openGroups.getFirst();
            groupId = (UUID) existingGroup.get("ma_nhom");
            groupReportCount = ((Number) existingGroup.get("so_luong_bao_cao")).intValue() + 1;
            db.update(
                    """
                    UPDATE nhom_bao_caos
                    SET so_luong_bao_cao = ?, thoi_diem_gui_gan_nhat = ?, version = version + 1
                    WHERE ma_nhom = ?
                    """,
                    groupReportCount,
                    nowTs,
                    groupId
            );
        }

        // Prepare canonical evidence reference array for bao_caos.bang_chung
        UUID reportId = UUID.randomUUID();
        UUID chatEvidenceId = chatSnapshot != null ? UUID.randomUUID() : null;
        List<String> evidenceRefs = new ArrayList<>(evidenceIds.size() + (chatEvidenceId != null ? 1 : 0));
        for (UUID eid : evidenceIds) {
            evidenceRefs.add("evidence:" + eid);
        }
        if (chatEvidenceId != null) {
            evidenceRefs.add("chat-log:" + chatEvidenceId);
        }

        // Insert report row (never modifies target reputation or listing status per UC-35/36 §2)
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                    INSERT INTO bao_caos(
                        ma_bao_cao, nguoi_bao_cao_id, loai_doi_tuong, doi_tuong_id,
                        danh_muc_vi_pham, noi_dung, bang_chung, trang_thai,
                        thoi_diem_tao, ma_nhom_bao_cao, client_request_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CHO_XU_LY', ?, ?, ?)
                    """
            );
            ps.setObject(1, reportId);
            ps.setObject(2, reporterId);
            ps.setString(3, targetType);
            ps.setObject(4, targetId);
            ps.setString(5, categoryCode);
            ps.setString(6, description);
            ps.setArray(7, con.createArrayOf("text", evidenceRefs.toArray(new String[0])));
            ps.setTimestamp(8, nowTs);
            ps.setObject(9, groupId);
            ps.setString(10, clientRequestId);
            return ps;
        });

        // Bind uploaded image evidences to this report
        for (UUID eid : evidenceIds) {
            int updated = db.update(
                    """
                    UPDATE bao_cao_bang_chungs
                    SET ma_bao_cao = ?
                    WHERE id = ? AND uploader_id = ? AND ma_bao_cao IS NULL AND loai_bang_chung = 'HINH_ANH'
                    """,
                    reportId,
                    eid,
                    reporterId
            );
            if (updated != 1) {
                throw new GovernanceFailure(400, "INVALID_EVIDENCE",
                        "Tệp bằng chứng không hợp lệ hoặc đã được sử dụng cho báo cáo khác.");
            }
        }

        // Persist immutable chat log snapshot evidence
        if (chatSnapshot != null && chatEvidenceId != null) {
            db.update(
                    """
                    INSERT INTO bao_cao_bang_chungs(
                        id, ma_bao_cao, uploader_id, loai_bang_chung,
                        ma_hoi_thoai, chat_log_snapshot, created_at
                    ) VALUES (?, ?, ?, 'NHAT_KY_CHAT', ?, CAST(? AS JSONB), ?)
                    """,
                    chatEvidenceId,
                    reportId,
                    reporterId,
                    chatSnapshot.conversationId(),
                    chatSnapshot.snapshotJson(),
                    nowTs
            );
        }

        return new ReportDtos.ReportSubmissionResponse(
                reportId,
                groupId,
                groupReportCount,
                targetType,
                targetId,
                resolvedTarget.summary(),
                categoryCode,
                categoryName,
                description,
                "CHO_XU_LY",
                evidenceIds.size(),
                chatSnapshot != null,
                now,
                false
        );
    }

    @Transactional(readOnly = true)
    public GovernanceService.Page<ReportDtos.MyReportSummaryDto> listMyReports(Jwt jwt, int page, int size) {
        UUID reporterId = requireUserId(jwt);
        validatePageBounds(page, size);

        long total = Objects.requireNonNullElse(
                db.queryForObject(
                        "SELECT COUNT(*) FROM bao_caos WHERE nguoi_bao_cao_id = ?",
                        Long.class,
                        reporterId
                ),
                0L
        );

        List<ReportDtos.MyReportSummaryDto> items = db.query(
                """
                SELECT b.ma_bao_cao, b.ma_nhom_bao_cao, b.loai_doi_tuong, b.doi_tuong_id,
                       b.danh_muc_vi_pham, COALESCE(c.ten, b.danh_muc_vi_pham) AS category_name,
                       b.noi_dung, b.trang_thai, b.thoi_diem_tao,
                       CASE
                           WHEN b.loai_doi_tuong = 'NGUOI_DUNG' THEN COALESCE(u.ho_ten, 'Người dùng')
                           ELSE COALESCE(t.tieu_de, 'Tin đăng')
                       END AS target_summary,
                       (SELECT COUNT(*) FROM bao_cao_bang_chungs e
                        WHERE e.ma_bao_cao = b.ma_bao_cao AND e.loai_bang_chung = 'HINH_ANH')::int AS image_count,
                       EXISTS (SELECT 1 FROM bao_cao_bang_chungs e
                        WHERE e.ma_bao_cao = b.ma_bao_cao AND e.loai_bang_chung = 'NHAT_KY_CHAT') AS has_chat_log
                FROM bao_caos b
                LEFT JOIN danh_muc_bao_caos c ON c.ma_danh_muc = b.danh_muc_vi_pham
                LEFT JOIN thanh_viens u ON b.loai_doi_tuong = 'NGUOI_DUNG' AND u.user_id = b.doi_tuong_id
                LEFT JOIN tin_dangs t ON b.loai_doi_tuong = 'TIN_DANG' AND t.ma_tin = b.doi_tuong_id
                WHERE b.nguoi_bao_cao_id = ?
                ORDER BY b.thoi_diem_tao DESC, b.ma_bao_cao DESC
                LIMIT ? OFFSET ?
                """,
                (rs, n) -> new ReportDtos.MyReportSummaryDto(
                        rs.getObject("ma_bao_cao", UUID.class),
                        rs.getObject("ma_nhom_bao_cao", UUID.class),
                        rs.getString("loai_doi_tuong"),
                        rs.getObject("doi_tuong_id", UUID.class),
                        rs.getString("target_summary"),
                        rs.getString("danh_muc_vi_pham"),
                        rs.getString("category_name"),
                        rs.getString("noi_dung"),
                        rs.getString("trang_thai"),
                        rs.getInt("image_count"),
                        rs.getBoolean("has_chat_log"),
                        rs.getTimestamp("thoi_diem_tao").toInstant()
                ),
                reporterId,
                size,
                (long) page * size
        );

        return new GovernanceService.Page<>(List.copyOf(items), page, size, total);
    }

    /**
     * Moderator/Senior Admin read-only queue of grouped reports (supports UC-37 / P3-06).
     * Excludes groups where a non-senior moderator is the reporter, reported user, or reported listing owner (UC-37 §4).
     */
    @Transactional(readOnly = true)
    public GovernanceService.Page<ReportDtos.AdminReportGroupDto> listAdminReportGroups(
            Jwt actor,
            boolean isSeniorAdmin,
            String statusFilter,
            String targetTypeFilter,
            int page,
            int size
    ) {
        UUID actorId = requireUserId(actor);
        validatePageBounds(page, size);

        String normalizedStatus = normalizeOptionalStatus(statusFilter);
        String normalizedType = normalizeOptionalTargetType(targetTypeFilter);

        StringBuilder where = new StringBuilder("WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (normalizedStatus != null) {
            where.append(" AND g.trang_thai = ?");
            params.add(normalizedStatus);
        }
        if (normalizedType != null) {
            where.append(" AND g.loai_doi_tuong = ?");
            params.add(normalizedType);
        }
        if (!isSeniorAdmin) {
            // UC-37 §4 conflict-of-interest exclusion
            where.append("""
                     AND NOT (g.loai_doi_tuong = 'NGUOI_DUNG' AND g.doi_tuong_id = ?)
                     AND NOT (g.loai_doi_tuong = 'TIN_DANG' AND EXISTS (
                         SELECT 1 FROM tin_dangs t2 WHERE t2.ma_tin = g.doi_tuong_id AND t2.nguoi_dang_id = ?
                     ))
                     AND NOT EXISTS (
                         SELECT 1 FROM bao_caos b2 WHERE b2.ma_nhom_bao_cao = g.ma_nhom AND b2.nguoi_bao_cao_id = ?
                     )
                    """);
            params.add(actorId);
            params.add(actorId);
            params.add(actorId);
        }

        long total = Objects.requireNonNullElse(
                db.queryForObject("SELECT COUNT(*) FROM nhom_bao_caos g " + where, Long.class, params.toArray()),
                0L
        );

        List<Object> queryParams = new ArrayList<>(params);
        queryParams.add(size);
        queryParams.add((long) page * size);

        List<Map<String, Object>> groupRows = db.queryForList(
                """
                SELECT g.ma_nhom, g.loai_doi_tuong, g.doi_tuong_id, g.danh_muc_vi_pham,
                       COALESCE(c.ten, g.danh_muc_vi_pham) AS category_name,
                       g.trang_thai, g.so_luong_bao_cao, g.thoi_diem_tao,
                       g.thoi_diem_gui_gan_nhat, g.nguoi_xu_ly_id,
                       CASE
                           WHEN g.loai_doi_tuong = 'NGUOI_DUNG' THEN COALESCE(u.ho_ten, 'Người dùng')
                           ELSE COALESCE(t.tieu_de, 'Tin đăng')
                       END AS target_summary
                FROM nhom_bao_caos g
                LEFT JOIN danh_muc_bao_caos c ON c.ma_danh_muc = g.danh_muc_vi_pham
                LEFT JOIN thanh_viens u ON g.loai_doi_tuong = 'NGUOI_DUNG' AND u.user_id = g.doi_tuong_id
                LEFT JOIN tin_dangs t ON g.loai_doi_tuong = 'TIN_DANG' AND t.ma_tin = g.doi_tuong_id
                """ + where + " ORDER BY g.thoi_diem_gui_gan_nhat DESC, g.ma_nhom DESC LIMIT ? OFFSET ?",
                queryParams.toArray()
        );

        List<ReportDtos.AdminReportGroupDto> groups = new ArrayList<>(groupRows.size());
        for (Map<String, Object> row : groupRows) {
            UUID groupId = (UUID) row.get("ma_nhom");
            List<ReportDtos.AdminReportEntryDto> entries = loadGroupReportEntries(groupId);
            groups.add(new ReportDtos.AdminReportGroupDto(
                    groupId,
                    String.valueOf(row.get("loai_doi_tuong")),
                    (UUID) row.get("doi_tuong_id"),
                    String.valueOf(row.get("target_summary")),
                    String.valueOf(row.get("danh_muc_vi_pham")),
                    String.valueOf(row.get("category_name")),
                    String.valueOf(row.get("trang_thai")),
                    ((Number) row.get("so_luong_bao_cao")).intValue(),
                    ((Timestamp) row.get("thoi_diem_tao")).toInstant(),
                    ((Timestamp) row.get("thoi_diem_gui_gan_nhat")).toInstant(),
                    (UUID) row.get("nguoi_xu_ly_id"),
                    entries
            ));
        }

        return new GovernanceService.Page<>(List.copyOf(groups), page, size, total);
    }

    /**
     * Strict NFR-01 / UC-35 §4 / UC-36 §4 evidence access:
     * Only Moderators and Senior Admins may access attached report evidence or chat logs.
     */
    @Transactional(readOnly = true)
    public ReportDtos.EvidenceDownloadResult loadEvidenceForAdmin(Jwt actor, UUID evidenceId, boolean isSeniorAdmin) {
        UUID actorId = requireUserId(actor);
        if (evidenceId == null) {
            throw new GovernanceFailure(400, "INVALID_INPUT", "Mã bằng chứng không hợp lệ.");
        }

        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT e.id, e.ma_bao_cao, e.loai_bang_chung, e.storage_key, e.content_type,
                       e.size_bytes, e.chat_log_snapshot::text AS chat_log_json,
                       b.nguoi_bao_cao_id, b.loai_doi_tuong, b.doi_tuong_id,
                       t.nguoi_dang_id AS listing_owner_id
                FROM bao_cao_bang_chungs e
                LEFT JOIN bao_caos b ON b.ma_bao_cao = e.ma_bao_cao
                LEFT JOIN tin_dangs t ON b.loai_doi_tuong = 'TIN_DANG' AND t.ma_tin = b.doi_tuong_id
                WHERE e.id = ?
                """,
                evidenceId
        );
        if (rows.isEmpty()) {
            throw new GovernanceFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy tệp bằng chứng.");
        }
        Map<String, Object> row = rows.getFirst();
        UUID reportId = (UUID) row.get("ma_bao_cao");
        if (reportId == null) {
            throw new GovernanceFailure(404, "EVIDENCE_NOT_FOUND", "Không tìm thấy tệp bằng chứng.");
        }

        if (!isSeniorAdmin) {
            UUID reporterId = (UUID) row.get("nguoi_bao_cao_id");
            String targetType = String.valueOf(row.get("loai_doi_tuong"));
            UUID targetId = (UUID) row.get("doi_tuong_id");
            UUID listingOwnerId = (UUID) row.get("listing_owner_id");
            boolean conflict = actorId.equals(reporterId)
                    || (TARGET_USER.equals(targetType) && actorId.equals(targetId))
                    || (TARGET_LISTING.equals(targetType) && actorId.equals(listingOwnerId));
            if (conflict) {
                throw new GovernanceFailure(403, "CONFLICT_OF_INTEREST",
                        "Bạn không có quyền xem bằng chứng của báo cáo liên quan đến chính mình.");
            }
        }

        String evidenceType = String.valueOf(row.get("loai_bang_chung"));
        if (EVIDENCE_CHAT_LOG.equals(evidenceType)) {
            String chatJson = String.valueOf(row.get("chat_log_json"));
            return new ReportDtos.EvidenceDownloadResult(
                    evidenceId,
                    EVIDENCE_CHAT_LOG,
                    "application/json",
                    chatJson.getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
                    null,
                    chatJson
            );
        }

        String storageKey = (String) row.get("storage_key");
        String contentType = (String) row.get("content_type");
        long dbSize = ((Number) row.get("size_bytes")).longValue();
        Resource resource = storage.loadAsResource(storageKey);
        long resolvedSize;
        try {
            resolvedSize = resource.contentLength();
        } catch (IOException e) {
            resolvedSize = dbSize;
        }
        return new ReportDtos.EvidenceDownloadResult(
                evidenceId,
                EVIDENCE_IMAGE,
                contentType,
                resolvedSize,
                resource,
                null
        );
    }

    private List<ReportDtos.AdminReportEntryDto> loadGroupReportEntries(UUID groupId) {
        List<Map<String, Object>> reportRows = db.queryForList(
                """
                SELECT b.ma_bao_cao, b.nguoi_bao_cao_id, u.ho_ten AS reporter_name,
                       b.noi_dung, b.trang_thai, b.thoi_diem_tao
                FROM bao_caos b
                JOIN thanh_viens u ON u.user_id = b.nguoi_bao_cao_id
                WHERE b.ma_nhom_bao_cao = ?
                ORDER BY b.thoi_diem_tao DESC, b.ma_bao_cao DESC
                """,
                groupId
        );
        List<ReportDtos.AdminReportEntryDto> entries = new ArrayList<>(reportRows.size());
        for (Map<String, Object> r : reportRows) {
            UUID reportId = (UUID) r.get("ma_bao_cao");
            List<ReportDtos.AdminEvidenceMetadataDto> evidences = db.query(
                    """
                    SELECT id, loai_bang_chung, original_filename, content_type, size_bytes, ma_hoi_thoai, created_at
                    FROM bao_cao_bang_chungs
                    WHERE ma_bao_cao = ?
                    ORDER BY created_at ASC, id ASC
                    """,
                    (rs, n) -> {
                        Object sizeObj = rs.getObject("size_bytes");
                        Long sizeVal = sizeObj == null ? null : ((Number) sizeObj).longValue();
                        return new ReportDtos.AdminEvidenceMetadataDto(
                                rs.getObject("id", UUID.class),
                                rs.getString("loai_bang_chung"),
                                rs.getString("original_filename"),
                                rs.getString("content_type"),
                                sizeVal,
                                rs.getObject("ma_hoi_thoai", UUID.class),
                                rs.getTimestamp("created_at").toInstant()
                        );
                    },
                    reportId
            );
            entries.add(new ReportDtos.AdminReportEntryDto(
                    reportId,
                    (UUID) r.get("nguoi_bao_cao_id"),
                    String.valueOf(r.get("reporter_name")),
                    String.valueOf(r.get("noi_dung")),
                    String.valueOf(r.get("trang_thai")),
                    ((Timestamp) r.get("thoi_diem_tao")).toInstant(),
                    List.copyOf(evidences)
            ));
        }
        return List.copyOf(entries);
    }

    private ReportDtos.ReportSubmissionResponse findReplayByClientRequestId(
            UUID reporterId,
            String clientRequestId,
            String targetType,
            UUID targetId,
            String categoryCode,
            String categoryName
    ) {
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT b.ma_bao_cao, b.ma_nhom_bao_cao, b.loai_doi_tuong, b.doi_tuong_id,
                       b.danh_muc_vi_pham, b.noi_dung, b.trang_thai, b.thoi_diem_tao,
                       COALESCE(g.so_luong_bao_cao, 1) AS group_count,
                       CASE
                           WHEN b.loai_doi_tuong = 'NGUOI_DUNG' THEN COALESCE(u.ho_ten, 'Người dùng')
                           ELSE COALESCE(t.tieu_de, 'Tin đăng')
                       END AS target_summary,
                       (SELECT COUNT(*) FROM bao_cao_bang_chungs e
                        WHERE e.ma_bao_cao = b.ma_bao_cao AND e.loai_bang_chung = 'HINH_ANH')::int AS image_count,
                       EXISTS (SELECT 1 FROM bao_cao_bang_chungs e
                        WHERE e.ma_bao_cao = b.ma_bao_cao AND e.loai_bang_chung = 'NHAT_KY_CHAT') AS has_chat_log
                FROM bao_caos b
                LEFT JOIN nhom_bao_caos g ON g.ma_nhom = b.ma_nhom_bao_cao
                LEFT JOIN thanh_viens u ON b.loai_doi_tuong = 'NGUOI_DUNG' AND u.user_id = b.doi_tuong_id
                LEFT JOIN tin_dangs t ON b.loai_doi_tuong = 'TIN_DANG' AND t.ma_tin = b.doi_tuong_id
                WHERE b.nguoi_bao_cao_id = ? AND b.client_request_id = ?
                LIMIT 1
                """,
                reporterId,
                clientRequestId
        );
        if (rows.isEmpty()) {
            return null;
        }
        Map<String, Object> existing = rows.getFirst();
        if (!targetType.equals(existing.get("loai_doi_tuong"))
                || !targetId.equals(existing.get("doi_tuong_id"))
                || !categoryCode.equals(existing.get("danh_muc_vi_pham"))) {
            throw new GovernanceFailure(409, "CLIENT_REQUEST_ID_CONFLICT",
                    "Mã yêu cầu này đã được sử dụng cho một báo cáo khác.");
        }
        return new ReportDtos.ReportSubmissionResponse(
                (UUID) existing.get("ma_bao_cao"),
                (UUID) existing.get("ma_nhom_bao_cao"),
                ((Number) existing.get("group_count")).intValue(),
                targetType,
                targetId,
                String.valueOf(existing.get("target_summary")),
                categoryCode,
                categoryName,
                String.valueOf(existing.get("noi_dung")),
                String.valueOf(existing.get("trang_thai")),
                ((Number) existing.get("image_count")).intValue(),
                Boolean.TRUE.equals(existing.get("has_chat_log")),
                ((Timestamp) existing.get("thoi_diem_tao")).toInstant(),
                true
        );
    }

    private ResolvedTarget resolveAndValidateTarget(UUID reporterId, String targetType, UUID targetId, Instant now) {
        if (TARGET_USER.equals(targetType)) {
            if (targetId.equals(reporterId)) {
                throw new GovernanceFailure(400, "SELF_REPORT_NOT_ALLOWED",
                        "Bạn không thể tự báo cáo tài khoản của chính mình.");
            }
            List<Map<String, Object>> users = db.queryForList(
                    "SELECT user_id, ho_ten, trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ?",
                    targetId
            );
            if (users.isEmpty() || "VO_HIEU_HOA".equals(users.getFirst().get("trang_thai_tai_khoan"))) {
                throw new GovernanceFailure(404, "TARGET_NOT_FOUND", "Không tìm thấy tài khoản cần báo cáo.");
            }
            return new ResolvedTarget(TARGET_USER, targetId, String.valueOf(users.getFirst().get("ho_ten")));
        }

        List<Map<String, Object>> listings = db.queryForList(
                """
                SELECT t.ma_tin, t.nguoi_dang_id, t.tieu_de, t.trang_thai, t.expires_at,
                       u.trang_thai_tai_khoan AS owner_status
                FROM tin_dangs t
                JOIN thanh_viens u ON u.user_id = t.nguoi_dang_id
                WHERE t.ma_tin = ?
                """,
                targetId
        );
        if (listings.isEmpty()) {
            throw new GovernanceFailure(404, "LISTING_NOT_FOUND", "Không tìm thấy tin đăng cần báo cáo.");
        }
        Map<String, Object> listing = listings.getFirst();
        UUID ownerId = (UUID) listing.get("nguoi_dang_id");
        if (ownerId.equals(reporterId)) {
            throw new GovernanceFailure(400, "SELF_REPORT_NOT_ALLOWED",
                    "Bạn không thể báo cáo tin đăng của chính mình.");
        }
        String listingStatus = String.valueOf(listing.get("trang_thai"));
        String ownerStatus = String.valueOf(listing.get("owner_status"));
        Timestamp expiresAtTs = (Timestamp) listing.get("expires_at");
        boolean expired = expiresAtTs != null && !expiresAtTs.toInstant().isAfter(now);
        boolean ownerHidden = "BI_KHOA".equals(ownerStatus) || "VO_HIEU_HOA".equals(ownerStatus);
        if (!"CONG_KHAI".equals(listingStatus) || expired || ownerHidden) {
            throw new GovernanceFailure(409, "LISTING_NOT_AVAILABLE",
                    "Tin đăng không còn công khai hoặc đã bị ẩn/gỡ nên không thể báo cáo.");
        }
        return new ResolvedTarget(TARGET_LISTING, targetId, String.valueOf(listing.get("tieu_de")));
    }

    private void validatePendingImageEvidences(UUID reporterId, List<UUID> evidenceIds) {
        for (UUID eid : evidenceIds) {
            List<Map<String, Object>> rows = db.queryForList(
                    """
                    SELECT id, uploader_id, ma_bao_cao, loai_bang_chung
                    FROM bao_cao_bang_chungs
                    WHERE id = ?
                    FOR UPDATE
                    """,
                    eid
            );
            if (rows.isEmpty()) {
                throw new GovernanceFailure(400, "INVALID_EVIDENCE",
                        "Tệp bằng chứng không tồn tại hoặc đã bị xóa.");
            }
            Map<String, Object> row = rows.getFirst();
            if (!EVIDENCE_IMAGE.equals(row.get("loai_bang_chung"))
                    || !reporterId.equals(row.get("uploader_id"))
                    || row.get("ma_bao_cao") != null) {
                throw new GovernanceFailure(400, "INVALID_EVIDENCE",
                        "Tệp bằng chứng không hợp lệ hoặc đã được sử dụng cho báo cáo khác.");
            }
        }
    }

    private ResolvedChatSnapshot buildValidatedChatSnapshot(
            UUID reporterId,
            String targetType,
            UUID targetId,
            UUID conversationId,
            List<UUID> requestedMessageIds,
            Instant capturedAt
    ) {
        List<Map<String, Object>> convRows = db.queryForList(
                """
                SELECT ma_hoi_thoai, ma_tin, nguoi_mua_id, nguoi_ban_id
                FROM hoi_thoais
                WHERE ma_hoi_thoai = ?
                """,
                conversationId
        );
        if (convRows.isEmpty()) {
            throw new GovernanceFailure(400, "INVALID_CHAT_EVIDENCE",
                    "Cuộc hội thoại đính kèm không tồn tại.");
        }
        Map<String, Object> conv = convRows.getFirst();
        UUID buyerId = (UUID) conv.get("nguoi_mua_id");
        UUID sellerId = (UUID) conv.get("nguoi_ban_id");
        UUID listingId = (UUID) conv.get("ma_tin");

        if (!reporterId.equals(buyerId) && !reporterId.equals(sellerId)) {
            throw new GovernanceFailure(403, "FORBIDDEN",
                    "Bạn chỉ có thể đính kèm nhật ký từ cuộc hội thoại của chính mình.");
        }

        UUID counterpartyId = reporterId.equals(buyerId) ? sellerId : buyerId;
        if (TARGET_USER.equals(targetType) && !targetId.equals(counterpartyId)) {
            throw new GovernanceFailure(400, "INVALID_CHAT_EVIDENCE",
                    "Cuộc hội thoại không khớp với người dùng đang bị báo cáo.");
        }
        if (TARGET_LISTING.equals(targetType) && !targetId.equals(listingId)) {
            throw new GovernanceFailure(400, "INVALID_CHAT_EVIDENCE",
                    "Cuộc hội thoại không gắn với tin đăng đang bị báo cáo.");
        }

        List<Map<String, Object>> messageRows;
        if (requestedMessageIds.isEmpty()) {
            messageRows = db.queryForList(
                    """
                    SELECT m.ma_tin_nhan, m.nguoi_gui_id, u.ho_ten AS sender_name,
                           m.noi_dung, m.gia_de_nghi, m.thoi_diem_gui
                    FROM tin_nhans m
                    JOIN thanh_viens u ON u.user_id = m.nguoi_gui_id
                    WHERE m.ma_hoi_thoai = ?
                    ORDER BY m.thoi_diem_gui DESC, m.ma_tin_nhan DESC
                    LIMIT ?
                    """,
                    conversationId,
                    MAX_CHAT_MESSAGES_PER_REPORT
            );
        } else {
            UUID[] idArray = requestedMessageIds.toArray(new UUID[0]);
            messageRows = db.query(
                    con -> {
                        PreparedStatement ps = con.prepareStatement(
                                """
                                SELECT m.ma_tin_nhan, m.nguoi_gui_id, u.ho_ten AS sender_name,
                                       m.noi_dung, m.gia_de_nghi, m.thoi_diem_gui
                                FROM tin_nhans m
                                JOIN thanh_viens u ON u.user_id = m.nguoi_gui_id
                                WHERE m.ma_hoi_thoai = ? AND m.ma_tin_nhan = ANY(?)
                                ORDER BY m.thoi_diem_gui ASC, m.ma_tin_nhan ASC
                                """
                        );
                        ps.setObject(1, conversationId);
                        ps.setArray(2, con.createArrayOf("uuid", idArray));
                        return ps;
                    },
                    (rs, n) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("ma_tin_nhan", rs.getObject("ma_tin_nhan", UUID.class));
                        m.put("nguoi_gui_id", rs.getObject("nguoi_gui_id", UUID.class));
                        m.put("sender_name", rs.getString("sender_name"));
                        m.put("noi_dung", rs.getString("noi_dung"));
                        m.put("gia_de_nghi", rs.getObject("gia_de_nghi"));
                        m.put("thoi_diem_gui", rs.getTimestamp("thoi_diem_gui"));
                        return m;
                    }
            );
            if (messageRows.size() != requestedMessageIds.size()) {
                throw new GovernanceFailure(400, "INVALID_CHAT_EVIDENCE",
                        "Một hoặc nhiều tin nhắn được chọn không thuộc cuộc hội thoại này.");
            }
        }

        if (messageRows.isEmpty()) {
            throw new GovernanceFailure(400, "INVALID_CHAT_EVIDENCE",
                    "Cuộc hội thoại chưa có tin nhắn nào để đính kèm làm bằng chứng.");
        }

        List<Map<String, Object>> normalizedMessages = new ArrayList<>(messageRows.size());
        messageRows.stream()
                .sorted(Comparator
                        .comparing((Map<String, Object> m) -> ((Timestamp) m.get("thoi_diem_gui")).toInstant())
                        .thenComparing(m -> ((UUID) m.get("ma_tin_nhan")).toString()))
                .forEach(m -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("id", m.get("ma_tin_nhan").toString());
                    entry.put("senderId", m.get("nguoi_gui_id").toString());
                    entry.put("senderName", m.get("sender_name"));
                    entry.put("content", m.get("noi_dung"));
                    Object priceObj = m.get("gia_de_nghi");
                    entry.put("offeredPrice", priceObj == null ? null : ((Number) priceObj).intValue());
                    entry.put("sentAt", ((Timestamp) m.get("thoi_diem_gui")).toInstant().toString());
                    normalizedMessages.add(entry);
                });

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("conversationId", conversationId.toString());
        snapshot.put("listingId", listingId != null ? listingId.toString() : null);
        snapshot.put("capturedAt", capturedAt.toString());
        snapshot.put("messageCount", normalizedMessages.size());
        snapshot.put("messages", normalizedMessages);

        try {
            return new ResolvedChatSnapshot(conversationId, json.writeValueAsString(snapshot));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize chat log evidence snapshot", e);
        }
    }

    private void lockAndVerifyEvidenceQuota(UUID uploaderId, int incomingFileCount, long incomingBytes) {
        List<String> statuses = db.queryForList(
                "SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ? FOR UPDATE",
                String.class,
                uploaderId
        );
        if (statuses.isEmpty()) {
            throw new GovernanceFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }
        if (!"HOAT_DONG".equals(statuses.getFirst())) {
            throw new GovernanceFailure(403, "FORBIDDEN", "Tài khoản không ở trạng thái hoạt động để tải bằng chứng.");
        }

        Map<String, Object> usage = db.queryForMap(
                """
                SELECT COUNT(*)::int AS file_count, COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes
                FROM bao_cao_bang_chungs
                WHERE uploader_id = ? AND loai_bang_chung = 'HINH_ANH'
                """,
                uploaderId
        );
        int existingCount = ((Number) usage.get("file_count")).intValue();
        long existingBytes = ((Number) usage.get("total_bytes")).longValue();

        if (existingCount + incomingFileCount > maxEvidenceFilesPerUser
                || existingBytes + incomingBytes > maxEvidenceBytesPerUser) {
            throw new GovernanceFailure(413, "EVIDENCE_QUOTA_EXCEEDED",
                    "Bạn đã vượt giới hạn lưu trữ tệp bằng chứng cho phép.");
        }
    }

    private void ensureReporterActive(UUID reporterId) {
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT trang_thai_tai_khoan, email_verified, profile_approved FROM thanh_viens WHERE user_id = ?",
                reporterId
        );
        if (rows.isEmpty()) {
            throw new GovernanceFailure(401, "UNAUTHORIZED", "Tài khoản không tồn tại.");
        }
        Map<String, Object> row = rows.getFirst();
        if (!"HOAT_DONG".equals(row.get("trang_thai_tai_khoan"))
                || !Boolean.TRUE.equals(row.get("email_verified"))
                || !Boolean.TRUE.equals(row.get("profile_approved"))) {
            throw new GovernanceFailure(403, "FORBIDDEN",
                    "Tài khoản phải đang hoạt động và đã được kích hoạt để gửi báo cáo.");
        }
    }

    private Map<String, Object> findActiveCategory(String categoryCode, String targetType) {
        List<Map<String, Object>> rows = db.queryForList(
                """
                SELECT ma_danh_muc, ten
                FROM danh_muc_bao_caos
                WHERE ma_danh_muc = ? AND loai_doi_tuong = ? AND hien_thi = TRUE
                """,
                categoryCode,
                targetType
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private void advisoryLock(String key) {
        db.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> {}, key);
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    static UUID requireUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null) {
            throw new GovernanceFailure(401, "UNAUTHORIZED", "Yêu cầu đăng nhập.");
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException e) {
            throw new GovernanceFailure(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ.");
        }
    }

    static String requireTargetType(String raw) {
        String normalized = normalizeOptionalTargetType(raw);
        if (normalized == null) {
            throw new GovernanceFailure(400, "INVALID_TARGET_TYPE",
                    "Loại đối tượng báo cáo phải là NGUOI_DUNG hoặc TIN_DANG.");
        }
        return normalized;
    }

    static String normalizeOptionalTargetType(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String normalized = raw.strip().toUpperCase(Locale.ROOT);
        if (!VALID_TARGET_TYPES.contains(normalized)) {
            throw new GovernanceFailure(400, "INVALID_TARGET_TYPE",
                    "Loại đối tượng báo cáo phải là NGUOI_DUNG hoặc TIN_DANG.");
        }
        return normalized;
    }

    static String normalizeOptionalStatus(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String normalized = raw.strip().toUpperCase(Locale.ROOT);
        if (!VALID_GROUP_STATUSES.contains(normalized)) {
            throw new GovernanceFailure(400, "INVALID_INPUT",
                    "Trạng thái nhóm báo cáo không hợp lệ.");
        }
        return normalized;
    }

    static String normalizeCategoryCode(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String normalized = raw.strip().toUpperCase(Locale.ROOT);
        if (normalized.length() > 100) {
            throw new GovernanceFailure(400, "INVALID_CATEGORY", "Danh mục báo cáo không hợp lệ.");
        }
        return normalized;
    }

    static String normalizeDescription(String raw) {
        if (raw == null) {
            return "";
        }
        String stripped = raw.strip();
        if (stripped.length() > MAX_DESCRIPTION_LENGTH) {
            throw new GovernanceFailure(400, "DESCRIPTION_TOO_LONG",
                    "Mô tả báo cáo không được vượt quá " + MAX_DESCRIPTION_LENGTH + " ký tự.");
        }
        return stripped;
    }

    static String normalizeClientRequestId(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String stripped = raw.strip();
        if (stripped.length() > MAX_CLIENT_REQUEST_ID_LENGTH || stripped.chars().anyMatch(Character::isISOControl)) {
            throw new GovernanceFailure(400, "INVALID_INPUT", "Mã yêu cầu gửi báo cáo không hợp lệ.");
        }
        return stripped;
    }

    static List<UUID> deduplicateIds(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        Set<UUID> unique = new LinkedHashSet<>();
        for (UUID id : ids) {
            if (id == null) {
                throw new GovernanceFailure(400, "INVALID_INPUT", "Danh sách mã đính kèm chứa giá trị rỗng.");
            }
            unique.add(id);
        }
        return List.copyOf(unique);
    }

    private static void validatePageBounds(int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > 1_000_000L) {
            throw new GovernanceFailure(400, "INVALID_INPUT", "Tham số phân trang không hợp lệ.");
        }
    }
}
