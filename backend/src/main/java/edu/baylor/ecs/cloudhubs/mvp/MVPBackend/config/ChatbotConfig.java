package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "chatbot")
public class ChatbotConfig {

    @NotNull(message = "chatbot.provider is required. Use one of: OLLAMA, LLAMA_CPP, OPENAI_COMPATIBLE.")
    private Provider provider;

    @NotBlank(message = "chatbot.model is required. Set CHATBOT_MODEL (example: llama3.2).")
    private String model;

    @NotBlank(message = "chatbot.base-url is required. Set CHATBOT_BASE_URL (example: http://ollama:11434).")
    private String baseUrl;

    @Positive(message = "chatbot.timeout-ms must be positive. Set CHATBOT_TIMEOUT_MS to a value like 30000.")
    private int timeoutMs;

    @Positive(message = "chatbot.max-tokens must be positive. Set CHATBOT_MAX_TOKENS to a value like 1024.")
    private int maxTokens;

    @DecimalMin(value = "0.0", inclusive = true,
        message = "chatbot.temperature must be >= 0.0. Set CHATBOT_TEMPERATURE between 0.0 and 2.0.")
    @DecimalMax(value = "2.0", inclusive = true,
        message = "chatbot.temperature must be <= 2.0. Set CHATBOT_TEMPERATURE between 0.0 and 2.0.")
    private double temperature;

    @Positive(message = "chatbot.context-budget.max-evidence-items must be positive.")
    private int contextBudgetMaxEvidenceItems;

    @Positive(message = "chatbot.context-budget.max-evidence-chars must be positive.")
    private int contextBudgetMaxEvidenceChars;

    private boolean strictEvidenceOnly;

    public enum Provider {
        OLLAMA,
        LLAMA_CPP,
        OPENAI_COMPATIBLE
    }

    public Provider getProvider() {
        return provider;
    }

    public void setProvider(Provider provider) {
        this.provider = provider;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public int getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(int timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(int maxTokens) {
        this.maxTokens = maxTokens;
    }

    public double getTemperature() {
        return temperature;
    }

    public void setTemperature(double temperature) {
        this.temperature = temperature;
    }

    public int getContextBudgetMaxEvidenceItems() {
        return contextBudgetMaxEvidenceItems;
    }

    public void setContextBudgetMaxEvidenceItems(int contextBudgetMaxEvidenceItems) {
        this.contextBudgetMaxEvidenceItems = contextBudgetMaxEvidenceItems;
    }

    public int getContextBudgetMaxEvidenceChars() {
        return contextBudgetMaxEvidenceChars;
    }

    public void setContextBudgetMaxEvidenceChars(int contextBudgetMaxEvidenceChars) {
        this.contextBudgetMaxEvidenceChars = contextBudgetMaxEvidenceChars;
    }

    public boolean isStrictEvidenceOnly() {
        return strictEvidenceOnly;
    }

    public void setStrictEvidenceOnly(boolean strictEvidenceOnly) {
        this.strictEvidenceOnly = strictEvidenceOnly;
    }
}
