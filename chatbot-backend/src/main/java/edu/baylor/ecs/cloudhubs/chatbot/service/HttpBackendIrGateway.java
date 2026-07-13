package edu.baylor.ecs.cloudhubs.chatbot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.zip.GZIPInputStream;

/**
 * Calls {@code backend}'s existing {@code /ir/versions} (POST, by ID) and {@code /ir} (GET, by
 * systemName) endpoints over plain HTTP. Both endpoints return {@code application/gzip} bodies
 * (a JSON array of IR documents), matching the same contract the frontend's own
 * {@code fetchSpecificIRs}/{@code fetchHistoricalIRs} calls rely on.
 */
@Component
public class HttpBackendIrGateway implements BackendIrGateway {

    private static final Logger log = LoggerFactory.getLogger(HttpBackendIrGateway.class);
    private static final int CONNECT_TIMEOUT_MS = 4000;
    private static final int READ_TIMEOUT_MS = 8000;

    private final ChatbotConfig chatbotConfig;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    @Autowired
    public HttpBackendIrGateway(ChatbotConfig chatbotConfig, ObjectMapper objectMapper) {
        this(chatbotConfig, objectMapper, buildRestTemplate());
    }

    HttpBackendIrGateway(ChatbotConfig chatbotConfig, ObjectMapper objectMapper, RestTemplate restTemplate) {
        this.chatbotConfig = chatbotConfig;
        this.objectMapper = objectMapper;
        this.restTemplate = restTemplate;
    }

    @Override
    public Optional<JsonNode> fetchIrById(String irId) {
        if (isBlank(irId) || isBlank(chatbotConfig.getBackendBaseUrl())) {
            return Optional.empty();
        }
        String url = chatbotConfig.getBackendBaseUrl() + "/ir/versions";
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<List<String>> entity = new HttpEntity<>(List.of(irId), headers);
            ResponseEntity<byte[]> response = restTemplate.exchange(url, HttpMethod.POST, entity, byte[].class);
            return firstArrayElement(decompress(response.getBody()));
        } catch (RestClientException | IOException ex) {
            log.warn("chatbot.ir_gateway.fetch_by_id_failed irId={} reason={}", irId, ex.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public Optional<JsonNode> fetchLatestIrForSystem(String systemName) {
        if (isBlank(systemName) || isBlank(chatbotConfig.getBackendBaseUrl())) {
            return Optional.empty();
        }
        String url = UriComponentsBuilder.fromHttpUrl(chatbotConfig.getBackendBaseUrl() + "/ir")
            .queryParam("systemName", systemName)
            .queryParam("limit", 1)
            .toUriString();
        try {
            ResponseEntity<byte[]> response = restTemplate.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, byte[].class);
            return firstArrayElement(decompress(response.getBody()));
        } catch (RestClientException | IOException ex) {
            log.warn("chatbot.ir_gateway.fetch_by_system_failed systemName={} reason={}", systemName, ex.getMessage());
            return Optional.empty();
        }
    }

    private JsonNode decompress(byte[] gzipBytes) throws IOException {
        if (gzipBytes == null || gzipBytes.length == 0) {
            return null;
        }
        try (GZIPInputStream gis = new GZIPInputStream(new ByteArrayInputStream(gzipBytes))) {
            return objectMapper.readTree(gis);
        }
    }

    private Optional<JsonNode> firstArrayElement(JsonNode node) {
        if (node == null) {
            return Optional.empty();
        }
        if (node.isArray()) {
            return node.isEmpty() ? Optional.empty() : Optional.of(node.get(0));
        }
        if (node.isObject()) {
            return Optional.of(node);
        }
        return Optional.empty();
    }

    private static RestTemplate buildRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(CONNECT_TIMEOUT_MS);
        factory.setReadTimeout(READ_TIMEOUT_MS);
        return new RestTemplate(factory);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
