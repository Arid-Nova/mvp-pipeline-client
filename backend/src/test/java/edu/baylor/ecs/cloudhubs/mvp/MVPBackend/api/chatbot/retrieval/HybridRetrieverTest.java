package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.retrieval;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceScope;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.MissingEvidence;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HybridRetrieverTest {

    private final HybridRetriever retriever = new HybridRetriever();

    @Test
    void exactServiceLookupChoosesStructuredStrategy() {
        List<EvidenceItem> evidence = List.of(
            item(EvidenceArtifactType.SERVICE, "svc-1", "order-service", null, null, "Order service handles order operations", Instant.parse("2026-05-20T10:00:00Z")),
            item(EvidenceArtifactType.SERVICE, "svc-2", "payment-service", null, null, "Payment service handles payments", Instant.parse("2026-05-20T11:00:00Z"))
        );

        HybridRetrievalResult result = retriever.retrieve(
            "show order-service architecture",
            context("train-ticket", "order-service", null),
            evidence,
            List.of()
        );

        assertThat(result.getIntent()).isEqualTo(QuestionIntent.SERVICE_LOOKUP);
        assertThat(result.getStrategy()).isEqualTo(RetrievalStrategy.STRUCTURED);
        assertThat(result.getRankedEvidence()).extracting(EvidenceItem::getServiceName).contains("order-service");
    }

    @Test
    void endpointLookupChoosesStructuredStrategy() {
        EvidenceItem endpoint = item(EvidenceArtifactType.ENDPOINT, "ep-1", "order-service", "/orders", "POST", "POST /orders endpoint", Instant.parse("2026-05-20T12:00:00Z"));

        HybridRetrievalResult result = retriever.retrieve(
            "what does POST /orders do",
            context("train-ticket", null, "/orders"),
            List.of(endpoint),
            List.of()
        );

        assertThat(result.getIntent()).isEqualTo(QuestionIntent.ENDPOINT_LOOKUP);
        assertThat(result.getStrategy()).isEqualTo(RetrievalStrategy.STRUCTURED);
        assertThat(result.getRankedEvidence()).hasSize(1);
        assertThat(result.getRankedEvidence().get(0).getEndpointPath()).isEqualTo("/orders");
    }

    @Test
    void architectureQuestionUsesRankedTextFallback() {
        List<EvidenceItem> evidence = List.of(
            item(EvidenceArtifactType.ARCHITECTURE, "arch-2", "gateway-service", null, null, "Gateway and order topology edges", Instant.parse("2026-05-20T09:00:00Z")),
            item(EvidenceArtifactType.ARCHITECTURE, "arch-1", "order-service", null, null, "Order service topology and architecture boundaries", Instant.parse("2026-05-20T10:00:00Z"))
        );

        HybridRetrievalResult result = retriever.retrieve(
            "explain architecture topology for order service",
            context("train-ticket", null, null),
            evidence,
            List.of()
        );

        assertThat(result.getIntent()).isEqualTo(QuestionIntent.ARCHITECTURE_TOPOLOGY);
        assertThat(result.getStrategy()).isEqualTo(RetrievalStrategy.TEXT_RANKED);
        assertThat(result.getRankedEvidence().get(0).getArtifactId()).isEqualTo("arch-1");
    }

    @Test
    void unknownEntityReportsMissingEvidence() {
        List<EvidenceItem> evidence = List.of(
            item(EvidenceArtifactType.SERVICE, "svc-1", "order-service", null, null, "Order service summary", Instant.parse("2026-05-20T10:00:00Z"))
        );

        HybridRetrievalResult result = retriever.retrieve(
            "show analytics-service details",
            context("train-ticket", null, null),
            evidence,
            List.of()
        );

        assertThat(result.getRankedEvidence()).isEmpty();
        assertThat(result.getMissingEvidence())
            .extracting(MissingEvidence::getExpectedIdentifier)
            .anyMatch(v -> v.contains("analytics-service"));
    }

    @Test
    void orderingIsDeterministicAcrossRepeatedRuns() {
        List<EvidenceItem> evidence = List.of(
            item(EvidenceArtifactType.DEPENDENCY, "dep-2", "order-service", "/orders", "POST", "Order depends on payment", Instant.parse("2026-05-20T10:00:00Z")),
            item(EvidenceArtifactType.DEPENDENCY, "dep-1", "order-service", "/orders", "POST", "Order depends on inventory", Instant.parse("2026-05-20T10:00:00Z"))
        );

        HybridRetrievalResult first = retriever.retrieve("dependency info for order-service", context("train-ticket", "order-service", null), evidence, List.of());
        HybridRetrievalResult second = retriever.retrieve("dependency info for order-service", context("train-ticket", "order-service", null), evidence, List.of());

        assertThat(first.getRankedEvidence()).extracting(EvidenceItem::getArtifactId)
            .containsExactlyElementsOf(second.getRankedEvidence().stream().map(EvidenceItem::getArtifactId).toList());
    }

    private EvidenceItem item(
        EvidenceArtifactType type,
        String id,
        String serviceName,
        String endpoint,
        String method,
        String content,
        Instant ts
    ) {
        EvidenceItem item = new EvidenceItem();
        item.setArtifactType(type);
        item.setArtifactId(id);
        item.setServiceName(serviceName);
        item.setEntityName(serviceName);
        item.setEndpointPath(endpoint);
        item.setHttpMethod(method);
        item.setContentText(content);
        item.setTimestamp(ts);
        item.setArtifactVersion("v1");
        return item;
    }

    private EvidenceQueryContext context(String system, String service, String endpoint) {
        ChatbotContext chatbotContext = new ChatbotContext(system, null, null, null, null, service, endpoint, null);
        EvidenceScope scope = new EvidenceScope(system, null, null, null, null, null, null, service, endpoint, null, null);
        return new EvidenceQueryContext("q", chatbotContext, scope, List.of(), "conv-1", false);
    }
}
