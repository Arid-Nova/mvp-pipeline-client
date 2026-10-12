package edu.baylor.ecs.cloudhubs.chatbot.pipeline.model;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Request body for POST /chatbot/pipeline/intents (Issue #60). The endpoint and its validation
 * rules are added by P60-M1-005; this class only defines the wire shape.
 * The capability catalog is passed through as JSON: the frontend owns its structure.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PipelineIntentRequest {
    private String goal;
    private String suggestionSetId;
    private Integer attempt;
    private JsonNode catalog;
    private String catalogVersion;
    private List<List<String>> excludeCapabilitySets = new ArrayList<>();
    private List<String> rejectionFeedback = new ArrayList<>();
}
