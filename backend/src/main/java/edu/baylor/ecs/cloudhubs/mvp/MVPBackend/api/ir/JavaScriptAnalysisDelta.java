package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.university.ecs.lab.javascript.JavaScriptArchitectureService;
import edu.university.ecs.lab.javascript.JavaScriptDeltaService;
import java.io.IOException;
import java.util.*;

/** Compares stored source evidence. A change is not automatically an architectural or security regression. */
public final class JavaScriptAnalysisDelta {
    private final ObjectMapper mapper = new ObjectMapper();

    public ObjectNode compare(JsonNode before, JsonNode after) throws IOException {
        JsonNode a = before.path("javascriptExtraction"), b = after.path("javascriptExtraction");
        if (!a.isObject() || !b.isObject()) throw new IOException("Both inputs require JavaScript source snapshots");
        Map<String, JsonNode> oldSnapshots = snapshots(a), newSnapshots = snapshots(b);
        if (!oldSnapshots.keySet().equals(newSnapshots.keySet()))
            throw new IOException("JavaScript history requires matching repository identities and component boundaries");
        ObjectNode result = mapper.createObjectNode();
        result.put("schemaVersion", 1).put("analysis", "javascript-system-change").put("status", "complete");
        result.put("completionScope", "comparison-of-recorded-source-evidence");
        var components = result.putArray("components");
        var securityChanges = result.putArray("securityChanges");
        var securityCoverage = result.putArray("securityComparisonCoverage");
        boolean securityAvailable = true;
        for (String key : oldSnapshots.keySet()) {
            JsonNode oldSnapshot = oldSnapshots.get(key), newSnapshot = newSnapshots.get(key);
            components.add(new JavaScriptDeltaService().compare(oldSnapshot, newSnapshot));
            if ("backend".equals(oldSnapshot.path("component").path("kind").asText())) {
                boolean available = oldSnapshot.path("security").path("endpoints").isArray()
                        && newSnapshot.path("security").path("endpoints").isArray();
                securityAvailable &= available;
                securityCoverage.addObject().put("component", key).put("status", available ? "complete" : "partial")
                        .put("completionScope", "comparison-of-recorded-source-evidence")
                        .put("beforeAnalysisStatus", oldSnapshot.path("security").path("status").asText("unavailable"))
                        .put("afterAnalysisStatus", newSnapshot.path("security").path("status").asText("unavailable"))
                        .put("reason", available ? "Original source coverage still applies to both compared reports." : "Security evidence is missing in at least one snapshot; no unchanged-security conclusion is available.");
                if (!available) continue;
            }
            Map<String, JsonNode> oldEndpoints = endpoints(oldSnapshot), newEndpoints = endpoints(newSnapshot);
            Set<String> ids = new TreeSet<>(oldEndpoints.keySet()); ids.addAll(newEndpoints.keySet());
            for (String id : ids) {
                JsonNode oldEndpoint = oldEndpoints.get(id), newEndpoint = newEndpoints.get(id);
                ObjectNode oldPolicy = evidence(oldEndpoint), newPolicy = evidence(newEndpoint);
                if (oldPolicy.equals(newPolicy)) continue;
                ObjectNode change = securityChanges.addObject();
                change.put("component", key).put("endpointId", id);
                change.put("change", oldEndpoint == null ? "added" : newEndpoint == null ? "removed" : "observed-policy-changed");
                change.set("before", oldPolicy); change.set("after", newPolicy);
                change.put("interpretation", "Review source policy and coverage; this does not establish a vulnerability or a permission regression.");
            }
        }
        boolean architectureAvailable = a.path("architecture").isObject() && b.path("architecture").isObject();
        if (architectureAvailable) {
            // Saved JSON can narrow a small LongNode to IntNode. Compare the same
            // persisted representation on both sides without changing any limits.
            JsonNode oldArchitecture = mapper.readTree(mapper.writeValueAsBytes(a.path("architecture")));
            JsonNode newArchitecture = mapper.readTree(mapper.writeValueAsBytes(b.path("architecture")));
            result.set("architecture", new JavaScriptArchitectureService().compare(oldArchitecture, newArchitecture));
        }
        if (!architectureAvailable || !securityAvailable) result.put("status", "partial");
        result.putObject("capabilities").put("contracts", "complete")
                .put("architectureComparison", architectureAvailable ? "complete" : "partial")
                .put("securityComparison", securityAvailable ? "complete" : "partial");
        ObjectNode summary = result.putObject("summary").put("components", components.size());
        if (securityAvailable) summary.put("securityObservationsChanged", securityChanges.size());
        else summary.putNull("securityObservationsChanged");
        result.putArray("limitations").add("Source and architecture changes inherit each input's coverage; unchanged evidence does not prove unchanged runtime behavior.")
                .add("Expected business policies and runtime test results are independent inputs to security regression decisions.");
        return result;
    }

    private Map<String, JsonNode> snapshots(JsonNode extraction) throws IOException {
        Map<String, JsonNode> result = new TreeMap<>();
        if (!extraction.path("snapshots").isArray() || extraction.path("snapshots").isEmpty()) throw new IOException("Source snapshots are missing");
        for (JsonNode snapshot : extraction.path("snapshots")) {
            JsonNode c = snapshot.path("component");
            String key = c.path("repositoryURL").asText() + "|" + c.path("kind").asText() + "|" + c.path("name").asText();
            if (result.putIfAbsent(key, snapshot) != null) throw new IOException("Duplicate snapshot identity");
        }
        return result;
    }

    private Map<String, JsonNode> endpoints(JsonNode snapshot) {
        Map<String, JsonNode> result = new TreeMap<>();
        snapshot.path("security").path("endpoints").forEach(e -> result.put(e.path("endpointId").asText(), e));
        return result;
    }

    private ObjectNode evidence(JsonNode endpoint) {
        ObjectNode result = mapper.createObjectNode();
        if (endpoint == null) return result;
        for (String field : List.of("method", "path", "reachability", "effectivePaths", "policyModel"))
            if (endpoint.has(field)) result.set(field, endpoint.get(field));
        result.put("authentication", endpoint.path("authentication").path("status").asText("unknown"));
        for (String field : List.of("roleChecks", "ownershipChecks")) {
            var checks = result.putArray(field);
            for (JsonNode check : endpoint.path(field)) {
                ObjectNode observed = checks.addObject();
                for (String detail : List.of("status", "predicate", "scope", "afterNext"))
                    if (check.has(detail)) observed.set(detail, check.get(detail));
            }
        }
        result.set("coverage", endpoint.path("analysisCoverage").path("capabilities"));
        Set<String> rules = new TreeSet<>();
        endpoint.path("findings").forEach(finding -> rules.add(finding.path("ruleId").asText()));
        result.set("findingRules", mapper.valueToTree(rules));
        return result;
    }
}
