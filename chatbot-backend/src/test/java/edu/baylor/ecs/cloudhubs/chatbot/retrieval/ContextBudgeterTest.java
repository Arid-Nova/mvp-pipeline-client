package edu.baylor.ecs.cloudhubs.chatbot.retrieval;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ContextBudgeterTest {

    private final ContextBudgeter budgeter = new ContextBudgeter();

    @Test
    void oversizedEvidenceIsTruncatedDeterministically() {
        List<EvidenceItem> evidence = List.of(
            item("a", EvidenceArtifactType.IR, "order-service", null, "explicit", "x".repeat(40)),
            item("b", EvidenceArtifactType.GRAPH, "payment-service", null, "explicit", "x".repeat(40)),
            item("c", EvidenceArtifactType.DEPENDENCY, "inventory-service", null, "inferred", "x".repeat(40))
        );

        ContextBudgetResult first = budgeter.budget(evidence, List.of(), QuestionIntent.DEPENDENCY, 2, 200);
        ContextBudgetResult second = budgeter.budget(evidence, List.of(), QuestionIntent.DEPENDENCY, 2, 200);

        assertThat(first.isTruncated()).isTrue();
        assertThat(first.getRetainedEvidenceCount()).isEqualTo(2);
        assertThat(first.getRetainedEvidence()).extracting(EvidenceItem::getArtifactId)
            .containsExactlyElementsOf(second.getRetainedEvidence().stream().map(EvidenceItem::getArtifactId).toList());
    }

    @Test
    void directMatchIsRetained() {
        List<EvidenceItem> evidence = List.of(
            item("x1", EvidenceArtifactType.IR, "alpha-service", null, "explicit", "short"),
            item("x2", EvidenceArtifactType.GRAPH, "target-service", null, "explicit", "this is a direct match evidence block"),
            item("x3", EvidenceArtifactType.DEPENDENCY, "beta-service", null, "inferred", "short")
        );

        ContextBudgetResult result = budgeter.budget(evidence, List.of("target-service"), QuestionIntent.SERVICE_LOOKUP, 1, 500);

        assertThat(result.getRetainedEvidence()).hasSize(1);
        assertThat(result.getRetainedEvidence().get(0).getServiceName()).isEqualTo("target-service");
    }

    @Test
    void omittedCountsAreAccurate() {
        List<EvidenceItem> evidence = List.of(
            item("i1", EvidenceArtifactType.IR, "a", null, "explicit", "x".repeat(60)),
            item("g1", EvidenceArtifactType.GRAPH, "b", null, "explicit", "x".repeat(60)),
            item("d1", EvidenceArtifactType.DEPENDENCY, "c", null, "explicit", "x".repeat(60))
        );

        ContextBudgetResult result = budgeter.budget(evidence, List.of(), QuestionIntent.ARCHITECTURE_TOPOLOGY, 1, 100);

        assertThat(result.getRetainedEvidenceCount()).isEqualTo(1);
        assertThat(result.getOmittedArtifactTypeCounts().values().stream().mapToInt(Integer::intValue).sum()).isEqualTo(2);
    }

    @Test
    void noTruncationForSmallEvidenceSets() {
        List<EvidenceItem> evidence = List.of(
            item("s1", EvidenceArtifactType.SERVICE, "order-service", null, "explicit", "short")
        );

        ContextBudgetResult result = budgeter.budget(evidence, List.of("order-service"), QuestionIntent.SERVICE_LOOKUP, 5, 500);

        assertThat(result.isTruncated()).isFalse();
        assertThat(result.getRetainedEvidenceCount()).isEqualTo(1);
        assertThat(result.getOmittedArtifactTypeCounts()).isEmpty();
    }

    @Test
    void sameInputProducesSameOutputOrder() {
        List<EvidenceItem> evidence = List.of(
            item("z", EvidenceArtifactType.DEPENDENCY, "svc-z", "/z", "explicit", "same"),
            item("a", EvidenceArtifactType.IR, "svc-a", "/a", "explicit", "same"),
            item("m", EvidenceArtifactType.GRAPH, "svc-m", "/m", "inferred", "same")
        );

        ContextBudgetResult first = budgeter.budget(evidence, List.of(), QuestionIntent.DEPENDENCY, 3, 5000);
        ContextBudgetResult second = budgeter.budget(evidence, List.of(), QuestionIntent.DEPENDENCY, 3, 5000);

        assertThat(first.getRetainedEvidence()).extracting(EvidenceItem::getArtifactId)
            .containsExactlyElementsOf(second.getRetainedEvidence().stream().map(EvidenceItem::getArtifactId).toList());
    }

    private EvidenceItem item(String id, EvidenceArtifactType type, String service, String endpoint, String confidence, String content) {
        EvidenceItem item = new EvidenceItem();
        item.setArtifactId(id);
        item.setArtifactType(type);
        item.setServiceName(service);
        item.setEntityName(service);
        item.setEndpointPath(endpoint);
        item.setConfidenceSource(confidence);
        item.setContentText(content);
        item.setLocationHint("loc-" + id);
        return item;
    }
}
