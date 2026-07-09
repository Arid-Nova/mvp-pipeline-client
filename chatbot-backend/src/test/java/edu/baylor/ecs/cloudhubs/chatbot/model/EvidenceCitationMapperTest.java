package edu.baylor.ecs.cloudhubs.chatbot.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EvidenceCitationMapperTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void mapsEvidenceToCitation() throws Exception {
        EvidenceItem item = new EvidenceItem();
        item.setArtifactType(EvidenceArtifactType.ENDPOINT);
        item.setArtifactId("ep-44");
        item.setEntityName("POST /refund");
        item.setLocationHint("RefundController:52");
        item.setCommitId("a1b2c3");
        item.setContentText("Endpoint bypasses role validation.");

        CitationItem citation = EvidenceCitationMapper.toCitation(item);

        assertThat(citation.getArtifactType()).isEqualTo("ENDPOINT");
        assertThat(citation.getArtifactId()).isEqualTo("ep-44");
        assertThat(citation.getArtifactName()).isEqualTo("POST /refund");
        assertThat(citation.getVersion()).isEqualTo("a1b2c3");
        assertThat(citation.getSummary()).contains("bypasses role validation");
    }

    @Test
    void mapsStructuredPayloadWhenContentTextMissing() throws Exception {
        EvidenceItem item = new EvidenceItem();
        item.setArtifactType(EvidenceArtifactType.IR);
        item.setArtifactId("ir-123");
        item.setStructuredPayload(objectMapper.readTree("{\"service\":\"order-service\"}"));

        CitationItem citation = EvidenceCitationMapper.toCitation(item);

        assertThat(citation.getSummary()).contains("order-service");
    }

    @Test
    void handlesNullEvidenceSafely() {
        CitationItem citation = EvidenceCitationMapper.toCitation(null);

        assertThat(citation.getArtifactType()).isEqualTo("UNKNOWN");
        assertThat(citation.getArtifactId()).isEqualTo("unknown-artifact");
        assertThat(citation.getSummary()).contains("No evidence payload available");
    }
}
