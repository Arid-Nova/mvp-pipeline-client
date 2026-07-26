package edu.baylor.ecs.cloudhubs.chatbot.service;

import static org.assertj.core.api.Assertions.assertThat;

import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotHealthResponse;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class ChatbotHealthServiceTest {

    @Test
    void healthUsesRuntimeProbeAndSanitizesBaseUrl() {
        Instant checkedAt = Instant.parse("2026-06-02T12:00:00Z");
        ChatbotConfig config = config("http://user:secret@ollama:11434/api?token=hidden");
        ChatbotRuntimeHealthChecker checker = new ChatbotRuntimeHealthChecker() {
            @Override
            public ProbeResult probe(ChatbotConfig ignored) {
                return new ProbeResult("healthy", "runtime reachable", 17L, checkedAt);
            }
        };

        ChatbotHealthResponse response = new ChatbotHealthService(config, checker).health();

        assertThat(response.getStatus()).isEqualTo("healthy");
        assertThat(response.getProvider()).isEqualTo("OLLAMA");
        assertThat(response.getModel()).isEqualTo("llama3.2");
        assertThat(response.getBaseUrl()).isEqualTo("http://ollama:11434/api");
        assertThat(response.getMessage()).isEqualTo("runtime reachable");
        assertThat(response.getLatencyMs()).isEqualTo(17L);
        assertThat(response.getCheckedAt()).isEqualTo(checkedAt);
    }

    @Test
    void healthFallsBackToInvalidBaseUrlForMalformedRuntimeUrl() {
        ChatbotConfig config = config("http://[invalid");
        ChatbotRuntimeHealthChecker checker = new ChatbotRuntimeHealthChecker() {
            @Override
            public ProbeResult probe(ChatbotConfig ignored) {
                return new ProbeResult("unavailable", "runtime unreachable", 3L, Instant.parse("2026-06-02T12:00:00Z"));
            }
        };

        ChatbotHealthResponse response = new ChatbotHealthService(config, checker).health();

        assertThat(response.getStatus()).isEqualTo("unavailable");
        assertThat(response.getBaseUrl()).isEqualTo("invalid-base-url");
    }

    private ChatbotConfig config(String baseUrl) {
        ChatbotConfig config = new ChatbotConfig();
        config.setProvider(ChatbotConfig.Provider.OLLAMA);
        config.setModel("llama3.2");
        config.setBaseUrl(baseUrl);
        config.setTimeoutMs(30000);
        config.setMaxTokens(1024);
        config.setTemperature(0.2);
        config.setContextBudgetMaxEvidenceItems(20);
        config.setContextBudgetMaxEvidenceChars(12000);
        config.setStrictEvidenceOnly(true);
        return config;
    }
}
