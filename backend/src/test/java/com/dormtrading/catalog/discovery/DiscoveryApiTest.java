package com.dormtrading.catalog.discovery;

import com.dormtrading.catalog.ListingLifecycleHelper;
import com.dormtrading.common.BaseIntegrationTest;
import com.dormtrading.iam.auth.AuthService;
import com.dormtrading.iam.auth.OtpDelivery;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

class DiscoveryApiTest extends BaseIntegrationTest {

    @Autowired
    private AuthService auth;

    @Autowired
    private OtpDelivery delivery;

    @Autowired
    private JdbcTemplate db;

    @Autowired
    private ListingLifecycleHelper lifecycleHelper;

    @MockitoBean
    private JavaMailSender mail;

    @MockitoBean
    private Clock clock;

    private final AtomicReference<Instant> currentTime = new AtomicReference<>();
    private final ConcurrentMap<String, String> otpCodes = new ConcurrentHashMap<>();
    private final List<UUID> createdUserIds = new ArrayList<>();
    private final List<UUID> createdListingIds = new ArrayList<>();
    private final List<UUID> createdItemIds = new ArrayList<>();
    private final List<UUID> createdTransactionIds = new ArrayList<>();
    private final List<UUID> createdReviewIds = new ArrayList<>();

    private static final String PASSWORD = "a quiet river beneath stars";

    @BeforeEach
    void setup() {
        currentTime.set(Instant.now().truncatedTo(ChronoUnit.MILLIS));
        when(clock.instant()).thenAnswer(invocation -> currentTime.get());
        doAnswer(invocation -> {
            SimpleMailMessage msg = invocation.getArgument(0);
            var matcher = Pattern.compile("[0-9]{6}").matcher(Objects.requireNonNull(msg.getText()));
            if (matcher.find()) {
                otpCodes.put(Objects.requireNonNull(msg.getTo())[0], matcher.group());
            }
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));
    }

    @AfterEach
    void tearDown() {
        for (UUID reviewId : createdReviewIds) {
            db.update("DELETE FROM danh_gias WHERE ma_danh_gia = ?", reviewId);
        }
        for (UUID txId : createdTransactionIds) {
            db.update("DELETE FROM giao_dichs WHERE ma_giao_dich = ?", txId);
        }
        for (UUID listingId : createdListingIds) {
            db.update("DELETE FROM tin_dangs WHERE ma_tin = ?", listingId);
        }
        for (UUID itemId : createdItemIds) {
            db.update("DELETE FROM do_vats WHERE ma_vat = ?", itemId);
        }
        createdReviewIds.clear();
        createdTransactionIds.clear();
        createdListingIds.clear();
        createdItemIds.clear();
        createdUserIds.clear();
    }

    private record TestUser(UUID id, String email, String studentId, String phone, String token) {
    }

    private TestUser createUser(String displayName, String accountStatus, int reputationScore) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String studentId = "SV" + suffix.substring(0, 8);
        String email = "disc_" + suffix + "@student.edu.vn";
        String phone = "09" + Math.abs(suffix.hashCode() % 100000000);
        String ip = "10.2." + (Math.abs(suffix.hashCode()) % 250) + ".1";

        auth.register(displayName, studentId, email, PASSWORD, ip);
        UUID userId = db.queryForObject("SELECT user_id FROM thanh_viens WHERE email = ?", UUID.class, email);
        createdUserIds.add(userId);

        if ("HOAT_DONG".equals(accountStatus) || "BI_KHOA".equals(accountStatus)) {
            delivery.deliver();
            String code = otpCodes.get(email);
            UUID challengeId = db.queryForObject(
                    "SELECT id FROM auth_challenge WHERE email = ? AND purpose = 'REGISTER' AND NOT used ORDER BY created_at DESC LIMIT 1",
                    UUID.class,
                    email
            );
            auth.verify(challengeId, email, "REGISTER", code, ip);
            db.update(
                    """
                    UPDATE thanh_viens
                    SET profile_approved = TRUE,
                        trang_thai_tai_khoan = ?,
                        diem_uy_tin = ?,
                        so_dien_thoai = ?,
                        anh_the_sv_truoc = 'https://private.local/card-front-secret.jpg',
                        anh_the_sv_sau = 'https://private.local/card-back-secret.jpg',
                        loai_han_che = CASE WHEN ? = 'BI_KHOA' THEN 'KHOA_TAM_THOI' ELSE NULL END,
                        ly_do_han_che = CASE WHEN ? = 'BI_KHOA' THEN 'Hạn chế kiểm thử' ELSE NULL END
                    WHERE user_id = ?
                    """,
                    accountStatus,
                    reputationScore,
                    phone,
                    accountStatus,
                    accountStatus,
                    userId
            );
        } else {
            db.update(
                    """
                    UPDATE thanh_viens
                    SET so_dien_thoai = ?,
                        anh_the_sv_truoc = 'https://private.local/card-front-secret.jpg',
                        anh_the_sv_sau = 'https://private.local/card-back-secret.jpg'
                    WHERE user_id = ?
                    """,
                    phone,
                    userId
            );
        }

