package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotFlag;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
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
    void noContextNoEvidenceYieldsInsufficientEvidenceFlag() {
        List<EvidenceItem> evidence = chatContextService.collectEvidence((ChatbotContext) null);
        assertThat(evidence).isEmpty();

        ChatbotResponse response = new ChatbotResponse();
        response.setAnswer("");
        ChatbotResponse guarded = evidenceGuardrailService.enforce(
            "What architecture risks exist?",
            evidence,
            response
        );

        assertThat(guarded.getFlags()).contains(ChatbotFlag.insufficient_evidence);
        assertThat(guarded.getAnswer().toLowerCase()).contains("insufficient evidence");
        assertThat(guarded.getCitations()).isEmpty();
    }

    @Test
    void factualAnswerWithEvidenceGetsCitationIfMissing() {
        ChatbotContext context = new ChatbotContext("TrainTicket", "ir-1", "idx-2", "run-3", "commit-4", "order-service", "POST /orders", null);
        List<EvidenceItem> evidence = chatContextService.collectEvidence(context);
        assertThat(evidence).hasSize(1);

        ChatbotResponse response = new ChatbotResponse();
        response.setAnswer("The selected service is order-service.");

        ChatbotResponse guarded = evidenceGuardrailService.enforce(
            "What service changed in this commit?",
            evidence,
            response
        );

        assertThat(guarded.getFlags()).doesNotContain(ChatbotFlag.insufficient_evidence);
        assertThat(guarded.getCitations()).hasSize(1);
        assertThat(guarded.getCitations().get(0).getArtifactId()).isEqualTo(evidence.get(0).getArtifactId());
        assertThat(guarded.getCitations().get(0).getLocationHint()).isEqualTo("active-context");
    }
}
