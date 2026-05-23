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
        "Answer only from the supplied AridNova evidence records.",
        "Do not make unsupported architecture, dependency, endpoint, risk, or impact claims.",
        "Cite evidence IDs (e.g., [E1]) for every material claim.",
        "Clearly label direct facts versus inferred transitive paths.",
        "Only mention anti-patterns when explicit anti-pattern markers are present in evidence records.",
        "If evidence is missing or insufficient, explicitly say 'insufficient evidence'."
    );

    private static final String DEVELOPER_INSTRUCTIONS = String.join("\n",
        "Output format requirements:",
        "1) Start with 'Answer:' and provide a concise direct answer.",
        "2) Then add 'Qualification:' and state certainty/limits.",
        "3) Every material claim must include at least one citation marker like [E1].",
        "4) If mentioning transitive dependencies, state they are inferred from explicit links and cite both.",
        "5) If evidence is missing, stale, or truncated, explain limits and avoid speculation.",
        "6) Do not quote or reconstruct source files beyond evidence snippets in AridNovaEvidenceRecords."
    );

    public PromptAssemblyResult assemble(
        String question,
        ChatbotContext context,
        List<PromptEvidenceItem> evidenceItems,
        List<ChatbotMessage> conversationHistory
    ) {
        return assemble(question, context, evidenceItems, conversationHistory, new PromptAssemblyMetadata(false, false));
    }

    public PromptAssemblyResult assemble(
        String question,
        ChatbotContext context,
        List<PromptEvidenceItem> evidenceItems,
        List<ChatbotMessage> conversationHistory,
        PromptAssemblyMetadata metadata
    ) {
        List<PromptEvidenceItem> safeEvidence = evidenceItems == null ? List.of() : evidenceItems;
        List<ChatbotMessage> safeHistory = conversationHistory == null ? List.of() : conversationHistory;
        PromptAssemblyMetadata safeMetadata = metadata == null ? new PromptAssemblyMetadata(false, false) : metadata;

        String evidenceBlock = buildEvidenceBlock(context, safeEvidence, safeMetadata);
        String userPrompt = buildUserPrompt(question, context, safeEvidence.isEmpty(), safeMetadata);

        return new PromptAssemblyResult(
            SYSTEM_INSTRUCTIONS,
            DEVELOPER_INSTRUCTIONS,
            userPrompt,
            evidenceBlock,
            new ArrayList<>(safeHistory)
        );
    }

    private String buildUserPrompt(String question, ChatbotContext context, boolean noEvidence, PromptAssemblyMetadata metadata) {
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
        if (metadata.isTruncated() || metadata.isStaleContext()) {
            builder.append("ContextStatus:\n")
                .append("- evidenceTruncated: ").append(metadata.isTruncated()).append("\n")
                .append("- staleContext: ").append(metadata.isStaleContext()).append("\n")
                .append("- instruction: explicitly qualify any uncertainty caused by truncation or stale context.\n\n");
        }
        if (noEvidence) {
            builder.append("Constraint:\n")
                .append("No evidence is currently available. Provide a qualified response that states insufficient evidence.")
                .append("\n");
        }
        return builder.toString();
    }

    private String buildEvidenceBlock(ChatbotContext context, List<PromptEvidenceItem> evidenceItems, PromptAssemblyMetadata metadata) {
        StringBuilder builder = new StringBuilder();
        builder.append("AridNovaEvidenceRecords:\n");
        if (context != null) {
            builder.append("ContextSummary: ")
                .append("system=").append(valueOrNA(context.getSystemName()))
                .append(", commit=").append(valueOrNA(context.getCommitId()))
                .append(", service=").append(valueOrNA(context.getSelectedService()))
                .append(", endpoint=").append(valueOrNA(context.getSelectedEndpoint()))
                .append("\n");
        }
        builder.append("EvidenceState: truncated=").append(metadata.isTruncated())
            .append(", staleContext=").append(metadata.isStaleContext())
            .append("\n");

        if (evidenceItems.isEmpty()) {
            builder.append("EvidenceCount: 0\n");
            builder.append("EvidenceList: none\n");
            return builder.toString();
        }

        builder.append("EvidenceCount: ").append(evidenceItems.size()).append("\n");
        builder.append("EvidenceList:\n");
        for (PromptEvidenceItem item : evidenceItems) {
            builder.append("- EvidenceRecord {")
                .append(" id=").append(valueOrNA(item.getEvidenceId()))
                .append("; artifactType=").append(valueOrNA(item.getArtifactType()))
                .append("; artifactId=").append(valueOrNA(item.getArtifactId()))
                .append("; artifactVersion=").append(valueOrNA(item.getArtifactVersion()))
                .append("; locationHint=").append(valueOrNA(item.getLocationHint()))
                .append("; entity=").append(valueOrNA(item.getEntityName()))
                .append("; service=").append(valueOrNA(item.getServiceName()))
                .append("; endpoint=").append(valueOrNA(item.getEndpointPath()))
                .append("; antiPatterns=").append(valueOrNA(item.getAntiPatternMarkers()))
                .append("; content=").append(valueOrNA(item.getSummary()))
                .append(" }\n");
        }
        return builder.toString();
    }

    private String valueOrNA(String value) {
        return value == null || value.isBlank() ? "n/a" : value;
    }
}
