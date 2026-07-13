package edu.baylor.ecs.cloudhubs.chatbot.service;

import com.fasterxml.jackson.databind.JsonNode;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceScope;
import edu.baylor.ecs.cloudhubs.chatbot.model.MissingEvidence;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Resolves IR evidence for the active context in two ways, tried in order:
 *
 * <ol>
 *   <li>Inline: the frontend already sent the raw IR JSON it has in memory
 *       ({@code ChatbotContext.irPayload}) — mapped directly via {@link IrEvidenceMapper}
 *       with no network call at all. This is what makes IRs that were never persisted to
 *       {@code backend} (e.g. a locally uploaded IR file) chatbot-answerable.</li>
 *   <li>Fallback: call {@code backend}'s existing IR REST API through {@link BackendIrGateway}
 *       (server-to-server HTTP; no compile-time dependency on {@code backend}) by {@code irId}
 *       or {@code systemName}, for contexts that don't carry an inline payload.</li>
 * </ol>
 */
@Component
public class IrContextProvider implements EvidenceContextProvider {

    private static final Pattern PATH_TOKEN_PATTERN = Pattern.compile("/[a-zA-Z0-9_\\-/{}]+");
    private static final String[] ENDPOINT_METHOD_TOKENS = {"get ", "post ", "put ", "patch ", "delete "};

    private final BackendIrGateway backendIrGateway;

    public IrContextProvider(BackendIrGateway backendIrGateway) {
        this.backendIrGateway = backendIrGateway;
    }

    @Override
    public String providerId() {
        return "ir-context";
    }

    @Override
    public boolean supports(EvidenceQueryContext context, String question) {
        if (context == null) {
            return false;
        }
        if (resolveInlinePayload(context) != null) {
            return true;
        }
        EvidenceScope scope = context.getScope();
        return scope != null && (
            hasValue(scope.getIrId())
                || hasValue(scope.getSystemName())
                || hasValue(scope.getIndexId())
                || hasValue(scope.getRunId())
        );
    }

    @Override
    public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
        EvidenceRetrievalResult result = new EvidenceRetrievalResult();
        EvidenceScope scope = context == null ? null : context.getScope();
        String irId = scope == null ? null : scope.getIrId();
        String systemName = scope == null ? null : scope.getSystemName();
        String irVersionLabel = hasValue(irId) ? irId : systemName;

        boolean includeEndpoints = needsEndpointDetail(scope, question);

        JsonNode inlinePayload = resolveInlinePayload(context);
        if (inlinePayload != null) {
            List<EvidenceItem> mapped = IrEvidenceMapper.mapIrToEvidence(
                inlinePayload, irVersionLabel, IrEvidenceMapper.DEFAULT_MAX_EVIDENCE_ITEMS, includeEndpoints);
            if (!mapped.isEmpty()) {
                result.setEvidenceItems(new ArrayList<>(mapped));
                return result;
            }
        }

        Optional<JsonNode> irRoot = Optional.empty();
        if (hasValue(irId)) {
            irRoot = backendIrGateway.fetchIrById(irId);
            irVersionLabel = irId;
        }
        if (irRoot.isEmpty() && hasValue(systemName)) {
            irRoot = backendIrGateway.fetchLatestIrForSystem(systemName);
            irVersionLabel = hasValue(irId) ? irId : systemName;
        }

        if (irRoot.isEmpty()) {
            result.setMissingEvidence(List.of(new MissingEvidence(
                EvidenceArtifactType.IR,
                "No inline IR payload was supplied and backend IR service is unreachable or has no IR matching the active context.",
                resolveSelector(context)
            )));
            return result;
        }

        List<EvidenceItem> mapped = IrEvidenceMapper.mapIrToEvidence(
            irRoot.get(), irVersionLabel, IrEvidenceMapper.DEFAULT_MAX_EVIDENCE_ITEMS, includeEndpoints);
        if (mapped.isEmpty()) {
            result.setMissingEvidence(List.of(new MissingEvidence(
                EvidenceArtifactType.IR,
                "Backend returned an IR document with no recognizable microservice/controller/endpoint structure.",
                resolveSelector(context)
            )));
            return result;
        }

        result.setEvidenceItems(new ArrayList<>(mapped));
        return result;
    }

    /**
     * Endpoint evidence is only worth generating when the question is actually about a specific
     * endpoint — see {@link IrEvidenceMapper#mapIrToEvidence(JsonNode, String, int, boolean)} for
     * why flooding broad questions with endpoint evidence backfires.
     */
    private boolean needsEndpointDetail(EvidenceScope scope, String question) {
        if (scope != null && hasValue(scope.getEndpointPath())) {
            return true;
        }
        if (question == null || question.isBlank()) {
            return false;
        }
        String normalized = question.toLowerCase(Locale.ROOT);
        if (normalized.contains("endpoint") || normalized.contains("route") || normalized.contains("url")) {
            return true;
        }
        for (String methodToken : ENDPOINT_METHOD_TOKENS) {
            if (normalized.contains(methodToken)) {
                return true;
            }
        }
        return PATH_TOKEN_PATTERN.matcher(question).find();
    }

    private JsonNode resolveInlinePayload(EvidenceQueryContext context) {
        ChatbotContext chatbotContext = context == null ? null : context.getChatbotContext();
        JsonNode payload = chatbotContext == null ? null : chatbotContext.getIrPayload();
        return payload != null && payload.isObject() ? payload : null;
    }

    private String resolveSelector(EvidenceQueryContext context) {
        if (context == null || context.getScope() == null) {
            return "irId|systemName";
        }
        if (hasValue(context.getScope().getIrId())) {
            return context.getScope().getIrId();
        }
        if (hasValue(context.getScope().getSystemName())) {
            return context.getScope().getSystemName();
        }
        if (hasValue(context.getScope().getIndexId())) {
            return context.getScope().getIndexId();
        }
        if (hasValue(context.getScope().getRunId())) {
            return context.getScope().getRunId();
        }
        return "irId|systemName";
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }
}
