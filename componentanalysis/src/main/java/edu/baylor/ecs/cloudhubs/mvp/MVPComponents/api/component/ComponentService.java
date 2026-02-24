package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.ComponentIndex;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.EndpointIndex;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services.ComponentIndexer;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services.EndpointIndexer;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.IRRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.SystemRepository;

import edu.university.ecs.lab.common.config.Config;
import edu.university.ecs.lab.common.models.ir.MicroserviceSystem;
import edu.university.ecs.lab.intermediate.create.services.IRExtractionService;

import lombok.Getter;
import lombok.extern.log4j.Log4j2;
import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Log4j2
@Service
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
public class ComponentService {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Getter
    private static class IndexClass {
        EndpointIndex endpointIndex;
        ComponentIndex componentIndex;
    }

    public JsonNode createComponentIndex(IRRequestModel irRequestModel)
            throws Exception {

        // Unfortunately, the current version is mono-repo for this analysis.
        SystemRepository[] repoList = irRequestModel.getSystemRepositories();

        Config config = new Config(
                irRequestModel.getSystemName(),
                repoList[0].getRepoBranchPair().getRepositoryURL(),
                repoList[0].getRepoBranchPair().getBranchName());
        config.setDefaultRolePriority(irRequestModel.getDefaultRolePriority());
        config.setRolePriority(irRequestModel.getRolePriority());

        // 1. Library generates the base IR
        MicroserviceSystem microserviceSystem = IRExtractionService.create(config, repoList[0].getCommitID());

        // A quick configuration mapping
        IndexClass response = new IndexClass();

        // Phase 1: Index all REST API endpoints
        EndpointIndexer endpointIndexer = new EndpointIndexer();
        response.endpointIndex = endpointIndexer.indexEndpoints(microserviceSystem, repoList[0].getCommitID());

        // Phase 2-3: Index all components with endpoint resolution and CFG generation
        ComponentIndexer componentIndexer = new ComponentIndexer(config, response.endpointIndex);
        response.componentIndex = componentIndexer.generateIndex(microserviceSystem, repoList[0].getCommitID());

        return objectMapper.valueToTree(response);
    }
}
