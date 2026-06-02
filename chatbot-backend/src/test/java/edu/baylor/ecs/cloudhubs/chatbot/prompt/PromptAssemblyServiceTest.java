package edu.baylor.ecs.cloudhubs.chatbot.prompt;

import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotMessage;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PromptAssemblyServiceTest {

    private final PromptAssemblyService service = new PromptAssemblyService();

    @Test
    void promptIncludesGroundingRules() {
        PromptAssemblyResult result = service.assemble(
            "Is order-service vulnerable?",
            null,
            List.of(),
            List.of()
        );

        assertThat(result.getSystemInstructions())
            .contains("Answer only from the supplied AridNova evidence records")
            .contains("Do not make unsupported architecture, dependency, endpoint, risk, or impact claims")
            .contains("Cite evidence IDs")
            .contains("direct facts versus inferred transitive paths")
            .contains("Only mention anti-patterns when explicit anti-pattern markers are present")
            .contains("insufficient evidence");

        assertThat(result.getDeveloperInstructions())
            .contains("Every material claim must include at least one citation marker")
            .contains("transitive dependencies")
            .contains("Do not quote or reconstruct source files");
    }

    @Test
    void promptIncludesEvidenceIdsAndLocationHintsInStructuredBlock() {
        ChatbotContext context = new ChatbotContext(
            "TrainTicket",
            "ir-12",
            "index-2",
            "run-44",
            "commit-abc",
            "order-service",
            "POST /orders",
            null
        );

        PromptAssemblyResult result = service.assemble(
            "What changed?",
            context,
            List.of(new PromptEvidenceItem(
                "E1",
                "ENDPOINT",
                "artifact-1",
                "commit-abc",
                "controllers[2].methods[1].url",
                "OrderController",
                "order-service",
                "POST /orders",
                "Authorization precheck added"
            )),
            List.of(new ChatbotMessage("user", "previous turn"))
        );

        assertThat(result.getEvidenceBlock())
            .contains("AridNovaEvidenceRecords")
            .contains("EvidenceRecord")
            .contains("id=E1")
            .contains("locationHint=controllers[2].methods[1].url")
            .contains("service=order-service")
            .contains("endpoint=POST /orders");
    }

    @Test
    void promptIncludesTruncationNoticeWhenApplicable() {
        PromptAssemblyResult result = service.assemble(
            "What depends on payment-service?",
            new ChatbotContext("TrainTicket", "ir-1", null, null, "c1", "payment-service", null, null),
            List.of(new PromptEvidenceItem("E9", "GRAPH", "graph-1", "c1", "links[4]", "payment-service", "payment-service", null, "payment -> order")),
            null,
            new PromptAssemblyMetadata(true, false)
        );

        assertThat(result.getUserPrompt())
            .contains("ContextStatus")
            .contains("evidenceTruncated: true");

        assertThat(result.getEvidenceBlock())
            .contains("EvidenceState: truncated=true");
    }

    @Test
    void promptIncludesAntiPatternMarkersOnlyFromEvidence() {
        PromptEvidenceItem item = new PromptEvidenceItem(
            "E7",
            "ARCHITECTURE",
            "graph-antipattern:order-service:Bottleneck",
            "graph-v1",
            "nodes[order-service].patterns",
            "Bottleneck",
            "order-service",
            null,
            "Graph anti-pattern marker on node order-service: Bottleneck"
        );
        item.setAntiPatternMarkers("Bottleneck");

        PromptAssemblyResult withMarkers = service.assemble(
            "what architecture risks exist?",
            new ChatbotContext(),
            List.of(item),
            null
        );
        PromptAssemblyResult withoutMarkers = service.assemble(
            "what architecture risks exist?",
            new ChatbotContext(),
            List.of(new PromptEvidenceItem("E8", "ARCHITECTURE", "arch-1", "v1", "nodes[order-service]", "order-service", "order-service", null, "Service summary")),
            null
        );

        assertThat(withMarkers.getEvidenceBlock()).contains("antiPatterns=Bottleneck");
        assertThat(withoutMarkers.getEvidenceBlock()).contains("antiPatterns=n/a");
    }

    @Test
    void promptDoesNotIncludeSourceCodeBeyondEvidenceSnippetsSupplied() {
        String snippet = "if (authorized) { return ok; }";
        PromptAssemblyResult result = service.assemble(
            "Explain endpoint auth flow",
            new ChatbotContext(),
            List.of(new PromptEvidenceItem("E2", "IR", "artifact-2", "v1", "controllers[0].methods[0]", "AuthController", "auth-service", "GET /auth", snippet)),
            null
        );

        assertThat(result.getEvidenceBlock()).contains(snippet);
        assertThat(result.getEvidenceBlock()).doesNotContain("class SecretInternalImplementation");
    }

    @Test
    void noEvidencePathUsesInsufficientEvidenceConstraintNotSpeculativePrompting() {
        PromptAssemblyResult result = service.assemble(
            "Can you confirm policy drift?",
            new ChatbotContext(),
            List.of(),
            null
        );

        assertThat(result.getEvidenceBlock())
            .contains("EvidenceCount: 0")
            .contains("EvidenceList: none");

        assertThat(result.getUserPrompt())
            .contains("No evidence is currently available")
            .contains("insufficient evidence");
    }
}
