package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PolyglotComponentIntegrationTest {
    @TempDir Path temporary;
    @Test void indexesJavaTypeScriptPythonTogetherWithoutInventingNonJavaSecurity() throws Exception {
        Path source=Files.createDirectory(temporary.resolve("mixed"));
        Files.writeString(source.resolve("ItemsController.java"), """
                package example;
                @RestController
                public class ItemsController {
                    public ItemsController(){ init(); }
                    private void init() { }
                    @GetMapping("/java-items") public String list(){ return "ok"; }
                }
                """);
        Files.writeString(source.resolve("routes.ts"),"import express from 'express';const app=express();throw new Error('SOURCE_MUST_NOT_EXECUTE');app.get('/ts-items',(req:any,res:any)=>res.json({ok:true}));");
        Files.writeString(source.resolve("app.py"),"from flask import Flask\napp=Flask(__name__)\n@app.route('/python-items')\ndef items():\n    return []\n");
        var mapper=new ObjectMapper();var registry=mapper.createObjectNode();
        registry.putArray("inputs").addObject().put("url","https://github.com/example/mixed.git").put("commit","a".repeat(40)).put("source",source.toString());
        Path manifest=temporary.resolve("manifest.json");mapper.writeValue(manifest.toFile(),registry);
        SystemRepository repository=new SystemRepository();repository.setLanguage("auto");repository.setComponentName("mixed");repository.setCommitID("a".repeat(40));
        RepoBranch branch=new RepoBranch();branch.setRepositoryURL("https://github.com/example/mixed.git");branch.setBranchName("main");repository.setRepoBranchPair(branch);
        IRRequestModel request=new IRRequestModel();request.setSystemName("mixed-fixture");request.setSystemRepositories(new SystemRepository[]{repository});
        var sources=new JavaScriptSourceService("vendor/javascript","node",manifest.toString(),"");
        IndexBundle result=new ComponentExtractionService(sources).extract(request);
        assertTrue(result.componentIndex().getMetadata().getLanguages().containsAll(Set.of("java","typescript","python")));
        assertEquals(1,result.componentIndex().getMetadata().getMicroserviceCount());
        assertEquals(result.endpointIndex().getEndpoints().size(),result.endpointIndex().getMetadata().getTotalComponents());
        assertNotNull(result.componentIndex().getJavascriptExtraction());
        assertEquals("unsupported",result.componentIndex().getMetadata().getAnalysisCapabilities().get("authorizationPolicy"));
        assertTrue(result.endpointIndex().getEndpoints().values().stream().anyMatch(endpoint->"/java-items".equals(endpoint.getFullUri())));
        assertTrue(result.endpointIndex().getEndpoints().values().stream().anyMatch(endpoint->"/ts-items".equals(endpoint.getFullUri())));
        assertTrue(result.endpointIndex().getEndpoints().values().stream().anyMatch(endpoint->"/python-items".equals(endpoint.getFullUri())));
        assertTrue(result.endpointIndex().getEndpoints().values().stream().filter(endpoint->endpoint.getSourceEvidence()!=null)
                .allMatch(endpoint->endpoint.getAuthentication()==null && endpoint.getAuthorization()==null));
        assertTrue(result.componentIndex().getComponents().values().stream().filter(IndexedMethod.class::isInstance).map(IndexedMethod.class::cast)
                .anyMatch(method->Boolean.TRUE.equals(method.getIsConstructor())),"Java constructors from the former fork remain indexed");
        assertFalse(mapper.writeValueAsString(result).contains("SOURCE_MUST_NOT_EXECUTE"));
    }
    @Test void malformedSourceRetainsPartialStatusAndDiagnostics() throws Exception {
        Path source=Files.createDirectory(temporary.resolve("malformed"));Files.writeString(source.resolve("broken.ts"),"function { broken");
        IndexBundle result=extract(source,"auto",null);
        assertTrue(result.componentIndex().getComponents().isEmpty());
        assertEquals("partial",result.componentIndex().getMetadata().getStatus());
        assertFalse(result.componentIndex().getMetadata().getDiagnostics().isEmpty());
        assertEquals("partial",result.componentIndex().getMetadata().getAnalysisCapabilities().get("polyglotSourceIndex"));
        assertEquals("partial",result.endpointIndex().getMetadata().getStatus());
    }

    @Test void backendLanguageHintsDoNotExcludeOtherLanguagesFromTheRegisteredRoot() throws Exception {
        Path source=Files.createDirectory(temporary.resolve("hinted-mixed"));
        Files.writeString(source.resolve("app.js"),"const express=require('express');const app=express();throw new Error('SOURCE_MUST_NOT_EXECUTE');app.get('/js-items',(req,res)=>res.json([]));");
        Files.writeString(source.resolve("app.py"),"from flask import Flask\napp=Flask(__name__)\n@app.route('/python-items')\ndef items():\n    return []\n");
        IndexBundle automatic=extract(source,"auto","backend");
        Set<String> languages=Set.of("javascript","python");
        Set<String> routes=Set.of("/js-items","/python-items");
        assertEquals(languages,new HashSet<>(automatic.componentIndex().getMetadata().getLanguages()));
        assertEquals(routes,new HashSet<>(automatic.endpointIndex().getEndpoints().values().stream().map(EndpointInfo::getFullUri).toList()));
        assertEquals(2,automatic.endpointIndex().getEndpoints().size());
        for(String hint:List.of("javascript","typescript")) {
            IndexBundle hinted=extract(source,hint,"backend");
            assertEquals(languages,new HashSet<>(hinted.componentIndex().getMetadata().getLanguages()),hint);
            assertEquals(automatic.componentIndex().getMetadata().getComponentCounts(),hinted.componentIndex().getMetadata().getComponentCounts(),hint);
            assertEquals(automatic.componentIndex().getComponents().keySet(),hinted.componentIndex().getComponents().keySet(),hint);
            assertEquals(automatic.endpointIndex().getEndpoints().keySet(),hinted.endpointIndex().getEndpoints().keySet(),hint);
            assertEquals(routes,new HashSet<>(hinted.endpointIndex().getEndpoints().values().stream().map(EndpointInfo::getFullUri).toList()),hint);
            assertEquals(1,hinted.componentIndex().getMetadata().getMicroserviceCount(),hint);
            assertTrue(hinted.componentIndex().getJavascriptExtraction().path("securityAnalysis").isObject(),hint);
            assertEquals("unsupported",hinted.componentIndex().getMetadata().getAnalysisCapabilities().get("authorizationPolicy"),hint);
        }
    }

    @Test void autoFrontendProducesClientComponentsWithoutABackendService() throws Exception {
        Path source=Files.createDirectory(temporary.resolve("frontend"));Files.writeString(source.resolve("client.ts"),"export const items=()=>fetch('/items');");
        IndexBundle result=extract(source,"auto","frontend");
        assertEquals(0,result.componentIndex().getMetadata().getMicroserviceCount());
        assertFalse(result.componentIndex().getComponents().isEmpty());
        assertTrue(result.endpointIndex().getEndpoints().isEmpty());
        assertTrue(result.componentIndex().getComponents().values().stream().allMatch(component->component.getMicroservice()==null));
        assertTrue(result.componentIndex().getMetadata().getLanguages().contains("typescript"));
    }

    @Test void javascriptHintRetainsOtherLanguageParseFailuresAndPartialCoverage() throws Exception {
        Path source=Files.createDirectory(temporary.resolve("hinted-malformed"));
        Files.writeString(source.resolve("app.js"),"const express=require('express');const app=express();app.get('/js-items',(req,res)=>res.json([]));");
        Files.writeString(source.resolve("broken.py"),"def broken(\n");
        for(String hint:List.of("auto","javascript","typescript")) {
            IndexBundle result=extract(source,hint,"backend");
            assertEquals("partial",result.componentIndex().getMetadata().getStatus(),hint);
            assertEquals("partial",result.endpointIndex().getMetadata().getStatus(),hint);
            assertTrue(result.componentIndex().getMetadata().getLanguages().contains("python"),hint);
            assertFalse(result.componentIndex().getMetadata().getDiagnostics().isEmpty(),hint);
            assertTrue(result.componentIndex().getMetadata().getDiagnostics().stream()
                    .anyMatch(diagnostic->"broken.py".equals(diagnostic.get("file"))),hint);
            assertEquals("partial",result.componentIndex().getMetadata().getAnalysisCapabilities().get("sourceCompleteness"),hint);
            assertTrue(result.endpointIndex().getEndpoints().values().stream().anyMatch(endpoint->"/js-items".equals(endpoint.getFullUri())),hint);
            assertNotNull(result.componentIndex().getJavascriptExtraction(),hint);
        }
    }

    @Test void repeatedPythonRouteDecoratorsAndSecondaryCsharpTypesKeepDistinctIdentities() throws Exception {
        Path source=Files.createDirectory(temporary.resolve("routes"));
        Files.writeString(source.resolve("app.py"),"from flask import Flask\napp=Flask(__name__)\n@app.route('/one')\n@app.route('/two')\ndef users():\n    return []\n");
        Files.writeString(source.resolve("Api.cs"),"class FirstService { public void One(){} } class SecondService { public void Two(){} }");
        IndexBundle result=extract(source,"auto",null);
        assertEquals(2,result.endpointIndex().getEndpoints().size());
        assertEquals(2,result.endpointIndex().getEndpoints().values().stream().map(EndpointInfo::getMethodId).distinct().count());
        assertTrue(result.componentIndex().getMetadata().getLanguages().contains("csharp"));
        assertFalse(result.componentIndex().getMetadata().getLanguages().contains("unknown"));
    }

    @Test void secondaryAndNestedJavaDeclarationsBindTheirOwnPhysicalSourceAndConstructors() throws Exception {
        Path source=Files.createDirectory(temporary.resolve("java-declarations"));
        Files.writeString(source.resolve("CombinedController.java"), """
                package example;
                import java.util.List;
                @RestController public class CombinedController {
                    private List<String> values;
                    public CombinedController(){ initialize(); }
                    private void initialize(){}
                    public void local(){ class SecondaryController { void ignored(){} } }
                    @GetMapping("/primary") public int size(){ return values.size(); }
                    @RestController @PreAuthorize("hasRole('ADMIN')") static class Worker { @Deprecated Worker(){ initialize(); } private void initialize(){} @GetMapping("/nested-a") public ResponseEntity<String> value(){ return ResponseEntity.status(201).body("a"); } }
                }
                @RestController class SecondaryController {
                    public SecondaryController(){ initialize(); }
                    private void initialize(){}
                    @GetMapping("/secondary") public String value(){ return "secondary"; }
                    @RestController @PreAuthorize("hasRole('EDITOR')") static class Worker { @SuppressWarnings("unused") Worker(){ initialize(); } private void initialize(){} @GetMapping("/nested-b") public ResponseEntity<String> value(){ return ResponseEntity.status(202).body("b"); } }
                }
                @Service enum State { READY; public String label(){ return name(); } }
                @Service record Payload(String value) { public String display(){ return value; } }
                @Service interface Reader { String read(); }
                """);
        var mapper=new ObjectMapper();var registry=mapper.createObjectNode();
        registry.putArray("inputs").addObject().put("url","https://github.com/example/declarations.git")
                .put("commit","a".repeat(40)).put("source",source.toString());
        Path manifest=temporary.resolve("declarations-registry.json");mapper.writeValue(manifest.toFile(),registry);
        SystemRepository repository=new SystemRepository();repository.setLanguage("java");repository.setComponentKind("backend");
        repository.setComponentName("declarations");repository.setCommitID("a".repeat(40));
        RepoBranch branch=new RepoBranch();branch.setRepositoryURL("https://github.com/example/declarations.git");branch.setBranchName("main");repository.setRepoBranchPair(branch);
        IRRequestModel request=new IRRequestModel();request.setSystemName("declarations");request.setSystemRepositories(new SystemRepository[]{repository});
        var sources=new JavaScriptSourceService("vendor/javascript","node",manifest.toString(),"");
        var nativeIr=sources.extractNative("declarations",List.of(repository));
        assertEquals(7,nativeIr.getMicroservices().iterator().next().getClasses().size());
        var nativeTypes=nativeIr.getMicroservices().iterator().next().getClasses();
        Map<String,String> nativeIds=new HashMap<>();
        nativeTypes.forEach(type->nativeIds.put(type.getMetadata().getString("declaredType"),type.getID()));
        try {
            CimetModelCompatibility.prepare(nativeIr);
            assertEquals(7,nativeTypes.stream().map(type->type.getID()).distinct().count(),"Source binding must preserve native synthetic declaration identities");
            nativeTypes.forEach(type->assertEquals(nativeIds.get(type.getMetadata().getString("declaredType")),type.getID()));
        } finally { CimetModelCompatibility.clear(); }
        var listCall=nativeIr.getMicroservices().iterator().next().getClasses().stream()
                .filter(type->"CombinedController".equals(type.getName())).flatMap(type->type.getMethods().stream())
                .flatMap(method->method.getMethodCalls().stream()).filter(call->"size".equals(call.getName())).findFirst().orElseThrow();
        assertEquals("List",listCall.getObjectType(),"Existing short objectType consumers remain compatible");
        assertEquals("java.util.List",listCall.getMetadata().getString("qualifiedObjectType"));
        IndexBundle result=new ComponentExtractionService(sources).extract(request);
        assertEquals(Set.of("/primary","/secondary","/nested-a","/nested-b"),
                new HashSet<>(result.endpointIndex().getEndpoints().values().stream().map(EndpointInfo::getFullUri).toList()));
        var methods=result.componentIndex().getComponents().values().stream()
                .filter(IndexedMethod.class::isInstance).map(IndexedMethod.class::cast).toList();
        var constructors=methods.stream().filter(method->Boolean.TRUE.equals(method.getIsConstructor())).toList();
        assertEquals(4,constructors.size());
        assertEquals(4,constructors.stream().map(IndexedMethod::getId).distinct().count());
        for(String owner:List.of("CombinedController.Worker","SecondaryController.Worker")) {
            var constructor=constructors.stream().filter(method->method.getFullID().contains("#example."+owner+"#constructor:")).findFirst().orElseThrow();
            String annotation=owner.startsWith("Combined")?"Deprecated":"SuppressWarnings";
            assertTrue(constructor.getAnnotations().stream().anyMatch(value->annotation.equals(value.getName())),owner);
            var valueMethod=methods.stream().filter(method->method.getFullID().contains("#example."+owner+"#method:value()")).findFirst().orElseThrow();
            String returned=owner.startsWith("Combined")?"a":"b";
            int status=owner.startsWith("Combined")?201:202;
            assertNotNull(valueMethod.getControlFlowGraph());
            assertTrue(valueMethod.getControlFlowGraph().getNodes().stream()
                    .anyMatch(node->("return ResponseEntity.status("+status+").body(\""+returned+"\");").equals(node.getSourceCode())),
                    "CFG must use the owning declaration even when its file contains Java records: "+owner);
            String route=owner.startsWith("Combined")?"/nested-a":"/nested-b";
            String role=owner.startsWith("Combined")?"ADMIN":"EDITOR";
            var endpoint=result.endpointIndex().getEndpoints().values().stream().filter(value->route.equals(value.getFullUri())).findFirst().orElseThrow();
            assertTrue(endpoint.getAuthentication().isRequired(),"Sibling records must not turn protected endpoints into public defaults");
            assertEquals(List.of(role),endpoint.getAuthentication().getRequiredRoles(),"Repeated nested names must use the exact declaring type's security annotations");
            assertTrue(endpoint.getResponseSchema().hasStatusCode(String.valueOf(status)),"Response analysis must reuse the owning Java 21 AST");
            assertFalse(endpoint.getResponseSchema().hasStatusCode(String.valueOf(status==201?202:201)),"A neighboring declaration's response must not leak into this endpoint");
        }
        assertTrue(methods.stream().anyMatch(method->method.getFullID().contains("#example.Payload#method:display()")));
        assertTrue(methods.stream().anyMatch(method->method.getFullID().contains("#example.State#method:label()")));
        assertTrue(methods.stream().anyMatch(method->method.getFullID().contains("#example.Reader#method:read()")));
        assertEquals(4,methods.stream().filter(method->"initialize".equals(method.getName())).count());
        assertFalse(methods.stream().anyMatch(method->"ignored".equals(method.getName())),"Local declarations are outside the engine's named-member scope");
    }

    private IndexBundle extract(Path source,String language,String kind) throws Exception {
        var mapper=new ObjectMapper();var registry=mapper.createObjectNode();
        registry.putArray("inputs").addObject().put("url","https://github.com/example/fixture.git").put("commit","a".repeat(40)).put("source",source.toString());
        Path manifest=temporary.resolve("registry-"+source.getFileName()+".json");mapper.writeValue(manifest.toFile(),registry);
        SystemRepository repository=new SystemRepository();repository.setLanguage(language);repository.setComponentKind(kind);repository.setComponentName("fixture");repository.setCommitID("a".repeat(40));
        RepoBranch branch=new RepoBranch();branch.setRepositoryURL("https://github.com/example/fixture.git");branch.setBranchName("main");repository.setRepoBranchPair(branch);
        IRRequestModel request=new IRRequestModel();request.setSystemName("fixture");request.setSystemRepositories(new SystemRepository[]{repository});
        return new ComponentExtractionService(new JavaScriptSourceService("vendor/javascript","node",manifest.toString(),"")).extract(request);
    }

}
