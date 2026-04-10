package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.IRRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.IRByNameRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.MicroserviceEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.MicroserviceIRRepository;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.SystemRepository;

import edu.university.ecs.lab.common.config.Config;
import edu.university.ecs.lab.common.config.RepositoryBranchPair;
import edu.university.ecs.lab.common.config.RepositoryConfig;
import edu.university.ecs.lab.common.models.ir.MicroserviceSystem;
import edu.university.ecs.lab.intermediate.create.services.IRExtractionService;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import lombok.extern.log4j.Log4j2;
import lombok.RequiredArgsConstructor;

import org.jetbrains.annotations.NotNull;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.*;

@Log4j2
@Service
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
public class IRService {

    @Autowired
    private MicroserviceIRRepository repository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public JsonNode createAndWrite(IRRequestModel irRequestModel)
            throws Exception {
        // Pre-checking if the IR already exists
        if(irRequestModel.getId() != null)
            return getIRById(irRequestModel.getId());

        // 1. Library generates the base IR
        MicroserviceSystem microserviceSystem = basicCreate(irRequestModel);

        // 2. Convert to a mutable JSON Tree so we can inject custom fields
        JsonNode rootNode = objectMapper.valueToTree(microserviceSystem);

        // 3. Run generic Anti-Pattern Analysis
        enrichWithAntiPatterns(rootNode);

        // 4. Save the IR in DB and return the ID
        ((ObjectNode) rootNode).put("id", saveIR(rootNode));

        return rootNode;
    }

    public String getIRMetaByName(IRByNameRequest irRequestModel) 
            throws IllegalArgumentException {

        String rawSystemName = irRequestModel.getSystemName();

        // 1. Transforming the string into a flexible regex pattern
        String flexiblePattern = buildFlexibleRegex(rawSystemName);

        // 2. Searching based on generic pattern
        if (getIRMetaByName(flexiblePattern)) 
            return "We found IRs for this system!";
        throw new IllegalArgumentException("No microservice system found with name pattern: " + irRequestModel.getSystemName());
    }

    public JsonNode[] getIRsByName(IRByNameRequest irRequestModel) 
            throws IllegalArgumentException {

        String rawSystemName = irRequestModel.getSystemName();

        // 1. Transforming the string into a flexible regex pattern
        String flexiblePattern = buildFlexibleRegex(rawSystemName);

        // 2. Searching based on generic pattern
        JsonNode[] response = getIRsByName(flexiblePattern);
        if (response.length == 0) {
            throw new IllegalArgumentException("No microservice system found with name pattern: " + irRequestModel.getSystemName());
        }

        return response;
    }

    private String buildFlexibleRegex(String input) {
        if (input == null || input.trim().isEmpty()) {
            return "";
        }
        return input.trim().replaceAll("[-_\\s]+", "[-_\\\\s]*");
    }

    private MicroserviceSystem basicCreate(IRRequestModel irRequestModel)
            throws Exception {
        IRExtractionService extractionService = getIrExtractionService(irRequestModel);
        MicroserviceSystem microserviceSystem = new MicroserviceSystem(irRequestModel.systemName,
                new HashSet<>(), new HashSet<>());
        extractionService.cloneAndScanMultiRepositoryServices(microserviceSystem, true);

        return microserviceSystem;
    }

