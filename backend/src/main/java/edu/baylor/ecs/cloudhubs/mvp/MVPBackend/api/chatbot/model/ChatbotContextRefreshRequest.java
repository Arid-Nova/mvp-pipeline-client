package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotContextRefreshRequest {
    private ChatbotContext context;
}
