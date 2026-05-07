package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotMessage;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class PromptAssemblyService {

    private static final String SYSTEM_INSTRUCTIONS = String.join("\n",
        "You are the AridNova local architecture assistant.",
        "Use only the supplied AridNova evidence block for factual claims.",
        "Do not invent architecture facts, services, endpoints, commits, or policy details.",
        "If evidence is absent or does not support the question, state that evidence is insufficient."
    );

    private static final String DEVELOPER_INSTRUCTIONS = String.join("\n",
        "Output format requirements:",
        "1) Start with 'Answer:' and provide a concise direct answer.",
        "2) Then add 'Qualification:' and state certainty/limits.",
        "3) If evidence exists, include citation markers using evidence IDs like [E1], [E2].",
        "4) If evidence is missing, explicitly say 'insufficient evidence' and avoid speculation."
    );

    public PromptAssemblyResult assemble(
        String question,
        ChatbotContext context,
        List<PromptEvidenceItem> evidenceItems,
        List<ChatbotMessage> conversationHistory
    ) {
        List<PromptEvidenceItem> safeEvidence = evidenceItems == null ? List.of() : evidenceItems;
        List<ChatbotMessage> safeHistory = conversationHistory == null ? List.of() : conversationHistory;

        String evidenceBlock = buildEvidenceBlock(context, safeEvidence);
        String userPrompt = buildUserPrompt(question, context, safeEvidence.isEmpty());

        return new PromptAssemblyResult(
            SYSTEM_INSTRUCTIONS,
            DEVELOPER_INSTRUCTIONS,
            userPrompt,
            evidenceBlock,
            new ArrayList<>(safeHistory)
        );
    }

    private String buildUserPrompt(String question, ChatbotContext context, boolean noEvidence) {
        StringBuilder builder = new StringBuilder();
        builder.append("Question:\n").append(question == null ? "" : question.trim()).append("\n\n");
        if (context != null) {
            builder.append("ActiveContext:\n")
                .append("- systemName: ").append(valueOrNA(context.getSystemName())).append("\n")
                .append("- irId: ").append(valueOrNA(context.getIrId())).append("\n")
                .append("- indexId: ").append(valueOrNA(context.getIndexId())).append("\n")
                .append("- runId: ").append(valueOrNA(context.getRunId())).append("\n")
                .append("- commitId: ").append(valueOrNA(context.getCommitId())).append("\n")
                .append("- selectedService: ").append(valueOrNA(context.getSelectedService())).append("\n")
                .append("- selectedEndpoint: ").append(valueOrNA(context.getSelectedEndpoint())).append("\n\n");
        }
        if (noEvidence) {
            builder.append("Constraint:\n")
                .append("No evidence is currently available. Provide a qualified response that states insufficient evidence.")
                .append("\n");
        }
        return builder.toString();
    }

    private String buildEvidenceBlock(ChatbotContext context, List<PromptEvidenceItem> evidenceItems) {
        StringBuilder builder = new StringBuilder();
        builder.append("AridNovaEvidence:\n");
        if (context != null) {
            builder.append("ContextSummary: ")
                .append("system=").append(valueOrNA(context.getSystemName()))
                .append(", commit=").append(valueOrNA(context.getCommitId()))
                .append(", service=").append(valueOrNA(context.getSelectedService()))
                .append(", endpoint=").append(valueOrNA(context.getSelectedEndpoint()))
                .append("\n");
        }
        if (evidenceItems.isEmpty()) {
            builder.append("EvidenceCount: 0\n");
            builder.append("EvidenceList: none\n");
            return builder.toString();
        }

        builder.append("EvidenceCount: ").append(evidenceItems.size()).append("\n");
        builder.append("EvidenceList:\n");
        for (PromptEvidenceItem item : evidenceItems) {
            builder.append("- [").append(valueOrNA(item.getEvidenceId())).append("] ")
                .append("type=").append(valueOrNA(item.getArtifactType()))
                .append("; name=").append(valueOrNA(item.getArtifactName()))
                .append("; location=").append(valueOrNA(item.getLocationHint()))
                .append("; summary=").append(valueOrNA(item.getSummary()))
                .append("\n");
        }
        return builder.toString();
    }

    private String valueOrNA(String value) {
        return value == null || value.isBlank() ? "n/a" : value;
    }
}
