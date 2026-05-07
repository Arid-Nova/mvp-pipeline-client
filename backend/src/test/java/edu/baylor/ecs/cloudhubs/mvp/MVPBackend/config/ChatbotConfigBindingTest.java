package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config;

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
                "chatbot.temperature=0.2"
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
                "chatbot.temperature=0.2"
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
                "chatbot.model=gpt-4o-mini",
                "chatbot.base-url=http://localhost:8000/v1",
                "chatbot.timeout-ms=0",
                "chatbot.max-tokens=-1",
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
