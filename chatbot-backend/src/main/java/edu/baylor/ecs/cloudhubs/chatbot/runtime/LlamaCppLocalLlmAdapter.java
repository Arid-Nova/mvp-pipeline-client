package edu.baylor.ecs.cloudhubs.chatbot.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import org.springframework.stereotype.Component;

@Component
public class LlamaCppLocalLlmAdapter extends OpenAiStyleLocalLlmAdapter {

    public LlamaCppLocalLlmAdapter(ObjectMapper objectMapper) {
        super(objectMapper);
    }

    @Override
    public ChatbotConfig.Provider supportedProvider() {
        return ChatbotConfig.Provider.LLAMA_CPP;
    }
}
