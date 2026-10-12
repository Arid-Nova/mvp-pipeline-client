package edu.baylor.ecs.cloudhubs.chatbot.pipeline;

import com.fasterxml.jackson.databind.JsonNode;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentRequest;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Builds the intent-selection prompt (Issue #60, P60-M1-005).
 *
 * The model chooses WHAT to analyse: three intent options naming analysis capabilities. It never
 * builds graphs; the frontend composer and validator own all wiring. So the prompt lists only the
 * catalog cards with {@code isAnalysis == true} and contains no edges, input requirements,
 * templates or graph schema.
 *
 * The system instruction is a faithful port of intent prompt v2, measured in the P60-M1-016 spike
 * ({@code buildIntentSystemPrompt(catalog, 'v2')} in
 * frontend/src/components/pipeline/planning/__spike__/localModelFeasibility.live.test.ts).
 * Everything card-specific comes from {@code request.catalog}; no card names live in Java.
 */
@Component
public class PipelineIntentPromptBuilder {

    /** Same limit as the frontend contract (intentPlan.ts MAX_ANALYSIS_PER_OPTION). */
    static final int MAX_ANALYSIS_PER_OPTION = 6;
    /** Catalog category whose capabilities compare versions (prompt v2 rule). */
    static final String VERSION_CATEGORY = "Version Control";

    /**
     * Retry feedback is about capability and profile choices. The model doesn't own topology, so
     * lines about graph wiring (validator structural codes, explicit edges) are never forwarded.
     */
    private static final Pattern GRAPH_WIRING_FEEDBACK = Pattern.compile(
        "\\b(ILLEGAL_CONNECTION|MISSING_UPSTREAM|UNREACHABLE_NODE|EDGE_UNKNOWN_NODE|SELF_LOOP|DUPLICATE_EDGE|CYCLE"
            + "|INPUT_REQUIREMENT_UNMET|NOT_CONNECTED|MISSING_INPUT|INPUT_WITHOUT_OUTPUT)\\b|->|→|\\bedges?\\b",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern CONTROL_CHARS = Pattern.compile("[\\p{Cc}&&[^\\n\\t]]");

    public ChatbotPrompt build(PipelineIntentRequest request, int contextTokens) {
        return new ChatbotPrompt(systemInstruction(request.getCatalog()), userMessage(request), List.of(), true, contextTokens);
    }

    String systemInstruction(JsonNode catalog) {
        List<String> capabilities = new ArrayList<>();
        Set<String> analysisCategories = new LinkedHashSet<>();
        JsonNode cards = catalog == null ? null : catalog.get("cards");
        if (cards != null && cards.isArray()) {
            for (JsonNode card : cards) {
                if (!card.path("isAnalysis").asBoolean(false)) {
                    continue;
                }
                String category = text(card, "category");
                analysisCategories.add(category);
                capabilities.add("- " + text(card, "cardType") + " (\"" + text(card, "title") + "\", category: " + category + "): "
                    + text(card, "purpose") + " Produces: " + text(card, "outcome"));
            }
        }

        List<String> lines = new ArrayList<>();
        lines.add("You help users of AridNova, a microservice analysis toolkit, choose which analyses to run.");
        lines.add("Respond with ONE JSON object and nothing else.");
        lines.add("");
        lines.add("ANALYSIS CAPABILITIES (use these IDs exactly):");
        lines.addAll(capabilities);
        lines.add("");
        lines.add("Return EXACTLY THREE options for the user's goal, one for each tier:");
        lines.add("- \"focused\": the fewest capabilities that directly serve the goal;");
        lines.add("- \"balanced\": the focused capabilities plus the most useful related analysis;");
        lines.add("- \"comprehensive\": a broader set of related analyses.");
        lines.add("Each option must use a different set of capabilities.");
        lines.add("Use at most " + MAX_ANALYSIS_PER_OPTION + " capabilities per option.");
        lines.add("List analysis capability IDs only. Do NOT list data sources, inputs, intermediate or prerequisite steps, "
            + "nodes, edges, connections, configuration, repositories, IDs or positions. AridNova adds all wiring and "
            + "prerequisites automatically.");
        // Prompt v2 rules (the single tuning iteration of P60-M1-016).
        lines.add("Copy capability IDs exactly, character for character, from the list above.");
        lines.add("The focused option must cover every part of the goal: if the goal asks for two things, include a capability for each.");
        if (analysisCategories.contains(VERSION_CATEGORY)) {
            lines.add("Capabilities in the \"" + VERSION_CATEGORY + "\" category compare two versions or snapshots of a system; "
                + "choose them only when the goal is about versions, snapshots, or changes.");
        }
        lines.add("Keep each title under 60 characters.");
        lines.add("");
        lines.add("OUTPUT SCHEMA:");
        lines.add("{\"version\":1,\"options\":[{\"tier\":\"focused\",\"title\":\"short title\",\"rationale\":\"one sentence: why this fits the goal\","
            + "\"analysisCardTypes\":[\"CAPABILITY_ID\"]}]}");
        lines.add("If AridNova cannot serve the goal at all, return {\"version\":1,\"options\":[],\"unsupportedReason\":\"...\"}.");
        return String.join("\n", lines);
    }

    String userMessage(PipelineIntentRequest request) {
        StringBuilder message = new StringBuilder()
            .append("Analysis goal: \"").append(clean(request.getGoal()).trim()).append("\"\n")
            .append("Return the JSON object now.");
        String retry = retryGuidance(request);
        if (!retry.isEmpty()) {
            message.append("\n\n").append(retry);
        }
        return message.toString();
    }

    /** Capability- and profile-level guidance for the one bounded retry (P60-M1-006). */
    String retryGuidance(PipelineIntentRequest request) {
        List<String> problems = new ArrayList<>();
        if (request.getRejectionFeedback() != null) {
            for (String line : request.getRejectionFeedback()) {
                String cleaned = line == null ? "" : clean(line).replaceAll("\\s+", " ").trim().replaceAll("[.;]+$", "");
                if (!cleaned.isEmpty() && !GRAPH_WIRING_FEEDBACK.matcher(cleaned).find()) {
                    problems.add(cleaned);
                }
            }
        }
        List<String> excluded = new ArrayList<>();
        if (request.getExcludeCapabilitySets() != null) {
            for (List<String> set : request.getExcludeCapabilitySets()) {
                if (set != null && !set.isEmpty()) {
                    excluded.add("[" + String.join(", ", set.stream().map(id -> clean(id).trim()).toList()) + "]");
                }
            }
        }
        boolean isRetry = request.getAttempt() != null && request.getAttempt() > 1;
        if (!isRetry && problems.isEmpty() && excluded.isEmpty()) {
            return "";
        }
        StringBuilder retry = new StringBuilder("Your previous answer was not usable.");
        if (!problems.isEmpty()) {
            retry.append(" Problems: ").append(String.join("; ", problems)).append('.');
        }
        if (!excluded.isEmpty()) {
            retry.append(" Do not use these capability sets again: ").append(String.join(" ", excluded)).append('.');
        }
        retry.append(" Return the complete JSON object again with exactly three options (focused, balanced, comprehensive), ")
            .append("each with a different set of capability IDs from the list.");
        return retry.toString();
    }

    private static String text(JsonNode card, String field) {
        return clean(card.path(field).asText("")).trim();
    }

    private static String clean(String value) {
        return value == null ? "" : CONTROL_CHARS.matcher(value).replaceAll("");
    }
}
