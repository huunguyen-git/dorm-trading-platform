package com.dormtrading.iam.management;

import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.iam.management.UserManagementDtos.PageResult;
import com.dormtrading.iam.management.UserManagementDtos.ReputationHistoryPage;
import com.dormtrading.iam.management.UserManagementDtos.UserDetail;
import com.dormtrading.iam.management.UserManagementDtos.UserModerationLogItem;
import com.dormtrading.iam.management.UserManagementDtos.UserReputationHistoryItem;
import com.dormtrading.iam.management.UserManagementDtos.UserSearchFilter;
import com.dormtrading.iam.management.UserManagementDtos.UserSummary;
import com.dormtrading.iam.management.UserManagementDtos.UserTransactionItem;
import com.dormtrading.review.reputation.ReputationLedgerService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional(noRollbackFor = AuthFailure.class)
public class UserManagementService {

    private static final Set<String> VALID_ACCOUNT_STATUSES = Set.of(
            "CHO_KICH_HOAT", "HOAT_DONG", "BI_KHOA", "VO_HIEU_HOA"
    );
    private static final Set<String> VALID_STUDENT_STATUSES = Set.of(
            "DANG_HOC", "DA_TOT_NGHIEP"
    );

    private final JdbcTemplate db;
    private final Clock clock;
    private final ReputationLedgerService reputationLedger;
    private final ObjectMapper objectMapper;

