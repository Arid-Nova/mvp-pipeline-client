package edu.baylor.ecs.cloudhubs.chatbot.service;

import static org.assertj.core.api.Assertions.assertThat;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceScope;
import org.junit.jupiter.api.Test;

class GraphContextProviderTest {

    private final GraphContextProvider provider = new GraphContextProvider();

    @Test
    void supportsSystemScopedContext() {
        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setSystemName("orders");
        context.setScope(scope);

        assertThat(provider.supports(context, "show dependencies")).isTrue();
    }

    @Test
    void returnsMissingEvidenceWhenSharedGraphContractIsUnavailable() {
        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setSystemName("orders");
        context.setScope(scope);

        EvidenceRetrievalResult result = provider.collectEvidence(context, "what calls downstream?");

        assertThat(result.getEvidenceItems()).isEmpty();
        assertThat(result.getMissingEvidence()).hasSize(1);
        assertThat(result.getMissingEvidence().get(0).getArtifactType()).isEqualTo(EvidenceArtifactType.GRAPH);
        assertThat(result.getMissingEvidence().get(0).getExpectedIdentifier()).isEqualTo("orders");
    }
}
