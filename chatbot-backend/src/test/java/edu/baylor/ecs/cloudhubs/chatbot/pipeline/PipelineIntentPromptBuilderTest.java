package edu.baylor.ecs.cloudhubs.chatbot.pipeline;

import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentRequest;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.GOAL;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.catalog;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.request;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.retryRequest;
import static org.assertj.core.api.Assertions.assertThat;

class PipelineIntentPromptBuilderTest {

    private final PipelineIntentPromptBuilder builder = new PipelineIntentPromptBuilder();

    @Test
    void buildsAJsonModePromptWithTheRequestedContextWindow() {
        ChatbotPrompt prompt = builder.build(request(), 4096);

        assertThat(prompt.isJsonOutput()).isTrue();
        assertThat(prompt.getContextTokens()).isEqualTo(4096);
        assertThat(prompt.getMessages()).isEmpty();
        assertThat(prompt.getSystemInstruction()).isNotBlank();
        assertThat(prompt.getUserQuestion()).isNotBlank();
    }

    @Test
    void offersOnlyTheAnalysisCapabilitiesOfTheSuppliedCatalog() {
        String system = builder.systemInstruction(catalog());

        assertThat(system).contains(
            "- FOO_ANALYSIS (\"Foo Analysis\", category: Visualization): Draws the foo. Produces: A foo picture.",
            "- QUX_COMPARE (\"Qux Compare\", category: Version Control): Compares two qux. Produces: A qux diff."
        );
        assertThat(system).doesNotContain("BAR_INPUT", "Bar Source", "BAZ_HOLDER", "Baz Holder");
    }

    @Test
    void followsTheCatalogRatherThanAJavaCardList() {
        ObjectNode other = (ObjectNode) catalog();
        other.withArray("cards").removeAll();
        other.withArray("cards").addObject()
            .put("cardType", "NEW_THING").put("title", "New Thing").put("category", "Processes")
            .put("purpose", "Does new things.").put("outcome", "New results.").put("isAnalysis", true);

        String system = builder.systemInstruction(other);

        assertThat(system).contains("- NEW_THING (\"New Thing\", category: Processes): Does new things. Produces: New results.");
        assertThat(system).doesNotContain("FOO_ANALYSIS");
    }

    @Test
    void mainSourcesHardCodeNoRealCardTypes() throws Exception {
        List<String> realCardTypes = List.of(
            "SYSTEM_INPUT", "MULTI_REPO", "UPLOAD_IR", "COMPONENT_GENERATE", "IR_HOLDER", "COMPONENT_HOLDER",
            "FORMAL_VERIFY", "SCENARIO_GENERATE", "PROMPT_GENERATE", "TEST_GENERATE", "VISUALIZATION", "AEGIS",
            "FORMAL_VIZ", "TEST_EXECUTOR", "VERIFICATION_COMPARISON", "CHANGE_IMPACT", "SECURITY_REGRESSION"
        );
        try (var paths = Files.walk(Path.of("src/main/java/edu/baylor/ecs/cloudhubs/chatbot/pipeline"))) {
            for (Path path : paths.filter(p -> p.toString().endsWith(".java")).toList()) {
                String source = Files.readString(path);
                assertThat(realCardTypes).noneMatch(source::contains);
                assertThat(source).doesNotContain("VALID_CONNECTIONS", "CARD_INPUT_REQUIREMENTS", "PipelineSpec");
            }
        }
    }

    @Test
    void requiresExactlyThreeOptionsOnePerTier() {
        String system = builder.systemInstruction(catalog());

        assertThat(system)
            .contains("Return EXACTLY THREE options for the user's goal, one for each tier:")
            .contains("- \"focused\": the fewest capabilities that directly serve the goal;")
            .contains("- \"balanced\": the focused capabilities plus the most useful related analysis;")
            .contains("- \"comprehensive\": a broader set of related analyses.")
            .contains("Each option must use a different set of capabilities.")
            .contains("Use at most 6 capabilities per option.");
    }

    @Test
    void includesThePromptV2Rules() {
        String system = builder.systemInstruction(catalog());

        assertThat(system)
            .contains("Copy capability IDs exactly, character for character, from the list above.")
            .contains("The focused option must cover every part of the goal: if the goal asks for two things, include a capability for each.")
            .contains("Capabilities in the \"Version Control\" category compare two versions or snapshots of a system; "
                + "choose them only when the goal is about versions, snapshots, or changes.")
            .contains("Keep each title under 60 characters.");
    }

