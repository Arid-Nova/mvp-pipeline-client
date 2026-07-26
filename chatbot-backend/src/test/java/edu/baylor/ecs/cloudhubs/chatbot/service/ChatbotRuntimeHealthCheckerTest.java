package edu.baylor.ecs.cloudhubs.chatbot.service;

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
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ChatbotRuntimeHealthCheckerTest {

    @Test
    void returnsHealthyWhenProviderResponds() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        Function<Integer, RestTemplate> factory = timeout -> restTemplate;
        ChatbotRuntimeHealthChecker checker = new ChatbotRuntimeHealthChecker(factory);

        ChatbotConfig config = config(ChatbotConfig.Provider.OLLAMA, "http://ollama:11434");
        server.expect(requestTo("http://ollama:11434/api/tags"))
            .andExpect(method(HttpMethod.GET))
            .andRespond(withSuccess("{\"models\":[]}", MediaType.APPLICATION_JSON));

        ChatbotRuntimeHealthChecker.ProbeResult probe = checker.probe(config);
        assertThat(probe.getStatus()).isEqualTo("healthy");
        assertThat(probe.getMessage()).contains("reachable");
        assertThat(probe.getLatencyMs()).isNotNegative();
        server.verify();
    }

    @Test
    void returnsUnavailableWhenProviderCannotBeReached() {
        Function<Integer, RestTemplate> unavailableFactory =
            timeout -> new RestTemplate(new ThrowingRequestFactory(new ConnectException("refused")));
        ChatbotRuntimeHealthChecker checker = new ChatbotRuntimeHealthChecker(unavailableFactory);

        ChatbotRuntimeHealthChecker.ProbeResult probe = checker.probe(config(ChatbotConfig.Provider.OPENAI_COMPATIBLE, "http://localhost:8000"));
        assertThat(probe.getStatus()).isEqualTo("unavailable");
        assertThat(probe.getMessage()).contains("Verify CHATBOT_BASE_URL");
    }

    private ChatbotConfig config(ChatbotConfig.Provider provider, String baseUrl) {
        ChatbotConfig config = new ChatbotConfig();
        config.setProvider(provider);
        config.setModel("llama3.2");
        config.setBaseUrl(baseUrl);
        config.setTimeoutMs(1000);
        config.setMaxTokens(1024);
        config.setTemperature(0.2);
        return config;
    }

    private static class ThrowingRequestFactory extends SimpleClientHttpRequestFactory {
        private final IOException exception;

        private ThrowingRequestFactory(IOException exception) {
            this.exception = exception;
        }

        @Override
        public org.springframework.http.client.ClientHttpRequest createRequest(java.net.URI uri, HttpMethod httpMethod)
            throws IOException {
            throw new ResourceAccessException("simulated access error", exception);
        }
    }
}
