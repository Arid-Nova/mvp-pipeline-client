package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
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

    @Autowired
    private edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services.ComponentExtractionService extractionService;

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
            return getData(irRequestModel.getId());
        }

        var indexes = extractionService.extract(irRequestModel);
        EndpointIndex result_1 = indexes.endpointIndex();
        ComponentIndex result_2 = indexes.componentIndex();
        String endpointId = saveEndpoints(result_1);
        String componentId = saveComponents(result_2);
        // Phase 3: Indexing the 2 response pair
        String masterId = saveIndex(componentId, endpointId);

        // Phase 4: Constructing the response
        ObjectNode finalResponse = objectMapper.createObjectNode();
        finalResponse.put("id", masterId);
        finalResponse.set("analysisCapabilities", objectMapper.valueToTree(result_2.getMetadata().getAnalysisCapabilities()));
        finalResponse.put("endpointIndex", getEndpointsById(endpointId)); 
        finalResponse.put("componentIndex", getComponentById(componentId)); 

        return finalResponse;
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

            byte[] componentNode = getComponentById(entity.getComponentId());
            byte[] endpointNode = getEndpointsById(entity.getEndpointId());

            ObjectNode result = objectMapper.createObjectNode();

            result.put("componentIndex", componentNode);
            result.put("endpointIndex", endpointNode);
            result.put("id", id);
            try (GZIPInputStream input = new GZIPInputStream(new ByteArrayInputStream(componentNode))) {
                JsonNode savedIndex = objectMapper.readTree(input);
                result.set("analysisCapabilities", savedIndex.path("metadata").path("analysisCapabilities"));
            }

            return result;
        } else {
            throw new IllegalArgumentException("Invalid ID: " + id);
        }
    }
    
    // Handling components
    private String saveComponents(ComponentIndex components) throws IOException  {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();

        try (GZIPOutputStream gzipOut = new GZIPOutputStream(baos)) {
            objectMapper.writeValue(gzipOut, components);
        }
        
        byte[] compressedData = baos.toByteArray();
        ComponentEntity entity = new ComponentEntity(compressedData);
        return componentRepository.save(entity).getId();
    }

    public byte[] getComponentById(String id) {
        return componentRepository.findById(id)
            .map(ComponentEntity::getCompressedPayload)
            .orElseThrow(() -> new IllegalArgumentException("No components found for ID: " + id));
    }

    // Handling endpoints
    private String saveEndpoints(EndpointIndex endpoints) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();

        try (GZIPOutputStream gzipOut = new GZIPOutputStream(baos)) {
            objectMapper.writeValue(gzipOut, endpoints);
        }
        
        byte[] compressedData = baos.toByteArray();
        EndpointEntity entity = new EndpointEntity(compressedData);
        return endpointRepository.save(entity).getId();
    }

    public byte[] getEndpointsById(String id) {
        return endpointRepository.findById(id)
            .map(EndpointEntity::getPayload)
            .orElseThrow(() -> new IllegalArgumentException("No endpoints by ID: " + id));
    }
}