        String token = auth.login(email, PASSWORD, "mobile", ip).token();
        return new TestUser(userId, email, studentId, phone, token);
    }

    private UUID createItem(UUID ownerId, String name, String condition, String status, List<String> images) {
        UUID itemId = UUID.randomUUID();
        Instant now = currentTime.get();
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                    INSERT INTO do_vats (ma_vat, user_id, ten, tinh_trang, hinh_anh, trang_thai, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """
            );
            ps.setObject(1, itemId);
            ps.setObject(2, ownerId);
            ps.setString(3, name);
            ps.setString(4, condition);
            ps.setArray(5, con.createArrayOf("text", images.toArray(new String[0])));
            ps.setString(6, status);
            ps.setTimestamp(7, Timestamp.from(now));
            ps.setTimestamp(8, Timestamp.from(now));
            return ps;
        });
        createdItemIds.add(itemId);
        return itemId;
    }

    private UUID createListing(
            UUID sellerId,
            String title,
            String description,
            String condition,
            int priceVnd,
            String listingType,
            String status,
            String categoryId,
            String courseCode,
            String courseName,
            String author,
            String locationCode,
            String locationText,
            Double lat,
            Double lng,
            List<String> images,
            Instant publishedAt,
            Instant expiresAt,
            String hiddenReason,
            List<UUID> itemIds
    ) {
        UUID listingId = UUID.randomUUID();
        Instant createdAt = publishedAt != null ? publishedAt : currentTime.get();
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                    INSERT INTO tin_dangs (
                        ma_tin, nguoi_dang_id, tieu_de, mo_ta, tinh_trang, gia_vnd, hinh_thuc, trang_thai,
                        ma_danh_muc, ma_mon_hoc, ten_mon_hoc, tac_gia, ma_khu_vuc, khu_vuc, vi_do, kinh_do,
                        hinh_anh, published_at, expires_at, ly_do_an, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """
            );
            ps.setObject(1, listingId);
            ps.setObject(2, sellerId);
            ps.setString(3, title);
            ps.setString(4, description);
            ps.setString(5, condition);
            ps.setInt(6, priceVnd);
            ps.setString(7, listingType);
            ps.setString(8, status);
            ps.setString(9, categoryId);
            ps.setString(10, courseCode);
            ps.setString(11, courseName);
            ps.setString(12, author);
            ps.setString(13, locationCode);
            ps.setString(14, locationText);
            if (lat != null) {
                ps.setDouble(15, lat);
            } else {
                ps.setNull(15, java.sql.Types.DOUBLE);
            }
            if (lng != null) {
                ps.setDouble(16, lng);
            } else {
                ps.setNull(16, java.sql.Types.DOUBLE);
            }
            ps.setArray(17, con.createArrayOf("text", images.toArray(new String[0])));
            ps.setTimestamp(18, publishedAt != null ? Timestamp.from(publishedAt) : null);
            ps.setTimestamp(19, expiresAt != null ? Timestamp.from(expiresAt) : null);
            ps.setString(20, hiddenReason);
            ps.setTimestamp(21, Timestamp.from(createdAt));
            ps.setTimestamp(22, Timestamp.from(createdAt));
            return ps;
        });
        createdListingIds.add(listingId);

        for (UUID itemId : itemIds) {
            db.update("INSERT INTO tin_dang_do_vat (ma_tin, ma_vat) VALUES (?, ?)", listingId, itemId);
        }
        return listingId;
    }

    private UUID createTransaction(UUID listingId, UUID sellerId, UUID buyerId, int priceVnd, String status) {
        UUID txId = UUID.randomUUID();
        db.update(
                """
                INSERT INTO giao_dichs (ma_giao_dich, ma_tin, nguoi_ban_id, nguoi_mua_id, gia_thoa_thuan, trang_thai)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                txId, listingId, sellerId, buyerId, priceVnd, status
        );
        createdTransactionIds.add(txId);
        return txId;
    }

    private UUID createReview(UUID txId, UUID buyerId, UUID sellerId, int stars, String status) {
        UUID reviewId = UUID.randomUUID();
        db.update(
                """
                INSERT INTO danh_gias (ma_danh_gia, ma_giao_dich, nguoi_danh_gia_id, nguoi_bi_danh_gia_id, so_sao, nhan_xet, trang_thai)
                VALUES (?, ?, ?, ?, ?, 'Nhận xét kiểm thử', ?)
                """,
                reviewId, txId, buyerId, sellerId, stars, status
        );
        createdReviewIds.add(reviewId);
        return reviewId;
    }

    @Test
    void keywordSearchMatchesTitleDescriptionCourseAuthorAndLinkedItemWithWildcardSafety() {
        TestUser seller = createUser("Nguyễn Văn Search", "HOAT_DONG", 110);
        Instant now = currentTime.get();
        Instant future = now.plus(20, ChronoUnit.DAYS);
        String tag = "KW_" + UUID.randomUUID().toString().substring(0, 6);

        UUID linkedItem = createItem(seller.id(), "Tai nghe Sony WH1000XM4 " + tag, "Mới 95%", "KHA_DUNG",
                List.of("https://img.example/item1.jpg"));

        UUID byTitle = createListing(seller.id(), "Quạt bàn Mitsubishi " + tag, "Mô tả thường", "Mới 90%", 180000,
                "BAN_LE", "CONG_KHAI", "THIET_BI_DIEN", null, null, null, "KTX_KHU_A", "KTX Khu A", null, null,
                List.of("https://img.example/q1.jpg"), now, future, null, List.of());

        UUID byDescAndBook = createListing(seller.id(), "Sách lập trình " + tag, "Bản in gốc không gạch bút chì", "Như mới", 95000,
                "BAN_LE", "CONG_KHAI", "GT_CNTT", "CS201_" + tag, "Cấu trúc dữ liệu nâng cao", "Thomas Cormen",
                "UIT", "UIT", null, null, List.of("https://img.example/b1.jpg"), now, future, null, List.of());

        UUID byLinkedItem = createListing(seller.id(), "Combo phụ kiện học tập " + tag, "Gồm tai nghe chất lượng", "Đẹp", 500000,
                "BAN_LE", "CONG_KHAI", "TB_DIEN_TU", null, null, null, "KTX_KHU_A", "KTX Khu A", null, null,
                List.of("https://img.example/c1.jpg"), now, future, null, List.of(linkedItem));

        UUID wildcardLiteral = createListing(seller.id(), "Giảm 50%_off\\deal " + tag, "Sách cũ", "Ổn", 50000,
                "BAN_LE", "CONG_KHAI", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/w1.jpg"), now, future, null, List.of());

        UUID wildcardDecoy = createListing(seller.id(), "Giảm 500XoffAdeal " + tag, "Sách cũ", "Ổn", 50000,
                "BAN_LE", "CONG_KHAI", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/w2.jpg"), now, future, null, List.of());

        // Match title
        given().queryParam("q", "mitsubishi " + tag)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(byTitle.toString()));

        // Match description
        given().queryParam("q", "không gạch bút chì")
                .queryParam("courseCode", "CS201_" + tag)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(byDescAndBook.toString()));

        // Match courseCode via q
        given().queryParam("q", "cs201_" + tag)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(byDescAndBook.toString()));

        // Match courseName via q
        given().queryParam("q", "Cấu trúc dữ liệu nâng cao")
                .queryParam("courseCode", "cs201_" + tag)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(byDescAndBook.toString()));

        // Match author via q
        given().queryParam("q", "thomas cormen")
                .queryParam("courseCode", "cs201_" + tag)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(byDescAndBook.toString()));

        // Match linked do_vats.ten via q
        given().queryParam("q", "WH1000XM4 " + tag)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(byLinkedItem.toString()));

        // SQL wildcard safety: literal %, _, \ must NOT behave as wildcards
        given().queryParam("q", "50%_off\\deal " + tag)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items", hasSize(1))
                .body("items[0].id", equalTo(wildcardLiteral.toString()));

        // Ensure decoy is NOT matched by literal %/_
        List<String> wildcardIds = given().queryParam("q", "50%_off\\deal")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .extract().jsonPath().getList("items.id", String.class);
        assertThat(wildcardIds).contains(wildcardLiteral.toString()).doesNotContain(wildcardDecoy.toString());
    }

    @Test
    void hierarchicalCategoryFilterIncludesAllDescendantsAndHandlesUnknownCategoryCleanly() {
        TestUser seller = createUser("Trần Thị Danh Mục", "HOAT_DONG", 100);
        Instant now = currentTime.get();
        Instant future = now.plus(25, ChronoUnit.DAYS);
        String tag = "CAT_" + UUID.randomUUID().toString().substring(0, 6);

        UUID rootTextbook = createListing(seller.id(), "Sách chung " + tag, "Mô tả", "Tốt", 40000,
                "BAN_LE", "CONG_KHAI", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/1.jpg"), now, future, null, List.of());

        UUID cnttBook = createListing(seller.id(), "Giáo trình CNTT " + tag, "Mô tả", "Tốt", 60000,
                "BAN_LE", "CONG_KHAI", "GT_CNTT", "SE104", null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/2.jpg"), now, future, null, List.of());

        UUID econBook = createListing(seller.id(), "Giáo trình Kinh tế " + tag, "Mô tả", "Tốt", 55000,
                "BAN_LE", "CONG_KHAI", "GT_KINH_TE", "EC101", null, null, "UEL", "UEL", null, null,
                List.of("https://img.example/3.jpg"), now, future, null, List.of());

        UUID generalBook = createListing(seller.id(), "Giải tích 1 " + tag, "Mô tả", "Tốt", 35000,
                "BAN_LE", "CONG_KHAI", "GT_DAI_CUONG", "MA006", null, null, "KHTN", "KHTN", null, null,
                List.of("https://img.example/4.jpg"), now, future, null, List.of());

        UUID householdItem = createListing(seller.id(), "Nồi cơm điện " + tag, "Mô tả", "Tốt", 250000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "KTX_KHU_A", "KTX Khu A", null, null,
                List.of("https://img.example/5.jpg"), now, future, null, List.of());

        // Parent category GIAO_TRINH returns itself + all children (GT_CNTT, GT_KINH_TE, GT_DAI_CUONG), excludes DO_GIA_DUNG
        given()
                .queryParam("q", tag)
                .queryParam("categoryId", "GIAO_TRINH")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items", hasSize(4))
                .body("items.id", containsInAnyOrder(
                        rootTextbook.toString(),
                        cnttBook.toString(),
                        econBook.toString(),
                        generalBook.toString()
                ));

        // Child category GT_CNTT returns only GT_CNTT
        given()
                .queryParam("q", tag)
                .queryParam("categoryId", "GT_CNTT")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items", hasSize(1))
                .body("items[0].id", equalTo(cnttBook.toString()));

        // Unknown category returns clean empty page (200, no 500)
        given()
                .queryParam("categoryId", "UNKNOWN_CATEGORY_XYZ")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items", hasSize(0))
                .body("totalElements", equalTo(0))
                .body("totalPages", equalTo(0));

        // Verify DO_GIA_DUNG is present when queried directly
        given()
                .queryParam("q", tag)
                .queryParam("categoryId", "DO_GIA_DUNG")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(householdItem.toString()));
    }

    @Test
    void courseCodePriceRangeFreeOnlyAndTypeFiltersWorkWithStrictValidation() {
        TestUser seller = createUser("Lê Văn Lọc", "HOAT_DONG", 125);
        Instant now = currentTime.get();
        Instant future = now.plus(25, ChronoUnit.DAYS);
        String tag = "FLT_" + UUID.randomUUID().toString().substring(0, 6);

        UUID itemA = createItem(seller.id(), "Sách SE100 " + tag, "Mới", "KHA_DUNG", List.of("https://img.example/a.jpg"));
        UUID itemB = createItem(seller.id(), "Sách SE200 " + tag, "Mới", "KHA_DUNG", List.of("https://img.example/b.jpg"));
        UUID itemC = createItem(seller.id(), "Vở bài tập " + tag, "Mới", "KHA_DUNG", List.of("https://img.example/c.jpg"));

        UUID paidSingle = createListing(seller.id(), "Paid Single " + tag, "Desc", "Mới", 150000,
                "BAN_LE", "CONG_KHAI", "GT_CNTT", "SE100", "OOAD", "Author A", "UIT", "UIT", null, null,
                List.of("https://img.example/1.jpg"), now, future, null, List.of(itemA));

        UUID paidCombo = createListing(seller.id(), "Paid Combo " + tag, "Desc", "Mới", 300000,
                "BAN_COMBO", "CONG_KHAI", "GT_CNTT", "SE214", "CNPM", "Author B", "UIT", "UIT", null, null,
                List.of("https://img.example/2.jpg"), now, future, null, List.of(itemA, itemB));

        UUID freeSingle = createListing(seller.id(), "Free Single " + tag, "Desc", "Ổn", 0,
                "CHO_TANG", "CONG_KHAI", "DO_CHO_TANG", "CS101", "Nhập môn", null, "KTX_KHU_A", "KTX Khu A", null, null,
                List.of("https://img.example/3.jpg"), now, future, null, List.of(itemC));

        UUID freeCombo = createListing(seller.id(), "Free Combo " + tag, "Desc", "Ổn", 0,
                "BAN_COMBO", "CONG_KHAI", "GT_CNTT", "SE100", "OOAD Combo", null, "KTX_KHU_A", "KTX Khu A", null, null,
                List.of("https://img.example/4.jpg"), now, future, null, List.of(itemA, itemC));

        // courseCode case-insensitive exact match
        given().queryParam("q", tag).queryParam("courseCode", "se100")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", containsInAnyOrder(paidSingle.toString(), freeCombo.toString()));

        // courseCode case-insensitive partial match
        given().queryParam("q", tag).queryParam("courseCode", "se")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", containsInAnyOrder(paidSingle.toString(), paidCombo.toString(), freeCombo.toString()));

        // Price range filter
        given().queryParam("q", tag).queryParam("minPrice", 100000).queryParam("maxPrice", 200000)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(paidSingle.toString()));

        // freeOnly=true
        given().queryParam("q", tag).queryParam("freeOnly", true)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", containsInAnyOrder(freeSingle.toString(), freeCombo.toString()));

        // type=COMBO
        given().queryParam("q", tag).queryParam("type", "COMBO")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", containsInAnyOrder(paidCombo.toString(), freeCombo.toString()));

        // type=SINGLE
        given().queryParam("q", tag).queryParam("type", "SINGLE")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", containsInAnyOrder(paidSingle.toString(), freeSingle.toString()));

        // type=FREE
        given().queryParam("q", tag).queryParam("type", "FREE")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", containsInAnyOrder(freeSingle.toString(), freeCombo.toString()));

        // Vietnamese enum aliases: BAN_LE -> SINGLE, BAN_COMBO -> COMBO, CHO_TANG -> FREE
        given().queryParam("q", tag).queryParam("type", "BAN_LE")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", containsInAnyOrder(paidSingle.toString(), freeSingle.toString()));

        given().queryParam("q", tag).queryParam("type", "BAN_COMBO")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", containsInAnyOrder(paidCombo.toString(), freeCombo.toString()));

        given().queryParam("q", tag).queryParam("type", "CHO_TANG")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", containsInAnyOrder(freeSingle.toString(), freeCombo.toString()));

        // Validation errors
        given().queryParam("minPrice", 200000).queryParam("maxPrice", 100000)
                .get("/api/v1/listings")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_PRICE_RANGE"));

        given().queryParam("minPrice", -100)
                .get("/api/v1/listings")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_PRICE_RANGE"));

        given().queryParam("type", "AUCTION")
                .get("/api/v1/listings")
                .then()
                .statusCode(400)
                .body("code", equalTo("INVALID_INPUT"));
    }

    @Test
    void locationZoneFreeTextAndHaversineRadiusSearchWorkWithoutHardcodedRadiusCap() {
        TestUser seller = createUser("Phạm Văn Vị Trí", "HOAT_DONG", 115);
        Instant now = currentTime.get();
        Instant future = now.plus(25, ChronoUnit.DAYS);
        String tag = "LOC_" + UUID.randomUUID().toString().substring(0, 6);

        UUID atKtxA = createListing(seller.id(), "KTX A " + tag, "Desc", "Mới", 100000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "KTX_KHU_A", "KTX Khu A - Tòa A2", null, null,
                List.of("https://img.example/1.jpg"), now, future, null, List.of());

        UUID atBachKhoa = createListing(seller.id(), "BK CS2 " + tag, "Desc", "Mới", 120000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "BACH_KHOA_CS2", "Cổng Bách Khoa CS2", null, null,
                List.of("https://img.example/2.jpg"), now, future, null, List.of());

        UUID atUit = createListing(seller.id(), "UIT " + tag, "Desc", "Mới", 130000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "Sảnh C UIT", null, null,
                List.of("https://img.example/3.jpg"), now, future, null, List.of());

        UUID atKtxB = createListing(seller.id(), "KTX B " + tag, "Desc", "Mới", 140000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "KTX_KHU_B", "KTX Khu B - Tòa C4", null, null,
                List.of("https://img.example/4.jpg"), now, future, null, List.of());

        UUID atUel = createListing(seller.id(), "UEL " + tag, "Desc", "Mới", 150000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UEL", "Cổng UEL", null, null,
                List.of("https://img.example/5.jpg"), now, future, null, List.of());

        UUID freeTextOnly = createListing(seller.id(), "Chợ đêm " + tag, "Desc", "Mới", 80000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, null, "Chợ đêm Làng Đại Học", null, null,
                List.of("https://img.example/6.jpg"), now, future, null, List.of());

        // Exact zone filter
        given().queryParam("q", tag).queryParam("locationCode", "KTX_KHU_A")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(atKtxA.toString()))
                .body("items[0].distanceKm", nullValue());

        // Free-text location match against t.khu_vuc
        given().queryParam("q", tag).queryParam("location", "chợ đêm làng đại học")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(freeTextOnly.toString()));

        // Free-text location match against khu_vucs.ten
        given().queryParam("q", tag).queryParam("location", "Bách Khoa")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(atBachKhoa.toString()));

        // Haversine radius with explicit lat/lng (1.5km around KTX_KHU_A) sorted by distance_asc
        var radiusRes = given()
                .queryParam("q", tag)
                .queryParam("lat", 10.8782)
                .queryParam("lng", 106.8063)
                .queryParam("radiusKm", 1.5)
                .queryParam("sort", "distance_asc")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(atKtxA.toString(), atBachKhoa.toString(), atUit.toString()))
                .extract();
        assertThat(radiusRes.jsonPath().getDouble("items[0].distanceKm")).isCloseTo(0.0, within(0.01));
        assertThat(radiusRes.jsonPath().getDouble("items[1].distanceKm")).isCloseTo(0.28, within(0.05));
        assertThat(radiusRes.jsonPath().getDouble("items[2].distanceKm")).isCloseTo(0.98, within(0.05));

        // Haversine radius resolved from locationCode + radiusKm (UX bonus)
        given()
                .queryParam("q", tag)
                .queryParam("locationCode", "KTX_KHU_A")
                .queryParam("radiusKm", 1.5)
                .queryParam("sort", "distance_asc")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(atKtxA.toString(), atBachKhoa.toString(), atUit.toString()));

        // Cross-zone FR-06: sending locationCode + lat + lng + radiusKm together (Mobile filter contract)
        // must use the zone as origin center and include neighboring zones within 2.0 km (excluding distant KTX_KHU_B/UEL)
        given()
                .queryParam("q", tag)
                .queryParam("locationCode", "KTX_KHU_A")
                .queryParam("lat", 10.8782)
                .queryParam("lng", 106.8063)
                .queryParam("radiusKm", 2.0)
                .queryParam("sort", "distance_asc")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(atKtxA.toString(), atBachKhoa.toString(), atUit.toString()));

        // Cross-zone FR-06: sending locationCode + lat + lng + sort=distance_asc (no radiusKm) sorts across zones
        given()
                .queryParam("q", tag)
                .queryParam("locationCode", "KTX_KHU_A")
                .queryParam("lat", 10.8782)
                .queryParam("lng", 106.8063)
                .queryParam("sort", "distance_asc")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(
                        atKtxA.toString(),
                        atBachKhoa.toString(),
                        atUit.toString(),
                        atKtxB.toString(),
                        atUel.toString(),
                        freeTextOnly.toString()
                ));

        // FR-06: arbitrary positive radiusKm works without hardcoded 2/3 km limit (0.5km vs 10km)
        given()
                .queryParam("q", tag)
                .queryParam("locationCode", "KTX_KHU_A")
                .queryParam("radiusKm", 0.5)
                .queryParam("sort", "distance_asc")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(atKtxA.toString(), atBachKhoa.toString()));

        given()
                .queryParam("q", tag)
                .queryParam("locationCode", "KTX_KHU_A")
                .queryParam("radiusKm", 10.0)
                .queryParam("sort", "distance_asc")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(
                        atKtxA.toString(),
                        atBachKhoa.toString(),
                        atUit.toString(),
                        atKtxB.toString(),
                        atUel.toString()
                ));

        // Invalid location / radius validations -> 400 INVALID_LOCATION
        given().queryParam("lat", 95.0).queryParam("lng", 106.8)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_LOCATION"));
        given().queryParam("lat", 10.8)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_LOCATION"));
        given().queryParam("lat", 10.8).queryParam("lng", 106.8).queryParam("radiusKm", 0)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_LOCATION"));
        given().queryParam("lat", 10.8).queryParam("lng", 106.8).queryParam("radiusKm", -1.5)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_LOCATION"));
        given().queryParam("radiusKm", 2.0)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_LOCATION"));
        given().queryParam("locationCode", "UNKNOWN_ZONE").queryParam("radiusKm", 2.0)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_LOCATION"));
        given().queryParam("sort", "distance_asc")
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_LOCATION"));
    }

    @Test
    void sortOrdersAndPaginationIncludingLegacyOffsetWorkCorrectly() {
        TestUser seller = createUser("Hoàng Văn Phân Trang", "HOAT_DONG", 100);
        Instant base = currentTime.get();
        Instant future = base.plus(25, ChronoUnit.DAYS);
        String tag = "PAG_" + UUID.randomUUID().toString().substring(0, 6);

        UUID l1 = createListing(seller.id(), "Item 1 " + tag, "Desc", "Mới", 300000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/1.jpg"), base.minus(4, ChronoUnit.HOURS), future, null, List.of());

        UUID l2 = createListing(seller.id(), "Item 2 " + tag, "Desc", "Mới", 100000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/2.jpg"), base.minus(3, ChronoUnit.HOURS), future, null, List.of());

        UUID l3 = createListing(seller.id(), "Item 3 " + tag, "Desc", "Mới", 500000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/3.jpg"), base.minus(2, ChronoUnit.HOURS), future, null, List.of());

        UUID l4 = createListing(seller.id(), "Item 4 " + tag, "Desc", "Mới", 200000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/4.jpg"), base.minus(1, ChronoUnit.HOURS), future, null, List.of());

        UUID l5 = createListing(seller.id(), "Item 5 " + tag, "Desc", "Mới", 400000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/5.jpg"), base, future, null, List.of());

        // newest (default)
        given().queryParam("q", tag)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(l5.toString(), l4.toString(), l3.toString(), l2.toString(), l1.toString()));

        // price_asc
        given().queryParam("q", tag).queryParam("sort", "price_asc")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(l2.toString(), l4.toString(), l1.toString(), l5.toString(), l3.toString()));

        // price_desc
        given().queryParam("q", tag).queryParam("sort", "price_desc")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items.id", contains(l3.toString(), l5.toString(), l1.toString(), l4.toString(), l2.toString()));

        // Page 0, size 2
        given().queryParam("q", tag).queryParam("sort", "price_asc").queryParam("page", 0).queryParam("size", 2)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("page", equalTo(0))
                .body("size", equalTo(2))
                .body("totalElements", equalTo(5))
                .body("totalPages", equalTo(3))
                .body("items.id", contains(l2.toString(), l4.toString()));

        // Page 2, size 2
        given().queryParam("q", tag).queryParam("sort", "price_asc").queryParam("page", 2).queryParam("size", 2)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("page", equalTo(2))
                .body("items.id", contains(l3.toString()));

        // Legacy offset compatibility: ?offset=2&size=2 -> page 1; ?offset=1&size=2 -> exact SQL OFFSET 1 (not truncated to 0!)
        given().queryParam("q", tag).queryParam("sort", "price_asc").queryParam("offset", 2).queryParam("size", 2)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("page", equalTo(1))
                .body("items.id", contains(l1.toString(), l5.toString()));

        given().queryParam("q", tag).queryParam("sort", "price_asc").queryParam("offset", 1).queryParam("size", 2)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("page", equalTo(0))
                .body("items.id", contains(l4.toString(), l1.toString()));

        given().queryParam("q", tag).queryParam("offset", 0)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("page", equalTo(0))
                .body("items", hasSize(5));

        // Invalid sort / page / size / huge OFFSET DoS / overlong search params -> 400 INVALID_INPUT
        given().queryParam("sort", "most_popular")
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().queryParam("page", -1)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().queryParam("page", Integer.MAX_VALUE).queryParam("size", 50)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().queryParam("page", 201).queryParam("size", 50)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().queryParam("size", 0)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().queryParam("size", 51)
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().queryParam("q", "a".repeat(201))
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().queryParam("courseCode", "C".repeat(51))
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
        given().queryParam("location", "L".repeat(256))
                .get("/api/v1/listings").then().statusCode(400).body("code", equalTo("INVALID_INPUT"));
    }

    @Test
    void discoveryExcludesNonPublicExpiredLockedSellerAndSharedUnavailableItemListingsReadOnly() {
        TestUser seller = createUser("Đỗ Thị Ẩn Tin", "HOAT_DONG", 120);
        TestUser lockedSeller = createUser("Nguyễn Văn Bị Khóa", "BI_KHOA", 40);
        TestUser disabledSeller = createUser("Lê Văn Vô Hiệu", "HOAT_DONG", 50);
        db.update("UPDATE thanh_viens SET trang_thai_tai_khoan = 'VO_HIEU_HOA' WHERE user_id = ?", disabledSeller.id());
        TestUser activeBuyer = createUser("Trần Văn Mua Hàng", "HOAT_DONG", 100);
        Instant now = currentTime.get();
        Instant future = now.plus(20, ChronoUnit.DAYS);
        Instant past = now.minus(1, ChronoUnit.HOURS);
        String tag = "EXC_" + UUID.randomUUID().toString().substring(0, 6);

        UUID availableItem = createItem(seller.id(), "Đồ khả dụng", "Mới", "KHA_DUNG", List.of("https://img.example/ok.jpg"));
        UUID reservedItem = createItem(seller.id(), "Đồ đang giữ", "Mới", "DANG_GIU", List.of("https://img.example/res.jpg"));
        UUID handedOverItem = createItem(seller.id(), "Đồ đã giao", "Mới", "DA_CHUYEN_GIAO", List.of("https://img.example/sold.jpg"));

        UUID visibleListing = createListing(seller.id(), "Visible " + tag, "Desc", "Mới", 100000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/v.jpg"), now, future, null, List.of(availableItem));

        // CONG_KHAI listing of a BI_KHOA or VO_HIEU_HOA seller -> MUST be excluded from public search AND return 404 to non-owners
        UUID lockedSellerListing = createListing(lockedSeller.id(), "Locked Seller " + tag, "Desc", "Mới", 100000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/locked.jpg"), now, future, null, List.of());
        UUID disabledSellerListing = createListing(disabledSeller.id(), "Disabled Seller " + tag, "Desc", "Mới", 100000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/disabled.jpg"), now, future, null, List.of());

        // Non-public statuses
        for (String status : List.of("NHAP", "CHO_DUYET", "DA_RUT", "HET_HAN", "AN", "KET_THUC", "GIU_CHO")) {
            createListing(seller.id(), "Status " + status + " " + tag, "Desc", "Mới", 100000,
                    "BAN_LE", status, "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                    List.of("https://img.example/s.jpg"), now, future, null, List.of());
        }

        // Expired CONG_KHAI -> excluded by read-only SQL without mutating DB on anonymous GET
        UUID expiredPublic = createListing(seller.id(), "Expired " + tag, "Desc", "Mới", 100000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/exp.jpg"), now.minus(31, ChronoUnit.DAYS), past, null, List.of());

        // Overdue GIU_CHO -> must NEVER auto-close to HET_HAN, still excluded from public search
        UUID overdueReserved = createListing(seller.id(), "Overdue Reserved " + tag, "Desc", "Mới", 100000,
                "BAN_LE", "GIU_CHO", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/r.jpg"), now.minus(31, ChronoUnit.DAYS), past, null, List.of());

        // CONG_KHAI with shared item DANG_GIU or DA_CHUYEN_GIAO -> excluded
        createListing(seller.id(), "Shared Reserved " + tag, "Desc", "Mới", 150000,
                "BAN_COMBO", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/sr.jpg"), now, future, null, List.of(availableItem, reservedItem));

        createListing(seller.id(), "Shared Sold " + tag, "Desc", "Mới", 150000,
                "BAN_LE", "CONG_KHAI", "DO_GIA_DUNG", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/ss.jpg"), now, future, null, List.of(handedOverItem));

        given().queryParam("q", tag)
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items", hasSize(1))
                .body("items[0].id", equalTo(visibleListing.toString()))
                .body("items[0].hasUnavailableItems", equalTo(false));

        // Anonymous GET /api/v1/listings MUST NOT perform write TX on DB
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, expiredPublic))
                .isEqualTo("CONG_KHAI");

        // Bounded background reconciliation transitions overdue CONG_KHAI -> HET_HAN while leaving GIU_CHO untouched
        int reconciled = lifecycleHelper.reconcileAllExpiredListings(50);
        assertThat(reconciled).isGreaterThanOrEqualTo(1);
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, expiredPublic))
                .isEqualTo("HET_HAN");
        assertThat(db.queryForObject("SELECT trang_thai FROM tin_dangs WHERE ma_tin = ?", String.class, overdueReserved))
                .isEqualTo("GIU_CHO");

        // BI_KHOA & VO_HIEU_HOA seller listings return 404 to anonymous & active buyers (never expose canReserve=true)
        given().get("/api/v1/listings/{id}", lockedSellerListing).then()
                .statusCode(404).body("code", equalTo("LISTING_NOT_FOUND"));
        given().auth().oauth2(activeBuyer.token()).get("/api/v1/listings/{id}", lockedSellerListing).then()
                .statusCode(404).body("code", equalTo("LISTING_NOT_FOUND"));
        given().get("/api/v1/listings/{id}", disabledSellerListing).then()
                .statusCode(404).body("code", equalTo("LISTING_NOT_FOUND"));
        given().auth().oauth2(activeBuyer.token()).get("/api/v1/listings/{id}", disabledSellerListing).then()
                .statusCode(404).body("code", equalTo("LISTING_NOT_FOUND"));
        // Locked seller can still inspect own listing read-only with all mutation flags disabled
        given().auth().oauth2(lockedSeller.token()).get("/api/v1/listings/{id}", lockedSellerListing).then()
                .statusCode(200)
                .body("viewer.isOwner", equalTo(true))
                .body("viewer.canEdit", equalTo(false))
                .body("viewer.canWithdraw", equalTo(false))
                .body("viewer.canDelete", equalTo(false))
                .body("viewer.canReserve", equalTo(false));
    }

    @Test
    void listingDetailVisibilityMatrixViewerContextApprovedRatingsAndNfr01PiiAudit() {
        TestUser seller = createUser("Nguyễn Minh Người Bán", "HOAT_DONG", 135);
        TestUser buyer = createUser("Trần Quốc Người Mua", "HOAT_DONG", 105);
        TestUser pendingUser = createUser("Lê Chờ Kích Hoạt", "CHO_KICH_HOAT", 100);
        TestUser lockedUser = createUser("Võ Bị Khóa", "BI_KHOA", 40);

        Instant now = currentTime.get();
        Instant reminderWindowExpiry = now.plus(3, ChronoUnit.DAYS);
        Instant futureExpiry = now.plus(20, ChronoUnit.DAYS);
        Instant pastExpiry = now.minus(2, ChronoUnit.HOURS);

        UUID item1 = createItem(seller.id(), "Giáo trình OOAD", "Mới 95%", "KHA_DUNG", List.of("https://img.example/i1.jpg"));
        UUID item2 = createItem(seller.id(), "Sổ ghi chú UML", "Chưa viết", "KHA_DUNG", List.of("https://img.example/i2.jpg"));
        UUID itemHeld = createItem(seller.id(), "Máy tính Casio fx-580", "Mới 90%", "DANG_GIU", List.of("https://img.example/i3.jpg"));

        // Historical completed listings + reviews to test approved CHAP_NHAN seller rating aggregation
        UUID closedListing1 = createListing(seller.id(), "Tin cũ 1", "Desc", "Tốt", 50000,
                "BAN_LE", "KET_THUC", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/old1.jpg"), now.minus(40, ChronoUnit.DAYS), null, null, List.of());
        UUID closedListing2 = createListing(seller.id(), "Tin cũ 2", "Desc", "Tốt", 60000,
                "BAN_LE", "KET_THUC", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/old2.jpg"), now.minus(35, ChronoUnit.DAYS), null, null, List.of());
        UUID closedListing3 = createListing(seller.id(), "Tin cũ 3", "Desc", "Tốt", 70000,
                "BAN_LE", "KET_THUC", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/old3.jpg"), now.minus(30, ChronoUnit.DAYS), null, null, List.of());
        UUID closedListing4 = createListing(seller.id(), "Tin cũ 4", "Desc", "Tốt", 80000,
                "BAN_LE", "KET_THUC", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/old4.jpg"), now.minus(25, ChronoUnit.DAYS), null, null, List.of());

        UUID txApproved5 = createTransaction(closedListing1, seller.id(), buyer.id(), 50000, "HOAN_TAT");
        UUID txApproved4 = createTransaction(closedListing2, seller.id(), buyer.id(), 60000, "HOAN_TAT");
        UUID txPending1 = createTransaction(closedListing3, seller.id(), buyer.id(), 70000, "HOAN_TAT");
        UUID txRejected1 = createTransaction(closedListing4, seller.id(), buyer.id(), 80000, "HOAN_TAT");

        createReview(txApproved5, buyer.id(), seller.id(), 5, "CHAP_NHAN");
        createReview(txApproved4, buyer.id(), seller.id(), 4, "CHAP_NHAN");
        createReview(txPending1, buyer.id(), seller.id(), 1, "CHO_XET");
        createReview(txRejected1, buyer.id(), seller.id(), 1, "BI_BAC");

        // 1. Public paid combo listing with 1 pending YEU_CAU request & in 7-day renewal window
        UUID publicCombo = createListing(seller.id(), "Combo OOAD ĐHQG-HCM", "Đầy đủ sách và sổ tay", "Còn mới 95%", 180000,
                "BAN_COMBO", "CONG_KHAI", "GT_CNTT", "SE100", "Phương pháp phát triển phần mềm hướng đối tượng", "ĐH CNTT",
                "UIT", "Sảnh C UIT", null, null,
                List.of("https://img.example/combo1.jpg", "https://img.example/combo2.jpg"),
                now.minus(27, ChronoUnit.DAYS), reminderWindowExpiry, null, List.of(item1, item2));
        createTransaction(publicCombo, seller.id(), buyer.id(), 170000, "YEU_CAU");

        // 2. Reserved listing (GIU_CHO) -> UC-20 Alt 2
        UUID reservedListing = createListing(seller.id(), "Tin đang giữ chỗ", "Đã có người đặt", "Tốt", 90000,
                "BAN_LE", "GIU_CHO", "DO_GIA_DUNG", null, null, null, "KTX_KHU_A", "KTX Khu A", null, null,
                List.of("https://img.example/res.jpg"), now, futureExpiry, null, List.of(itemHeld));

        // 3. Free single & free combo -> UC-20 Alt 3
        UUID freeSingle = createListing(seller.id(), "Tặng giáo trình miễn phí", "Cho tặng bạn khóa sau", "Khá mới", 0,
                "CHO_TANG", "CONG_KHAI", "DO_CHO_TANG", "MA006", "Giải tích 1", "ĐHQG", "KHTN", "KHTN", null, null,
                List.of("https://img.example/free1.jpg"), now, futureExpiry, null, List.of(item1));

        UUID freeCombo = createListing(seller.id(), "Combo tặng 0đ", "Tặng kèm 2 món", "Tốt", 0,
                "BAN_COMBO", "CONG_KHAI", "DO_CHO_TANG", null, null, null, "KTX_KHU_A", "KTX Khu A", null, null,
                List.of("https://img.example/free2.jpg"), now, futureExpiry, null, List.of(item1, item2));

        // 4. Shared item DANG_GIU in a CONG_KHAI sibling listing
        UUID sharedUnavailablePublic = createListing(seller.id(), "Tin có món bị giữ", "Một món đang giữ bên tin khác", "Tốt", 220000,
                "BAN_COMBO", "CONG_KHAI", "TB_DIEN_TU", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/shared.jpg"), now, futureExpiry, null, List.of(item1, itemHeld));

        // 5. Non-public statuses for owner vs non-owner checks
        UUID draftListing = createListing(seller.id(), "Bản nháp riêng tư", "Chưa đăng", "Mới", 100000,
                "BAN_LE", "NHAP", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/d.jpg"), null, null, null, List.of(item1));
        UUID pendingModListing = createListing(seller.id(), "Tin chờ duyệt", "Chờ", "Mới", 100000,
                "BAN_LE", "CHO_DUYET", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/pm.jpg"), null, null, null, List.of(item1));
        UUID withdrawnListing = createListing(seller.id(), "Tin đã rút", "Rút", "Mới", 100000,
                "BAN_LE", "DA_RUT", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/w.jpg"), now, futureExpiry, null, List.of(item1));
        UUID hiddenListing = createListing(seller.id(), "Tin bị ẩn vi phạm", "Vi phạm", "Mới", 100000,
                "BAN_LE", "AN", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/h.jpg"), now, futureExpiry, "Vi phạm quy định hình ảnh", List.of(item1));
        UUID expiredListing = createListing(seller.id(), "Tin hết hạn tự động", "Hết hạn", "Mới", 100000,
                "BAN_LE", "CONG_KHAI", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/e.jpg"), now.minus(31, ChronoUnit.DAYS), pastExpiry, null, List.of(item1));

        // Guest and active buyer can read CONG_KHAI with full combo details, CHAP_NHAN rating average, and active buyer flags
        for (String token : java.util.Arrays.asList(null, buyer.token())) {
            var req = given();
            if (token != null) {
                req = req.auth().oauth2(token);
            }
            var detailRes = req.get("/api/v1/listings/{id}", publicCombo)
                    .then()
                    .statusCode(200)
                    .body("id", equalTo(publicCombo.toString()))
                    .body("isCombo", equalTo(true))
                    .body("isFree", equalTo(false))
                    .body("itemCount", equalTo(2))
                    .body("items", hasSize(2))
                    .body("courseCode", equalTo("SE100"))
                    .body("author", equalTo("ĐH CNTT"))
                    .body("category.id", equalTo("GT_CNTT"))
                    .body("category.parentId", equalTo("GIAO_TRINH"))
                    .body("seller.id", equalTo(seller.id().toString()))
                    .body("seller.displayName", equalTo("Nguyễn Minh Người Bán"))
                    .body("seller.reputationScore", equalTo(135))
                    .body("seller.reviewCount", equalTo(2))
                    .body("pendingRequestCount", equalTo(1))
                    .body("hasUnavailableItems", equalTo(false))
                    .body("viewer.isOwner", equalTo(false))
                    .body("viewer.canEdit", equalTo(false))
                    .body("viewer.canWithdraw", equalTo(false))
                    .body("viewer.canDelete", equalTo(false))
                    .body("viewer.canPublish", equalTo(false))
                    .body("viewer.canRenew", equalTo(false))
                    .body("viewer.canMessage", equalTo(true))
                    .body("viewer.canMakeOffer", equalTo(true))
                    .body("viewer.canReserve", equalTo(true))
                    .extract();
            assertThat(detailRes.jsonPath().getDouble("seller.averageRating")).isCloseTo(4.5, within(0.001));

            // NFR-01 PII Audit on detail response
            assertNoSellerPii(detailRes.body().asString(), seller);
        }

        // Authenticated CHO_KICH_HOAT and BI_KHOA accounts can read CONG_KHAI but MUST get buyer interaction flags = false
        for (String restrictedToken : List.of(pendingUser.token(), lockedUser.token())) {
            var detailRes = given().auth().oauth2(restrictedToken)
                    .get("/api/v1/listings/{id}", publicCombo)
                    .then()
                    .statusCode(200)
                    .body("id", equalTo(publicCombo.toString()))
                    .body("viewer.isOwner", equalTo(false))
                    .body("viewer.canEdit", equalTo(false))
                    .body("viewer.canWithdraw", equalTo(false))
                    .body("viewer.canDelete", equalTo(false))
                    .body("viewer.canPublish", equalTo(false))
                    .body("viewer.canRenew", equalTo(false))
                    .body("viewer.canMessage", equalTo(false))
                    .body("viewer.canMakeOffer", equalTo(false))
                    .body("viewer.canReserve", equalTo(false))
                    .extract();
            assertNoSellerPii(detailRes.body().asString(), seller);
        }

        // NFR-01 PII Audit on public search response
        var searchRes = given()
                .queryParam("q", "Combo OOAD ĐHQG-HCM")
                .get("/api/v1/listings")
                .then()
                .statusCode(200)
                .body("items[0].seller.reviewCount", equalTo(2))
                .extract();
        assertThat(searchRes.jsonPath().getDouble("items[0].seller.averageRating")).isCloseTo(4.5, within(0.001));
        assertNoSellerPii(searchRes.body().asString(), seller);

        // UC-20 Alt 2: non-owner reading GIU_CHO gets 200 with canReserve=false & canMakeOffer=false
        given().auth().oauth2(buyer.token())
                .get("/api/v1/listings/{id}", reservedListing)
                .then()
                .statusCode(200)
                .body("status", equalTo("GIU_CHO"))
                .body("viewer.isOwner", equalTo(false))
                .body("viewer.canMessage", equalTo(true))
                .body("viewer.canMakeOffer", equalTo(false))
                .body("viewer.canReserve", equalTo(false));

        // UC-20 Alt 3: free single & free combo -> canMakeOffer=false, canReserve=true
        for (UUID freeId : List.of(freeSingle, freeCombo)) {
            given()
                    .get("/api/v1/listings/{id}", freeId)
                    .then()
                    .statusCode(200)
                    .body("isFree", equalTo(true))
                    .body("viewer.canMakeOffer", equalTo(false))
                    .body("viewer.canReserve", equalTo(true))
                    .body("viewer.canMessage", equalTo(true));
        }

        // Cross-listing shared item DANG_GIU -> hasUnavailableItems=true, canReserve=false, canMakeOffer=false
        given().auth().oauth2(buyer.token())
                .get("/api/v1/listings/{id}", sharedUnavailablePublic)
                .then()
                .statusCode(200)
                .body("hasUnavailableItems", equalTo(true))
                .body("viewer.canReserve", equalTo(false))
                .body("viewer.canMakeOffer", equalTo(false))
                .body("viewer.canMessage", equalTo(true));

        // UC-20 E1: non-owner reading non-public / expired / non-existent listing -> 404 LISTING_NOT_FOUND
        for (UUID forbiddenId : List.of(draftListing, pendingModListing, withdrawnListing, hiddenListing, expiredListing, closedListing1, UUID.randomUUID())) {
            given().auth().oauth2(buyer.token())
                    .get("/api/v1/listings/{id}", forbiddenId)
                    .then()
                    .statusCode(404)
                    .body("code", equalTo("LISTING_NOT_FOUND"));
        }

        // Owner reading own NHAP
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/{id}", draftListing)
                .then()
                .statusCode(200)
                .body("status", equalTo("NHAP"))
                .body("viewer.isOwner", equalTo(true))
                .body("viewer.canEdit", equalTo(true))
                .body("viewer.canWithdraw", equalTo(false))
                .body("viewer.canDelete", equalTo(true))
                .body("viewer.canPublish", equalTo(true))
                .body("viewer.canRenew", equalTo(false))
                .body("viewer.canMessage", equalTo(false))
                .body("viewer.canMakeOffer", equalTo(false))
                .body("viewer.canReserve", equalTo(false));

        // Owner reading own CONG_KHAI with 1 YEU_CAU tx & in renewal reminder window
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/{id}", publicCombo)
                .then()
                .statusCode(200)
                .body("renewalReminderDue", equalTo(true))
                .body("viewer.isOwner", equalTo(true))
                .body("viewer.canEdit", equalTo(true))
                .body("viewer.canWithdraw", equalTo(true))
                .body("viewer.canDelete", equalTo(false))
                .body("viewer.canPublish", equalTo(false))
                .body("viewer.canRenew", equalTo(true));

        // Owner reading own DA_RUT
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/{id}", withdrawnListing)
                .then()
                .statusCode(200)
                .body("viewer.isOwner", equalTo(true))
                .body("viewer.canEdit", equalTo(true))
                .body("viewer.canWithdraw", equalTo(false))
                .body("viewer.canDelete", equalTo(true))
                .body("viewer.canPublish", equalTo(true))
                .body("viewer.canRenew", equalTo(false));

        // Owner reading own HET_HAN (lazily transitioned above)
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/{id}", expiredListing)
                .then()
                .statusCode(200)
                .body("status", equalTo("HET_HAN"))
                .body("viewer.isOwner", equalTo(true))
                .body("viewer.canEdit", equalTo(true))
                .body("viewer.canWithdraw", equalTo(false))
                .body("viewer.canDelete", equalTo(true))
                .body("viewer.canPublish", equalTo(true))
                .body("viewer.canRenew", equalTo(true));

        // Owner reading own AN (hidden) -> sees hiddenReason, mutation flags disabled
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/{id}", hiddenListing)
                .then()
                .statusCode(200)
                .body("status", equalTo("AN"))
                .body("hiddenReason", equalTo("Vi phạm quy định hình ảnh"))
                .body("viewer.isOwner", equalTo(true))
                .body("viewer.canEdit", equalTo(false))
                .body("viewer.canWithdraw", equalTo(false))
                .body("viewer.canDelete", equalTo(false))
                .body("viewer.canPublish", equalTo(false))
                .body("viewer.canRenew", equalTo(false));

        // Owner reading own CONG_KHAI with active transaction (DANG_GIAO) -> canPublish & canRenew MUST also be false (parity with ListingAssembler)
        UUID publicWithActiveTx = createListing(seller.id(), "Tin có giao dịch đang chạy", "Desc", "Mới", 120000,
                "BAN_LE", "CONG_KHAI", "GIAO_TRINH", null, null, null, "UIT", "UIT", null, null,
                List.of("https://img.example/act.jpg"), now, futureExpiry, null, List.of(item1));
        createTransaction(publicWithActiveTx, seller.id(), buyer.id(), 120000, "DANG_GIAO");
        given().auth().oauth2(seller.token())
                .get("/api/v1/listings/{id}", publicWithActiveTx)
                .then()
                .statusCode(200)
                .body("viewer.isOwner", equalTo(true))
                .body("viewer.canEdit", equalTo(false))
                .body("viewer.canWithdraw", equalTo(false))
                .body("viewer.canDelete", equalTo(false))
                .body("viewer.canPublish", equalTo(false))
                .body("viewer.canRenew", equalTo(false));

        // Explicit MODERATOR non-owner authorization test (admin-web token with ROLE_MODERATOR + ROLE_MEMBER)
        TestUser moderator = createUser("Kiểm Duyệt Viên", "HOAT_DONG", 120);
        db.update(
                "INSERT INTO vai_tro_quan_tri(user_id, loai_vai_tro, bat_dau) VALUES (?, 'KIEM_DUYET_VIEN', ?)",
                moderator.id(),
                Timestamp.from(now.minusSeconds(60))
        );
        String moderatorToken = given()
                .header("Origin", "http://localhost:5173")
                .contentType("application/json")
                .body(java.util.Map.of("email", moderator.email(), "password", PASSWORD, "client", "admin-web"))
                .post("/api/v1/auth/login")
                .then()
                .statusCode(200)
                .extract().jsonPath().getString("token");

        // MODERATOR cannot read another member's NHAP detail (404)
        given().auth().oauth2(moderatorToken)
                .get("/api/v1/listings/{id}", draftListing)
                .then()
                .statusCode(404)
                .body("code", equalTo("LISTING_NOT_FOUND"));

        // MODERATOR cannot PUT or DELETE another member's listing (403 FORBIDDEN)
        given().auth().oauth2(moderatorToken)
                .contentType("application/json")
                .body(java.util.Map.of(
                        "action", "KEEP",
                        "title", "Moderator hijack attempt",
                        "description", "Blocked",
                        "condition", "Tốt",
                        "priceVnd", 100000,
                        "categoryId", "GIAO_TRINH",
                        "locationCode", "UIT",
                        "images", List.of("https://img.example/mod.jpg"),
                        "itemIds", List.of(item1),
                        "version", 0
                ))
                .put("/api/v1/listings/{id}", publicCombo)
                .then()
                .statusCode(403)
                .body("code", equalTo("FORBIDDEN"));

        given().auth().oauth2(moderatorToken)
                .delete("/api/v1/listings/{id}?version=0", publicCombo)
                .then()
                .statusCode(403)
                .body("code", equalTo("FORBIDDEN"));
    }

    private void assertNoSellerPii(String responseBody, TestUser seller) {
        assertThat(responseBody).doesNotContain(
                seller.email(),
                seller.studentId(),
                seller.phone(),
                "studentId",
                "anh_the_sv",
                "card-front-secret",
                "card-back-secret",
                "mat_khau_hash",
                "$argon2id$"
        );
    }
}
