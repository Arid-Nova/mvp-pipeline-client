package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceScope;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.MissingEvidence;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.graph.GraphService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.graph.GraphModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.node.Link;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.node.Node;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.node.Request;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.patterns.Bottleneck;
import org.junit.jupiter.api.Test;

import java.util.Date;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class GraphContextProviderTest {

    @Test
    void directDependencyQueryReturnsExplicitOutgoingLinks() {
        GraphContextProvider provider = new GraphContextProvider(new StubGraphService(fixtureGraph()));
        EvidenceRetrievalResult result = provider.collectEvidence(context("train-ticket", "order-service"), "what does order-service call?");

        assertThat(result.getMissingEvidence()).isEmpty();
        assertThat(result.getEvidenceItems())
            .anyMatch(item -> "DIRECT_DEPENDENCY".equals(item.getEntityType())
                && "order-service".equals(item.getServiceName())
                && "payment-service".equals(item.getEndpointPath())
                && item.getLocationHint().contains("directDependencies"));
    }

    @Test
    void reverseDependencyQueryReturnsIncomingLinks() {
        GraphContextProvider provider = new GraphContextProvider(new StubGraphService(fixtureGraph()));
        EvidenceRetrievalResult result = provider.collectEvidence(context("train-ticket", "payment-service"), "what depends on payment-service?");

        assertThat(result.getEvidenceItems())
            .anyMatch(item -> "REVERSE_DEPENDENCY".equals(item.getEntityType())
                && "order-service".equals(item.getServiceName())
                && "payment-service".equals(item.getEndpointPath())
                && item.getLocationHint().contains("reverseDependencies"));
    }

    @Test
    void transitivePathQueryReturnsInferredPathsAndIsCycleSafe() {
        GraphContextProvider provider = new GraphContextProvider(new StubGraphService(fixtureGraph()));
        EvidenceRetrievalResult result = provider.collectEvidence(context("train-ticket", "order-service"), "show transitive dependencies for order-service");

        List<EvidenceItem> transitive = result.getEvidenceItems().stream()
            .filter(item -> "TRANSITIVE_PATH".equals(item.getEntityType()))
            .toList();

        assertThat(transitive).isNotEmpty();
        assertThat(transitive)
            .anyMatch(item -> item.getContentText().contains("order-service -> payment-service -> inventory-service"));
        assertThat(transitive)
            .allMatch(item -> item.getStructuredPayload().path("inferred").asBoolean());
        assertThat(transitive)
            .allMatch(item -> item.getStructuredPayload().path("path").size() <= 4);
    }

    @Test
    void unknownServiceReturnsMissingEvidence() {
        GraphContextProvider provider = new GraphContextProvider(new StubGraphService(fixtureGraph()));
        EvidenceRetrievalResult result = provider.collectEvidence(context("train-ticket", "unknown-service"), "what depends on unknown-service?");

        assertThat(result.getEvidenceItems())
            .noneMatch(item -> "DIRECT_DEPENDENCY".equals(item.getEntityType()) || "REVERSE_DEPENDENCY".equals(item.getEntityType()));
        assertThat(result.getMissingEvidence())
            .extracting(MissingEvidence::getExpectedIdentifier)
            .contains("unknown-service");
    }

    @Test
    void includesGraphNodesLinksAndAntiPatternMetadata() {
        GraphContextProvider provider = new GraphContextProvider(new StubGraphService(fixtureGraph()));
        EvidenceRetrievalResult result = provider.collectEvidence(context("train-ticket", "order-service"), "dependency map");

        assertThat(result.getEvidenceItems())
            .anyMatch(item -> item.getArtifactType() == EvidenceArtifactType.GRAPH
                && "GRAPH_NODE".equals(item.getEntityType())
                && item.getLocationHint().contains("nodes[order-service]")
                && item.getStructuredPayload().path("antiPatterns").toString().contains("Bottleneck"));

        assertThat(result.getEvidenceItems())
            .anyMatch(item -> item.getArtifactType() == EvidenceArtifactType.ARCHITECTURE
                && "ANTI_PATTERN".equals(item.getEntityType())
                && "Bottleneck".equals(item.getEntityName())
                && item.getLocationHint().contains("nodes[order-service].patterns"));

        assertThat(result.getEvidenceItems())
            .anyMatch(item -> item.getArtifactType() == EvidenceArtifactType.DEPENDENCY
                && "GRAPH_LINK".equals(item.getEntityType())
                && item.getLocationHint().contains("links[order-service->payment-service]")
                && "POST".equals(item.getHttpMethod())
                && item.getStructuredPayload().path("weight").asInt() == 1);
    }

    private EvidenceQueryContext context(String systemName, String serviceName) {
        ChatbotContext chatbotContext = new ChatbotContext(systemName, null, null, null, null, serviceName, null, null);
        EvidenceScope scope = new EvidenceScope(systemName, null, null, null, null, null, null, serviceName, null, null, null);
        return new EvidenceQueryContext("q", chatbotContext, scope, List.of(), "conv-1", false);
    }

    private GraphModel fixtureGraph() {
        Node order = new Node("order-service", "SERVICE");
        order.setPatterns(Set.of(new Bottleneck(3)));
        Node payment = new Node("payment-service", "SERVICE");
        Node inventory = new Node("inventory-service", "SERVICE");
        Node paymentEndpoint = new Node("POST /payments", "ENDPOINT");

        Link orderToPayment = new Link("order-service", "payment-service", List.of(new Request("POST", "paymentReq", "Payment", "createPayment")), null);
        Link paymentToInventory = new Link("payment-service", "inventory-service", List.of(new Request("GET", "inventoryId", "Inventory", "loadInventory")), null);
        Link inventoryToOrder = new Link("inventory-service", "order-service", List.of(new Request("PATCH", "orderId", "Order", "updateOrder")), null);
        Link orderToEndpoint = new Link("order-service", "POST /payments", List.of(new Request("POST", "paymentReq", "Payment", "paymentsEndpoint")), null);

        GraphModel model = GraphModel.builder()
            .instanceId(7L)
            .graphName("train-ticket")
            .nodes(Set.of(order, payment, inventory, paymentEndpoint))
            .links(Set.of(orderToPayment, paymentToInventory, inventoryToOrder, orderToEndpoint))
            .build();
        model.setModifyDate(new Date());
        return model;
    }

    private static class StubGraphService extends GraphService {
        private final GraphModel model;

        StubGraphService(GraphModel model) {
            super(null);
            this.model = model;
        }

        @Override
        public List<GraphModel> getAllInstancesOfGraph(String graphName) {
            if (!"train-ticket".equals(graphName)) {
                return List.of();
            }
            return List.of(model);
        }
    }
}
