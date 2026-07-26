package edu.baylor.ecs.cloudhubs.chatbot.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceScope;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class IrContextProviderTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void supportsIrScopedContext() {
        IrContextProvider provider = new IrContextProvider(new FakeBackendIrGateway());
        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setIrId("ir-1");
        context.setScope(scope);

        assertThat(provider.supports(context, "summarize the IR")).isTrue();
    }

    @Test
    void doesNotSupportContextWithoutAnyIdentifier() {
        IrContextProvider provider = new IrContextProvider(new FakeBackendIrGateway());
        EvidenceQueryContext context = new EvidenceQueryContext();
        context.setScope(new EvidenceScope());

        assertThat(provider.supports(context, "summarize the IR")).isFalse();
    }

    @Test
    void returnsMissingEvidenceWhenBackendHasNoMatchingIr() {
        IrContextProvider provider = new IrContextProvider(new FakeBackendIrGateway());
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

    private static final String SINGLE_SERVICE_IR = """
        {
          "name": "TrainTicket",
          "commitID": "abc123",
          "microservices": [
            {
              "name": "ts-seat-service",
              "path": "/ts-seat-service",
              "controllers": [
                {
                  "name": "SeatController",
                  "path": "/ts-seat-service/.../SeatController.java",
                  "methods": [
                    { "name": "create", "httpMethod": "POST", "url": "/api/v1/seatservice/seats" }
                  ]
                }
              ]
            }
          ]
        }
        """;

    @Test
    void fetchesByIrIdAndMapsMicroservicesForBroadQuestionsWithoutEndpointDetail() throws Exception {
        // A broad question (no endpoint/method/path signal) should not generate ENDPOINT
        // evidence: on real systems (e.g. TrainTicket's 45 services / ~260 endpoints) it ranks
        // above IR evidence and crowds it out of the context budget entirely.
        FakeBackendIrGateway gateway = new FakeBackendIrGateway();
        gateway.byId.put("ir-1", OBJECT_MAPPER.readTree(SINGLE_SERVICE_IR));
        IrContextProvider provider = new IrContextProvider(gateway);

        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setIrId("ir-1");
        scope.setSystemName("TrainTicket");
        context.setScope(scope);

        EvidenceRetrievalResult result = provider.collectEvidence(context, "explain architecture topology");

        assertThat(result.getMissingEvidence()).isEmpty();
        assertThat(result.getEvidenceItems()).hasSize(1);
        assertThat(result.getEvidenceItems().get(0).getArtifactType()).isEqualTo(EvidenceArtifactType.IR);
        assertThat(result.getEvidenceItems().get(0).getServiceName()).isEqualTo("ts-seat-service");
        assertThat(gateway.lastRequestedId).isEqualTo("ir-1");
    }

    @Test
    void fetchesByIrIdAndIncludesEndpointsWhenQuestionIsEndpointScoped() throws Exception {
        FakeBackendIrGateway gateway = new FakeBackendIrGateway();
        gateway.byId.put("ir-1", OBJECT_MAPPER.readTree(SINGLE_SERVICE_IR));
        IrContextProvider provider = new IrContextProvider(gateway);

        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setIrId("ir-1");
        scope.setSystemName("TrainTicket");
        context.setScope(scope);

        EvidenceRetrievalResult result = provider.collectEvidence(context, "What does POST /api/v1/seatservice/seats do?");

        assertThat(result.getMissingEvidence()).isEmpty();
        assertThat(result.getEvidenceItems()).hasSize(2);

        EvidenceItem serviceItem = result.getEvidenceItems().get(0);
        assertThat(serviceItem.getArtifactType()).isEqualTo(EvidenceArtifactType.IR);
        assertThat(serviceItem.getServiceName()).isEqualTo("ts-seat-service");

        EvidenceItem endpointItem = result.getEvidenceItems().get(1);
        assertThat(endpointItem.getArtifactType()).isEqualTo(EvidenceArtifactType.ENDPOINT);
        assertThat(endpointItem.getHttpMethod()).isEqualTo("POST");
        assertThat(endpointItem.getEndpointPath()).isEqualTo("/api/v1/seatservice/seats");
        assertThat(gateway.lastRequestedId).isEqualTo("ir-1");
    }

    @Test
    void includesEndpointsWhenContextHasAnExplicitlySelectedEndpoint() throws Exception {
        FakeBackendIrGateway gateway = new FakeBackendIrGateway();
        gateway.byId.put("ir-1", OBJECT_MAPPER.readTree(SINGLE_SERVICE_IR));
        IrContextProvider provider = new IrContextProvider(gateway);

        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setIrId("ir-1");
        scope.setEndpointPath("/api/v1/seatservice/seats");
        context.setScope(scope);

        EvidenceRetrievalResult result = provider.collectEvidence(context, "tell me about this");

        assertThat(result.getEvidenceItems())
            .anyMatch(item -> item.getArtifactType() == EvidenceArtifactType.ENDPOINT);
    }

    @Test
    void fallsBackToSystemNameLookupWhenIrIdMissing() throws Exception {
        JsonNode ir = OBJECT_MAPPER.readTree("""
            {"name": "orders", "commitID": "c1", "microservices": [{"name": "order-service", "controllers": []}]}
            """);
        FakeBackendIrGateway gateway = new FakeBackendIrGateway();
        gateway.bySystemName.put("orders", ir);
        IrContextProvider provider = new IrContextProvider(gateway);

        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setSystemName("orders");
        context.setScope(scope);

        EvidenceRetrievalResult result = provider.collectEvidence(context, "what services exist?");

        assertThat(result.getEvidenceItems()).hasSize(1);
        assertThat(result.getEvidenceItems().get(0).getServiceName()).isEqualTo("order-service");
        assertThat(gateway.lastRequestedSystemName).isEqualTo("orders");
    }

    @Test
    void supportsContextWithOnlyInlinePayloadAndNoScopeIdentifiers() throws Exception {
        IrContextProvider provider = new IrContextProvider(new FakeBackendIrGateway());
        EvidenceQueryContext context = new EvidenceQueryContext();
        context.setScope(new EvidenceScope());
        context.setChatbotContext(withInlinePayload("""
            {"name": "local-upload", "microservices": [{"name": "svc-a", "controllers": []}]}
            """));

        assertThat(provider.supports(context, "how many microservices?")).isTrue();
    }

    @Test
    void inlinePayloadIsUsedWithoutEverCallingTheBackendGateway() throws Exception {
        JsonNode differentIrInBackend = OBJECT_MAPPER.readTree("""
            {"name": "backend-copy", "microservices": [{"name": "should-not-be-used", "controllers": []}]}
            """);
        FakeBackendIrGateway gateway = new FakeBackendIrGateway();
        gateway.byId.put("ir-1", differentIrInBackend);
        IrContextProvider provider = new IrContextProvider(gateway);

        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setIrId("ir-1");
        context.setScope(scope);
        context.setChatbotContext(withInlinePayload("""
            {"name": "train-ticket", "microservices": [{"name": "ts-seat-service", "controllers": []}]}
            """));

        EvidenceRetrievalResult result = provider.collectEvidence(context, "explain architecture topology");

        assertThat(result.getEvidenceItems()).hasSize(1);
        assertThat(result.getEvidenceItems().get(0).getServiceName()).isEqualTo("ts-seat-service");
        assertThat(gateway.lastRequestedId)
            .as("backend gateway must not be called when an inline payload is present")
            .isNull();
    }

    @Test
    void fallsBackToBackendGatewayWhenInlinePayloadIsMalformed() throws Exception {
        JsonNode validBackendIr = OBJECT_MAPPER.readTree("""
            {"name": "orders", "microservices": [{"name": "order-service", "controllers": []}]}
            """);
        FakeBackendIrGateway gateway = new FakeBackendIrGateway();
        gateway.byId.put("ir-1", validBackendIr);
        IrContextProvider provider = new IrContextProvider(gateway);

        EvidenceQueryContext context = new EvidenceQueryContext();
        EvidenceScope scope = new EvidenceScope();
        scope.setIrId("ir-1");
        context.setScope(scope);
        // Malformed: no "microservices" array, so IrEvidenceMapper produces nothing inline.
        context.setChatbotContext(withInlinePayload("""
            {"name": "not-a-real-ir"}
            """));

        EvidenceRetrievalResult result = provider.collectEvidence(context, "explain architecture topology");

        assertThat(result.getEvidenceItems()).hasSize(1);
        assertThat(result.getEvidenceItems().get(0).getServiceName()).isEqualTo("order-service");
        assertThat(gateway.lastRequestedId).isEqualTo("ir-1");
    }

    private ChatbotContext withInlinePayload(String json) throws Exception {
        ChatbotContext chatbotContext = new ChatbotContext();
        chatbotContext.setIrPayload(OBJECT_MAPPER.readTree(json));
        return chatbotContext;
    }

    private static final class FakeBackendIrGateway implements BackendIrGateway {
        private final java.util.Map<String, JsonNode> byId = new java.util.HashMap<>();
        private final java.util.Map<String, JsonNode> bySystemName = new java.util.HashMap<>();
        private String lastRequestedId;
        private String lastRequestedSystemName;

        @Override
        public Optional<JsonNode> fetchIrById(String irId) {
            lastRequestedId = irId;
            return Optional.ofNullable(byId.get(irId));
        }

        @Override
        public Optional<JsonNode> fetchLatestIrForSystem(String systemName) {
            lastRequestedSystemName = systemName;
            return Optional.ofNullable(bySystemName.get(systemName));
        }
    }
}
