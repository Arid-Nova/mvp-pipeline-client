package edu.baylor.ecs.cloudhubs.chatbot;

import jakarta.validation.Valid;
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

    private String backendBaseUrl;

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

    /** Settings for POST /chatbot/pipeline/intents only; Q&A keeps the settings above. */
    @Valid
    private PipelineIntent pipelineIntent = new PipelineIntent();

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

    public String getBackendBaseUrl() {
        return backendBaseUrl;
    }

    public void setBackendBaseUrl(String backendBaseUrl) {
        this.backendBaseUrl = backendBaseUrl;
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

    public PipelineIntent getPipelineIntent() {
        return pipelineIntent;
    }

    public void setPipelineIntent(PipelineIntent pipelineIntent) {
        this.pipelineIntent = pipelineIntent;
    }

    /**
     * Runtime defaults for pipeline intent selection (Issue #60, R1 reference settings): JSON mode,
     * llama3.2 via the shared chatbot.model, num_predict 512, temperature 0.4, num_ctx 4096 and a
     * 75 s per-call timeout. The two-attempt 150 s budget belongs to the frontend orchestration.
     */
    public static class PipelineIntent {

        @Positive(message = "chatbot.pipeline-intent.max-tokens must be positive.")
        private int maxTokens = 512;

        @DecimalMin(value = "0.0", inclusive = true, message = "chatbot.pipeline-intent.temperature must be >= 0.0.")
        @DecimalMax(value = "2.0", inclusive = true, message = "chatbot.pipeline-intent.temperature must be <= 2.0.")
        private double temperature = 0.4;

        @Positive(message = "chatbot.pipeline-intent.timeout-ms must be positive.")
        private int timeoutMs = 75000;

        @Positive(message = "chatbot.pipeline-intent.context-tokens must be positive.")
        private int contextTokens = 4096;

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

        public int getTimeoutMs() {
            return timeoutMs;
        }

        public void setTimeoutMs(int timeoutMs) {
            this.timeoutMs = timeoutMs;
        }

        public int getContextTokens() {
            return contextTokens;
        }

        public void setContextTokens(int contextTokens) {
            this.contextTokens = contextTokens;
        }
    }
}
