package com.dormtrading.catalog.discovery;

import com.dormtrading.common.BaseIntegrationTest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.notNullValue;

class ReferenceDataApiTest extends BaseIntegrationTest {

    @Autowired
    private JdbcTemplate db;

    @Test
    void categoriesEndpointReturnsFlatItemsAndHierarchicalTreeAnonymously() {
        String hiddenCategoryId = "TEST_HIDDEN_CAT";
        db.update(
                "INSERT INTO danh_mucs (ma_danh_muc, ten, danh_muc_cha_id, mo_ta, hien_thi) VALUES (?, ?, 'GIAO_TRINH', 'Ẩn', FALSE) ON CONFLICT (ma_danh_muc) DO UPDATE SET hien_thi = FALSE",
                hiddenCategoryId,
                "Danh mục ẩn kiểm thử"
        );

        try {
            var response = given()
                    .when()
                    .get("/api/v1/categories")
                    .then()
                    .statusCode(200)
                    .body("items.size()", greaterThanOrEqualTo(10))
                    .body("items.id", hasItem("GIAO_TRINH"))
                    .body("items.id", hasItem("GT_CNTT"))
                    .body("items.id", hasItem("GT_KINH_TE"))
                    .body("items.id", hasItem("GT_DAI_CUONG"))
                    .body("items.id", hasItem("GT_NGOAI_NGU"))
                    .body("items.id", hasItem("TB_DIEN_TU"))
                    .body("tree", notNullValue())
                    .extract();

            List<String> flatIds = response.jsonPath().getList("items.id", String.class);
            assertThat(flatIds).doesNotContain(hiddenCategoryId);

            List<Map<String, Object>> tree = response.jsonPath().getList("tree");
            Map<String, Object> textbookRoot = tree.stream()
                    .filter(node -> "GIAO_TRINH".equals(node.get("id")))
                    .findFirst()
                    .orElseThrow();

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> textbookChildren = (List<Map<String, Object>>) textbookRoot.get("children");
            List<String> childIds = textbookChildren.stream()
                    .map(child -> (String) child.get("id"))
                    .toList();

            assertThat(childIds).contains("GT_CNTT", "GT_KINH_TE", "GT_DAI_CUONG", "GT_NGOAI_NGU");
            assertThat(childIds).doesNotContain(hiddenCategoryId);

            Map<String, Object> electronicsRoot = tree.stream()
                    .filter(node -> "THIET_BI_DIEN".equals(node.get("id")))
                    .findFirst()
                    .orElseThrow();
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> electronicsChildren = (List<Map<String, Object>>) electronicsRoot.get("children");
            assertThat(electronicsChildren)
                    .extracting(child -> (String) child.get("id"))
                    .contains("TB_DIEN_TU");
        } finally {
            db.update("DELETE FROM danh_mucs WHERE ma_danh_muc = ?", hiddenCategoryId);
        }
    }

    @Test
    void locationsEndpointReturnsAllNineDhqgHcmZonesWithCoordinatesAnonymously() {
        var response = given()
                .when()
                .get("/api/v1/locations")
                .then()
                .statusCode(200)
                .body("items.size()", greaterThanOrEqualTo(9))
                .extract();

        List<Map<String, Object>> zones = response.jsonPath().getList("items");
        List<String> codes = zones.stream()
                .map(zone -> (String) zone.get("code"))
                .toList();

        assertThat(codes).containsExactly(
                "KTX_KHU_A",
                "KTX_KHU_B",
                "UIT",
                "BACH_KHOA_CS2",
                "KHTN",
                "KHXH_NV",
                "UEL",
                "IU",
                "NVH_SV"
        );

        for (Map<String, Object> zone : zones) {
            assertThat((String) zone.get("name")).isNotBlank();
            assertThat((String) zone.get("group")).isIn("KTX", "TRUONG", "LAN_CAN");
            double lat = ((Number) zone.get("latitude")).doubleValue();
            double lng = ((Number) zone.get("longitude")).doubleValue();
            assertThat(lat).isBetween(10.80, 10.95);
            assertThat(lng).isBetween(106.70, 106.90);
        }
    }
}
