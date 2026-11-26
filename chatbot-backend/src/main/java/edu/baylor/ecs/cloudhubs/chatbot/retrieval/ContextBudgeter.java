package edu.baylor.ecs.cloudhubs.chatbot.retrieval;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.retrieval.model.ContextBudgetResult;
import edu.baylor.ecs.cloudhubs.chatbot.retrieval.model.QuestionIntent;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Component
public class ContextBudgeter {

    public ContextBudgetResult budget(
        List<EvidenceItem> rankedEvidence,
        List<String> matchedEntities,
        QuestionIntent intent,
        int maxEvidenceItems,
        int maxEvidenceChars
    ) {
        List<EvidenceItem> safeEvidence = rankedEvidence == null ? List.of() : rankedEvidence;
        List<RankedCandidate> sorted = sortCandidates(safeEvidence, intent);

        Map<EvidenceItem, Integer> charEstimates = new IdentityHashMap<>();
        for (RankedCandidate c : sorted) {
            charEstimates.put(c.item(), estimateChars(c.item()));
        }

        List<EvidenceItem> retained = new ArrayList<>();
        Set<Integer> retainedIndexes = new HashSet<>();
        int usedChars = 0;

        RankedCandidate directMatch = firstDirectMatch(sorted, matchedEntities);
        if (directMatch != null && maxEvidenceItems > 0) {
            int chars = charEstimates.get(directMatch.item());
            if (chars <= maxEvidenceChars) {
                retained.add(directMatch.item());
                retainedIndexes.add(directMatch.originalIndex());
                usedChars += chars;
            }
        }

        for (RankedCandidate candidate : sorted) {
            if (retainedIndexes.contains(candidate.originalIndex())) {
                continue;
            }
            if (retained.size() >= maxEvidenceItems) {
                break;
            }
            int chars = charEstimates.get(candidate.item());
            if (usedChars + chars > maxEvidenceChars) {
                continue;
            }
            retained.add(candidate.item());
            retainedIndexes.add(candidate.originalIndex());
            usedChars += chars;
        }

        Map<String, Integer> omittedByType = new HashMap<>();
        for (int i = 0; i < safeEvidence.size(); i++) {
            if (!retainedIndexes.contains(i)) {
                String type = safeEvidence.get(i).getArtifactTypeValue();
                omittedByType.put(type, omittedByType.getOrDefault(type, 0) + 1);
            }
        }

        Map<EvidenceItem, Integer> sortedIndexMap = new HashMap<>();
        for (int i = 0; i < sorted.size(); i++) {
            sortedIndexMap.put(sorted.get(i).item(), i);
        }
        retained = retained.stream()
            .sorted(Comparator
                .comparingInt((EvidenceItem item) -> sortedIndexMap.getOrDefault(item, Integer.MAX_VALUE))
                .thenComparing(item -> safe(item.getArtifactId()))
                .thenComparing(item -> safe(item.getLocationHint())))
            .toList();

        ContextBudgetResult result = new ContextBudgetResult();
        result.setRetainedEvidence(retained);
        result.setOriginalEvidenceCount(safeEvidence.size());
        result.setRetainedEvidenceCount(retained.size());
        result.setTruncated(retained.size() < safeEvidence.size());
        result.setOmittedArtifactTypeCounts(omittedByType);
        result.setMaxEvidenceItems(maxEvidenceItems);
        result.setMaxEvidenceChars(maxEvidenceChars);
        return result;
    }

    private List<RankedCandidate> sortCandidates(List<EvidenceItem> evidence, QuestionIntent intent) {
        List<RankedCandidate> candidates = new ArrayList<>();
        for (int i = 0; i < evidence.size(); i++) {
            candidates.add(new RankedCandidate(evidence.get(i), i));
        }

        return candidates.stream()
            .sorted(Comparator
                .comparingDouble((RankedCandidate c) -> score(c.item(), c.originalIndex(), intent)).reversed()
                .thenComparing((RankedCandidate c) -> artifactPriority(c.item(), intent), Comparator.reverseOrder())
                .thenComparing(c -> safe(c.item().getArtifactId()))
                .thenComparing(c -> safe(c.item().getLocationHint()))
                .thenComparingInt(RankedCandidate::originalIndex))
            .toList();
    }

    private double score(EvidenceItem item, int originalIndex, QuestionIntent intent) {
        double baseRankScore = 10000 - originalIndex;
        double explicitBonus = isInferred(item) ? -100 : 100;
        double priorityBonus = artifactPriority(item, intent) * 10.0;
        return baseRankScore + explicitBonus + priorityBonus;
    }

