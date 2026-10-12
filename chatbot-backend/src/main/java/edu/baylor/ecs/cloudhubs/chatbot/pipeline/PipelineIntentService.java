package edu.baylor.ecs.cloudhubs.chatbot.pipeline;

import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentOutcome;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentRequest;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentResponse;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.LocalLlmClient;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.UUID;

/**
 * Pipeline intent selection (Issue #60, P60-M1-005):
 * request → catalog-driven prompt → local model (JSON mode, intent settings) → tolerant extraction
 * → untrusted options. The model only chooses analysis capabilities; graph composition and all
 * semantic validation happen in the frontend. Goal text, prompts and model output are never logged.
 */
@Service
public class PipelineIntentService {
    private static final Logger log = LoggerFactory.getLogger(PipelineIntentService.class);

    private final ChatbotConfig chatbotConfig;
    private final LocalLlmClient localLlmClient;
    private final PipelineIntentPromptBuilder promptBuilder;
    private final PipelineIntentJsonExtractor extractor;

    public PipelineIntentService(
        ChatbotConfig chatbotConfig,
        LocalLlmClient localLlmClient,
        PipelineIntentPromptBuilder promptBuilder,
        PipelineIntentJsonExtractor extractor
    ) {
        this.chatbotConfig = chatbotConfig;
        this.localLlmClient = localLlmClient;
        this.promptBuilder = promptBuilder;
        this.extractor = extractor;
    }

    public String generateRequestId() {
        return UUID.randomUUID().toString();
    }

    /** Throws {@link LocalLlmException} when the runtime is unavailable or times out. */
    public PipelineIntentResponse selectIntents(PipelineIntentRequest request, String requestId) {
        long start = System.currentTimeMillis();
        ChatbotConfig runtimeConfig = intentRuntimeConfig(chatbotConfig);
        ChatbotPrompt prompt = promptBuilder.build(request, chatbotConfig.getPipelineIntent().getContextTokens());
        int promptChars = prompt.getSystemInstruction().length() + prompt.getUserQuestion().length();

        LocalLlmResult result = localLlmClient.generate(prompt, runtimeConfig);
        PipelineIntentJsonExtractor.Extraction extraction = extractor.extract(result.getText());

        PipelineIntentResponse response = baseResponse(request, requestId);
        response.setOutcome(extraction.outcome());
        response.setOptions(new ArrayList<>(extraction.options()));
        response.setParseErrors(new ArrayList<>(extraction.parseErrors()));
        response.setUnsupportedReason(extraction.unsupportedReason());
        if (result.getModel() != null && !result.getModel().isBlank()) {
            response.setModel(result.getModel());
        }
        if (result.getProvider() != null && !result.getProvider().isBlank()) {
            response.setProvider(result.getProvider());
        }
        response.setProcessingTimeMs(System.currentTimeMillis() - start);
        log.info(
            "chatbot.pipeline_intent.completed requestId={} suggestionSetId={} attempt={} outcome={} options={} "
                + "parseErrors={} latencyMs={} model={} provider={} promptChars={} finishReason={}",
            requestId,
            request.getSuggestionSetId(),
            request.getAttempt(),
            response.getOutcome(),
            response.getOptions().size(),
            response.getParseErrors().size(),
            response.getProcessingTimeMs(),
            response.getModel(),
            response.getProvider(),
            promptChars,
            result.getFinishReason()
        );
        return response;
    }

    public PipelineIntentResponse unavailableResponse(PipelineIntentRequest request, String requestId, long latencyMs) {
        PipelineIntentResponse response = baseResponse(request, requestId);
        response.setOutcome(PipelineIntentOutcome.MODEL_UNAVAILABLE);
        response.setProcessingTimeMs(latencyMs);
        return response;
    }

    private PipelineIntentResponse baseResponse(PipelineIntentRequest request, String requestId) {
        PipelineIntentResponse response = new PipelineIntentResponse();
        response.setRequestId(requestId);
        response.setSuggestionSetId(request.getSuggestionSetId());
        response.setCatalogVersion(request.getCatalogVersion());
        response.setModel(chatbotConfig.getModel());
        response.setProvider(chatbotConfig.getProvider() == null ? null : chatbotConfig.getProvider().name());
        return response;
    }

    /** The shared runtime settings with the intent-selection overrides; Q&A settings are untouched. */
    static ChatbotConfig intentRuntimeConfig(ChatbotConfig base) {
        ChatbotConfig.PipelineIntent intent = base.getPipelineIntent();
        ChatbotConfig config = new ChatbotConfig();
        config.setProvider(base.getProvider());
        config.setModel(base.getModel());
        config.setBaseUrl(base.getBaseUrl());
        config.setBackendBaseUrl(base.getBackendBaseUrl());
        config.setContextBudgetMaxEvidenceItems(base.getContextBudgetMaxEvidenceItems());
        config.setContextBudgetMaxEvidenceChars(base.getContextBudgetMaxEvidenceChars());
        config.setStrictEvidenceOnly(base.isStrictEvidenceOnly());
        config.setPipelineIntent(intent);
        config.setTimeoutMs(intent.getTimeoutMs());
        config.setMaxTokens(intent.getMaxTokens());
        config.setTemperature(intent.getTemperature());
        return config;
    }
}
