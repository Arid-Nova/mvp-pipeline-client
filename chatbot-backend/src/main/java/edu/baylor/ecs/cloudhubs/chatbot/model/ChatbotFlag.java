package edu.baylor.ecs.cloudhubs.chatbot.model;

public enum ChatbotFlag {
    PARTIAL,
    INSUFFICIENT_EVIDENCE,
    STALE_CONTEXT,
    TRUNCATED_CONTEXT,
    CITATION_VALIDATION_FAILED,
    MODEL_UNAVAILABLE
}
