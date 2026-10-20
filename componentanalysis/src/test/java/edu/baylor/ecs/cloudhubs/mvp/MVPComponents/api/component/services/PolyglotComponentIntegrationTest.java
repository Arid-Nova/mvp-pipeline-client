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

    @Test void autoFrontendProducesClientComponentsWithoutABackendService() throws Exception {
        Path source=Files.createDirectory(temporary.resolve("frontend"));Files.writeString(source.resolve("client.ts"),"export const items=()=>fetch('/items');");
        IndexBundle result=extract(source,"auto","frontend");
        assertEquals(0,result.componentIndex().getMetadata().getMicroserviceCount());
        assertFalse(result.componentIndex().getComponents().isEmpty());
        assertTrue(result.endpointIndex().getEndpoints().isEmpty());
        assertTrue(result.componentIndex().getComponents().values().stream().allMatch(component->component.getMicroservice()==null));
        assertTrue(result.componentIndex().getMetadata().getLanguages().contains("typescript"));
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
