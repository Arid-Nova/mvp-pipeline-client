package edu.baylor.ecs.cloudhubs.chatbot.quality;

import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotConfidence;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotFlag;
import edu.baylor.ecs.cloudhubs.chatbot.model.CitationItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.MissingEvidence;
import edu.baylor.ecs.cloudhubs.chatbot.retrieval.QuestionIntent;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class ConfidenceService {

    public ConfidenceAssessment assess(
        QuestionIntent intent,
        List<EvidenceItem> evidenceItems,
        List<CitationItem> citations,
        List<ChatbotFlag> flags,
        List<String> matchedEntities,
        List<MissingEvidence> missingEvidence
    ) {
        List<EvidenceItem> safeEvidence = evidenceItems == null ? List.of() : evidenceItems;
        List<CitationItem> safeCitations = citations == null ? List.of() : citations;
        List<ChatbotFlag> safeFlags = flags == null ? List.of() : flags;
        List<String> safeMatched = matchedEntities == null ? List.of() : matchedEntities;
        List<MissingEvidence> safeMissing = missingEvidence == null ? List.of() : missingEvidence;

        Set<String> reasons = new LinkedHashSet<>();
        boolean hasIr = safeEvidence.stream().anyMatch(e -> e.getArtifactType() == EvidenceArtifactType.IR);
        boolean hasGraph = safeEvidence.stream().anyMatch(e -> e.getArtifactType() == EvidenceArtifactType.GRAPH);
        boolean exactMatch = hasExactMatch(safeMatched, safeEvidence);
        boolean partial = safeFlags.contains(ChatbotFlag.partial);
        boolean truncated = safeFlags.contains(ChatbotFlag.truncated_context);
        boolean stale = safeFlags.contains(ChatbotFlag.stale_context);
        boolean citationValidationFailed = safeFlags.contains(ChatbotFlag.citation_validation_failed);
        boolean insufficient = safeFlags.contains(ChatbotFlag.insufficient_evidence);
        boolean providerUnavailable = safeFlags.contains(ChatbotFlag.model_unavailable)
            || safeMissing.stream().anyMatch(m -> m != null && m.getReason() != null
            && m.getReason().toLowerCase(Locale.ROOT).contains("unavailable"));

        if (exactMatch) reasons.add("exact_match");
        if (hasIr) reasons.add("has_ir_evidence");
        if (hasGraph) reasons.add("has_graph_evidence");
        if (partial) reasons.add("partial_sources");
        if (truncated) reasons.add("truncated_context");
        if (insufficient) reasons.add("missing_required_evidence");
        if (providerUnavailable) reasons.add("provider_unavailable");

        ConfidenceAssessment assessment = new ConfidenceAssessment();
        assessment.setReasons(new ArrayList<>(reasons));

        if (insufficient || safeEvidence.isEmpty() || requiredIntentWithoutEvidence(intent, safeEvidence)) {
            assessment.setConfidence(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
            assessment.setRationale("Required architecture evidence is missing for this query scope.");
            return assessment;
        }

        if (citationValidationFailed || stale || truncated || providerUnavailable) {
            assessment.setConfidence(ChatbotConfidence.LOW);
            assessment.setRationale("Evidence quality or citation validation concerns reduce confidence.");
            return assessment;
        }

        if (exactMatch && hasIr && hasGraph && !safeCitations.isEmpty()) {
            assessment.setConfidence(ChatbotConfidence.HIGH);
            assessment.setRationale("Exact entity match is supported by IR and graph evidence with citations.");
            return assessment;
        }

        if (!safeEvidence.isEmpty()) {
            assessment.setConfidence(ChatbotConfidence.MEDIUM);
            assessment.setRationale("Relevant evidence exists but support is partial or not fully cross-validated.");
            return assessment;
        }

        assessment.setConfidence(ChatbotConfidence.LOW);
        assessment.setRationale("Only weak evidence signals were available.");
        return assessment;
    }

    private boolean requiredIntentWithoutEvidence(QuestionIntent intent, List<EvidenceItem> evidenceItems) {
        if (!(intent == QuestionIntent.ARCHITECTURE_TOPOLOGY
            || intent == QuestionIntent.DEPENDENCY
            || intent == QuestionIntent.ENDPOINT_LOOKUP)) {
            return false;
        }
        return evidenceItems == null || evidenceItems.isEmpty();
    }

    private boolean hasExactMatch(List<String> matchedEntities, List<EvidenceItem> evidenceItems) {
        if (matchedEntities == null || matchedEntities.isEmpty() || evidenceItems == null || evidenceItems.isEmpty()) {
            return false;
        }
        for (String entity : matchedEntities) {
            if (entity == null || entity.isBlank()) {
                continue;
            }
            String normalized = entity.trim().toLowerCase(Locale.ROOT);
            for (EvidenceItem item : evidenceItems) {
                if (equalsIgnoreCase(item.getServiceName(), normalized)
                    || equalsIgnoreCase(item.getEntityName(), normalized)
                    || equalsIgnoreCase(item.getEndpointPath(), normalized)) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean equalsIgnoreCase(String value, String normalized) {
        return value != null && value.trim().toLowerCase(Locale.ROOT).equals(normalized);
    }
}
