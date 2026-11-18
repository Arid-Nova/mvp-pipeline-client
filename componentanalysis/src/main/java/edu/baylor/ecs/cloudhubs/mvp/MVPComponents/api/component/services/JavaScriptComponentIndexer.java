package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.*;
import edu.university.ecs.lab.javascript.JavaScriptArchitectureService;
import edu.university.ecs.lab.javascript.JavaScriptExtractionService;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

/** Projects native JavaScript source evidence without invoking Java/Spring AST or security rules. */
public final class JavaScriptComponentIndexer {
    public static final Map<String, String> CAPABILITIES = Map.of(
            "javascriptSourceIndex", "supported", "architecture", "supported",
            "authentication", "unsupported", "authorization", "unsupported",
            "roles", "unsupported", "controlFlow", "unsupported");
    public static final List<String> LIMITATIONS = List.of(
            "Express guard/path observations may be available separately; complete authorization vectors, Spring roles and Java CFG generation remain unsupported.",
            "Null security fields and empty roles mean unknown, never public access or a security pass.",
            "Backend application boundaries are declared inputs; endpoints are not independent services.",
            "Static calls and partial contract observations do not prove runtime reachability or complete schemas.",
            "Source revisions are bound by a trusted operator source-export manifest.");
    private final ObjectMapper mapper = new ObjectMapper();

