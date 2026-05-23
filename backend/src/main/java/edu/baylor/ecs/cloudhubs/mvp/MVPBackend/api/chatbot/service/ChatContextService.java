package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContextRefreshResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotMessage;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotQueryRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceScope;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.MissingEvidence;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.time.Instant;

@Service
public class ChatContextService {

    private final EvidenceProviderRegistry providerRegistry;

    @Autowired
    public ChatContextService(EvidenceProviderRegistry providerRegistry) {
        this.providerRegistry = providerRegistry;
    }

    // Test-friendly factory for direct instantiation without Spring wiring.
    static ChatContextService forProviders(List<EvidenceContextProvider> providers) {
        return new ChatContextService(new EvidenceProviderRegistry(providers));
    }

    public List<EvidenceItem> collectEvidence(ChatbotQueryRequest request) {
        return retrieveEvidence(request).getEvidenceItems();
    }

    public List<EvidenceItem> collectEvidence(ChatbotContext context) {
        ChatbotQueryRequest request = new ChatbotQueryRequest();
        request.setContext(context);
        request.setQuestion("");
        return retrieveEvidence(request).getEvidenceItems();
    }

    public EvidenceRetrievalResult retrieveEvidence(ChatbotQueryRequest request) {
        if (request == null) {
            EvidenceRetrievalResult empty = new EvidenceRetrievalResult();
            empty.setMissingEvidence(List.of(new MissingEvidence(
                EvidenceArtifactType.CONTEXT_METADATA,
                "No request payload supplied for evidence retrieval.",
                "request"
            )));
            return empty;
        }

        EvidenceQueryContext queryContext = toQueryContext(request);
        if (!queryContext.isExpandedScopeAllowed() && !hasAnyContextIdentifier(queryContext.getScope())) {
            EvidenceRetrievalResult blocked = new EvidenceRetrievalResult();
            blocked.setMissingEvidence(List.of(new MissingEvidence(
                EvidenceArtifactType.CONTEXT_METADATA,
                "Insufficient active context. Scoped evidence retrieval is blocked to prevent cross-system leakage.",
                "systemName|irId|indexId|runId|commitId|selectedService|selectedEndpoint"
            )));
            return blocked;
        }

        List<EvidenceItem> evidence = new ArrayList<>();
        List<MissingEvidence> missing = new ArrayList<>();

        for (EvidenceContextProvider provider : providerRegistry.getProviders()) {
            if (!provider.supports(queryContext, queryContext.getQuestion())) {
                continue;
            }
            try {
                EvidenceRetrievalResult providerResult = provider.collectEvidence(queryContext, queryContext.getQuestion());
                if (providerResult == null) {
                    missing.add(new MissingEvidence(
                        EvidenceArtifactType.UNKNOWN,
                        "Provider returned no result.",
                        provider.providerId()
                    ));
                    continue;
                }
                evidence.addAll(providerResult.getEvidenceItems());
                missing.addAll(providerResult.getMissingEvidence());
            } catch (RuntimeException ex) {
                missing.add(new MissingEvidence(
                    EvidenceArtifactType.UNKNOWN,
                    "Provider unavailable: " + ex.getMessage(),
                    provider.providerId()
                ));
            }
        }

        EvidenceRetrievalResult result = new EvidenceRetrievalResult();
        result.setEvidenceItems(evidence);
        result.setMissingEvidence(missing);
        return result;
    }

    public EvidenceQueryContext toQueryContext(ChatbotQueryRequest request) {
        ChatbotContext context = request.getContext();
        EvidenceScope scope = new EvidenceScope();
        if (context != null) {
            scope.setSystemName(context.getSystemName());
            scope.setIrId(context.getIrId());
            scope.setIndexId(context.getIndexId());
            scope.setRunId(context.getRunId());
            scope.setCommitId(context.getCommitId());
            scope.setServiceName(context.getSelectedService());
            scope.setEndpointPath(context.getSelectedEndpoint());
            scope.setSessionId(request.getConversationId());
        }

        List<ChatbotMessage> history = request.getMessages() == null ? List.of() : request.getMessages();
        boolean expandedScopeAllowed = context != null && Boolean.TRUE.equals(context.getExpandedScope());

        return new EvidenceQueryContext(
            request.getQuestion(),
            context,
            scope,
            history,
            request.getConversationId(),
            expandedScopeAllowed
        );
    }

    public ChatbotContextRefreshResponse refreshContext(ChatbotContext context) {
        ChatbotQueryRequest request = new ChatbotQueryRequest();
        request.setQuestion("refresh context evidence");
        request.setContext(context);

        ChatbotContextRefreshResponse response = new ChatbotContextRefreshResponse();
        response.setRefreshedAt(Instant.now());
        response.setRefreshVersion(buildRefreshVersion(context));
        response.setMessage("Validated provider-backed request-scoped evidence context (no persisted retrieval index).");

        EvidenceQueryContext queryContext = toQueryContext(request);
        if (!queryContext.isExpandedScopeAllowed() && !hasAnyContextIdentifier(queryContext.getScope())) {
            response.setSuccess(false);
            response.setStaleContext(true);
            response.setMessage("No active context identifiers were supplied. Select an active system/IR/session and retry refresh.");
            return response;
        }

        List<EvidenceItem> evidence = new ArrayList<>();
        List<String> unavailableProviders = new ArrayList<>();
        for (EvidenceContextProvider provider : providerRegistry.getProviders()) {
            if (!provider.supports(queryContext, queryContext.getQuestion())) {
                continue;
            }
            try {
                EvidenceRetrievalResult providerResult = provider.collectEvidence(queryContext, queryContext.getQuestion());
                if (providerResult != null) {
                    evidence.addAll(providerResult.getEvidenceItems());
                } else {
                    unavailableProviders.add(provider.providerId() + ": returned no result");
                }
            } catch (RuntimeException ex) {
                unavailableProviders.add(provider.providerId() + ": " + ex.getMessage());
            }
        }

        Map<String, Long> counts = evidence.stream()
            .filter(item -> item != null && item.getArtifactType() != null)
            .collect(Collectors.groupingBy(item -> item.getArtifactType().name(), LinkedHashMap::new, Collectors.counting()));
        response.setRefreshedArtifactCountsByType(counts);
        response.setUnavailableProviders(unavailableProviders);
        response.setSuccess(unavailableProviders.isEmpty());
        response.setStaleContext(!unavailableProviders.isEmpty());
        return response;
    }

    private String buildRefreshVersion(ChatbotContext context) {
        if (context == null) {
            return "no-context";
        }
        return String.join("|",
            safe(context.getSystemName()),
            safe(context.getIrId()),
            safe(context.getIndexId()),
            safe(context.getRunId()),
            safe(context.getCommitId()),
            safe(context.getSelectedService()),
            safe(context.getSelectedEndpoint())
        );
    }

    private boolean hasAnyContextIdentifier(EvidenceScope scope) {
        return scope != null
            && (hasValue(scope.getSystemName())
            || hasValue(scope.getIrId())
            || hasValue(scope.getIndexId())
            || hasValue(scope.getRunId())
            || hasValue(scope.getCommitId())
            || hasValue(scope.getServiceName())
            || hasValue(scope.getEndpointPath())
            || hasValue(scope.getSessionId()));
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
