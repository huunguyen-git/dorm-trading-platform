package com.dormtrading.catalog;

import com.dormtrading.catalog.inventory.*;
import com.dormtrading.iam.auth.AuthFailure;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

class InventoryUnitTest {

    private JdbcTemplate db;
    private Clock clock;
    private InventoryService service;

    @BeforeEach
    void setup() {
        db = Mockito.mock(JdbcTemplate.class);
        clock = Clock.systemUTC();
        service = new InventoryService(db, clock);
    }

    @Test
    void testCanEditCanDeleteCalculations() {
        UUID id = UUID.randomUUID();
        UUID user = UUID.randomUUID();
        Instant now = Instant.now();

        // 1. KHA_DUNG with 0 linked listings -> canEdit=true, canDelete=true
        InventoryItem item1 = new InventoryItem(id, user, "Vat 1", "Tot", List.of("img1"), "KHA_DUNG", 0, now, now);
        InventoryItemDto dto1 = InventoryItemDto.from(item1, 0);
        assertThat(dto1.canEdit()).isTrue();
        assertThat(dto1.canDelete()).isTrue();

        // 2. KHA_DUNG with 1 linked listing -> canEdit=false, canDelete=false
        InventoryItemDto dto2 = InventoryItemDto.from(item1, 1);
        assertThat(dto2.canEdit()).isFalse();
        assertThat(dto2.canDelete()).isFalse();

        // 3. DANG_GIU with 0 linked listings -> canEdit=false, canDelete=false
        InventoryItem item3 = new InventoryItem(id, user, "Vat 3", "Tot", List.of("img1"), "DANG_GIU", 0, now, now);
        InventoryItemDto dto3 = InventoryItemDto.from(item3, 0);
        assertThat(dto3.canEdit()).isFalse();
        assertThat(dto3.canDelete()).isFalse();

        // 4. DA_CHUYEN_GIAO -> canEdit=false, canDelete=false
        InventoryItem item4 = new InventoryItem(id, user, "Vat 4", "Tot", List.of("img1"), "DA_CHUYEN_GIAO", 0, now, now);
        InventoryDetailDto detail4 = InventoryDetailDto.from(item4, List.of());
        assertThat(detail4.canEdit()).isFalse();
        assertThat(detail4.canDelete()).isFalse();
    }

    @Test
    void testCheckUserActiveRejectsLockedUser() {
        UUID userId = UUID.randomUUID();
        when(db.queryForList(anyString(), eq(String.class), eq(userId))).thenReturn(List.of("BI_KHOA"));

        assertThatThrownBy(() -> service.checkUserActive(userId))
                .isInstanceOf(AuthFailure.class)
                .extracting("status")
                .isEqualTo(403);
    }

    @Test
    void testCheckUserActiveRejectsDisabledUser() {
        UUID userId = UUID.randomUUID();
        when(db.queryForList(anyString(), eq(String.class), eq(userId))).thenReturn(List.of("VO_HIEU_HOA"));

        assertThatThrownBy(() -> service.checkUserActive(userId))
                .isInstanceOf(AuthFailure.class)
                .extracting("status")
                .isEqualTo(403);
    }

    @Test
    void testCheckUserActiveRejectsUnapprovedUser() {
        UUID userId = UUID.randomUUID();
        when(db.queryForList(anyString(), eq(String.class), eq(userId))).thenReturn(List.of("CHO_KICH_HOAT"));

        assertThatThrownBy(() -> service.checkUserActive(userId))
                .isInstanceOf(AuthFailure.class)
                .extracting("status")
                .isEqualTo(403);
    }

    @Test
    void testCreateValidationNullOrBlankName() {
        UUID userId = UUID.randomUUID();
        when(db.queryForList(anyString(), eq(String.class), eq(userId))).thenReturn(List.of("HOAT_DONG"));

        CreateInventoryItemRequest req = new CreateInventoryItemRequest("  ", null, "Mota", null, List.of("img1"), null);
        assertThatThrownBy(() -> service.createItem(userId, req))
                .isInstanceOf(AuthFailure.class)
                .hasMessageContaining("Tên đồ vật không được để trống");
    }

    @Test
    void testCreateValidationMissingImages() {
        UUID userId = UUID.randomUUID();
        when(db.queryForList(anyString(), eq(String.class), eq(userId))).thenReturn(List.of("HOAT_DONG"));

        CreateInventoryItemRequest req = new CreateInventoryItemRequest("Ban hoc", null, "Mota", null, List.of(), null);
        assertThatThrownBy(() -> service.createItem(userId, req))
                .isInstanceOf(AuthFailure.class)
                .hasMessageContaining("từ 1 đến 5 hình ảnh");
    }

    @Test
    void testCreateValidationExceedsMaxImages() {
        UUID userId = UUID.randomUUID();
        when(db.queryForList(anyString(), eq(String.class), eq(userId))).thenReturn(List.of("HOAT_DONG"));

        List<String> six = List.of("1", "2", "3", "4", "5", "6");
        CreateInventoryItemRequest req = new CreateInventoryItemRequest("Ban hoc", null, "Mota", null, six, null);
        assertThatThrownBy(() -> service.createItem(userId, req))
                .isInstanceOf(AuthFailure.class)
                .hasMessageContaining("tối đa 5 hình ảnh");
    }
}
