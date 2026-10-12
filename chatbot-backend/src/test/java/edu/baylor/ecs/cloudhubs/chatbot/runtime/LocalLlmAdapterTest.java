package edu.baylor.ecs.cloudhubs.chatbot.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotMessage;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmFailureCode;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class LocalLlmAdapterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void buildsOllamaRequestAndParsesResponse() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        Function<Integer, RestTemplate> factory = timeout -> restTemplate;
        OllamaLocalLlmAdapter adapter = new OllamaLocalLlmAdapter(objectMapper, factory);

        ChatbotConfig config = config(ChatbotConfig.Provider.OLLAMA, "http://ollama:11434");
        ChatbotPrompt prompt = new ChatbotPrompt(
            "Ground responses in provided artifacts.",
            "Is auth check missing?",
            List.of(new ChatbotMessage("user", "previous question"))
        );

        server.expect(requestTo("http://ollama:11434/api/chat"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(content().json("""
                {
                  "model": "llama3.2",
                  "stream": false,
                  "messages": [
                    {"role":"system","content":"Ground responses in provided artifacts."},
                    {"role":"user","content":"previous question"},
                    {"role":"user","content":"Is auth check missing?"}
                  ]
                }
                """, false))
            .andRespond(withSuccess("""
                {
                  "model": "llama3.2",
                  "message": {"role":"assistant","content":"Auth check appears missing on refund path."},
                  "done_reason": "stop"
                }
                """, MediaType.APPLICATION_JSON));

        LocalLlmResult result = adapter.generate(prompt, config);

        assertThat(result.getText()).contains("missing on refund path");
        assertThat(result.getProvider()).isEqualTo("OLLAMA");
        assertThat(result.getFinishReason()).isEqualTo("stop");
        server.verify();
    }

    @Test
    void buildsOpenAiCompatibleRequestAndParsesResponse() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        Function<Integer, RestTemplate> factory = timeout -> restTemplate;
        OpenAiStyleLocalLlmAdapter adapter = new OpenAiStyleLocalLlmAdapter(objectMapper, factory);

        ChatbotConfig config = config(ChatbotConfig.Provider.OPENAI_COMPATIBLE, "http://llama-cpp:8080");
        ChatbotPrompt prompt = new ChatbotPrompt(
            null,
            "Summarize risky endpoints.",
            List.of(new ChatbotMessage("assistant", "Earlier answer"))
        );

        server.expect(requestTo("http://llama-cpp:8080/v1/chat/completions"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(content().json("""
                {
                  "model":"llama3.2",
                  "messages":[
                    {"role":"assistant","content":"Earlier answer"},
                    {"role":"user","content":"Summarize risky endpoints."}
                  ],
                  "temperature":0.2,
                  "max_tokens":1024
                }
                """, false))
            .andRespond(withSuccess("""
                {
                  "id":"chatcmpl-1",
                  "model":"llama3.2",
                  "choices":[
                    {
                      "index":0,
                      "message":{"role":"assistant","content":"Two endpoints require review."},
                      "finish_reason":"stop"
                    }
                  ]
                }
                """, MediaType.APPLICATION_JSON));

        LocalLlmResult result = adapter.generate(prompt, config);
        assertThat(result.getText()).contains("Two endpoints");
        assertThat(result.getProvider()).isEqualTo("OPENAI_COMPATIBLE");
        assertThat(result.getFinishReason()).isEqualTo("stop");
        server.verify();
    }

    @Test
    void mapsTimeoutUnavailableAndProviderErrors() {
        OllamaLocalLlmAdapter timeoutAdapter = new OllamaLocalLlmAdapter(objectMapper, timeoutFactory());
        OllamaLocalLlmAdapter unavailableAdapter = new OllamaLocalLlmAdapter(objectMapper, unavailableFactory());

        ChatbotConfig config = config(ChatbotConfig.Provider.OLLAMA, "http://ollama:11434");
        ChatbotPrompt prompt = new ChatbotPrompt(null, "test", List.of());

        assertThatThrownBy(() -> timeoutAdapter.generate(prompt, config))
            .isInstanceOf(LocalLlmException.class)
            .satisfies(ex -> assertThat(((LocalLlmException) ex).getCode()).isEqualTo(LocalLlmFailureCode.TIMEOUT));

        assertThatThrownBy(() -> unavailableAdapter.generate(prompt, config))
            .isInstanceOf(LocalLlmException.class)
            .satisfies(ex -> assertThat(((LocalLlmException) ex).getCode()).isEqualTo(LocalLlmFailureCode.MODEL_UNAVAILABLE));

        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        OllamaLocalLlmAdapter providerErrorAdapter = new OllamaLocalLlmAdapter(objectMapper, timeout -> restTemplate);
        server.expect(requestTo("http://ollama:11434/api/chat"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withServerError());

        assertThatThrownBy(() -> providerErrorAdapter.generate(prompt, config))
            .isInstanceOf(LocalLlmException.class)
            .satisfies(ex -> assertThat(((LocalLlmException) ex).getCode()).isEqualTo(LocalLlmFailureCode.PROVIDER_ERROR));
    }

    @Test
    void sendsJsonModeAndContextWindowForAnIntentSelectionPrompt() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        OllamaLocalLlmAdapter adapter = new OllamaLocalLlmAdapter(objectMapper, timeout -> restTemplate);

        ChatbotConfig config = config(ChatbotConfig.Provider.OLLAMA, "http://ollama:11434");
        config.setMaxTokens(512);
        config.setTemperature(0.4);
        ChatbotPrompt prompt = new ChatbotPrompt("Choose analyses.", "Analysis goal: \"x\"", List.of(), true, 4096);

        server.expect(requestTo("http://ollama:11434/api/chat"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().json("""
                {
                  "model": "llama3.2",
                  "stream": false,
                  "format": "json",
                  "messages": [
                    {"role":"system","content":"Choose analyses."},
                    {"role":"user","content":"Analysis goal: \\"x\\""}
                  ],
                  "options": {"temperature": 0.4, "num_predict": 512, "num_ctx": 4096}
                }
                """, true))
            .andRespond(withSuccess("""
                {"model":"llama3.2","message":{"role":"assistant","content":"{\\"options\\":[]}"},"done_reason":"stop"}
                """, MediaType.APPLICATION_JSON));

        LocalLlmResult result = adapter.generate(prompt, config);

        assertThat(result.getText()).isEqualTo("{\"options\":[]}");
        server.verify();
    }

    @Test
    void keepsTheQaOllamaPayloadUnchanged() {
        OllamaLocalLlmAdapter adapter = new OllamaLocalLlmAdapter(objectMapper, timeout -> new RestTemplate());
        ChatbotConfig config = config(ChatbotConfig.Provider.OLLAMA, "http://ollama:11434");

        Map<String, Object> payload = adapter.buildPayload(new ChatbotPrompt("system", "question", List.of()), config);

        @SuppressWarnings("unchecked")
        Map<String, Object> options = (Map<String, Object>) payload.get("options");
        assertThat(payload).containsOnlyKeys("model", "messages", "stream", "options");
        assertThat(options).containsOnlyKeys("temperature", "num_predict");
        assertThat(options).containsEntry("temperature", 0.2).containsEntry("num_predict", 1024);
    }

    @Test
    void requestsJsonObjectResponsesFromOpenAiCompatibleRuntimesOnlyWhenAsked() {
        OpenAiStyleLocalLlmAdapter adapter = new OpenAiStyleLocalLlmAdapter(objectMapper, timeout -> new RestTemplate());
        ChatbotConfig config = config(ChatbotConfig.Provider.OPENAI_COMPATIBLE, "http://llm:8000");

        Map<String, Object> qa = adapter.buildPayload(new ChatbotPrompt(null, "question", List.of()), config);
        Map<String, Object> intent = adapter.buildPayload(new ChatbotPrompt(null, "goal", List.of(), true, 4096), config);

        assertThat(qa).containsOnlyKeys("model", "messages", "temperature", "max_tokens");
        assertThat(intent).containsEntry("response_format", Map.of("type", "json_object"));
        assertThat(intent).doesNotContainKey("num_ctx");
    }

    @Test
    void leavesLlamaCppOnTolerantExtractionWithoutJsonMode() {
        LlamaCppLocalLlmAdapter adapter = new LlamaCppLocalLlmAdapter(objectMapper);
        ChatbotConfig config = config(ChatbotConfig.Provider.LLAMA_CPP, "http://llama-cpp:8080");

        Map<String, Object> intent = adapter.buildPayload(new ChatbotPrompt(null, "goal", List.of(), true, 4096), config);

        assertThat(intent).containsOnlyKeys("model", "messages", "temperature", "max_tokens");
        assertThat(adapter.supportedProvider()).isEqualTo(ChatbotConfig.Provider.LLAMA_CPP);
    }

    @Test
    void selectsAdapterAtRuntime() {
        LocalLlmAdapter ollamaAdapter = new LocalLlmAdapter() {
            @Override
            public ChatbotConfig.Provider supportedProvider() {
                return ChatbotConfig.Provider.OLLAMA;
            }

            @Override
            public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig config) {
                return new LocalLlmResult("ok", config.getModel(), "OLLAMA", 200, "stop");
            }
        };

        DefaultLocalLlmClient client = new DefaultLocalLlmClient(List.of(ollamaAdapter));
        LocalLlmResult result = client.generate(new ChatbotPrompt(null, "hi", List.of()), config(ChatbotConfig.Provider.OLLAMA, "http://ollama:11434"));
        assertThat(result.getText()).isEqualTo("ok");
    }

    private ChatbotConfig config(ChatbotConfig.Provider provider, String baseUrl) {
        ChatbotConfig config = new ChatbotConfig();
        config.setProvider(provider);
        config.setModel("llama3.2");
        config.setBaseUrl(baseUrl);
        config.setTimeoutMs(30000);
        config.setMaxTokens(1024);
        config.setTemperature(0.2);
        return config;
    }

    private Function<Integer, RestTemplate> timeoutFactory() {
        return timeout -> new RestTemplate(new ThrowingRequestFactory(new SocketTimeoutException("simulated timeout")));
    }

    private Function<Integer, RestTemplate> unavailableFactory() {
        return timeout -> new RestTemplate(new ThrowingRequestFactory(new ConnectException("simulated connection refused")));
    }

    private static class ThrowingRequestFactory extends SimpleClientHttpRequestFactory {
        private final IOException exception;

        private ThrowingRequestFactory(IOException exception) {
            this.exception = exception;
        }

        @Override
        public org.springframework.http.client.ClientHttpRequest createRequest(java.net.URI uri, HttpMethod httpMethod)
            throws IOException {
            throw exception;
        }
    }
}
