package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.ComponentIndex;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.EndpointIndex;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services.ComponentIndexer;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services.EndpointIndexer;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.component.ComponentEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.component.ComponentRepository;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.endpoint.EndpointEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.endpoint.EndpointRepository;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.IRRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.SystemRepository;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.systemindex.IndexEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.systemindex.IndexRepository;

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
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Optional;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

@Log4j2
@Service
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
public class ComponentService {

    @Autowired
    private IndexRepository indexRepository;

    @Autowired
    private ComponentRepository componentRepository;

    @Autowired
    private EndpointRepository endpointRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Getter
    private static class IndexClass {
        String id;
        EndpointIndex endpointIndex;
        ComponentIndex componentIndex;
    }

    public JsonNode createComponentIndex(IRRequestModel irRequestModel)
            throws Exception {

        // Pre-evaluation of existing results
        if(irRequestModel.getId() != null) {
            return getData(irRequestModel.getId() );
        }

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
        EndpointIndex result_1 = endpointIndexer.indexEndpoints(microserviceSystem, repoList[0].getCommitID());
        result_1.id = saveEndpoints(result_1);
        response.endpointIndex = result_1;

        // Phase 2: Index all components with endpoint resolution and CFG generation
        ComponentIndexer componentIndexer = new ComponentIndexer(config, response.endpointIndex);
        ComponentIndex result_2 = componentIndexer.generateIndex(microserviceSystem, repoList[0].getCommitID());
        result_2.id = saveComponents(result_2);
        response.componentIndex = result_2;

        // Phase 3: Indexing the 2 response pair
        response.id = saveIndex(result_1.id, result_2.id);

        return objectMapper.valueToTree(response);
    }

    // Repository Methods
    private String saveIndex(String componentId, String endpointsId) {
        IndexEntity entity = new IndexEntity(componentId, endpointsId);
        IndexEntity savedEntity = indexRepository.save(entity);
        return savedEntity.getId();
    }

    private JsonNode getData(String id) throws Exception {
        Optional<IndexEntity> optionalEntity = indexRepository.findById(id);

        if (optionalEntity.isPresent()) {
            IndexEntity entity = optionalEntity.get();

            JsonNode componentNode = getComponentById(entity.getComponentId());
            JsonNode endpointNode = getEndpointsById(entity.getEndpointId());

            ObjectNode result = objectMapper.createObjectNode();
            result.set("componentIndex", componentNode);
            result.set("endpointIndex", endpointNode);

            return result;

        } else {
            throw new IllegalArgumentException("Invalid ID: " + id);
        }
    }

    private String saveComponents(ComponentIndex components) throws Exception {
        String jsonString = objectMapper.writeValueAsString(components);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (GZIPOutputStream gzipOut = new GZIPOutputStream(baos)) {
            gzipOut.write(jsonString.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        byte[] compressedData = baos.toByteArray();

        ComponentEntity entity = new ComponentEntity(compressedData);
        ComponentEntity savedEntity = componentRepository.save(entity);

        return savedEntity.getId();
    }

    public JsonNode getComponentById(String id) throws Exception {
        Optional<ComponentEntity> optionalEntity = componentRepository.findById(id);

        if (optionalEntity.isEmpty()) {
            throw new IllegalArgumentException("No components found for ID: " + id);
        }

        ComponentEntity entity = optionalEntity.get();
        byte[] compressedData = entity.getCompressedPayload();

        StringBuilder jsonBuilder = new StringBuilder();
        try (ByteArrayInputStream bais = new ByteArrayInputStream(compressedData);
             GZIPInputStream gzipIn = new GZIPInputStream(bais)) {

            byte[] buffer = new byte[8192]; // Slightly larger buffer for efficiency
            int len;
            while ((len = gzipIn.read(buffer)) != -1) {
                jsonBuilder.append(new String(buffer, 0, len, StandardCharsets.UTF_8));
            }
        }

        String jsonString = jsonBuilder.toString();
        JsonNode response = objectMapper.readTree(jsonString);
        ((ObjectNode) response).put("id", id);

        return response;
    }

    private String saveEndpoints(EndpointIndex endpoints) {
        EndpointEntity entity = new EndpointEntity(endpoints);
        EndpointEntity savedEntity = endpointRepository.save(entity);
        return savedEntity.getId();
    }

    public JsonNode getEndpointsById(String id) {
        Optional<EndpointEntity> optionalEntity = endpointRepository.findById(id);

        if (optionalEntity.isPresent()) {
            EndpointEntity entity = optionalEntity.get();
            JsonNode rootNode = objectMapper.valueToTree(entity.getPayload());
            if (rootNode.isObject()) {
                ((ObjectNode) rootNode).put("id", entity.getId());
            }
            return rootNode;
        } else {
            throw new IllegalArgumentException("No endpoints by ID: " + id);
        }
    }
}
