package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.*;
import edu.university.ecs.lab.delta.models.SystemChange;
import edu.university.ecs.lab.delta.services.DeltaExtractionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LegacyDeltaDiscoveryTest {
    @TempDir Path temporary;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test void retrieveLegacyJavaHistoryWithDiscoveryHintsRetainsUnchangedRepositories() throws Exception {
        Path before = javaSource("before", "/old");
        Path after = javaSource("after", "/new");
        Path unchanged = javaSource("unchanged", "/untouched");
        ObjectNode registry = mapper.createObjectNode(); registry.putArray("inputs");
        register(registry, "application", "a", before);
        register(registry, "application", "b", after);
        register(registry, "second", "c", unchanged);
        Path manifest = temporary.resolve("sources.json"); mapper.writeValue(manifest.toFile(), registry);
        JavaScriptIRService sources = new JavaScriptIRService("vendor/javascript", "node", manifest.toString(), "");
        IRRequestModel baseline = new IRRequestModel(); baseline.systemName = "legacy-history";
        baseline.systemRepositories = new SystemRepository[]{source("application", "a", "java"), source("second", "c", "java")};
        ObjectNode saved = new IRService(null, sources).extractIR(baseline);
        removeMetadata(saved);
        assertFalse(saved.path("metadata").has("languagePolicy"));
        DeltaRepository deltas = mock(DeltaRepository.class);
        for (boolean nullAddon : List.of(false, true)) {
            if (nullAddon) saved.putNull("javascriptExtraction");
            DeltaService service = deltaService(database(saved), deltas, sources);
            for (String hint : Arrays.asList(null, "auto", "polyglot")) {
                DeltaRequestModel request = deltaRequest(baseline.systemRepositories);
                SystemRepository comparison = source("application", "b", hint);
                comparison.componentName = null; comparison.componentKind = null;
                request.comparingRepositories = new SystemRepository[]{comparison};
                JsonNode delta = decompress(service.retrieveDelta(request));
                assertEquals("legacy-base", delta.path("baseIrId").asText());
                assertEquals("polyglot-structural-snapshot-delta", delta.path("metadata").path("analysis").asText());
                assertEquals(2, delta.path("targetSnapshot").path("microservices").size());
                assertFalse(delta.path("changes").isEmpty());
                String target = delta.path("targetSnapshot").toString();
                assertTrue(target.contains("/new")); assertFalse(target.contains("\"/old\""));
                assertTrue(target.contains("/untouched"), "Partial comparisons must preserve other base repositories");
                assertFalse(delta.has("javascriptAnalysisDelta"), "A missing or null JS addon must not request JS comparison");
            }
        }
        verify(deltas, times(6)).save(any());

        DeltaService service = deltaService(database(saved), deltas, sources);
        DeltaRequestModel unknown = deltaRequest(baseline.systemRepositories);
        unknown.comparingRepositories = new SystemRepository[]{source("not-in-base", "b", "auto")};
        assertThrows(IllegalArgumentException.class, () -> service.retrieveDelta(unknown));
        verify(deltas, times(6)).save(any());
    }

    @Test void explicitJavaHistoryWithoutARegistryRetainsLegacyRevisionDispatch() throws Exception {
        ObjectNode saved = mapper.createObjectNode(); saved.put("type", "MicroserviceSystem").put("name", "legacy-history");
        saved.putArray("microservices"); saved.putArray("orphans");
        DeltaService service = deltaService(database(saved), mock(DeltaRepository.class), new JavaScriptIRService("vendor/javascript", "node", "", ""));
        DeltaRequestModel request = deltaRequest(new SystemRepository[]{source("application", "a", "java")});
        request.comparingRepositories = new SystemRepository[]{source("application", "b", "java")};
        try (var extraction = mockStatic(DeltaExtractionService.class)) {
            extraction.when(() -> DeltaExtractionService.create(any(), any(edu.university.ecs.lab.common.models.ir.MicroserviceSystem.class), anyMap()))
                    .thenReturn(new SystemChange());
            assertNotNull(decompress(service.retrieveDelta(request)));
            extraction.verify(() -> DeltaExtractionService.create(any(), any(edu.university.ecs.lab.common.models.ir.MicroserviceSystem.class), anyMap()));
        }
    }

    @Test void persistedJavascriptHistoriesRetainSourceReportComparisonsAndFrontendBoundaries() throws Exception {
        Path before = Files.createDirectory(temporary.resolve("js-before"));
        Path after = Files.createDirectory(temporary.resolve("js-after"));
        Path frontend = Files.createDirectory(temporary.resolve("js-frontend"));
        Files.writeString(before.resolve("app.js"), "const app=require('express')();app.get('/old',(req,res)=>res.json({ok:true}));");
        Files.writeString(after.resolve("app.js"), "const app=require('express')();app.get('/new',(req,res)=>res.json({ok:true}));");
        Files.writeString(frontend.resolve("client.ts"), "export function items(){return fetch('/old');}");
        ObjectNode registry = mapper.createObjectNode(); registry.putArray("inputs");
        register(registry, "application", "a", before); register(registry, "application", "b", after);
        register(registry, "client", "c", frontend);
        Path manifest = temporary.resolve("javascript-sources.json"); mapper.writeValue(manifest.toFile(), registry);
        JavaScriptIRService sources = new JavaScriptIRService("vendor/javascript", "node", manifest.toString(), "");
        SystemRepository server = source("application", "a", "javascript");
        SystemRepository client = source("client", "c", "typescript"); client.componentKind = "frontend";
        IRRequestModel baseline = new IRRequestModel(); baseline.systemName = "legacy-history";
        baseline.systemRepositories = new SystemRepository[]{server, client};
        for (boolean legacySourceReport : List.of(true, false)) {
            ObjectNode saved = legacySourceReport ? sources.extract("legacy-history", List.of(server, client))
                    : new IRService(null, sources).extractIR(baseline);
            DeltaRepository deltas = mock(DeltaRepository.class);
            DeltaService service = deltaService(database(saved), deltas, sources);
            DeltaRequestModel request = deltaRequest(baseline.systemRepositories);
            request.comparingRepositories = new SystemRepository[]{source("application", "b", "javascript"), client};
            JsonNode delta = decompress(service.retrieveDelta(request));
            JsonNode sourceDelta = legacySourceReport ? delta : delta.path("javascriptAnalysisDelta");
            assertEquals("javascript-system-change", sourceDelta.path("analysis").asText());
            assertTrue(sourceDelta.toString().contains("/new"));
            if (!legacySourceReport) {
                assertEquals(1, delta.path("targetSnapshot").path("microservices").size());
                assertFalse(delta.path("targetSnapshot").path("orphans").isEmpty());
            }
            verify(deltas).save(any());
        }
    }

    private DeltaService deltaService(MicroserviceIRRepository database, DeltaRepository deltas, JavaScriptIRService sources) {
        DeltaService service = new DeltaService(database);
        ReflectionTestUtils.setField(service, "deltaRepository", deltas);
        ReflectionTestUtils.setField(service, "javaScriptIRService", sources);
        return service;
    }
    private MicroserviceIRRepository database(JsonNode saved) throws Exception {
        MicroserviceIRRepository database = mock(MicroserviceIRRepository.class);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(bytes)) { mapper.writeValue(gzip, saved); }
        when(database.findById("legacy-base")).thenReturn(Optional.of(new MicroserviceEntity("legacy-history", bytes.toByteArray())));
        return database;
    }
    private JsonNode decompress(byte[] value) throws Exception {
        try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(value))) { return mapper.readTree(gzip); }
    }
    private Path javaSource(String name, String route) throws Exception {
        Path directory = Files.createDirectory(temporary.resolve(name));
        Files.writeString(directory.resolve("ItemsController.java"), "@RestController public class ItemsController {@GetMapping(\"" + route + "\") public String items(){return \"ok\";}}");
        return directory;
    }
    private void register(ObjectNode registry, String name, String revision, Path source) {
        registry.withArray("inputs").addObject().put("url", url(name)).put("commit", revision.repeat(40)).put("source", source.toString());
    }
    private void removeMetadata(JsonNode node) {
        if (node.isObject()) { ((ObjectNode) node).remove("metadata"); node.elements().forEachRemaining(this::removeMetadata); }
        else if (node.isArray()) node.forEach(this::removeMetadata);
    }
    private static DeltaRequestModel deltaRequest(SystemRepository[] base) {
        DeltaRequestModel request = new DeltaRequestModel(); request.setId("legacy-base"); request.systemName = "legacy-history";
        request.systemRepositories = base; return request;
    }
    private static String url(String name) { return "https://github.com/example/" + name + ".git"; }
    private static SystemRepository source(String name, String revision, String language) {
        SystemRepository source = new SystemRepository(); source.repoBranchPair = new RepoBranch();
        source.repoBranchPair.repositoryURL = url(name); source.repoBranchPair.branchName = "main";
        source.commitID = revision.repeat(40); source.language = language; source.componentName = name; source.componentKind = "backend";
        return source;
    }
}
