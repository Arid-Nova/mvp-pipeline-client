package edu.baylor.ecs.cloudhubs.chatbot.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotMessage;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmFailureCode;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

@Component
public class OpenAiStyleLocalLlmAdapter extends AbstractHttpLocalLlmAdapter {

    @Autowired
    public OpenAiStyleLocalLlmAdapter(ObjectMapper objectMapper) {
        super(objectMapper);
    }

    OpenAiStyleLocalLlmAdapter(ObjectMapper objectMapper, Function<Integer, RestTemplate> restTemplateFactory) {
        super(objectMapper, restTemplateFactory);
    }

    @Override
    public ChatbotConfig.Provider supportedProvider() {
        return ChatbotConfig.Provider.OPENAI_COMPATIBLE;
    }

    @Override
    protected String endpointPath() {
        return "/v1/chat/completions";
    }

    @Override
    protected Map<String, Object> buildPayload(ChatbotPrompt prompt, ChatbotConfig config) {
        List<Map<String, String>> messages = new ArrayList<>();
        if (prompt.getSystemInstruction() != null && !prompt.getSystemInstruction().isBlank()) {
            messages.add(message("system", prompt.getSystemInstruction()));
        }
        if (prompt.getMessages() != null) {
            for (ChatbotMessage message : prompt.getMessages()) {
                messages.add(message(message.getRole(), message.getContent()));
            }
        }
        messages.add(message("user", prompt.getUserQuestion()));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", config.getModel());
        payload.put("messages", messages);
        payload.put("temperature", config.getTemperature());
        payload.put("max_tokens", config.getMaxTokens());
        return payload;
    }

    @Override
    protected LocalLlmResult parseResponse(JsonNode root, ChatbotConfig config, int statusCode) {
        JsonNode firstChoice = root.path("choices").isArray() && root.path("choices").size() > 0
            ? root.path("choices").get(0) : null;
        if (firstChoice == null) {
            throw new LocalLlmException(LocalLlmFailureCode.invalid_response,
                "Provider response missing choices[0].");
        }

        JsonNode contentNode = firstChoice.path("message").path("content");
        if (contentNode.isMissingNode() || contentNode.asText().isBlank()) {
            throw new LocalLlmException(LocalLlmFailureCode.invalid_response,
                "Provider response missing choices[0].message.content.");
        }

        String model = root.path("model").asText(config.getModel());
        String finishReason = firstChoice.path("finish_reason").asText(null);
        return new LocalLlmResult(contentNode.asText(), model, config.getProvider().name(), statusCode, finishReason);
    }

    private Map<String, String> message(String role, String content) {
        Map<String, String> message = new LinkedHashMap<>();
        message.put("role", role);
        message.put("content", content);
        return message;
    }
}
