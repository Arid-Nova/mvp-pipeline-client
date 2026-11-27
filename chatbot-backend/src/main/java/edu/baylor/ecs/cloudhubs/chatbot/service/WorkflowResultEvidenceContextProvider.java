package edu.baylor.ecs.cloudhubs.chatbot.service;

import com.fasterxml.jackson.databind.JsonNode;

import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.chatbot.model.MissingEvidence;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Converts bounded frontend projections of completed card results into citable chatbot evidence. */
@Component
public class WorkflowResultEvidenceContextProvider implements EvidenceContextProvider {

    /** Marker the guardrail trusts only for a matching formal-verification result question. */
    static final String DIRECT_FORMAL_VERIFICATION_SOURCE = "direct-workflow-card-result:FORMAL_VERIFY";
    private static final int MAX_RECORDS = 24;
    private static final int MAX_SUMMARY_CHARS = 2200;
    private static final Set<String> ALLOWED_CARD_TYPES = Set.of(
        "COMPONENT_HOLDER", "FORMAL_VERIFY", "AEGIS", "CHANGE_IMPACT", "SECURITY_REGRESSION",
        "SCENARIO_GENERATE", "VERIFICATION_COMPARISON", "PROMPT_GENERATE", "TEST_GENERATE",
        "TEST_EXECUTOR", "FORMAL_VIZ"
    );

    @Override
    public String providerId() {
        return "workflow-card-results";
    }

    @Override
    public boolean supports(EvidenceQueryContext context, String question) {
        ChatbotContext chatbotContext = context == null ? null : context.getChatbotContext();
        return chatbotContext != null
            && chatbotContext.getWorkflowEvidence() != null
            && !chatbotContext.getWorkflowEvidence().isEmpty();
    }

    @Override
    public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
        EvidenceRetrievalResult result = new EvidenceRetrievalResult();
        List<EvidenceItem> evidence = new ArrayList<>();
        List<MissingEvidence> missing = new ArrayList<>();
        ChatbotContext chatbotContext = context == null ? null : context.getChatbotContext();
        List<JsonNode> records = chatbotContext == null || chatbotContext.getWorkflowEvidence() == null
            ? List.of()
            : chatbotContext.getWorkflowEvidence();

        int limit = Math.min(records.size(), MAX_RECORDS);
        for (int index = 0; index < limit; index++) {
            JsonNode record = records.get(index);
            String cardType = text(record, "cardType");
            String cardId = text(record, "cardId");
            String summary = text(record, "summary");
            if (record == null || !record.isObject()
                || cardType == null || !ALLOWED_CARD_TYPES.contains(cardType)
                || cardId == null || !cardId.matches("[A-Za-z0-9:_-]{1,128}") || summary == null) {
                missing.add(missing("A workflow-card evidence record was ignored because required fields were invalid.", "record:" + index));
                continue;
            }
            if (summary.length() > MAX_SUMMARY_CHARS) {
                missing.add(missing("A workflow-card summary exceeded the accepted size and was omitted.", cardType + ":" + cardId));
                continue;
            }

            EvidenceItem item = new EvidenceItem();
            String cardLabel = cardLabel(cardType);
            item.setArtifactType(EvidenceArtifactType.CONTEXT_METADATA);
            item.setArtifactId("workflow:" + cardType + ":" + cardId);
            item.setArtifactVersion(chatbotContext.getRunId());
            item.setLocationHint("completed-card:" + cardType);
            item.setEntityName(cardLabel);
            item.setEntityType("WORKFLOW_CARD");
            String serviceName = text(record, "serviceName");
            item.setServiceName(serviceName != null && serviceName.length() <= 256 ? serviceName : null);
            item.setConfidenceSource("FORMAL_VERIFY".equals(cardType)
                ? DIRECT_FORMAL_VERIFICATION_SOURCE
                : "completed-workflow-card-output");
            item.setSupportStrength(1.0);
            item.setTimestamp(Instant.now());
            item.setContentText("Completed workflow card result for " + cardLabel + " (type=" + cardType
                + ", cardId=" + cardId + "): " + summary);
            evidence.add(item);
        }

        if (records.size() > MAX_RECORDS) {
            missing.add(missing("Additional completed workflow-card results were omitted by the evidence limit.", "workflowEvidence"));
        }
        result.setEvidenceItems(evidence);
        result.setMissingEvidence(missing);
        return result;
    }

    private String text(JsonNode record, String field) {
        if (record == null) return null;
        String value = record.path(field).asText(null);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String cardLabel(String cardType) {
        return switch (cardType) {
            case "COMPONENT_HOLDER" -> "component extraction";
            case "FORMAL_VERIFY" -> "formal verification";
            case "AEGIS" -> "security risk assessment";
            case "CHANGE_IMPACT" -> "change impact analysis";
            case "SECURITY_REGRESSION" -> "policy drift comparison";
            case "SCENARIO_GENERATE" -> "security scenario generation";
            case "VERIFICATION_COMPARISON" -> "verification and scenario comparison";
            case "PROMPT_GENERATE" -> "analysis prompt preparation";
            case "TEST_GENERATE" -> "test suite generation";
            case "TEST_EXECUTOR" -> "test execution";
            case "FORMAL_VIZ" -> "formal results visualization";
            default -> cardType;
        };
    }

    private MissingEvidence missing(String reason, String expectedIdentifier) {
        return new MissingEvidence(EvidenceArtifactType.UNKNOWN, reason, expectedIdentifier);
    }
}
