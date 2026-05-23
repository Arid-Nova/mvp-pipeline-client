package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.quality;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotConfidence;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotFlag;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.CitationItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.MissingEvidence;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval.QuestionIntent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ConfidenceServiceTest {

    private final ConfidenceService service = new ConfidenceService();

    @Test
    void highConfidenceWithDirectIrGraphCitations() {
        EvidenceItem ir = item("E1", EvidenceArtifactType.IR, "order-service", null);
        EvidenceItem graph = item("E2", EvidenceArtifactType.GRAPH, "order-service", null);

        ConfidenceAssessment assessment = service.assess(
            QuestionIntent.ARCHITECTURE_TOPOLOGY,
            List.of(ir, graph),
            List.of(new CitationItem("IR", "E1", "order-service", "microservices[0]", "c1", "svc")),
            List.of(),
            List.of("order-service"),
            List.of()
        );

        assertThat(assessment.getConfidence()).isEqualTo(ChatbotConfidence.HIGH);
        assertThat(assessment.getReasons()).contains("exact_match", "has_ir_evidence", "has_graph_evidence");
    }

    @Test
    void mediumConfidenceWithPartialEvidence() {
        EvidenceItem dep = item("E3", EvidenceArtifactType.DEPENDENCY, "payment-service", null);

        ConfidenceAssessment assessment = service.assess(
            QuestionIntent.DEPENDENCY,
            List.of(dep),
            List.of(new CitationItem("DEPENDENCY", "E3", "payment-service", "links[0]", "c1", "edge")),
            List.of(ChatbotFlag.partial),
            List.of("payment-service"),
            List.of(new MissingEvidence(EvidenceArtifactType.GRAPH, "graph source missing", "graph"))
        );

        assertThat(assessment.getConfidence()).isEqualTo(ChatbotConfidence.MEDIUM);
        assertThat(assessment.getReasons()).contains("partial_sources", "exact_match");
    }

    @Test
    void lowConfidenceWithTruncation() {
        EvidenceItem ep = item("E4", EvidenceArtifactType.ENDPOINT, "order-service", "/orders");

        ConfidenceAssessment assessment = service.assess(
            QuestionIntent.ENDPOINT_LOOKUP,
            List.of(ep),
            List.of(new CitationItem("ENDPOINT", "E4", "order-service", "controllers[0]", "c2", "endpoint")),
            List.of(ChatbotFlag.truncated_context),
            List.of("/orders"),
            List.of()
        );

        assertThat(assessment.getConfidence()).isEqualTo(ChatbotConfidence.LOW);
        assertThat(assessment.getReasons()).contains("truncated_context");
    }

    @Test
    void insufficientEvidenceWithNoEvidence() {
        ConfidenceAssessment assessment = service.assess(
            QuestionIntent.ARCHITECTURE_TOPOLOGY,
            List.of(),
            List.of(),
            List.of(ChatbotFlag.insufficient_evidence),
            List.of(),
            List.of(new MissingEvidence(EvidenceArtifactType.IR, "missing", "ir"))
        );

        assertThat(assessment.getConfidence()).isEqualTo(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
        assertThat(assessment.getReasons()).contains("missing_required_evidence");
    }

    @Test
    void confidenceRationaleIsSerialized() throws Exception {
        ChatbotResponse response = new ChatbotResponse();
        response.setConfidence(ChatbotConfidence.LOW);
        response.setConfidenceRationale("Evidence quality concerns reduce confidence.");
        response.setConfidenceReasons(List.of("provider_unavailable", "truncated_context"));

        String json = new ObjectMapper().writeValueAsString(response);
        assertThat(json).contains("confidenceRationale");
        assertThat(json).contains("confidenceReasons");
    }

    private EvidenceItem item(String id, EvidenceArtifactType type, String service, String endpoint) {
        EvidenceItem e = new EvidenceItem();
        e.setArtifactId(id);
        e.setArtifactType(type);
        e.setServiceName(service);
        e.setEntityName(service);
        e.setEndpointPath(endpoint);
        return e;
    }
}
