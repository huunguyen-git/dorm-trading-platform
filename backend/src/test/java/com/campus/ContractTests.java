package com.campus;

import com.campus.listing.api.ListingDtos.*;
import com.campus.trade.api.TradeDtos.*;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.*;

class ContractTests {
    ListingContent listing(OfferType type, long price, List<UUID> items, List<UUID> photos) {
        return new ListingContent("Chair", "Used", 1L, type, price, "Campus",items,photos,null,null,null,null);
    }

    @Test void listingValidationCoversPhotoBoundariesDuplicatesAndGiveawayPrice() {
        try (ValidatorFactory factory=Validation.buildDefaultValidatorFactory()) {
            var validator=factory.getValidator();
            List<UUID> items=List.of(UUID.randomUUID());
            for (int count : List.of(0,1,5,6)) {
                List<UUID> photos=new ArrayList<>();
                for (int n=0;n<count;n++) photos.add(UUID.randomUUID());
                var violations=validator.validate(new CreateListingRequest(listing(OfferType.GIVEAWAY,0,items,photos)));
                assertThat(violations.isEmpty()).as("photo count %s",count).isEqualTo(count==1 || count==5);
            }
            List<UUID> photo=List.of(UUID.randomUUID());
            assertThat(validator.validate(listing(OfferType.GIVEAWAY,1,items,photo))).isNotEmpty();
            assertThat(validator.validate(listing(OfferType.SALE,-1,items,photo))).isNotEmpty();
            assertThat(validator.validate(listing(OfferType.SALE,9007199254740992L,items,photo))).isNotEmpty();
            assertThat(validator.validate(listing(OfferType.SALE,10,List.of(),photo))).isNotEmpty();
            assertThat(validator.validate(listing(OfferType.SALE,10,List.of(items.getFirst(),items.getFirst()),photo))).isNotEmpty();
            assertThat(validator.validate(listing(OfferType.SALE,10,items,List.of(photo.getFirst(),photo.getFirst())))).isNotEmpty();
            assertThat(validator.validate(listing(OfferType.SALE,10,items,Arrays.asList((UUID)null)))).isNotEmpty();
        }
    }

    @Test void completionCodePreservesLeadingZeroesAndDoesNotLeakThroughToString() {
        try (var factory=Validation.buildDefaultValidatorFactory()) {
            var validator=factory.getValidator();
            var good=new ConfirmCompletionRequest(0L,UUID.randomUUID(),"012345");
            assertThat(validator.validate(good)).isEmpty();
            for (String bad : List.of("12345","1234567","abcdef","１２３４５６"))
                assertThat(validator.validate(new ConfirmCompletionRequest(0L,UUID.randomUUID(),bad))).isNotEmpty();
            assertThat(good.toString()).doesNotContain("012345");
            assertThat(validator.validate(new SubmitRatingRequest(0,"reason"))).isNotEmpty();
            assertThat(validator.validate(new SubmitRatingRequest(6,"reason"))).isNotEmpty();
        }
    }

    @Test void jsonUsesStringEnumsNumericVndAndOmitsUnsetOptionalFields() {
        var mapper=JsonMapper.builder().build();
        var content=listing(OfferType.GIVEAWAY,0,List.of(UUID.randomUUID()),List.of(UUID.randomUUID()));
        var tree=mapper.readTree(mapper.writeValueAsString(content));
        assertThat(tree.get("offerType").asText()).isEqualTo("GIVEAWAY");
        assertThat(tree.get("priceVnd").isIntegralNumber()).isTrue();
        assertThat(tree.has("author")).isFalse();
        assertThat(tree.has("giveawayPriceValid")).isFalse();
    }

