package edu.baylor.ecs.cloudhubs.chatbot.service;

import com.fasterxml.jackson.databind.JsonNode;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Maps a raw IR JSON tree (as returned by backend's {@code /ir/versions} and {@code /ir}
 * endpoints) into {@link EvidenceItem}s: one {@code IR}-typed item per microservice and one
 * {@code ENDPOINT}-typed item per controller method that carries an {@code httpMethod}/{@code url}
 * pair. Pure/stateless so it can be unit tested without any HTTP dependency.
 */
final class IrEvidenceMapper {

    static final int DEFAULT_MAX_EVIDENCE_ITEMS = 400;

    private IrEvidenceMapper() {
    }

    static List<EvidenceItem> mapIrToEvidence(JsonNode irRoot, String irVersionLabel) {
        return mapIrToEvidence(irRoot, irVersionLabel, DEFAULT_MAX_EVIDENCE_ITEMS, true);
    }

    static List<EvidenceItem> mapIrToEvidence(JsonNode irRoot, String irVersionLabel, int maxItems) {
        return mapIrToEvidence(irRoot, irVersionLabel, maxItems, true);
    }

    /**
     * @param includeEndpoints whether to emit per-method ENDPOINT evidence at all. Real systems
     *     can have far more endpoints than services (e.g. TrainTicket: ~260 endpoints across 45
     *     services); ENDPOINT evidence ranks higher than IR evidence in {@code HybridRetriever},
     *     so for broad questions with no specific service/endpoint mentioned, flooding the pool
     *     with endpoints crowds IR (microservice-level) evidence out of the context budget
     *     entirely. Callers should only request endpoints when the question is actually
     *     endpoint-scoped.
     */
    static List<EvidenceItem> mapIrToEvidence(JsonNode irRoot, String irVersionLabel, int maxItems, boolean includeEndpoints) {
        List<EvidenceItem> items = new ArrayList<>();
        if (irRoot == null || !irRoot.isObject()) {
            return items;
        }

        String systemName = textOrNull(irRoot.get("name"));
        String commitId = textOrNull(irRoot.get("commitID"));
        JsonNode microservices = irRoot.path("microservices");
        if (!microservices.isArray()) {
            return items;
        }

        Instant now = Instant.now();
        for (JsonNode microservice : microservices) {
            if (items.size() >= maxItems) {
                break;
            }
            String serviceName = textOrNull(microservice.get("name"));
            if (serviceName == null) {
                continue;
            }
            String servicePath = textOrNull(microservice.get("path"));
            JsonNode controllers = microservice.path("controllers");
            int controllerCount = controllers.isArray() ? controllers.size() : 0;
            int endpointCount = countEndpoints(controllers);

            items.add(buildServiceEvidence(
                irVersionLabel, commitId, systemName, serviceName, servicePath, controllerCount, endpointCount, now));

            if (includeEndpoints && controllers.isArray()) {
                for (JsonNode controller : controllers) {
                    if (items.size() >= maxItems) {
                        break;
                    }
                    items.addAll(buildEndpointEvidence(
                        irVersionLabel, commitId, serviceName, controller, maxItems - items.size(), now));
                }
            }
        }
        return items;
    }

    private static int countEndpoints(JsonNode controllers) {
        if (!controllers.isArray()) {
            return 0;
        }
        int count = 0;
        for (JsonNode controller : controllers) {
            for (JsonNode method : controller.path("methods")) {
                if (isEndpointMethod(method)) {
                    count++;
                }
            }
        }
        return count;
    }

    private static boolean isEndpointMethod(JsonNode method) {
        return hasText(method.get("httpMethod")) && hasText(method.get("url"));
    }

