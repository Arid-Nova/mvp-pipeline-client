package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import com.fasterxml.jackson.databind.JsonNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.MissingEvidence;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir.IRService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir.StoredIrPayload;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.Locale;
import java.util.Map;
import java.util.LinkedHashMap;

@Component
public class IrContextProvider implements EvidenceContextProvider {
    private static final int MAX_IR_SNIPPET_EVIDENCE = 60;
    private static final int MAX_VALUE_LENGTH = 240;
    private static final Set<String> QUERY_STOPWORDS = Set.of(
        "the", "and", "for", "with", "from", "that", "this", "what", "where", "when", "which", "who",
        "about", "into", "onto", "your", "are", "was", "were", "can", "could", "should", "would", "any",
        "show", "list", "tell", "does", "have", "has", "had", "how", "many", "count", "number", "system",
        "architecture", "details", "detail", "content", "file", "ir", "json", "all", "full", "complete"
    );

    private final IRService irService;

    public IrContextProvider(IRService irService) {
        this.irService = irService;
    }

    @Override
    public String providerId() {
        return "ir-context";
    }

    @Override
    public boolean supports(EvidenceQueryContext context, String question) {
        if (context == null || context.getScope() == null) {
            return false;
        }
        return hasValue(context.getScope().getIrId())
            || hasValue(context.getScope().getSystemName())
            || hasValue(context.getScope().getIndexId())
            || hasValue(context.getScope().getRunId());
    }

    @Override
    public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
        EvidenceRetrievalResult result = new EvidenceRetrievalResult();
        List<EvidenceItem> evidence = new ArrayList<>();
        List<MissingEvidence> missing = new ArrayList<>();

        Optional<StoredIrPayload> selected = selectActiveIr(context, missing);
        if (selected.isEmpty()) {
            result.setMissingEvidence(missing);
            return result;
        }

        StoredIrPayload ir = selected.get();
        String commitId = resolveCommitId(ir.getPayload(), context);
        extractMicroserviceEvidence(ir, commitId, evidence);
        extractQuestionAnchoredEvidence(ir, commitId, evidence, question);

        if (evidence.isEmpty()) {
            missing.add(new MissingEvidence(
                EvidenceArtifactType.IR,
                "IR payload did not contain extractable architecture evidence.",
                ir.getId()
            ));
        }

