package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.CitationItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceCitationMapper;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceScope;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir.IRService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir.StoredIrPayload;
import org.junit.jupiter.api.Test;

import java.util.Date;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class IrContextProviderTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void extractsServicesEndpointsAndDependenciesFromIrPayload() throws Exception {
        JsonFixture fixture = buildFixture();
        IRService irService = new StubIrService(Optional.of(fixture.payload), Optional.empty());

        IrContextProvider provider = new IrContextProvider(irService);
        EvidenceQueryContext context = buildContext("ir-123", null, "commit-scope");

        EvidenceRetrievalResult result = provider.collectEvidence(context, "What endpoints and dependencies exist?");

        assertThat(result.getMissingEvidence()).isEmpty();
        assertThat(result.getEvidenceItems()).isNotEmpty();
        assertThat(result.getEvidenceItems())
            .anyMatch(item -> item.getEntityType().equals("MICROSERVICE") && "order-service".equals(item.getServiceName()));
        assertThat(result.getEvidenceItems())
            .anyMatch(item -> item.getArtifactType() == EvidenceArtifactType.ENDPOINT
                && "POST".equals(item.getHttpMethod())
                && "/orders".equals(item.getEndpointPath())
                && item.getLocationHint().contains("controllers[0].methods[0].url"));
        assertThat(result.getEvidenceItems())
            .anyMatch(item -> item.getArtifactType() == EvidenceArtifactType.DEPENDENCY
                && item.getLocationHint().contains("methodCalls[0]")
                && item.getContentText().contains("createPayment"));
        assertThat(result.getEvidenceItems())
            .anyMatch(item -> item.getArtifactType() == EvidenceArtifactType.DEPENDENCY
                && item.getLocationHint().contains("feignClients[0].annotations"));
    }

    @Test
    void handlesMissingControllersOrMethodsNullSafely() throws Exception {
        String json = """
            {
              \"name\": \"TrainTicket\",
              \"microservices\": [
                { \"name\": \"alpha-service\" },
                { \"name\": \"beta-service\", \"controllers\": [ { \"name\": \"BetaController\" } ] }
              ]
            }
            """;
        StoredIrPayload payload = new StoredIrPayload("ir-456", "TrainTicket", new Date(), new Date(), objectMapper.readTree(json));
        IRService irService = new StubIrService(Optional.of(payload), Optional.empty());

        IrContextProvider provider = new IrContextProvider(irService);
        EvidenceRetrievalResult result = provider.collectEvidence(buildContext("ir-456", null, null), "list services");

        assertThat(result.getEvidenceItems())
            .filteredOn(item -> "MICROSERVICE".equals(item.getEntityType()))
            .hasSize(2);
        assertThat(result.getMissingEvidence()).isEmpty();
    }

    @Test
    void resolvesLatestBySystemWhenIrIdMissing() throws Exception {
        JsonFixture fixture = buildFixture();
        IRService irService = new StubIrService(Optional.empty(), Optional.of(fixture.payload));

        IrContextProvider provider = new IrContextProvider(irService);
        EvidenceQueryContext context = buildContext(null, "TrainTicket", null);
        EvidenceRetrievalResult result = provider.collectEvidence(context, "services?");

        assertThat(result.getEvidenceItems()).isNotEmpty();
        assertThat(result.getMissingEvidence()).isEmpty();
    }

    @Test
    void generatesCitationMetadataFromExtractedEvidence() throws Exception {
        JsonFixture fixture = buildFixture();
        IRService irService = new StubIrService(Optional.of(fixture.payload), Optional.empty());

        IrContextProvider provider = new IrContextProvider(irService);
        EvidenceRetrievalResult result = provider.collectEvidence(buildContext("ir-123", null, "commit-scope"), "endpoint facts");

        EvidenceItem endpoint = result.getEvidenceItems().stream()
            .filter(item -> item.getArtifactType() == EvidenceArtifactType.ENDPOINT)
            .findFirst()
            .orElseThrow();

        CitationItem citation = EvidenceCitationMapper.toCitation(endpoint);
        assertThat(citation.getArtifactType()).isEqualTo("ENDPOINT");
        assertThat(citation.getLocationHint()).contains("controllers");
        assertThat(citation.getVersion()).isEqualTo("ir-123");
        assertThat(citation.getSummary()).contains("Endpoint discovered");
    }

    private EvidenceQueryContext buildContext(String irId, String systemName, String commitId) {
        ChatbotContext chatbotContext = new ChatbotContext(systemName, irId, null, null, commitId, null, null, null);
        EvidenceScope scope = new EvidenceScope(systemName, irId, null, null, commitId, null, null, null, null, null, null);
        return new EvidenceQueryContext("question", chatbotContext, scope, List.of(), "conv-1", false);
    }

    private JsonFixture buildFixture() throws Exception {
        String json = """
            {
              \"name\": \"TrainTicket\",
              \"metadata\": [ { \"commitId\": \"commit-from-ir\" } ],
              \"microservices\": [
                {
                  \"name\": \"order-service\",
                  \"controllers\": [
                    {
                      \"name\": \"OrderController\",
                      \"methods\": [
                        {
                          \"httpMethod\": \"POST\",
                          \"url\": \"/orders\",
                          \"methodCalls\": [
                            { \"name\": \"createPayment\", \"url\": \"http://payment-service/pay\" }
                          ]
                        }
                      ]
                    }
                  ],
                  \"services\": [
                    {
                      \"name\": \"OrderService\",
                      \"methods\": [
                        {
                          \"name\": \"placeOrder\",
                          \"methodCalls\": [
                            { \"methodName\": \"reserveInventory\", \"url\": \"http://inventory-service/reserve\" }
                          ]
                        }
                      ]
                    }
                  ],
                  \"feignClients\": [
                    {
                      \"name\": \"PaymentClient\",
                      \"serviceName\": \"payment-service\",
                      \"annotations\": [ { \"name\": \"FeignClient\" } ]
                    }
                  ]
                }
              ]
            }
            """;
        StoredIrPayload payload = new StoredIrPayload(
            "ir-123",
            "TrainTicket",
            new Date(),
            new Date(),
            objectMapper.readTree(json)
        );
        return new JsonFixture(payload);
    }

    private record JsonFixture(StoredIrPayload payload) {
    }

    private static class StubIrService extends IRService {
        private final Optional<StoredIrPayload> byId;
        private final Optional<StoredIrPayload> bySystem;

        private StubIrService(Optional<StoredIrPayload> byId, Optional<StoredIrPayload> bySystem) {
            this.byId = byId;
            this.bySystem = bySystem;
        }

        @Override
        public Optional<StoredIrPayload> getStoredIrById(String id) {
            return byId;
        }

        @Override
        public Optional<StoredIrPayload> getLatestStoredIrBySystemName(String systemName) {
            return bySystem;
        }
    }
}
