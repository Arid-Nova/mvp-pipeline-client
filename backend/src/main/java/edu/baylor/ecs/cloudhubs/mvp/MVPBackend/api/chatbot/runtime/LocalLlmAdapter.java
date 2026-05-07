package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config.ChatbotConfig;

public interface LocalLlmAdapter {
    ChatbotConfig.Provider supportedProvider();

    LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig config);
}
