package edu.baylor.ecs.cloudhubs.chatbot.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import java.util.List;
import org.junit.jupiter.api.Test;

class IrEvidenceMapperTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void mapsMicroservicesToIrEvidenceAndEndpointsToEndpointEvidence() throws Exception {
        JsonNode ir = OBJECT_MAPPER.readTree("""
            {
              "name": "TrainTicket",
              "commitID": "commit-1",
              "microservices": [
                {
                  "name": "ts-seat-service",
                  "path": "/ts-seat-service",
                  "controllers": [
                    {
                      "name": "SeatController",
                      "path": "/ts-seat-service/src/main/java/seat/controller/SeatController.java",
                      "methods": [
                        { "name": "create", "httpMethod": "POST", "url": "/api/v1/seatservice/seats" },
                        { "name": "internalHelper", "httpMethod": null, "url": null }
                      ]
                    }
                  ]
                },
                {
                  "name": "ts-order-service",
                  "path": "/ts-order-service",
                  "controllers": []
                }
              ]
            }
            """);

        List<EvidenceItem> items = IrEvidenceMapper.mapIrToEvidence(ir, "ir-1");

        assertThat(items).hasSize(3);

        EvidenceItem seatService = items.get(0);
        assertThat(seatService.getArtifactType()).isEqualTo(EvidenceArtifactType.IR);
        assertThat(seatService.getServiceName()).isEqualTo("ts-seat-service");
        assertThat(seatService.getArtifactId()).isEqualTo("ir:ir-1:service:ts-seat-service");
        assertThat(seatService.getCommitId()).isEqualTo("commit-1");
        assertThat(seatService.getContentText()).contains("1 controller(s)").contains("1 HTTP endpoint(s)");

        EvidenceItem endpoint = items.get(1);
        assertThat(endpoint.getArtifactType()).isEqualTo(EvidenceArtifactType.ENDPOINT);
        assertThat(endpoint.getServiceName()).isEqualTo("ts-seat-service");
        assertThat(endpoint.getHttpMethod()).isEqualTo("POST");
        assertThat(endpoint.getEndpointPath()).isEqualTo("/api/v1/seatservice/seats");
        assertThat(endpoint.getEntityName()).isEqualTo("SeatController.create");
        assertThat(endpoint.getArtifactId()).isEqualTo("ir:ir-1:endpoint:ts-seat-service:POST:/api/v1/seatservice/seats");

        EvidenceItem orderService = items.get(2);
        assertThat(orderService.getArtifactType()).isEqualTo(EvidenceArtifactType.IR);
        assertThat(orderService.getServiceName()).isEqualTo("ts-order-service");
        assertThat(orderService.getContentText()).contains("0 controller(s)").contains("0 HTTP endpoint(s)");
    }

    @Test
    void skipsMethodsMissingHttpMethodOrUrl() throws Exception {
        JsonNode ir = OBJECT_MAPPER.readTree("""
            {
              "name": "sys",
              "microservices": [
                { "name": "svc-a", "controllers": [
                    { "name": "CtrlA", "methods": [ { "name": "noHttp" } ] }
                  ]
                }
              ]
            }
            """);

        List<EvidenceItem> items = IrEvidenceMapper.mapIrToEvidence(ir, "ir-x");

        assertThat(items).hasSize(1);
        assertThat(items.get(0).getArtifactType()).isEqualTo(EvidenceArtifactType.IR);
    }

    @Test
    void returnsEmptyForNullOrNonObjectRoot() {
        assertThat(IrEvidenceMapper.mapIrToEvidence(null, "ir-1")).isEmpty();
        assertThat(IrEvidenceMapper.mapIrToEvidence(OBJECT_MAPPER.createArrayNode(), "ir-1")).isEmpty();
    }

    @Test
    void returnsEmptyWhenMicroservicesFieldMissing() throws Exception {
        JsonNode ir = OBJECT_MAPPER.readTree("""
            {"name": "sys"}
            """);
        assertThat(IrEvidenceMapper.mapIrToEvidence(ir, "ir-1")).isEmpty();
    }

    @Test
    void respectsMaxItemsCap() throws Exception {
        StringBuilder services = new StringBuilder();
        for (int i = 0; i < 5; i++) {
            if (i > 0) services.append(',');
            services.append(String.format("""
                { "name": "svc-%d", "controllers": [] }
                """, i));
        }
        JsonNode ir = OBJECT_MAPPER.readTree("{ \"name\": \"sys\", \"microservices\": [" + services + "] }");

        List<EvidenceItem> items = IrEvidenceMapper.mapIrToEvidence(ir, "ir-1", 3);

        assertThat(items).hasSize(3);
    }
}
