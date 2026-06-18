package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.*;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import edu.university.ecs.lab.common.models.ir.MicroserviceSystem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.DeltaEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.DeltaRepository;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.MicroserviceEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.SystemRepository;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.DeltaRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.MicroserviceIRRepository;

import edu.university.ecs.lab.common.config.Config;
import edu.university.ecs.lab.delta.models.SystemChange;
import edu.university.ecs.lab.common.config.RepositoryConfig;
import edu.university.ecs.lab.common.config.RepositoryBranchPair;
import edu.university.ecs.lab.delta.services.DeltaExtractionService;

import lombok.extern.log4j.Log4j2;

@Log4j2
@Service
public class DeltaService {

    @Autowired
    private MicroserviceIRRepository repository;

    @Autowired
    private DeltaRepository deltaRepository;

    private final ObjectMapper objectMapper;

    @Autowired
    public DeltaService(MicroserviceIRRepository repository) {
        this.repository = repository;
        this.objectMapper = new ObjectMapper();
        
        this.objectMapper.registerModule(new com.fasterxml.jackson.datatype.jsonorg.JsonOrgModule());
        this.objectMapper.registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule()); 
    
        this.objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    public byte[] retrieveDelta(DeltaRequestModel requestModel)
            throws Exception {

        // 1. Retrieves the base IR using the IR to compare with.
        MicroserviceSystem intermediateSystem = null;
        if(requestModel.getId() != null)
            intermediateSystem = getIRById(requestModel.getId());
        else throw new IllegalArgumentException("ID not found to retrieve IR!");

        // 2. Configuration of the original IR in concern.
        List<RepositoryConfig> systemRepositories = new ArrayList<>();
        for (SystemRepository repo: requestModel.systemRepositories){
            systemRepositories.add(new RepositoryConfig(
                    new RepositoryBranchPair(repo.repoBranchPair.repositoryURL, repo.repoBranchPair.branchName),
                    repo.commitID
            ));
        }
        Config config = new Config(requestModel.systemName, systemRepositories);

        // 3. Comparing commits
        Map<RepositoryConfig, String> comparingRepositories = new HashMap<>();
        for (SystemRepository repo: requestModel.comparingRepositories){
            comparingRepositories.put(new RepositoryConfig(
                    new RepositoryBranchPair(repo.repoBranchPair.repositoryURL, repo.repoBranchPair.branchName),
                    repo.commitID
            ), repo.commitID);
        }

        // 3. Extract the delta between the base IR and the new IR.
        SystemChange result = DeltaExtractionService.create(config, intermediateSystem, comparingRepositories);

        // 4. Saving the delta extraction result in database and returning the byte stream
        return saveDelta(objectMapper.valueToTree(result), requestModel);
    }

    private MicroserviceSystem getIRById(String id) throws IOException {
        Optional<MicroserviceEntity> optionalEntity = repository.findById(id);

        if (optionalEntity.isPresent()) {
            MicroserviceEntity entity = optionalEntity.get();
            try (GZIPInputStream gzis = new GZIPInputStream(new ByteArrayInputStream(entity.getPayload()))) {
                return objectMapper.readValue(gzis, MicroserviceSystem.class);
            }
        } else {
            throw new IllegalArgumentException("No microservice system found with ID: " + id);
        }
    }

    private  byte[] saveDelta(JsonNode rootNode, DeltaRequestModel requestModel) throws IOException {
        ObjectNode objectNode = (ObjectNode) rootNode;
        String id = new org.bson.types.ObjectId().toString();
        objectNode.put("id", id);

        ObjectNode metadata = objectNode.putObject("metadata");
        metadata.put("createDate", new Date().toString());
        metadata.put("modifyDate", new Date().toString());

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (GZIPOutputStream gzos = new GZIPOutputStream(baos)) {
            objectMapper.writeValue(gzos, objectNode);
        }
        byte[] compressedData = baos.toByteArray();

        DeltaEntity entity = new DeltaEntity(
            requestModel.getSystemName(), compressedData,
            Arrays.asList(requestModel.getSystemRepositories()),
            Arrays.asList(requestModel.getComparingRepositories())
        );
        entity.setId(id);
        deltaRepository.save(entity);

        return compressedData;
    }
}
