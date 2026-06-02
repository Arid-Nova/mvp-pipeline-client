package edu.baylor.ecs.cloudhubs.chatbot.retrieval;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotMessage;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.MissingEvidence;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Component
public class HybridRetriever {

    private static final Pattern SERVICE_PATTERN = Pattern.compile("\\b([a-zA-Z0-9_-]*service[a-zA-Z0-9_-]*)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ENDPOINT_PATTERN = Pattern.compile("(/[a-zA-Z0-9_\\-/{}]+)");
    private static final Pattern METHOD_PATH_PATTERN = Pattern.compile("\\b(GET|POST|PUT|PATCH|DELETE)\\s+(/[a-zA-Z0-9_\\-/{}]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern FOLLOW_UP_PRONOUN_PATTERN = Pattern.compile("\\b(it|that service|that endpoint|that one|them)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern AGGREGATE_MICROSERVICE_PATTERN = Pattern.compile(
        "\\b(how many|count|number of|list|show)\\s+(micro\\s*services?|microservices?|services?)\\b",
        Pattern.CASE_INSENSITIVE
    );
    private static final List<String> RISK_TERMS = List.of(
        "risk", "smell", "anti-pattern", "antipattern", "bottleneck", "cycle", "coupled", "architecture issue"
    );
    private static final Set<String> GENERIC_ENTITY_TERMS = Set.of(
        "service", "services", "microservice", "microservices", "system", "architecture", "component", "components", "endpoint", "endpoints"
    );

    public HybridRetrievalResult retrieve(
        String question,
        EvidenceQueryContext context,
        List<EvidenceItem> evidenceItems,
        List<MissingEvidence> upstreamMissingEvidence
    ) {
        String safeQuestion = question == null ? "" : question.trim();
        List<EvidenceItem> safeEvidence = evidenceItems == null ? List.of() : evidenceItems;

        QuestionIntent intent = classify(safeQuestion);
        List<String> queryEntities = extractQueryEntities(safeQuestion, context);

        List<EvidenceItem> structured = structuredLookup(safeQuestion, queryEntities, safeEvidence);
        boolean strictLookup = requiresStrictEntityMatch(intent, queryEntities);
        RetrievalStrategy strategy = structured.isEmpty() ? RetrievalStrategy.TEXT_RANKED : RetrievalStrategy.STRUCTURED;
        List<EvidenceItem> selected;
        if (!structured.isEmpty()) {
            selected = structured;
        } else if (strictLookup) {
            selected = List.of();
        } else {
            selected = rankTextFallback(safeQuestion, safeEvidence);
        }

        List<MissingEvidence> missing = new ArrayList<>();
        if (upstreamMissingEvidence != null) {
            missing.addAll(upstreamMissingEvidence);
        }

        if (selected.isEmpty() && !queryEntities.isEmpty()) {
            missing.add(new MissingEvidence(
                missingTypeForIntent(intent),
                "No evidence matched requested entity in active scope.",
                String.join(",", queryEntities)
            ));
        }

        if (intent == QuestionIntent.UNSUPPORTED_SPECULATIVE) {
            missing.add(new MissingEvidence(
                EvidenceArtifactType.UNKNOWN,
                "Question appears speculative or unsupported by architecture evidence retriever.",
                safeQuestion
            ));
        }

        HybridRetrievalResult result = new HybridRetrievalResult();
        result.setIntent(intent);
        result.setStrategy(selected.isEmpty() ? RetrievalStrategy.NONE : strategy);
        result.setMatchedEntities(queryEntities);
        result.setRankedEvidence(selected);
        result.setEvidenceCount(selected.size());
        result.setMissingEvidence(dedupeMissing(missing));
        return result;
    }

    private QuestionIntent classify(String question) {
        String q = question == null ? "" : question.toLowerCase(Locale.ROOT);
        if (q.isBlank()) {
            return QuestionIntent.UNSUPPORTED_SPECULATIVE;
        }
        if (q.contains("topology") || q.contains("system architecture") || q.contains("system design") || q.contains("component diagram")) {
            return QuestionIntent.ARCHITECTURE_TOPOLOGY;
        }
        if (AGGREGATE_MICROSERVICE_PATTERN.matcher(question == null ? "" : question).find()) {
            return QuestionIntent.ARCHITECTURE_TOPOLOGY;
        }
        if (q.contains("depends on") || q.contains("what depends") || q.contains("transitive") || q.contains("call")) {
            return QuestionIntent.DEPENDENCY;
        }
        if (METHOD_PATH_PATTERN.matcher(question).find() || q.contains("endpoint") || q.contains("url") || q.contains("route")) {
            return QuestionIntent.ENDPOINT_LOOKUP;
        }
        if (SERVICE_PATTERN.matcher(question).find() || q.contains("service")) {
            return QuestionIntent.SERVICE_LOOKUP;
        }
        if (q.contains("architecture") || q.contains("system") || q.contains("component")) {
            return QuestionIntent.ARCHITECTURE_TOPOLOGY;
        }
        return QuestionIntent.UNSUPPORTED_SPECULATIVE;
    }

    private List<String> extractQueryEntities(String question, EvidenceQueryContext context) {
        Set<String> entities = new HashSet<>();
        if (context != null && context.getScope() != null) {
            addIfValue(entities, context.getScope().getServiceName());
            addIfValue(entities, context.getScope().getEndpointPath());
            addIfValue(entities, context.getScope().getEntityName());
        }

        Matcher serviceMatcher = SERVICE_PATTERN.matcher(question == null ? "" : question);
        while (serviceMatcher.find()) {
            addEntityIfSpecific(entities, serviceMatcher.group(1));
        }

        Matcher endpointMatcher = ENDPOINT_PATTERN.matcher(question == null ? "" : question);
        while (endpointMatcher.find()) {
            addIfValue(entities, endpointMatcher.group(1));
        }

        Matcher methodPath = METHOD_PATH_PATTERN.matcher(question == null ? "" : question);
        while (methodPath.find()) {
            addIfValue(entities, methodPath.group(1).toUpperCase(Locale.ROOT) + " " + methodPath.group(2));
            addIfValue(entities, methodPath.group(2));
        }

        if (isFollowUpPronounQuestion(question)) {
            for (String entity : citedEntitiesFromHistory(context)) {
                addIfValue(entities, entity);
            }
            if (entities.isEmpty()) {
                for (String entity : previousQuestionEntitiesFromHistory(context)) {
                    addIfValue(entities, entity);
                }
            }
        }

        return entities.stream().sorted().toList();
    }

    private boolean isFollowUpPronounQuestion(String question) {
        if (question == null || question.isBlank()) {
            return false;
        }
        return FOLLOW_UP_PRONOUN_PATTERN.matcher(question).find();
    }

    private List<String> citedEntitiesFromHistory(EvidenceQueryContext context) {
        if (context == null || context.getConversationHistory() == null) {
            return List.of();
        }
        Set<String> entities = new HashSet<>();
        for (ChatbotMessage message : context.getConversationHistory()) {
            if (message == null || message.getContent() == null) {
                continue;
            }
            String content = message.getContent();
            String marker = "CITED_ENTITIES:";
            int idx = content.indexOf(marker);
            if (idx < 0) {
                continue;
            }
            String line = content.substring(idx + marker.length()).split("\\n")[0].trim();
            if (line.equalsIgnoreCase("none") || line.isBlank()) {
                continue;
            }
            for (String token : line.split(",")) {
                addIfValue(entities, token);
            }
        }
        return entities.stream().toList();
    }

    private List<String> previousQuestionEntitiesFromHistory(EvidenceQueryContext context) {
        if (context == null || context.getConversationHistory() == null) {
            return List.of();
        }
        Set<String> entities = new HashSet<>();
        for (ChatbotMessage message : context.getConversationHistory()) {
            if (message == null || message.getContent() == null) {
                continue;
            }
            String content = message.getContent();
            String marker = "PREV_USER_QUESTION:";
            int idx = content.indexOf(marker);
            if (idx < 0) {
                continue;
            }
            String line = content.substring(idx + marker.length()).split("\\n")[0].trim();
            Matcher serviceMatcher = SERVICE_PATTERN.matcher(line);
            while (serviceMatcher.find()) {
                addIfValue(entities, serviceMatcher.group(1));
            }
            Matcher endpointMatcher = ENDPOINT_PATTERN.matcher(line);
            while (endpointMatcher.find()) {
                addIfValue(entities, endpointMatcher.group(1));
            }
        }
        return entities.stream().toList();
    }

    private List<EvidenceItem> structuredLookup(String question, List<String> entities, List<EvidenceItem> evidenceItems) {
        if (entities.isEmpty() || evidenceItems.isEmpty()) {
            return List.of();
        }

        List<EvidenceItem> matches = new ArrayList<>();
        String qUpper = question == null ? "" : question.toUpperCase(Locale.ROOT);
        for (EvidenceItem item : evidenceItems) {
            for (String entity : entities) {
                if (matchesServiceExact(item, entity)
                    || matchesServiceIgnoreCase(item, entity)
                    || matchesEndpointPath(item, entity)
                    || matchesMethodAndPath(item, entity, qUpper)
                    || matchesEntityName(item, entity)) {
                    matches.add(item);
                    break;
                }
            }
        }

        return matches.stream()
            .distinct()
            .sorted(structuredComparator())
            .toList();
    }

    private List<EvidenceItem> rankTextFallback(String question, List<EvidenceItem> evidenceItems) {
        if (evidenceItems.isEmpty()) {
            return List.of();
        }

        List<String> qTokens = tokens(question);
        boolean riskQuestion = isRiskOrAntiPatternQuestion(question);
        Map<EvidenceItem, Double> scores = new HashMap<>();
        for (EvidenceItem item : evidenceItems) {
            double score = tokenOverlapScore(qTokens, item)
                + entityOverlapScore(qTokens, item)
                + artifactPriorityScore(item)
                + recencyScore(item)
                + antiPatternBoost(item, riskQuestion);
            scores.put(item, score);
        }

        return evidenceItems.stream()
            .sorted(Comparator
                .comparingDouble((EvidenceItem item) -> scores.getOrDefault(item, 0.0)).reversed()
                .thenComparing((EvidenceItem item) -> artifactRank(item), Comparator.reverseOrder())
                .thenComparing(item -> safe(item.getArtifactId()))
                .thenComparing(item -> safe(item.getLocationHint())))
            .collect(Collectors.toList());
    }

    private Comparator<EvidenceItem> structuredComparator() {
        return Comparator
            .comparing(this::artifactRank)
            .reversed()
            .thenComparing((EvidenceItem item) -> safe(item.getServiceName()), String.CASE_INSENSITIVE_ORDER)
            .thenComparing((EvidenceItem item) -> safe(item.getEndpointPath()), String.CASE_INSENSITIVE_ORDER)
            .thenComparing(item -> safe(item.getArtifactId()));
    }

    private boolean matchesServiceExact(EvidenceItem item, String entity) {
        return hasValue(entity) && entity.equals(safe(item.getServiceName()));
    }

    private boolean matchesServiceIgnoreCase(EvidenceItem item, String entity) {
        return hasValue(entity) && entity.equalsIgnoreCase(safe(item.getServiceName()));
    }

    private boolean matchesEndpointPath(EvidenceItem item, String entity) {
        return hasValue(entity)
            && hasValue(item.getEndpointPath())
            && safe(item.getEndpointPath()).equalsIgnoreCase(entity);
    }

    private boolean matchesMethodAndPath(EvidenceItem item, String entity, String qUpper) {
        if (!hasValue(item.getHttpMethod()) || !hasValue(item.getEndpointPath())) {
            return false;
        }
        String methodPath = item.getHttpMethod().toUpperCase(Locale.ROOT) + " " + item.getEndpointPath();
        return methodPath.equalsIgnoreCase(entity)
            || qUpper.contains(methodPath.toUpperCase(Locale.ROOT));
    }

    private boolean matchesEntityName(EvidenceItem item, String entity) {
        return hasValue(entity)
            && ((hasValue(item.getEntityName()) && item.getEntityName().equalsIgnoreCase(entity))
            || (hasValue(item.getArtifactName()) && item.getArtifactName().equalsIgnoreCase(entity)));
    }

    private double tokenOverlapScore(List<String> qTokens, EvidenceItem item) {
        if (qTokens.isEmpty()) {
            return 0;
        }
        Set<String> textTokens = new HashSet<>(tokens(joinText(item)));
        long overlap = qTokens.stream().filter(textTokens::contains).count();
        return overlap * 1.2;
    }

    private double entityOverlapScore(List<String> qTokens, EvidenceItem item) {
        Set<String> entityTokens = new HashSet<>(tokens(safe(item.getEntityName()) + " " + safe(item.getServiceName()) + " " + safe(item.getEndpointPath())));
        long overlap = qTokens.stream().filter(entityTokens::contains).count();
        return overlap * 1.8;
    }

    private double artifactPriorityScore(EvidenceItem item) {
        return artifactRank(item) * 0.3;
    }

    private double recencyScore(EvidenceItem item) {
        Instant ts = item.getTimestamp();
        if (ts != null) {
            return ts.toEpochMilli() / 1_000_000_000_000.0;
        }
        if (hasValue(item.getCommitId()) || hasValue(item.getArtifactVersion())) {
            return 0.15;
        }
        return 0.0;
    }

    private double antiPatternBoost(EvidenceItem item, boolean riskQuestion) {
        if (!riskQuestion || item == null) {
            return 0;
        }
        if (isAntiPatternEvidence(item)) {
            return 3.0;
        }
        return 0;
    }

    private boolean isRiskOrAntiPatternQuestion(String question) {
        String q = question == null ? "" : question.toLowerCase(Locale.ROOT);
        for (String term : RISK_TERMS) {
            if (q.contains(term)) {
                return true;
            }
        }
        return false;
    }

    private boolean isAntiPatternEvidence(EvidenceItem item) {
        if (item == null) {
            return false;
        }
        if ("ANTI_PATTERN".equalsIgnoreCase(safe(item.getEntityType()))) {
            return true;
        }
        if (item.getStructuredPayload() != null) {
            if (item.getStructuredPayload().has("antiPattern")) {
                return true;
            }
            if (item.getStructuredPayload().has("antiPatterns")
                && item.getStructuredPayload().path("antiPatterns").isArray()
                && item.getStructuredPayload().path("antiPatterns").size() > 0) {
                return true;
            }
        }
        String text = (safe(item.getContentText()) + " " + safe(item.getEntityName())).toLowerCase(Locale.ROOT);
        return text.contains("anti-pattern")
            || text.contains("antipattern")
            || text.contains("bottleneck")
            || text.contains("cyclic")
            || text.contains("megaservice")
            || text.contains("coupling");
    }

    private int artifactRank(EvidenceItem item) {
        if (item == null || item.getArtifactType() == null) {
            return 0;
        }
        return switch (item.getArtifactType()) {
            case ENDPOINT -> 6;
            case SERVICE -> 5;
            case DEPENDENCY -> 4;
            case ARCHITECTURE -> 3;
            case GRAPH -> 2;
            case IR -> 1;
            default -> 0;
        };
    }

    private List<MissingEvidence> dedupeMissing(List<MissingEvidence> missing) {
        Map<String, MissingEvidence> map = new HashMap<>();
        for (MissingEvidence m : missing) {
            if (m == null) continue;
            String key = safe(m.getArtifactType() == null ? null : m.getArtifactType().name()) + "|" + safe(m.getReason()) + "|" + safe(m.getExpectedIdentifier());
            map.putIfAbsent(key, m);
        }
        return map.values().stream()
            .sorted(Comparator.comparing(m -> safe(m.getExpectedIdentifier())))
            .toList();
    }

    private EvidenceArtifactType missingTypeForIntent(QuestionIntent intent) {
        return switch (intent) {
            case ENDPOINT_LOOKUP -> EvidenceArtifactType.ENDPOINT;
            case SERVICE_LOOKUP -> EvidenceArtifactType.SERVICE;
            case DEPENDENCY -> EvidenceArtifactType.DEPENDENCY;
            case ARCHITECTURE_TOPOLOGY -> EvidenceArtifactType.ARCHITECTURE;
            default -> EvidenceArtifactType.UNKNOWN;
        };
    }

    private boolean requiresStrictEntityMatch(QuestionIntent intent, List<String> queryEntities) {
        if (queryEntities == null || queryEntities.isEmpty()) {
            return false;
        }
        return intent == QuestionIntent.SERVICE_LOOKUP
            || intent == QuestionIntent.ENDPOINT_LOOKUP
            || intent == QuestionIntent.DEPENDENCY;
    }

    private List<String> tokens(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        return List.of(text.toLowerCase(Locale.ROOT).split("[^a-z0-9_/{}-]+"))
            .stream()
            .filter(this::hasValue)
            .toList();
    }

    private String joinText(EvidenceItem item) {
        return safe(item.getContentText()) + " "
            + safe(item.getEntityName()) + " "
            + safe(item.getServiceName()) + " "
            + safe(item.getEndpointPath()) + " "
            + safe(item.getLocationHint()) + " "
            + safe(item.getArtifactTypeValue());
    }

    private void addIfValue(Set<String> entities, String value) {
        if (hasValue(value)) {
            entities.add(value.trim());
        }
    }

    private void addEntityIfSpecific(Set<String> entities, String value) {
        if (!hasValue(value)) {
            return;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        if (GENERIC_ENTITY_TERMS.contains(normalized)) {
            return;
        }
        entities.add(value.trim());
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
