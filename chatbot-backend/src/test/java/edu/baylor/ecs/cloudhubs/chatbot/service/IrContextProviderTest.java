package edu.baylor.ecs.cloudhubs.chatbot.service;

import static org.assertj.core.api.Assertions.assertThat;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceScope;
import org.junit.jupiter.api.Test;

class IrContextProviderTest {

    private final IrContextProvider provider = new IrContextProvider();

    @Test
    void supportsIrScopedContext() {
        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setIrId("ir-1");
        context.setScope(scope);

        assertThat(provider.supports(context, "summarize the IR")).isTrue();
    }

    @Test
    void returnsMissingEvidenceWhenSharedIrContractIsUnavailable() {
        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setSystemName("orders");
        context.setScope(scope);

        EvidenceRetrievalResult result = provider.collectEvidence(context, "what services exist?");

        assertThat(result.getEvidenceItems()).isEmpty();
        assertThat(result.getMissingEvidence()).hasSize(1);
        assertThat(result.getMissingEvidence().get(0).getArtifactType()).isEqualTo(EvidenceArtifactType.IR);
        assertThat(result.getMissingEvidence().get(0).getExpectedIdentifier()).isEqualTo("orders");
    }
}
