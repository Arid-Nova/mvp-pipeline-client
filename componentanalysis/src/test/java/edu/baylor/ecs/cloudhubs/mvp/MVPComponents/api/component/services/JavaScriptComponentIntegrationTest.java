package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.*;
import edu.university.ecs.lab.javascript.JavaScriptExtractionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class JavaScriptComponentIntegrationTest {
    @TempDir Path directory;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test void actualParserPreservesDistinctRouteRegistrationsAndUnknownSecurity() throws Exception {
        Files.writeString(directory.resolve("app.js"), """
                const express = require('express');
                const app = express();
                function first(req, res) { res.json({id: req.params.id}); }
                function second(req, res) { res.json({ok: true}); }
                app.get('/users/:id', first);
                app.get('/users/:id', second);
                """);
        ObjectNode snapshot = new JavaScriptExtractionService(Path.of("vendor/javascript"))
                .extract(directory, "backend", "test-backend");
        var indexes = new JavaScriptComponentIndexer().index("fixture", List.of(snapshot));
        assertEquals(2, indexes.endpointIndex().getEndpoints().size());
        assertEquals(1, indexes.endpointIndex().getEndpoints().values().stream().map(endpoint -> endpoint.getEndpointId()).distinct().count());
        for (var endpoint : indexes.endpointIndex().getEndpoints().values()) {
            assertNull(endpoint.getAuthentication());
            assertNull(endpoint.getAuthorization());
            assertNull(endpoint.getControllerClass());
            assertEquals("unsupported", endpoint.getSecurityAnalysisStatus());
            assertNotNull(endpoint.getMethodId());
            assertTrue(indexes.componentIndex().getComponents().containsKey(endpoint.getMethodId()));
        }
        assertTrue(indexes.componentIndex().getRoles().isEmpty());
        assertEquals("unsupported", indexes.componentIndex().getMetadata().getAnalysisCapabilities().get("authorization"));
        assertTrue(indexes.componentIndex().getComponents().values().stream().allMatch(component -> component.getType().startsWith("JS")));
        assertTrue(indexes.componentIndex().getJavascriptExtraction().path("architecture").isObject());
    }

    @Test void unknownRouteRemainsNullAndFrontendIsNotBackend() throws Exception {
        Files.writeString(directory.resolve("app.js"), "const express=require('express');const app=express();app.get(dynamicPath,(req,res)=>res.json({ok:true}));");
        var analyzer = new JavaScriptExtractionService(Path.of("vendor/javascript"));
        var backend = analyzer.extract(directory, "backend", "dynamic");
        var indexes = new JavaScriptComponentIndexer().index("dynamic", List.of(backend));
        assertEquals(1, indexes.endpointIndex().getEndpoints().size());
        var endpoint = indexes.endpointIndex().getEndpoints().values().iterator().next();
        assertNull(endpoint.getFullUri());
        assertNull(endpoint.getSimplifiedUri());
        assertNull(endpoint.getEndpointId());
        Files.writeString(directory.resolve("app.js"), "export async function load() {return fetch('/users');}");
        var frontend = new JavaScriptComponentIndexer().index("client", List.of(analyzer.extract(directory, "frontend", "client")));
        assertEquals(0, frontend.componentIndex().getMetadata().getMicroserviceCount());
        assertTrue(frontend.endpointIndex().getEndpoints().isEmpty());
        assertTrue(frontend.componentIndex().getComponents().values().stream().allMatch(component -> component.getMicroservice() == null));
    }

    @Test void productionServiceRequiresPinnedRegisteredSourceAndRejectsUnknownLanguage() throws Exception {
        Files.writeString(directory.resolve("app.js"), "const express=require('express');const app=express();app.get('/ok',(req,res)=>res.json({ok:true}));");
        String sha = "a".repeat(40);
        Path manifest = directory.resolve("manifest.json");
        ObjectNode registry = mapper.createObjectNode();
        registry.putArray("inputs").addObject().put("url", "https://github.com/example/source.git")
                .put("commit", sha).put("source", directory.toAbsolutePath().toString())
                .putObject("analysisProfile").put("entrypoint", "app.js");
        mapper.writeValue(manifest.toFile(), registry);
        IRRequestModel request = mapper.readValue("""
                {"systemName":"fixture","systemRepositories":[{"language":"javascript","componentKind":"backend",
                "repoBranchPair":{"repositoryURL":"https://github.com/example/source.git","branchName":"main"},"commitID":"%s"}]}
                """.formatted(sha), IRRequestModel.class);
        var service = new ComponentExtractionService(new JavaScriptSourceService("vendor/javascript", "node", manifest.toString(), ""));
        var result = service.extract(request);
        assertEquals(1, result.endpointIndex().getEndpoints().size());
        var endpoint = result.endpointIndex().getEndpoints().values().iterator().next();
        assertEquals("complete", endpoint.getSecurityAnalysisStatus());
        assertTrue(endpoint.getSourceEvidence().has("security"));
        assertEquals("complete", endpoint.getSourceEvidence().path("security").path("policyModel").path("status").asText());
        assertNull(endpoint.getAuthorization(), "Complete scoped Express evidence must not become a Java permission model");
        assertEquals("complete", result.componentIndex().getMetadata().getAnalysisCapabilities().get("expressSecurity"));
        assertEquals("unsupported", result.componentIndex().getMetadata().getAnalysisCapabilities().get("authorization"));
        request.systemRepositories[0].commitID = "b".repeat(40);
        assertThrows(IllegalArgumentException.class, () -> service.extract(request));
        request.systemRepositories[0].language = "python";
        assertThrows(IllegalArgumentException.class, () -> service.extract(request));
    }
}
