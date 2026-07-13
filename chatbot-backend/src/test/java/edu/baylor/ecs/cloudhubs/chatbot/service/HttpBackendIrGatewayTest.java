package edu.baylor.ecs.cloudhubs.chatbot.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import java.io.ByteArrayOutputStream;
import java.util.Optional;
import java.util.zip.GZIPOutputStream;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

class HttpBackendIrGatewayTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void fetchIrByIdPostsIdArrayAndGunzipsFirstArrayElement() throws Exception {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        HttpBackendIrGateway gateway = new HttpBackendIrGateway(config("http://backend:8080"), objectMapper, restTemplate);

        byte[] gzipBody = gzip("[{\"id\":\"ir-1\",\"name\":\"TrainTicket\"}]");
        server.expect(requestTo("http://backend:8080/ir/versions"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().json("[\"ir-1\"]"))
            .andRespond(withSuccess(gzipBody, MediaType.valueOf("application/gzip")));

        Optional<JsonNode> result = gateway.fetchIrById("ir-1");

        assertThat(result).isPresent();
        assertThat(result.get().get("name").asText()).isEqualTo("TrainTicket");
        server.verify();
    }

    @Test
    void fetchLatestIrForSystemGetsByQueryParamAndGunzips() throws Exception {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        HttpBackendIrGateway gateway = new HttpBackendIrGateway(config("http://backend:8080"), objectMapper, restTemplate);

        byte[] gzipBody = gzip("[{\"name\":\"orders\"}]");
        server.expect(requestTo("http://backend:8080/ir?systemName=orders&limit=1"))
            .andExpect(method(HttpMethod.GET))
            .andRespond(withSuccess(gzipBody, MediaType.valueOf("application/gzip")));

        Optional<JsonNode> result = gateway.fetchLatestIrForSystem("orders");

        assertThat(result).isPresent();
        assertThat(result.get().get("name").asText()).isEqualTo("orders");
        server.verify();
    }

    @Test
    void returnsEmptyWhenBackendReturns400ForUnknownId() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        HttpBackendIrGateway gateway = new HttpBackendIrGateway(config("http://backend:8080"), objectMapper, restTemplate);

        server.expect(requestTo("http://backend:8080/ir/versions"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withStatus(HttpStatus.BAD_REQUEST).body("No systems found with the provided IDs!"));

        assertThat(gateway.fetchIrById("missing-id")).isEmpty();
    }

    @Test
    void returnsEmptyWhenBackendReturns500() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        HttpBackendIrGateway gateway = new HttpBackendIrGateway(config("http://backend:8080"), objectMapper, restTemplate);

        server.expect(requestTo("http://backend:8080/ir/versions"))
            .andRespond(withServerError());

        assertThat(gateway.fetchIrById("ir-1")).isEmpty();
    }

    @Test
    void returnsEmptyWithoutCallingBackendWhenBackendBaseUrlIsBlank() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        HttpBackendIrGateway gateway = new HttpBackendIrGateway(config(""), objectMapper, restTemplate);

        assertThat(gateway.fetchIrById("ir-1")).isEmpty();
        assertThat(gateway.fetchLatestIrForSystem("orders")).isEmpty();
        server.verify();
    }

    private byte[] gzip(String json) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (GZIPOutputStream gzos = new GZIPOutputStream(baos)) {
            gzos.write(json.getBytes());
        }
        return baos.toByteArray();
    }

    private ChatbotConfig config(String backendBaseUrl) {
        ChatbotConfig config = new ChatbotConfig();
        config.setProvider(ChatbotConfig.Provider.OLLAMA);
        config.setModel("llama3.2");
        config.setBaseUrl("http://ollama:11434");
        config.setTimeoutMs(30000);
        config.setMaxTokens(1024);
        config.setTemperature(0.2);
        config.setBackendBaseUrl(backendBaseUrl);
        return config;
    }
}