        result.setEvidenceItems(evidence);
        result.setMissingEvidence(missing);
        return result;
    }

    private Optional<StoredIrPayload> selectActiveIr(EvidenceQueryContext context, List<MissingEvidence> missing) {
        if (context == null || context.getScope() == null) {
            missing.add(new MissingEvidence(EvidenceArtifactType.IR, "No scope provided.", "irId|systemName"));
            return Optional.empty();
        }

        if (hasValue(context.getScope().getIrId())) {
            Optional<StoredIrPayload> byId = irService.getStoredIrById(context.getScope().getIrId());
            if (byId.isPresent()) {
                return byId;
            }
            missing.add(new MissingEvidence(EvidenceArtifactType.IR, "No IR found for irId.", context.getScope().getIrId()));
            return Optional.empty();
        }

        if (hasValue(context.getScope().getSystemName())) {
            Optional<StoredIrPayload> latestForSystem = irService.getLatestStoredIrBySystemName(context.getScope().getSystemName());
            if (latestForSystem.isPresent()) {
                return latestForSystem;
            }
            missing.add(new MissingEvidence(EvidenceArtifactType.IR, "No IR found for active system.", context.getScope().getSystemName()));
            return Optional.empty();
        }

        if (hasValue(context.getScope().getIndexId()) || hasValue(context.getScope().getRunId())) {
            missing.add(new MissingEvidence(
                EvidenceArtifactType.IR,
                "Index/session-linked IR resolution is not yet supported by backend IR mappings.",
                firstNonBlank(context.getScope().getIndexId(), context.getScope().getRunId())
            ));
            return Optional.empty();
        }

        missing.add(new MissingEvidence(EvidenceArtifactType.IR, "No IR selector available in active scope.", "irId|systemName"));
        return Optional.empty();
    }

    private void extractMicroserviceEvidence(StoredIrPayload ir, String commitId, List<EvidenceItem> output) {
        JsonNode microservices = ir.getPayload() == null ? null : ir.getPayload().path("microservices");
        if (microservices == null || !microservices.isArray()) {
            return;
        }

        for (int i = 0; i < microservices.size(); i++) {
            JsonNode microservice = microservices.get(i);
            String serviceName = textOrDefault(microservice.path("name"), "unknown-service");
            addEvidence(output, EvidenceArtifactType.SERVICE, ir, commitId,
                "svc:" + serviceName,
                "microservices[" + i + "].name",
                "MICROSERVICE",
                serviceName,
                serviceName,
                null,
                null,
                "Microservice discovered in IR topology: " + serviceName,
                microservice);
            extractAntiPatternEvidence(ir, commitId, output, microservice, "microservices[" + i + "]", "MICROSERVICE", serviceName, serviceName, null);

            extractControllers(ir, commitId, output, microservice, i, serviceName);
            extractServiceDependencies(ir, commitId, output, microservice, i, serviceName);
            extractFeignClients(ir, commitId, output, microservice, i, serviceName);
        }
    }

    private void extractQuestionAnchoredEvidence(StoredIrPayload ir, String commitId, List<EvidenceItem> output, String question) {
        if (ir == null || ir.getPayload() == null || question == null || question.isBlank()) {
            return;
        }
        Set<String> tokens = queryTokens(question);
        if (tokens.isEmpty()) {
            return;
        }

        Map<String, IrSnippetMatch> matches = new LinkedHashMap<>();
        collectSnippetMatches(ir.getPayload(), "$", tokens, matches);

        matches.values().stream()
            .sorted(Comparator
                .comparingInt(IrSnippetMatch::score).reversed()
                .thenComparing(IrSnippetMatch::path))
            .limit(MAX_IR_SNIPPET_EVIDENCE)
            .forEach(match -> addEvidence(
                output,
                EvidenceArtifactType.IR,
                ir,
                commitId,
                "ir-snippet:" + match.path(),
                toLocationHint(match.path()),
                "IR_FIELD",
                match.fieldName(),
                null,
                null,
                null,
                "IR field match at " + match.path() + ": " + truncate(match.value()),
                match.node()
            ));
    }

    private void collectSnippetMatches(JsonNode node, String path, Set<String> tokens, Map<String, IrSnippetMatch> matches) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return;
        }

        if (node.isValueNode()) {
            String value = node.asText("");
            int score = computeMatchScore(path, value, tokens);
            if (score > 0) {
                matches.put(path, new IrSnippetMatch(path, leafFieldName(path), value, score, node));
            }
            return;
        }

        if (node.isObject()) {
            Iterator<String> names = node.fieldNames();
            while (names.hasNext()) {
                String field = names.next();
                collectSnippetMatches(node.get(field), path + "." + field, tokens, matches);
            }
            return;
        }

        if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                collectSnippetMatches(node.get(i), path + "[" + i + "]", tokens, matches);
            }
        }
    }

    private int computeMatchScore(String path, String value, Set<String> tokens) {
        String pathLower = safe(path).toLowerCase(Locale.ROOT);
        String valueLower = safe(value).toLowerCase(Locale.ROOT);
        int score = 0;
        for (String token : tokens) {
            if (pathLower.contains(token)) {
                score += 2;
            }
            if (valueLower.contains(token)) {
                score += 3;
            }
        }
        return score;
    }

    private Set<String> queryTokens(String question) {
        Set<String> tokens = new HashSet<>();
        for (String raw : question.toLowerCase(Locale.ROOT).split("[^a-z0-9_\\-/]+")) {
            String token = raw == null ? "" : raw.trim();
            if (token.length() < 3) {
                continue;
            }
            if (QUERY_STOPWORDS.contains(token)) {
                continue;
            }
            tokens.add(token);
        }
        return tokens;
    }

    private String toLocationHint(String jsonPath) {
        if (!hasValue(jsonPath)) {
            return "payload";
        }
        String normalized = jsonPath.startsWith("$.") ? jsonPath.substring(2) : jsonPath;
        return normalized.isBlank() ? "payload" : normalized;
    }

    private String leafFieldName(String path) {
        if (!hasValue(path)) {
            return "ir-field";
        }
        String p = path;
        int dotIdx = p.lastIndexOf('.');
        if (dotIdx >= 0 && dotIdx + 1 < p.length()) {
            p = p.substring(dotIdx + 1);
        }
        int arrIdx = p.indexOf('[');
        if (arrIdx > 0) {
            p = p.substring(0, arrIdx);
        }
        return hasValue(p) ? p : "ir-field";
    }

    private String truncate(String value) {
        if (value == null) {
            return "";
        }
        String compact = value.replaceAll("\\s+", " ").trim();
        if (compact.length() <= MAX_VALUE_LENGTH) {
            return compact;
        }
        return compact.substring(0, MAX_VALUE_LENGTH) + "...";
    }

    private void extractControllers(StoredIrPayload ir, String commitId, List<EvidenceItem> output, JsonNode microservice, int msIdx, String serviceName) {
        JsonNode controllers = microservice.path("controllers");
        if (!controllers.isArray()) {
            return;
        }
        for (int c = 0; c < controllers.size(); c++) {
            JsonNode controller = controllers.get(c);
            String controllerName = textOrDefault(controller.path("name"), "unknown-controller");
            addEvidence(output, EvidenceArtifactType.ARCHITECTURE, ir, commitId,
                "ctrl:" + serviceName + ":" + controllerName,
                "microservices[" + msIdx + "].controllers[" + c + "].name",
                "CONTROLLER",
                controllerName,
                serviceName,
                null,
                null,
                "Controller in service " + serviceName + ": " + controllerName,
                controller);
            extractAntiPatternEvidence(
                ir, commitId, output, controller,
                "microservices[" + msIdx + "].controllers[" + c + "]",
                "CONTROLLER", controllerName, serviceName, null
            );

            JsonNode methods = controller.path("methods");
            if (!methods.isArray()) {
                continue;
            }
            for (int m = 0; m < methods.size(); m++) {
                JsonNode method = methods.get(m);
                String endpointUrl = firstNonBlank(
                    textOrNull(method.path("url")),
                    extractUrlFromAnnotations(method.path("annotations"))
                );
                String httpMethod = firstNonBlank(
                    textOrNull(method.path("httpMethod")),
                    deriveHttpMethod(method.path("annotations"))
                );
                if (!hasValue(endpointUrl) && !hasValue(httpMethod)) {
                    continue;
                }

                addEvidence(output, EvidenceArtifactType.ENDPOINT, ir, commitId,
                    "ep:" + serviceName + ":" + firstNonBlank(httpMethod, "HTTP") + ":" + firstNonBlank(endpointUrl, "unknown"),
                    "microservices[" + msIdx + "].controllers[" + c + "].methods[" + m + "].url",
                    "ENDPOINT",
                    controllerName,
                    serviceName,
                    endpointUrl,
                    httpMethod,
                    "Endpoint discovered: " + firstNonBlank(httpMethod, "HTTP") + " " + firstNonBlank(endpointUrl, "unknown"),
                    method);
                extractAntiPatternEvidence(
                    ir, commitId, output, method,
                    "microservices[" + msIdx + "].controllers[" + c + "].methods[" + m + "]",
                    "ENDPOINT_METHOD", controllerName, serviceName, endpointUrl
                );
            }
        }
    }

    private void extractServiceDependencies(StoredIrPayload ir, String commitId, List<EvidenceItem> output, JsonNode microservice, int msIdx, String serviceName) {
        extractMethodCallsFromComponents(ir, commitId, output, microservice.path("controllers"), msIdx, "controllers", serviceName);
        extractMethodCallsFromComponents(ir, commitId, output, microservice.path("services"), msIdx, "services", serviceName);
    }

    private void extractMethodCallsFromComponents(StoredIrPayload ir, String commitId, List<EvidenceItem> output, JsonNode components, int msIdx, String componentKey, String serviceName) {
        if (!components.isArray()) {
            return;
        }

        for (int c = 0; c < components.size(); c++) {
            JsonNode component = components.get(c);
            String componentName = textOrDefault(component.path("name"), "unknown-component");
            JsonNode methods = component.path("methods");
            if (!methods.isArray()) {
                continue;
            }
            for (int m = 0; m < methods.size(); m++) {
                JsonNode method = methods.get(m);
                JsonNode methodCalls = method.path("methodCalls");
                if (!methodCalls.isArray()) {
                    continue;
                }
                for (int callIdx = 0; callIdx < methodCalls.size(); callIdx++) {
                    JsonNode call = methodCalls.get(callIdx);
                    String calledUrl = textOrNull(call.path("url"));
                    String calledTarget = firstNonBlank(textOrNull(call.path("name")), textOrNull(call.path("methodName")), calledUrl);
                    addEvidence(output, EvidenceArtifactType.DEPENDENCY, ir, commitId,
                        "dep:" + serviceName + ":" + componentName + ":" + callIdx,
                        "microservices[" + msIdx + "]." + componentKey + "[" + c + "].methods[" + m + "].methodCalls[" + callIdx + "]",
                        "METHOD_CALL",
                        componentName,
                        serviceName,
                        calledUrl,
                        null,
                        "Method call dependency from " + componentName + " to " + firstNonBlank(calledTarget, "unknown target"),
                        call);
                    extractAntiPatternEvidence(
                        ir, commitId, output, call,
                        "microservices[" + msIdx + "]." + componentKey + "[" + c + "].methods[" + m + "].methodCalls[" + callIdx + "]",
                        "METHOD_CALL", componentName, serviceName, calledUrl
                    );
                }
            }
        }
    }

    private void extractFeignClients(StoredIrPayload ir, String commitId, List<EvidenceItem> output, JsonNode microservice, int msIdx, String serviceName) {
        JsonNode feignClients = microservice.path("feignClients");
        if (!feignClients.isArray()) {
            return;
        }

        for (int f = 0; f < feignClients.size(); f++) {
            JsonNode feign = feignClients.get(f);
            String clientName = firstNonBlank(textOrNull(feign.path("name")), textOrNull(feign.path("clientName")), "unknown-feign-client");
            String target = firstNonBlank(textOrNull(feign.path("url")), textOrNull(feign.path("serviceName")), clientName);
            addEvidence(output, EvidenceArtifactType.DEPENDENCY, ir, commitId,
                "feign:" + serviceName + ":" + clientName,
                "microservices[" + msIdx + "].feignClients[" + f + "].annotations",
                "FEIGN_CLIENT",
                clientName,
                serviceName,
                target,
                null,
                "Feign client dependency from " + serviceName + " to " + target,
                feign);
            extractAntiPatternEvidence(
                ir, commitId, output, feign,
                "microservices[" + msIdx + "].feignClients[" + f + "]",
                "FEIGN_CLIENT", clientName, serviceName, target
            );
        }
    }

    private void extractAntiPatternEvidence(
        StoredIrPayload ir,
        String commitId,
        List<EvidenceItem> output,
        JsonNode node,
        String baseLocation,
        String entityType,
        String entityName,
        String serviceName,
        String endpointPath
    ) {
        Set<String> markers = antiPatternMarkers(node);
        if (markers.isEmpty()) {
            return;
        }
        for (String marker : markers) {
            addEvidence(
                output,
                EvidenceArtifactType.ARCHITECTURE,
                ir,
                commitId,
                "ap:" + serviceName + ":" + marker + ":" + baseLocation,
                baseLocation + ".antiPattern",
                "ANTI_PATTERN",
                entityName,
                serviceName,
                endpointPath,
                null,
                "Anti-pattern marker in IR: " + marker + " for " + firstNonBlank(entityName, serviceName, "unknown"),
                node
            );
        }
    }

    private void addEvidence(
        List<EvidenceItem> output,
        EvidenceArtifactType artifactType,
        StoredIrPayload ir,
        String commitId,
        String artifactId,
        String locationHint,
        String entityType,
        String entityName,
        String serviceName,
        String endpointPath,
        String httpMethod,
        String content,
        JsonNode structured
    ) {
        EvidenceItem item = new EvidenceItem();
        item.setArtifactType(artifactType);
        item.setArtifactId(artifactId);
        item.setArtifactVersion(ir.getId());
        item.setCommitId(commitId);
        item.setLocationHint(locationHint);
        item.setEntityType(entityType);
        item.setEntityName(entityName);
        item.setServiceName(serviceName);
        item.setEndpointPath(endpointPath);
        item.setHttpMethod(httpMethod);
        item.setConfidenceSource("ir-json");
        item.setSupportStrength(1.0);
        item.setContentText(content);
        item.setStructuredPayload(structured);
        output.add(item);
    }

    private String resolveCommitId(JsonNode payload, EvidenceQueryContext context) {
        if (context != null && context.getScope() != null && hasValue(context.getScope().getCommitId())) {
            return context.getScope().getCommitId();
        }
        if (payload == null) {
            return null;
        }

        JsonNode metadata = payload.path("metadata");
        if (metadata.isArray() && !metadata.isEmpty()) {
            String commit = textOrNull(metadata.get(0).path("commitId"));
            if (hasValue(commit)) {
                return commit;
            }
        }

        return textOrNull(payload.path("commitId"));
    }

    private String deriveHttpMethod(JsonNode annotationsNode) {
        if (!annotationsNode.isArray()) {
            return null;
        }
        Iterator<JsonNode> it = annotationsNode.elements();
        while (it.hasNext()) {
            JsonNode ann = it.next();
            String name = textOrNull(ann.path("name"));
            if (!hasValue(name)) {
                continue;
            }
            String lower = name.toLowerCase();
            if (lower.contains("get")) return "GET";
            if (lower.contains("post")) return "POST";
            if (lower.contains("put")) return "PUT";
            if (lower.contains("delete")) return "DELETE";
            if (lower.contains("patch")) return "PATCH";
        }
        return null;
    }

    private Set<String> antiPatternMarkers(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return Set.of();
        }
        Set<String> markers = new LinkedHashSet<>();
        if (node.has("antiPattern") && node.path("antiPattern").isTextual()) {
            String marker = node.path("antiPattern").asText();
            if (hasValue(marker)) {
                markers.add(marker.trim());
            }
        }
        if (node.has("antiPatterns") && node.path("antiPatterns").isArray()) {
            node.path("antiPatterns").forEach(patternNode -> {
                if (patternNode.isTextual() && hasValue(patternNode.asText())) {
                    markers.add(patternNode.asText().trim());
                }
            });
        }
        return markers;
    }

    private String extractUrlFromAnnotations(JsonNode annotationsNode) {
        if (!annotationsNode.isArray()) {
            return null;
        }
        for (JsonNode ann : annotationsNode) {
            JsonNode attributes = ann.path("attributes");
            if (attributes.isObject()) {
                String direct = textOrNull(attributes.path("default"));
                if (hasValue(direct)) {
                    return direct;
                }
                String value = textOrNull(attributes.path("value"));
                if (hasValue(value)) {
                    return value;
                }
            }
        }
        return null;
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }

    private String textOrDefault(JsonNode node, String fallback) {
        String value = textOrNull(node);
        return hasValue(value) ? value : fallback;
    }

    private String textOrNull(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        String value = node.asText();
        return hasValue(value) ? value : null;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (hasValue(value)) {
                return value;
            }
        }
        return null;
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private record IrSnippetMatch(String path, String fieldName, String value, int score, JsonNode node) {
    }
}
