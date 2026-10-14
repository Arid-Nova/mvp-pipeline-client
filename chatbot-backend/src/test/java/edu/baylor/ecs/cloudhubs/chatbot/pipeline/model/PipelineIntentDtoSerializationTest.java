package edu.baylor.ecs.cloudhubs.chatbot.pipeline.model;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PipelineIntentDtoSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private PipelineIntentResponse readSharedFixture() throws Exception {
        // Byte-identical to frontend/src/components/pipeline/planning/__fixtures__/intent-response.valid.json
        // (the frontend contract test asserts the two files match).
        try (InputStream in = getClass().getResourceAsStream("/pipeline/intent-response.valid.json")) {
            assertThat(in).isNotNull();
            return objectMapper.readValue(in, PipelineIntentResponse.class);
        }
    }

    @Test
    void deserializesTheSharedFrontendFixture() throws Exception {
        PipelineIntentResponse response = readSharedFixture();

        assertThat(response.getOutcome()).isEqualTo(PipelineIntentOutcome.OK);
        assertThat(response.getSuggestionSetId()).isEqualTo("3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c");
        assertThat(response.getCatalogVersion()).isEqualTo("pcat-0861a6885a178a");
        assertThat(response.getUnsupportedReason()).isNull();
        assertThat(response.getParseErrors()).isEmpty();
        assertThat(response.getModel()).isEqualTo("llama3.2");
        assertThat(response.getProcessingTimeMs()).isEqualTo(11370L);
        assertThat(response.getOptions()).hasSize(3);
        assertThat(response.getOptions()).extracting(option -> option.get("tier").asText())
            .containsExactly("focused", "balanced", "comprehensive");
        assertThat(response.getOptions().get(0).get("analysisCardTypes")).hasSize(2);
    }

    @Test
    void roundTripsAResponseWithOutcomeSerializedByName() throws Exception {
        PipelineIntentResponse original = readSharedFixture();

        String json = objectMapper.writeValueAsString(original);
        JsonNode tree = objectMapper.readTree(json);
        PipelineIntentResponse restored = objectMapper.readValue(json, PipelineIntentResponse.class);

        assertThat(tree.get("outcome").asText()).isEqualTo("OK");
        assertThat(restored.getOutcome()).isEqualTo(original.getOutcome());
        assertThat(restored.getRequestId()).isEqualTo(original.getRequestId());
        assertThat(restored.getOptions()).isEqualTo(original.getOptions());
        assertThat(restored.getProcessingTimeMs()).isEqualTo(original.getProcessingTimeMs());
    }

    @Test
    void passesModelOptionsThroughUnchangedIncludingFieldsOutsideTheContract() throws Exception {
        // The backend is non-authoritative: it doesn't strip anything. The frontend parser does.
        String json = "{\"outcome\":\"OK\",\"options\":[{\"tier\":\"focused\",\"title\":\"T\","
            + "\"analysisCardTypes\":[\"VISUALIZATION\"],\"nodes\":[{\"key\":\"a\"}],\"x\":1}],"
            + "\"parseErrors\":[],\"processingTimeMs\":5}";

        PipelineIntentResponse response = objectMapper.readValue(json, PipelineIntentResponse.class);
        JsonNode option = objectMapper.readTree(objectMapper.writeValueAsString(response)).get("options").get(0);

        assertThat(option.has("nodes")).isTrue();
        assertThat(option.get("x").asInt()).isEqualTo(1);
    }

    @Test
    void deserializesEveryOutcome() throws Exception {
        for (PipelineIntentOutcome outcome : PipelineIntentOutcome.values()) {
            PipelineIntentResponse response = objectMapper.readValue(
                "{\"outcome\":\"" + outcome.name() + "\"}", PipelineIntentResponse.class);
            assertThat(response.getOutcome()).isEqualTo(outcome);
        }
        assertThat(Arrays.stream(PipelineIntentOutcome.values()).map(outcome -> outcome.name()))
            .containsExactly("OK", "INVALID_MODEL_OUTPUT", "UNSUPPORTED_GOAL", "MODEL_UNAVAILABLE");
    }

    @Test
    void roundTripsARequestWithTheCatalogAsJson() throws Exception {
        JsonNode catalog = objectMapper.readTree(
            "{\"catalogVersion\":\"pcat-0861a6885a178a\",\"cards\":[{\"cardType\":\"VISUALIZATION\",\"isAnalysis\":true}]}");
        PipelineIntentRequest request = new PipelineIntentRequest(
            "I want to visualize the architecture and check authorization problems.",
            "3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c",
            2,
            catalog,
            "pcat-0861a6885a178a",
            List.of(List.of("VISUALIZATION", "FORMAL_VIZ")),
            List.of("Problem: UNKNOWN_CAPABILITY")
        );

        PipelineIntentRequest restored = objectMapper.readValue(objectMapper.writeValueAsString(request), PipelineIntentRequest.class);

        assertThat(restored.getGoal()).isEqualTo(request.getGoal());
        assertThat(restored.getAttempt()).isEqualTo(2);
        assertThat(restored.getCatalog()).isEqualTo(catalog);
        assertThat(restored.getCatalogVersion()).isEqualTo("pcat-0861a6885a178a");
        assertThat(restored.getExcludeCapabilitySets()).containsExactly(List.of("VISUALIZATION", "FORMAL_VIZ"));
        assertThat(restored.getRejectionFeedback()).containsExactly("Problem: UNKNOWN_CAPABILITY");
    }

    @Test
    void defaultsListsToEmptyRatherThanNull() {
        assertThat(new PipelineIntentResponse().getOptions()).isEmpty();
        assertThat(new PipelineIntentResponse().getParseErrors()).isEmpty();
        assertThat(new PipelineIntentRequest().getExcludeCapabilitySets()).isEmpty();
        assertThat(new PipelineIntentRequest().getRejectionFeedback()).isEmpty();
    }
}