    public UserManagementService(
            JdbcTemplate db,
            Clock clock,
            ReputationLedgerService reputationLedger,
            ObjectMapper objectMapper
    ) {
        this.db = db;
        this.clock = clock;
        this.reputationLedger = reputationLedger;
        this.objectMapper = objectMapper;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private Timestamp at(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private Instant toInstant(Object ts) {
        return ts == null ? null : ((Timestamp) ts).toInstant();
    }

    private Map<String, Object> one(String sql, Object... args) {
        var rows = db.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private void validatePagination(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new AuthFailure(400, "INVALID_INPUT", "Tham số phân trang không hợp lệ.");
        }
    }

    private int computeTotalPages(long totalElements, int size) {
        return totalElements == 0 ? 0 : (int) ((totalElements + size - 1) / size);
    }

    public boolean reconcileExpiredLockIfNeeded(UUID userId) {
        return reputationLedger.reconcileExpiredTemporaryLock(userId);
    }

    private void reconcileAllExpiredLocks() {
        List<UUID> expiredUserIds = db.queryForList(
                "SELECT user_id FROM thanh_viens " +
                "WHERE trang_thai_tai_khoan = 'BI_KHOA' " +
                "  AND loai_han_che = 'KHOA_TAM_THOI' " +
                "  AND khoa_den_ngay IS NOT NULL " +
                "  AND khoa_den_ngay <= ?",
                UUID.class,
                at(now())
        );
        for (UUID expiredId : expiredUserIds) {
            reconcileExpiredLockIfNeeded(expiredId);
        }
    }

    public PageResult<UserSummary> listUsers(UserSearchFilter filter) {
        int page = filter.page();
        int size = filter.size();
        validatePagination(page, size);

        if (filter.minReputation() != null && filter.minReputation() < 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Điểm uy tín tối thiểu không hợp lệ.");
        }
        if (filter.maxReputation() != null && filter.maxReputation() < 0) {
            throw new AuthFailure(400, "INVALID_INPUT", "Điểm uy tín tối đa không hợp lệ.");
        }
        if (filter.minReputation() != null && filter.maxReputation() != null
                && filter.minReputation() > filter.maxReputation()) {
            throw new AuthFailure(400, "INVALID_INPUT", "Khoảng điểm uy tín không hợp lệ.");
        }

        reconcileAllExpiredLocks();

        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> params = new ArrayList<>();
        Instant currentTime = now();

        if (filter.q() != null && !filter.q().isBlank()) {
            String escaped = escapeLike(filter.q().strip());
            String pattern = "%" + escaped + "%";
            where.append(" AND (u.ho_ten ILIKE ? ESCAPE '\\' OR u.email ILIKE ? ESCAPE '\\' ")
                    .append("OR u.mssv ILIKE ? ESCAPE '\\' OR COALESCE(u.so_dien_thoai, '') ILIKE ? ESCAPE '\\')");
            params.add(pattern);
            params.add(pattern);
            params.add(pattern);
            params.add(pattern);
        }

        if (filter.accountStatus() != null && !filter.accountStatus().isBlank()) {
            String status = filter.accountStatus().strip();
            if (!VALID_ACCOUNT_STATUSES.contains(status)) {
                throw new AuthFailure(400, "INVALID_INPUT", "Trạng thái tài khoản lọc không hợp lệ.");
            }
            where.append(" AND u.trang_thai_tai_khoan = ?");
            params.add(status);
        }

        if (filter.studentStatus() != null && !filter.studentStatus().isBlank()) {
            String stStatus = filter.studentStatus().strip();
            if (!VALID_STUDENT_STATUSES.contains(stStatus)) {
                throw new AuthFailure(400, "INVALID_INPUT", "Trạng thái học tập lọc không hợp lệ.");
            }
            where.append(" AND u.trang_thai_sv = ?");
            params.add(stStatus);
        }

        if (filter.emailVerified() != null) {
            where.append(" AND u.email_verified = ?");
            params.add(filter.emailVerified());
        }

        if (filter.profileApproved() != null) {
            where.append(" AND u.profile_approved = ?");
            params.add(filter.profileApproved());
        }

        if (filter.role() != null && !filter.role().isBlank()) {
            String normalizedRole = filter.role().strip().toUpperCase(Locale.ROOT);
            switch (normalizedRole) {
                case "MEMBER" -> where.append(
                        " AND u.email_verified = TRUE AND u.profile_approved = TRUE AND u.trang_thai_tai_khoan = 'HOAT_DONG'"
                );
                case "MODERATOR", "KIEM_DUYET_VIEN" -> {
                    where.append(
                            " AND EXISTS (SELECT 1 FROM vai_tro_quan_tri r " +
                            "WHERE r.user_id = u.user_id AND r.trang_thai_hieu_luc = TRUE " +
                            "AND r.bat_dau <= ? AND (r.ket_thuc IS NULL OR r.ket_thuc > ?) " +
                            "AND r.loai_vai_tro IN ('KIEM_DUYET_VIEN', 'QUAN_TRI_VIEN_CAP_CAO'))"
                    );
                    params.add(at(currentTime));
                    params.add(at(currentTime));
                }
                case "SENIOR_ADMIN", "ADMIN", "QUAN_TRI_VIEN_CAP_CAO" -> {
                    where.append(
                            " AND EXISTS (SELECT 1 FROM vai_tro_quan_tri r " +
                            "WHERE r.user_id = u.user_id AND r.trang_thai_hieu_luc = TRUE " +
                            "AND r.bat_dau <= ? AND (r.ket_thuc IS NULL OR r.ket_thuc > ?) " +
                            "AND r.loai_vai_tro = 'QUAN_TRI_VIEN_CAP_CAO')"
                    );
                    params.add(at(currentTime));
                    params.add(at(currentTime));
                }
                default -> throw new AuthFailure(400, "INVALID_INPUT", "Vai trò lọc không hợp lệ.");
            }
        }

        if (filter.minReputation() != null) {
            where.append(" AND u.diem_uy_tin >= ?");
            params.add(filter.minReputation());
        }

        if (filter.maxReputation() != null) {
            where.append(" AND u.diem_uy_tin <= ?");
            params.add(filter.maxReputation());
        }

        Long totalObj = db.queryForObject(
                "SELECT count(*) FROM thanh_viens u" + where,
                Long.class,
                params.toArray()
        );
        long totalElements = totalObj == null ? 0L : totalObj;

        List<Object> pageParams = new ArrayList<>(params);
        pageParams.add(size);
        pageParams.add((long) page * size);

        var rows = db.queryForList(
                "SELECT u.user_id, u.ho_ten, u.email, u.mssv, u.so_dien_thoai, u.trang_thai_sv, " +
                "       u.trang_thai_tai_khoan, u.loai_han_che, u.khoa_den_ngay, " +
                "       u.email_verified, u.profile_approved, u.diem_uy_tin, u.created_at " +
                "FROM thanh_viens u" + where +
                " ORDER BY u.created_at DESC, u.user_id ASC LIMIT ? OFFSET ?",
                pageParams.toArray()
        );

        Map<UUID, Set<String>> adminRolesByUser = loadActiveAdminRoles(
                rows.stream().map(r -> (UUID) r.get("user_id")).toList(),
                currentTime
        );

        List<UserSummary> items = rows.stream().map(row -> {
            UUID id = (UUID) row.get("user_id");
            boolean emailVerified = Boolean.TRUE.equals(row.get("email_verified"));
            boolean profileApproved = Boolean.TRUE.equals(row.get("profile_approved"));
            String accountStatus = (String) row.get("trang_thai_tai_khoan");
            List<String> systemRoles = computeSystemRoles(
                    emailVerified,
                    profileApproved,
                    accountStatus,
                    adminRolesByUser.getOrDefault(id, Set.of())
            );
            return new UserSummary(
                    id,
                    (String) row.get("ho_ten"),
                    (String) row.get("email"),
                    (String) row.get("mssv"),
                    (String) row.get("so_dien_thoai"),
                    (String) row.get("trang_thai_sv"),
                    accountStatus,
                    (String) row.get("loai_han_che"),
                    toInstant(row.get("khoa_den_ngay")),
                    emailVerified,
                    profileApproved,
                    ((Number) row.get("diem_uy_tin")).intValue(),
                    systemRoles,
                    toInstant(row.get("created_at"))
            );
        }).toList();

        return new PageResult<>(items, page, size, totalElements, computeTotalPages(totalElements, size));
    }

    public UserDetail getUserDetail(UUID userId) {
        if (userId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thiếu định danh người dùng.");
        }
        reconcileExpiredLockIfNeeded(userId);

        var row = one(
                "SELECT user_id, ho_ten, email, mssv, so_dien_thoai, truong, co_so, nganh_hoc, nien_khoa, " +
                "       trang_thai_sv, anh_the_sv_truoc, anh_the_sv_sau, " +
                "       email_verified, profile_approved, diem_uy_tin, trang_thai_tai_khoan, " +
                "       loai_han_che, ly_do_han_che, khoa_den_ngay, cho_phep_khieu_nai, " +
                "       created_at, updated_at, version " +
                "FROM thanh_viens WHERE user_id = ?",
                userId
        );
        if (row == null) {
            throw new AuthFailure(404, "USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }

        Instant currentTime = now();
        Set<String> activeAdminRoles = loadActiveAdminRoles(List.of(userId), currentTime)
                .getOrDefault(userId, Set.of());
        boolean emailVerified = Boolean.TRUE.equals(row.get("email_verified"));
        boolean profileApproved = Boolean.TRUE.equals(row.get("profile_approved"));
        String accountStatus = (String) row.get("trang_thai_tai_khoan");
        String rawFront = (String) row.get("anh_the_sv_truoc");
        String cardFront = (rawFront == null || rawFront.isBlank()) ? null : rawFront.strip();
        String rawBack = (String) row.get("anh_the_sv_sau");
        String cardBack = (rawBack == null || rawBack.isBlank()) ? null : rawBack.strip();

        return new UserDetail(
                (UUID) row.get("user_id"),
                (String) row.get("ho_ten"),
                (String) row.get("email"),
                (String) row.get("mssv"),
                (String) row.get("so_dien_thoai"),
                (String) row.get("truong"),
                (String) row.get("co_so"),
                (String) row.get("nganh_hoc"),
                (String) row.get("nien_khoa"),
                (String) row.get("trang_thai_sv"),
                cardFront,
                cardBack,
                cardFront != null,
                cardBack != null,
                emailVerified,
                profileApproved,
                ((Number) row.get("diem_uy_tin")).intValue(),
                accountStatus,
                (String) row.get("loai_han_che"),
                (String) row.get("ly_do_han_che"),
                toInstant(row.get("khoa_den_ngay")),
                Boolean.TRUE.equals(row.get("cho_phep_khieu_nai")),
                computeSystemRoles(emailVerified, profileApproved, accountStatus, activeAdminRoles),
                toInstant(row.get("created_at")),
                toInstant(row.get("updated_at")),
                ((Number) row.get("version")).longValue()
        );
    }

    public PageResult<UserTransactionItem> getUserTransactions(UUID userId, int page, int size) {
        validatePagination(page, size);
        ensureUserExists(userId);

        Long totalObj = db.queryForObject(
                "SELECT count(*) FROM giao_dichs g WHERE g.nguoi_mua_id = ? OR g.nguoi_ban_id = ?",
                Long.class,
                userId,
                userId
        );
        long totalElements = totalObj == null ? 0L : totalObj;

        var rows = db.queryForList(
                "SELECT g.ma_giao_dich, g.ma_tin, t.tieu_de, " +
                "       CASE WHEN g.nguoi_mua_id = ? THEN 'BUYER' ELSE 'SELLER' END AS tx_role, " +
                "       cp.user_id AS cp_id, cp.ho_ten AS cp_name, cp.mssv AS cp_mssv, " +
                "       g.gia_thoa_thuan, g.trang_thai, g.thoi_gian_hen, g.thoi_diem_hoan_tat, g.thoi_diem_tao " +
                "FROM giao_dichs g " +
                "JOIN tin_dangs t ON t.ma_tin = g.ma_tin " +
                "JOIN thanh_viens cp ON cp.user_id = CASE WHEN g.nguoi_mua_id = ? THEN g.nguoi_ban_id ELSE g.nguoi_mua_id END " +
                "WHERE g.nguoi_mua_id = ? OR g.nguoi_ban_id = ? " +
                "ORDER BY g.thoi_diem_tao DESC, g.ma_giao_dich ASC LIMIT ? OFFSET ?",
                userId,
                userId,
                userId,
                userId,
                size,
                (long) page * size
        );

        List<UserTransactionItem> items = rows.stream().map(row -> new UserTransactionItem(
                (UUID) row.get("ma_giao_dich"),
                (UUID) row.get("ma_tin"),
                (String) row.get("tieu_de"),
                (String) row.get("tx_role"),
                (UUID) row.get("cp_id"),
                (String) row.get("cp_name"),
                (String) row.get("cp_mssv"),
                ((Number) row.get("gia_thoa_thuan")).intValue(),
                (String) row.get("trang_thai"),
                toInstant(row.get("thoi_gian_hen")),
                toInstant(row.get("thoi_diem_hoan_tat")),
                toInstant(row.get("thoi_diem_tao"))
        )).toList();

        return new PageResult<>(items, page, size, totalElements, computeTotalPages(totalElements, size));
    }

    public ReputationHistoryPage getUserReputationHistory(UUID userId, int page, int size) {
        validatePagination(page, size);
        reconcileExpiredLockIfNeeded(userId);

        var userRow = one("SELECT diem_uy_tin FROM thanh_viens WHERE user_id = ?", userId);
        if (userRow == null) {
            throw new AuthFailure(404, "USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }
        int currentScore = ((Number) userRow.get("diem_uy_tin")).intValue();

        Long totalObj = db.queryForObject(
                "SELECT count(*) FROM lich_su_diem_uy_tin WHERE user_id = ?",
                Long.class,
                userId
        );
        long totalElements = totalObj == null ? 0L : totalObj;

        var rows = db.queryForList(
                "SELECT l.id, l.loai_bien_dong, l.diem_thay_doi, l.diem_truoc, l.diem_sau, " +
                "       l.ly_do, l.nguon_tham_chieu, l.ma_tham_chieu, " +
                "       l.nguoi_thuc_hien_id, actor.ho_ten AS actor_name, l.created_at " +
                "FROM lich_su_diem_uy_tin l " +
                "LEFT JOIN thanh_viens actor ON actor.user_id = l.nguoi_thuc_hien_id " +
                "WHERE l.user_id = ? " +
                "ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?",
                userId,
                size,
                (long) page * size
        );

        List<UserReputationHistoryItem> items = rows.stream().map(row -> new UserReputationHistoryItem(
                (UUID) row.get("id"),
                (String) row.get("loai_bien_dong"),
                ((Number) row.get("diem_thay_doi")).intValue(),
                ((Number) row.get("diem_truoc")).intValue(),
                ((Number) row.get("diem_sau")).intValue(),
                (String) row.get("ly_do"),
                (String) row.get("nguon_tham_chieu"),
                (String) row.get("ma_tham_chieu"),
                (UUID) row.get("nguoi_thuc_hien_id"),
                (String) row.get("actor_name"),
                toInstant(row.get("created_at"))
        )).toList();

        return new ReputationHistoryPage(
                currentScore,
                items,
                page,
                size,
                totalElements,
                computeTotalPages(totalElements, size)
        );
    }

    public PageResult<UserModerationLogItem> getUserModerationLogs(UUID userId, int page, int size) {
        validatePagination(page, size);
        reconcileExpiredLockIfNeeded(userId);
        ensureUserExists(userId);

        Long totalObj = db.queryForObject(
                "SELECT count(*) FROM nhat_ky_kiem_duyet WHERE target_user_id = ?",
                Long.class,
                userId
        );
        long totalElements = totalObj == null ? 0L : totalObj;

        var rows = db.queryForList(
                "SELECT m.id, m.action_type, m.reason, m.previous_status, m.new_status, " +
                "       m.lock_type, m.locked_until, m.appealable, " +
                "       m.actor_user_id, actor.ho_ten AS actor_name, " +
                "       m.details::text AS details_json, m.created_at " +
                "FROM nhat_ky_kiem_duyet m " +
                "LEFT JOIN thanh_viens actor ON actor.user_id = m.actor_user_id " +
                "WHERE m.target_user_id = ? " +
                "ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?",
                userId,
                size,
                (long) page * size
        );

        List<UserModerationLogItem> items = rows.stream().map(row -> new UserModerationLogItem(
                (UUID) row.get("id"),
                (String) row.get("action_type"),
                (String) row.get("reason"),
                (String) row.get("previous_status"),
                (String) row.get("new_status"),
                (String) row.get("lock_type"),
                toInstant(row.get("locked_until")),
                Boolean.TRUE.equals(row.get("appealable")),
                (UUID) row.get("actor_user_id"),
                (String) row.get("actor_name"),
                parseDetailsJson((String) row.get("details_json")),
                toInstant(row.get("created_at"))
        )).toList();

        return new PageResult<>(items, page, size, totalElements, computeTotalPages(totalElements, size));
    }

    private void ensureUserExists(UUID userId) {
        if (userId == null) {
            throw new AuthFailure(400, "INVALID_INPUT", "Thiếu định danh người dùng.");
        }
        var row = one("SELECT user_id FROM thanh_viens WHERE user_id = ?", userId);
        if (row == null) {
            throw new AuthFailure(404, "USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }
    }

    private Map<UUID, Set<String>> loadActiveAdminRoles(List<UUID> userIds, Instant currentTime) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = String.join(",", Collections.nCopies(userIds.size(), "?"));
        List<Object> args = new ArrayList<>(userIds);
        args.add(at(currentTime));
        args.add(at(currentTime));

        var rows = db.queryForList(
                "SELECT user_id, loai_vai_tro FROM vai_tro_quan_tri " +
                "WHERE user_id IN (" + placeholders + ") " +
                "  AND trang_thai_hieu_luc = TRUE " +
                "  AND bat_dau <= ? " +
                "  AND (ket_thuc IS NULL OR ket_thuc > ?)",
                args.toArray()
        );

        Map<UUID, Set<String>> result = new HashMap<>();
        for (var row : rows) {
            UUID uid = (UUID) row.get("user_id");
            String role = (String) row.get("loai_vai_tro");
            result.computeIfAbsent(uid, k -> new HashSet<>()).add(role);
        }
        return result;
    }

    private List<String> computeSystemRoles(
            boolean emailVerified,
            boolean profileApproved,
            String accountStatus,
            Set<String> activeAdminRoles
    ) {
        List<String> roles = new ArrayList<>();
        if (emailVerified && profileApproved && "HOAT_DONG".equals(accountStatus)) {
            roles.add("MEMBER");
        }
        if (activeAdminRoles.contains("KIEM_DUYET_VIEN") || activeAdminRoles.contains("QUAN_TRI_VIEN_CAP_CAO")) {
            roles.add("MODERATOR");
        }
        if (activeAdminRoles.contains("QUAN_TRI_VIEN_CAP_CAO")) {
            roles.add("SENIOR_ADMIN");
        }
        return List.copyOf(roles);
    }

    private String escapeLike(String raw) {
        return raw.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }

    private Map<String, Object> parseDetailsJson(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception e) {
            return Map.of();
        }
    }
}