    private static EvidenceItem buildServiceEvidence(
        String irVersionLabel, String commitId, String systemName, String serviceName,
        String servicePath, int controllerCount, int endpointCount, Instant timestamp
    ) {
        EvidenceItem item = new EvidenceItem();
        item.setArtifactType(EvidenceArtifactType.IR);
        item.setArtifactId(serviceArtifactId(irVersionLabel, serviceName));
        item.setArtifactVersion(irVersionLabel);
        item.setCommitId(commitId);
        item.setServiceName(serviceName);
        item.setEntityName(serviceName);
        item.setEntityType("MICROSERVICE");
        item.setLocationHint(valueOrNA(servicePath));
        item.setConfidenceSource("ir-context-direct");
        item.setSupportStrength(1.0);
        item.setTimestamp(timestamp);
        item.setContentText(String.format(Locale.ROOT,
            "Microservice '%s' (system=%s) is defined in the IR at path %s with %d controller(s) exposing %d HTTP endpoint(s).",
            serviceName, valueOrNA(systemName), valueOrNA(servicePath), controllerCount, endpointCount));
        return item;
    }

    private static List<EvidenceItem> buildEndpointEvidence(
        String irVersionLabel, String commitId, String serviceName, JsonNode controller, int remainingCapacity, Instant timestamp
    ) {
        List<EvidenceItem> items = new ArrayList<>();
        if (remainingCapacity <= 0) {
            return items;
        }
        String controllerName = textOrNull(controller.get("name"));
        String controllerPath = textOrNull(controller.get("path"));
        JsonNode methods = controller.path("methods");
        if (!methods.isArray()) {
            return items;
        }
        for (JsonNode method : methods) {
            if (items.size() >= remainingCapacity) {
                break;
            }
            if (!isEndpointMethod(method)) {
                continue;
            }
            String httpMethod = textOrNull(method.get("httpMethod")).toUpperCase(Locale.ROOT);
            String url = textOrNull(method.get("url"));
            String methodName = textOrNull(method.get("name"));
            String entityName = joinEntityName(controllerName, methodName);

            EvidenceItem item = new EvidenceItem();
            item.setArtifactType(EvidenceArtifactType.ENDPOINT);
            item.setArtifactId(endpointArtifactId(irVersionLabel, serviceName, httpMethod, url));
            item.setArtifactVersion(irVersionLabel);
            item.setCommitId(commitId);
            item.setServiceName(serviceName);
            item.setEntityName(entityName);
            item.setEntityType("ENDPOINT");
            item.setEndpointPath(url);
            item.setHttpMethod(httpMethod);
            item.setSourcePath(controllerPath);
            item.setLocationHint(url);
            item.setConfidenceSource("ir-context-direct");
            item.setSupportStrength(1.0);
            item.setTimestamp(timestamp);
            item.setContentText(String.format(Locale.ROOT,
                "%s %s is implemented by %s in service '%s' (%s).",
                httpMethod, url, entityName, serviceName, valueOrNA(controllerPath)));
            items.add(item);
        }
        return items;
    }

    private static String serviceArtifactId(String irVersionLabel, String serviceName) {
        return "ir:" + safe(irVersionLabel) + ":service:" + safe(serviceName);
    }

    private static String endpointArtifactId(String irVersionLabel, String serviceName, String httpMethod, String url) {
        return "ir:" + safe(irVersionLabel) + ":endpoint:" + safe(serviceName) + ":" + safe(httpMethod) + ":" + safe(url);
    }

    private static String joinEntityName(String controllerName, String methodName) {
        if (isBlank(controllerName)) {
            return valueOrNA(methodName);
        }
        return controllerName + "." + valueOrNA(methodName);
    }

    private static String textOrNull(JsonNode node) {
        return node == null || node.isNull() ? null : node.asText(null);
    }

    private static boolean hasText(JsonNode node) {
        return node != null && !node.isNull() && !node.asText("").isBlank();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String valueOrNA(String value) {
        return isBlank(value) ? "n/a" : value;
    }

    private static String safe(String value) {
        return isBlank(value) ? "unknown" : value.trim();
    }
}
