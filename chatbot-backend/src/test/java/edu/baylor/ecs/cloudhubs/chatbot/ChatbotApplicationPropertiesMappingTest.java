package edu.baylor.ecs.cloudhubs.chatbot;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.ConfigurationPropertiesAutoConfiguration;
import org.springframework.boot.autoconfigure.validation.ValidationAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class ChatbotApplicationPropertiesMappingTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withInitializer(new ConfigDataApplicationContextInitializer())
        .withConfiguration(AutoConfigurations.of(
            ConfigurationPropertiesAutoConfiguration.class,
            ValidationAutoConfiguration.class
        ))
        .withUserConfiguration(TestConfig.class);

    @Test
    void applicationPropertiesMapChatbotEnvironmentVariables() {
        contextRunner
            .withSystemProperties(
                "CHATBOT_PROVIDER=OPENAI_COMPATIBLE",
                "CHATBOT_MODEL=gpt-5-mini",
                "CHATBOT_BASE_URL=http://localhost:8000/v1",
                "CHATBOT_TIMEOUT_MS=45000",
                "CHATBOT_MAX_TOKENS=2048",
                "CHATBOT_TEMPERATURE=0.7",
                "CHATBOT_CONTEXT_BUDGET_MAX_EVIDENCE_ITEMS=12",
                "CHATBOT_CONTEXT_BUDGET_MAX_EVIDENCE_CHARS=6000",
                "CHATBOT_STRICT_EVIDENCE_ONLY=false"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                ChatbotConfig config = context.getBean(ChatbotConfig.class);
                assertThat(config.getProvider()).isEqualTo(ChatbotConfig.Provider.OPENAI_COMPATIBLE);
                assertThat(config.getModel()).isEqualTo("gpt-5-mini");
                assertThat(config.getBaseUrl()).isEqualTo("http://localhost:8000/v1");
                assertThat(config.getTimeoutMs()).isEqualTo(45000);
                assertThat(config.getMaxTokens()).isEqualTo(2048);
                assertThat(config.getTemperature()).isEqualTo(0.7);
                assertThat(config.getContextBudgetMaxEvidenceItems()).isEqualTo(12);
                assertThat(config.getContextBudgetMaxEvidenceChars()).isEqualTo(6000);
                assertThat(config.isStrictEvidenceOnly()).isFalse();
            });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ChatbotConfig.class)
    static class TestConfig {
    }
}
