package com.dormtrading;

import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.common.ActivePenaltyFixtures;
import com.dormtrading.iam.auth.AuthFailure;
import com.dormtrading.iam.management.UserManagementDtos.UserSearchFilter;
import com.dormtrading.iam.management.UserManagementService;
import com.dormtrading.review.reputation.ReputationLedgerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@DisplayName("Kiểm thử Dịch vụ Tra cứu & Chi tiết Hồ sơ Người dùng (P1-04 / UC-11, FR-03, FR-12)")
class UserManagementServiceTest extends BaseIntegrationTest {

    @Autowired
    private UserManagementService userManagement;

    @Autowired
    private ReputationLedgerService reputationLedger;

    @Autowired
    private JdbcTemplate db;

    @MockitoBean
    private Clock clock;

    private final AtomicReference<Instant> currentTime = new AtomicReference<>();

    @BeforeEach
    void setUpClock() {
        currentTime.set(Instant.parse("2026-11-18T09:00:00Z"));
        when(clock.instant()).thenAnswer(inv -> currentTime.get());
        ActivePenaltyFixtures.seed(db);
    }

    @AfterEach
    void clearPenaltyFixtures() {
        ActivePenaltyFixtures.clear(db);
    }

    private UUID insertUser(
            String prefix,
            String fullName,
            String phone,
            String studentStatus,
            String accountStatus,
            boolean emailVerified,
            boolean profileApproved,
            int score
    ) {
        UUID id = UUID.randomUUID();
        String code = prefix + id.toString().replace("-", "").substring(0, 8);
        db.update(
                "INSERT INTO thanh_viens(user_id, email, mat_khau_hash, ho_ten, mssv, so_dien_thoai, " +
                "truong, co_so, nganh_hoc, nien_khoa, trang_thai_sv, anh_the_sv_truoc, anh_the_sv_sau, " +
                "diem_uy_tin, trang_thai_tai_khoan, email_verified, profile_approved, created_at, updated_at) " +
                "VALUES (?, ?, '$argon2id$secret', ?, ?, ?, 'ĐH CNTT', 'KTX Khu B', 'KTPM', 'K2024', " +
                "?, '/uploads/student-cards/front.jpg', NULL, ?, ?, ?, ?, ?, ?)",
                id,
                code.toLowerCase() + "@student.edu.vn",
                fullName,
                code,
                phone,
                studentStatus,
                score,
                accountStatus,
                emailVerified,
                profileApproved,
                Timestamp.from(currentTime.get()),
                Timestamp.from(currentTime.get())
        );
        return id;
    }

    @Test
    @DisplayName("UC-11: Tìm kiếm, lọc đa tiêu chí, tính đúng systemRoles và không lộ dữ liệu nhạy cảm")
    void searchesFiltersAndComputesSystemRolesAccurately() {
        String tag = "DIR" + UUID.randomUUID().toString().replace("-", "").substring(0, 6);
        UUID activeGrad = insertUser(tag + "A", "Nguyễn Văn Tốt Nghiệp " + tag, "0901234567", "DA_TOT_NGHIEP", "HOAT_DONG", true, true, 115);
        UUID pendingUser = insertUser(tag + "P", "Trần Chờ Duyệt " + tag, "0907654321", "DANG_HOC", "CHO_KICH_HOAT", true, false, 0);
        UUID moderatorUser = insertUser(tag + "M", "Lê Kiểm Duyệt " + tag, "0912345678", "DANG_HOC", "HOAT_DONG", true, true, 100);
        db.update(
                "INSERT INTO vai_tro_quan_tri(user_id, loai_vai_tro, bat_dau, trang_thai_hieu_luc) VALUES (?, 'KIEM_DUYET_VIEN', ?, TRUE)",
                moderatorUser,
                Timestamp.from(currentTime.get().minusSeconds(60))
        );

        var allTagged = userManagement.listUsers(new UserSearchFilter(tag, null, null, null, null, null, null, null, 0, 20));
        assertThat(allTagged.totalElements()).isEqualTo(3);
        assertThat(allTagged.items().toString()).doesNotContain("/uploads/student-cards/front.jpg", "$argon2id$secret");

        var gradFiltered = userManagement.listUsers(new UserSearchFilter(
                tag, "HOAT_DONG", "DA_TOT_NGHIEP", true, true, "MEMBER", 110, 120, 0, 20
        ));
        assertThat(gradFiltered.items()).hasSize(1);
        assertThat(gradFiltered.items().getFirst().id()).isEqualTo(activeGrad);
        assertThat(gradFiltered.items().getFirst().systemRoles()).containsExactly("MEMBER");

        var modFiltered = userManagement.listUsers(new UserSearchFilter(
                tag, null, null, null, null, "MODERATOR", null, null, 0, 20
        ));
        assertThat(modFiltered.items()).hasSize(1);
        assertThat(modFiltered.items().getFirst().id()).isEqualTo(moderatorUser);
        assertThat(modFiltered.items().getFirst().systemRoles()).containsExactly("MEMBER", "MODERATOR");

        var pendingDetail = userManagement.getUserDetail(pendingUser);
        assertThat(pendingDetail.systemRoles()).isEmpty();
        assertThat(pendingDetail.studentCardFront()).isEqualTo("/uploads/student-cards/front.jpg");
        assertThat(pendingDetail.studentCardBack()).isNull();
        assertThat(pendingDetail.hasStudentCardFront()).isTrue();
        assertThat(pendingDetail.hasStudentCardBack()).isFalse();
        assertThat(pendingDetail.toString()).doesNotContain("$argon2id$secret");

        assertThatThrownBy(() -> userManagement.getUserDetail(UUID.randomUUID()))
                .isInstanceOf(AuthFailure.class)
                .extracting("status")
                .isEqualTo(404);

        assertThatThrownBy(() -> userManagement.listUsers(new UserSearchFilter(null, null, null, null, null, null, 90, 50, 0, 20)))
                .isInstanceOf(AuthFailure.class)
                .extracting("status")
                .isEqualTo(400);
    }

