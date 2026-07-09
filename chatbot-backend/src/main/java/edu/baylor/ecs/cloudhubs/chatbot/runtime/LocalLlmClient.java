package edu.baylor.ecs.cloudhubs.chatbot.runtime;

import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;

public interface LocalLlmClient {
    LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig config);
}