    @SuppressWarnings("unchecked")
    @Test void openApiReferencesOperationsAndDtoFieldsStayAligned() throws Exception {
        Map<String,Object> document;
        try (var reader=Files.newBufferedReader(Path.of(System.getProperty("contract.path")))) {
            document=new Yaml().load(reader);
        }
        assertThat(document.get("openapi")).isEqualTo("3.1.0");
        Map<String,Object> components=(Map<String,Object>)document.get("components");
        Map<String,Map<String,Object>> schemas=(Map<String,Map<String,Object>>)components.get("schemas");
        checkRefs(document,components);
        for (var entry:schemas.entrySet()) {
            Map<String,Object> schema=entry.getValue();
            Class<?> type=Class.forName((String)schema.get("x-java-type"));
            if (type.isEnum()) {
                assertThat(Arrays.stream(type.getEnumConstants()).map(Object::toString).toList()).containsExactlyElementsOf((List<String>)schema.get("enum"));
            } else {
                assertThat(type.isRecord()).as(entry.getKey()).isTrue();
                Map<String,Map<String,Object>> properties=(Map<String,Map<String,Object>>)schema.get("properties");
                assertThat(Arrays.stream(type.getRecordComponents()).map(java.lang.reflect.RecordComponent::getName).toList())
                    .as(entry.getKey()).containsExactlyInAnyOrderElementsOf(properties.keySet());
                for (var field:type.getRecordComponents()) {
                    Map<String,Object> property=properties.get(field.getName());
                    Class<?> fieldType=field.getType();
                    if (fieldType==UUID.class) assertThat(property.get("format")).isEqualTo("uuid");
                    if (fieldType==java.time.Instant.class) assertThat(property.get("format")).isEqualTo("date-time");
                    if (fieldType==Long.class || fieldType==Integer.class) assertThat(property.get("type")).isEqualTo("integer");
                    if (fieldType==List.class) assertThat(property.get("type")).isEqualTo("array");
                    if (fieldType==String.class) assertThat(property.get("type")).isEqualTo("string");
                    if (fieldType==Boolean.class) assertThat(property.get("type")).isEqualTo("boolean");
                    if (fieldType.isEnum() || fieldType.isRecord()) assertThat(property.get("$ref")).isEqualTo("#/components/schemas/"+fieldType.getSimpleName());
                    var accessor=type.getDeclaredField(field.getName());
                    boolean required=accessor.isAnnotationPresent(jakarta.validation.constraints.NotNull.class) || accessor.isAnnotationPresent(jakarta.validation.constraints.NotBlank.class);
                    assertThat(((List<String>)schema.get("required")).contains(field.getName())).as(entry.getKey()+"."+field.getName()).isEqualTo(required);
                }
            }
        }
        Set<String> operationIds=new HashSet<>();
        Map<String,Map<String,Map<String,Object>>> paths=(Map<String,Map<String,Map<String,Object>>>)document.get("paths");
        for (var path:paths.entrySet()) for (var method:path.getValue().entrySet()) {
            Map<String,Object> operation=method.getValue();
            assertThat(operationIds.add((String)operation.get("operationId"))).isTrue();
            assertThat(operation.get("x-implementation-status")).isIn("implemented","planned");
            if (operation.get("x-implementation-status").equals("planned")) {
                assertThat(operation).containsKey("x-policy-gates");
                if (!method.getKey().equals("get")) assertThat(((List<?>)operation.get("parameters"))
                    .contains(Map.of("$ref","#/components/parameters/Csrf"))).isTrue();
            }
        }
    }

    @SuppressWarnings("unchecked")
    void checkRefs(Object node, Map<String,Object> components) {
        if (node instanceof Map<?,?> map) {
            if (map.get("$ref") instanceof String ref) {
                String[] parts=ref.split("/");
                assertThat(parts).hasSize(4);
                assertThat(parts[1]).isEqualTo("components");
                assertThat((Map<String,Object>)components.get(parts[2])).containsKey(parts[3]);
            }
            map.values().forEach(value -> checkRefs(value,components));
        } else if (node instanceof List<?> list) list.forEach(value -> checkRefs(value,components));
    }
}
