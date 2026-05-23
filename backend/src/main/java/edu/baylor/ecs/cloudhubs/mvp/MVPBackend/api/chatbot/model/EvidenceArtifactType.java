package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

public enum EvidenceArtifactType {
    IR,
    GRAPH,
    ARCHITECTURE,
    DEPENDENCY,
    SERVICE,
    ENDPOINT,
    VERIFICATION,
    RISK,
    CHANGE,
    CONTEXT_METADATA,
    UNKNOWN;

    @JsonCreator
    public static EvidenceArtifactType fromValue(String value) {
        if (value == null || value.isBlank()) {
            return UNKNOWN;
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        for (EvidenceArtifactType type : values()) {
            if (type.name().equals(normalized)) {
                return type;
            }
        }
        return UNKNOWN;
    }

    @JsonValue
    public String toValue() {
        return name();
    }
}
