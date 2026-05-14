package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotQueryRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class ChatContextService {

    public List<EvidenceItem> collectEvidence(ChatbotQueryRequest request) {
        if (request == null) {
            return List.of();
        }
        return collectEvidence(request.getContext());
    }

    public List<EvidenceItem> collectEvidence(ChatbotContext context) {
        if (!hasAnyContextIdentifier(context)) {
            return List.of();
        }

        List<EvidenceItem> evidence = new ArrayList<>();
        evidence.add(new EvidenceItem(
            "CONTEXT_METADATA",
            contextIdentifier(context),
            valueOrNA(context.getSystemName()),
            "active-context",
            valueOrNA(context.getCommitId()),
            buildContextContent(context),
            Instant.now()
        ));

        // TODO(S12-M2): Replace this placeholder evidence with IR/graph retrieval evidence.
        // TODO(S12-M2): Add ranking and deduplication for multi-artifact evidence candidates.
        return evidence;
    }

    private boolean hasAnyContextIdentifier(ChatbotContext context) {
        return context != null
            && (hasValue(context.getSystemName())
            || hasValue(context.getIrId())
            || hasValue(context.getIndexId())
            || hasValue(context.getRunId())
            || hasValue(context.getCommitId())
            || hasValue(context.getSelectedService())
            || hasValue(context.getSelectedEndpoint()));
    }

    private String contextIdentifier(ChatbotContext context) {
        if (hasValue(context.getCommitId())) {
            return "commit:" + context.getCommitId().trim();
        }
        if (hasValue(context.getIrId())) {
            return "ir:" + context.getIrId().trim();
        }
        if (hasValue(context.getRunId())) {
            return "run:" + context.getRunId().trim();
        }
        if (hasValue(context.getSystemName())) {
            return "system:" + context.getSystemName().trim();
        }
        return "active-context";
    }

    private String buildContextContent(ChatbotContext context) {
        return "Active context selected"
            + "; system=" + valueOrNA(context.getSystemName())
            + "; irId=" + valueOrNA(context.getIrId())
            + "; indexId=" + valueOrNA(context.getIndexId())
            + "; runId=" + valueOrNA(context.getRunId())
            + "; commitId=" + valueOrNA(context.getCommitId())
            + "; selectedService=" + valueOrNA(context.getSelectedService())
            + "; selectedEndpoint=" + valueOrNA(context.getSelectedEndpoint());
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }

    private String valueOrNA(String value) {
        return hasValue(value) ? value.trim() : "n/a";
    }
}
