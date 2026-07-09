package edu.baylor.ecs.cloudhubs.chatbot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotConfidence;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotFlag;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.chatbot.model.CitationItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.MissingEvidence;
import edu.baylor.ecs.cloudhubs.chatbot.retrieval.model.QuestionIntent;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ChatEvidenceServicesTest {

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
    private final ChatContextService chatContextService = ChatContextService.forProviders(List.of(new ContextMetadataEvidenceContextProvider()));
    private final EvidenceGuardrailService evidenceGuardrailService = new EvidenceGuardrailService();

    @Test
    void evidenceItemSerializationRoundTrip() throws Exception {
        EvidenceItem item = new EvidenceItem(
            "SERVICE",
            "svc-12",
            "order-service",
            "OrderController:88",
            "commit-abc",
            "Auth check is present in createOrder",
            Instant.parse("2026-05-14T10:15:30Z")
        );

        String json = objectMapper.writeValueAsString(item);
        EvidenceItem restored = objectMapper.readValue(json, EvidenceItem.class);

        assertThat(restored.getArtifactType()).isEqualTo(EvidenceArtifactType.SERVICE);
        assertThat(restored.getArtifactId()).isEqualTo("svc-12");
        assertThat(restored.getLocationHint()).isEqualTo("OrderController:88");
        assertThat(restored.getTimestamp()).isEqualTo(Instant.parse("2026-05-14T10:15:30Z"));
    }

    @Test
    void noEvidenceCausesRefusalWithMissingSourcesListed() {
        ChatbotResponse response = new ChatbotResponse();

        ChatbotResponse guarded = evidenceGuardrailService.enforcePreGeneration(
            "What architecture risks exist?",
            QuestionIntent.ARCHITECTURE_TOPOLOGY,
            List.of(),
            List.of(new MissingEvidence(EvidenceArtifactType.CONTEXT_METADATA, "Insufficient active context", "systemName|irId")),
            response,
            true
        );

        assertThat(guarded.getFlags()).contains(ChatbotFlag.INSUFFICIENT_EVIDENCE);
        assertThat(guarded.getAnswer()).contains("Missing sources").contains("IR").contains("graph").contains("active context");
        assertThat(guarded.getConfidence()).isEqualTo(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
    }

    @Test
    void partialEvidenceCausesQualifiedResponse() {
        EvidenceItem evidence = new EvidenceItem();
        evidence.setArtifactType(EvidenceArtifactType.DEPENDENCY);
        evidence.setArtifactId("E1");

        ChatbotResponse guarded = evidenceGuardrailService.enforcePreGeneration(
            "What depends on order-service?",
            QuestionIntent.DEPENDENCY,
            List.of(evidence),
            List.of(new MissingEvidence(EvidenceArtifactType.GRAPH, "Graph unavailable", "graph")),
            new ChatbotResponse(),
            true
        );

        assertThat(guarded.getFlags()).contains(ChatbotFlag.PARTIAL);
        assertThat(guarded.getAnswer()).contains("Partial evidence available").contains("graph");
    }

    @Test
    void uncitedGeneratedAnswerIsBlocked() {
        EvidenceItem evidence = new EvidenceItem();
        evidence.setArtifactType(EvidenceArtifactType.ENDPOINT);
        evidence.setArtifactId("E2");

        ChatbotResponse response = new ChatbotResponse();
        response.setAnswer("Answer: endpoint is stable.");
        response.setCitations(List.of());

        ChatbotResponse guarded = evidenceGuardrailService.enforcePostGeneration(
            "What endpoint changed?",
            QuestionIntent.ENDPOINT_LOOKUP,
            List.of(evidence),
            response,
            true
        );

        assertThat(guarded.getFlags()).contains(ChatbotFlag.CITATION_VALIDATION_FAILED, ChatbotFlag.INSUFFICIENT_EVIDENCE);
        assertThat(guarded.getConfidence()).isEqualTo(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
        assertThat(guarded.getAnswer()).contains("Insufficient citation support");
    }

    @Test
    void invalidCitationIdsAreDetected() {
        EvidenceItem evidence = new EvidenceItem();
        evidence.setArtifactType(EvidenceArtifactType.DEPENDENCY);
        evidence.setArtifactId("E3");

        ChatbotResponse response = new ChatbotResponse();
        response.setAnswer("Answer: A depends on B [E999].");
        response.setCitations(List.of(new CitationItem("DEPENDENCY", "E3", "dep", "links[2]", "v1", "A->B")));

        ChatbotResponse guarded = evidenceGuardrailService.enforcePostGeneration(
            "What depends on A?",
            QuestionIntent.DEPENDENCY,
            List.of(evidence),
            response,
            true
        );

        assertThat(guarded.getFlags()).contains(ChatbotFlag.CITATION_VALIDATION_FAILED);
        assertThat(guarded.getConfidence()).isEqualTo(ChatbotConfidence.LOW);
        assertThat(guarded.getAnswer()).contains("[citation_removed]");
    }

    @Test
    void contextProviderStillProducesScopedEvidence() {
        ChatbotContext context = new ChatbotContext("TrainTicket", "ir-1", "idx-2", "run-3", "commit-4", "order-service", "POST /orders", null);
        List<EvidenceItem> evidence = chatContextService.collectEvidence(context);
        assertThat(evidence).hasSize(1);
    }

    @Test
    void strictModeBlocksWeakEvidenceOnlyAnswers() {
        EvidenceItem weak = new EvidenceItem();
        weak.setArtifactType(EvidenceArtifactType.CONTEXT_METADATA);
        weak.setArtifactId("E5");
        weak.setConfidenceSource("inferred");

        ChatbotResponse guarded = evidenceGuardrailService.enforcePreGeneration(
            "What endpoint changed?",
            QuestionIntent.ENDPOINT_LOOKUP,
            List.of(weak),
            List.of(),
            new ChatbotResponse(),
            true
        );

        assertThat(guarded.getFlags()).contains(ChatbotFlag.INSUFFICIENT_EVIDENCE);
        assertThat(guarded.getAnswer()).contains("Insufficient evidence").contains("Missing sources");
    }

    @Test
    void nonStrictModeAllowsQualifiedRecommendationWithCitations() {
        EvidenceItem evidence = new EvidenceItem();
        evidence.setArtifactType(EvidenceArtifactType.DEPENDENCY);
        evidence.setArtifactId("E6");
        evidence.setConfidenceSource("inferred");

        ChatbotResponse pre = evidenceGuardrailService.enforcePreGeneration(
            "What depends on billing-service?",
            QuestionIntent.DEPENDENCY,
            List.of(evidence),
            List.of(new MissingEvidence(EvidenceArtifactType.GRAPH, "graph source missing", "graph")),
            new ChatbotResponse(),
            false
        );
        pre.setAnswer("Recommendation: prioritize observing billing-service dependencies [E6].");
        pre.setCitations(List.of(new CitationItem("DEPENDENCY", "E6", "billing-service", "links[1]", "c1", "edge")));

        ChatbotResponse post = evidenceGuardrailService.enforcePostGeneration(
            "What depends on billing-service?",
            QuestionIntent.DEPENDENCY,
            List.of(evidence),
            pre,
            false
        );

        assertThat(post.getFlags()).doesNotContain(ChatbotFlag.INSUFFICIENT_EVIDENCE);
        assertThat(post.getCitations()).hasSize(1);
        assertThat(post.getAnswer()).contains("Recommendation");
    }
}
