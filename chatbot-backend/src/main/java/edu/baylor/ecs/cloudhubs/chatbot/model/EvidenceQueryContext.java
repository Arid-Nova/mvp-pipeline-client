package edu.baylor.ecs.cloudhubs.chatbot.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class EvidenceQueryContext {
    private String question;
    private ChatbotContext chatbotContext;
    private EvidenceScope scope;
    private List<ChatbotMessage> conversationHistory;
    private String conversationId;
    private boolean expandedScopeAllowed;
}
