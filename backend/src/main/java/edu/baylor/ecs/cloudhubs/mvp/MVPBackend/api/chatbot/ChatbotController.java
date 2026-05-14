package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotHealthResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service.ChatbotHealthService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/chatbot")
public class ChatbotController {

    private final ChatbotHealthService chatbotHealthService;

    public ChatbotController(ChatbotHealthService chatbotHealthService) {
        this.chatbotHealthService = chatbotHealthService;
    }

    @GetMapping("/health")
    public ChatbotHealthResponse health() {
        return chatbotHealthService.health();
    }
}
