package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmFailureCode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config.ChatbotConfig;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.util.Map;
import java.util.function.Function;

public abstract class AbstractHttpLocalLlmAdapter implements LocalLlmAdapter {

    private final ObjectMapper objectMapper;
    private final Function<Integer, RestTemplate> restTemplateFactory;

    protected AbstractHttpLocalLlmAdapter(ObjectMapper objectMapper) {
        this(objectMapper, AbstractHttpLocalLlmAdapter::buildRestTemplate);
    }

    protected AbstractHttpLocalLlmAdapter(
        ObjectMapper objectMapper,
        Function<Integer, RestTemplate> restTemplateFactory
    ) {
        this.objectMapper = objectMapper;
        this.restTemplateFactory = restTemplateFactory;
    }

    protected abstract String endpointPath();

    protected abstract Map<String, Object> buildPayload(ChatbotPrompt prompt, ChatbotConfig config);

    protected abstract LocalLlmResult parseResponse(JsonNode root, ChatbotConfig config, int statusCode);

    @Override
    public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig config) {
        try {
            RestTemplate restTemplate = restTemplateFactory.apply(config.getTimeoutMs());
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(buildPayload(prompt, config), headers);
            String url = config.getBaseUrl() + endpointPath();

            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            JsonNode root = readJson(response.getBody());
            return parseResponse(root, config, response.getStatusCode().value());
        } catch (ResourceAccessException ex) {
            throw mapAccessException(ex);
        } catch (HttpStatusCodeException ex) {
            throw mapStatusException(ex);
        } catch (LocalLlmException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new LocalLlmException(LocalLlmFailureCode.provider_error,
                "Local model provider request failed unexpectedly.", ex);
        }
    }

    private static RestTemplate buildRestTemplate(int timeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);
        return new RestTemplate(requestFactory);
    }

    protected JsonNode readJson(String body) {
        try {
            if (body == null || body.isBlank()) {
                throw new LocalLlmException(LocalLlmFailureCode.invalid_response, "Provider returned an empty response body.");
            }
            return objectMapper.readTree(body);
        } catch (LocalLlmException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new LocalLlmException(LocalLlmFailureCode.invalid_response,
                "Provider returned invalid JSON response.", ex);
        }
    }

    private LocalLlmException mapAccessException(ResourceAccessException ex) {
        Throwable cause = ex.getCause();
        if (cause instanceof SocketTimeoutException) {
            return new LocalLlmException(LocalLlmFailureCode.timeout,
                "Local model request timed out. Increase CHATBOT_TIMEOUT_MS or check model runtime health.", ex);
        }
        if (cause instanceof ConnectException) {
            return new LocalLlmException(LocalLlmFailureCode.model_unavailable,
                "Local model runtime is unavailable. Verify CHATBOT_BASE_URL and runtime container status.", ex);
        }
        return new LocalLlmException(LocalLlmFailureCode.provider_error,
            "Local model runtime could not be reached.", ex);
    }

    private LocalLlmException mapStatusException(HttpStatusCodeException ex) {
        int status = ex.getStatusCode().value();
        if (status == 502 || status == 503 || status == 504) {
            return new LocalLlmException(LocalLlmFailureCode.model_unavailable,
                "Local model runtime is unavailable (HTTP " + status + ").", ex);
        }
        if (status == 408) {
            return new LocalLlmException(LocalLlmFailureCode.timeout,
                "Local model request timed out (HTTP 408).", ex);
        }
        return new LocalLlmException(LocalLlmFailureCode.provider_error,
            "Local model provider returned error HTTP status " + status + ".", ex);
    }
}
