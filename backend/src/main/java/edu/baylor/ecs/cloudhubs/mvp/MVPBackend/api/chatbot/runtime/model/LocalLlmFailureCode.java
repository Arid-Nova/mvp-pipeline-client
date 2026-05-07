package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model;

public enum LocalLlmFailureCode {
    model_unavailable,
    timeout,
    invalid_response,
    provider_error
}
