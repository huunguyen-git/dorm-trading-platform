package com.dormtrading.gov;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class StatisticsService {
    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Pattern SEMESTER_PATTERN = Pattern.compile("^(\\d{4})-HK([123])$");

    private final JdbcTemplate db;
    private final Clock clock;

    public StatisticsService(JdbcTemplate db, Clock clock) {
        this.db = db;
        this.clock = clock;
    }

    public record SemesterOption(String code, String label, Instant from, Instant to) {}

    public record TopSubjectStat(String subjectCode, String subjectName, long exchangedCount,
                                 long activeListingCount, long searchCount) {}

    public record TopSubjectsResponse(SemesterOption period, List<TopSubjectStat> items, boolean searchTrackingActive) {}

    public record LowReputationUser(UUID userId, String fullName, String studentId, int reputationScore,
                                    String accountStatus, long disputeCount, long violationCount) {}

    public record ShareItem(String code, String name, long count, double percentage) {}

    public record CategoryLocationCell(String categoryCode, String categoryName,
                                       String locationCode, String locationName, long count) {}

    public record CategoryLocationResponse(SemesterOption period, long totalCompleted,
                                           List<ShareItem> byCategory, List<ShareItem> byLocation,
                                           List<CategoryLocationCell> matrix) {}

    public record ZeroPriceResponse(SemesterOption period, long totalCompleted, long zeroPriceCount,
                                    long paidCount, double zeroPricePercentage,
                                    long totalActiveListings, long zeroPriceActiveListings) {}

    public List<SemesterOption> semesters() {
        ZonedDateTime now = clock.instant().atZone(VN_ZONE);
        SemesterOption current = semesterForDate(now.toLocalDate());
        List<SemesterOption> result = new ArrayList<>();
        result.add(current);
        String code = current.code();
        for (int i = 0; i < 5; i++) {
            code = previousSemesterCode(code);
            result.add(parseSemester(code));
        }
        return result;
    }

    public TopSubjectsResponse topSubjects(String semester, Instant from, Instant to, int limit) {
        if (limit < 1 || limit > 50) {
            throw invalid("Giới hạn top môn học phải từ 1 đến 50.");
        }
        SemesterOption period = resolvePeriod(semester, from, to);

        // ponytail: search_logs chưa có trong DiscoveryService; trả searchCount = 0 cho đến khi P2-02 bổ sung log tìm kiếm.
        String sql = "WITH exchanged AS (" +
                "  SELECT COALESCE(NULLIF(trim(t.ma_mon_hoc), ''), 'KHONG_MA') AS code, " +
                "         COALESCE(NULLIF(trim(t.ten_mon_hoc), ''), trim(t.ma_mon_hoc)) AS name, " +
                "         count(DISTINCT gd.ma_giao_dich) AS exchanged_cnt " +
                "  FROM giao_dichs gd " +
                "  JOIN tin_dangs t ON t.ma_tin = gd.ma_tin " +
                "  WHERE gd.trang_thai = 'HOAN_TAT' " +
                "    AND gd.thoi_diem_hoan_tat >= ? AND gd.thoi_diem_hoan_tat < ? " +
                "    AND (NULLIF(trim(t.ma_mon_hoc), '') IS NOT NULL OR NULLIF(trim(t.ten_mon_hoc), '') IS NOT NULL) " +
                "  GROUP BY 1, 2" +
                "), listed AS (" +
                "  SELECT COALESCE(NULLIF(trim(t.ma_mon_hoc), ''), 'KHONG_MA') AS code, " +
                "         COALESCE(NULLIF(trim(t.ten_mon_hoc), ''), trim(t.ma_mon_hoc)) AS name, " +
                "         count(*) AS listing_cnt " +
                "  FROM tin_dangs t " +
                "  WHERE t.trang_thai = 'CONG_KHAI' " +
                "    AND COALESCE(t.published_at, t.created_at) >= ? AND COALESCE(t.published_at, t.created_at) < ? " +
                "    AND (t.expires_at IS NULL OR t.expires_at >= ?) " +
                "    AND (NULLIF(trim(t.ma_mon_hoc), '') IS NOT NULL OR NULLIF(trim(t.ten_mon_hoc), '') IS NOT NULL) " +
                "  GROUP BY 1, 2" +
                ") " +
                "SELECT COALESCE(e.code, l.code) AS subject_code, " +
                "       COALESCE(e.name, l.name) AS subject_name, " +
                "       COALESCE(e.exchanged_cnt, 0) AS exchanged_count, " +
                "       COALESCE(l.listing_cnt, 0) AS active_listing_count " +
                "FROM exchanged e " +
                "FULL OUTER JOIN listed l ON l.code = e.code AND l.name = e.name " +
                "ORDER BY exchanged_count DESC, active_listing_count DESC, lower(COALESCE(e.name, l.name)) ASC " +
                "LIMIT ?";

        List<TopSubjectStat> items = db.query(sql, (rs, n) -> new TopSubjectStat(
                rs.getString("subject_code"),
                rs.getString("subject_name"),
                rs.getLong("exchanged_count"),
                rs.getLong("active_listing_count"),
                0L),
                Timestamp.from(period.from()), Timestamp.from(period.to()),
                Timestamp.from(period.from()), Timestamp.from(period.to()), Timestamp.from(period.to()),
                limit);

        return new TopSubjectsResponse(period, items, false);
    }

    public GovernanceService.Page<LowReputationUser> lowReputationDisputes(int maxScore, int minDisputes,
                                                                           int page, int size) {
        if (maxScore < 0 || maxScore > 100 || minDisputes < 0 || minDisputes > 100) {
            throw invalid("Ngưỡng điểm uy tín hoặc số tranh chấp không hợp lệ.");
        }
        if (page < 0 || size < 1 || size > 100) {
            throw invalid("Tham số phân trang không hợp lệ.");
        }

        // UC-29: giao dịch tranh chấp / chờ quản trị xử lý có trạng thái 'CHO_XU_LY' (schema không có 'TRANH_CHAP').
        // FR-16: đếm vi phạm theo quyết định DISTINCT (một quyết định gộp nhiều báo cáo = 1 vi phạm) và loại
        // tài khoản CHO_KICH_HOAT (chưa kích hoạt, điểm mặc định) để không kéo user mới lên đầu bảng.
        String cte = "WITH user_stats AS (" +
                "  SELECT u.user_id, u.ho_ten, u.mssv, u.diem_uy_tin, u.trang_thai_tai_khoan, " +
                "    (SELECT count(*) FROM giao_dichs gd " +
                "     JOIN tin_dangs t ON t.ma_tin = gd.ma_tin " +
                "     WHERE gd.trang_thai = 'CHO_XU_LY' " +
                "       AND (gd.nguoi_mua_id = u.user_id OR t.nguoi_dang_id = u.user_id)) AS dispute_count, " +
                "    (SELECT count(DISTINCT qd.ma_quyet_dinh) FROM quyet_dinhs qd " +
                "     JOIN bao_caos b ON b.quyet_dinh_id = qd.ma_quyet_dinh " +
                "     LEFT JOIN tin_dangs t ON b.loai_doi_tuong = 'TIN_DANG' AND t.ma_tin = b.doi_tuong_id " +
                "     WHERE qd.ket_luan = 'VI_PHAM' " +
                "       AND ((b.loai_doi_tuong = 'NGUOI_DUNG' AND b.doi_tuong_id = u.user_id) " +
                "         OR (b.loai_doi_tuong = 'TIN_DANG' AND t.nguoi_dang_id = u.user_id))) AS violation_count " +
                "  FROM thanh_viens u " +
                "  WHERE u.trang_thai_tai_khoan <> 'CHO_KICH_HOAT'" +
                ") ";

        // minDisputes = 0 nghĩa là không lọc theo tranh chấp; chỉ OR dispute_count khi ngưỡng > 0.
        String filter = minDisputes > 0
                ? " WHERE (diem_uy_tin <= ? OR dispute_count >= ?)"
                : " WHERE diem_uy_tin <= ?";
        List<Object> totalArgs = new ArrayList<>();
        totalArgs.add(maxScore);
        if (minDisputes > 0) {
            totalArgs.add(minDisputes);
        }
        Long totalObj = db.queryForObject(
                cte + "SELECT count(*) FROM user_stats" + filter,
                Long.class, totalArgs.toArray());
        long total = totalObj == null ? 0L : totalObj;

        List<Object> pageArgs = new ArrayList<>(totalArgs);
        pageArgs.add(size);
        pageArgs.add((long) page * size);

        List<LowReputationUser> items = db.query(
                cte + "SELECT user_id, ho_ten, mssv, diem_uy_tin, trang_thai_tai_khoan, dispute_count, violation_count " +
                        "FROM user_stats" + filter +
                        " ORDER BY diem_uy_tin ASC, dispute_count DESC, lower(ho_ten) ASC LIMIT ? OFFSET ?",
                (rs, n) -> new LowReputationUser(
                        rs.getObject("user_id", UUID.class),
                        rs.getString("ho_ten"),
                        rs.getString("mssv"),
                        rs.getInt("diem_uy_tin"),
                        rs.getString("trang_thai_tai_khoan"),
                        rs.getLong("dispute_count"),
                        rs.getLong("violation_count")),
                pageArgs.toArray());

        return new GovernanceService.Page<>(items, page, size, total);
    }

    public CategoryLocationResponse categoryLocation(String semester, Instant from, Instant to) {
        SemesterOption period = resolvePeriod(semester, from, to);
        Timestamp fromTs = Timestamp.from(period.from());
        Timestamp toTs = Timestamp.from(period.to());

        Long totalObj = db.queryForObject(
                "SELECT count(*) FROM giao_dichs WHERE trang_thai = 'HOAN_TAT' " +
                        "AND thoi_diem_hoan_tat >= ? AND thoi_diem_hoan_tat < ?",
                Long.class, fromTs, toTs);
        long total = totalObj == null ? 0L : totalObj;

        List<ShareItem> byCategory = db.query(
                "SELECT dm.ma_danh_muc AS code, dm.ten AS name, count(gd.ma_giao_dich) AS cnt " +
                        "FROM danh_mucs dm " +
                        "LEFT JOIN tin_dangs t ON t.ma_danh_muc = dm.ma_danh_muc " +
                        "LEFT JOIN giao_dichs gd ON gd.ma_tin = t.ma_tin " +
                        "  AND gd.trang_thai = 'HOAN_TAT' " +
                        "  AND gd.thoi_diem_hoan_tat >= ? AND gd.thoi_diem_hoan_tat < ? " +
                        "GROUP BY dm.ma_danh_muc, dm.ten " +
                        "ORDER BY cnt DESC, lower(dm.ten) ASC",
                (rs, n) -> {
                    long count = rs.getLong("cnt");
                    return new ShareItem(rs.getString("code"), rs.getString("name"), count, pct(count, total));
                },
                fromTs, toTs);

        List<ShareItem> byLocation = db.query(
                "SELECT kv.ma_khu_vuc AS code, kv.ten AS name, count(gd.ma_giao_dich) AS cnt " +
                        "FROM khu_vucs kv " +
                        "LEFT JOIN tin_dangs t ON t.ma_khu_vuc = kv.ma_khu_vuc " +
                        "LEFT JOIN giao_dichs gd ON gd.ma_tin = t.ma_tin " +
                        "  AND gd.trang_thai = 'HOAN_TAT' " +
                        "  AND gd.thoi_diem_hoan_tat >= ? AND gd.thoi_diem_hoan_tat < ? " +
                        "GROUP BY kv.ma_khu_vuc, kv.ten " +
                        "ORDER BY cnt DESC, lower(kv.ten) ASC",
                (rs, n) -> {
                    long count = rs.getLong("cnt");
                    return new ShareItem(rs.getString("code"), rs.getString("name"), count, pct(count, total));
                },
                fromTs, toTs);

        List<CategoryLocationCell> matrix = db.query(
                "SELECT dm.ma_danh_muc AS cat_code, dm.ten AS cat_name, " +
                        "kv.ma_khu_vuc AS loc_code, kv.ten AS loc_name, count(*) AS cnt " +
                        "FROM giao_dichs gd " +
                        "JOIN tin_dangs t ON t.ma_tin = gd.ma_tin " +
                        "JOIN danh_mucs dm ON dm.ma_danh_muc = t.ma_danh_muc " +
                        "JOIN khu_vucs kv ON kv.ma_khu_vuc = t.ma_khu_vuc " +
                        "WHERE gd.trang_thai = 'HOAN_TAT' " +
                        "  AND gd.thoi_diem_hoan_tat >= ? AND gd.thoi_diem_hoan_tat < ? " +
                        "GROUP BY dm.ma_danh_muc, dm.ten, kv.ma_khu_vuc, kv.ten " +
                        "ORDER BY cnt DESC, lower(dm.ten), lower(kv.ten)",
                (rs, n) -> new CategoryLocationCell(
                        rs.getString("cat_code"),
                        rs.getString("cat_name"),
                        rs.getString("loc_code"),
                        rs.getString("loc_name"),
                        rs.getLong("cnt")),
                fromTs, toTs);

        return new CategoryLocationResponse(period, total, byCategory, byLocation, matrix);
    }

    public ZeroPriceResponse zeroPrice(String semester, Instant from, Instant to) {
        SemesterOption period = resolvePeriod(semester, from, to);
        Timestamp fromTs = Timestamp.from(period.from());
        Timestamp toTs = Timestamp.from(period.to());

        Map<String, Object> txCounts = db.queryForMap(
                "SELECT count(*) AS total_completed, " +
                        "count(*) FILTER (WHERE t.gia_vnd = 0 OR t.hinh_thuc = 'CHO_TANG') AS zero_count " +
                        "FROM giao_dichs gd " +
                        "JOIN tin_dangs t ON t.ma_tin = gd.ma_tin " +
                        "WHERE gd.trang_thai = 'HOAN_TAT' " +
                        "  AND gd.thoi_diem_hoan_tat >= ? AND gd.thoi_diem_hoan_tat < ?",
                fromTs, toTs);

        long totalCompleted = ((Number) txCounts.get("total_completed")).longValue();
        long zeroPriceCount = ((Number) txCounts.get("zero_count")).longValue();
        long paidCount = totalCompleted - zeroPriceCount;

        Map<String, Object> listingCounts = db.queryForMap(
                "SELECT count(*) AS total_active, " +
                        "count(*) FILTER (WHERE gia_vnd = 0 OR hinh_thuc = 'CHO_TANG') AS zero_active " +
                        "FROM tin_dangs WHERE trang_thai = 'CONG_KHAI'");

        long totalActiveListings = ((Number) listingCounts.get("total_active")).longValue();
        long zeroPriceActiveListings = ((Number) listingCounts.get("zero_active")).longValue();

        return new ZeroPriceResponse(
                period,
                totalCompleted,
                zeroPriceCount,
                paidCount,
                pct(zeroPriceCount, totalCompleted),
                totalActiveListings,
                zeroPriceActiveListings);
    }

    SemesterOption resolvePeriod(String semester, Instant from, Instant to) {
        if (from != null || to != null) {
            if (from == null || to == null || !from.isBefore(to)) {
                throw invalid("Khoảng thời gian thống kê không hợp lệ.");
            }
            if (Duration.between(from, to).toDays() > 731) {
                throw invalid("Khoảng thời gian thống kê tối đa 2 năm.");
            }
            return new SemesterOption("CUSTOM", "Tùy chọn", from, to);
        }
        if (semester != null && !semester.isBlank()) {
            return parseSemester(semester.strip());
        }
        return semesterForDate(clock.instant().atZone(VN_ZONE).toLocalDate());
    }

    static SemesterOption semesterForDate(LocalDate date) {
        int month = date.getMonthValue();
        int year = date.getYear();
        if (month >= 9) {
            return parseSemester(year + "-HK1");
        }
        if (month <= 5) {
            return parseSemester((year - 1) + "-HK2");
        }
        return parseSemester((year - 1) + "-HK3");
    }

    static SemesterOption parseSemester(String code) {
        Matcher m = SEMESTER_PATTERN.matcher(code);
        if (!m.matches()) {
            throw new GovernanceFailure(400, "INVALID_INPUT", "Mã học kỳ không hợp lệ (định dạng YYYY-HK1/2/3).");
        }
        int academicYear = Integer.parseInt(m.group(1));
        int term = Integer.parseInt(m.group(2));
        LocalDate start;
        LocalDate endExclusive;
        String label;
        switch (term) {
            case 1 -> {
                start = LocalDate.of(academicYear, 9, 1);
                endExclusive = LocalDate.of(academicYear + 1, 1, 1);
                label = "HK1 (" + academicYear + "-" + (academicYear + 1) + ")";
            }
            case 2 -> {
                start = LocalDate.of(academicYear + 1, 1, 1);
                endExclusive = LocalDate.of(academicYear + 1, 6, 1);
                label = "HK2 (" + academicYear + "-" + (academicYear + 1) + ")";
            }
            default -> {
                start = LocalDate.of(academicYear + 1, 6, 1);
                endExclusive = LocalDate.of(academicYear + 1, 9, 1);
                label = "HK Hè (" + academicYear + "-" + (academicYear + 1) + ")";
            }
        }
        return new SemesterOption(code, label,
                start.atStartOfDay(VN_ZONE).toInstant(),
                endExclusive.atStartOfDay(VN_ZONE).toInstant());
    }

    private static String previousSemesterCode(String code) {
        Matcher m = SEMESTER_PATTERN.matcher(code);
        if (!m.matches()) return code;
        int year = Integer.parseInt(m.group(1));
        int term = Integer.parseInt(m.group(2));
        return switch (term) {
            case 3 -> year + "-HK2";
            case 2 -> year + "-HK1";
            default -> (year - 1) + "-HK3";
        };
    }

    static double pct(long part, long total) {
        if (total <= 0) return 0.0;
        return BigDecimal.valueOf(part * 100.0 / total)
                .setScale(2, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private GovernanceFailure invalid(String message) {
        return new GovernanceFailure(400, "INVALID_INPUT", message);
    }
}
