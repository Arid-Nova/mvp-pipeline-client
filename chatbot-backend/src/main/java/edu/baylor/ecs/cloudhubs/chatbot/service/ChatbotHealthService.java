package edu.baylor.ecs.cloudhubs.chatbot.service;

import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotHealthResponse;
import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.time.Instant;

@Service
public class ChatbotHealthService {

    private final ChatbotConfig chatbotConfig;
    private final ChatbotRuntimeHealthChecker healthChecker;

    public ChatbotHealthService(ChatbotConfig chatbotConfig, ChatbotRuntimeHealthChecker healthChecker) {
        this.chatbotConfig = chatbotConfig;
        this.healthChecker = healthChecker;
    }

    public ChatbotHealthResponse health() {
        ChatbotRuntimeHealthChecker.ProbeResult probe = healthChecker.probe(chatbotConfig);
        return new ChatbotHealthResponse(
            probe.getStatus(),
            chatbotConfig.getProvider().name(),
            chatbotConfig.getModel(),
            sanitizeBaseUrl(chatbotConfig.getBaseUrl()),
            probe.getMessage(),
            probe.getCheckedAt() == null ? Instant.now() : probe.getCheckedAt(),
            probe.getLatencyMs()
        );
    }

    private String sanitizeBaseUrl(String baseUrl) {
        if (baseUrl == null || baseUrl.isBlank()) {
            return "";
        }
        try {
            URI uri = URI.create(baseUrl);
            int port = uri.getPort();
            StringBuilder sanitized = new StringBuilder();
            if (uri.getScheme() != null) {
                sanitized.append(uri.getScheme()).append("://");
            }
            if (uri.getHost() != null) {
                sanitized.append(uri.getHost());
            } else {
                return baseUrl;
            }
            if (port >= 0) {
                sanitized.append(":").append(port);
            }
            if (uri.getPath() != null && !uri.getPath().isBlank()) {
                sanitized.append(uri.getPath());
            }
            return sanitized.toString();
        } catch (Exception ex) {
            return "invalid-base-url";
        }
    }
}
