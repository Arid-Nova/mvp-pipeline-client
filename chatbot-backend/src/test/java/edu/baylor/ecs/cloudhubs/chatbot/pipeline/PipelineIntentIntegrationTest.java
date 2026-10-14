package edu.baylor.ecs.cloudhubs.chatbot.pipeline;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import edu.baylor.ecs.cloudhubs.chatbot.ChatbotConfig;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentRequest;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.LocalLlmClient;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.ChatbotPrompt;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmFailureCode;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.CATALOG_VERSION;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.GOAL;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.MAPPER;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.SUGGESTION_SET_ID;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.request;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.validPlanJson;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP → controller → service → prompt builder → stub local model → extractor → HTTP, with the real
 * classes and only the model stubbed. No graph composition or validation exists on this path.
 */
class PipelineIntentIntegrationTest {

    private static final class StubLocalLlmClient implements LocalLlmClient {
        private final Supplier<LocalLlmResult> answer;
        private final List<ChatbotPrompt> prompts = new ArrayList<>();
        private final List<ChatbotConfig> configs = new ArrayList<>();

        StubLocalLlmClient(Supplier<LocalLlmResult> answer) {
            this.answer = answer;
        }

        @Override
        public LocalLlmResult generate(ChatbotPrompt prompt, ChatbotConfig config) {
            prompts.add(prompt);
            configs.add(config);
            return answer.get();
        }
    }

    private final List<Logger> loggers = List.of(
        (Logger) LoggerFactory.getLogger(PipelineIntentService.class),
        (Logger) LoggerFactory.getLogger(PipelineIntentController.class)
    );
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    @BeforeEach
    void captureLogs() {
        logs.start();
        loggers.forEach(logger -> logger.addAppender(logs));
    }

    @AfterEach
    void releaseLogs() {
        loggers.forEach(logger -> logger.detachAppender(logs));
    }

    private static ChatbotConfig qaConfig() {
        ChatbotConfig config = new ChatbotConfig();
        config.setProvider(ChatbotConfig.Provider.OLLAMA);
        config.setModel("llama3.2");
        config.setBaseUrl("http://ollama:11434");
        config.setTimeoutMs(240000);
        config.setMaxTokens(1024);
        config.setTemperature(0.2);
        return config;
    }

    private static MockMvc mockMvc(LocalLlmClient client) {
        PipelineIntentService service = new PipelineIntentService(
            qaConfig(), client, new PipelineIntentPromptBuilder(), new PipelineIntentJsonExtractor());
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        return MockMvcBuilders.standaloneSetup(new PipelineIntentController(service)).setValidator(validator).build();
    }

    private static LocalLlmResult modelSays(String text) {
        return new LocalLlmResult(text, "llama3.2", "OLLAMA", 200, "stop");
    }

    private static String body(PipelineIntentRequest request) throws Exception {
        return MAPPER.writeValueAsString(request);
    }

    private String allLogText() {
        return String.join("\n", logs.list.stream().map(event -> event.getFormattedMessage()).toList());
    }

    @Test
    void okFromFencedModelOutputUsingTheIntentRuntimeSettings() throws Exception {
        StubLocalLlmClient client = new StubLocalLlmClient(() -> modelSays("```json\n" + validPlanJson() + "\n```"));

        mockMvc(client).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(request())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.outcome").value("OK"))
            .andExpect(jsonPath("$.options.length()").value(3))
            .andExpect(jsonPath("$.options[0].tier").value("focused"))
            .andExpect(jsonPath("$.options[2].analysisCardTypes[2]").value("UNKNOWN_X")) // the frontend decides
            .andExpect(jsonPath("$.parseErrors.length()").value(0))
            .andExpect(jsonPath("$.suggestionSetId").value(SUGGESTION_SET_ID))
            .andExpect(jsonPath("$.catalogVersion").value(CATALOG_VERSION))
            .andExpect(jsonPath("$.model").value("llama3.2"))
            .andExpect(jsonPath("$.provider").value("OLLAMA"))
            .andExpect(jsonPath("$.requestId").isNotEmpty());

        ChatbotPrompt prompt = client.prompts.get(0);
        assertThat(prompt.isJsonOutput()).isTrue();
        assertThat(prompt.getContextTokens()).isEqualTo(4096);
        assertThat(prompt.getSystemInstruction()).contains("FOO_ANALYSIS").doesNotContain("BAR_INPUT");
        assertThat(prompt.getUserQuestion()).contains(GOAL);

        ChatbotConfig used = client.configs.get(0);
        assertThat(used.getMaxTokens()).isEqualTo(512);
        assertThat(used.getTemperature()).isEqualTo(0.4);
        assertThat(used.getTimeoutMs()).isEqualTo(75000);
        assertThat(used.getModel()).isEqualTo("llama3.2");
        assertThat(used.getProvider()).isEqualTo(ChatbotConfig.Provider.OLLAMA);
    }

