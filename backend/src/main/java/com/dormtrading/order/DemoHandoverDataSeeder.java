package com.dormtrading.order;

import com.dormtrading.catalog.media.MediaImageSanitizer;
import com.dormtrading.catalog.media.MediaMagicBytes;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Opt-in local/demo data seeder for experiencing P3-02 handover, 6-digit OTP completion,
 * and post-delivery mutual cancellation immediately on Mobile and Admin Web without manual SQL.
 *
 * <p>Strictly disabled in production and test environments: requires BOTH an active {@code dev} or
 * {@code demo} Spring profile (never {@code prod}) AND {@code app.demo.seed-enabled=true}.
 */
@Component
@Profile("(dev | demo) & !prod")
@ConditionalOnProperty(name = "app.demo.seed-enabled", havingValue = "true")
public class DemoHandoverDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoHandoverDataSeeder.class);

    public static final String DEMO_PASSWORD = "DormDemo!2026";
    public static final String SELLER_EMAIL = "an.seller@gm.uit.edu.vn";
    public static final String BUYER_EMAIL = "binh.buyer@gm.uit.edu.vn";
    public static final String MODERATOR_EMAIL = "mod.demo@gm.uit.edu.vn";

    static final UUID SELLER_ID = UUID.fromString("11111111-2222-4333-8444-555555550001");
    static final UUID BUYER_ID = UUID.fromString("11111111-2222-4333-8444-555555550002");
    static final UUID MODERATOR_ID = UUID.fromString("11111111-2222-4333-8444-555555550003");

    static final UUID TX_PAID_DANG_GIAO_ID = UUID.fromString("22222222-3333-4444-8555-666666660001");
    static final UUID TX_FREE_COMBO_DANG_GIAO_ID = UUID.fromString("22222222-3333-4444-8555-666666660002");
    static final UUID TX_OTP_CHO_XAC_NHAN_ID = UUID.fromString("22222222-3333-4444-8555-666666660003");
    static final UUID TX_PENDING_CANCEL_ID = UUID.fromString("22222222-3333-4444-8555-666666660004");
    static final UUID TX_CANCEL_DISPUTE_ID = UUID.fromString("22222222-3333-4444-8555-666666660005");
    static final UUID TX_COMPLETED_RECEIPT_ID = UUID.fromString("22222222-3333-4444-8555-666666660006");

    private final JdbcTemplate db;
    private final PasswordEncoder passwordEncoder;
    private final HandoverProofStorage proofStorage;
    private final HandoverOtpCrypto otpCrypto;
    private final Clock clock;

    public DemoHandoverDataSeeder(
            JdbcTemplate db,
            PasswordEncoder passwordEncoder,
            HandoverProofStorage proofStorage,
            HandoverOtpCrypto otpCrypto,
            Clock clock
    ) {
        this.db = db;
        this.passwordEncoder = passwordEncoder;
        this.proofStorage = proofStorage;
        this.otpCrypto = otpCrypto;
        this.clock = clock != null ? clock : Clock.systemUTC();
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedIfAbsent();
    }

    @Transactional
    public void seedIfAbsent() {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        String encodedPassword = passwordEncoder.encode(DEMO_PASSWORD);

        UUID sellerId = ensureDemoMember(
                SELLER_ID, SELLER_EMAIL, encodedPassword,
                "Nguyễn Minh An", "22520101", "KTX Khu A - Nhà B4", "Kỹ thuật Phần mềm", 115, false
        );
        UUID buyerId = ensureDemoMember(
                BUYER_ID, BUYER_EMAIL, encodedPassword,
                "Trần Quốc Bình", "22520202", "KTX Khu B - Nhà C2", "Khoa học Máy tính", 100, false
        );
        ensureDemoMember(
                MODERATOR_ID, MODERATOR_EMAIL, encodedPassword,
                "Lê Hoàng Kiểm Duyệt", "21520001", "ĐH CNTT (UIT)", "Hệ thống Thông tin", 120, true
        );

        byte[] sanitizedProofJpeg = createSanitizedDemoProofJpeg();
        String proofSha256 = MediaMagicBytes.sha256Hex(sanitizedProofJpeg);

        // 1. DANG_GIAO paid deal (Seller tests photo upload & report delivered)
        seedDealIfAbsent(
                TX_PAID_DANG_GIAO_ID,
                UUID.fromString("33333333-4444-4555-8666-777777770001"),
                sellerId,
                buyerId,
                "Đèn bàn học chống cận Rạng Đông RD-RL-27",
                "Đèn học ánh sáng vàng ấm, bóng LED mới thay, kèm dây nguồn dài 1.5m.",
                "Mới 95%, đầy đủ bóng LED",
                120000,
                "BAN_LE",
                "THIET_BI_DIEN",
                "KTX_KHU_A",
                "KTX Khu A ĐHQG-HCM",
                "GIU_CHO",
                "DANG_GIAO",
                "Sảnh B4, KTX Khu A ĐHQG-HCM",
                now.plus(30, ChronoUnit.MINUTES),
                now.minus(45, ChronoUnit.MINUTES),
                null,
                null,
                null,
                List.of(new SeedItem(
                        UUID.fromString("44444444-5555-4666-8777-888888880001"),
                        "Đèn bàn Rạng Đông RD-RL-27",
                        "Mới 95%, đầy đủ bóng LED",
                        "DANG_GIU"
                )),
                null,
                null,
                null,
                null,
                now
        );

        // 2. DANG_GIAO free 0đ combo (UC-27 A2: 0đ combo still requires handover photo + 6-digit OTP)
        seedDealIfAbsent(
                TX_FREE_COMBO_DANG_GIAO_ID,
                UUID.fromString("33333333-4444-4555-8666-777777770002"),
                sellerId,
                buyerId,
                "Combo 2 giáo trình SE100 + Cấu trúc dữ liệu (Cho tặng)",
                "Tặng lại cho các bạn K19/K20 học SE100 và IT003, sách sạch đẹp có ghi chú ôn thi.",
                "Còn mới 85%, không rách trang",
                0,
                "BAN_COMBO",
                "GT_CNTT",
                "UIT",
                "Trường ĐH Công nghệ Thông tin (UIT)",
                "GIU_CHO",
                "DANG_GIAO",
                "Cổng chính UIT - Khu phố 6",
                now.plus(1, ChronoUnit.HOURS),
                now.minus(30, ChronoUnit.MINUTES),
                null,
                null,
                null,
                List.of(
                        new SeedItem(
                                UUID.fromString("44444444-5555-4666-8777-888888880002"),
                                "Giáo trình Nhập môn Công nghệ Phần mềm (SE100)",
                                "Còn mới 85%, có ghi chú ôn thi",
                                "DANG_GIU"
                        ),
                        new SeedItem(
                                UUID.fromString("44444444-5555-4666-8777-888888880003"),
                                "Giáo trình Cấu trúc dữ liệu & Giải thuật (IT003)",
                                "Bìa hơi gập góc, nội dung đầy đủ",
                                "DANG_GIU"
                        )
                ),
                null,
                null,
                null,
                null,
                now
        );

        // 3. CHO_XAC_NHAN with live sanitized proof photo + fresh 10-min OTP (Buyer tests OTP complete/wrong/reissue)
        seedDealIfAbsent(
                TX_OTP_CHO_XAC_NHAN_ID,
                UUID.fromString("33333333-4444-4555-8666-777777770003"),
                sellerId,
                buyerId,
                "Quạt đứng Senko 5 cánh phòng KTX",
                "Quạt chạy êm, 3 tốc độ gió mạnh, rất hợp phòng KTX Khu B mùa nóng.",
                "Đang dùng tốt, mới 90%",
                180000,
                "BAN_LE",
                "THIET_BI_DIEN",
                "KTX_KHU_B",
                "KTX Khu B ĐHQG-HCM",
                "GIU_CHO",
                "CHO_XAC_NHAN",
                "Sảnh C2, KTX Khu B ĐHQG-HCM",
                now.minus(15, ChronoUnit.MINUTES),
                now.minus(20, ChronoUnit.MINUTES),
                now.minus(2, ChronoUnit.MINUTES),
                null,
                null,
                List.of(new SeedItem(
                        UUID.fromString("44444444-5555-4666-8777-888888880004"),
                        "Quạt đứng Senko 5 cánh màu xanh",
                        "Đang dùng tốt, mới 90%",
                        "DANG_GIU"
                )),
                new SeedProof(
                        UUID.fromString("55555555-6666-4777-8888-999999990003"),
                        "Đã cắm điện thử đủ 3 mức gió tại sảnh C2 và bàn giao cho bạn Bình.",
                        sanitizedProofJpeg,
                        proofSha256
                ),
                new SeedOtp(UUID.fromString("66666666-7777-4888-8999-aaaaaaaa0003"), false),
                null,
                null,
                now
        );

        // 4. CHO_XAC_NHAN with pending UC-28 cancel request from Buyer (Seller tests Agree/Reject)
        seedDealIfAbsent(
                TX_PENDING_CANCEL_ID,
                UUID.fromString("33333333-4444-4555-8666-777777770004"),
                sellerId,
                buyerId,
                "Bàn học gấp gỗ sồi mặt 60x40cm",
                "Bàn gấp chân sắt sơn tĩnh điện gọn nhẹ cho giường tầng KTX.",
                "Mặt bàn đẹp, gấp mở chắc chắn",
                95000,
                "BAN_LE",
                "NOI_THAT_TRO",
                "KTX_KHU_A",
                "KTX Khu A ĐHQG-HCM",
                "GIU_CHO",
                "CHO_XAC_NHAN",
                "Sảnh A3, KTX Khu A ĐHQG-HCM",
                now.minus(40, ChronoUnit.MINUTES),
                now.minus(50, ChronoUnit.MINUTES),
                now.minus(25, ChronoUnit.MINUTES),
                null,
                null,
                List.of(new SeedItem(
                        UUID.fromString("44444444-5555-4666-8777-888888880005"),
                        "Bàn học gấp gọn 60x40cm",
                        "Chân gấp có vết xước nhẹ",
                        "DANG_GIU"
                )),
                new SeedProof(
                        UUID.fromString("55555555-6666-4777-8888-999999990004"),
                        "Đã bàn giao bàn học gấp tại sảnh A3.",
                        sanitizedProofJpeg,
                        proofSha256
                ),
                new SeedOtp(UUID.fromString("66666666-7777-4888-8999-aaaaaaaa0004"), false),
                new SeedCancel(
                        UUID.fromString("77777777-8888-4999-8aaa-bbbbbbbb0004"),
                        buyerId,
                        "DEFECT_AT_HANDOVER",
                        "Kiểm tra trực tiếp thấy bản lề chân bàn bên trái hơi lỏng, xin hủy giao dịch.",
                        "CHO_XAC_NHAN",
                        null,
                        null
                ),
                null,
                now
        );

        // 5. CHO_XU_LY (CANCEL_DISPUTE) combo (Demonstrates KDV escalation & UC-29 Alt 4 flip-to-agree)
        seedDealIfAbsent(
                TX_CANCEL_DISPUTE_ID,
                UUID.fromString("33333333-4444-4555-8666-777777770005"),
                sellerId,
                buyerId,
                "Combo 3 móc áo + sào phơi đồ inox KTX",
                "Sào inox 2 tầng kèm bộ móc áo chống trượt cho ban công KTX Khu B.",
                "Sào inox chắc chắn, ít trầy",
                75000,
                "BAN_COMBO",
                "NOI_THAT_TRO",
                "KTX_KHU_B",
                "KTX Khu B ĐHQG-HCM",
                "GIU_CHO",
                "CHO_XU_LY",
                "Sảnh D5, KTX Khu B ĐHQG-HCM",
                now.minus(3, ChronoUnit.HOURS),
                now.minus(4, ChronoUnit.HOURS),
                now.minus(2, ChronoUnit.HOURS),
                null,
                "CANCEL_DISPUTE",
                List.of(
                        new SeedItem(
                                UUID.fromString("44444444-5555-4666-8777-888888880006"),
                                "Sào phơi đồ inox 2 tầng",
                                "Còn chắc chắn",
                                "DANG_GIU"
                        ),
                        new SeedItem(
                                UUID.fromString("44444444-5555-4666-8777-888888880007"),
                                "Bộ 3 móc áo inox chống trượt",
                                "Mới 90%",
                                "DANG_GIU"
                        )
                ),
                new SeedProof(
                        UUID.fromString("55555555-6666-4777-8888-999999990005"),
                        "Đã giao sào inox và túi móc áo tại sảnh D5.",
                        sanitizedProofJpeg,
                        proofSha256
                ),
                new SeedOtp(UUID.fromString("66666666-7777-4888-8999-aaaaaaaa0005"), false),
                new SeedCancel(
                        UUID.fromString("77777777-8888-4999-8aaa-bbbbbbbb0005"),
                        buyerId,
                        "COMBO_MISSING_ITEM",
                        "Kiểm tra túi phụ kiện thấy thiếu 1 thanh ốc nối tầng trên.",
                        "TU_CHOI",
                        sellerId,
                        "Thanh ốc nằm trong túi zip nhỏ gắn ở chân sào, mình đã chụp rõ trong ảnh bàn giao."
                ),
                now.minus(75, ChronoUnit.MINUTES),
                now
        );

        // 6. HOAN_TAT completed receipt (Demonstrates completed state + 15-day UC-30 prompt + full timeline)
        seedDealIfAbsent(
                TX_COMPLETED_RECEIPT_ID,
                UUID.fromString("33333333-4444-4555-8666-777777770006"),
                sellerId,
                buyerId,
                "Ấm đun siêu tốc Sunhouse 1.8L",
                "Ấm đun nước sôi nhanh 3 phút, tự ngắt an toàn, phù hợp pha mì/trà đêm ôn thi.",
                "Mới 92%, sạch không đóng cặn",
                110000,
                "BAN_LE",
                "DO_GIA_DUNG",
                "NVH_SV",
                "Nhà Văn hóa Sinh viên ĐHQG-HCM",
                "KET_THUC",
                "HOAN_TAT",
                "Sảnh chính Nhà Văn hóa Sinh viên ĐHQG-HCM",
                now.minus(2, ChronoUnit.DAYS),
                now.minus(2, ChronoUnit.DAYS).minus(20, ChronoUnit.MINUTES),
                now.minus(2, ChronoUnit.DAYS).plus(5, ChronoUnit.MINUTES),
                now.minus(2, ChronoUnit.DAYS).plus(8, ChronoUnit.MINUTES),
                null,
                List.of(new SeedItem(
                        UUID.fromString("44444444-5555-4666-8777-888888880008"),
                        "Ấm đun siêu tốc Sunhouse SHD1182 1.8L",
                        "Mới 92%, sạch không đóng cặn",
                        "DA_CHUYEN_GIAO"
                )),
                new SeedProof(
                        UUID.fromString("55555555-6666-4777-8888-999999990006"),
                        "Đã bàn giao ấm đun kèm đế điện tại sảnh NVH Sinh viên.",
                        sanitizedProofJpeg,
                        proofSha256
                ),
                new SeedOtp(UUID.fromString("66666666-7777-4888-8999-aaaaaaaa0006"), true),
                null,
                null,
                now
        );

        log.info("DemoHandoverDataSeeder ensured P3-02 demo accounts ({}, {}, {}) and 6 sample UIT KTX transactions.",
                SELLER_EMAIL, BUYER_EMAIL, MODERATOR_EMAIL);
    }

    private UUID ensureDemoMember(
            UUID preferredId,
            String email,
            String encodedPassword,
            String fullName,
            String mssv,
            String campus,
            String major,
            int score,
            boolean moderator
    ) {
        List<java.util.Map<String, Object>> existing = db.queryForList(
                "SELECT user_id, email FROM thanh_viens WHERE user_id = ? OR lower(email) = lower(?) LIMIT 1",
                preferredId,
                email
        );
        UUID userId;
        String resolvedEmail;
        if (!existing.isEmpty()) {
            userId = (UUID) existing.getFirst().get("user_id");
            resolvedEmail = String.valueOf(existing.getFirst().get("email"));
        } else {
            userId = preferredId;
            resolvedEmail = email;
            String effectiveMssv = mssv;
            Integer mssvCount = db.queryForObject(
                    "SELECT COUNT(*) FROM thanh_viens WHERE mssv = ?",
                    Integer.class,
                    mssv
            );
            if (mssvCount != null && mssvCount > 0) {
                effectiveMssv = "DM" + preferredId.toString().replace("-", "").substring(0, 12);
            }
            db.update(
                    """
                    INSERT INTO thanh_viens(
                        user_id, email, mat_khau_hash, ho_ten, mssv, truong, co_so, nganh_hoc,
                        nien_khoa, trang_thai_sv, diem_uy_tin, trang_thai_tai_khoan,
                        email_verified, profile_approved
                    ) VALUES (?, ?, ?, ?, ?, 'ĐHQG-HCM - UIT', ?, ?, '2022-2026', 'DANG_HOC', ?, 'HOAT_DONG', TRUE, TRUE)
                    """,
                    userId, email, encodedPassword, fullName, effectiveMssv, campus, major, score
            );
        }

        if (moderator && MODERATOR_EMAIL.equalsIgnoreCase(resolvedEmail)) {
            Integer modCount = db.queryForObject(
                    "SELECT COUNT(*) FROM vai_tro_quan_tri WHERE user_id = ? AND loai_vai_tro = 'KIEM_DUYET_VIEN' AND trang_thai_hieu_luc = TRUE",
                    Integer.class,
                    userId
            );
            if (modCount == null || modCount == 0) {
                db.update(
                        "INSERT INTO vai_tro_quan_tri(user_id, loai_vai_tro, bat_dau, trang_thai_hieu_luc) VALUES (?, 'KIEM_DUYET_VIEN', ?, TRUE)",
                        userId,
                        Timestamp.from(clock.instant().minus(1, ChronoUnit.DAYS))
                );
            }
        }
        return userId;
    }

    private void seedDealIfAbsent(
            UUID txId,
            UUID listingId,
            UUID sellerId,
            UUID buyerId,
            String title,
            String description,
            String condition,
            int priceVnd,
            String listingType,
            String categoryId,
            String locationCode,
            String locationText,
            String listingStatus,
            String txStatus,
            String appointmentLocation,
            Instant appointmentAt,
            Instant deliveryStartedAt,
            Instant deliveredAt,
            Instant completedAt,
            String escalationReason,
            List<SeedItem> items,
            SeedProof proof,
            SeedOtp otp,
            SeedCancel cancel,
            Instant escalatedAt,
            Instant now
    ) {
        Integer existingTx = db.queryForObject(
                "SELECT COUNT(*) FROM giao_dichs WHERE ma_giao_dich = ?",
                Integer.class,
                txId
        );
        if (existingTx != null && existingTx > 0) {
            return;
        }

        Timestamp publishedTs = Timestamp.from(now.minus(5, ChronoUnit.DAYS));
        Timestamp expiresTs = Timestamp.from(now.plus(25, ChronoUnit.DAYS));
        Timestamp closedTs = "KET_THUC".equals(listingStatus) && completedAt != null ? Timestamp.from(completedAt) : null;

        db.update(
                """
                INSERT INTO tin_dangs(
                    ma_tin, nguoi_dang_id, tieu_de, mo_ta, tinh_trang, gia_vnd, hinh_anh,
                    khu_vuc, ma_khu_vuc, ma_danh_muc, hinh_thuc, trang_thai,
                    published_at, expires_at, closed_at
                ) VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (ma_tin) DO NOTHING
                """,
                listingId, sellerId, title, description, condition, priceVnd,
                locationText, locationCode, categoryId, listingType, listingStatus,
                publishedTs, expiresTs, closedTs
        );

        for (SeedItem item : items) {
            db.update(
                    """
                    INSERT INTO do_vats(ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai)
                    VALUES (?, ?, ?, ?, '{}', ?)
                    ON CONFLICT (ma_vat) DO NOTHING
                    """,
                    item.id(), sellerId, item.name(), item.condition(), item.status()
            );
            db.update(
                    "INSERT INTO tin_dang_do_vat(ma_tin, ma_vat) VALUES (?, ?) ON CONFLICT (ma_tin, ma_vat) DO NOTHING",
                    listingId, item.id()
            );
        }

        String primaryPhotoUrl = proof != null ? "/api/v1/transactions/" + txId + "/handover-photo" : null;
        String deliveryNote = proof != null ? proof.note() : null;
        Instant updatedAt = completedAt != null
                ? completedAt
                : (escalatedAt != null ? escalatedAt : (deliveredAt != null ? deliveredAt : now));

        db.update(
                """
                INSERT INTO giao_dichs(
                    ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan,
                    thoi_gian_hen, dia_diem_hen, anh_ban_giao, ghi_chu_ban_giao,
                    trang_thai, ly_do_cho_xu_ly, thoi_diem_chuyen_xu_ly,
                    thoi_diem_giu_cho, thoi_diem_bat_dau_giao, thoi_diem_bao_giao, thoi_diem_hoan_tat,
                    updated_at, version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                txId, listingId, sellerId, buyerId, priceVnd,
                toTs(appointmentAt), appointmentLocation, primaryPhotoUrl, deliveryNote,
                txStatus, escalationReason, toTs(escalatedAt),
                Timestamp.from(now.minus(3, ChronoUnit.DAYS)),
                toTs(deliveryStartedAt), toTs(deliveredAt), toTs(completedAt),
                Timestamp.from(updatedAt)
        );

        if (proof != null && deliveredAt != null) {
            String storageKey = txId + "/" + proof.id() + ".jpg";
            proofStorage.store(storageKey, proof.bytes(), "image/jpeg");
            db.update(
                    """
                    INSERT INTO anh_ban_giao_giao_dichs(
                        id, ma_giao_dich, nguoi_tai_len_id, storage_key, original_filename,
                        content_type, size_bytes, sha256, thu_tu, uploaded_at
                    ) VALUES (?, ?, ?, ?, 'handover-proof.jpg', 'image/jpeg', ?, ?, 0, ?)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    proof.id(), txId, sellerId, storageKey,
                    (long) proof.bytes().length, proof.sha256(), Timestamp.from(deliveredAt)
            );
            insertTimeline(
                    txId, "REPORT_DELIVERED", "DANG_GIAO", "CHO_XAC_NHAN",
                    sellerId, "SELLER", proof.note(), deliveredAt
            );
        }

        if (otp != null) {
            String code = otpCrypto.generateCode();
            String hash = otpCrypto.hashCode(otp.id(), txId, code);
            String ciphertext = otp.used() ? null : otpCrypto.encryptCode(otp.id(), txId, code);
            Instant issuedAt = otp.used() && deliveredAt != null ? deliveredAt : now;
            Instant expiresAt = issuedAt.plusSeconds(TransactionHandoverService.DEFAULT_OTP_TTL_SECONDS);
            Timestamp usedAt = otp.used() && completedAt != null ? Timestamp.from(completedAt) : null;

            db.update(
                    """
                    INSERT INTO ma_xac_nhan_otp(
                        id, ma_giao_dich, ma_otp, otp_hash, otp_ciphertext,
                        thoi_diem_phat, thoi_diem_het_han, so_lan_thu_sai, so_lan_thu_toi_da,
                        da_dung, bi_vo_hieu, thoi_diem_dung, nguoi_cap_id
                    ) VALUES (?, ?, NULL, ?, ?, ?, ?, 0, 5, ?, FALSE, ?, ?)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    otp.id(), txId, hash, ciphertext,
                    Timestamp.from(issuedAt), Timestamp.from(expiresAt),
                    otp.used(), usedAt, sellerId
            );
        }

        if (cancel != null && deliveredAt != null) {
            Instant requestedAt = deliveredAt.plus(10, ChronoUnit.MINUTES);
            Instant respondedAt = "TU_CHOI".equals(cancel.status())
                    ? (escalatedAt != null ? escalatedAt : requestedAt.plus(20, ChronoUnit.MINUTES))
                    : null;
            db.update(
                    """
                    INSERT INTO yeu_cau_huy_giao_dichs(
                        id, ma_giao_dich, nguoi_yeu_cau_id, ma_ly_do, ly_do, trang_thai,
                        nguoi_phan_hoi_id, phan_hoi_ghi_chu, thoi_diem_phan_hoi, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    cancel.id(), txId, cancel.requesterId(), cancel.reasonCode(), cancel.reasonNote(), cancel.status(),
                    cancel.responderId(), cancel.responseNote(), toTs(respondedAt),
                    Timestamp.from(requestedAt), Timestamp.from(respondedAt != null ? respondedAt : requestedAt)
            );
            String requesterRole = cancel.requesterId().equals(sellerId) ? "SELLER" : "BUYER";
            insertTimeline(
                    txId, "CANCEL_REQUESTED", "CHO_XAC_NHAN", "CHO_XAC_NHAN",
                    cancel.requesterId(), requesterRole, cancel.reasonNote(), requestedAt
            );
            if ("TU_CHOI".equals(cancel.status()) && cancel.responderId() != null && respondedAt != null) {
                String responderRole = cancel.responderId().equals(sellerId) ? "SELLER" : "BUYER";
                insertTimeline(
                        txId, "CANCEL_REJECTED", "CHO_XAC_NHAN", "CHO_XU_LY",
                        cancel.responderId(), responderRole, cancel.responseNote(), respondedAt
                );
            }
        }

        if ("HOAN_TAT".equals(txStatus) && completedAt != null) {
            insertTimeline(
                    txId, "COMPLETED_BY_OTP", "CHO_XAC_NHAN", "HOAN_TAT",
                    buyerId, "BUYER", "Người mua đã xác nhận nhận hàng.", completedAt
            );
        }
    }

    private void insertTimeline(
            UUID txId,
            String action,
            String fromStatus,
            String toStatus,
            UUID actorId,
            String actorRole,
            String note,
            Instant at
    ) {
        db.update(
                """
                INSERT INTO lich_su_trang_thai_giao_dich(
                    id, ma_giao_dich, hanh_dong, trang_thai_truoc, trang_thai_sau,
                    nguoi_thuc_hien_id, vai_tro_thuc_hien, ghi_chu, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                UUID.randomUUID(), txId, action, fromStatus, toStatus, actorId, actorRole, note, Timestamp.from(at)
        );
    }

    private static Timestamp toTs(Instant instant) {
        return instant != null ? Timestamp.from(instant) : null;
    }

    /**
     * Generates a pure-pixel editorial JPEG (no AWT font/X11 dependencies) and runs it through
     * {@link MediaImageSanitizer} so demo proof images behave identically to real seller uploads.
     */
    static byte[] createSanitizedDemoProofJpeg() {
        try {
            int width = 320;
            int height = 240;
            BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            int paper = new Color(246, 241, 234).getRGB();
            int card = new Color(255, 253, 250).getRGB();
            int terracotta = new Color(181, 65, 40).getRGB();
            int sage = new Color(29, 107, 75).getRGB();
            int border = new Color(225, 217, 206).getRGB();

            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    boolean inCard = x >= 24 && x < width - 24 && y >= 24 && y < height - 24;
                    boolean onBorder = inCard && (x == 24 || x == width - 25 || y == 24 || y == height - 25);
                    boolean inBanner = x >= 40 && x < width - 40 && y >= 42 && y < 74;
                    boolean inSeal = x >= 40 && x < 136 && y >= 92 && y < 188;
                    boolean inStripe = x >= 156 && x < width - 40 && ((y >= 104 && y < 118) || (y >= 134 && y < 146) || (y >= 162 && y < 172));
                    if (inBanner) {
                        img.setRGB(x, y, terracotta);
                    } else if (inSeal) {
                        img.setRGB(x, y, sage);
                    } else if (inStripe || onBorder) {
                        img.setRGB(x, y, border);
                    } else if (inCard) {
                        img.setRGB(x, y, card);
                    } else {
                        img.setRGB(x, y, paper);
                    }
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "jpeg", out);
            byte[] raw = out.toByteArray();
            return MediaImageSanitizer.sanitize(
                    raw,
                    MediaMagicBytes.DetectedImageType.JPEG,
                    TransactionHandoverService.DEFAULT_MAX_PROOF_SIZE_BYTES
            );
        } catch (IOException e) {
            throw new IllegalStateException("Cannot generate demo handover proof JPEG", e);
        }
    }

    private record SeedItem(UUID id, String name, String condition, String status) {
    }

    private record SeedProof(UUID id, String note, byte[] bytes, String sha256) {
    }

    private record SeedOtp(UUID id, boolean used) {
    }

    private record SeedCancel(
            UUID id,
            UUID requesterId,
            String reasonCode,
            String reasonNote,
            String status,
            UUID responderId,
            String responseNote
    ) {
    }
}
