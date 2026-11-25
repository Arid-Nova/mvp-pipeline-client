package edu.baylor.ecs.cloudhubs.chatbot.runtime.model;

import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotMessage;
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
public class ChatbotPrompt {
    private String systemInstruction;
    private String userQuestion;
    private List<ChatbotMessage> messages = new ArrayList<>();
    /** Ask the runtime for a JSON-only answer (Ollama {@code format:"json"}). Off for Q&A. */
    private boolean jsonOutput;
    /** Context window to request (Ollama {@code options.num_ctx}); null keeps the runtime default. */
    private Integer contextTokens;

    public ChatbotPrompt(String systemInstruction, String userQuestion, List<ChatbotMessage> messages) {
        this(systemInstruction, userQuestion, messages, false, null);
    }
}