    @Test
    void invalidModelOutputIsA200WithParseErrors() throws Exception {
        StubLocalLlmClient client = new StubLocalLlmClient(() -> modelSays("I think you should visualize things."));

        mockMvc(client).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(request())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.outcome").value("INVALID_MODEL_OUTPUT"))
            .andExpect(jsonPath("$.options.length()").value(0))
            .andExpect(jsonPath("$.parseErrors[0]").value("No JSON object found in model output."));
    }

    @Test
    void unsupportedGoalIsA200WithTheReason() throws Exception {
        StubLocalLlmClient client = new StubLocalLlmClient(
            () -> modelSays("{\"version\":1,\"options\":[],\"unsupportedReason\":\"AridNova can't book flights.\"}"));

        mockMvc(client).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(request())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.outcome").value("UNSUPPORTED_GOAL"))
            .andExpect(jsonPath("$.unsupportedReason").value("AridNova can't book flights."));
    }

    @Test
    void unavailableRuntimeIsA503() throws Exception {
        for (LocalLlmFailureCode code : List.of(LocalLlmFailureCode.MODEL_UNAVAILABLE, LocalLlmFailureCode.TIMEOUT)) {
            StubLocalLlmClient client = new StubLocalLlmClient(() -> {
                throw new LocalLlmException(code, "Local model runtime is unavailable.");
            });

            mockMvc(client).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(request())))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.outcome").value("MODEL_UNAVAILABLE"))
                .andExpect(jsonPath("$.suggestionSetId").value(SUGGESTION_SET_ID))
                .andExpect(jsonPath("$.catalogVersion").value(CATALOG_VERSION))
                .andExpect(jsonPath("$.model").value("llama3.2"))
                .andExpect(jsonPath("$.provider").value("OLLAMA"));
        }
    }

    @Test
    void invalidRequestIsA400AndNeverReachesTheModel() throws Exception {
        StubLocalLlmClient client = new StubLocalLlmClient(() -> modelSays(validPlanJson()));
        PipelineIntentRequest invalid = request();
        invalid.setAttempt(0);

        mockMvc(client).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(invalid)))
            .andExpect(status().isBadRequest());
        assertThat(client.prompts).isEmpty();
    }

    @Test
    void retryGuidanceReachesTheModelAtCapabilityLevel() throws Exception {
        StubLocalLlmClient client = new StubLocalLlmClient(() -> modelSays(validPlanJson()));
        PipelineIntentRequest retry = PipelineIntentTestData.retryRequest(
            List.of(List.of("FOO_ANALYSIS", "QUX_COMPARE")),
            List.of("Problem: DUPLICATE_CAPABILITY_SET", "ILLEGAL_CONNECTION: BAR_INPUT cannot connect to QUX_COMPARE.")
        );

        mockMvc(client).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(retry)))
            .andExpect(status().isOk());

        assertThat(client.prompts.get(0).getUserQuestion())
            .contains("Problem: DUPLICATE_CAPABILITY_SET", "[FOO_ANALYSIS, QUX_COMPARE]")
            .doesNotContain("ILLEGAL_CONNECTION");
    }

    @Test
    void logsOperationalMetadataOnlyNeverGoalPromptOrModelText() throws Exception {
        StubLocalLlmClient ok = new StubLocalLlmClient(() -> modelSays(validPlanJson()));
        StubLocalLlmClient down = new StubLocalLlmClient(() -> {
            throw new LocalLlmException(LocalLlmFailureCode.MODEL_UNAVAILABLE, "down");
        });

        mockMvc(ok).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(request())));
        mockMvc(down).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(request())));

        String logText = allLogText();
        assertThat(logText)
            .contains("chatbot.pipeline_intent.completed", "chatbot.pipeline_intent.failed")
            .contains("suggestionSetId=" + SUGGESTION_SET_ID, "attempt=1", "outcome=OK", "options=3", "outcome=MODEL_UNAVAILABLE");
        assertThat(logText).doesNotContain(GOAL, "zebra", "walrus", "Foo only", "FOO_ANALYSIS", "ANALYSIS CAPABILITIES");
    }
}
