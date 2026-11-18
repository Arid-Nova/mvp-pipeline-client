package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.StaticJavaParser;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.IRRequestModel;
import edu.university.ecs.lab.common.config.*;
import edu.university.ecs.lab.common.models.enums.HttpMethod;
import edu.university.ecs.lab.common.models.ir.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;

class JavaCompatibilityTest {
    @TempDir Path directory;

    @Test void javaIndexRetainsNamedRouteSecurityAnnotationsAutowiredFieldAndOverloads() throws Exception {
        Path file = directory.resolve("ExampleController.java");
        Files.writeString(file, """
                package example;
                @RestController
                @RequestMapping("/api")
                public class ExampleController {
                    @Autowired private Repository repository;
                    @GetMapping("/{id}")
                    @PreAuthorize("hasRole('ADMIN')")
                    public String item(@PathVariable("id") String id) { return id; }
                    public int helper(int count) { if (count > 0) return count; return 0; } public String helper(String text) { return text; }
                    public String pair(String first, int second) { return first; }
                    public String pair(int first, String second) { return second; }
                }
                """);
        var ast = StaticJavaParser.parse(file).getClassByName("ExampleController").orElseThrow();
        var system = new MicroserviceSystem("fixture", new HashSet<>(), new HashSet<>());
        var service = new Microservice(system, "java-service", "https://github.com/example/java.git", "a".repeat(40), directory);
        system.getMicroservices().add(service);
        var type = new JClass(service, file, "example", "", new HashSet<>());
        type.setAnnotations(ast.getAnnotations().stream().map(annotation -> new Annotation(type, annotation)).collect(Collectors.toSet()));
        type.setFields(ast.getFields().stream().flatMap(field -> field.getVariables().stream().map(variable -> new Field(type, field, variable))).collect(Collectors.toSet()));
        type.setMethods(ast.getMethods().stream().map(declaration -> {
            Method method = new Method(type, declaration);
            return declaration.getNameAsString().equals("item") ? new Endpoint(method, "/api/{?}", HttpMethod.GET) : method;
        }).collect(Collectors.toSet()));
        service.getControllers().add(type);
        Config config = new Config("fixture", List.of(new RepositoryConfig(
                new RepositoryBranchPair("https://github.com/example/java.git", "main"), "a".repeat(40))));
        IndexBundle result = ComponentExtractionService.indexJava(system, config, "a".repeat(40), new IRRequestModel());
        assertEquals(1, result.endpointIndex().getEndpoints().size());
        EndpointInfo endpoint = result.endpointIndex().getEndpoints().values().iterator().next();
        assertEquals("/api/{id}", endpoint.getFullUri());
        assertEquals("/api/{?}", endpoint.getSimplifiedUri());
        assertEquals("String", endpoint.getResponseType());
        assertTrue(endpoint.getAuthentication().isRequired());
        assertTrue(endpoint.getAuthentication().getRequiredRoles().contains("ADMIN"));
        assertTrue(endpoint.getPathParameterDetails().stream().anyMatch(parameter -> parameter.getName().equals("id")));
        var methods = result.componentIndex().getComponents().values().stream().filter(IndexedMethod.class::isInstance).map(IndexedMethod.class::cast).toList();
        assertEquals(5, methods.size(), "overloads must not overwrite each other");
        assertEquals(5, methods.stream().map(IndexedMethod::getId).distinct().count());
        assertTrue(methods.stream().allMatch(method -> method.getControlFlowGraph() != null));
        assertTrue(result.componentIndex().getComponents().values().stream().filter(IndexedField.class::isInstance)
                .map(IndexedField.class::cast).anyMatch(IndexedField::isAutowired));
        assertEquals("partial", result.componentIndex().getMetadata().getAnalysisCapabilities().get("controlFlow"));
        assertEquals("supported", result.componentIndex().getMetadata().getAnalysisCapabilities().get("constructors"));
    }

