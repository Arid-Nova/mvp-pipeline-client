package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotConfidence;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotFlag;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotQueryRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptAssemblyService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.quality.ConfidenceService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.ContextBudgeter;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.HybridRetriever;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmClient;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config.ChatbotConfig;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ChatbotS12M2IntegrationTest {

    @Test
    void architectureTopologyQueryReturnsAnswerAndIrCitations() {
        ChatbotQueryService service = serviceWithEvidence(fixtures(), 20, 12000, false);

        ChatbotResponse response = service.query(request("Explain architecture topology for order-service"), "req-int-arch");

        assertThat(response.getAnswer()).contains("Answer:");
        assertThat(response.getCitations())
            .anyMatch(c -> "IR".equals(c.getArtifactType()) || "SERVICE".equals(c.getArtifactType()));
        assertThat(response.getConfidence()).isNotNull();
    }

    @Test
    void dependencyQueryReturnsGraphCitations() {
        ChatbotQueryService service = serviceWithEvidence(fixtures(), 20, 12000, false);

        ChatbotResponse response = service.query(request("What depends on payment-service?"), "req-int-dep");

        assertThat(response.getAnswer()).contains("Answer:");
        assertThat(response.getCitations())
            .anyMatch(c -> "GRAPH".equals(c.getArtifactType()) || "DEPENDENCY".equals(c.getArtifactType()));
        assertThat(response.getConfidence()).isNotNull();
    }

    @Test
    void endpointQueryReturnsEndpointOrServiceCitation() {
        ChatbotQueryService service = serviceWithEvidence(fixtures(), 20, 12000, false);

        ChatbotResponse response = service.query(request("What does POST /orders do?"), "req-int-endpoint");

        assertThat(response.getAnswer()).contains("Answer:");
        assertThat(response.getCitations())
            .anyMatch(c -> "ENDPOINT".equals(c.getArtifactType()) || "/orders".equals(c.getLocationHint()));
        assertThat(response.getConfidence()).isNotNull();
    }

    @Test
    void unknownServiceReturnsInsufficientEvidenceWithoutFabrication() {
        ChatbotQueryService service = serviceWithEvidence(fixtures(), 20, 12000, true);
        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "show analytics-service details",
            new ChatbotContext("TrainTicket", "ir-1", "idx-1", "run-1", "commit-1", null, null, null),
            "conv-int-unknown",
            List.of()
        );
        ChatbotResponse response = service.query(request, "req-int-unknown");

        assertThat(response.getFlags()).contains(ChatbotFlag.insufficient_evidence);
        assertThat(response.getAnswer()).containsIgnoringCase("insufficient evidence");
        assertThat(response.getAnswer()).doesNotContain("analytics-service exposes");
    }

    @Test
    void uncitedOrInvalidModelCitationOutputIsDowngradedByGuardrails() {
        ChatbotQueryService service = serviceWithEvidence(fixtures(), 20, 12000, false);

        ChatbotResponse response = service.query(request("Give architecture issue summary with invalid citations"), "req-int-guardrail");

        assertThat(response.getFlags()).contains(ChatbotFlag.citation_validation_failed);
        assertThat(response.getAnswer()).contains("[citation_removed]");
        assertThat(response.getConfidence()).isEqualTo(ChatbotConfidence.LOW);
    }

    @Test
    void oversizedContextSetsTruncationFlag() {
        List<EvidenceItem> oversized = new ArrayList<>(fixtures());
        for (int i = 0; i < 25; i++) {
            EvidenceItem item = new EvidenceItem();
            item.setArtifactType(EvidenceArtifactType.ARCHITECTURE);
            item.setArtifactId("E-ARCH-" + i);
            item.setServiceName("order-service");
            item.setEntityName("order-service");
            item.setLocationHint("microservices[0].controllers[" + i + "]");
            item.setContentText("Architecture detail " + i + " for order-service topology and boundaries.");
            oversized.add(item);
        }
        ChatbotQueryService service = serviceWithEvidence(oversized, 5, 900, false);

        ChatbotResponse response = service.query(request("Explain architecture topology"), "req-int-trunc");

        assertThat(response.getFlags()).contains(ChatbotFlag.truncated_context);
        assertThat(response.getTraceMetadata()).containsKey("contextBudget");
        assertThat(response.getConfidence()).isNotNull();
    }

    private ChatbotQueryService serviceWithEvidence(List<EvidenceItem> evidence, int maxItems, int maxChars, boolean strictMode) {
        ChatbotConfig config = chatbotConfig(maxItems, maxChars, strictMode);
        ChatContextService chatContextService = ChatContextService.forProviders(List.of(new FixedEvidenceProvider(evidence)));
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

    private ChatbotQueryRequest request(String question) {
        return new ChatbotQueryRequest(
            question,
            new ChatbotContext("TrainTicket", "ir-1", "idx-1", "run-1", "commit-1", "order-service", "/orders", null),
            "conv-int-1",
            List.of()
        );
    }

    private List<EvidenceItem> fixtures() {
        EvidenceItem irService = new EvidenceItem();
        irService.setArtifactType(EvidenceArtifactType.IR);
        irService.setArtifactId("E-IR-1");
        irService.setArtifactVersion("ir-1");
        irService.setServiceName("order-service");
        irService.setEntityName("order-service");
        irService.setLocationHint("microservices[0].name");
        irService.setContentText("Microservice discovered in IR topology: order-service");

        EvidenceItem endpoint = new EvidenceItem();
        endpoint.setArtifactType(EvidenceArtifactType.ENDPOINT);
        endpoint.setArtifactId("E-EP-1");
        endpoint.setServiceName("order-service");
        endpoint.setEntityName("OrderController");
        endpoint.setEndpointPath("/orders");
        endpoint.setHttpMethod("POST");
        endpoint.setLocationHint("microservices[0].controllers[0].methods[0].url");
        endpoint.setContentText("Endpoint discovered: POST /orders");

        EvidenceItem graphDependency = new EvidenceItem();
        graphDependency.setArtifactType(EvidenceArtifactType.DEPENDENCY);
        graphDependency.setArtifactId("E-GR-1");
        graphDependency.setServiceName("order-service");
        graphDependency.setEntityName("order-service -> payment-service");
        graphDependency.setEndpointPath("payment-service");
        graphDependency.setLocationHint("links[order-service->payment-service]");
        graphDependency.setContentText("Explicit graph dependency: order-service -> payment-service");
        graphDependency.setStructuredPayload(
            JsonNodeFactory.instance.objectNode()
                .put("source", "order-service")
                .put("target", "payment-service")
                .put("explicit", true)
        );

        return List.of(irService, endpoint, graphDependency);
    }

    private ChatbotConfig chatbotConfig(int maxItems, int maxChars, boolean strictMode) {
        ChatbotConfig config = new ChatbotConfig();
        config.setProvider(ChatbotConfig.Provider.OLLAMA);
        config.setModel("llama3.2");
        config.setBaseUrl("http://ollama:11434");
        config.setTimeoutMs(30000);
        config.setMaxTokens(1024);
        config.setTemperature(0.2);
        config.setContextBudgetMaxEvidenceItems(maxItems);
        config.setContextBudgetMaxEvidenceChars(maxChars);
        config.setStrictEvidenceOnly(strictMode);
        return config;
    }

    private static final class FixedEvidenceProvider implements EvidenceContextProvider {
        private final List<EvidenceItem> evidence;

        private FixedEvidenceProvider(List<EvidenceItem> evidence) {
            this.evidence = evidence;
        }

        @Override
        public String providerId() {
            return "fixed-fixture-provider";
        }

        @Override
        public boolean supports(EvidenceQueryContext context, String question) {
            return true;
        }

        @Override
        public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
            EvidenceRetrievalResult result = new EvidenceRetrievalResult();
            result.setEvidenceItems(evidence);
            return result;
        }
    }

    private static final class FakeLocalLlmClient implements LocalLlmClient {
        @Override
        public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig cfg) {
            String question = prompt == null || prompt.getUserQuestion() == null ? "" : prompt.getUserQuestion();
            if (question.toLowerCase().contains("invalid citations")) {
                return new LocalLlmResult(
                    "Answer: There is an architecture issue [E-INVALID].\nQualification: medium confidence.",
                    cfg.getModel(),
                    cfg.getProvider().name(),
                    200,
                    "stop"
                );
            }
            return new LocalLlmResult(
                "Answer: Based on evidence, order-service topology and dependencies are identified [E-IR-1] [E-GR-1].\nQualification: medium confidence.",
                cfg.getModel(),
                cfg.getProvider().name(),
                200,
                "stop"
            );
        }
    }
}
