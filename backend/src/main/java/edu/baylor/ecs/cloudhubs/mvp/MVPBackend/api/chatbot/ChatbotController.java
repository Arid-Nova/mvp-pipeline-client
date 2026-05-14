package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotHealthResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotQueryRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service.ChatbotHealthService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service.ChatbotQueryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/chatbot")
public class ChatbotController {

    private final ChatbotHealthService chatbotHealthService;
    private final ChatbotQueryService chatbotQueryService;

    public ChatbotController(ChatbotHealthService chatbotHealthService, ChatbotQueryService chatbotQueryService) {
        this.chatbotHealthService = chatbotHealthService;
        this.chatbotQueryService = chatbotQueryService;
    }

    @GetMapping("/health")
    public ChatbotHealthResponse health() {
        return chatbotHealthService.health();
    }

    @PostMapping("/query")
    public ResponseEntity<ChatbotResponse> query(@Valid @RequestBody ChatbotQueryRequest request) {
        String requestId = chatbotQueryService.generateRequestId();
        long start = System.currentTimeMillis();
        try {
            ChatbotResponse response = chatbotQueryService.query(request);
            return ResponseEntity.ok(response);
        } catch (LocalLlmException ex) {
            ChatbotResponse response = chatbotQueryService.unavailableResponse(request, ex, requestId);
            response.setProcessingTimeMs(System.currentTimeMillis() - start);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(response);
        }
    }
}
