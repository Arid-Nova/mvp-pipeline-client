package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotHealthResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotQueryRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmFailureCode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service.ChatbotHealthService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service.ChatbotQueryService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import java.time.Instant;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
        ChatbotQueryService stubQueryService = new ChatbotQueryService(null, null, null, null, null, null, null) {};
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new ChatbotController(stubHealthService, stubQueryService)).build();

        mockMvc.perform(get("/chatbot/health").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("unavailable"))
            .andExpect(jsonPath("$.provider").value("OLLAMA"))
            .andExpect(jsonPath("$.model").value("llama3.2"))
            .andExpect(jsonPath("$.baseUrl").value("http://ollama:11434"))
            .andExpect(jsonPath("$.latencyMs").value(42));
    }

    @Test
    void returnsQueryEnvelopeForValidRequest() throws Exception {
        ChatbotHealthService healthService = new ChatbotHealthService(null, null) {
            @Override
            public ChatbotHealthResponse health() {
                return null;
            }
        };
        ChatbotQueryService queryService = new ChatbotQueryService(null, null, null, null, null, null, null) {
            @Override
            public ChatbotResponse query(ChatbotQueryRequest request, String requestId) {
                ChatbotResponse response = new ChatbotResponse();
                response.setAnswer("Answer: service changed.\nQualification: medium confidence.");
                response.setRequestId(requestId);
                response.setProcessingTimeMs(12);
                response.setModel("llama3.2");
                response.setProvider("OLLAMA");
                response.setCitations(List.of());
                response.setFlags(List.of());
                return response;
            }
        };

        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();

        MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new ChatbotController(healthService, queryService))
            .setValidator(validator)
            .build();

        mockMvc.perform(post("/chatbot/query")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"question\":\"What changed?\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.answer").exists())
            .andExpect(jsonPath("$.requestId").value(org.hamcrest.Matchers.startsWith("req-")))
            .andExpect(jsonPath("$.model").value("llama3.2"))
            .andExpect(jsonPath("$.provider").value("OLLAMA"));
    }

    @Test
    void rejectsEmptyQuestionValidation() throws Exception {
        ChatbotHealthService healthService = new ChatbotHealthService(null, null) {
            @Override
            public ChatbotHealthResponse health() {
                return null;
            }
        };
        ChatbotQueryService queryService = new ChatbotQueryService(null, null, null, null, null, null, null) {
            @Override
            public ChatbotResponse query(ChatbotQueryRequest request, String requestId) {
                throw new LocalLlmException(LocalLlmFailureCode.provider_error, "should not be called");
            }
        };

        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();

        MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new ChatbotController(healthService, queryService))
            .setValidator(validator)
            .build();

        mockMvc.perform(post("/chatbot/query")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"question\":\"   \"}"))
            .andExpect(status().isBadRequest());
    }
}