    @Test
    @DisplayName("UC-11 & FR-03: Truy vấn lịch sử giao dịch phân biệt BUYER/SELLER, sổ điểm uy tín và tự mở khóa tạm hết hạn")
    void returnsTransactionsReputationHistoryModerationLogsAndReconcilesExpiredLocks() {
        UUID buyer = insertUser("TXB", "Người Mua", "0988000111", "DANG_HOC", "HOAT_DONG", true, true, 60);
        UUID seller = insertUser("TXS", "Người Bán", "0988000222", "DANG_HOC", "HOAT_DONG", true, true, 100);

        UUID listing1 = UUID.randomUUID();
        UUID listing2 = UUID.randomUUID();
        db.update(
                "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) VALUES (?, ?, 'Giáo trình Giải tích', 45000, 'KET_THUC')",
                listing1, seller
        );
        db.update(
                "INSERT INTO tin_dangs(ma_tin, nguoi_dang_id, tieu_de, gia_vnd, trang_thai) VALUES (?, ?, 'Bàn học gấp KTX', 80000, 'GIU_CHO')",
                listing2, buyer
        );

        UUID txAsBuyer = UUID.randomUUID();
        UUID txAsSeller = UUID.randomUUID();
        db.update(
                "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai, thoi_diem_tao, thoi_diem_hoan_tat) " +
                "VALUES (?, ?, ?, ?, 40000, 'HOAN_TAT', ?, ?)",
                txAsBuyer, listing1, seller, buyer,
                Timestamp.from(currentTime.get().minusSeconds(120)),
                Timestamp.from(currentTime.get().minusSeconds(60))
        );
        db.update(
                "INSERT INTO giao_dichs(ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai, thoi_diem_tao) " +
                "VALUES (?, ?, ?, ?, 75000, 'GIU_CHO', ?)",
                txAsSeller, listing2, buyer, seller,
                Timestamp.from(currentTime.get())
        );

        var txPage = userManagement.getUserTransactions(buyer, 0, 20);
        assertThat(txPage.totalElements()).isEqualTo(2);
        assertThat(txPage.items()).hasSize(2);
        assertThat(txPage.items().get(0).transactionId()).isEqualTo(txAsSeller);
        assertThat(txPage.items().get(0).transactionRole()).isEqualTo("SELLER");
        assertThat(txPage.items().get(0).counterpartyId()).isEqualTo(seller);
        assertThat(txPage.items().get(1).transactionId()).isEqualTo(txAsBuyer);
        assertThat(txPage.items().get(1).transactionRole()).isEqualTo("BUYER");
        assertThat(txPage.items().get(1).agreedPrice()).isEqualTo(40000);

        // Trigger 14-day temporary lock via penalty (-15: 60 -> 45)
        reputationLedger.applyPenaltyScale(buyer, ActivePenaltyFixtures.PENALTY_15, "Bỏ hẹn giao dịch", "TXPEN:" + buyer, seller);
        var lockedDetail = userManagement.getUserDetail(buyer);
        assertThat(lockedDetail.accountStatus()).isEqualTo("BI_KHOA");
        assertThat(lockedDetail.restrictionType()).isEqualTo("KHOA_TAM_THOI");

        // Advance clock past 14 days: getUserDetail lazily unlocks while keeping score = 45
        currentTime.set(currentTime.get().plus(Duration.ofDays(14).plusSeconds(5)));
        var reconciledDetail = userManagement.getUserDetail(buyer);
        assertThat(reconciledDetail.accountStatus()).isEqualTo("HOAT_DONG");
        assertThat(reconciledDetail.restrictionType()).isNull();
        assertThat(reconciledDetail.reputationScore()).isEqualTo(45);

        var repHistory = userManagement.getUserReputationHistory(buyer, 0, 20);
        assertThat(repHistory.currentScore()).isEqualTo(45);
        assertThat(repHistory.items()).hasSize(1);
        assertThat(repHistory.items().getFirst().delta()).isEqualTo(-15);
        assertThat(repHistory.items().getFirst().actorName()).isEqualTo("Người Bán");

        var modLogs = userManagement.getUserModerationLogs(buyer, 0, 20);
        assertThat(modLogs.items()).extracting("actionType")
                .containsExactly("UNLOCK_EXPIRED_TEMP", "THRESHOLD_LOCK_TEMPORARY");
    }
}