    @Test void constructorsAndUniqueSourceLocalCallTargetsAreRecovered() throws Exception {
        Path source=directory.resolve("ExampleService.java");
        Files.writeString(source,"public class ExampleService { public ExampleService(){ initialize(); } public void run(){ initialize(); } private void initialize(){} }");
        var ast=StaticJavaParser.parse(source).getClassByName("ExampleService").orElseThrow();
        var system=new MicroserviceSystem("calls",new HashSet<>(),new HashSet<>());
        var service=new Microservice(system,"service","https://github.com/example/service.git","a".repeat(40),directory);
        var type=new JClass(service,source,"example","",new HashSet<>());
        type.setMethods(ast.getMethods().stream().map(method->new Method(type,method)).collect(Collectors.toSet()));
        service.getServices().add(type);system.getMicroservices().add(service);
        try {
            CimetModelCompatibility.prepare(system);
            assertTrue(type.getMethods().stream().anyMatch(CimetModelCompatibility::isConstructor));
            for (Method method : type.getMethods()) for(MethodCall call : method.getMethodCalls()) {
                assertNotNull(CimetModelCompatibility.targetId(call));
                assertTrue(CimetModelCompatibility.targetCanonicalId(call).contains("initialize"));
            }
        } finally { CimetModelCompatibility.clear(); }
    }

    @Test void configuredJavaRoleOrderIsRetainedAndNotSynthesized() {
        EndpointInfo endpoint = new EndpointInfo();
        endpoint.setId("java:roles");
        endpoint.setEndpointId("java:roles");
        endpoint.setHttpMethod("GET");
        endpoint.setFullUri("/roles");
        endpoint.setSimplifiedUri("/roles");
        AuthorizationInfo authorization = new AuthorizationInfo();
        authorization.setRequiredRoles(List.of("ADMIN", "CUSTOM", "SUPER_EDITOR"));
        endpoint.setAuthorization(authorization);
        EndpointIndex endpoints = new EndpointIndex(Map.of("endpoint", endpoint), new IndexMetadata());
        var system = new MicroserviceSystem("roles", new HashSet<>(), new HashSet<>());
        ComponentIndex index = new ComponentIndexer(null, endpoints, Map.of("CUSTOM", -1), 50).generateIndex(system, "revision");
        assertEquals(List.of("CUSTOM", "SUPER_EDITOR", "ADMIN"), index.getMetadata().getRoles());
    }

    @Test void missingSourceFailsInsteadOfProducingPublicSecurityDefaults() {
        var system = new MicroserviceSystem("missing", new HashSet<>(), new HashSet<>());
        var service = new Microservice(system, "missing", "https://github.com/example/missing.git", "a".repeat(40), directory);
        service.getControllers().add(new JClass(service, directory.resolve("missing.java"), "example", "", new HashSet<>()));
        system.getMicroservices().add(service);
        assertThrows(IllegalStateException.class, () -> ComponentExtractionService.indexJava(system, null, "a".repeat(40), new IRRequestModel()));
    }

    @Test void classSignaturesSeparateServicesWithIdenticalSourceLayouts() {
        var system = new MicroserviceSystem("twins", new HashSet<>(), new HashSet<>());
        var first = new Microservice(system, "service", "https://github.com/example/mono.git", "a".repeat(40), directory.resolve("first"));
        var second = new Microservice(system, "service", "https://github.com/example/mono.git", "a".repeat(40), directory.resolve("second"));
        var one = new JClass(first, first.getPath().resolve("src/Foo.java"), "example", "", new HashSet<>());
        var two = new JClass(second, second.getPath().resolve("src/Foo.java"), "example", "", new HashSet<>());
        assertNotEquals(CimetModelCompatibility.fullId(one), CimetModelCompatibility.fullId(two));
        assertNotEquals(CimetModelCompatibility.id(one), CimetModelCompatibility.id(two));
    }
}