    private int artifactPriority(EvidenceItem item, QuestionIntent intent) {
        if (item == null || item.getArtifactType() == null) {
            return 0;
        }
        EvidenceArtifactType type = item.getArtifactType();
        return switch (intent) {
            case ARCHITECTURE_TOPOLOGY, DEPENDENCY -> switch (type) {
                case IR -> 10;
                case GRAPH -> 9;
                case DEPENDENCY -> 8;
                case ARCHITECTURE -> 7;
                case SERVICE -> 6;
                case ENDPOINT -> 5;
                default -> 1;
            };
            case SERVICE_LOOKUP -> switch (type) {
                case SERVICE -> 10;
                case IR -> 8;
                case GRAPH -> 7;
                case DEPENDENCY -> 6;
                case ENDPOINT -> 5;
                default -> 1;
            };
            case ENDPOINT_LOOKUP -> switch (type) {
                case ENDPOINT -> 10;
                case IR -> 8;
                case GRAPH -> 7;
                case DEPENDENCY -> 6;
                case SERVICE -> 5;
                default -> 1;
            };
            default -> switch (type) {
                case IR -> 8;
                case GRAPH -> 7;
                case SERVICE -> 6;
                case ENDPOINT -> 5;
                case DEPENDENCY -> 4;
                default -> 1;
            };
        };
    }

    private RankedCandidate firstDirectMatch(List<RankedCandidate> sorted, List<String> matchedEntities) {
        if (matchedEntities == null || matchedEntities.isEmpty()) {
            return null;
        }
        for (RankedCandidate candidate : sorted) {
            if (isDirectMatch(candidate.item(), matchedEntities)) {
                return candidate;
            }
        }
        return null;
    }

    private boolean isDirectMatch(EvidenceItem item, List<String> entities) {
        for (String entity : entities) {
            if (!hasValue(entity)) {
                continue;
            }
            String e = entity.toLowerCase(Locale.ROOT);
            if (safe(item.getServiceName()).toLowerCase(Locale.ROOT).equals(e)
                || safe(item.getEntityName()).toLowerCase(Locale.ROOT).equals(e)
                || safe(item.getEndpointPath()).toLowerCase(Locale.ROOT).equals(e)
                || (hasValue(item.getHttpMethod())
                    && hasValue(item.getEndpointPath())
                    && (item.getHttpMethod() + " " + item.getEndpointPath()).toLowerCase(Locale.ROOT).equals(e))) {
                return true;
            }
            if ("WORKFLOW_CARD".equalsIgnoreCase(safe(item.getEntityType()))
                && containsEntityText(item.getContent(), e)) {
                return true;
            }
        }
        return false;
    }

    private boolean containsEntityText(String content, String entity) {
        String normalized = safe(content).toLowerCase(Locale.ROOT);
        int fromIndex = 0;
        while (fromIndex < normalized.length()) {
            int index = normalized.indexOf(entity, fromIndex);
            if (index < 0) return false;
            int end = index + entity.length();
            boolean leftBoundary = index == 0 || !Character.isLetterOrDigit(normalized.charAt(index - 1));
            boolean rightBoundary = end == normalized.length() || !Character.isLetterOrDigit(normalized.charAt(end));
            if (leftBoundary && rightBoundary) return true;
            fromIndex = index + 1;
        }
        return false;
    }

    private boolean isInferred(EvidenceItem item) {
        String source = safe(item.getConfidenceSource()).toLowerCase(Locale.ROOT);
        return source.contains("inferred") || source.contains("fallback");
    }

    private int estimateChars(EvidenceItem item) {
        // Estimate the prompt representation, not the source object. The prompt renderer emits
        // these fields and a fixed record wrapper; it does not serialize structuredPayload.
        return 192
            + promptValueLength(item.getArtifactTypeValue())
            + promptValueLength(item.getArtifactId())
            + promptValueLength(item.getArtifactVersion())
            + promptValueLength(item.getLocationHint())
            + promptValueLength(item.getEntityName())
            + promptValueLength(item.getServiceName())
            + promptValueLength(item.getEndpointPath())
            + promptValueLength(extractAntiPatternMarkers(item))
            + promptValueLength(item.getContent());
    }

    private int promptValueLength(String value) {
        return value == null || value.isBlank() ? 3 : value.length();
    }

    private String extractAntiPatternMarkers(EvidenceItem item) {
        if (item == null || item.getStructuredPayload() == null) {
            return null;
        }
        var payload = item.getStructuredPayload();
        List<String> markers = new ArrayList<>();
        if (payload.has("antiPattern") && payload.path("antiPattern").isTextual()) {
            markers.add(payload.path("antiPattern").asText());
        }
        if (payload.has("antiPatterns") && payload.path("antiPatterns").isArray()) {
            payload.path("antiPatterns").forEach(node -> {
                if (node.isTextual()) {
                    markers.add(node.asText());
                }
            });
        }
        return markers.stream().distinct().reduce((left, right) -> left + ", " + right).orElse(null);
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private record RankedCandidate(EvidenceItem item, int originalIndex) {
    }
}
