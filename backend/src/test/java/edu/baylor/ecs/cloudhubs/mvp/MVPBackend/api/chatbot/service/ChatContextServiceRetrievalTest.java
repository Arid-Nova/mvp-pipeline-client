package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotMessage;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotQueryRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.MissingEvidence;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class ChatContextServiceRetrievalTest {

    @Test
    void activeContextIsPropagatedToProviders() {
        AtomicReference<EvidenceQueryContext> observed = new AtomicReference<>();
        EvidenceContextProvider provider = new EvidenceContextProvider() {
            @Override
            public String providerId() {
                return "capture-provider";
            }

            @Override
            public boolean supports(EvidenceQueryContext context, String question) {
                return true;
            }

            @Override
            public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
                observed.set(context);
                EvidenceItem item = new EvidenceItem();
                item.setArtifactType(EvidenceArtifactType.SERVICE);
                item.setArtifactId("svc-1");
                item.setEntityName(context.getScope().getServiceName());
                EvidenceRetrievalResult result = new EvidenceRetrievalResult();
                result.setEvidenceItems(List.of(item));
                return result;
            }
        };

        ChatContextService service = new ChatContextService(List.of(provider));
        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What changed in order-service?",
            new ChatbotContext("TrainTicket", "ir-1", "idx-1", "run-1", "commit-1", "order-service", "POST /orders", null),
            "conv-1",
            List.of(new ChatbotMessage("user", "previous"))
        );

        EvidenceRetrievalResult result = service.retrieveEvidence(request);

        assertThat(result.getEvidenceItems()).hasSize(1);
        assertThat(observed.get()).isNotNull();
        assertThat(observed.get().getScope().getSystemName()).isEqualTo("TrainTicket");
        assertThat(observed.get().getScope().getIrId()).isEqualTo("ir-1");
        assertThat(observed.get().getScope().getSessionId()).isEqualTo("conv-1");
        assertThat(observed.get().getConversationHistory()).hasSize(1);
    }

    @Test
    void noContextReturnsMissingEvidenceAndSkipsProviders() {
        AtomicReference<Boolean> called = new AtomicReference<>(false);
        EvidenceContextProvider provider = new EvidenceContextProvider() {
            @Override
            public String providerId() {
                return "should-not-run";
            }

            @Override
            public boolean supports(EvidenceQueryContext context, String question) {
                return true;
            }

            @Override
            public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
                called.set(true);
                return new EvidenceRetrievalResult();
            }
        };

        ChatContextService service = new ChatContextService(List.of(provider));
        EvidenceRetrievalResult result = service.retrieveEvidence(new ChatbotQueryRequest("Any risk?", null, null, null));

        assertThat(called.get()).isFalse();
        assertThat(result.getEvidenceItems()).isEmpty();
        assertThat(result.getMissingEvidence()).isNotEmpty();
        assertThat(result.getMissingEvidence().get(0).getReason()).contains("Insufficient active context");
    }

    @Test
    void multipleProvidersAreAggregatedDeterministically() {
        EvidenceContextProvider beta = providerWithId("beta", "e2");
        EvidenceContextProvider alpha = providerWithId("alpha", "e1");

        ChatContextService service = new ChatContextService(List.of(beta, alpha));
        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What changed?",
            new ChatbotContext("TrainTicket", "ir-1", null, null, null, null, null, null),
            null,
            null
        );

        EvidenceRetrievalResult result = service.retrieveEvidence(request);

        assertThat(result.getEvidenceItems()).extracting(EvidenceItem::getArtifactId).containsExactly("e1", "e2");
    }

    @Test
    void providerFailureIsIsolatedAsMissingEvidence() {
        EvidenceContextProvider failing = new EvidenceContextProvider() {
            @Override
            public String providerId() {
                return "broken-provider";
            }

            @Override
            public boolean supports(EvidenceQueryContext context, String question) {
                return true;
            }

            @Override
            public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
                throw new IllegalStateException("boom");
            }
        };
        EvidenceContextProvider healthy = providerWithId("healthy-provider", "e-ok");

        ChatContextService service = new ChatContextService(List.of(failing, healthy));
        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "What changed?",
            new ChatbotContext("TrainTicket", "ir-1", null, null, null, null, null, null),
            null,
            null
        );

        EvidenceRetrievalResult result = service.retrieveEvidence(request);

        assertThat(result.getEvidenceItems()).extracting(EvidenceItem::getArtifactId).contains("e-ok");
        assertThat(result.getMissingEvidence())
            .extracting(MissingEvidence::getExpectedIdentifier)
            .contains("broken-provider");
    }

    private EvidenceContextProvider providerWithId(String id, String evidenceId) {
        return new EvidenceContextProvider() {
            @Override
            public String providerId() {
                return id;
            }

            @Override
            public boolean supports(EvidenceQueryContext context, String question) {
                return true;
            }

            @Override
            public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
                EvidenceItem item = new EvidenceItem();
                item.setArtifactType(EvidenceArtifactType.ARCHITECTURE);
                item.setArtifactId(evidenceId);
                EvidenceRetrievalResult result = new EvidenceRetrievalResult();
                result.setEvidenceItems(new ArrayList<>(List.of(item)));
                return result;
            }
        };
    }
}
