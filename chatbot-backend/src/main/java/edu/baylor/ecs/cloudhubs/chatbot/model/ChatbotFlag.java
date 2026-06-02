package edu.baylor.ecs.cloudhubs.chatbot.model;

public enum ChatbotFlag {
    partial,
    insufficient_evidence,
    stale_context,
    truncated_context,
    citation_validation_failed,
    model_unavailable
}
