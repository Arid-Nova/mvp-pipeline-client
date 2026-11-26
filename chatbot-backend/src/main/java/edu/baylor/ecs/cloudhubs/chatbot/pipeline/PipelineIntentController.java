package edu.baylor.ecs.cloudhubs.chatbot.pipeline;

import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentOutcome;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentRequest;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentResponse;
import jakarta.validation.Valid;
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
 * HTTP mapping: invalid request → 400 (bean validation); MODEL_UNAVAILABLE → 503; everything the
 * model says, including unusable output, → 200 with an explicit outcome.
 */
@RestController
@RequestMapping("/chatbot/pipeline")
public class PipelineIntentController {
    private final PipelineIntentService pipelineIntentService;

    public PipelineIntentController(PipelineIntentService pipelineIntentService) {
        this.pipelineIntentService = pipelineIntentService;
    }

    @PostMapping("/intents")
    public ResponseEntity<PipelineIntentResponse> intents(@Valid @RequestBody PipelineIntentRequest request) {
        String requestId = pipelineIntentService.generateRequestId();
        PipelineIntentResponse response = pipelineIntentService.selectIntents(request, requestId);
        if (response.getOutcome() == PipelineIntentOutcome.MODEL_UNAVAILABLE) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(response);
        }
        return ResponseEntity.ok(response);
    }
}
