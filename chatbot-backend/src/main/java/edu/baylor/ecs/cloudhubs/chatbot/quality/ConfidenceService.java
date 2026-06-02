package edu.baylor.ecs.cloudhubs.chatbot.quality;

import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotConfidence;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotFlag;
import edu.baylor.ecs.cloudhubs.chatbot.model.CitationItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.MissingEvidence;
import edu.baylor.ecs.cloudhubs.chatbot.quality.model.ConfidenceAssessment;
import edu.baylor.ecs.cloudhubs.chatbot.retrieval.model.QuestionIntent;
import edu.baylor.ecs.cloudhubs.chatbot.util.StringUtils;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
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
        EnumSet<ChatbotFlag> flagSet = (flags == null || flags.isEmpty())
            ? EnumSet.noneOf(ChatbotFlag.class) : EnumSet.copyOf(flags);
        List<String> safeMatched = matchedEntities == null ? List.of() : matchedEntities;
        List<MissingEvidence> safeMissing = missingEvidence == null ? List.of() : missingEvidence;

        boolean hasIr = false;
        boolean hasGraph = false;
        for (EvidenceItem e : safeEvidence) {
            if (e.getArtifactType() == EvidenceArtifactType.IR) hasIr = true;
            else if (e.getArtifactType() == EvidenceArtifactType.GRAPH) hasGraph = true;
            if (hasIr && hasGraph) break;
        }

        boolean exactMatch = hasExactMatch(safeMatched, safeEvidence);
        boolean partial = flagSet.contains(ChatbotFlag.partial);
        boolean truncated = flagSet.contains(ChatbotFlag.truncated_context);
        boolean stale = flagSet.contains(ChatbotFlag.stale_context);
        boolean citationValidationFailed = flagSet.contains(ChatbotFlag.citation_validation_failed);
        boolean insufficient = flagSet.contains(ChatbotFlag.insufficient_evidence);
        boolean providerUnavailable = flagSet.contains(ChatbotFlag.model_unavailable)
            || safeMissing.stream().anyMatch(m -> m != null && m.getReason() != null
            && m.getReason().toLowerCase(Locale.ROOT).contains("unavailable"));

        Set<String> reasons = new LinkedHashSet<>();
        if (exactMatch) reasons.add("exact_match");
        if (hasIr) reasons.add("has_ir_evidence");
        if (hasGraph) reasons.add("has_graph_evidence");
        if (partial) reasons.add("partial_sources");
        if (truncated) reasons.add("truncated_context");
        if (insufficient) reasons.add("missing_required_evidence");
        if (providerUnavailable) reasons.add("provider_unavailable");

        ConfidenceAssessment assessment = new ConfidenceAssessment();
        assessment.setReasons(new ArrayList<>(reasons));

        if (insufficient || safeEvidence.isEmpty()) {
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

    private boolean hasExactMatch(List<String> matchedEntities, List<EvidenceItem> evidenceItems) {
        if (matchedEntities == null || matchedEntities.isEmpty() || evidenceItems == null || evidenceItems.isEmpty()) {
            return false;
        }
        Set<String> evidenceIdentifiers = new HashSet<>();
        for (EvidenceItem item : evidenceItems) {
            if (item.getServiceName() != null) evidenceIdentifiers.add(item.getServiceName().trim().toLowerCase(Locale.ROOT));
            if (item.getEntityName() != null) evidenceIdentifiers.add(item.getEntityName().trim().toLowerCase(Locale.ROOT));
            if (item.getEndpointPath() != null) evidenceIdentifiers.add(item.getEndpointPath().trim().toLowerCase(Locale.ROOT));
        }
        for (String entity : matchedEntities) {
            if (entity != null && !entity.isBlank() && evidenceIdentifiers.contains(entity.trim().toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

}
