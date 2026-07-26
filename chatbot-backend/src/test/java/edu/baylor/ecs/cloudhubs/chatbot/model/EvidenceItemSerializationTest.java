package edu.baylor.ecs.cloudhubs.chatbot.model;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class EvidenceItemSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    void serializesEvidenceItemWithNormalizedFields() throws Exception {
        EvidenceItem item = new EvidenceItem();
        item.setArtifactType(EvidenceArtifactType.DEPENDENCY);
        item.setArtifactId("dep-42");
        item.setArtifactVersion("ir-v3");
        item.setCommitId("commit-abc");
        item.setSourcePath("src/main/java/.../OrderService.java");
        item.setSourceEndpoint("/graph/instance");
        item.setLocationHint("OrderService:120");
        item.setEntityType("SERVICE");
        item.setEntityName("order-service");
        item.setServiceName("order-service");
        item.setEndpointPath("/orders");
        item.setHttpMethod("POST");
        item.setConfidenceSource("ir-heuristic");
        item.setSupportStrength(0.88);
        item.setContentText("Order service depends on inventory service.");
        item.setStructuredPayload(objectMapper.readTree("{\"dependency\":\"inventory-service\"}"));
        item.setTimestamp(Instant.parse("2026-05-22T10:15:30Z"));

        String json = objectMapper.writeValueAsString(item);
        EvidenceItem restored = objectMapper.readValue(json, EvidenceItem.class);

        assertThat(restored.getArtifactType()).isEqualTo(EvidenceArtifactType.DEPENDENCY);
        assertThat(restored.getArtifactId()).isEqualTo("dep-42");
        assertThat(restored.getContentText()).contains("depends on inventory");
        assertThat(restored.getStructuredPayload()).isNotNull();
        assertThat(restored.getTimestamp()).isEqualTo(Instant.parse("2026-05-22T10:15:30Z"));
    }

    @Test
    void serializesWhenOptionalMetadataIsMissing() throws Exception {
        EvidenceItem item = new EvidenceItem();
        item.setArtifactType(EvidenceArtifactType.GRAPH);
        item.setArtifactId("graph-1");

        String json = objectMapper.writeValueAsString(item);
        EvidenceItem restored = objectMapper.readValue(json, EvidenceItem.class);

        assertThat(restored.getArtifactType()).isEqualTo(EvidenceArtifactType.GRAPH);
        assertThat(restored.getArtifactId()).isEqualTo("graph-1");
        assertThat(restored.getLocationHint()).isNull();
        assertThat(restored.getStructuredPayload() == null || restored.getStructuredPayload().isNull()).isTrue();
    }

    @Test
    void safelyDefaultsRequiredFields() throws Exception {
        EvidenceItem item = new EvidenceItem();
        item.setArtifactType(null);
        item.setArtifactId("   ");

        String json = objectMapper.writeValueAsString(item);
        JsonNode root = objectMapper.readTree(json);

        assertThat(root.get("artifactType").asText()).isEqualTo("UNKNOWN");
        assertThat(root.get("artifactId").asText()).isEqualTo("unknown-artifact");
    }

    @Test
    void supportsLegacyAliasesForVersionAndContent() throws Exception {
        EvidenceItem legacy = new EvidenceItem(
            "SERVICE",
            "svc-12",
            "order-service",
            "OrderController:88",
            "commit-abc",
            "Auth check present",
            Instant.parse("2026-05-14T10:15:30Z")
        );

        String json = objectMapper.writeValueAsString(legacy);
        EvidenceItem restored = objectMapper.readValue(json, EvidenceItem.class);

        assertThat(restored.getArtifactType()).isEqualTo(EvidenceArtifactType.SERVICE);
        assertThat(restored.getArtifactName()).isEqualTo("order-service");
        assertThat(restored.getVersion()).isEqualTo("commit-abc");
        assertThat(restored.getContent()).isEqualTo("Auth check present");
    }
}
