package edu.baylor.ecs.cloudhubs.chatbot.prompt.model;

import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotMessage;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PromptAssemblyResult {
    private String systemInstructions;
    private String developerInstructions;
    private String userPrompt;
    private String evidenceBlock;
    private List<ChatbotMessage> conversationHistory = new ArrayList<>();

    public ChatbotPrompt toChatbotPrompt() {
        String combinedSystem = systemInstructions + "\n\n" + developerInstructions + "\n\n" + evidenceBlock;
        return new ChatbotPrompt(combinedSystem, userPrompt, conversationHistory);
    }
}
