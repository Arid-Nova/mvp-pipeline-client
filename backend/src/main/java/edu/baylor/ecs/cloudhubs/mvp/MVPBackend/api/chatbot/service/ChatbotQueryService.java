package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptAssemblyResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptAssemblyService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptEvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptAssemblyMetadata;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.ContextBudgetResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.ContextBudgeter;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.HybridRetrievalResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.HybridRetriever;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.QuestionIntent;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.quality.ConfidenceAssessment;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.quality.ConfidenceService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmClient;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmFailureCode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config.ChatbotConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
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
    private final HybridRetriever hybridRetriever;
    private final ContextBudgeter contextBudgeter;
    private final ConfidenceService confidenceService;
    private final LocalLlmClient localLlmClient;

    public ChatbotQueryService(
        ChatbotConfig chatbotConfig,
        ChatContextService chatContextService,
        EvidenceGuardrailService evidenceGuardrailService,
        PromptAssemblyService promptAssemblyService,
        HybridRetriever hybridRetriever,
        ContextBudgeter contextBudgeter,
        ConfidenceService confidenceService,
        LocalLlmClient localLlmClient
    ) {
        this.chatbotConfig = chatbotConfig;
        this.chatContextService = chatContextService;
        this.evidenceGuardrailService = evidenceGuardrailService;
        this.promptAssemblyService = promptAssemblyService;
        this.hybridRetriever = hybridRetriever;
        this.contextBudgeter = contextBudgeter;
        this.confidenceService = confidenceService;
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

        var retrievalSeed = chatContextService.retrieveEvidence(request);
        var queryContext = chatContextService.toQueryContext(request);
        HybridRetrievalResult retrieval = hybridRetriever.retrieve(
            request == null ? null : request.getQuestion(),
            queryContext,
            retrievalSeed.getEvidenceItems(),
            retrievalSeed.getMissingEvidence()
        );

        ContextBudgetResult budgetResult = contextBudgeter.budget(
            retrieval.getRankedEvidence(),
            retrieval.getMatchedEntities(),
            retrieval.getIntent(),
            chatbotConfig.getContextBudgetMaxEvidenceItems(),
            chatbotConfig.getContextBudgetMaxEvidenceChars()
        );
        List<EvidenceItem> evidenceItems = budgetResult.getRetainedEvidence();
        response.setCitations(EvidenceCitationMapper.toCitations(evidenceItems));
        response.setTraceMetadata(buildTraceMetadata(requestId, retrieval, budgetResult, response.getCitations().size()));
        if (budgetResult.isTruncated()) {
            addFlagIfMissing(response, ChatbotFlag.partial);
            addFlagIfMissing(response, ChatbotFlag.truncated_context);
        }

        int contextFields = countContextFields(request.getContext());
        log.info(
            "chatbot.query.context requestId={} contextFieldCount={} evidenceCount={}",
            requestId,
            contextFields,
            evidenceItems == null ? 0 : evidenceItems.size()
        );
        response = evidenceGuardrailService.enforcePreGeneration(
            request.getQuestion(),
            retrieval.getIntent(),
            evidenceItems,
            retrieval.getMissingEvidence(),
            response,
            chatbotConfig.isStrictEvidenceOnly()
        );
        log.info(
            "chatbot.query.guardrail requestId={} flags={}",
            requestId,
            response.getFlags()
        );
        applyEvidenceDerivedConfidence(response, retrieval, evidenceItems);

        if (response.getFlags() != null && response.getFlags().contains(ChatbotFlag.insufficient_evidence)) {
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
            request.getMessages(),
            new PromptAssemblyMetadata(
                budgetResult.isTruncated(),
                response.getFlags() != null && response.getFlags().contains(ChatbotFlag.stale_context)
            )
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
            response = evidenceGuardrailService.enforcePostGeneration(
                request.getQuestion(),
                retrieval.getIntent(),
                evidenceItems,
                response,
                chatbotConfig.isStrictEvidenceOnly()
            );
            applyEvidenceDerivedConfidence(response, retrieval, evidenceItems);
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
        response.setConfidenceRationale("Model provider is unavailable for this request.");
        response.setConfidenceReasons(List.of("provider_unavailable"));
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
                item.getArtifactId(),
                item.getArtifactVersion(),
                item.getLocationHint(),
                item.getEntityName(),
                item.getServiceName(),
                item.getEndpointPath(),
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

    private void applyEvidenceDerivedConfidence(ChatbotResponse response, HybridRetrievalResult retrieval, List<EvidenceItem> evidenceItems) {
        ConfidenceAssessment assessment = confidenceService.assess(
            retrieval.getIntent(),
            evidenceItems,
            response.getCitations(),
            response.getFlags(),
            retrieval.getMatchedEntities(),
            retrieval.getMissingEvidence()
        );
        response.setConfidence(assessment.getConfidence());
        response.setConfidenceRationale(assessment.getRationale());
        response.setConfidenceReasons(assessment.getReasons());
    }

    private void addFlagIfMissing(ChatbotResponse response, ChatbotFlag flag) {
        List<ChatbotFlag> flags = response.getFlags() == null ? new java.util.ArrayList<>() : new java.util.ArrayList<>(response.getFlags());
        if (!flags.contains(flag)) {
            flags.add(flag);
            response.setFlags(flags);
        }
    }

    private Map<String, Object> buildTraceMetadata(String requestId, HybridRetrievalResult retrieval, ContextBudgetResult budgetResult, int citationsCount) {
        return Map.of(
            "requestId", requestId,
            "retrieval", Map.of(
                "strategy", retrieval.getStrategy().name(),
                "intent", retrieval.getIntent().name(),
                "evidenceCount", retrieval.getEvidenceCount(),
                "matchedEntities", retrieval.getMatchedEntities(),
                "missingEvidence", retrieval.getMissingEvidence()
            ),
            "citationsCount", citationsCount,
            "contextBudget", Map.of(
                "originalEvidenceCount", budgetResult.getOriginalEvidenceCount(),
                "retainedEvidenceCount", budgetResult.getRetainedEvidenceCount(),
                "truncated", budgetResult.isTruncated(),
                "omittedArtifactTypeCounts", budgetResult.getOmittedArtifactTypeCounts(),
                "maxEvidenceItems", budgetResult.getMaxEvidenceItems(),
                "maxEvidenceChars", budgetResult.getMaxEvidenceChars()
            )
        );
    }

}
