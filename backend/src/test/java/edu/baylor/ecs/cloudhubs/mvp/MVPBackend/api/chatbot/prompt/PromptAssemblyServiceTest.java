package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotMessage;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PromptAssemblyServiceTest {

    private final PromptAssemblyService service = new PromptAssemblyService();

    @Test
    void includesGroundingAndRefusalRules() {
        PromptAssemblyResult result = service.assemble(
            "Is order-service vulnerable?",
            null,
            List.of(),
            List.of()
        );

        assertThat(result.getSystemInstructions())
            .contains("Use only the supplied AridNova evidence block")
            .contains("Do not invent architecture facts")
            .contains("If evidence is absent");

        assertThat(result.getDeveloperInstructions())
            .contains("Start with 'Answer:'")
            .contains("Then add 'Qualification:'")
            .contains("insufficient evidence");
    }

    @Test
    void includesContextMetadataWhenProvided() {
        ChatbotContext context = new ChatbotContext(
            "TrainTicket",
            "ir-12",
            "index-2",
            "run-44",
            "commit-abc",
            "order-service",
            "POST /orders"
        );

        PromptAssemblyResult result = service.assemble(
            "What changed?",
            context,
            List.of(new PromptEvidenceItem("E1", "SERVICE", "order-service", "OrderController:88", "Auth check changed")),
            List.of(new ChatbotMessage("user", "previous turn"))
        );

        assertThat(result.getUserPrompt())
            .contains("systemName: TrainTicket")
            .contains("irId: ir-12")
            .contains("commitId: commit-abc")
            .contains("selectedEndpoint: POST /orders");

        assertThat(result.getEvidenceBlock())
            .contains("ContextSummary: system=TrainTicket")
            .contains("[E1]")
            .contains("location=OrderController:88");
    }

    @Test
    void emptyEvidenceCaseForcesQualifiedNonSpeculativeBehavior() {
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

        assertThat(result.toChatbotPrompt().getSystemInstruction())
            .contains("Do not invent architecture facts")
            .contains("If evidence is missing, explicitly say 'insufficient evidence'");
    }
}