    @Test
    void omitsTheVersionControlRuleWhenNoAnalysisCapabilityHasThatCategory() {
        ObjectNode other = (ObjectNode) catalog();
        ((ObjectNode) other.withArray("cards").get(3)).put("category", "Processes");

        assertThat(builder.systemInstruction(other)).doesNotContain("Version Control");
    }

    @Test
    void asksForIntentOnlyAndNeverForGraphsOrConfiguration() {
        String system = builder.systemInstruction(catalog());

        assertThat(system).contains(
            "List analysis capability IDs only. Do NOT list data sources, inputs, intermediate or prerequisite steps, "
                + "nodes, edges, connections, configuration, repositories, IDs or positions. AridNova adds all wiring and "
                + "prerequisites automatically."
        );
        assertThat(system).contains(
            "{\"version\":1,\"options\":[{\"tier\":\"focused\",\"title\":\"short title\","
                + "\"rationale\":\"one sentence: why this fits the goal\",\"analysisCardTypes\":[\"CAPABILITY_ID\"]}]}"
        );
        assertThat(system).contains("\"unsupportedReason\"");
        // No summary, graph schema, requirements, templates or allowed targets from the catalog.
        assertThat(system).doesNotContain("summary", "\"nodes\"", "\"edges\"", "allowedTargets", "requiresAllOf",
            "foo-template", "inputRequirement");
    }

    @Test
    void putsTheGoalInTheUserMessageOnly() {
        ChatbotPrompt prompt = builder.build(request(), 4096);

        assertThat(prompt.getUserQuestion()).isEqualTo("Analysis goal: \"" + GOAL + "\"\nReturn the JSON object now.");
        assertThat(prompt.getSystemInstruction()).doesNotContain(GOAL);
    }

    @Test
    void addsNoRetryGuidanceOnTheFirstAttempt() {
        assertThat(builder.userMessage(request())).doesNotContain("previous answer");
    }

    @Test
    void addsCapabilityLevelRetryGuidanceOnAttemptTwo() {
        PipelineIntentRequest retry = retryRequest(
            List.of(List.of("FOO_ANALYSIS", "QUX_COMPARE")),
            List.of(
                "Problem: UNKNOWN_CAPABILITY",
                "Not capability IDs, do not use: FOO_ANALYSYS",
                "The balanced and comprehensive options both expand to [FOO_ANALYSIS, QUX_COMPARE] once prerequisites are added."
            )
        );

        String message = builder.userMessage(retry);

        assertThat(message).startsWith("Analysis goal: \"" + GOAL + "\"\nReturn the JSON object now.\n\n");
        assertThat(message).contains(
            "Your previous answer was not usable. Problems: Problem: UNKNOWN_CAPABILITY; "
                + "Not capability IDs, do not use: FOO_ANALYSYS; "
                + "The balanced and comprehensive options both expand to [FOO_ANALYSIS, QUX_COMPARE] once prerequisites are added.",
            "Do not use these capability sets again: [FOO_ANALYSIS, QUX_COMPARE].",
            "Return the complete JSON object again with exactly three options (focused, balanced, comprehensive), "
                + "each with a different set of capability IDs from the list."
        );
    }

    @Test
    void neverForwardsGraphWiringFeedback() {
        PipelineIntentRequest retry = retryRequest(
            List.of(),
            List.of(
                "ILLEGAL_CONNECTION: SYSTEM_INPUT cannot connect to AEGIS.",
                "Add edge IR_HOLDER -> AEGIS",
                "MISSING_UPSTREAM: AEGIS has no incoming connection.",
                "Problem: DUPLICATE_TIER"
            )
        );

        String message = builder.userMessage(retry);

        assertThat(message).contains("Problems: Problem: DUPLICATE_TIER.");
        assertThat(message).doesNotContain("ILLEGAL_CONNECTION", "->", "edge", "MISSING_UPSTREAM", "IR_HOLDER");
    }

    @Test
    void stillAsksForACompleteReplacementOnAttemptTwoWithoutFeedback() {
        String message = builder.userMessage(retryRequest(List.of(), List.of()));

        assertThat(message).contains("Your previous answer was not usable. Return the complete JSON object again");
    }

    @Test
    void stripsControlCharactersFromGoalAndFeedback() {
        PipelineIntentRequest retry = retryRequest(List.of(), List.of("Problem:\u0007 MISSING_TIER"));
        retry.setGoal("Show\u0000 me");

        String message = builder.userMessage(retry);

        assertThat(message).contains("Analysis goal: \"Show me\"").contains("Problem: MISSING_TIER");
        assertThat(message).doesNotContain("\u0000", "\u0007");
    }
}
