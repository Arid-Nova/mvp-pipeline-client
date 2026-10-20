package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.*;
import edu.university.ecs.lab.common.models.ir.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;

/** Index native source observations without applying Spring authentication or CFG defaults. */
public final class PolyglotComponentIndexer {
    private final ObjectMapper mapper = new ObjectMapper();
    public static final Map<String,String> CAPABILITIES = Map.of(
            "polyglotSourceIndex", "supported", "endpoints", "partial", "architecturalRoles", "heuristic",
            "controlFlow", "unsupported", "authorizationPolicy", "unsupported", "formalVerification", "unsupported");
    public static final List<String> LIMITATIONS = List.of(
            "Roles, fields, endpoints and remote calls are static parser observations with language-specific coverage.",
            "Authentication, authorization and control flow are unknown for native polyglot components; Java defaults are not applied.",
            "Cross-language call resolution and runtime behavior are not established by this index.");

    public IndexBundle index(MicroserviceSystem system, List<Map<String,String>> repositories) {
        Map<String,IndexedComponent> components = new LinkedHashMap<>();
        Map<String,EndpointInfo> endpoints = new LinkedHashMap<>();
        Map<String,Integer> counts = new TreeMap<>();
        Set<String> languages = new TreeSet<>();
        for (Microservice service : system.getMicroservices()) for (AbstractClass type : service.getClasses()) {
            if (isJava(type)) continue;
            String language = language(type);
            languages.add(language);
            String source = relative(type.getPath(), service.getPath());
            String typeKey = service.getRepositoryURL()+"#"+service.getName()+"#"+source+"#"+type.getName();
            ObjectNode evidence = mapper.createObjectNode().put("language",language).put("path",source)
                    .put("role",String.valueOf(type.getClassRole())).put("evidenceKind","static-source-observation");
            String typeId = id(typeKey);
            add(components,counts,new IndexedComponent("Class",type.getName(),typeId,typeKey,service.getName(),type.getName(),evidence));
            for (Field field : type.getFields()) {
                String key = typeKey+"#field:"+field.getName();
                add(components,counts,new IndexedComponent("Field",field.getName(),id(key),key,service.getName(),type.getName(),evidence));
            }
            for (Method method : type.getMethods()) {
                String key = typeKey+"#method:"+method.getName()+":"+(method.getLocation()==null ? 0 : method.getLocation().getStartLine())
                        +method.getParameters().stream().map(parameter->parameter.getName()+":"+parameter.getParameterType()).sorted().toList();
                if(method instanceof Endpoint endpoint) key+="#"+endpoint.getHttpMethod()+":"+endpoint.getUrl();
                String methodId = id(key);
                ObjectNode facts = evidence.deepCopy();
                facts.set("sourceMetadata", mapper.valueToTree(method.getMetadata() == null ? null : method.getMetadata().toMap()));
                facts.set("calls",mapper.valueToTree(method.getMethodCalls()));
                add(components,counts,new IndexedComponent("Method",method.getName(),methodId,key,service.getName(),type.getName(),facts));
                if (method instanceof Endpoint endpoint) {
                    String endpointKey = key+"#"+endpoint.getHttpMethod()+":"+endpoint.getUrl();
                    EndpointInfo info = new EndpointInfo();
                    info.setId(id(endpointKey)); info.setEndpointId(id(endpointKey)); info.setMethodId(methodId);
                    info.setHttpMethod(String.valueOf(endpoint.getHttpMethod())); info.setFullUri(endpoint.getUrl());
                    info.setSimplifiedUri(endpoint.getUrl()); info.setMethodName(method.getName());
                    info.setControllerClass(type.getName()); info.setServiceName(service.getName()); info.setPhysicalServiceName(service.getName());
                    info.setSourceEvidence(facts); info.setSecurityAnalysisStatus("unsupported");
                    if (endpoints.putIfAbsent(info.getId(),info)!=null) throw new IllegalStateException("Duplicate polyglot endpoint ID");
                }
            }
        }
        IndexMetadata metadata = new IndexMetadata(); metadata.setSystemName(system.getName()); metadata.setIndexedAt(Instant.now().toString());
        metadata.setTotalComponents(components.size()); metadata.setComponentCounts(counts); metadata.setMicroserviceCount(system.getMicroservices().size());
        metadata.setRoleCount(0); metadata.setRoles(List.of()); metadata.setSourceRepositories(repositories);
        metadata.setLanguages(new ArrayList<>(languages)); metadata.setAnalysisCapabilities(CAPABILITIES); metadata.setLimitations(LIMITATIONS);
        coverage(metadata,system);
        ComponentIndex componentIndex = new ComponentIndex(components,new LinkedHashMap<>(),new LinkedHashSet<>(),metadata);
        IndexMetadata endpointMetadata = mapper.convertValue(metadata,IndexMetadata.class);
        endpointMetadata.setTotalComponents(endpoints.size()); endpointMetadata.setComponentCounts(Map.of("Endpoint",endpoints.size()));
        return new IndexBundle(new EndpointIndex(endpoints,endpointMetadata),componentIndex);
    }
    public static boolean isJava(AbstractClass type) { return type.getPath()!=null && type.getPath().toString().endsWith(".java"); }
    static String language(AbstractClass type) {
        String physical=type.getMetadata()==null ? "" : type.getMetadata().optString("sourcePath","");
        String name = (physical.isBlank() ? type.getPath()==null ? "" : type.getPath().toString() : physical).toLowerCase(Locale.ROOT);
        if(name.matches(".*\\.(?:ts|tsx|mts|cts)$")) return "typescript";
        if(name.matches(".*\\.(?:js|jsx|mjs|cjs)$")) return "javascript";
        if(name.endsWith(".py")) return "python"; if(name.endsWith(".go")) return "go"; if(name.endsWith(".cs")) return "csharp";
        return type.getMetadata()==null ? "unknown" : type.getMetadata().optString("language","unknown");
    }
    static void coverage(IndexMetadata metadata,MicroserviceSystem system) {
        String status=system.getMetadata()==null ? "complete-for-supported-source-patterns" : system.getMetadata().optString("status","complete-for-supported-source-patterns");
        metadata.setStatus(status);
        List<Map<String,Object>> diagnostics=new ArrayList<>();
        Set<String> languages=new TreeSet<>(metadata.getLanguages()==null?List.of():metadata.getLanguages());
        for(var service:system.getMicroservices()) {
            if(service.getMetadata()==null) continue;
            var observed=service.getMetadata().optJSONObject("parsers");
            if(observed!=null) for(String language:observed.keySet()) {
                if("javascript-typescript".equals(language)) {
                    // Source extensions in diagnostics distinguish malformed files without a class projection.
                    boolean actualJs=languages.contains("javascript"), actualTs=languages.contains("typescript");
                    if(!actualJs && !actualTs) { languages.add("javascript"); languages.add("typescript"); }
                } else languages.add(language);
            }
            var messages=service.getMetadata().optJSONArray("diagnostics");
            if(messages!=null) for(Object message:messages) {
                Map<String,Object> record=message instanceof org.json.JSONObject object ? new LinkedHashMap<>(object.toMap()) : new LinkedHashMap<>();
                record.put("repositoryURL",service.getRepositoryURL()); record.put("component",service.getName());
                diagnostics.add(record);
            }
        }
        metadata.setLanguages(new ArrayList<>(languages)); metadata.setDiagnostics(diagnostics);
        if("partial".equals(status)) {
            var capabilities=new LinkedHashMap<>(metadata.getAnalysisCapabilities()==null?Map.<String,String>of():metadata.getAnalysisCapabilities());
            capabilities.put("polyglotSourceIndex","partial"); capabilities.put("sourceCompleteness","partial");
            metadata.setAnalysisCapabilities(capabilities);
        }
    }
    private static String relative(Path path, Path root) {
        if(path==null) return "unknown";
        Path file=path.toAbsolutePath().normalize(), base=root==null?null:root.toAbsolutePath().normalize();
        return (base!=null && file.startsWith(base) ? base.relativize(file).toString() : path.getFileName().toString()).replace('\\','/');
    }
    private static String id(String key) { return "polyglot:"+UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)); }
    private static void add(Map<String,IndexedComponent> components,Map<String,Integer> counts,IndexedComponent value) {
        if(components.putIfAbsent(value.getId(),value)!=null) throw new IllegalStateException("Duplicate polyglot component ID");
        counts.merge(value.getType(),1,Integer::sum);
    }
}
