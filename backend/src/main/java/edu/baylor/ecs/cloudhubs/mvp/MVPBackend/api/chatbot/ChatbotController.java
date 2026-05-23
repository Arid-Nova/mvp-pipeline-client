package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotHealthResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContextRefreshRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContextRefreshResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotQueryRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service.ChatContextService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service.ChatbotHealthService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service.ChatbotQueryService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;

@RestController
@RequestMapping("/chatbot")
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:8080"}, maxAge = 3600, allowedHeaders = "*")
public class ChatbotController {
    private static final Logger log = LoggerFactory.getLogger(ChatbotController.class);

    private final ChatbotHealthService chatbotHealthService;
    private final ChatbotQueryService chatbotQueryService;
    private final ChatContextService chatContextService;

    public ChatbotController(
        ChatbotHealthService chatbotHealthService,
        ChatbotQueryService chatbotQueryService,
        ChatContextService chatContextService
    ) {
        this.chatbotHealthService = chatbotHealthService;
        this.chatbotQueryService = chatbotQueryService;
        this.chatContextService = chatContextService;
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
            ChatbotResponse response = chatbotQueryService.query(request, requestId);
            response.setRequestId(requestId);
            log.info(
                "chatbot.query.response_completed requestId={} provider={} model={} latencyMs={} flags={}",
                requestId,
                response.getProvider(),
                response.getModel(),
                response.getProcessingTimeMs(),
                response.getFlags()
            );
            return ResponseEntity.ok(response);
        } catch (LocalLlmException ex) {
            ChatbotResponse response = chatbotQueryService.unavailableResponse(request, ex, requestId);
            long latencyMs = System.currentTimeMillis() - start;
            response.setProcessingTimeMs(latencyMs);
            log.warn(
                "chatbot.query.response_failed requestId={} provider={} model={} latencyMs={} flags={} errorClass={}",
                requestId,
                response.getProvider(),
                response.getModel(),
                latencyMs,
                response.getFlags(),
                ex.getClass().getSimpleName()
            );
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(response);
        }
    }

    @PostMapping("/context/refresh")
    public ResponseEntity<ChatbotContextRefreshResponse> refreshContext(@RequestBody(required = false) ChatbotContextRefreshRequest request) {
        ChatbotContextRefreshResponse response = chatContextService.refreshContext(request == null ? null : request.getContext());
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
    }
}
