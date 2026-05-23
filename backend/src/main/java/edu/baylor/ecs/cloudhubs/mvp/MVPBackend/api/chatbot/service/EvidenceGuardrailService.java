package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotFlag;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.CitationItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceCitationMapper;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class EvidenceGuardrailService {

    public ChatbotResponse enforce(String question, List<EvidenceItem> evidenceItems, ChatbotResponse response) {
        List<EvidenceItem> safeEvidence = evidenceItems == null ? List.of() : evidenceItems;
        ChatbotResponse safeResponse = response == null ? new ChatbotResponse() : response;

        ensureFlagListExists(safeResponse);

        boolean factualQuestion = asksForFactualArchitectureClaim(question);
        boolean noEvidence = safeEvidence.isEmpty();

        if (factualQuestion && noEvidence) {
            addFlagIfMissing(safeResponse, ChatbotFlag.insufficient_evidence);
            if (safeResponse.getAnswer() == null || safeResponse.getAnswer().isBlank()) {
                safeResponse.setAnswer("Insufficient evidence: no AridNova evidence is available for this request.");
            }
            return safeResponse;
        }

        if (factualQuestion && safeResponse.getCitations().isEmpty() && !hasFlag(safeResponse, ChatbotFlag.insufficient_evidence)) {
            safeResponse.setCitations(List.of(toCitation(safeEvidence.get(0))));
        }
        return safeResponse;
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

    private CitationItem toCitation(EvidenceItem evidence) {
        return EvidenceCitationMapper.toCitation(evidence);
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
