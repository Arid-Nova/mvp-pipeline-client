package edu.baylor.ecs.cloudhubs.chatbot.pipeline;

import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentRequest;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentResponse;
import edu.baylor.ecs.cloudhubs.chatbot.runtime.LocalLlmException;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /chatbot/pipeline/intents (Issue #60, P60-M1-005): asks the local model which analysis
 * capabilities fit a goal. It returns untrusted intent options only, never a pipeline graph.
 *
 * HTTP mapping: invalid request → 400 (bean validation); runtime unavailable or timed out
 * ({@link LocalLlmException}) → 503 with outcome MODEL_UNAVAILABLE; everything the model says,
 * including unusable output, → 200 with an explicit outcome.
 */
@RestController
@RequestMapping("/chatbot/pipeline")
public class PipelineIntentController {
    private static final Logger log = LoggerFactory.getLogger(PipelineIntentController.class);

    private final PipelineIntentService pipelineIntentService;

    public PipelineIntentController(PipelineIntentService pipelineIntentService) {
        this.pipelineIntentService = pipelineIntentService;
    }

    @PostMapping("/intents")
    public ResponseEntity<PipelineIntentResponse> intents(@Valid @RequestBody PipelineIntentRequest request) {
        String requestId = pipelineIntentService.generateRequestId();
        long start = System.currentTimeMillis();
        try {
            return ResponseEntity.ok(pipelineIntentService.selectIntents(request, requestId));
        } catch (LocalLlmException ex) {
            long latencyMs = System.currentTimeMillis() - start;
            PipelineIntentResponse response = pipelineIntentService.unavailableResponse(request, requestId, latencyMs);
            log.warn(
                "chatbot.pipeline_intent.failed requestId={} suggestionSetId={} attempt={} outcome={} failureCode={} "
                    + "latencyMs={} model={} provider={}",
                requestId,
                request.getSuggestionSetId(),
                request.getAttempt(),
                response.getOutcome(),
                ex.getCode(),
                latencyMs,
                response.getModel(),
                response.getProvider()
            );
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(response);
        }
    }
}
