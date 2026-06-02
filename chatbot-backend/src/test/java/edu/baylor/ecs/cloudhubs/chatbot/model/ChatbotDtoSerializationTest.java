package edu.baylor.ecs.cloudhubs.chatbot.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ChatbotDtoSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void serializesAndDeserializesChatbotQueryRequest() throws Exception {
        ChatbotContext context = new ChatbotContext(
            "TrainTicket",
            "ir-123",
            "index-5",
            "run-9",
            "commit-abc",
            "order-service",
            "POST /orders",
            null
        );
        List<ChatbotMessage> messages = List.of(
            new ChatbotMessage("user", "What changed in auth flow?"),
            new ChatbotMessage("assistant", "Auth checks moved to gateway.")
        );
        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "Is there a risk in order-service authorization?",
            context,
            "conv-1",
            messages
        );

        String json = objectMapper.writeValueAsString(request);
        ChatbotQueryRequest restored = objectMapper.readValue(json, ChatbotQueryRequest.class);

        assertThat(restored.getQuestion()).isEqualTo(request.getQuestion());
        assertThat(restored.getConversationId()).isEqualTo("conv-1");
        assertThat(restored.getContext().getSystemName()).isEqualTo("TrainTicket");
        assertThat(restored.getMessages()).hasSize(2);
        assertThat(restored.getMessages().get(0).getRole()).isEqualTo("user");
    }

    @Test
    void serializesAndDeserializesChatbotResponse() throws Exception {
        ChatbotResponse response = new ChatbotResponse();
        response.setAnswer("Authorization appears partially inconsistent.");
        response.setConfidence(ChatbotConfidence.MEDIUM);
        response.setFlags(List.of(ChatbotFlag.partial, ChatbotFlag.stale_context));
        response.setRequestId("req-42");
        response.setProcessingTimeMs(128);
        response.setModel("llama3.2");
        response.setProvider("OLLAMA");
        response.setCitations(List.of(
            new CitationItem("SERVICE", "svc-1", "order-service", "OrderController:88", "a1b2c3", "Policy check is missing on refund path."),
            new CitationItem("ENDPOINT", "ep-44", "POST /refund", "RefundController:52", "a1b2c3", "Endpoint bypasses role validation.")
        ));

        String json = objectMapper.writeValueAsString(response);
        ChatbotResponse restored = objectMapper.readValue(json, ChatbotResponse.class);

        assertThat(restored.getAnswer()).contains("partially");
        assertThat(restored.getConfidence()).isEqualTo(ChatbotConfidence.MEDIUM);
        assertThat(restored.getFlags()).containsExactly(ChatbotFlag.partial, ChatbotFlag.stale_context);
        assertThat(restored.getCitations()).hasSize(2);
        assertThat(restored.getCitations().get(0).getArtifactType()).isEqualTo("SERVICE");
        assertThat(restored.getCitations().get(0).getLocationHint()).isEqualTo("OrderController:88");
    }

    @Test
    void capsCitationsToMaxBound() {
        List<CitationItem> citations = new ArrayList<>();
        for (int i = 0; i < ChatbotResponse.MAX_CITATIONS + 2; i++) {
            citations.add(new CitationItem("SERVICE", "svc-" + i, "service-" + i, "File:" + i, "v1", "summary-" + i));
        }

        ChatbotResponse response = new ChatbotResponse();
        response.setCitations(citations);

        assertThat(response.getCitations()).hasSize(ChatbotResponse.MAX_CITATIONS);
        assertThat(response.getCitations().get(0).getArtifactId()).isEqualTo("svc-0");
        assertThat(response.getCitations().get(ChatbotResponse.MAX_CITATIONS - 1).getArtifactId())
            .isEqualTo("svc-" + (ChatbotResponse.MAX_CITATIONS - 1));
    }
}
