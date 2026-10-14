package edu.baylor.ecs.cloudhubs.chatbot;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.ConfigurationPropertiesAutoConfiguration;
import org.springframework.boot.autoconfigure.validation.ValidationAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.NestedExceptionUtils;

import static org.assertj.core.api.Assertions.assertThat;

class ChatbotConfigBindingTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(
            ConfigurationPropertiesAutoConfiguration.class,
            ValidationAutoConfiguration.class
        ))
        .withUserConfiguration(TestConfig.class);

    @Test
    void bindsValidChatbotConfig() {
        contextRunner
            .withPropertyValues(
                "chatbot.provider=OLLAMA",
                "chatbot.model=llama3.2",
                "chatbot.base-url=http://ollama:11434",
                "chatbot.timeout-ms=30000",
                "chatbot.max-tokens=1024",
                "chatbot.temperature=0.2",
                "chatbot.context-budget-max-evidence-items=20",
                "chatbot.context-budget-max-evidence-chars=12000",
                "chatbot.strict-evidence-only=true"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                ChatbotConfig chatbotConfig = context.getBean(ChatbotConfig.class);
                assertThat(chatbotConfig.getProvider()).isEqualTo(ChatbotConfig.Provider.OLLAMA);
                assertThat(chatbotConfig.getModel()).isEqualTo("llama3.2");
                assertThat(chatbotConfig.getBaseUrl()).isEqualTo("http://ollama:11434");
                assertThat(chatbotConfig.getTimeoutMs()).isEqualTo(30000);
                assertThat(chatbotConfig.getMaxTokens()).isEqualTo(1024);
                assertThat(chatbotConfig.getTemperature()).isEqualTo(0.2);
                assertThat(chatbotConfig.isStrictEvidenceOnly()).isTrue();
            });
    }

    @Test
    void bindsStrictEvidenceOnlyFalseWhenConfigured() {
        contextRunner
            .withPropertyValues(
                "chatbot.provider=OLLAMA",
                "chatbot.model=llama3.2",
                "chatbot.base-url=http://ollama:11434",
                "chatbot.timeout-ms=30000",
                "chatbot.max-tokens=1024",
                "chatbot.temperature=0.2",
                "chatbot.context-budget-max-evidence-items=20",
                "chatbot.context-budget-max-evidence-chars=12000",
                "chatbot.strict-evidence-only=false"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                ChatbotConfig chatbotConfig = context.getBean(ChatbotConfig.class);
                assertThat(chatbotConfig.isStrictEvidenceOnly()).isFalse();
            });
    }

    @Test
    void defaultsPipelineIntentSettingsWithoutChangingQaSettings() {
        contextRunner
            .withPropertyValues(
                "chatbot.provider=OLLAMA",
                "chatbot.model=llama3.2",
                "chatbot.base-url=http://ollama:11434",
                "chatbot.timeout-ms=240000",
                "chatbot.max-tokens=1024",
                "chatbot.temperature=0.2",
                "chatbot.context-budget-max-evidence-items=20",
                "chatbot.context-budget-max-evidence-chars=12000"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                ChatbotConfig chatbotConfig = context.getBean(ChatbotConfig.class);
                assertThat(chatbotConfig.getPipelineIntent().getMaxTokens()).isEqualTo(512);
                assertThat(chatbotConfig.getPipelineIntent().getTemperature()).isEqualTo(0.4);
                assertThat(chatbotConfig.getPipelineIntent().getTimeoutMs()).isEqualTo(75000);
                assertThat(chatbotConfig.getPipelineIntent().getContextTokens()).isEqualTo(4096);
                assertThat(chatbotConfig.getMaxTokens()).isEqualTo(1024);
                assertThat(chatbotConfig.getTemperature()).isEqualTo(0.2);
                assertThat(chatbotConfig.getTimeoutMs()).isEqualTo(240000);
            });
    }

    @Test
    void bindsPipelineIntentOverrides() {
        contextRunner
            .withPropertyValues(
                "chatbot.provider=OLLAMA",
                "chatbot.model=llama3.2",
                "chatbot.base-url=http://ollama:11434",
                "chatbot.timeout-ms=30000",
                "chatbot.max-tokens=1024",
                "chatbot.temperature=0.2",
                "chatbot.context-budget-max-evidence-items=20",
                "chatbot.context-budget-max-evidence-chars=12000",
                "chatbot.pipeline-intent.max-tokens=640",
                "chatbot.pipeline-intent.temperature=0.3",
                "chatbot.pipeline-intent.timeout-ms=60000",
                "chatbot.pipeline-intent.context-tokens=8192"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                ChatbotConfig.PipelineIntent intent = context.getBean(ChatbotConfig.class).getPipelineIntent();
                assertThat(intent.getMaxTokens()).isEqualTo(640);
                assertThat(intent.getTemperature()).isEqualTo(0.3);
                assertThat(intent.getTimeoutMs()).isEqualTo(60000);
                assertThat(intent.getContextTokens()).isEqualTo(8192);
            });
    }

    @Test
    void failsWhenPipelineIntentValuesInvalid() {
        contextRunner
            .withPropertyValues(
                "chatbot.provider=OLLAMA",
                "chatbot.model=llama3.2",
                "chatbot.base-url=http://ollama:11434",
                "chatbot.timeout-ms=30000",
                "chatbot.max-tokens=1024",
                "chatbot.temperature=0.2",
                "chatbot.context-budget-max-evidence-items=20",
                "chatbot.context-budget-max-evidence-chars=12000",
                "chatbot.pipeline-intent.max-tokens=0",
                "chatbot.pipeline-intent.temperature=3.0",
                "chatbot.pipeline-intent.timeout-ms=-1",
                "chatbot.pipeline-intent.context-tokens=0"
            )
            .run(context -> {
                assertThat(context).hasFailed();
                String rootCauseMessage = NestedExceptionUtils.getMostSpecificCause(context.getStartupFailure()).getMessage();
                assertThat(rootCauseMessage)
                    .contains("chatbot.pipeline-intent.max-tokens must be positive")
                    .contains("chatbot.pipeline-intent.temperature must be <= 2.0")
                    .contains("chatbot.pipeline-intent.timeout-ms must be positive")
                    .contains("chatbot.pipeline-intent.context-tokens must be positive");
            });
    }

    @Test
    void failsWhenProviderMissing() {
        contextRunner
            .withPropertyValues(
                "chatbot.model=llama3.2",
                "chatbot.base-url=http://ollama:11434",
                "chatbot.timeout-ms=30000",
                "chatbot.max-tokens=1024",
                "chatbot.temperature=0.2",
                "chatbot.context-budget-max-evidence-items=20",
                "chatbot.context-budget-max-evidence-chars=12000"
            )
            .run(context -> {
                assertThat(context).hasFailed();
                String rootCauseMessage = NestedExceptionUtils.getMostSpecificCause(context.getStartupFailure()).getMessage();
                assertThat(rootCauseMessage).contains("chatbot.provider is required");
            });
    }

    @Test
    void failsWhenNumericValuesInvalid() {
        contextRunner
            .withPropertyValues(
                "chatbot.provider=OPENAI_COMPATIBLE",
                "chatbot.model=gpt-5-mini",
                "chatbot.base-url=http://localhost:8000/v1",
                "chatbot.timeout-ms=0",
                "chatbot.max-tokens=-1",
                "chatbot.context-budget-max-evidence-items=20",
                "chatbot.context-budget-max-evidence-chars=12000",
                "chatbot.temperature=2.5"
            )
            .run(context -> {
                assertThat(context).hasFailed();
                String rootCauseMessage = NestedExceptionUtils.getMostSpecificCause(context.getStartupFailure()).getMessage();
                assertThat(rootCauseMessage)
                    .contains("chatbot.timeout-ms must be positive")
                    .contains("chatbot.max-tokens must be positive")
                    .contains("chatbot.temperature must be <= 2.0");
            });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ChatbotConfig.class)
    static class TestConfig {
    }
}
