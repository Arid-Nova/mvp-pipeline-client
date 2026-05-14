package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotHealthResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service.ChatbotHealthService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ChatbotControllerTest {

    @Test
    void returnsHealthPayload() throws Exception {
        ChatbotHealthService stubHealthService = new ChatbotHealthService(null, null) {
            @Override
            public ChatbotHealthResponse health() {
                return new ChatbotHealthResponse(
                    "unavailable",
                    "OLLAMA",
                    "llama3.2",
                    "http://ollama:11434",
                    "Runtime connection failed. Verify CHATBOT_BASE_URL and runtime container status.",
                    Instant.parse("2026-05-14T10:00:00Z"),
                    42L
                );
            }
        };
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new ChatbotController(stubHealthService)).build();

        mockMvc.perform(get("/chatbot/health").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("unavailable"))
            .andExpect(jsonPath("$.provider").value("OLLAMA"))
            .andExpect(jsonPath("$.model").value("llama3.2"))
            .andExpect(jsonPath("$.baseUrl").value("http://ollama:11434"))
            .andExpect(jsonPath("$.latencyMs").value(42));
    }
}
