package edu.baylor.ecs.cloudhubs.chatbot.service;

import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.time.Instant;
import java.util.function.Function;

@Component
public class ChatbotRuntimeHealthChecker {

    private final Function<Integer, RestTemplate> restTemplateFactory;

    public ChatbotRuntimeHealthChecker() {
        this(ChatbotRuntimeHealthChecker::buildRestTemplate);
    }

    ChatbotRuntimeHealthChecker(Function<Integer, RestTemplate> restTemplateFactory) {
        this.restTemplateFactory = restTemplateFactory;
    }

    public ProbeResult probe(ChatbotConfig config) {
        long startMs = System.currentTimeMillis();
        String probePath = probePath(config.getProvider());
        try {
            RestTemplate restTemplate = restTemplateFactory.apply(config.getTimeoutMs());
            ResponseEntity<String> response = restTemplate.exchange(
                config.getBaseUrl() + probePath,
                HttpMethod.GET,
                null,
                String.class
            );
            long latencyMs = System.currentTimeMillis() - startMs;
            int status = response.getStatusCode().value();
            if (status >= 200 && status < 300) {
                return new ProbeResult("healthy", "Local model runtime is reachable.", latencyMs, Instant.now());
            }
            return new ProbeResult("degraded", "Runtime responded with HTTP " + status + ".", latencyMs, Instant.now());
        } catch (ResourceAccessException ex) {
            long latencyMs = System.currentTimeMillis() - startMs;
            Throwable cause = ex.getCause();
            if (cause instanceof SocketTimeoutException) {
                return new ProbeResult("unavailable", "Runtime check timed out. Increase CHATBOT_TIMEOUT_MS or verify runtime health.", latencyMs, Instant.now());
            }
            if (cause instanceof ConnectException) {
                return new ProbeResult("unavailable", "Runtime connection failed. Verify CHATBOT_BASE_URL and runtime container status.", latencyMs, Instant.now());
            }
            return new ProbeResult("unavailable", "Runtime is unreachable.", latencyMs, Instant.now());
        } catch (RestClientException ex) {
            long latencyMs = System.currentTimeMillis() - startMs;
            return new ProbeResult("unavailable", "Runtime health check failed: " + ex.getClass().getSimpleName(), latencyMs, Instant.now());
        }
    }

    private String probePath(ChatbotConfig.Provider provider) {
        if (provider == ChatbotConfig.Provider.OLLAMA) {
            return "/api/tags";
        }
        if (provider == ChatbotConfig.Provider.LLAMA_CPP) {
            return "/health";
        }
        return "/v1/models";
    }

    private static RestTemplate buildRestTemplate(int timeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);
        return new RestTemplate(requestFactory);
    }

    @Getter
    @AllArgsConstructor
    public static class ProbeResult {
        private String status;
        private String message;
        private Long latencyMs;
        private Instant checkedAt;
    }
}
