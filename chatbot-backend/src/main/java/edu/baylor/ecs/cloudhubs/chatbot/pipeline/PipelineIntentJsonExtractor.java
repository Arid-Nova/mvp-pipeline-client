package edu.baylor.ecs.cloudhubs.chatbot.pipeline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentOutcome;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Tolerant extraction of the model's intent plan (Issue #60, P60-M1-005). Shape checks only.
 *
 * Accepts raw JSON, Markdown-fenced JSON, and JSON surrounded by prose. Each option must be an
 * object with an {@code analysisCardTypes} array; valid options are passed through unchanged
 * (including any fields outside the contract) and malformed ones are reported in parseErrors.
 * Whether capability IDs exist, are analysis capabilities, or form a valid plan is decided by the
 * frontend parser (parseIntentPlan), never here. Never throws, and parse errors never quote model
 * text.
 */
@Component
public class PipelineIntentJsonExtractor {

    static final int MAX_OPTIONS = 6;
    static final int MAX_UNSUPPORTED_REASON_CHARS = 1000;
    private static final int MAX_PARSE_ERRORS = 20;
    private static final int MAX_OBJECT_STARTS_TRIED = 20;
    private static final Pattern FENCE = Pattern.compile("```[a-zA-Z]*\\s*(.*?)```", Pattern.DOTALL);

    private final ObjectMapper objectMapper;

    public PipelineIntentJsonExtractor() {
        this(new ObjectMapper());
    }

    PipelineIntentJsonExtractor(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public record Extraction(
        PipelineIntentOutcome outcome,
        List<JsonNode> options,
        List<String> parseErrors,
        String unsupportedReason
    ) {
    }

    public Extraction extract(String modelText) {
        try {
            return extractUnsafe(modelText);
        } catch (RuntimeException ex) {
            return invalid(List.of("Model output could not be processed."));
        }
    }

    private Extraction extractUnsafe(String modelText) {
        if (modelText == null || modelText.isBlank()) {
            return invalid(List.of("Model returned no content."));
        }
        String body = stripFences(modelText).trim();
        JsonNode root = tryParse(body);
        if (root != null && !root.isObject()) {
            return invalid(List.of("Top-level JSON value must be an object."));
        }
        if (root == null) {
            root = firstObject(body);
        }
        if (root == null) {
            int firstBrace = body.indexOf('{');
            if (firstBrace < 0) {
                return invalid(List.of("No JSON object found in model output."));
            }
            return invalid(List.of(balancedEnd(body, firstBrace) < 0
                ? "No complete JSON object found; the output may be truncated."
                : "Model output contains malformed JSON."));
        }

        String unsupportedReason = null;
        JsonNode reasonNode = root.get("unsupportedReason");
        if (reasonNode != null && reasonNode.isTextual() && !reasonNode.asText().isBlank()) {
            String reason = reasonNode.asText().trim();
            unsupportedReason = reason.length() > MAX_UNSUPPORTED_REASON_CHARS ? reason.substring(0, MAX_UNSUPPORTED_REASON_CHARS) : reason;
        }

        JsonNode optionsNode = root.get("options");
        if (optionsNode == null || optionsNode.isNull() || (optionsNode.isArray() && optionsNode.isEmpty())) {
            if (unsupportedReason != null) {
                return new Extraction(PipelineIntentOutcome.UNSUPPORTED_GOAL, List.of(), List.of(), unsupportedReason);
            }
            return invalid(List.of(optionsNode == null || optionsNode.isNull() ? "options is missing." : "options is empty."));
        }
        if (!optionsNode.isArray()) {
            return invalid(List.of("options must be an array."));
        }

        List<JsonNode> options = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        for (int i = 0; i < optionsNode.size(); i++) {
            JsonNode option = optionsNode.get(i);
            if (!option.isObject()) {
                addError(errors, "options[" + i + "] is not an object.");
            } else if (!option.path("analysisCardTypes").isArray()) {
                addError(errors, "options[" + i + "].analysisCardTypes must be an array.");
            } else if (options.size() < MAX_OPTIONS) {
                options.add(option);
            } else {
                addError(errors, "options[" + i + "] dropped: at most " + MAX_OPTIONS + " options are passed on.");
            }
        }
        if (options.isEmpty()) {
            return new Extraction(PipelineIntentOutcome.INVALID_MODEL_OUTPUT, List.of(), errors, unsupportedReason);
        }
        return new Extraction(PipelineIntentOutcome.OK, options, errors, unsupportedReason);
    }

    private static Extraction invalid(List<String> errors) {
        return new Extraction(PipelineIntentOutcome.INVALID_MODEL_OUTPUT, List.of(), errors, null);
    }

    private static void addError(List<String> errors, String error) {
        if (errors.size() < MAX_PARSE_ERRORS) {
            errors.add(error);
        }
    }

    private static String stripFences(String text) {
        Matcher fence = FENCE.matcher(text);
        return fence.find() ? fence.group(1) : text;
    }

    private JsonNode tryParse(String text) {
        try {
            return text.isEmpty() ? null : objectMapper.readTree(text);
        } catch (Exception ex) {
            return null;
        }
    }

    /** The first balanced, parseable top-level {...} in the text (string- and escape-aware). */
    private JsonNode firstObject(String text) {
        int from = 0;
        for (int tried = 0; tried < MAX_OBJECT_STARTS_TRIED; tried++) {
            int start = text.indexOf('{', from);
            if (start < 0) {
                return null;
            }
            int end = balancedEnd(text, start);
            if (end < 0) {
                return null;
            }
            JsonNode node = tryParse(text.substring(start, end + 1));
            if (node != null && node.isObject()) {
                return node;
            }
            from = start + 1;
        }
        return null;
    }

    private static int balancedEnd(String text, int start) {
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int i = start; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (c == '\\') {
                    escaped = true;
                } else if (c == '"') {
                    inString = false;
                }
            } else if (c == '"') {
                inString = true;
            } else if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }
}
