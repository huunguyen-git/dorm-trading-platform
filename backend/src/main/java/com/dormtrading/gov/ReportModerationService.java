package com.dormtrading.gov;

import com.dormtrading.review.reputation.ReputationLedgerEntry;
import com.dormtrading.review.reputation.ReputationLedgerService;
import java.sql.Array;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ReportModerationService {
    private static final Set<String> TARGET_TYPES = Set.of("NGUOI_DUNG", "TIN_DANG");
    private static final Set<String> STATUS_FILTERS = Set.of("CHO_XU_LY", "DA_XU_LY");
    private static final Set<String> CONCLUSIONS = Set.of("VI_PHAM", "KHONG_VI_PHAM", "KHONG_HOP_LE", "TRUNG");

    private final JdbcTemplate db;
    private final ReputationLedgerService reputationLedger;
    private final Clock clock;

    public ReportModerationService(JdbcTemplate db, ReputationLedgerService reputationLedger, Clock clock) {
        this.db = db;
        this.reputationLedger = reputationLedger;
        this.clock = clock;
    }

    public record DecisionSummary(UUID decisionId, String conclusion, String penaltyId, String penaltyName,
                                  Integer penaltyPoints, String basis, UUID originalDecisionId,
                                  UUID moderatorId, String moderatorName, Instant decidedAt) {}

    public record ReportGroup(String targetType, UUID targetId, String targetLabel, String targetStatus,
                              String category, long reportCount, Instant latestReportAt, String status,
                              DecisionSummary decision) {}

    public record ReportItem(UUID reportId, UUID reporterId, String reporterName, String reporterStudentId,
                             String description, List<String> evidence, Instant createdAt, String status) {}

    public record ReportGroupDetail(String targetType, UUID targetId, String targetLabel, String targetStatus,
                                    String category, String status, List<ReportItem> reports,
                                    DecisionSummary decision) {}

    public record ActivePenalty(String id, String name, int points, String description) {}

    public record DuplicateCandidate(UUID decisionId, String targetType, UUID targetId, String targetLabel,
                                     String category, String conclusion, Instant decidedAt) {}

    public record ResolveInput(String targetType, UUID targetId, String category, String conclusion,
                               String penaltyId, String basis, UUID originalDecisionId) {}

    public record ResolveResult(UUID decisionId, String conclusion, int updatedReportCount,
                                boolean penaltyApplied, Integer scoreAfter, String accountStatusAfter,
                                boolean listingHidden) {}

    @Transactional(readOnly = true)
    public GovernanceService.Page<ReportGroup> groups(Jwt jwt, String status, String category, String targetType,
                                                      String q, int page, int size) {
        UUID moderatorId = actorId(jwt);
        String effectiveStatus = (status == null || status.isBlank()) ? "CHO_XU_LY" : status.strip();
        if (!STATUS_FILTERS.contains(effectiveStatus)) {
            throw invalid("Trạng thái nhóm báo cáo không hợp lệ.");
        }
        if (targetType != null && !targetType.isBlank() && !TARGET_TYPES.contains(targetType.strip())) {
            throw invalid("Loại đối tượng báo cáo không hợp lệ.");
        }
        bounds(page, size);

        String statusCondition = "CHO_XU_LY".equals(effectiveStatus)
                ? "b.trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY')"
                : "b.trang_thai = 'DA_XU_LY'";

        StringBuilder where = new StringBuilder(" WHERE ").append(statusCondition);
        List<Object> args = new ArrayList<>();

        // UC-37 §4: Hide groups where current moderator is reporter, reported user, or reported listing owner.
        where.append(" AND NOT EXISTS (SELECT 1 FROM bao_caos b2 " +
                "WHERE b2.loai_doi_tuong = b.loai_doi_tuong AND b2.doi_tuong_id = b.doi_tuong_id " +
                "AND b2.danh_muc_vi_pham = b.danh_muc_vi_pham AND b2.nguoi_bao_cao_id = ? " +
                "AND ").append("CHO_XU_LY".equals(effectiveStatus)
                ? "b2.trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY')"
                : "b2.trang_thai = 'DA_XU_LY'").append(")");
        args.add(moderatorId);

        where.append(" AND NOT (b.loai_doi_tuong = 'NGUOI_DUNG' AND b.doi_tuong_id = ?)");
        args.add(moderatorId);
        where.append(" AND NOT (b.loai_doi_tuong = 'TIN_DANG' AND t.nguoi_dang_id = ?)");
        args.add(moderatorId);

        if (category != null && !category.isBlank()) {
            where.append(" AND b.danh_muc_vi_pham = ?");
            args.add(category.strip());
        }
        if (targetType != null && !targetType.isBlank()) {
            where.append(" AND b.loai_doi_tuong = ?");
            args.add(targetType.strip());
        }
        String keyword = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        if (!keyword.isEmpty()) {
            where.append(" AND (position(? IN lower(b.danh_muc_vi_pham)) > 0 " +
                    "OR position(? IN lower(COALESCE(u.ho_ten || ' ' || u.mssv, t.tieu_de, ''))) > 0)");
            args.add(keyword);
            args.add(keyword);
        }

        String joins = " FROM bao_caos b " +
                "LEFT JOIN thanh_viens u ON b.loai_doi_tuong = 'NGUOI_DUNG' AND u.user_id = b.doi_tuong_id " +
                "LEFT JOIN tin_dangs t ON b.loai_doi_tuong = 'TIN_DANG' AND t.ma_tin = b.doi_tuong_id " +
                "LEFT JOIN quyet_dinhs qd ON qd.ma_quyet_dinh = b.quyet_dinh_id " +
                "LEFT JOIN thanh_viens m ON m.user_id = qd.nguoi_ra_quyet_dinh_id";

        String groupBy = " GROUP BY b.loai_doi_tuong, b.doi_tuong_id, b.danh_muc_vi_pham, " +
                "u.ho_ten, u.mssv, u.trang_thai_tai_khoan, t.tieu_de, t.trang_thai, " +
                "qd.ma_quyet_dinh, qd.ket_luan, qd.ma_thang_phat, qd.ten_thang_phat_snapshot, " +
                "qd.diem_tru_snapshot, qd.can_cu, qd.quyet_dinh_goc_id, qd.nguoi_ra_quyet_dinh_id, " +
                "m.ho_ten, qd.thoi_diem";

        Long totalObj = db.queryForObject(
                "SELECT count(*) FROM (SELECT 1" + joins + where + groupBy + ") g",
                Long.class, args.toArray());
        long total = totalObj == null ? 0L : totalObj;

        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(size);
        pageArgs.add((long) page * size);

        String select = "SELECT b.loai_doi_tuong, b.doi_tuong_id, b.danh_muc_vi_pham, " +
                "count(*) AS report_count, max(b.thoi_diem_tao) AS latest_report_at, " +
                "COALESCE(u.ho_ten || ' (' || u.mssv || ')', t.tieu_de, b.doi_tuong_id::text) AS target_label, " +
                "COALESCE(u.trang_thai_tai_khoan, t.trang_thai, 'KHONG_RO') AS target_status, " +
                "qd.ma_quyet_dinh, qd.ket_luan, qd.ma_thang_phat, qd.ten_thang_phat_snapshot, " +
                "qd.diem_tru_snapshot, qd.can_cu, qd.quyet_dinh_goc_id, qd.nguoi_ra_quyet_dinh_id, " +
                "m.ho_ten AS moderator_name, qd.thoi_diem AS decided_at";

        List<ReportGroup> items = db.query(
                select + joins + where + groupBy +
                        " ORDER BY max(b.thoi_diem_tao) DESC, b.loai_doi_tuong, b.doi_tuong_id LIMIT ? OFFSET ?",
                (rs, n) -> {
                    UUID decisionId = rs.getObject("ma_quyet_dinh", UUID.class);
                    DecisionSummary decision = decisionId == null ? null : new DecisionSummary(
                            decisionId,
                            rs.getString("ket_luan"),
                            rs.getString("ma_thang_phat"),
                            rs.getString("ten_thang_phat_snapshot"),
                            (Integer) rs.getObject("diem_tru_snapshot"),
                            rs.getString("can_cu"),
                            rs.getObject("quyet_dinh_goc_id", UUID.class),
                            rs.getObject("nguoi_ra_quyet_dinh_id", UUID.class),
                            rs.getString("moderator_name"),
                            toInstant(rs.getTimestamp("decided_at")));
                    return new ReportGroup(
                            rs.getString("loai_doi_tuong"),
                            rs.getObject("doi_tuong_id", UUID.class),
                            rs.getString("target_label"),
                            rs.getString("target_status"),
                            rs.getString("danh_muc_vi_pham"),
                            rs.getLong("report_count"),
                            toInstant(rs.getTimestamp("latest_report_at")),
                            effectiveStatus,
                            decision);
                },
                pageArgs.toArray());

        return new GovernanceService.Page<>(items, page, size, total);
    }

    @Transactional(readOnly = true)
    public ReportGroupDetail groupDetail(Jwt jwt, String targetType, UUID targetId, String category, String status) {
        UUID moderatorId = actorId(jwt);
        String cleanType = requireTargetType(targetType);
        if (targetId == null) throw invalid("Thiếu mã đối tượng báo cáo.");
        String cleanCategory = requireText(category, 100, "Danh mục vi phạm không hợp lệ.");
        String effectiveStatus = (status == null || status.isBlank()) ? "CHO_XU_LY" : status.strip();
        if (!STATUS_FILTERS.contains(effectiveStatus)) {
            throw invalid("Trạng thái nhóm báo cáo không hợp lệ.");
        }

        String statusCondition = "CHO_XU_LY".equals(effectiveStatus)
                ? "b.trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY')"
                : "b.trang_thai = 'DA_XU_LY'";

        List<Map<String, Object>> rows = db.queryForList(
                "SELECT b.ma_bao_cao, b.nguoi_bao_cao_id, rep.ho_ten AS reporter_name, rep.mssv AS reporter_mssv, " +
                        "b.noi_dung, b.bang_chung, b.thoi_diem_tao, b.trang_thai, b.quyet_dinh_id " +
                        "FROM bao_caos b " +
                        "JOIN thanh_viens rep ON rep.user_id = b.nguoi_bao_cao_id " +
                        "WHERE b.loai_doi_tuong = ? AND b.doi_tuong_id = ? AND b.danh_muc_vi_pham = ? AND " +
                        statusCondition + " ORDER BY b.thoi_diem_tao DESC, b.ma_bao_cao",
                cleanType, targetId, cleanCategory);

        if (rows.isEmpty()) {
            throw missing("Không tìm thấy nhóm báo cáo.");
        }

        TargetInfo target = loadTargetInfo(cleanType, targetId);
        enforceNoConflictOfInterest(moderatorId, cleanType, targetId, target.ownerId(), rows);

        List<ReportItem> reports = rows.stream().map(row -> new ReportItem(
                (UUID) row.get("ma_bao_cao"),
                (UUID) row.get("nguoi_bao_cao_id"),
                (String) row.get("reporter_name"),
                (String) row.get("reporter_mssv"),
                (String) row.get("noi_dung"),
                readEvidence(row.get("bang_chung")),
                toInstant((Timestamp) row.get("thoi_diem_tao")),
                (String) row.get("trang_thai"))).toList();

        UUID decisionId = (UUID) rows.getFirst().get("quyet_dinh_id");
        DecisionSummary decision = decisionId == null ? null : loadDecision(decisionId);

        return new ReportGroupDetail(cleanType, targetId, target.label(), target.status(),
                cleanCategory, effectiveStatus, reports, decision);
    }

    @Transactional(readOnly = true)
    public List<ActivePenalty> activePenalties() {
        return db.query(
                "SELECT ma_thang_phat, ten, diem_tru, mo_ta FROM thang_phats " +
                        "WHERE trang_thai = 'DANG_DUNG' ORDER BY diem_tru ASC, lower(ten)",
                (rs, n) -> new ActivePenalty(
                        rs.getString("ma_thang_phat"),
                        rs.getString("ten"),
                        rs.getInt("diem_tru"),
                        rs.getString("mo_ta")));
    }

    @Transactional(readOnly = true)
    public List<DuplicateCandidate> duplicateCandidates(Jwt jwt) {
        actorId(jwt);
        return db.query(
                "SELECT DISTINCT ON (qd.ma_quyet_dinh) qd.ma_quyet_dinh, b.loai_doi_tuong, b.doi_tuong_id, " +
                        "COALESCE(u.ho_ten || ' (' || u.mssv || ')', t.tieu_de, b.doi_tuong_id::text) AS target_label, " +
                        "b.danh_muc_vi_pham, qd.ket_luan, qd.thoi_diem " +
                        "FROM quyet_dinhs qd " +
                        "JOIN bao_caos b ON b.quyet_dinh_id = qd.ma_quyet_dinh " +
                        "LEFT JOIN thanh_viens u ON b.loai_doi_tuong = 'NGUOI_DUNG' AND u.user_id = b.doi_tuong_id " +
                        "LEFT JOIN tin_dangs t ON b.loai_doi_tuong = 'TIN_DANG' AND t.ma_tin = b.doi_tuong_id " +
                        "WHERE qd.ket_luan <> 'TRUNG' " +
                        "ORDER BY qd.ma_quyet_dinh, qd.thoi_diem DESC LIMIT 50",
                (rs, n) -> new DuplicateCandidate(
                        rs.getObject("ma_quyet_dinh", UUID.class),
                        rs.getString("loai_doi_tuong"),
                        rs.getObject("doi_tuong_id", UUID.class),
                        rs.getString("target_label"),
                        rs.getString("danh_muc_vi_pham"),
                        rs.getString("ket_luan"),
                        toInstant(rs.getTimestamp("thoi_diem"))));
    }

    public ResolveResult resolve(Jwt jwt, ResolveInput input) {
        UUID moderatorId = actorId(jwt);
        if (input == null) throw invalid("Thiếu thông tin quyết định xử lý.");
        String targetType = requireTargetType(input.targetType());
        if (input.targetId() == null) throw invalid("Thiếu mã đối tượng báo cáo.");
        String category = requireText(input.category(), 100, "Danh mục vi phạm không hợp lệ.");
        String conclusion = requireText(input.conclusion(), 40, "Kết luận xử lý không hợp lệ.");
        if (!CONCLUSIONS.contains(conclusion)) {
            throw invalid("Kết luận xử lý không hợp lệ.");
        }

        String penaltyId = null;
        String basis;
        UUID originalDecisionId = null;

        if ("VI_PHAM".equals(conclusion)) {
            penaltyId = requireText(input.penaltyId(), 50, "Vui lòng chọn mức phạt.");
            basis = requireText(input.basis(), 2000, "Vui lòng nhập căn cứ xử lý.");
        } else if ("TRUNG".equals(conclusion)) {
            if (input.originalDecisionId() == null) {
                throw invalid("Vui lòng chọn nhóm/quyết định gốc để liên kết trùng.");
            }
            originalDecisionId = input.originalDecisionId();
            basis = (input.basis() == null || input.basis().isBlank())
                    ? "Trùng với quyết định " + originalDecisionId
                    : requireText(input.basis(), 2000, "Căn cứ xử lý quá dài.");
        } else {
            if (input.penaltyId() != null && !input.penaltyId().isBlank()) {
                throw invalid("Chỉ được chọn mức phạt khi kết luận là Vi phạm.");
            }
            basis = requireText(input.basis(), 2000, "Vui lòng nhập căn cứ xử lý.");
        }

        // Lock pending reports in deterministic order to guarantee at-most-once resolution.
        List<Map<String, Object>> pendingRows = db.queryForList(
                "SELECT ma_bao_cao, nguoi_bao_cao_id FROM bao_caos " +
                        "WHERE loai_doi_tuong = ? AND doi_tuong_id = ? AND danh_muc_vi_pham = ? " +
                        "AND trang_thai IN ('CHO_XU_LY', 'DANG_XU_LY') " +
                        "ORDER BY ma_bao_cao FOR UPDATE",
                targetType, input.targetId(), category);

        if (pendingRows.isEmpty()) {
            Integer resolvedCount = db.queryForObject(
                    "SELECT count(*) FROM bao_caos WHERE loai_doi_tuong = ? AND doi_tuong_id = ? " +
                            "AND danh_muc_vi_pham = ? AND trang_thai = 'DA_XU_LY'",
                    Integer.class, targetType, input.targetId(), category);
            if (resolvedCount != null && resolvedCount > 0) {
                throw conflict("REPORT_GROUP_ALREADY_PROCESSED",
                        "Nhóm báo cáo đã được xử lý bởi Kiểm duyệt viên khác.");
            }
            throw missing("Không tìm thấy nhóm báo cáo chờ xử lý.");
        }

        TargetInfo target = loadTargetInfoForUpdate(targetType, input.targetId());
        enforceNoConflictOfInterest(moderatorId, targetType, input.targetId(), target.ownerId(), pendingRows);

        if (originalDecisionId != null) {
            Integer origCount = db.queryForObject(
                    "SELECT count(*) FROM quyet_dinhs WHERE ma_quyet_dinh = ?",
                    Integer.class, originalDecisionId);
            if (origCount == null || origCount == 0) {
                throw missing("Không tìm thấy quyết định gốc được liên kết.");
            }
        }

        if (penaltyId != null) {
            List<Map<String, Object>> scale = db.queryForList(
                    "SELECT trang_thai FROM thang_phats WHERE ma_thang_phat = ?",
                    penaltyId);
            if (scale.isEmpty() || !"DANG_DUNG".equals(scale.getFirst().get("trang_thai"))) {
                throw invalid("Mức phạt không tồn tại hoặc đã ngừng sử dụng.");
            }
        }

        UUID decisionId = UUID.randomUUID();
        UUID representativeReportId = (UUID) pendingRows.getFirst().get("ma_bao_cao");
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);

        db.update(
                "INSERT INTO quyet_dinhs(ma_quyet_dinh, nguoi_ra_quyet_dinh_id, ma_bao_cao, ma_thang_phat, " +
                        "ket_luan, can_cu, thoi_diem, quyet_dinh_goc_id) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                decisionId, moderatorId, representativeReportId, penaltyId, conclusion, basis,
                Timestamp.from(now), originalDecisionId);

        int updated = 0;
        for (Map<String, Object> row : pendingRows) {
            updated += db.update(
                    "UPDATE bao_caos SET trang_thai = 'DA_XU_LY', nguoi_xu_ly_id = ?, quyet_dinh_id = ? " +
                            "WHERE ma_bao_cao = ?",
                    moderatorId, decisionId, row.get("ma_bao_cao"));
        }

        boolean penaltyApplied = false;
        Integer scoreAfter = null;
        String accountStatusAfter = null;
        boolean listingHidden = false;

        if ("VI_PHAM".equals(conclusion)) {
            ReputationLedgerEntry entry = reputationLedger.applyPenaltyScale(
                    target.ownerId(),
                    penaltyId,
                    basis,
                    "REPORT_DECISION:" + decisionId,
                    moderatorId);
            penaltyApplied = true;
            scoreAfter = entry.scoreAfter();
            accountStatusAfter = db.queryForObject(
                    "SELECT trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ?",
                    String.class, target.ownerId());

            if ("TIN_DANG".equals(targetType)) {
                int hidden = db.update(
                        "UPDATE tin_dangs SET trang_thai = 'AN', ly_do_an = ?, updated_at = ?, version = version + 1 " +
                                "WHERE ma_tin = ? AND trang_thai <> 'AN'",
                        basis, Timestamp.from(now), input.targetId());
                listingHidden = hidden > 0;
            }
        }

        return new ResolveResult(decisionId, conclusion, updated, penaltyApplied,
                scoreAfter, accountStatusAfter, listingHidden);
    }

    private record TargetInfo(UUID ownerId, String label, String status) {}

    private TargetInfo loadTargetInfo(String targetType, UUID targetId) {
        if ("NGUOI_DUNG".equals(targetType)) {
            var rows = db.queryForList(
                    "SELECT user_id, ho_ten, mssv, trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ?",
                    targetId);
            if (rows.isEmpty()) throw missing("Không tìm thấy người dùng bị báo cáo.");
            var row = rows.getFirst();
            return new TargetInfo(targetId, row.get("ho_ten") + " (" + row.get("mssv") + ")",
                    (String) row.get("trang_thai_tai_khoan"));
        }
        var rows = db.queryForList(
                "SELECT nguoi_dang_id, tieu_de, trang_thai FROM tin_dangs WHERE ma_tin = ?",
                targetId);
        if (rows.isEmpty()) throw missing("Không tìm thấy tin đăng bị báo cáo.");
        var row = rows.getFirst();
        return new TargetInfo((UUID) row.get("nguoi_dang_id"), (String) row.get("tieu_de"),
                (String) row.get("trang_thai"));
    }

    private TargetInfo loadTargetInfoForUpdate(String targetType, UUID targetId) {
        if ("NGUOI_DUNG".equals(targetType)) {
            var rows = db.queryForList(
                    "SELECT user_id, ho_ten, mssv, trang_thai_tai_khoan FROM thanh_viens WHERE user_id = ? FOR UPDATE",
                    targetId);
            if (rows.isEmpty()) throw missing("Không tìm thấy người dùng bị báo cáo.");
            var row = rows.getFirst();
            return new TargetInfo(targetId, row.get("ho_ten") + " (" + row.get("mssv") + ")",
                    (String) row.get("trang_thai_tai_khoan"));
        }
        // Lock order (repo canonical): thanh_viens → tin_dangs → do_vats (see ListingService,
        // InventoryService). Read owner without lock first, lock the owner before the listing
        // row, then lock the listing. Locking tin_dangs before thanh_viens deadlocks AB-BA
        // against ListingService, which locks thanh_viens (1) then tin_dangs (2).
        var ownerRows = db.queryForList(
                "SELECT nguoi_dang_id FROM tin_dangs WHERE ma_tin = ?", UUID.class, targetId);
        if (ownerRows.isEmpty()) throw missing("Không tìm thấy tin đăng bị báo cáo.");
        db.queryForList("SELECT user_id FROM thanh_viens WHERE user_id = ? FOR UPDATE", ownerRows.getFirst());
        var rows = db.queryForList(
                "SELECT nguoi_dang_id, tieu_de, trang_thai FROM tin_dangs WHERE ma_tin = ? FOR UPDATE",
                targetId);
        if (rows.isEmpty()) throw missing("Không tìm thấy tin đăng bị báo cáo.");
        var row = rows.getFirst();
        return new TargetInfo((UUID) row.get("nguoi_dang_id"), (String) row.get("tieu_de"),
                (String) row.get("trang_thai"));
    }

    private DecisionSummary loadDecision(UUID decisionId) {
        var rows = db.queryForList(
                "SELECT qd.ma_quyet_dinh, qd.ket_luan, qd.ma_thang_phat, qd.ten_thang_phat_snapshot, " +
                        "qd.diem_tru_snapshot, qd.can_cu, qd.quyet_dinh_goc_id, qd.nguoi_ra_quyet_dinh_id, " +
                        "m.ho_ten AS moderator_name, qd.thoi_diem " +
                        "FROM quyet_dinhs qd JOIN thanh_viens m ON m.user_id = qd.nguoi_ra_quyet_dinh_id " +
                        "WHERE qd.ma_quyet_dinh = ?",
                decisionId);
        if (rows.isEmpty()) return null;
        var row = rows.getFirst();
        return new DecisionSummary(
                (UUID) row.get("ma_quyet_dinh"),
                (String) row.get("ket_luan"),
                (String) row.get("ma_thang_phat"),
                (String) row.get("ten_thang_phat_snapshot"),
                (Integer) row.get("diem_tru_snapshot"),
                (String) row.get("can_cu"),
                (UUID) row.get("quyet_dinh_goc_id"),
                (UUID) row.get("nguoi_ra_quyet_dinh_id"),
                (String) row.get("moderator_name"),
                toInstant((Timestamp) row.get("thoi_diem")));
    }

    private void enforceNoConflictOfInterest(UUID moderatorId, String targetType, UUID targetId,
                                             UUID ownerId, List<Map<String, Object>> reportRows) {
        if (moderatorId.equals(ownerId) || ("NGUOI_DUNG".equals(targetType) && moderatorId.equals(targetId))) {
            throw new GovernanceFailure(403, "CONFLICT_OF_INTEREST",
                    "Không thể xem hoặc xử lý báo cáo liên quan đến chính bạn.");
        }
        boolean isReporter = reportRows.stream()
                .anyMatch(row -> moderatorId.equals(row.get("nguoi_bao_cao_id")));
        if (isReporter) {
            throw new GovernanceFailure(403, "CONFLICT_OF_INTEREST",
                    "Không thể xem hoặc xử lý nhóm báo cáo mà bạn là người báo cáo.");
        }
    }

    private List<String> readEvidence(Object raw) {
        if (raw == null) return List.of();
        if (raw instanceof Array sqlArray) {
            try {
                Object arr = sqlArray.getArray();
                if (arr instanceof String[] strings) {
                    return Arrays.stream(strings).filter(Objects::nonNull).toList();
                }
            } catch (SQLException e) {
                throw new IllegalStateException("Cannot read report evidence array", e);
            }
        }
        if (raw instanceof String[] strings) {
            return Arrays.stream(strings).filter(Objects::nonNull).toList();
        }
        return List.of();
    }

    private UUID actorId(Jwt jwt) {
        if (jwt == null || !"admin-web".equals(jwt.getClaimAsString("client"))) {
            throw new GovernanceFailure(403, "FORBIDDEN", "Không có quyền thực hiện thao tác này.");
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new GovernanceFailure(403, "FORBIDDEN", "Không có quyền thực hiện thao tác này.");
        }
    }

    private String requireTargetType(String targetType) {
        String clean = requireText(targetType, 30, "Loại đối tượng báo cáo không hợp lệ.");
        if (!TARGET_TYPES.contains(clean)) {
            throw invalid("Loại đối tượng báo cáo không hợp lệ.");
        }
        return clean;
    }

    private String requireText(String value, int max, String message) {
        if (value == null || value.isBlank() || value.strip().length() > max) {
            throw invalid(message);
        }
        return value.strip();
    }

    private void bounds(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw invalid("Tham số phân trang không hợp lệ.");
        }
    }

    private Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }

    private GovernanceFailure invalid(String message) {
        return new GovernanceFailure(400, "INVALID_INPUT", message);
    }

    private GovernanceFailure missing(String message) {
        return new GovernanceFailure(404, "NOT_FOUND", message);
    }

    private GovernanceFailure conflict(String code, String message) {
        return new GovernanceFailure(409, code, message);
    }
}
