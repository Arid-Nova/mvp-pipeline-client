package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import edu.university.ecs.lab.common.models.ir.MicroserviceSystem;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.EndpointIndex;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.EndpointIndexingOrchestrator;

public class EndpointIndexer {
    private final EndpointIndexingOrchestrator orchestrator;

    public EndpointIndexer() {
        this.orchestrator = new EndpointIndexingOrchestrator();
    }

    public EndpointIndex indexEndpoints(MicroserviceSystem system, String commitID) {
        if (system == null)
            throw new IllegalArgumentException("MicroserviceSystem cannot be null");

        return orchestrator.indexEndpoints(system, commitID);
    }

}
