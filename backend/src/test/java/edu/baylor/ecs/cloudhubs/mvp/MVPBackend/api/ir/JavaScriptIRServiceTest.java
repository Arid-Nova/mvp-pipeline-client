package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.MicroserviceIRRepository;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.DeltaRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.IRRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.RepoBranch;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.SystemRepository;
import edu.university.ecs.lab.intermediate.create.services.IRExtractionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedConstruction;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.GZIPInputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class JavaScriptIRServiceTest {
    private static final String COMMIT = "a".repeat(40);
    private static final String URL = "https://github.com/example/fixture.git";
    private final ObjectMapper mapper = new ObjectMapper();
    @TempDir Path temporary;

    @Test void realAnalyzerProjectsBackendAndFrontendAndRetainsDiagnosticsWithoutExecutingSource() throws Exception {
        Path backend = Files.createDirectory(temporary.resolve("backend"));
        Path frontend = Files.createDirectory(temporary.resolve("frontend"));
        Files.writeString(backend.resolve("routes.js"), """
                const app = require('express')();
                throw new Error('Target code must never execute');
                app.get('/items/:id', (req, res) => res.json({ ok: true }));
                """);
        Files.writeString(backend.resolve("broken.js"), "const broken = ;");
        Files.writeString(frontend.resolve("client.ts"), "fetch('/items/1');");
        Path manifest = registry(backend, frontend);
        JavaScriptIRService javascript = service(manifest);
        SystemRepository server = request("backend");
        SystemRepository client = request("frontend");
        client.repoBranchPair.repositoryURL = "https://github.com/example/client";
        MicroserviceIRRepository database = mock(MicroserviceIRRepository.class);
        IRService service = new IRService(database, javascript);
        byte[] compressed = service.createAndWrite(input(server, client));
        ObjectNode ir;
        try (GZIPInputStream stream = new GZIPInputStream(new ByteArrayInputStream(compressed))) {
            ir = (ObjectNode) mapper.readTree(stream);
        }
        assertEquals(1, ir.path("microservices").size());
        assertEquals(1, ir.path("orphans").size());
        JsonNode endpoint = ir.path("microservices").get(0).path("controllers").get(0).path("methods").get(0);
        assertEquals("Endpoint", endpoint.path("type").asText());
        assertEquals("GET", endpoint.path("httpMethod").asText());
        assertEquals("/items/{?}", endpoint.path("url").asText());
        assertEquals("cimet-javascript", ir.path("metadata").path("extractor").asText(), "Persistence must preserve extractor metadata");
        assertFalse(ir.path("javascriptExtraction").path("authorizationPolicy").path("supported").asBoolean(true));
        assertEquals("static-javascript-architecture", ir.path("javascriptExtraction").path("architecture").path("analysis").asText());
        assertTrue(ir.path("javascriptExtraction").path("architecture").has("cohesion"));
        assertTrue(ir.path("javascriptExtraction").path("architecture").has("semantics"));
        JsonNode security = ir.path("javascriptExtraction").path("securityAnalysis");
        assertEquals("partial", security.path("status").asText());
        assertEquals("aridnova-express-security", security.path("analyzer").asText());
        assertEquals(1, security.path("components").size(), "Only backend inputs have Express security reports");
        assertEquals(1, security.path("components").get(0).path("endpoints").size());
        JsonNode snapshot = ir.path("javascriptExtraction").path("snapshots").get(0);
        assertEquals(COMMIT, snapshot.path("component").path("commit").asText());
        assertEquals("registered-source-export", snapshot.path("component").path("sourceBinding").asText());
        assertEquals(snapshot.path("security"), security.path("components").get(0), "Saved IR must preserve security evidence");
        assertFalse(snapshot.path("diagnostics").isEmpty());
        assertFalse(snapshot.path("architecture").path("semanticEvidence").path("summary").path("inspectionComplete").asBoolean(true));
        assertFalse(ir.toString().contains("Target code must never execute"));
        assertFalse(ir.toString().contains(temporary.toString().replace("\\", "\\\\")), "Source absolute paths must not leak into IR");
        verify(database).save(any());
    }

    @Test void explicitJavaAndOmittedLanguageUseLegacyJavaExtractorWithoutRequiringManifest() throws Exception {
        JavaScriptIRService javascript = new JavaScriptIRService("vendor/javascript", "node", "", "");
        for (String language : new String[] {null, "java"}) {
            SystemRepository request = request("backend");
            request.language = language;
            try (MockedConstruction<IRExtractionService> legacy = mockConstruction(IRExtractionService.class)) {
                ObjectNode output = new IRService(null, javascript).extractIR(input(request));
                assertEquals(1, legacy.constructed().size());
                verify(legacy.constructed().get(0)).cloneAndScanMultiRepositoryServices(any(), eq(true));
                assertFalse(output.has("javascriptExtraction"));
            }
        }
    }

    @Test void sourceSelectionRejectsUnknownCommitsKindsAndCredentialedUrlsBeforeAnalyzerLaunch() throws Exception {
        Path source = Files.createDirectory(temporary.resolve("source"));
        JavaScriptIRService javascript = service(registry(source, source));
        SystemRepository valid = request("backend");
        javascript.validateSources(List.of(valid));
        valid.commitID = "HEAD";
        assertThrows(IllegalArgumentException.class, () -> javascript.validateSources(List.of(valid)));
        valid.commitID = "b".repeat(40);
        assertThrows(IllegalArgumentException.class, () -> javascript.validateSources(List.of(valid)));
        valid.commitID = COMMIT;
        valid.componentKind = null;
        assertThrows(IllegalArgumentException.class, () -> javascript.validateSources(List.of(valid)));
        valid.componentKind = "backend";
        valid.repoBranchPair.repositoryURL = "https://credential@github.com/example/fixture.git";
        assertThrows(IllegalArgumentException.class, () -> javascript.validateSources(List.of(valid)));
    }

    @Test void malformedAndOversizedManifestsFailBeforeAnalyzerLaunch() throws Exception {
        Path manifest = temporary.resolve("manifest.json");
        Files.writeString(manifest, "not JSON");
        assertThrows(java.io.IOException.class, () -> service(manifest).validateSources(List.of(request("backend"))));
        Files.writeString(manifest, " ".repeat(1024 * 1024 + 1));
        assertThrows(java.io.IOException.class, () -> service(manifest).validateSources(List.of(request("backend"))));
    }

    @Test void javascriptDeltaCannotFallThroughToJavaExtraction() {
        MicroserviceIRRepository database = mock(MicroserviceIRRepository.class);
        DeltaRequestModel delta = new DeltaRequestModel();
        delta.systemRepositories = new SystemRepository[] {request("backend")};
        assertThrows(IllegalArgumentException.class, () -> new DeltaService(database).retrieveDelta(delta));
        verifyNoInteractions(database);
    }

    private JavaScriptIRService service(Path manifest) {
        return new JavaScriptIRService("vendor/javascript", System.getenv().getOrDefault("CIMET_NODE_EXECUTABLE", "node"), manifest.toString(), "");
    }

    private Path registry(Path backend, Path frontend) throws Exception {
        ObjectNode root = mapper.createObjectNode();
        var inputs = root.putArray("inputs");
        inputs.addObject().put("url", URL).put("commit", COMMIT).put("source", backend.toString());
        inputs.addObject().put("url", "https://github.com/example/client.git").put("commit", COMMIT).put("source", frontend.toString());
        Path path = temporary.resolve("manifest.json");
        mapper.writeValue(path.toFile(), root);
        return path;
    }

    private static SystemRepository request(String kind) {
        SystemRepository request = new SystemRepository();
        request.language = "javascript";
        request.componentKind = kind;
        request.componentName = kind;
        request.commitID = COMMIT;
        request.repoBranchPair = new RepoBranch();
        request.repoBranchPair.repositoryURL = URL;
        request.repoBranchPair.branchName = "main";
        return request;
    }

    private static IRRequestModel input(SystemRepository... repositories) {
        IRRequestModel input = new IRRequestModel();
        input.systemName = "fixture-system";
        input.systemRepositories = repositories;
        return input;
    }
}
