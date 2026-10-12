package edu.baylor.ecs.cloudhubs.chatbot.pipeline.model;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class PipelineIntentRequestValidationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static ValidatorFactory validatorFactory;
    private static Validator validator;

    @BeforeAll
    static void setupValidator() {
        validatorFactory = Validation.buildDefaultValidatorFactory();
        validator = validatorFactory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        validatorFactory.close();
    }

    private static JsonNode catalog(int cards) {
        ObjectNode catalog = MAPPER.createObjectNode().put("catalogVersion", "pcat-0861a6885a178a");
        ArrayNode array = catalog.putArray("cards");
        for (int i = 0; i < cards; i++) {
            array.addObject().put("cardType", "CARD_" + i).put("title", "Card " + i).put("isAnalysis", i % 2 == 0);
        }
        return catalog;
    }

    private static PipelineIntentRequest valid() {
        return new PipelineIntentRequest(
            "I want to visualize the architecture and check authorization problems.",
            "3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c",
            1,
            catalog(17),
            "pcat-0861a6885a178a",
            new ArrayList<>(),
            new ArrayList<>()
        );
    }

    private static List<String> messages(PipelineIntentRequest request) {
        Set<ConstraintViolation<PipelineIntentRequest>> violations = validator.validate(request);
        return violations.stream().map(violation -> violation.getMessage()).sorted().toList();
    }

    @Test
    void acceptsAValidRequest() {
        assertThat(messages(valid())).isEmpty();
    }

    @Test
    void acceptsAValidRetryRequest() {
        PipelineIntentRequest request = valid();
        request.setAttempt(2);
        request.setExcludeCapabilitySets(List.of(List.of("A", "B"), List.of("C")));
        request.setRejectionFeedback(List.of("Problem: DUPLICATE_TIER"));

        assertThat(messages(request)).isEmpty();
    }

    @Test
    void rejectsABlankGoal() {
        PipelineIntentRequest request = valid();
        request.setGoal("   ");

        assertThat(messages(request)).containsExactly("goal is required and must be non-empty.");
    }

    @Test
    void acceptsAGoalAtTheLimitAndRejectsOneOver() {
        PipelineIntentRequest request = valid();
        request.setGoal("g".repeat(1000));
        assertThat(messages(request)).isEmpty();

        request.setGoal("g".repeat(1001));
        assertThat(messages(request)).containsExactly("goal must be at most 1000 characters.");
    }

    @Test
    void validatesTheSuggestionSetIdShape() {
        PipelineIntentRequest request = valid();
        request.setSuggestionSetId("not-a-uuid");
        assertThat(messages(request)).containsExactly("suggestionSetId must be a valid UUID.");

        request.setSuggestionSetId(null);
        assertThat(messages(request)).containsExactly("suggestionSetId is required.");
    }

    @ParameterizedTest
    @CsvSource({"0,false", "1,true", "2,true", "3,false"})
    void boundsTheAttempt(int attempt, boolean valid) {
        PipelineIntentRequest request = valid();
        request.setAttempt(attempt);

        assertThat(messages(request).isEmpty()).isEqualTo(valid);
    }

    @Test
    void requiresAttemptCatalogAndCatalogVersion() {
        PipelineIntentRequest request = valid();
        request.setAttempt(null);
        request.setCatalog(null);
        request.setCatalogVersion(" ");

        assertThat(messages(request)).containsExactly("attempt is required.", "catalog is required.", "catalogVersion is required.");
    }

    @Test
    void boundsTheCatalogSizeAndShape() {
        String message = "catalog must be an object with 1..64 cards, each with a cardType and bounded text fields.";
        PipelineIntentRequest request = valid();

        request.setCatalog(catalog(64));
        assertThat(messages(request)).isEmpty();

        request.setCatalog(catalog(65));
        assertThat(messages(request)).containsExactly(message);

        request.setCatalog(catalog(0));
        assertThat(messages(request)).containsExactly(message);

        request.setCatalog(MAPPER.createArrayNode());
        assertThat(messages(request)).containsExactly(message);

        ObjectNode noCardType = (ObjectNode) catalog(3);
        ((ObjectNode) noCardType.get("cards").get(1)).remove("cardType");
        request.setCatalog(noCardType);
        assertThat(messages(request)).containsExactly(message);

        ObjectNode longText = (ObjectNode) catalog(3);
        ((ObjectNode) longText.get("cards").get(0)).put("purpose", "p".repeat(2001));
        request.setCatalog(longText);
        assertThat(messages(request)).containsExactly(message);
    }

    @Test
    void boundsTheRetryFeedback() {
        PipelineIntentRequest request = valid();
        request.setRejectionFeedback(new ArrayList<>(Collections.nCopies(21, "Problem: X")));
        assertThat(messages(request)).containsExactly("rejectionFeedback supports at most 20 lines.");

        request.setRejectionFeedback(List.of("f".repeat(201)));
        assertThat(messages(request)).containsExactly("rejectionFeedback lines must be at most 200 characters.");

        request.setRejectionFeedback(List.of("f".repeat(200)));
        assertThat(messages(request)).isEmpty();
    }

    @Test
    void boundsTheExclusionLists() {
        PipelineIntentRequest request = valid();
        request.setExcludeCapabilitySets(new ArrayList<>(Collections.nCopies(7, List.of("A"))));
        assertThat(messages(request)).containsExactly("excludeCapabilitySets supports at most 6 sets.");

        request.setExcludeCapabilitySets(List.of(Arrays.asList("A", "B", "C", "D", "E", "F", "G")));
        assertThat(messages(request)).containsExactly("each excluded capability set holds at most 6 IDs.");

        request.setExcludeCapabilitySets(List.of(List.of(" ")));
        assertThat(messages(request)).containsExactly("excluded capability IDs must be non-empty.");
    }

    @Test
    void keepsTheWireShapeFreeOfValidationHelpers() throws Exception {
        JsonNode json = MAPPER.readTree(MAPPER.writeValueAsString(valid()));

        assertThat(json.has("catalogWithinLimits")).isFalse();
        assertThat(json.fieldNames()).toIterable().containsExactlyInAnyOrder(
            "goal", "suggestionSetId", "attempt", "catalog", "catalogVersion", "excludeCapabilitySets", "rejectionFeedback");
    }
}
