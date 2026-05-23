package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.IRRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.IRByNameRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.MicroserviceEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.MicroserviceIRRepository;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.SystemRepository;

import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;

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
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

@Log4j2
@Service
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
public class IRService {

    @Autowired
    private MicroserviceIRRepository repository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public byte[] createAndWrite(IRRequestModel irRequestModel)
            throws Exception {
        if (irRequestModel.getId() != null) {
            return getIRById(irRequestModel.getId());
        }

        MicroserviceSystem microserviceSystem = basicCreate(irRequestModel);
        JsonNode rootNode = objectMapper.valueToTree(microserviceSystem);
        enrichWithAntiPatterns(rootNode);

        String id = saveIR(rootNode);
        return getIRById(id);
    }

    public String getIRMetaByName(IRByNameRequest irRequestModel)
            throws IllegalArgumentException {

        String rawSystemName = irRequestModel.getSystemName();
        String flexiblePattern = buildFlexibleRegex(rawSystemName);

        if (getIRMetaByName(flexiblePattern)) {
            return "We found IRs for this system!";
        }
        throw new IllegalArgumentException("No microservice system found with name pattern: " + irRequestModel.getSystemName());
    }

    public byte[] getIRsByName(IRByNameRequest irRequestModel)
            throws IllegalArgumentException, Exception {
        String flexiblePattern = buildFlexibleRegex(irRequestModel.getSystemName());
        return getIRsByName(flexiblePattern);
    }

