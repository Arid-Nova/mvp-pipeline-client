package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.IRRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.SystemRepository;
import edu.university.ecs.lab.common.config.Config;
import edu.university.ecs.lab.common.config.RepositoryBranchPair;
import edu.university.ecs.lab.common.config.RepositoryConfig;
import edu.university.ecs.lab.common.models.ir.MicroserviceSystem;
import edu.university.ecs.lab.intermediate.create.services.IRExtractionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.jetbrains.annotations.NotNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;


import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

@Log4j2
@Service
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
public class IRService {

    public MicroserviceSystem createAndWrite(IRRequestModel irRequestModel)
            throws Exception {
        IRExtractionService extractionService = getIrExtractionService(irRequestModel);
        MicroserviceSystem microserviceSystem = new MicroserviceSystem(irRequestModel.systemName,
                new HashSet<>(), new HashSet<>());

        extractionService.cloneAndScanMultiRepositoryServices(microserviceSystem, true);

        return microserviceSystem;
    }

    private @NotNull IRExtractionService getIrExtractionService(IRRequestModel irRequestModel) throws Exception {
        List<RepositoryConfig> systemRepositories = new ArrayList<>();
        for (SystemRepository repo: irRequestModel.systemRepositories){
            systemRepositories.add(new RepositoryConfig(
                    new RepositoryBranchPair(repo.repoBranchPair.repositoryURL, repo.repoBranchPair.branchName),
                    repo.commitID
            ));
        }
        Config config = new Config(irRequestModel.systemName, systemRepositories);
        return new IRExtractionService(config);
    }
}
