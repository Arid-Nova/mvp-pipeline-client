package edu.baylor.ecs.cloudhubs.chatbot.runtime;

import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmFailureCode;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import org.springframework.stereotype.Service;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
public class DefaultLocalLlmClient implements LocalLlmClient {

    private final Map<ChatbotConfig.Provider, LocalLlmAdapter> adapters = new EnumMap<>(ChatbotConfig.Provider.class);

    public DefaultLocalLlmClient(List<LocalLlmAdapter> adapterList) {
        for (LocalLlmAdapter adapter : adapterList) {
            adapters.put(adapter.supportedProvider(), adapter);
        }
    }

    @Override
    public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig config) {
        LocalLlmAdapter adapter = adapters.get(config.getProvider());
        if (adapter == null) {
            throw new LocalLlmException(
                LocalLlmFailureCode.provider_error,
                "No local provider adapter registered for provider " + config.getProvider() + "."
            );
        }
        return adapter.generate(prompt, config);
    }
}
