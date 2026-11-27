package edu.baylor.ecs.cloudhubs.chatbot.retrieval;

import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotMessage;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;

import java.nio.charset.StandardCharsets;

/**
 * Conservative preflight budget for the complete Q&A prompt. This is an estimate rather than a
 * model-specific tokenizer; deployments can tune bytesPerToken and the safety reserve to their
 * selected model. It counts system/developer/evidence text, the current question, history, and
 * per-message framing before the provider is invoked.
 */
public class PromptTokenBudgeter {

    private static final int APPROXIMATE_MESSAGE_OVERHEAD_TOKENS = 4;

    public int availableInputTokens(ChatbotConfig config) {
        if (config == null) {
            return 0;
        }
        return Math.max(0,
            config.getContextTokens() - config.getMaxTokens() - config.getContextSafetyTokens());
    }

    public int estimateInputTokens(ChatbotPrompt prompt, int bytesPerToken) {
        if (prompt == null || bytesPerToken <= 0) {
            return Integer.MAX_VALUE;
        }

        long bytes = utf8Length(prompt.getSystemInstruction()) + utf8Length(prompt.getUserQuestion());
        int messageCount = 2; // system and current user messages
        if (prompt.getMessages() != null) {
            for (ChatbotMessage message : prompt.getMessages()) {
                if (message == null) {
                    continue;
                }
                bytes += utf8Length(message.getRole()) + utf8Length(message.getContent());
                messageCount++;
            }
        }

        long textTokens = (bytes + bytesPerToken - 1L) / bytesPerToken;
        long estimated = textTokens + (long) messageCount * APPROXIMATE_MESSAGE_OVERHEAD_TOKENS;
        return estimated >= Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) estimated;
    }

    public boolean fits(ChatbotPrompt prompt, ChatbotConfig config) {
        return config != null
            && estimateInputTokens(prompt, config.getPromptBytesPerToken()) <= availableInputTokens(config);
    }

    private long utf8Length(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }
}