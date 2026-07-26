package edu.baylor.ecs.cloudhubs.chatbot.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotFlag;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotQueryRequest;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.chatbot.prompt.PromptAssemblyService;
import edu.baylor.ecs.cloudhubs.chatbot.quality.ConfidenceService;
import edu.baylor.ecs.cloudhubs.chatbot.retrieval.ContextBudgeter;
import edu.baylor.ecs.cloudhubs.chatbot.retrieval.HybridRetriever;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.LocalLlmClient;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmResult;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * End-to-end proof for issue S12-046 ("Reconnect IrContextProvider to backend IR API via HTTP
 * client"): with a TrainTicket-shaped IR available from a (faked) backend, architecture-topology
 * and endpoint-lookup questions must be answered with real citations instead of the automatic
 * INSUFFICIENT_EVIDENCE guardrail response that fires when no IR/ENDPOINT evidence is present.
 */
class IrBackedArchitectureQaIntegrationTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void architectureTopologyQuestionIsAnsweredFromBackendIrInsteadOfInsufficientEvidence() throws Exception {
        ChatbotQueryService service = buildService(trainTicketFixture());

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "Explain the architecture topology for ts-seat-service",
            new ChatbotContext("TrainTicket", "ir-1", "idx-1", "run-1", "commit-1", null, null, null),
            "conv-1",
            List.of()
        );

        ChatbotResponse response = service.query(request, "req-1");

        assertThat(response.getFlags()).doesNotContain(ChatbotFlag.INSUFFICIENT_EVIDENCE);
        assertThat(response.getAnswer()).contains("Answer:");
        assertThat(response.getCitations()).anyMatch(c -> "IR".equals(c.getArtifactType()));
    }

    @Test
    void endpointLookupQuestionIsAnsweredFromBackendIr() throws Exception {
        ChatbotQueryService service = buildService(trainTicketFixture());

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What does POST /api/v1/seatservice/seats do?",
            new ChatbotContext("TrainTicket", "ir-1", "idx-1", "run-1", "commit-1", null, null, null),
            "conv-2",
            List.of()
        );

        ChatbotResponse response = service.query(request, "req-2");

        assertThat(response.getFlags()).doesNotContain(ChatbotFlag.INSUFFICIENT_EVIDENCE);
        assertThat(response.getCitations()).anyMatch(c -> "ENDPOINT".equals(c.getArtifactType()));
    }

    @Test
    void microserviceCountQuestionIsAnsweredFromLocallyUploadedIrEvenWhenBackendHasNothing() throws Exception {
        // Reproduces the reported bug: an IR loaded via drag-and-drop was never persisted to
        // `backend` (no real irId, systemName may not match anything server-side either), so the
        // backend gateway always misses. The frontend now sends the IR content it already has
        // in memory as ChatbotContext.irPayload, and IrContextProvider must use it directly.
        ChatbotQueryService service = buildService(null);

        ChatbotContext context = new ChatbotContext();
        context.setSystemName("IR.json");
        context.setIrPayload(trainTicketFixture());

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "How many microservices are in this system?",
            context,
            "conv-4",
            List.of()
        );

        ChatbotResponse response = service.query(request, "req-4");

        assertThat(response.getFlags()).doesNotContain(ChatbotFlag.INSUFFICIENT_EVIDENCE);
        assertThat(response.getAnswer()).contains("1 microservices").contains("ts-seat-service");
    }

    @Test
    void stillReturnsInsufficientEvidenceWhenBackendHasNoMatchingIr() {
        ChatbotQueryService service = buildService(null);

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "Explain the architecture topology for ts-seat-service",
            new ChatbotContext("Unknown", "ir-missing", "idx-1", "run-1", "commit-1", null, null, null),
            "conv-3",
            List.of()
        );

        ChatbotResponse response = service.query(request, "req-3");

        assertThat(response.getFlags()).contains(ChatbotFlag.INSUFFICIENT_EVIDENCE);
    }

    private JsonNode trainTicketFixture() throws Exception {
        return OBJECT_MAPPER.readTree("""
            {
              "name": "TrainTicket",
              "commitID": "commit-1",
              "microservices": [
                {
                  "name": "ts-seat-service",
                  "path": "/ts-seat-service",
                  "controllers": [
                    {
                      "name": "SeatController",
                      "path": "/ts-seat-service/src/main/java/seat/controller/SeatController.java",
                      "methods": [
                        { "name": "create", "httpMethod": "POST", "url": "/api/v1/seatservice/seats" }
                      ]
                    }
                  ]
                }
              ]
            }
            """);
    }

    private ChatbotQueryService buildService(JsonNode irFixture) {
        ChatbotConfig config = new ChatbotConfig();
        config.setProvider(ChatbotConfig.Provider.OLLAMA);
        config.setModel("llama3.2");
        config.setBaseUrl("http://ollama:11434");
        config.setTimeoutMs(30000);
        config.setMaxTokens(1024);
        config.setTemperature(0.2);
        config.setContextBudgetMaxEvidenceItems(20);
        config.setContextBudgetMaxEvidenceChars(12000);
        config.setStrictEvidenceOnly(false);

        BackendIrGateway gateway = new BackendIrGateway() {
            @Override
            public Optional<JsonNode> fetchIrById(String irId) {
                return "ir-1".equals(irId) ? Optional.ofNullable(irFixture) : Optional.empty();
            }

            @Override
            public Optional<JsonNode> fetchLatestIrForSystem(String systemName) {
                return Optional.empty();
            }
        };

        ChatContextService chatContextService = ChatContextService.forProviders(List.of(new IrContextProvider(gateway)));

        return new ChatbotQueryService(
            config,
            chatContextService,
            new EvidenceGuardrailService(),
            new PromptAssemblyService(),
            new HybridRetriever(),
            new ContextBudgeter(),
            new ConfidenceService(),
            new FakeLocalLlmClient()
        );
    }

    private static final class FakeLocalLlmClient implements LocalLlmClient {
        @Override
        public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig cfg) {
            return new LocalLlmResult(
                "Answer: ts-seat-service exposes POST /api/v1/seatservice/seats [E1].\nQualification: direct IR evidence.",
                cfg.getModel(),
                cfg.getProvider().name(),
                200,
                "stop"
            );
        }
    }
}
