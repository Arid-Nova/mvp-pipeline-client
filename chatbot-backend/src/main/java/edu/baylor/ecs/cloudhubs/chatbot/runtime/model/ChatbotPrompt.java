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
}
