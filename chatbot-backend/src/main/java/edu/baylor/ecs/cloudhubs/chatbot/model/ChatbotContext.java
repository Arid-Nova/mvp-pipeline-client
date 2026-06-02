package edu.baylor.ecs.cloudhubs.chatbot.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotContext {
    private String systemName;
    private String irId;
    private String indexId;
    private String runId;
    private String commitId;
    private String selectedService;
    private String selectedEndpoint;
    private Boolean expandedScope;
}
