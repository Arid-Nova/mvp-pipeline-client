package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.*;
import java.util.zip.GZIPInputStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import edu.university.ecs.lab.common.models.ir.MicroserviceSystem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.MicroserviceEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.DeltaRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.SystemRepository;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.MicroserviceIRRepository;

import edu.university.ecs.lab.common.config.Config;
import edu.university.ecs.lab.delta.models.SystemChange;
import edu.university.ecs.lab.common.config.RepositoryConfig;
import edu.university.ecs.lab.common.config.RepositoryBranchPair;
import edu.university.ecs.lab.delta.services.DeltaExtractionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;

@Log4j2
@Service
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
public class DeltaService {

    @Autowired
    private MicroserviceIRRepository repository;

    private final ObjectMapper objectMapper;

    public SystemChange retrieveDelta(DeltaRequestModel requestModel)
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
        return DeltaExtractionService.create(config, intermediateSystem, comparingRepositories);
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
}
