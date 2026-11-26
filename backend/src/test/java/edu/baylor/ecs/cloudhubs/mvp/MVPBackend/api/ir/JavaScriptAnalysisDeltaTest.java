package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.*;
import java.nio.file.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class JavaScriptAnalysisDeltaTest {
    @TempDir Path temporary;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test void comparesActualExtractedContractsArchitectureAndSecurityAndRejectsMismatchedRepositories() throws Exception {
        ObjectNode before = extract("a", "/old", 1), after = extract("b", "/new", 2);
        ObjectNode delta = new JavaScriptAnalysisDelta().compare(before, after);
        assertEquals("javascript-system-change", delta.path("analysis").asText());
        assertTrue(delta.path("architecture").isObject());
        assertFalse(delta.path("securityChanges").isEmpty());
        var routes = delta.path("components").get(0).path("endpoints");
        assertTrue(routes.path("added").size() + routes.path("contractChanged").size() > 0);
        ObjectNode identical = new JavaScriptAnalysisDelta().compare(after, after);
        assertTrue(identical.path("securityChanges").isEmpty());
        // The HTTP history endpoint loads one IR from compressed JSON and
        // compares it with fresh extraction, so Java number-node widths differ.
        ObjectNode persisted = (ObjectNode) mapper.readTree(mapper.writeValueAsBytes(before));
        ObjectNode persistedDelta = new JavaScriptAnalysisDelta().compare(persisted, after);
        assertEquals(delta.path("architecture"), persistedDelta.path("architecture"));
        ObjectNode sameAfterSave = new JavaScriptAnalysisDelta().compare(
                mapper.readTree(mapper.writeValueAsBytes(after)), after);
        assertTrue(sameAfterSave.path("architecture").path("findings").path("introduced").isEmpty());
        ObjectNode differentLimits = after.deepCopy();
        ((ObjectNode) differentLimits.path("javascriptExtraction").path("architecture").path("limits"))
                .put("maxNodes", 29999);
        assertThrows(java.io.IOException.class, () -> new JavaScriptAnalysisDelta().compare(persisted, differentLimits));
        ObjectNode withoutSecurity = before.deepCopy();
        ((ObjectNode) withoutSecurity.path("javascriptExtraction").path("snapshots").get(0)).remove("security");
        ObjectNode missing = new JavaScriptAnalysisDelta().compare(withoutSecurity, withoutSecurity);
        assertEquals("partial", missing.path("status").asText());
        assertTrue(missing.path("summary").path("securityObservationsChanged").isNull());
        assertEquals("complete", missing.path("capabilities").path("architectureComparison").asText());
        ((ObjectNode) after.path("javascriptExtraction").path("snapshots").get(0).path("component"))
                .put("repositoryURL", "https://github.com/other/repository.git");
        assertThrows(java.io.IOException.class, () -> new JavaScriptAnalysisDelta().compare(before, after));
    }

    private ObjectNode extract(String revision, String route, int role) throws Exception {
        Path source = Files.createDirectory(temporary.resolve(revision));
        Files.writeString(source.resolve("server.js"), "const app=require('express')();const jwt=require('jsonwebtoken');\n"
                + "app.get('" + route + "',(req,res)=>res.json({ok:true}));\n"
                + "app.get('/secure',(req,res,next)=>{try{req.user=jwt.verify(req.headers.authorization,process.env.KEY);next();}catch(e){res.status(401).send();}},"
                + "(req,res)=>{if(req.user.role_id!==" + role + ")return res.status(403).send();res.json({ok:true});});");
        ObjectNode registry = mapper.createObjectNode();
        var item = registry.putArray("inputs").addObject().put("url", "https://github.com/example/application.git")
                .put("commit", revision.repeat(40)).put("source", source.toString());
        item.putObject("analysisProfile").put("entrypoint", "server.js");
        Path manifest = temporary.resolve(revision + ".json"); mapper.writeValue(manifest.toFile(), registry);
        var service = new JavaScriptIRService("vendor/javascript", "node", manifest.toString(), "");
        var request = new SystemRepository(); request.repoBranchPair = new RepoBranch();
        request.repoBranchPair.repositoryURL = "https://github.com/example/application.git";
        request.commitID = revision.repeat(40); request.language = "javascript";
        request.componentKind = "backend"; request.componentName = "application";
        return service.extract("application", List.of(request));
    }
}
