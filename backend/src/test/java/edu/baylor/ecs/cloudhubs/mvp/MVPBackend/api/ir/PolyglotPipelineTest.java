package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PolyglotPipelineTest {
    @TempDir Path temporary;
    private final ObjectMapper mapper = new ObjectMapper();
    @Test void oneMixedRepositoryAndSecondRepositoryExtractStaticallyAndCompareAllLanguages() throws Exception {
        Path mixed=Files.createDirectory(temporary.resolve("mixed")), second=Files.createDirectory(temporary.resolve("second"));
        Files.writeString(mixed.resolve("ItemsController.java"), """
                package example; @RestController public class ItemsController {
                    @GetMapping("/java-items") public String list(){return "ok";}
                }
                """);
        Files.writeString(mixed.resolve("routes.ts"), "import express from 'express'; const app=express(); throw new Error('DO_NOT_EXECUTE_TARGET'); app.get('/ts-items', (req:any,res:any)=>res.json({ok:true}));");
        Files.writeString(mixed.resolve("app.py"), "from flask import Flask\napp=Flask(__name__)\n@app.route('/python-items')\ndef items():\n    return []\n");
        Files.writeString(second.resolve("main.go"), "package main\nfunc helper() string { return \"ok\" }\n");
        ObjectNode registry=mapper.createObjectNode();
        registry.putArray("inputs").addObject().put("url","https://github.com/example/mixed.git").put("commit","a".repeat(40)).put("source",mixed.toString());
        registry.withArray("inputs").addObject().put("url","https://github.com/example/second.git").put("commit","b".repeat(40)).put("source",second.toString());
        Path manifest=temporary.resolve("sources.json"); mapper.writeValue(manifest.toFile(),registry);
        JavaScriptIRService sources=new JavaScriptIRService("vendor/javascript","node",manifest.toString(),"");
        IRService service=new IRService(null,sources);
        IRRequestModel request=new IRRequestModel(); request.systemName="polyglot-fixture";
        request.systemRepositories=new SystemRepository[]{repository("mixed","a".repeat(40),null),repository("second","b".repeat(40),"go")};
        ObjectNode before=service.extractIR(request);
        Set<String> languages=new TreeSet<>(); before.path("metadata").path("languages").forEach(language->languages.add(language.asText()));
        assertTrue(languages.containsAll(Set.of("java","typescript","python","go")),languages.toString());
        assertEquals(2,before.path("microservices").size());
        assertTrue(before.has("javascriptExtraction"));
        assertEquals("unsupported",before.path("metadata").path("capabilities").path("authorizationPolicy").asText());
        assertTrue(before.toString().contains("/ts-items")); assertTrue(before.toString().contains("/python-items"));
        assertFalse(before.toString().contains("DO_NOT_EXECUTE_TARGET"));
        assertFalse(before.toString().contains(temporary.toString().replace("\\","\\\\")),"Source absolute paths are not client-visible");
        Files.writeString(mixed.resolve("routes.ts"),"import express from 'express';const app=express();app.get('/ts-added',(req:any,res:any)=>res.json({ok:true}));");
        ObjectNode after=service.extractIR(request);
        ObjectNode delta=new DeltaService(null).compareSnapshots(before,after);
        assertFalse(delta.path("changes").isEmpty()); assertTrue(delta.has("targetSnapshot"));
        assertEquals("polyglot-structural-snapshot-delta",delta.path("metadata").path("analysis").asText());
        assertTrue(delta.has("javascriptAnalysisDelta"));
    }
    @Test void autoFrontendSourcesStayOrphansInMixedAndFrontendOnlyRequests() throws Exception {
        Path backend=Files.createDirectory(temporary.resolve("server")), frontend=Files.createDirectory(temporary.resolve("client"));
        Files.writeString(backend.resolve("ItemsController.java"), """
                @RestController public class ItemsController {
                    @GetMapping("/items") public String items(){return "ok";}
                }
                """);
        Files.writeString(frontend.resolve("client.ts"),"export function items(){return fetch('/items');}");
        ObjectNode registry=mapper.createObjectNode();registry.putArray("inputs")
                .addObject().put("url","https://github.com/example/server.git").put("commit","a".repeat(40)).put("source",backend.toString());
        registry.withArray("inputs").addObject().put("url","https://github.com/example/client.git").put("commit","b".repeat(40)).put("source",frontend.toString());
        Path manifest=temporary.resolve("frontends.json");mapper.writeValue(manifest.toFile(),registry);
        var service=new IRService(null,new JavaScriptIRService("vendor/javascript","node",manifest.toString(),""));
        var server=repository("server","a".repeat(40),"auto");server.componentKind="backend";
        var client=repository("client","b".repeat(40),"auto");client.componentKind="frontend";
        IRRequestModel request=new IRRequestModel();request.systemName="client-server";request.systemRepositories=new SystemRepository[]{server,client};
        ObjectNode mixed=service.extractIR(request);
        assertEquals(1,mixed.path("microservices").size());assertFalse(mixed.path("orphans").isEmpty());
        assertEquals("server",mixed.path("microservices").get(0).path("name").asText());
        request.systemRepositories=new SystemRepository[]{client};
        ObjectNode clients=service.extractIR(request);
        assertEquals(0,clients.path("microservices").size());assertFalse(clients.path("orphans").isEmpty());
    }

    @Test void addedJavascriptRepositoryDoesNotAbortTheStructuralDelta() throws Exception {
        Path first=Files.createDirectory(temporary.resolve("first")),second=Files.createDirectory(temporary.resolve("additional"));
        Files.writeString(first.resolve("app.js"),"const app=require('express')();app.get('/first',(req,res)=>res.json({ok:true}));");
        Files.writeString(second.resolve("app.js"),"const app=require('express')();app.get('/second',(req,res)=>res.json({ok:true}));");
        ObjectNode registry=mapper.createObjectNode();registry.putArray("inputs").addObject().put("url","https://github.com/example/first.git").put("commit","a".repeat(40)).put("source",first.toString());
        registry.withArray("inputs").addObject().put("url","https://github.com/example/additional.git").put("commit","b".repeat(40)).put("source",second.toString());
        Path manifest=temporary.resolve("additions.json");mapper.writeValue(manifest.toFile(),registry);
        var service=new IRService(null,new JavaScriptIRService("vendor/javascript","node",manifest.toString(),""));
        IRRequestModel request=new IRRequestModel();request.systemName="addition";request.systemRepositories=new SystemRepository[]{repository("first","a".repeat(40),"auto")};
        ObjectNode before=service.extractIR(request);
        request.systemRepositories=new SystemRepository[]{repository("first","a".repeat(40),"auto"),repository("additional","b".repeat(40),"auto")};
        ObjectNode delta=new DeltaService(null).compareSnapshots(before,service.extractIR(request));
        assertEquals(2,delta.path("targetSnapshot").path("microservices").size());assertFalse(delta.path("changes").isEmpty());
        assertEquals("partial",delta.path("javascriptAnalysisDelta").path("status").asText());
        assertTrue(delta.path("javascriptAnalysisDelta").path("reason").asText().contains("identities"));
    }

    @Test void unknownLanguageIsRejectedBeforeRepositoryOperations() {
        SystemRepository repository=repository("mixed","a".repeat(40),"rust");
        IRRequestModel request=new IRRequestModel();request.systemName="invalid";request.systemRepositories=new SystemRepository[]{repository};
        assertThrows(IllegalArgumentException.class,()->new IRService(null,new JavaScriptIRService("vendor/javascript","node","","")).extractIR(request));
        for (String language : List.of("auto","polyglot","java","js","ts","python","go","c#")) assertNotNull(RepositoryLanguage.normalize(language));
    }
    private static SystemRepository repository(String name,String commit,String language) {
        SystemRepository source=new SystemRepository();source.language=language;source.commitID=commit;
        source.repoBranchPair=new RepoBranch();source.repoBranchPair.repositoryURL="https://github.com/example/"+name+".git";source.repoBranchPair.branchName="main";
        source.componentName=name;return source;
    }
}