    public IndexBundle index(String systemName, List<JsonNode> snapshots) throws IOException {
        Map<String, IndexedComponent> components = new LinkedHashMap<>();
        Map<String, EndpointInfo> endpoints = new LinkedHashMap<>();
        List<Map<String, String>> repositories = new ArrayList<>();
        Set<String> identities = new HashSet<>();
        int backendCount = 0;
        for (JsonNode snapshot : snapshots) {
            JavaScriptExtractionService.validateSnapshot(snapshot);
            JsonNode info = snapshot.path("component");
            String name = info.path("name").asText(), kind = info.path("kind").asText();
            String prefix = kind + ":" + name + ":";
            if (!identities.add(prefix)) throw new IOException("Duplicate JavaScript component identity");
            if ("backend".equals(kind)) backendCount++;
            repositories.add(Map.of("repositoryURL", info.path("repositoryURL").asText(),
                    "commit", info.path("commit").asText(), "kind", kind, "name", name));
            JsonNode architecture = snapshot.path("architecture");
            for (JsonNode module : architecture.path("modules")) {
                String id = prefix + "module:" + module.path("id").asText();
                putUnique(components, id, new IndexedComponent("JSModule", module.path("file").asText(),
                        id, module.path("id").asText(), "backend".equals(kind) ? name : null,
                        null, module.deepCopy()));
            }
            for (JsonNode function : architecture.path("functions")) {
                String id = prefix + function.path("id").asText();
                putUnique(components, id, new IndexedComponent("JSFunction", function.path("name").asText(),
                        id, function.path("file").asText() + ":" + function.path("line").asInt(),
                        "backend".equals(kind) ? name : null, null, function.deepCopy()));
            }
            Map<String, List<String>> bindings = new HashMap<>();
            for (JsonNode binding : architecture.path("endpointHandlers")) {
                String functionId = prefix + binding.path("functionId").asText();
                if (!components.containsKey(functionId)) throw new IOException("Unresolved indexed handler reference");
                bindings.computeIfAbsent(binding.path("endpointId").asText(), ignored -> new ArrayList<>()).add(functionId);
            }
            Map<String, JsonNode> contracts = new HashMap<>();
            for (JsonNode contract : architecture.path("contracts").path("operations")) {
                contracts.put(contract.path("endpointId").asText(), contract);
            }
            Map<String, JsonNode> securityEndpoints = new HashMap<>();
            if (snapshot.has("security")) {
                ExpressSecurityService.validate(snapshot.path("security"), snapshot);
                snapshot.path("security").path("endpoints").forEach(endpoint ->
                        securityEndpoints.put(endpoint.path("endpointId").asText(), endpoint));
            }
            for (JsonNode route : snapshot.path("endpoints")) {
                String originalId = route.path("id").asText(), id = prefix + originalId;
                EndpointInfo endpoint = new EndpointInfo();
                endpoint.setId(id);
                if (route.path("normalizedPath").isTextual()) endpoint.setEndpointId(prefix + "contract:" + UUID.nameUUIDFromBytes(
                        (route.path("method").asText() + " " + route.path("normalizedPath").asText())
                                .getBytes(StandardCharsets.UTF_8)));
                endpoint.setHttpMethod(route.path("method").asText());
                endpoint.setFullUri(route.path("path").asText(null));
                endpoint.setSimplifiedUri(route.path("normalizedPath").asText(null));
                endpoint.setMethodName(route.path("handler").asText(null));
                List<String> handlers = bindings.getOrDefault(originalId, List.of()).stream().distinct().toList();
                if (handlers.size() == 1) endpoint.setMethodId(handlers.getFirst());
                endpoint.setServiceName(name);
                endpoint.setPhysicalServiceName(name);
                endpoint.setSecurityAnalysisStatus("unsupported");
                ObjectNode evidence = mapper.createObjectNode();
                evidence.set("route", route.deepCopy());
                evidence.set("handlerComponentIds", mapper.valueToTree(handlers));
                if (contracts.containsKey(originalId)) evidence.set("contract", contracts.get(originalId).deepCopy());
                if (securityEndpoints.containsKey(originalId)) {
                    evidence.set("security", securityEndpoints.get(originalId).deepCopy());
                    JsonNode checks = securityEndpoints.get(originalId).path("analysisCoverage").path("capabilities");
                    boolean completed = checks.isObject() && !checks.isEmpty();
                    for (JsonNode check : checks) completed &= Set.of("complete", "not-applicable").contains(check.path("status").asText());
                    endpoint.setSecurityAnalysisStatus(completed ? "complete" : "partial");
                }
                endpoint.setSourceEvidence(evidence);
                if (endpoints.putIfAbsent(id, endpoint) != null) throw new IOException("Duplicate JavaScript route identity");
            }
        }
        Map<String, Integer> counts = new TreeMap<>();
        components.values().forEach(component -> counts.merge(component.getType(), 1, Integer::sum));
        IndexMetadata componentMetadata = metadata(systemName, repositories, backendCount, components.size(), counts);
        IndexMetadata endpointMetadata = metadata(systemName, repositories, backendCount, endpoints.size(), Map.of("Endpoint", endpoints.size()));
        Set<String> languages = new TreeSet<>();
        for (JsonNode snapshot : snapshots) for (JsonNode module : snapshot.path("architecture").path("modules")) {
            String file = module.path("file").asText();
            languages.add(file.matches(".*\\.(?:ts|tsx|mts|cts)$") ? "typescript" : "javascript");
        }
        componentMetadata.setLanguages(new ArrayList<>(languages)); endpointMetadata.setLanguages(new ArrayList<>(languages));
        ObjectNode security = ExpressSecurityService.aggregate(snapshots);
        if (Set.of("partial", "complete").contains(security.path("status").asText())) {
            Map<String, String> capabilities = new LinkedHashMap<>(CAPABILITIES);
            capabilities.put("expressSecurity", security.path("status").asText());
            for (String property : List.of("authentication", "roleChecks", "ownershipChecks", "executionPaths", "dataAccess", "policyModel")) {
                boolean complete = true;
                for (JsonNode report : security.path("components"))
                    complete &= Set.of("complete", "not-applicable").contains(report.path("capabilities").path(property).path("status").asText());
                capabilities.put(property, complete ? "complete" : "partial");
            }
            capabilities.put("javascriptPolicy", "scoped");
            componentMetadata.setAnalysisCapabilities(capabilities);
            endpointMetadata.setAnalysisCapabilities(capabilities);
        }
        List<Map<String,Object>> diagnostics=new ArrayList<>();
        for(JsonNode snapshot:snapshots) for(JsonNode diagnostic:snapshot.path("diagnostics")) {
            Map<String,Object> record=mapper.convertValue(diagnostic,Map.class);
            record.put("component",snapshot.path("component").path("name").asText()); diagnostics.add(record);
            String file=diagnostic.path("file").asText();
            if(file.matches(".*\\.(?:ts|tsx|mts|cts)$")) languages.add("typescript");
            else if(file.matches(".*\\.(?:js|jsx|mjs|cjs)$")) languages.add("javascript");
        }
        for(IndexMetadata metadata:List.of(componentMetadata,endpointMetadata)) {
            metadata.setLanguages(new ArrayList<>(languages)); metadata.setDiagnostics(diagnostics);
            metadata.setStatus(diagnostics.isEmpty()?"complete-for-supported-source-patterns":"partial");
            if(!diagnostics.isEmpty()) {
                var capabilities=new LinkedHashMap<>(metadata.getAnalysisCapabilities());
                capabilities.put("javascriptSourceIndex","partial"); capabilities.put("sourceCompleteness","partial"); metadata.setAnalysisCapabilities(capabilities);
            }
        }
        ComponentIndex componentIndex = new ComponentIndex(components, new LinkedHashMap<>(), new LinkedHashSet<>(), componentMetadata);
        ObjectNode extraction = mapper.createObjectNode();
        extraction.put("schemaVersion", 1);
        extraction.set("snapshots", mapper.valueToTree(snapshots));
        extraction.set("architecture", new JavaScriptArchitectureService().analyze(snapshots, systemName));
        extraction.set("analysisCapabilities", mapper.valueToTree(componentMetadata.getAnalysisCapabilities()));
        extraction.set("securityAnalysis", security);
        extraction.set("limitations", mapper.valueToTree(LIMITATIONS));
        componentIndex.setJavascriptExtraction(extraction);
        return new IndexBundle(new EndpointIndex(endpoints, endpointMetadata), componentIndex);
    }

    private static void putUnique(Map<String, IndexedComponent> target, String id, IndexedComponent component) throws IOException {
        if (target.putIfAbsent(id, component) != null) throw new IOException("Duplicate JavaScript component ID");
    }

    private static IndexMetadata metadata(String name, List<Map<String, String>> sources, int backends,
                                          int count, Map<String, Integer> counts) {
        IndexMetadata metadata = new IndexMetadata();
        metadata.setSystemName(name);
        metadata.setCommitId(sources.size() == 1 ? sources.getFirst().get("commit") : null);
        metadata.setSourceRepositories(sources);
        metadata.setIndexedAt(Instant.now().toString());
        metadata.setTotalComponents(count);
        metadata.setComponentCounts(counts);
        metadata.setMicroserviceCount(backends);

        metadata.setRoleCount(0);
        metadata.setRoles(List.of());
        metadata.setAnalysisCapabilities(CAPABILITIES);
        metadata.setLimitations(LIMITATIONS);
        return metadata;
    }
}
