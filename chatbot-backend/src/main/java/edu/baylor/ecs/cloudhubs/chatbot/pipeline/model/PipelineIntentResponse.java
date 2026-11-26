package edu.baylor.ecs.cloudhubs.chatbot.pipeline.model;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Response body for POST /chatbot/pipeline/intents (Issue #60).
 * {@code options} are the model's intent options, shape-checked only and otherwise passed through
 * unchanged: the backend is non-authoritative, and the frontend parser (parseIntentPlan) decides
 * which capabilities survive and strips any graph or config fields.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PipelineIntentResponse {
    private PipelineIntentOutcome outcome;
    private String suggestionSetId;
    private String requestId;
    private String catalogVersion;
    private List<JsonNode> options = new ArrayList<>();
    private List<String> parseErrors = new ArrayList<>();
    private String unsupportedReason;
    private String model;
    private String provider;
    private long processingTimeMs;
}
