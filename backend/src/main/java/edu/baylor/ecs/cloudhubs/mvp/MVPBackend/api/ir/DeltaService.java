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
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.IRRequestModel;
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

    @Autowired
    private JavaScriptIRService javaScriptIRService;

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

        if (requestModel == null || requestModel.getId() == null || requestModel.getId().isBlank())
            throw new IllegalArgumentException("A saved base IR ID is required");
        JsonNode saved = getRawIRById(requestModel.getId());
        if ("per-file-registry".equals(saved.path("metadata").path("languagePolicy").asText())
                && !"cimet-javascript".equals(saved.path("metadata").path("extractor").asText())) {
            if (requestModel.comparingRepositories == null || requestModel.comparingRepositories.length == 0)
                throw new IllegalArgumentException("Comparison repositories are required");
            IRRequestModel comparisonRequest = new IRRequestModel();
            comparisonRequest.systemName = requestModel.systemName;
            comparisonRequest.systemRepositories = requestModel.comparingRepositories;
            ObjectNode next = new IRService(null, javaScriptIRService).extractIR(comparisonRequest);
            ObjectNode comparison = compareSnapshots(saved,next);
            comparison.put("baseIrId",requestModel.getId());
            return saveDelta(comparison,requestModel);
        }
        if (saved.has("javascriptExtraction")) {
            requireJavaScriptOnly(requestModel.comparingRepositories);
            JsonNode extraction = saved.path("javascriptExtraction");
            int backendSnapshots = 0;
            for (JsonNode snapshot : extraction.path("snapshots"))
                if ("backend".equals(snapshot.path("component").path("kind").asText())) backendSnapshots++;
            if (saved.path("microservices").size() > backendSnapshots)
                throw new IllegalArgumentException("Compare Java and JavaScript histories separately; the source models have different coverage");
            ObjectNode next = javaScriptIRService.extract(requestModel.systemName, Arrays.asList(requestModel.comparingRepositories));
            ObjectNode comparison = new JavaScriptAnalysisDelta().compare(saved, next);
            comparison.put("baseIrId", requestModel.getId());
            return saveDelta(comparison, requestModel);
        }
        rejectJavaScriptDelta(requestModel.systemRepositories);
        rejectJavaScriptDelta(requestModel.comparingRepositories);

        // 1. Retrieves the base IR using the IR to compare with.
        MicroserviceSystem intermediateSystem = null;
        if(requestModel.getId() != null)
            intermediateSystem = objectMapper.treeToValue(saved, MicroserviceSystem.class);
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

    /** Source-structural comparison; no target application or security proof is executed. */
    ObjectNode compareSnapshots(JsonNode before, JsonNode after) throws IOException {
        MicroserviceSystem base = objectMapper.treeToValue(before,MicroserviceSystem.class);
        MicroserviceSystem next = objectMapper.treeToValue(after,MicroserviceSystem.class);
        MicroserviceSystem.setParentReferencesRecursively(base,null);
        MicroserviceSystem.setParentReferencesRecursively(next,null);
        ObjectNode result = objectMapper.valueToTree(edu.university.ecs.lab.delta.services.SnapshotDeltaService.compare(base,next));
        result.withObject("/metadata").put("analysis","polyglot-structural-snapshot-delta");
        result.withObject("/metadata").put("behavioralEquivalence","unsupported");
        result.withObject("/metadata").set("languages",objectMapper.valueToTree(IRService.detectedLanguages(after)));
        if (before.has("javascriptExtraction") && after.has("javascriptExtraction")) {
            try { result.set("javascriptAnalysisDelta",new JavaScriptAnalysisDelta().compare(before,after)); }
            catch(IOException incompatible) {
                result.putObject("javascriptAnalysisDelta").put("analysis","javascript-system-change").put("status","partial")
                        .put("reason","JavaScript component identities/boundaries changed or report coverage is incompatible; the native structural delta and target snapshot remain available.");
            }
        }
        return result;
    }

    private JsonNode getRawIRById(String id) throws IOException {
        Optional<MicroserviceEntity> optionalEntity = repository.findById(id);

        if (optionalEntity.isPresent()) {
            MicroserviceEntity entity = optionalEntity.get();
            try (GZIPInputStream gzis = new GZIPInputStream(new ByteArrayInputStream(entity.getPayload()))) {
                JsonNode source = objectMapper.readTree(gzis);
                return source;
            }
        } else {
            throw new IllegalArgumentException("No microservice system found with ID: " + id);
        }
    }

    private static void requireJavaScriptOnly(SystemRepository[] repositories) {
        if (repositories == null || repositories.length == 0)
            throw new IllegalArgumentException("Pinned comparison repositories are required");
        for (SystemRepository source : repositories)
            if (source == null || source.language == null || !Set.of("javascript", "typescript").contains(source.language.toLowerCase(Locale.ROOT)))
                throw new IllegalArgumentException("A JavaScript saved IR requires explicit JavaScript comparison repositories");
    }

    private static void rejectJavaScriptDelta(SystemRepository[] repositories) {
        if (repositories == null) return;
        for (SystemRepository repository : repositories) {
            if (repository != null && repository.language != null
                    && !"java".equalsIgnoreCase(repository.language)) {
                throw new IllegalArgumentException("This delta endpoint supports Java repositories only; compare JavaScript snapshots using the JavaScript study workflow");
            }
        }
    }

    private  byte[] saveDelta(JsonNode rootNode, DeltaRequestModel requestModel) throws IOException {
        ObjectNode objectNode = (ObjectNode) rootNode;
        String id = new org.bson.types.ObjectId().toString();
        objectNode.put("id", id);

        ObjectNode metadata = objectNode.withObject("/metadata");
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
