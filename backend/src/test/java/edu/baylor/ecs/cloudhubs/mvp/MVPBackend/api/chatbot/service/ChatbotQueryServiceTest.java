package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptAssemblyService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmClient;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmFailureCode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config.ChatbotConfig;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatbotQueryServiceTest {

    @Test
    void insufficientEvidenceSkipsModelCall() {
        ChatbotConfig config = chatbotConfig();
        ChatContextService chatContextService = new ChatContextService(List.of(new ContextMetadataEvidenceContextProvider()));
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
            config, chatContextService, guardrailService, promptAssemblyService, localLlmClient
        );

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What architecture risks exist?",
            null,
            null,
            null
        );

        ChatbotResponse response = service.query(request);
        assertThat(modelCalled.get()).isFalse();
        assertThat(response.getFlags()).contains(ChatbotFlag.insufficient_evidence);
        assertThat(response.getConfidence()).isEqualTo(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
        assertThat(response.getAnswer().toLowerCase()).contains("insufficient evidence");
    }

    @Test
    void modelUnavailableFlowRaisesTypedException() {
        ChatbotConfig config = chatbotConfig();
        ChatContextService chatContextService = new ChatContextService(List.of(new ContextMetadataEvidenceContextProvider()));
        EvidenceGuardrailService guardrailService = new EvidenceGuardrailService();
        PromptAssemblyService promptAssemblyService = new PromptAssemblyService();
        LocalLlmClient localLlmClient = new LocalLlmClient() {
            @Override
            public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig cfg) {
                throw new LocalLlmException(LocalLlmFailureCode.model_unavailable, "runtime down");
            }
        };

        ChatbotQueryService service = new ChatbotQueryService(
            config, chatContextService, guardrailService, promptAssemblyService, localLlmClient
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
    void usesProvidedRequestIdInResponse() {
        ChatbotConfig config = chatbotConfig();
        ChatContextService chatContextService = new ChatContextService(List.of(new ContextMetadataEvidenceContextProvider()));
        EvidenceGuardrailService guardrailService = new EvidenceGuardrailService();
        PromptAssemblyService promptAssemblyService = new PromptAssemblyService();
        LocalLlmClient localLlmClient = new LocalLlmClient() {
            @Override
            public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig cfg) {
                return new LocalLlmResult("answer", cfg.getModel(), cfg.getProvider().name(), 200, "stop");
            }
        };

        ChatbotQueryService service = new ChatbotQueryService(
            config, chatContextService, guardrailService, promptAssemblyService, localLlmClient
        );

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What changed in service order-service?",
            new ChatbotContext("TrainTicket", "ir-1", null, null, null, "order-service", null, null),
            null,
            List.of()
        );

        ChatbotResponse response = service.query(request, "req-fixed-1");
        assertThat(response.getRequestId()).isEqualTo("req-fixed-1");
    }

    @Test
    void marksInsufficientEvidenceWhenModelReturnsInsufficientEvidenceAnswer() {
        ChatbotConfig config = chatbotConfig();
        ChatContextService chatContextService = new ChatContextService(List.of(new ContextMetadataEvidenceContextProvider()));
        EvidenceGuardrailService guardrailService = new EvidenceGuardrailService();
        PromptAssemblyService promptAssemblyService = new PromptAssemblyService();
        LocalLlmClient localLlmClient = new LocalLlmClient() {
            @Override
            public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig cfg) {
                return new LocalLlmResult(
                    "Answer: Insufficient evidence.\nQualification: No evidence available.",
                    cfg.getModel(),
                    cfg.getProvider().name(),
                    200,
                    "stop"
                );
            }
        };

        ChatbotQueryService service = new ChatbotQueryService(
            config, chatContextService, guardrailService, promptAssemblyService, localLlmClient
        );

        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What system context is currently selected?",
            new ChatbotContext("TrainTicket", "ir-1", null, null, null, "order-service", null, null),
            null,
            List.of()
        );

        ChatbotResponse response = service.query(request, "req-insufficient-1");
        assertThat(response.getFlags()).contains(ChatbotFlag.insufficient_evidence);
        assertThat(response.getConfidence()).isEqualTo(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
    }

    private ChatbotConfig chatbotConfig() {
        ChatbotConfig config = new ChatbotConfig();
        config.setProvider(ChatbotConfig.Provider.OLLAMA);
        config.setModel("llama3.2");
        config.setBaseUrl("http://ollama:11434");
        config.setTimeoutMs(30000);
        config.setMaxTokens(1024);
        config.setTemperature(0.2);
        return config;
    }
}
