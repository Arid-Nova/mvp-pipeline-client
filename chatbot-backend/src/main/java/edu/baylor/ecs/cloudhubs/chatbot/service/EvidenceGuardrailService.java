package edu.baylor.ecs.cloudhubs.chatbot.service;

import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotConfidence;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotFlag;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.chatbot.model.CitationItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.MissingEvidence;
import edu.baylor.ecs.cloudhubs.chatbot.retrieval.model.QuestionIntent;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class EvidenceGuardrailService {

    private static final Pattern CITATION_PATTERN = Pattern.compile("\\[(E[^\\]]+)\\]");

    public ChatbotResponse enforcePreGeneration(
        String question,
        QuestionIntent intent,
        List<EvidenceItem> evidenceItems,
        List<MissingEvidence> retrievalMissing,
        ChatbotResponse response,
        boolean strictEvidenceOnly
    ) {
        ChatbotResponse safeResponse = response == null ? new ChatbotResponse() : response;
        List<EvidenceItem> safeEvidence = evidenceItems == null ? List.of() : evidenceItems;
        List<MissingEvidence> safeMissing = retrievalMissing == null ? List.of() : retrievalMissing;

        ensureFlagListExists(safeResponse);

        boolean supportedEvidenceIntent = isSupportedEvidenceRequiredIntent(intent) || asksForFactualArchitectureClaim(question);
        if (!supportedEvidenceIntent) {
            return safeResponse;
        }

        List<String> missingSources = computeMissingSources(intent, safeEvidence, safeMissing);
        if (safeEvidence.isEmpty() || allSourcesMissingForSupportedIntent(intent, safeEvidence)) {
            addFlagIfMissing(safeResponse, ChatbotFlag.INSUFFICIENT_EVIDENCE);
            safeResponse.setConfidence(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
            safeResponse.setAnswer("Insufficient evidence: required architecture evidence is missing. Missing sources: "
                + String.join(", ", missingSources));
            return safeResponse;
        }

        if (strictEvidenceOnly && hasWeakOnlyEvidence(safeEvidence)) {
            addFlagIfMissing(safeResponse, ChatbotFlag.INSUFFICIENT_EVIDENCE);
            safeResponse.setConfidence(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
            safeResponse.setAnswer("Insufficient evidence: strict evidence-only mode blocks weak or inferred-only support.");
            return safeResponse;
        }

        if (!missingSources.isEmpty()) {
            addFlagIfMissing(safeResponse, ChatbotFlag.PARTIAL);
            if (safeResponse.getAnswer() == null || safeResponse.getAnswer().isBlank()) {
                safeResponse.setAnswer("Partial evidence available. Missing sources: " + String.join(", ", missingSources));
            }
        } else if (!strictEvidenceOnly && allowsRecommendation(intent) && (safeResponse.getAnswer() == null || safeResponse.getAnswer().isBlank())) {
            safeResponse.setAnswer("Evidence-backed recommendation: based on retrieved architecture evidence, this should be treated as a qualified recommendation rather than a guaranteed fact.");
        }

        return safeResponse;
    }

    public ChatbotResponse enforcePostGeneration(
        String question,
        QuestionIntent intent,
        List<EvidenceItem> evidenceItems,
        ChatbotResponse response,
        boolean strictEvidenceOnly
    ) {
        ChatbotResponse safeResponse = response == null ? new ChatbotResponse() : response;
        List<EvidenceItem> safeEvidence = evidenceItems == null ? List.of() : evidenceItems;
        ensureFlagListExists(safeResponse);

        boolean supportedEvidenceIntent = isSupportedEvidenceRequiredIntent(intent) || asksForFactualArchitectureClaim(question);
        if (!supportedEvidenceIntent) {
            return safeResponse;
        }

        Set<String> validCitationIds = new LinkedHashSet<>();
        for (EvidenceItem item : safeEvidence) {
            if (hasValue(item.getArtifactId())) {
                validCitationIds.add(item.getArtifactId());
            }
        }

        boolean invalidCitationFound = sanitizeUnknownCitationIds(safeResponse, validCitationIds);
        if (invalidCitationFound) {
            addFlagIfMissing(safeResponse, ChatbotFlag.CITATION_VALIDATION_FAILED);
            safeResponse.setConfidence(ChatbotConfidence.LOW);
        }

        if (hasAnswerText(safeResponse) && (safeResponse.getCitations() == null || safeResponse.getCitations().isEmpty())) {
            addFlagIfMissing(safeResponse, ChatbotFlag.CITATION_VALIDATION_FAILED);
            addFlagIfMissing(safeResponse, ChatbotFlag.INSUFFICIENT_EVIDENCE);
            safeResponse.setConfidence(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
            safeResponse.setAnswer("Insufficient citation support: generated answer did not include valid evidence citations.");
            return safeResponse;
        }

        List<CitationItem> filtered = filterToValidCitations(safeResponse.getCitations(), validCitationIds);
        if (filtered.size() != safeResponse.getCitations().size()) {
            safeResponse.setCitations(filtered);
            addFlagIfMissing(safeResponse, ChatbotFlag.CITATION_VALIDATION_FAILED);
            safeResponse.setConfidence(ChatbotConfidence.LOW);
        }

        if (hasAnswerText(safeResponse) && safeResponse.getCitations().isEmpty()) {
            addFlagIfMissing(safeResponse, ChatbotFlag.INSUFFICIENT_EVIDENCE);
            safeResponse.setConfidence(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
            safeResponse.setAnswer("Insufficient citation support: no valid citations remain after validation.");
            return safeResponse;
        }

        if (strictEvidenceOnly && hasWeakOnlyEvidence(safeEvidence)) {
            addFlagIfMissing(safeResponse, ChatbotFlag.INSUFFICIENT_EVIDENCE);
            safeResponse.setConfidence(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
            safeResponse.setAnswer("Insufficient evidence: strict evidence-only mode requires stronger direct support.");
        }

        return safeResponse;
    }

    private boolean sanitizeUnknownCitationIds(ChatbotResponse response, Set<String> validCitationIds) {
        if (!hasAnswerText(response)) {
            return false;
        }
        Matcher matcher = CITATION_PATTERN.matcher(response.getAnswer());
        StringBuilder rebuilt = new StringBuilder();
        int cursor = 0;
        boolean invalidFound = false;
        while (matcher.find()) {
            rebuilt.append(response.getAnswer(), cursor, matcher.start());
            String cid = matcher.group(1);
            if (validCitationIds.contains(cid)) {
                rebuilt.append("[").append(cid).append("]");
            } else {
                invalidFound = true;
                rebuilt.append("[citation_removed]");
            }
            cursor = matcher.end();
        }
        rebuilt.append(response.getAnswer().substring(cursor));
        if (invalidFound) {
            response.setAnswer(rebuilt.toString());
        }
        return invalidFound;
    }

    private List<CitationItem> filterToValidCitations(List<CitationItem> citations, Set<String> validCitationIds) {
        if (citations == null || citations.isEmpty()) {
            return List.of();
        }
        List<CitationItem> filtered = new ArrayList<>();
        for (CitationItem citation : citations) {
            if (citation == null) {
                continue;
            }
            if (hasValue(citation.getArtifactId()) && validCitationIds.contains(citation.getArtifactId())) {
                filtered.add(citation);
            }
        }
        return filtered;
    }

    private List<String> computeMissingSources(QuestionIntent intent, List<EvidenceItem> evidenceItems, List<MissingEvidence> retrievalMissing) {
        Set<String> missing = new LinkedHashSet<>();
        Set<EvidenceArtifactType> present = new LinkedHashSet<>();

        for (EvidenceItem item : evidenceItems) {
            if (item.getArtifactType() != null) {
                present.add(item.getArtifactType());
            }
        }
        for (MissingEvidence m : retrievalMissing) {
            if (m != null && m.getArtifactType() != null) {
                missing.add(normalizeSourceLabel(m.getArtifactType()));
            }
            if (m != null && hasValue(m.getExpectedIdentifier()) && m.getExpectedIdentifier().toLowerCase(Locale.ROOT).contains("systemname|irid")) {
                missing.add("active context");
            }
        }

        for (EvidenceArtifactType required : requiredTypes(intent)) {
            if (!present.contains(required)) {
                missing.add(normalizeSourceLabel(required));
            }
        }

        return new ArrayList<>(missing);
    }

    private boolean allSourcesMissingForSupportedIntent(QuestionIntent intent, List<EvidenceItem> evidenceItems) {
        if (!isSupportedEvidenceRequiredIntent(intent)) {
            return false;
        }
        Set<EvidenceArtifactType> present = new LinkedHashSet<>();
        for (EvidenceItem item : evidenceItems) {
            if (item.getArtifactType() != null) {
                present.add(item.getArtifactType());
            }
        }
        for (EvidenceArtifactType type : requiredTypes(intent)) {
            if (present.contains(type)) {
                return false;
            }
        }
        return true;
    }

    private List<EvidenceArtifactType> requiredTypes(QuestionIntent intent) {
        return switch (intent) {
            case ARCHITECTURE_TOPOLOGY -> List.of(EvidenceArtifactType.IR, EvidenceArtifactType.ARCHITECTURE, EvidenceArtifactType.GRAPH);
            case DEPENDENCY -> List.of(EvidenceArtifactType.GRAPH, EvidenceArtifactType.DEPENDENCY);
            case ENDPOINT_LOOKUP -> List.of(EvidenceArtifactType.IR, EvidenceArtifactType.ENDPOINT);
            default -> List.of();
        };
    }

    private String normalizeSourceLabel(EvidenceArtifactType type) {
        return switch (type) {
            case IR -> "IR";
            case GRAPH -> "graph";
            case ARCHITECTURE -> "component index";
            case ENDPOINT -> "endpoint data";
            case CONTEXT_METADATA -> "active context";
            default -> type.name().toLowerCase(Locale.ROOT);
        };
    }

    private boolean asksForFactualArchitectureClaim(String question) {
        if (question == null || question.isBlank()) {
            return false;
        }
        String normalized = question.toLowerCase(Locale.ROOT);
        String[] factualKeywords = {
            "architecture", "dependency", "dependencies", "finding", "findings", "risk", "risks",
            "change", "changes", "changed", "test", "tests", "endpoint", "service", "commit"
        };
        for (String keyword : factualKeywords) {
            if (normalized.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    private boolean isSupportedEvidenceRequiredIntent(QuestionIntent intent) {
        return intent == QuestionIntent.ARCHITECTURE_TOPOLOGY
            || intent == QuestionIntent.DEPENDENCY
            || intent == QuestionIntent.ENDPOINT_LOOKUP;
    }

    private boolean hasAnswerText(ChatbotResponse response) {
        return response != null && response.getAnswer() != null && !response.getAnswer().isBlank();
    }

    private boolean hasWeakOnlyEvidence(List<EvidenceItem> evidenceItems) {
        if (evidenceItems == null || evidenceItems.isEmpty()) {
            return true;
        }
        boolean hasStrongType = evidenceItems.stream().anyMatch(item -> item.getArtifactType() == EvidenceArtifactType.IR
            || item.getArtifactType() == EvidenceArtifactType.GRAPH
            || item.getArtifactType() == EvidenceArtifactType.ENDPOINT
            || item.getArtifactType() == EvidenceArtifactType.DEPENDENCY
            || item.getArtifactType() == EvidenceArtifactType.ARCHITECTURE);
        if (!hasStrongType) {
            return true;
        }
        return evidenceItems.stream().allMatch(item -> {
            String confidence = item.getConfidenceSource();
            return confidence != null && confidence.toLowerCase(Locale.ROOT).contains("inferred");
        });
    }

    private boolean allowsRecommendation(QuestionIntent intent) {
        return intent == QuestionIntent.ARCHITECTURE_TOPOLOGY
            || intent == QuestionIntent.DEPENDENCY
            || intent == QuestionIntent.ENDPOINT_LOOKUP;
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }

    private void ensureFlagListExists(ChatbotResponse response) {
        Set<ChatbotFlag> flags = new LinkedHashSet<>();
        if (response.getFlags() != null) {
            flags.addAll(response.getFlags());
        }
        response.setFlags(new ArrayList<>(flags));
    }

    private boolean hasFlag(ChatbotResponse response, ChatbotFlag flag) {
        return response.getFlags() != null && response.getFlags().contains(flag);
    }

    private void addFlagIfMissing(ChatbotResponse response, ChatbotFlag flag) {
        if (!hasFlag(response, flag)) {
            List<ChatbotFlag> updated = new ArrayList<>(response.getFlags());
            updated.add(flag);
            response.setFlags(updated);
        }
    }
}
