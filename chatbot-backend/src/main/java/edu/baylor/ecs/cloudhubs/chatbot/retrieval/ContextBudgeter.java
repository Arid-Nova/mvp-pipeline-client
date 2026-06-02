package edu.baylor.ecs.cloudhubs.chatbot.retrieval;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Component
public class ContextBudgeter {

    private final ObjectMapper objectMapper = new ObjectMapper();

    public ContextBudgetResult budget(
        List<EvidenceItem> rankedEvidence,
        List<String> matchedEntities,
        QuestionIntent intent,
        int maxEvidenceItems,
        int maxEvidenceChars
    ) {
        List<EvidenceItem> safeEvidence = rankedEvidence == null ? List.of() : rankedEvidence;
        List<RankedCandidate> sorted = sortCandidates(safeEvidence, intent);

        List<EvidenceItem> retained = new ArrayList<>();
        Set<Integer> retainedIndexes = new HashSet<>();
        int usedChars = 0;

        RankedCandidate directMatch = firstDirectMatch(sorted, matchedEntities);
        if (directMatch != null && maxEvidenceItems > 0) {
            int chars = estimateChars(directMatch.item());
            if (chars <= maxEvidenceChars || retained.isEmpty()) {
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
            int chars = estimateChars(candidate.item());
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

        retained = retained.stream()
            .sorted(Comparator
                .comparingInt((EvidenceItem item) -> retainedOrderIndex(item, sorted))
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
        }
        return false;
    }

    private boolean isInferred(EvidenceItem item) {
        String source = safe(item.getConfidenceSource()).toLowerCase(Locale.ROOT);
        return source.contains("inferred") || source.contains("fallback");
    }

    private int estimateChars(EvidenceItem item) {
        int size = safe(item.getContentText()).length()
            + safe(item.getEntityName()).length()
            + safe(item.getServiceName()).length()
            + safe(item.getEndpointPath()).length()
            + safe(item.getLocationHint()).length();

        if (item.getStructuredPayload() != null) {
            try {
                size += objectMapper.writeValueAsString(item.getStructuredPayload()).length();
            } catch (JsonProcessingException ex) {
                size += item.getStructuredPayload().toString().length();
            }
        }
        return size;
    }

    private int retainedOrderIndex(EvidenceItem item, List<RankedCandidate> sorted) {
        for (int i = 0; i < sorted.size(); i++) {
            if (sorted.get(i).item() == item) {
                return i;
            }
        }
        return Integer.MAX_VALUE;
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
