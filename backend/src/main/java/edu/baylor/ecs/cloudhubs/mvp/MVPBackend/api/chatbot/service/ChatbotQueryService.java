package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptAssemblyResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptAssemblyService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptEvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.ContextBudgetResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.ContextBudgeter;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.QuestionIntent;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmClient;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmFailureCode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config.ChatbotConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ChatbotQueryService {
    private static final Logger log = LoggerFactory.getLogger(ChatbotQueryService.class);

    private final ChatbotConfig chatbotConfig;
    private final ChatContextService chatContextService;
    private final EvidenceGuardrailService evidenceGuardrailService;
    private final PromptAssemblyService promptAssemblyService;
    private final ContextBudgeter contextBudgeter;
    private final LocalLlmClient localLlmClient;

    public ChatbotQueryService(
        ChatbotConfig chatbotConfig,
        ChatContextService chatContextService,
        EvidenceGuardrailService evidenceGuardrailService,
        PromptAssemblyService promptAssemblyService,
        ContextBudgeter contextBudgeter,
        LocalLlmClient localLlmClient
    ) {
        this.chatbotConfig = chatbotConfig;
        this.chatContextService = chatContextService;
        this.evidenceGuardrailService = evidenceGuardrailService;
        this.promptAssemblyService = promptAssemblyService;
        this.contextBudgeter = contextBudgeter;
        this.localLlmClient = localLlmClient;
    }

    public ChatbotResponse query(ChatbotQueryRequest request) {
        return query(request, generateRequestId());
    }

    public ChatbotResponse query(ChatbotQueryRequest request, String requestId) {
        long startMs = System.currentTimeMillis();
        ChatbotResponse response = baseResponse(requestId);
        log.info(
            "chatbot.query.received requestId={} provider={} model={}",
            requestId,
            chatbotConfig.getProvider().name(),
            chatbotConfig.getModel()
        );

        List<EvidenceItem> rawEvidenceItems = chatContextService.collectEvidence(request);
        ContextBudgetResult budgetResult = contextBudgeter.budget(
            rawEvidenceItems,
            extractMatchedEntities(request),
            intentFromQuestion(request == null ? null : request.getQuestion()),
            chatbotConfig.getContextBudgetMaxEvidenceItems(),
            chatbotConfig.getContextBudgetMaxEvidenceChars()
        );
        List<EvidenceItem> evidenceItems = budgetResult.getRetainedEvidence();
        response.setTraceMetadata(Map.of(
            "contextBudget", Map.of(
                "originalEvidenceCount", budgetResult.getOriginalEvidenceCount(),
                "retainedEvidenceCount", budgetResult.getRetainedEvidenceCount(),
                "truncated", budgetResult.isTruncated(),
                "omittedArtifactTypeCounts", budgetResult.getOmittedArtifactTypeCounts(),
                "maxEvidenceItems", budgetResult.getMaxEvidenceItems(),
                "maxEvidenceChars", budgetResult.getMaxEvidenceChars()
            )
        ));
        if (budgetResult.isTruncated()) {
            addFlagIfMissing(response, ChatbotFlag.partial);
        }
        int contextFields = countContextFields(request.getContext());
        log.info(
            "chatbot.query.context requestId={} contextFieldCount={} evidenceCount={}",
            requestId,
            contextFields,
            evidenceItems == null ? 0 : evidenceItems.size()
        );
        response = evidenceGuardrailService.enforce(request.getQuestion(), evidenceItems, response);
        log.info(
            "chatbot.query.guardrail requestId={} flags={}",
            requestId,
            response.getFlags()
        );

        if (response.getFlags() != null && response.getFlags().contains(ChatbotFlag.insufficient_evidence)) {
            response.setConfidence(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
            long latencyMs = System.currentTimeMillis() - startMs;
            response.setProcessingTimeMs(latencyMs);
            log.info(
                "chatbot.query.completed requestId={} provider={} model={} latencyMs={} flags={}",
                requestId,
                response.getProvider(),
                response.getModel(),
                latencyMs,
                response.getFlags()
            );
            return response;
        }

        PromptAssemblyResult assembled = promptAssemblyService.assemble(
            request.getQuestion(),
            request.getContext(),
            toPromptEvidence(evidenceItems),
            request.getMessages()
        );

        try {
            log.info(
                "chatbot.query.provider_invoked requestId={} provider={} model={}",
                requestId,
                chatbotConfig.getProvider().name(),
                chatbotConfig.getModel()
            );
            LocalLlmResult llmResult = localLlmClient.generate(assembled.toChatbotPrompt(), chatbotConfig);
            response.setAnswer(llmResult.getText());
            response.setModel(llmResult.getModel() == null || llmResult.getModel().isBlank() ? chatbotConfig.getModel() : llmResult.getModel());
            response.setProvider(llmResult.getProvider() == null || llmResult.getProvider().isBlank() ? chatbotConfig.getProvider().name() : llmResult.getProvider());
            response.setConfidence(ChatbotConfidence.MEDIUM);
            response = evidenceGuardrailService.enforce(request.getQuestion(), evidenceItems, response);
            normalizeEvidenceQualification(response);
            long latencyMs = System.currentTimeMillis() - startMs;
            response.setProcessingTimeMs(latencyMs);
            log.info(
                "chatbot.query.provider_success requestId={} provider={} model={} latencyMs={} flags={}",
                requestId,
                response.getProvider(),
                response.getModel(),
                latencyMs,
                response.getFlags()
            );
            log.info(
                "chatbot.query.completed requestId={} provider={} model={} latencyMs={} flags={}",
                requestId,
                response.getProvider(),
                response.getModel(),
                latencyMs,
                response.getFlags()
            );
            return response;
        } catch (LocalLlmException ex) {
            long latencyMs = System.currentTimeMillis() - startMs;
            log.warn(
                "chatbot.query.provider_failure requestId={} provider={} model={} latencyMs={} errorClass={} failureCode={}",
                requestId,
                chatbotConfig.getProvider().name(),
                chatbotConfig.getModel(),
                latencyMs,
                ex.getClass().getSimpleName(),
                ex.getCode()
            );
            throw ex;
        } catch (RuntimeException ex) {
            long latencyMs = System.currentTimeMillis() - startMs;
            log.warn(
                "chatbot.query.provider_failure requestId={} provider={} model={} latencyMs={} errorClass={} failureCode={}",
                requestId,
                chatbotConfig.getProvider().name(),
                chatbotConfig.getModel(),
                latencyMs,
                ex.getClass().getSimpleName(),
                LocalLlmFailureCode.provider_error
            );
            throw ex;
        }
    }

    public ChatbotResponse unavailableResponse(ChatbotQueryRequest request, LocalLlmException ex, String requestId) {
        ChatbotResponse response = baseResponse(requestId);
        response.setAnswer("Local model runtime is unavailable. " + ex.getMessage());
        response.setConfidence(ChatbotConfidence.LOW);
        response.setFlags(List.of(ChatbotFlag.model_unavailable));
        response.setCitations(List.of());
        return response;
    }

    public String generateRequestId() {
        return "req-" + UUID.randomUUID();
    }

    private ChatbotResponse baseResponse(String requestId) {
        ChatbotResponse response = new ChatbotResponse();
        response.setRequestId(requestId);
        response.setModel(chatbotConfig.getModel());
        response.setProvider(chatbotConfig.getProvider().name());
        response.setCitations(List.of());
        response.setFlags(List.of());
        return response;
    }

    private List<PromptEvidenceItem> toPromptEvidence(List<EvidenceItem> evidenceItems) {
        if (evidenceItems == null || evidenceItems.isEmpty()) {
            return List.of();
        }
        return evidenceItems.stream()
            .map(item -> new PromptEvidenceItem(
                item.getArtifactId(),
                item.getArtifactTypeValue(),
                item.getArtifactName(),
                item.getLocationHint(),
                item.getContent()
            ))
            .toList();
    }

    private int countContextFields(ChatbotContext context) {
        if (context == null) {
            return 0;
        }
        int count = 0;
        if (hasValue(context.getSystemName())) count++;
        if (hasValue(context.getIrId())) count++;
        if (hasValue(context.getIndexId())) count++;
        if (hasValue(context.getRunId())) count++;
        if (hasValue(context.getCommitId())) count++;
        if (hasValue(context.getSelectedService())) count++;
        if (hasValue(context.getSelectedEndpoint())) count++;
        return count;
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }

    private void normalizeEvidenceQualification(ChatbotResponse response) {
        if (response == null) {
            return;
        }
        boolean mentionsInsufficientEvidence = response.getAnswer() != null
            && response.getAnswer().toLowerCase().contains("insufficient evidence");
        boolean hasNoCitations = response.getCitations() == null || response.getCitations().isEmpty();
        if (mentionsInsufficientEvidence && hasNoCitations) {
            if (response.getFlags() == null || !response.getFlags().contains(ChatbotFlag.insufficient_evidence)) {
                List<ChatbotFlag> updatedFlags = response.getFlags() == null ? List.of() : response.getFlags();
                List<ChatbotFlag> merged = new java.util.ArrayList<>(updatedFlags);
                merged.add(ChatbotFlag.insufficient_evidence);
                response.setFlags(merged);
            }
            response.setConfidence(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
        }
    }

    private void addFlagIfMissing(ChatbotResponse response, ChatbotFlag flag) {
        List<ChatbotFlag> flags = response.getFlags() == null ? new java.util.ArrayList<>() : new java.util.ArrayList<>(response.getFlags());
        if (!flags.contains(flag)) {
            flags.add(flag);
            response.setFlags(flags);
        }
    }

    private List<String> extractMatchedEntities(ChatbotQueryRequest request) {
        if (request == null || request.getContext() == null) {
            return List.of();
        }
        List<String> entities = new java.util.ArrayList<>();
        if (hasValue(request.getContext().getSelectedService())) {
            entities.add(request.getContext().getSelectedService().trim());
        }
        if (hasValue(request.getContext().getSelectedEndpoint())) {
            entities.add(request.getContext().getSelectedEndpoint().trim());
        }
        return entities;
    }

    private QuestionIntent intentFromQuestion(String question) {
        String q = question == null ? "" : question.toLowerCase();
        if (q.contains("depends on") || q.contains("what depends") || q.contains("transitive") || q.contains("call")) {
            return QuestionIntent.DEPENDENCY;
        }
        if (q.contains("endpoint") || q.contains("url") || q.contains("route")) {
            return QuestionIntent.ENDPOINT_LOOKUP;
        }
        if (q.contains("service")) {
            return QuestionIntent.SERVICE_LOOKUP;
        }
        if (q.contains("architecture") || q.contains("topology") || q.contains("system") || q.contains("component")) {
            return QuestionIntent.ARCHITECTURE_TOPOLOGY;
        }
        return QuestionIntent.UNSUPPORTED_SPECULATIVE;
    }
}