    private void enrichWithAntiPatterns(JsonNode rootNode) {
        if (!rootNode.has("microservices") || !rootNode.get("microservices").isArray()) return;
        ArrayNode microservices = (ArrayNode) rootNode.get("microservices");

        // 1. GOD SERVICE anti-pattern
        for (JsonNode msNode : microservices) {
            ObjectNode ms = (ObjectNode) msNode;
            int controllerCount = ms.has("controllers") ? ms.get("controllers").size() : 0;
            int serviceCount = ms.has("services") ? ms.get("services").size() : 0;

            if ((controllerCount + serviceCount) >= 4) {
                ms.put("antiPattern", "GOD_SERVICE");
            }
        }

        // 2. SHARED DB anti-pattern
        // Map: EntityName -> Set of Microservice Names using it
        Map<String, Set<String>> entityUsage = new HashMap<>();

        for (JsonNode msNode : microservices) {
            String msName = msNode.path("name").asText();
            List<JsonNode> components = new ArrayList<>();
            if (msNode.has("controllers")) msNode.get("controllers").forEach(components::add);
            if (msNode.has("services")) msNode.get("services").forEach(components::add);

            for (JsonNode comp : components) {
                if (comp.has("imports")) {
                    for (JsonNode imp : comp.get("imports")) {
                        String importName = imp.path("name").asText("");
                        String importObj = imp.path("importObject").asText("");
                        if (importName.contains(".entity.")) {
                            entityUsage.computeIfAbsent(importObj, k -> new HashSet<>()).add(msName);
                        }
                    }
                }
            }
        }

        // Apply SHARED_DB tag
        for (JsonNode msNode : microservices) {
            List<JsonNode> components = new ArrayList<>();
            if (msNode.has("controllers")) msNode.get("controllers").forEach(components::add);
            if (msNode.has("services")) msNode.get("services").forEach(components::add);

            for (JsonNode comp : components) {
                if (comp.has("imports")) {
                    for (JsonNode impNode : comp.get("imports")) {
                        ObjectNode imp = (ObjectNode) impNode;
                        String importName = imp.path("name").asText("");
                        String importObj = imp.path("importObject").asText("");
                        if (importName.contains(".entity.") && entityUsage.containsKey(importObj)) {
                            // If used by multiple-services
                            if (entityUsage.get(importObj).size() > 1) {
                                imp.put("antiPattern", "SHARED_DB");
                            }
                        }
                    }
                }
            }
        }

        // 3. CHATTY SERVICE & CYCLIC DEPENDENCY
        // First, map URLs to their home Microservice
        Map<String, String> urlToMs = new HashMap<>();
        for (JsonNode msNode : microservices) {
            String msName = msNode.path("name").asText();
            List<JsonNode> components = new ArrayList<>();
            if (msNode.has("controllers")) msNode.get("controllers").forEach(components::add);
            if (msNode.has("services")) msNode.get("services").forEach(components::add);

            for (JsonNode comp : components) {
                if (comp.has("methods")) {
                    for (JsonNode method : comp.get("methods")) {
                        String url = method.path("url").asText(null);
                        if (url != null && !url.isEmpty()) urlToMs.put(url, msName);

                        // Check default annotations
                        if (method.has("annotations") && method.get("annotations").isArray()) {
                            for (JsonNode ann : method.get("annotations")) {
                                JsonNode attrs = ann.get("attributes");
                                if (attrs != null && attrs.has("default")) {
                                    urlToMs.put(attrs.get("default").asText(), msName);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Detect Cross-MS calls
        Map<String, Set<String>> msCallGraph = new HashMap<>();

        for (JsonNode msNode : microservices) {
            String sourceMs = msNode.path("name").asText();
            msCallGraph.putIfAbsent(sourceMs, new HashSet<>());

            List<JsonNode> components = new ArrayList<>();
            if (msNode.has("controllers")) msNode.get("controllers").forEach(components::add);
            if (msNode.has("services")) msNode.get("services").forEach(components::add);

            for (JsonNode comp : components) {
                if (comp.has("methods")) {
                    for (JsonNode method : comp.get("methods")) {
                        int externalCallCount = 0;
                        if (!method.has("methodCalls")) continue;

                        ArrayNode methodCalls = (ArrayNode) method.get("methodCalls");
                        for (JsonNode callNode : methodCalls) {
                            ObjectNode call = (ObjectNode) callNode;
                            String destUrl = call.path("url").asText(null);
                            String destMs = urlToMs.get(destUrl);

                            if (destMs != null && !destMs.equals(sourceMs)) {
                                externalCallCount++;
                                msCallGraph.get(sourceMs).add(destMs);

                                boolean isCyclic = msCallGraph.containsKey(destMs) && msCallGraph.get(destMs).contains(sourceMs);

                                if (isCyclic) {
                                    call.put("antiPattern", "CYCLIC_DEPENDENCY");
                                } else if (externalCallCount > 1) { // More than 1 external call in a single method
                                    call.put("antiPattern", "CHATTY_SERVICE");
                                }
                            }
                        }
                    }
                }
            }
        }
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

    // Repository operations
    private String saveIR(JsonNode rootNode) {
        Map<String, Object> jsonMap = objectMapper.convertValue(rootNode, new TypeReference<>() {});
        MicroserviceEntity entity = new MicroserviceEntity(jsonMap);

        MicroserviceEntity savedEntity = repository.save(entity);
        return savedEntity.getId();
    }

    private JsonNode getIRById(String id) {
        Optional<MicroserviceEntity> optionalEntity = repository.findById(id);

        if (optionalEntity.isPresent()) {
            MicroserviceEntity entity = optionalEntity.get();
            JsonNode rootNode = objectMapper.valueToTree(entity.getPayload());
            if (rootNode.isObject()) {
                ((ObjectNode) rootNode).put("id", entity.getId());
            }
            return rootNode;
        } else {
            throw new IllegalArgumentException("No microservice system found with ID: " + id);
        }
    }

    private JsonNode[] getIRsByName(String namePattern) {
        Pageable topFiveLatest = PageRequest.of(0, 5, 
            Sort.by(Sort.Direction.DESC, "id"));
        List<MicroserviceEntity> entities = repository.findByPayloadNameMatching(namePattern, topFiveLatest);
    
        return entities.stream()
                .map(entity -> {
                    JsonNode rootNode = objectMapper.valueToTree(entity.getPayload());
                    if (rootNode.isObject()) {
                        ((ObjectNode) rootNode).put("id", entity.getId());
                    }
                    return rootNode;
                })
                .toArray(JsonNode[]::new);
    }

    private boolean getIRMetaByName(String namePattern) {
        return repository.existsByPayloadName(namePattern);
    }
}
