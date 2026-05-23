package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.MissingEvidence;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.graph.GraphService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.graph.GraphModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.node.Link;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.node.Node;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.node.Request;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.patterns.AntiPattern;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Component
public class GraphContextProvider implements EvidenceContextProvider {

    private static final int DEFAULT_MAX_TRANSITIVE_DEPTH = 3;

    private final GraphService graphService;
    private final ObjectMapper objectMapper;

    public GraphContextProvider(GraphService graphService) {
        this.graphService = graphService;
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public String providerId() {
        return "graph-context";
    }

    @Override
    public boolean supports(EvidenceQueryContext context, String question) {
        if (context == null || context.getScope() == null) {
            return false;
        }
        return hasValue(context.getScope().getSystemName())
            || hasValue(context.getScope().getServiceName())
            || hasDependencyQuestionSignal(question);
    }

    @Override
    public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
        EvidenceRetrievalResult result = new EvidenceRetrievalResult();
        List<EvidenceItem> evidence = new ArrayList<>();
        List<MissingEvidence> missing = new ArrayList<>();

        GraphModel graph = resolveGraph(context, missing);
        if (graph == null) {
            result.setMissingEvidence(missing);
            return result;
        }

        Set<Node> nodes = graph.getNodes() == null ? Set.of() : graph.getNodes();
        Set<Link> links = graph.getLinks() == null ? Set.of() : graph.getLinks();
        String graphVersion = graph.getGraphName() + "#" + graph.getInstanceId();

        extractNodeEvidence(nodes, graphVersion, evidence);
        extractLinkEvidence(links, graphVersion, evidence);

        String focusService = resolveFocusService(context, question, nodes);
        if (hasValue(focusService)) {
            extractDependencyEvidenceForFocus(focusService, links, graphVersion, evidence, missing);
        } else if (hasDependencyQuestionSignal(question)) {
            missing.add(new MissingEvidence(
                EvidenceArtifactType.DEPENDENCY,
                "No focus service identified for dependency query.",
                "selectedService|serviceName in question"
            ));
        }

        result.setEvidenceItems(evidence);
        result.setMissingEvidence(missing);
        return result;
    }

