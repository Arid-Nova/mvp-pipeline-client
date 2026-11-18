package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class IRServiceLanguageDiscoveryTest {
    @TempDir Path temporary;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test void urlSuffixesDoNotBecomeSourceLanguagesAndOldJavaSourcePathsStillWork() throws Exception {
        JsonNode source = mapper.readTree("""
                {"microservices":[{"controllers":[{"type":"JClass","path":"ReportController.java",
                  "methods":[{"type":"Endpoint","path":"/reports/export.js","url":"/reports/export.py",
                    "methodCalls":[{"type":"RestCall","path":"/worker.go","file":"/report.cs"}]}]}]}],
                 "unrelated":{"path":"/view.ts","file":"/module.jsx"}}
                """);
        assertEquals(Set.of("java"), IRService.detectedLanguages(source));
        ((ObjectNode) source).putNull("javascriptExtraction");
        assertEquals(Set.of("java"), IRService.detectedLanguages(source), "A null optional JS report is absent evidence");

        ObjectNode physicalPython = mapper.createObjectNode();
        physicalPython.put("type", "JClass").put("path", "synthetic/Worker.java");
        physicalPython.putObject("metadata").put("sourcePath", "src/worker.py");
        assertEquals(Set.of("python"), IRService.detectedLanguages(physicalPython),
                "The physical source path takes precedence over a synthetic native node identity");

        ObjectNode reports = mapper.createObjectNode();
        reports.putObject("javascriptExtraction").putArray("snapshots").addObject()
                .putArray("files").addObject().put("path", "src/client.ts");
        assertEquals(Set.of("typescript"), IRService.detectedLanguages(reports));
        reports.putObject("metadata").put("language", "auto").putArray("languages").add("polyglot");
        assertEquals(Set.of("typescript"), IRService.detectedLanguages(reports));
    }

    @Test void namedJavascriptAndTypescriptHintsRetainAllBackendLanguagesAndFrontendReports() throws Exception {
        Path backend = Files.createDirectory(temporary.resolve("backend"));
        Path frontend = Files.createDirectory(temporary.resolve("frontend"));
        Files.writeString(backend.resolve("ItemsController.java"), """
                @RestController public class ItemsController {
                    @GetMapping("/java-items") public String items(){return "ok";}
                }
                """);
        Files.writeString(backend.resolve("app.js"), "const app=require('express')();app.get('/js-items',(req,res)=>res.json({ok:true}));");
        Files.writeString(backend.resolve("routes.ts"), "import express from 'express';const app=express();app.get('/ts-items',(req:any,res:any)=>res.json({ok:true}));");
        Files.writeString(backend.resolve("app.py"), "from flask import Flask\napp=Flask(__name__)\n@app.route('/python-items')\ndef items():\n    return []\n");
        Files.writeString(frontend.resolve("client.ts"), "export function items(){return fetch('/js-items');}");
        ObjectNode registry = mapper.createObjectNode();
        registry.putArray("inputs").addObject().put("url", url("backend")).put("commit", "a".repeat(40)).put("source", backend.toString());
        registry.withArray("inputs").addObject().put("url", url("frontend")).put("commit", "b".repeat(40)).put("source", frontend.toString());
        Path manifest = temporary.resolve("sources.json"); mapper.writeValue(manifest.toFile(), registry);
        IRService service = new IRService(null, new JavaScriptIRService("vendor/javascript", "node", manifest.toString(), ""));
        SystemRepository server = source("backend", "a", "auto", "backend");
        SystemRepository client = source("frontend", "b", "typescript", "frontend");
        IRRequestModel request = new IRRequestModel(); request.systemName = "hint-parity";
        request.systemRepositories = new SystemRepository[]{server, client};
        ObjectNode baseline = service.extractIR(request);
        for (String hint : List.of("javascript", "typescript", "js", "ts")) {
            server.language = hint;
            ObjectNode actual = service.extractIR(request);
            assertTrue(new DeltaService(null).compareSnapshots(baseline, actual).path("changes").isEmpty(),
                    hint + " must preserve the same source structure regardless of collection ordering");
            assertEquals(Set.of("java", "javascript", "typescript", "python"), IRService.detectedLanguages(actual));
            assertEquals(1, actual.path("microservices").size());
            for (String route : List.of("/java-items", "/js-items", "/ts-items", "/python-items"))
                assertTrue(actual.path("microservices").toString().contains(route), hint + " must retain " + route);
            assertFalse(actual.path("orphans").isEmpty());
            assertEquals(2, actual.path("javascriptExtraction").path("snapshots").size());
            assertEquals("per-file-registry", actual.path("metadata").path("languagePolicy").asText());
        }
        request.systemRepositories = new SystemRepository[]{client};
        ObjectNode clientOnly = service.extractIR(request);
        assertEquals(0, clientOnly.path("microservices").size());
        assertFalse(clientOnly.path("orphans").isEmpty());
        assertEquals(1, clientOnly.path("javascriptExtraction").path("snapshots").size());
    }

    private static String url(String name) { return "https://github.com/example/" + name + ".git"; }
    private static SystemRepository source(String name, String revision, String language, String kind) {
        SystemRepository source = new SystemRepository(); source.repoBranchPair = new RepoBranch();
        source.repoBranchPair.repositoryURL = url(name); source.repoBranchPair.branchName = "main";
        source.commitID = revision.repeat(40); source.language = language;
        source.componentName = name; source.componentKind = kind; return source;
    }
}
