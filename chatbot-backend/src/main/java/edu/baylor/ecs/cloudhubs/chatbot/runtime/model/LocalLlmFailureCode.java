package edu.baylor.ecs.cloudhubs.chatbot.runtime.model;

public enum LocalLlmFailureCode {
    model_unavailable,
    timeout,
    invalid_response,
    provider_error
}