    private GraphModel resolveGraph(EvidenceQueryContext context, List<MissingEvidence> missing) {
        if (context == null || context.getScope() == null) {
            missing.add(new MissingEvidence(EvidenceArtifactType.GRAPH, "No active scope for graph lookup.", "systemName"));
            return null;
        }

        String systemName = context.getScope().getSystemName();
        if (!hasValue(systemName)) {
            missing.add(new MissingEvidence(EvidenceArtifactType.GRAPH, "Graph lookup requires active systemName.", "systemName"));
            return null;
        }

        List<GraphModel> graphs = graphService.getAllInstancesOfGraph(systemName.trim());
        if (graphs == null || graphs.isEmpty()) {
            missing.add(new MissingEvidence(EvidenceArtifactType.GRAPH, "No graph instances found for active system.", systemName));
            return null;
        }

        return graphs.stream()
            .sorted(Comparator
                .comparing(GraphModel::getModifyDate, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(GraphModel::getInstanceId, Comparator.nullsLast(Comparator.naturalOrder())))
            .reduce((first, second) -> second)
            .orElse(null);
    }

    private void extractNodeEvidence(Set<Node> nodes, String graphVersion, List<EvidenceItem> evidence) {
        for (Node node : nodes) {
            String nodeName = node == null ? null : node.getNodeName();
            if (!hasValue(nodeName)) {
                continue;
            }
            EvidenceItem item = new EvidenceItem();
            item.setArtifactType(EvidenceArtifactType.GRAPH);
            item.setArtifactId("graph-node:" + nodeName);
            item.setArtifactVersion(graphVersion);
            item.setLocationHint("nodes[" + nodeName + "]");
            item.setEntityType("GRAPH_NODE");
            item.setEntityName(nodeName);
            item.setServiceName(nodeName);
            item.setContentText("Graph node present: " + nodeName + " (type=" + safe(node.getNodeType()) + ")");
            item.setConfidenceSource("graph-explicit");
            item.setSupportStrength(1.0);

            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("nodeName", nodeName);
            payload.put("nodeType", safe(node.getNodeType()));
            ArrayNode antiPatterns = payload.putArray("antiPatterns");
            List<String> patternNames = antiPatternNames(node.getPatterns());
            for (String p : patternNames) {
                antiPatterns.add(p);
            }
            item.setStructuredPayload(payload);
            evidence.add(item);

            for (String pattern : patternNames) {
                EvidenceItem antiPatternEvidence = new EvidenceItem();
                antiPatternEvidence.setArtifactType(EvidenceArtifactType.ARCHITECTURE);
                antiPatternEvidence.setArtifactId("graph-antipattern:" + nodeName + ":" + pattern);
                antiPatternEvidence.setArtifactVersion(graphVersion);
                antiPatternEvidence.setLocationHint("nodes[" + nodeName + "].patterns");
                antiPatternEvidence.setEntityType("ANTI_PATTERN");
                antiPatternEvidence.setEntityName(pattern);
                antiPatternEvidence.setServiceName(nodeName);
                antiPatternEvidence.setContentText("Graph anti-pattern marker on node " + nodeName + ": " + pattern);
                antiPatternEvidence.setConfidenceSource("graph-explicit");
                antiPatternEvidence.setSupportStrength(1.0);
                ObjectNode antiPayload = objectMapper.createObjectNode();
                antiPayload.put("antiPattern", pattern);
                antiPayload.put("nodeName", nodeName);
                antiPayload.put("sourceType", "GRAPH_NODE");
                antiPatternEvidence.setStructuredPayload(antiPayload);
                evidence.add(antiPatternEvidence);
            }
        }
    }

    private void extractLinkEvidence(Set<Link> links, String graphVersion, List<EvidenceItem> evidence) {
        for (Link link : links) {
            if (link == null || !hasValue(link.getSource()) || !hasValue(link.getTarget())) {
                continue;
            }

            EvidenceItem item = new EvidenceItem();
            item.setArtifactType(EvidenceArtifactType.DEPENDENCY);
            item.setArtifactId("graph-link:" + link.getSource() + "->" + link.getTarget());
            item.setArtifactVersion(graphVersion);
            item.setLocationHint("links[" + link.getSource() + "->" + link.getTarget() + "]");
            item.setEntityType("GRAPH_LINK");
            item.setEntityName(link.getSource() + " -> " + link.getTarget());
            item.setServiceName(link.getSource());
            item.setEndpointPath(link.getTarget());
            item.setConfidenceSource("graph-explicit");
            item.setSupportStrength(1.0);

            String linkType = linkType(link);
            item.setHttpMethod(linkType);
            item.setContentText("Explicit graph dependency: " + link.getSource() + " -> " + link.getTarget()
                + " (linkType=" + linkType + ", weight=" + requestWeight(link) + ")");

            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("source", link.getSource());
            payload.put("target", link.getTarget());
            payload.put("linkType", linkType);
            payload.put("weight", requestWeight(link));
            payload.put("explicit", true);
            ArrayNode requests = payload.putArray("requests");
            if (link.getRequests() != null) {
                for (Request request : link.getRequests()) {
                    if (request == null) continue;
                    ObjectNode req = objectMapper.createObjectNode();
                    req.put("type", safe(request.getType()));
                    req.put("argument", safe(request.getArgument()));
                    req.put("endpointFunction", safe(request.getEndpointFunction()));
                    req.put("msReturn", safe(request.getMsReturn()));
                    requests.add(req);
                }
            }
            item.setStructuredPayload(payload);
            evidence.add(item);
        }
    }

    private void extractDependencyEvidenceForFocus(
        String focusService,
        Set<Link> links,
        String graphVersion,
        List<EvidenceItem> evidence,
        List<MissingEvidence> missing
    ) {
        Map<String, List<Link>> outgoing = new HashMap<>();
        Map<String, List<Link>> incoming = new HashMap<>();
        Set<String> allServices = new HashSet<>();

        for (Link link : links) {
            if (link == null || !hasValue(link.getSource()) || !hasValue(link.getTarget())) {
                continue;
            }
            outgoing.computeIfAbsent(link.getSource(), k -> new ArrayList<>()).add(link);
            incoming.computeIfAbsent(link.getTarget(), k -> new ArrayList<>()).add(link);
            allServices.add(link.getSource());
            allServices.add(link.getTarget());
        }

        if (!allServices.contains(focusService)) {
            missing.add(new MissingEvidence(
                EvidenceArtifactType.DEPENDENCY,
                "Focus service is not present in active graph.",
                focusService
            ));
            return;
        }

        List<Link> direct = outgoing.getOrDefault(focusService, List.of());
        for (int i = 0; i < direct.size(); i++) {
            Link link = direct.get(i);
            evidence.add(pathEvidence(
                graphVersion,
                "direct:" + focusService + ":" + i,
                "directDependencies[" + i + "]",
                "DIRECT_DEPENDENCY",
                focusService,
                link.getTarget(),
                List.of(focusService, link.getTarget()),
                false,
                "Explicit direct dependency from " + focusService + " to " + link.getTarget()
            ));
        }

        List<Link> reverse = incoming.getOrDefault(focusService, List.of());
        for (int i = 0; i < reverse.size(); i++) {
            Link link = reverse.get(i);
            evidence.add(pathEvidence(
                graphVersion,
                "reverse:" + focusService + ":" + i,
                "reverseDependencies[" + i + "]",
                "REVERSE_DEPENDENCY",
                link.getSource(),
                focusService,
                List.of(link.getSource(), focusService),
                false,
                "Explicit reverse dependency on " + focusService + " from " + link.getSource()
            ));
        }

        List<List<String>> transitivePaths = collectTransitivePaths(focusService, outgoing, DEFAULT_MAX_TRANSITIVE_DEPTH);
        for (int i = 0; i < transitivePaths.size(); i++) {
            List<String> path = transitivePaths.get(i);
            if (path.size() < 3) {
                continue;
            }
            evidence.add(pathEvidence(
                graphVersion,
                "transitive:" + focusService + ":" + i,
                "transitivePaths[" + i + "]",
                "TRANSITIVE_PATH",
                focusService,
                path.get(path.size() - 1),
                path,
                true,
                "Inferred transitive dependency path from explicit links: " + String.join(" -> ", path)
            ));
        }
    }

    private EvidenceItem pathEvidence(
        String graphVersion,
        String artifactId,
        String location,
        String entityType,
        String source,
        String target,
        List<String> path,
        boolean inferred,
        String summary
    ) {
        EvidenceItem item = new EvidenceItem();
        item.setArtifactType(EvidenceArtifactType.DEPENDENCY);
        item.setArtifactId(artifactId);
        item.setArtifactVersion(graphVersion);
        item.setLocationHint(location);
        item.setEntityType(entityType);
        item.setEntityName(source + " -> " + target);
        item.setServiceName(source);
        item.setEndpointPath(target);
        item.setConfidenceSource(inferred ? "graph-inferred-transitive" : "graph-explicit");
        item.setSupportStrength(inferred ? 0.8 : 1.0);
        item.setContentText(summary);

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("source", source);
        payload.put("target", target);
        payload.put("inferred", inferred);
        ArrayNode pathNodes = payload.putArray("path");
        for (String p : path) {
            pathNodes.add(p);
        }
        item.setStructuredPayload(payload);
        return item;
    }

    private List<List<String>> collectTransitivePaths(String start, Map<String, List<Link>> outgoing, int maxDepth) {
        List<List<String>> results = new ArrayList<>();
        ArrayDeque<List<String>> queue = new ArrayDeque<>();
        queue.add(List.of(start));

        while (!queue.isEmpty()) {
            List<String> path = queue.poll();
            String current = path.get(path.size() - 1);
            if (path.size() - 1 >= maxDepth) {
                continue;
            }
            for (Link link : outgoing.getOrDefault(current, List.of())) {
                String next = link.getTarget();
                if (!hasValue(next) || path.contains(next)) {
                    continue;
                }
                List<String> nextPath = new ArrayList<>(path);
                nextPath.add(next);
                queue.add(nextPath);
                if (nextPath.size() >= 3) {
                    results.add(nextPath);
                }
            }
        }

        return results;
    }

    private String resolveFocusService(EvidenceQueryContext context, String question, Set<Node> nodes) {
        if (context != null && context.getScope() != null && hasValue(context.getScope().getServiceName())) {
            return context.getScope().getServiceName().trim();
        }

        String q = question == null ? "" : question.toLowerCase(Locale.ROOT);
        for (Node node : nodes) {
            if (node != null && hasValue(node.getNodeName()) && q.contains(node.getNodeName().toLowerCase(Locale.ROOT))) {
                return node.getNodeName();
            }
        }
        return null;
    }

    private boolean hasDependencyQuestionSignal(String question) {
        if (question == null || question.isBlank()) {
            return false;
        }
        String q = question.toLowerCase(Locale.ROOT);
        return q.contains("depends on")
            || q.contains("what depends")
            || q.contains("what does")
            || q.contains("call")
            || q.contains("dependency")
            || q.contains("transitive")
            || q.contains("indirect");
    }

    private int requestWeight(Link link) {
        return link.getRequests() == null ? 0 : link.getRequests().size();
    }

    private String linkType(Link link) {
        if (link.getRequests() == null || link.getRequests().isEmpty()) {
            return "UNKNOWN";
        }
        return safe(link.getRequests().get(0).getType()).toUpperCase(Locale.ROOT);
    }

    private List<String> antiPatternNames(Set<AntiPattern> patterns) {
        if (patterns == null || patterns.isEmpty()) {
            return List.of();
        }
        List<String> names = new ArrayList<>();
        for (AntiPattern pattern : patterns) {
            if (pattern != null) {
                names.add(pattern.getClass().getSimpleName());
            }
        }
        return names;
    }

    private String safe(String value) {
        return value == null ? "n/a" : value;
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }
}
