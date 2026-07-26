package edu.baylor.ecs.cloudhubs.chatbot.model;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ChatbotContext {
    private String systemName;
    private String irId;
    private String indexId;
    private String runId;
    private String commitId;
    private String selectedService;
    private String selectedEndpoint;
    private Boolean expandedScope;

    /**
     * Optional raw IR JSON the frontend already has in memory for the active canvas node
     * (generated, DB-loaded, or locally uploaded). When present, {@code IrContextProvider}
     * maps it directly instead of calling {@code backend} — this is what makes locally
     * uploaded IRs (never persisted server-side) chatbot-answerable.
     */
    private JsonNode irPayload;

    public ChatbotContext(
        String systemName,
        String irId,
        String indexId,
        String runId,
        String commitId,
        String selectedService,
        String selectedEndpoint,
        Boolean expandedScope
    ) {
        this.systemName = systemName;
        this.irId = irId;
        this.indexId = indexId;
        this.runId = runId;
        this.commitId = commitId;
        this.selectedService = selectedService;
        this.selectedEndpoint = selectedEndpoint;
        this.expandedScope = expandedScope;
    }
}
