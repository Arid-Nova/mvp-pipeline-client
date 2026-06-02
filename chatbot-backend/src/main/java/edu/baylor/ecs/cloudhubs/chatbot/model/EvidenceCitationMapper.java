package edu.baylor.ecs.cloudhubs.chatbot.model;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;

public final class EvidenceCitationMapper {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private EvidenceCitationMapper() {
    }

    public static CitationItem toCitation(EvidenceItem evidence) {
        if (evidence == null) {
            return new CitationItem(
                EvidenceArtifactType.UNKNOWN.name(),
                "unknown-artifact",
                "unknown-artifact",
                "n/a",
                "n/a",
                "No evidence payload available."
            );
        }

        String artifactType = evidence.getArtifactTypeValue();
        String artifactId = valueOrDefault(evidence.getArtifactId(), "unknown-artifact");
        String artifactName = firstNonBlank(evidence.getEntityName(), evidence.getServiceName(), evidence.getEndpointPath(), artifactId);
        String locationHint = firstNonBlank(evidence.getLocationHint(), evidence.getSourcePath(), evidence.getSourceEndpoint(), "n/a");
        String version = firstNonBlank(evidence.getArtifactVersion(), evidence.getCommitId(), "n/a");
        String summary = evidence.getContentText();
        if (summary == null || summary.isBlank()) {
            summary = structuredPayloadSummary(evidence);
            if (summary == null || summary.isBlank()) {
                summary = "No evidence summary available.";
            }
        }

        return new CitationItem(artifactType, artifactId, artifactName, locationHint, version, summary);
    }

    public static List<CitationItem> toCitations(List<EvidenceItem> evidenceItems) {
        if (evidenceItems == null || evidenceItems.isEmpty()) {
            return List.of();
        }
        return evidenceItems.stream().map(EvidenceCitationMapper::toCitation).toList();
    }

    private static String structuredPayloadSummary(EvidenceItem evidence) {
        if (evidence.getStructuredPayload() == null) {
            return null;
        }
        try {
            return OBJECT_MAPPER.writeValueAsString(evidence.getStructuredPayload());
        } catch (JsonProcessingException ignored) {
            return evidence.getStructuredPayload().toString();
        }
    }

    private static String valueOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
