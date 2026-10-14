package edu.baylor.ecs.cloudhubs.chatbot.pipeline;

import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentOutcome;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentRequest;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentResponse;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.model.LocalLlmFailureCode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.CATALOG_VERSION;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.MAPPER;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.SUGGESTION_SET_ID;
import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.request;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PipelineIntentControllerTest {

    /** A service whose model behaviour is scripted per test; no model, prompt or extractor involved. */
    private static final class StubService extends PipelineIntentService {
        private final Function<PipelineIntentRequest, PipelineIntentResponse> behaviour;
        private final AtomicReference<PipelineIntentRequest> received = new AtomicReference<>();

        StubService(Function<PipelineIntentRequest, PipelineIntentResponse> behaviour) {
            super(null, null, null, null);
            this.behaviour = behaviour;
        }

        @Override
        public PipelineIntentResponse selectIntents(PipelineIntentRequest request, String requestId) {
            received.set(request);
            PipelineIntentResponse response = behaviour.apply(request);
            response.setRequestId(requestId);
            response.setSuggestionSetId(request.getSuggestionSetId());
            response.setCatalogVersion(request.getCatalogVersion());
            return response;
        }

        @Override
        public PipelineIntentResponse unavailableResponse(PipelineIntentRequest request, String requestId, long latencyMs) {
            PipelineIntentResponse response = new PipelineIntentResponse();
            response.setOutcome(PipelineIntentOutcome.MODEL_UNAVAILABLE);
            response.setRequestId(requestId);
            response.setSuggestionSetId(request.getSuggestionSetId());
            response.setCatalogVersion(request.getCatalogVersion());
            response.setProcessingTimeMs(latencyMs);
            return response;
        }
    }

    private static MockMvc mockMvc(PipelineIntentService service) {
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        return MockMvcBuilders.standaloneSetup(new PipelineIntentController(service)).setValidator(validator).build();
    }

    private static PipelineIntentResponse response(PipelineIntentOutcome outcome, int options, List<String> errors, String reason) {
        PipelineIntentResponse response = new PipelineIntentResponse();
        response.setOutcome(outcome);
        for (int i = 0; i < options; i++) {
            response.getOptions().add(MAPPER.createObjectNode().put("tier", "focused").set("analysisCardTypes", MAPPER.createArrayNode().add("FOO_ANALYSIS")));
        }
        response.setParseErrors(errors);
        response.setUnsupportedReason(reason);
        response.setModel("llama3.2");
        response.setProvider("OLLAMA");
        return response;
    }

    private static String body(PipelineIntentRequest request) throws Exception {
        return MAPPER.writeValueAsString(request);
    }

    @Test
    void returnsOkWithTheModelsOptionsAndEchoedIds() throws Exception {
        StubService service = new StubService(r -> response(PipelineIntentOutcome.OK, 3, List.of(), null));

        mockMvc(service).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(request())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.outcome").value("OK"))
            .andExpect(jsonPath("$.options.length()").value(3))
            .andExpect(jsonPath("$.suggestionSetId").value(SUGGESTION_SET_ID))
            .andExpect(jsonPath("$.catalogVersion").value(CATALOG_VERSION))
            .andExpect(jsonPath("$.requestId").isNotEmpty())
            .andExpect(jsonPath("$.model").value("llama3.2"))
            .andExpect(jsonPath("$.provider").value("OLLAMA"));
    }

    @Test
    void returns200ForInvalidModelOutput() throws Exception {
        StubService service = new StubService(r -> response(PipelineIntentOutcome.INVALID_MODEL_OUTPUT, 0,
            List.of("No JSON object found in model output."), null));

        mockMvc(service).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(request())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.outcome").value("INVALID_MODEL_OUTPUT"))
            .andExpect(jsonPath("$.options.length()").value(0))
            .andExpect(jsonPath("$.parseErrors[0]").value("No JSON object found in model output."));
    }

    @Test
    void returns200ForAnUnsupportedGoal() throws Exception {
        StubService service = new StubService(r -> response(PipelineIntentOutcome.UNSUPPORTED_GOAL, 0, List.of(), "Not an analysis goal."));

        mockMvc(service).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(request())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.outcome").value("UNSUPPORTED_GOAL"))
            .andExpect(jsonPath("$.unsupportedReason").value("Not an analysis goal."));
    }

    @Test
    void returns503WhenTheModelIsUnavailableOrTimesOut() throws Exception {
        for (LocalLlmFailureCode code : List.of(LocalLlmFailureCode.MODEL_UNAVAILABLE, LocalLlmFailureCode.TIMEOUT)) {
            StubService service = new StubService(r -> {
                throw new LocalLlmException(code, "runtime down");
            });

            mockMvc(service).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(request())))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.outcome").value("MODEL_UNAVAILABLE"))
                .andExpect(jsonPath("$.suggestionSetId").value(SUGGESTION_SET_ID))
                .andExpect(jsonPath("$.catalogVersion").value(CATALOG_VERSION))
                .andExpect(jsonPath("$.options.length()").value(0));
        }
    }

    @Test
    void returns400ForInvalidRequestsWithoutCallingTheService() throws Exception {
        StubService service = new StubService(r -> response(PipelineIntentOutcome.OK, 3, List.of(), null));
        MockMvc mvc = mockMvc(service);

        PipelineIntentRequest blankGoal = request();
        blankGoal.setGoal(" ");
        PipelineIntentRequest badUuid = request();
        badUuid.setSuggestionSetId("conv-2");
        PipelineIntentRequest badAttempt = request();
        badAttempt.setAttempt(3);
        PipelineIntentRequest noCatalog = request();
        noCatalog.setCatalog(null);

        for (PipelineIntentRequest invalid : List.of(blankGoal, badUuid, badAttempt, noCatalog)) {
            mvc.perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(invalid)))
                .andExpect(status().isBadRequest());
        }
        mvc.perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content("not json"))
            .andExpect(status().isBadRequest());
        assertThat(service.received.get()).isNull();
    }

    @Test
    void passesTheAttemptAndRetryInputsToTheService() throws Exception {
        StubService service = new StubService(r -> response(PipelineIntentOutcome.OK, 3, List.of(), null));
        PipelineIntentRequest retry = PipelineIntentTestData.retryRequest(List.of(List.of("FOO_ANALYSIS")), List.of("Problem: DUPLICATE_TIER"));

        mockMvc(service).perform(post("/chatbot/pipeline/intents").contentType(MediaType.APPLICATION_JSON).content(body(retry)))
            .andExpect(status().isOk());

        assertThat(service.received.get().getAttempt()).isEqualTo(2);
        assertThat(service.received.get().getExcludeCapabilitySets()).containsExactly(List.of("FOO_ANALYSIS"));
        assertThat(service.received.get().getRejectionFeedback()).containsExactly("Problem: DUPLICATE_TIER");
    }
}
