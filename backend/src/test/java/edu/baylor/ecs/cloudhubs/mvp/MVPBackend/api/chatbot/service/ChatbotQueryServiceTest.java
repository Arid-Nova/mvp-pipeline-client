package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

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
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.ContextBudgeter;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.HybridRetriever;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmClient;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmFailureCode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config.ChatbotConfig;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatbotQueryServiceTest {

    @Test
    void evidenceSupportedQueryCallsModelWithEvidencePrompt() {
        ChatbotConfig config = chatbotConfig();
        ChatContextService chatContextService = ChatContextService.forProviders(List.of(new CapturingEvidenceProvider()));
        EvidenceGuardrailService guardrailService = new EvidenceGuardrailService();
        PromptAssemblyService promptAssemblyService = new PromptAssemblyService();
        AtomicBoolean modelCalled = new AtomicBoolean(false);
        AtomicReference<ChatbotPrompt> promptRef = new AtomicReference<>();
        LocalLlmClient localLlmClient = new LocalLlmClient() {
            @Override
            public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig cfg) {
                modelCalled.set(true);
                promptRef.set(prompt);
                return new LocalLlmResult("Answer: order-service exposes endpoint [E1].\nQualification: medium confidence.", cfg.getModel(), cfg.getProvider().name(), 200, "stop");
            }
        };

        ChatbotQueryService service = new ChatbotQueryService(
            config,
            chatContextService,
            guardrailService,
            promptAssemblyService,
            new HybridRetriever(),
            new ContextBudgeter(),
            localLlmClient
        );

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What endpoint does order-service expose?",
            new ChatbotContext("TrainTicket", "ir-1", null, null, "commit-1", "order-service", "/orders", null),
            "conv-1",
            List.of()
        );

        ChatbotResponse response = service.query(request, "req-evidence-1");

        assertThat(modelCalled.get()).isTrue();
        assertThat(promptRef.get()).isNotNull();
        assertThat(promptRef.get().getSystemInstruction()).contains("EvidenceCount: 1");
        assertThat(response.getCitations()).hasSize(1);
        assertThat(response.getTraceMetadata()).containsKey("retrieval");
        assertThat(((Map<?, ?>) response.getTraceMetadata().get("retrieval")).get("strategy")).isEqualTo("STRUCTURED");
    }

    @Test
    void unsupportedArchitectureQueryReturnsInsufficientEvidence() {
        ChatbotConfig config = chatbotConfig();
        ChatContextService chatContextService = ChatContextService.forProviders(List.of());
        EvidenceGuardrailService guardrailService = new EvidenceGuardrailService();
        PromptAssemblyService promptAssemblyService = new PromptAssemblyService();
        AtomicBoolean modelCalled = new AtomicBoolean(false);
        LocalLlmClient localLlmClient = new LocalLlmClient() {
            @Override
            public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig cfg) {
                modelCalled.set(true);
                return new LocalLlmResult("should-not-run", cfg.getModel(), cfg.getProvider().name(), 200, "stop");
            }
        };

        ChatbotQueryService service = new ChatbotQueryService(
            config,
            chatContextService,
            guardrailService,
            promptAssemblyService,
            new HybridRetriever(),
            new ContextBudgeter(),
            localLlmClient
        );

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What architecture risks exist?",
            new ChatbotContext("TrainTicket", "ir-1", null, null, null, null, null, null),
            "conv-2",
            List.of()
        );

        ChatbotResponse response = service.query(request, "req-arch-1");

        assertThat(modelCalled.get()).isFalse();
        assertThat(response.getFlags()).contains(ChatbotFlag.insufficient_evidence);
        assertThat(response.getConfidence()).isEqualTo(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
    }

    @Test
    void modelUnavailableFlowRaisesTypedException() {
        ChatbotConfig config = chatbotConfig();
        ChatContextService chatContextService = ChatContextService.forProviders(List.of(new ContextMetadataEvidenceContextProvider()));
        EvidenceGuardrailService guardrailService = new EvidenceGuardrailService();
        PromptAssemblyService promptAssemblyService = new PromptAssemblyService();
        LocalLlmClient localLlmClient = new LocalLlmClient() {
            @Override
            public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig cfg) {
                throw new LocalLlmException(LocalLlmFailureCode.model_unavailable, "runtime down");
            }
        };

        ChatbotQueryService service = new ChatbotQueryService(
            config,
            chatContextService,
            guardrailService,
            promptAssemblyService,
            new HybridRetriever(),
            new ContextBudgeter(),
            localLlmClient
        );

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What changed in service order-service?",
            new ChatbotContext("TrainTicket", "ir-1", null, null, null, "order-service", null, null),
            null,
            List.of()
        );

        assertThatThrownBy(() -> service.query(request))
            .isInstanceOf(LocalLlmException.class)
            .satisfies(ex -> assertThat(((LocalLlmException) ex).getCode()).isEqualTo(LocalLlmFailureCode.model_unavailable));
    }

    @Test
    void activeContextIsPassedIntoRetrieval() {
        ChatbotConfig config = chatbotConfig();
        CapturingEvidenceProvider provider = new CapturingEvidenceProvider();
        ChatContextService chatContextService = ChatContextService.forProviders(List.of(provider));
        EvidenceGuardrailService guardrailService = new EvidenceGuardrailService();
        PromptAssemblyService promptAssemblyService = new PromptAssemblyService();
        LocalLlmClient localLlmClient = new LocalLlmClient() {
            @Override
            public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig cfg) {
                return new LocalLlmResult("Answer: ok.\nQualification: medium.", cfg.getModel(), cfg.getProvider().name(), 200, "stop");
            }
        };

        ChatbotQueryService service = new ChatbotQueryService(
            config,
            chatContextService,
            guardrailService,
            promptAssemblyService,
            new HybridRetriever(),
            new ContextBudgeter(),
            localLlmClient
        );

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What endpoint does order-service expose?",
            new ChatbotContext("TrainTicket", "ir-123", "idx-1", "run-3", "commit-9", "order-service", "/orders", null),
            "conv-ctx-1",
            List.of()
        );

        ChatbotResponse response = service.query(request, "req-ctx-1");

        assertThat(provider.lastContext).isNotNull();
        assertThat(provider.lastContext.getScope().getSystemName()).isEqualTo("TrainTicket");
        assertThat(provider.lastContext.getScope().getIrId()).isEqualTo("ir-123");
        assertThat(provider.lastContext.getScope().getSessionId()).isEqualTo("conv-ctx-1");
        assertThat(((Map<?, ?>) response.getTraceMetadata().get("retrieval")).get("matchedEntities").toString()).contains("order-service");
    }

    @Test
    void usesProvidedRequestIdInResponse() {
        ChatbotConfig config = chatbotConfig();
        ChatContextService chatContextService = ChatContextService.forProviders(List.of(new ContextMetadataEvidenceContextProvider()));
        EvidenceGuardrailService guardrailService = new EvidenceGuardrailService();
        PromptAssemblyService promptAssemblyService = new PromptAssemblyService();
        LocalLlmClient localLlmClient = new LocalLlmClient() {
            @Override
            public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig cfg) {
                return new LocalLlmResult("answer", cfg.getModel(), cfg.getProvider().name(), 200, "stop");
            }
        };

        ChatbotQueryService service = new ChatbotQueryService(
            config,
            chatContextService,
            guardrailService,
            promptAssemblyService,
            new HybridRetriever(),
            new ContextBudgeter(),
            localLlmClient
        );

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What changed in service order-service?",
            new ChatbotContext("TrainTicket", "ir-1", null, null, null, "order-service", null, null),
            null,
            List.of()
        );

        ChatbotResponse response = service.query(request, "req-fixed-1");
        assertThat(response.getRequestId()).isEqualTo("req-fixed-1");
        assertThat(response.getTraceMetadata().get("requestId")).isEqualTo("req-fixed-1");
        assertThat(response.getTraceMetadata()).containsKey("citationsCount");
    }

    private ChatbotConfig chatbotConfig() {
        ChatbotConfig config = new ChatbotConfig();
        config.setProvider(ChatbotConfig.Provider.OLLAMA);
        config.setModel("llama3.2");
        config.setBaseUrl("http://ollama:11434");
        config.setTimeoutMs(30000);
        config.setMaxTokens(1024);
        config.setTemperature(0.2);
        config.setContextBudgetMaxEvidenceItems(20);
        config.setContextBudgetMaxEvidenceChars(12000);
        return config;
    }

    private static final class CapturingEvidenceProvider implements EvidenceContextProvider {
        private EvidenceQueryContext lastContext;

        @Override
        public String providerId() {
            return "capturing";
        }

        @Override
        public boolean supports(EvidenceQueryContext context, String question) {
            return true;
        }

        @Override
        public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
            this.lastContext = context;
            EvidenceItem item = new EvidenceItem();
            item.setArtifactType(EvidenceArtifactType.ENDPOINT);
            item.setArtifactId("E1");
            item.setEntityName("order-service");
            item.setServiceName("order-service");
            item.setEndpointPath("/orders");
            item.setHttpMethod("GET");
            item.setLocationHint("controllers[0].methods[0].url");
            item.setContentText("order-service controller exposes GET /orders");

            EvidenceRetrievalResult result = new EvidenceRetrievalResult();
            result.setEvidenceItems(List.of(item));
            return result;
        }
    }
}