    public Optional<StoredIrPayload> getStoredIrById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        return repository.findById(id.trim())
            .map(entity -> new StoredIrPayload(
                entity.getId(),
                entity.getSystemName(),
                entity.getCreateDate(),
                entity.getModifyDate(),
                readPayload(entity)
            ));
    }

    public Optional<StoredIrPayload> getLatestStoredIrBySystemName(String systemName) {
        if (systemName == null || systemName.isBlank()) {
            return Optional.empty();
        }

        Pageable latestOnly = PageRequest.of(0, 1, Sort.by(Sort.Direction.DESC, "modifyDate"));
        List<MicroserviceEntity> entities = repository.findByPayloadNameMatching(buildFlexibleRegex(systemName), latestOnly);
        if (entities.isEmpty()) {
            return Optional.empty();
        }

        MicroserviceEntity entity = entities.get(0);
        return Optional.of(new StoredIrPayload(
            entity.getId(),
            entity.getSystemName(),
            entity.getCreateDate(),
            entity.getModifyDate(),
            readPayload(entity)
        ));
    }

    private String buildFlexibleRegex(String input) {
        if (input == null || input.trim().isEmpty()) {
            return "";
        }
        return input.trim().replaceAll("[-_\\s]+", "[-_\\\\s]*");
    }

    private MicroserviceSystem basicCreate(IRRequestModel irRequestModel)
            throws Exception {
        StaticJavaParser.setConfiguration(
                new ParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_21));

        try {
            java.lang.reflect.Field cuField = Class
                    .forName("edu.university.ecs.lab.common.utils.SourceToObjectUtils")
                    .getDeclaredField("cu");
            cuField.setAccessible(true);
            cuField.set(null, new CompilationUnit());
        } catch (Exception e) {
            log.warn("Could not pre-initialize SourceToObjectUtils.cu - parse failures may still cause errors: {}", e.getMessage());
        }

        IRExtractionService extractionService = getIrExtractionService(irRequestModel);
        MicroserviceSystem microserviceSystem = new MicroserviceSystem(irRequestModel.systemName,
                new HashSet<>(), new HashSet<>());
        extractionService.cloneAndScanMultiRepositoryServices(microserviceSystem, true);

        return microserviceSystem;
    }

    private void enrichWithAntiPatterns(JsonNode rootNode) {
        if (!rootNode.has("microservices") || !rootNode.get("microservices").isArray()) return;
        ArrayNode microservices = (ArrayNode) rootNode.get("microservices");

        for (JsonNode msNode : microservices) {
            ObjectNode ms = (ObjectNode) msNode;
            int controllerCount = ms.has("controllers") ? ms.get("controllers").size() : 0;
            int serviceCount = ms.has("services") ? ms.get("services").size() : 0;

            if ((controllerCount + serviceCount) >= 4) {
                ms.put("antiPattern", "GOD_SERVICE");
            }
        }

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
                            if (entityUsage.get(importObj).size() > 1) {
                                imp.put("antiPattern", "SHARED_DB");
                            }
                        }
                    }
                }
            }
        }

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
                                } else if (externalCallCount > 1) {
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
        for (SystemRepository repo : irRequestModel.systemRepositories) {
            systemRepositories.add(new RepositoryConfig(
                    new RepositoryBranchPair(repo.repoBranchPair.repositoryURL, repo.repoBranchPair.branchName),
                    repo.commitID
            ));
        }
        Config config = new Config(irRequestModel.systemName, systemRepositories);
        return new IRExtractionService(config);
    }

    private String saveIR(JsonNode rootNode) {
        try {
            String systemName = rootNode.path("name").asText("");
            Date now = new Date();
            byte[] compressedPayload = compress(objectMapper.writeValueAsString(rootNode));

            int maxSafeBytes = 15 * 1024 * 1024;
            if (compressedPayload.length > maxSafeBytes) {
                throw new IllegalArgumentException(
                        "Generated IR is too large to store safely. Try narrowing repository scope or fewer services.");
            }

            MicroserviceEntity entity = new MicroserviceEntity(
                    systemName,
                    null,
                    compressedPayload,
                    now,
                    now
            );

            MicroserviceEntity savedEntity = repository.save(entity);
            return savedEntity.getId();
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Failed to persist generated IR payload.", ex);
        }
    }

    private byte[] getIRById(String id) {
        Optional<MicroserviceEntity> optionalEntity = repository.findById(id);

        if (optionalEntity.isPresent()) {
            MicroserviceEntity entity = optionalEntity.get();
            JsonNode rootNode = readPayload(entity);
            if (rootNode.isObject()) {
                ((ObjectNode) rootNode).put("id", entity.getId());
            }
            try {
                return compress(objectMapper.writeValueAsString(rootNode));
            } catch (Exception ex) {
                throw new IllegalArgumentException("Failed to serialize IR payload for id: " + id, ex);
            }
        }
        throw new IllegalArgumentException("No microservice system found with ID: " + id);
    }

    private byte[] getIRsByName(String namePattern) throws Exception {
        Pageable topFiveLatest = PageRequest.of(0, 5,
                Sort.by(Sort.Direction.DESC, "modifyDate"));
        List<MicroserviceEntity> entities = repository.findByPayloadNameMatching(namePattern, topFiveLatest);
        if (entities.isEmpty()) {
            throw new IllegalArgumentException("No systems found with name!");
        }

        // Reverse to return oldest -> newest for timeline rendering.
        Collections.reverse(entities);
        ArrayNode resultArray = objectMapper.createArrayNode();
        for (MicroserviceEntity entity : entities) {
            JsonNode rootNode = readPayload(entity);
            if (rootNode.isObject()) {
                ((ObjectNode) rootNode).put("id", entity.getId());
            }
            resultArray.add(rootNode);
        }

        return compress(objectMapper.writeValueAsString(resultArray));
    }

    private boolean getIRMetaByName(String namePattern) {
        return repository.existsByPayloadName(namePattern);
    }

    private JsonNode readPayload(MicroserviceEntity entity) {
        try {
            if (entity.getPayloadCompressed() != null && entity.getPayloadCompressed().length > 0) {
                String json = decompress(entity.getPayloadCompressed());
                return objectMapper.readTree(json);
            }
            if (entity.getPayload() != null) {
                return objectMapper.valueToTree(entity.getPayload());
            }
            throw new IllegalArgumentException("IR payload is missing for id: " + entity.getId());
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Failed to deserialize stored IR payload for id: " + entity.getId(), ex);
        }
    }

    private byte[] compress(String input) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(baos)) {
            gzip.write(input.getBytes(StandardCharsets.UTF_8));
        }
        return baos.toByteArray();
    }

    private String decompress(byte[] input) throws Exception {
        ByteArrayInputStream bais = new ByteArrayInputStream(input);
        try (GZIPInputStream gzip = new GZIPInputStream(bais)) {
            return new String(gzip.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
