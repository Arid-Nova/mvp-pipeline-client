package edu.baylor.ecs.cloudhubs.chatbot.pipeline.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Request body for POST /chatbot/pipeline/intents (Issue #60, P60-M1-005).
 * The capability catalog is passed through as JSON: the frontend owns its structure. Validation
 * here is transport-level only (sizes and shapes); capability semantics are the frontend's job.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PipelineIntentRequest {
    public static final int MAX_GOAL_CHARS = 1000;
    public static final int MAX_CATALOG_CARDS = 64;
    public static final int MAX_CATALOG_TEXT_CHARS = 2000;
    public static final int MAX_CATALOG_JSON_CHARS = 200_000;
    public static final int MAX_EXCLUDED_SETS = 6;
    public static final int MAX_IDS_PER_SET = 6;
    public static final int MAX_FEEDBACK_LINES = 20;
    public static final int MAX_FEEDBACK_CHARS = 200;

    @NotBlank(message = "goal is required and must be non-empty.")
    @Size(max = MAX_GOAL_CHARS, message = "goal must be at most 1000 characters.")
    private String goal;

    @NotBlank(message = "suggestionSetId is required.")
    @Pattern(
        regexp = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        message = "suggestionSetId must be a valid UUID."
    )
    private String suggestionSetId;

    @NotNull(message = "attempt is required.")
    @Min(value = 1, message = "attempt must be 1 or 2.")
    @Max(value = 2, message = "attempt must be 1 or 2.")
    private Integer attempt;

    @NotNull(message = "catalog is required.")
    private JsonNode catalog;

    @NotBlank(message = "catalogVersion is required.")
    @Size(max = 64, message = "catalogVersion must be at most 64 characters.")
    private String catalogVersion;

    @Size(max = MAX_EXCLUDED_SETS, message = "excludeCapabilitySets supports at most 6 sets.")
    private List<
        @NotNull(message = "excludeCapabilitySets entries must be lists.")
        @Size(max = MAX_IDS_PER_SET, message = "each excluded capability set holds at most 6 IDs.")
        List<@NotBlank(message = "excluded capability IDs must be non-empty.")
            @Size(max = 64, message = "excluded capability IDs must be at most 64 characters.") String>
        > excludeCapabilitySets = new ArrayList<>();

    @Size(max = MAX_FEEDBACK_LINES, message = "rejectionFeedback supports at most 20 lines.")
    private List<
        @NotNull(message = "rejectionFeedback lines must be strings.")
        @Size(max = MAX_FEEDBACK_CHARS, message = "rejectionFeedback lines must be at most 200 characters.") String
        > rejectionFeedback = new ArrayList<>();

    /**
     * Bounded catalog shape: an object with 1..64 card objects, each with a non-blank
     * {@code cardType} and short text fields. Card meaning is not checked here.
     */
    @JsonIgnore
    @AssertTrue(message = "catalog must be an object with 1..64 cards, each with a cardType and bounded text fields.")
    public boolean isCatalogWithinLimits() {
        if (catalog == null) {
            return true; // reported by @NotNull
        }
        if (!catalog.isObject() || catalog.toString().length() > MAX_CATALOG_JSON_CHARS) {
            return false;
        }
        JsonNode cards = catalog.get("cards");
        if (cards == null || !cards.isArray() || cards.isEmpty() || cards.size() > MAX_CATALOG_CARDS) {
            return false;
        }
        for (JsonNode card : cards) {
            if (!card.isObject()) {
                return false;
            }
            JsonNode cardType = card.get("cardType");
            if (cardType == null || !cardType.isTextual() || cardType.asText().isBlank() || cardType.asText().length() > 64) {
                return false;
            }
            Iterator<Map.Entry<String, JsonNode>> fields = card.fields();
            while (fields.hasNext()) {
                JsonNode value = fields.next().getValue();
                if (value.isTextual() && value.asText().length() > MAX_CATALOG_TEXT_CHARS) {
                    return false;
                }
            }
        }
        return true;
    }
}
