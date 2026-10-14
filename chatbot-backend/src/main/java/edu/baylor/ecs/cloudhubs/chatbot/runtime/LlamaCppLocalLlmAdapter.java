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

    /**
     * llama.cpp's JSON/grammar support depends on the server build, so JSON mode is not requested;
     * callers rely on tolerant JSON extraction instead (Issue #60, R3: not a Milestone 1 blocker).
     */
    @Override
    protected boolean supportsJsonResponseFormat() {
        return false;
    }
}
