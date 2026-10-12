package edu.baylor.ecs.cloudhubs.chatbot.pipeline.model;

/**
 * Outcome of a pipeline intent-selection request (Issue #60, P60-M1-015).
 * Serialized by name; the frontend type {@code PipelineIntentOutcome} uses the same values.
 */
public enum PipelineIntentOutcome {
    OK,
    INVALID_MODEL_OUTPUT,
    UNSUPPORTED_GOAL,
    MODEL_UNAVAILABLE
}
