package edu.baylor.ecs.cloudhubs.chatbot.retrieval.model;

public enum QuestionIntent {
    ARCHITECTURE_TOPOLOGY,
    SERVICE_LOOKUP,
    ENDPOINT_LOOKUP,
    DEPENDENCY,
    UNSUPPORTED_SPECULATIVE;

    public boolean requiresEvidence() {
        return this == ARCHITECTURE_TOPOLOGY || this == DEPENDENCY || this == ENDPOINT_LOOKUP;
    }
}
