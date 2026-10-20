package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.IRRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.SystemRepository;
import edu.university.ecs.lab.common.config.Config;
import edu.university.ecs.lab.common.config.RepositoryBranchPair;
import edu.university.ecs.lab.common.config.RepositoryConfig;
import edu.university.ecs.lab.common.models.ir.MicroserviceSystem;
import edu.university.ecs.lab.intermediate.create.services.IRExtractionService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/** Extraction/indexing without persistence. The HTTP endpoint and offline CLI use this path. */
@Service
public class ComponentExtractionService {
    private final JavaScriptSourceService javascript;
    public ComponentExtractionService(JavaScriptSourceService javascript) { this.javascript = javascript; }

    public IndexBundle extract(IRRequestModel request) throws Exception {
        if (request == null || request.getSystemName() == null || request.getSystemName().isBlank()
                || request.getSystemName().length() > 256 || request.getSystemRepositories() == null
                || request.getSystemRepositories().length == 0 || request.getSystemRepositories().length > 8) {
            throw new IllegalArgumentException("A system name and between 1 and 8 repositories are required");
        }
        List<SystemRepository> repositories = Arrays.asList(request.getSystemRepositories());
        boolean explicitJavaScript = true;
        for (SystemRepository repository : repositories) {
            if (repository == null || repository.getRepoBranchPair() == null) throw new IllegalArgumentException("Repository configuration is required");
            String language = RepositoryLanguage.normalize(repository.getLanguage());
            if (repository.getComponentKind() != null && !Set.of("backend","frontend").contains(repository.getComponentKind()))
                throw new IllegalArgumentException("componentKind must be backend or frontend");
            if ("frontend".equals(repository.getComponentKind()) && !javascript.hasLocalSources())
                throw new IllegalArgumentException("Frontend source reports require registered local exports");
            explicitJavaScript &= RepositoryLanguage.javascript(language) && repository.getComponentKind() != null;
        }
        if (explicitJavaScript) {
            javascript.validateSources(repositories);
            return new JavaScriptComponentIndexer().index(request.getSystemName(), javascript.extract(repositories));
        }
        List<RepositoryConfig> configurations = repositories.stream().map(repository -> new RepositoryConfig(
                new RepositoryBranchPair(repository.getRepoBranchPair().getRepositoryURL(), repository.getRepoBranchPair().getBranchName()), repository.getCommitID())).toList();
        Config config = new Config(request.getSystemName(), configurations);
        MicroserviceSystem system = javascript.hasLocalSources() ? javascript.extractNative(request.getSystemName(), repositories) : IRExtractionService.create(config);
        List<Map<String,String>> provenance = repositories.stream().map(repository -> Map.of(
                "repositoryURL", repository.getRepoBranchPair().getRepositoryURL(), "commit", Objects.toString(repository.getCommitID(),""),
                "language", RepositoryLanguage.normalize(repository.getLanguage()))).toList();
        IndexBundle result = indexPolyglot(system,config,request,provenance);
        var snapshots = javascript.extractAvailableSnapshots(repositories);
        if (!snapshots.isEmpty()) {
            var clients=snapshots.stream().filter(snapshot->"frontend".equals(snapshot.path("component").path("kind").asText())).toList();
            if(!clients.isEmpty()) result=merge(result,new JavaScriptComponentIndexer().index(request.getSystemName(),clients));
            result.componentIndex().setJavascriptExtraction(
                    new JavaScriptComponentIndexer().index(request.getSystemName(),snapshots).componentIndex().getJavascriptExtraction());
        }
        return result;
    }

    public static IndexBundle indexPolyglot(MicroserviceSystem system, Config config, IRRequestModel request, List<Map<String,String>> sources) {
        var generic = new PolyglotComponentIndexer().index(system,sources);
        MicroserviceSystem javaSystem = new MicroserviceSystem(system.getName(),new HashSet<>(),new HashSet<>());
        for (var service : system.getMicroservices()) {
            var copy = new edu.university.ecs.lab.common.models.ir.Microservice(javaSystem,service.getName(),service.getRepositoryURL(),service.getCommitID(),service.getPath());
            for (var type : service.getClasses()) if (PolyglotComponentIndexer.isJava(type)) copy.addAbstractClass(type);
            copy.setMetadata(service.getMetadata());
            if (!copy.getClasses().isEmpty()) javaSystem.getMicroservices().add(copy);
        }
        if (javaSystem.getMicroservices().isEmpty()) return coverage(generic,system);
        var java = indexJava(javaSystem,config,sources.size()==1?sources.getFirst().get("commit"):null,request);
        java.componentIndex().getMetadata().setSourceRepositories(sources);
        java.endpointIndex().getMetadata().setSourceRepositories(sources);
        java.componentIndex().getMetadata().setLanguages(List.of("java"));
        java.endpointIndex().getMetadata().setLanguages(List.of("java"));
        if (generic.componentIndex().getComponents().isEmpty()) return coverage(java,system);
        IndexBundle merged = merge(java,generic);
        merged.componentIndex().getMetadata().setMicroserviceCount(system.getMicroservices().size());
        merged.endpointIndex().getMetadata().setMicroserviceCount(system.getMicroservices().size());
        var capabilities = new LinkedHashMap<>(merged.componentIndex().getMetadata().getAnalysisCapabilities());
        capabilities.put("authorizationPolicy","unsupported"); capabilities.put("formalVerification","unsupported");
        merged.componentIndex().getMetadata().setAnalysisCapabilities(capabilities);
        merged.endpointIndex().getMetadata().setAnalysisCapabilities(capabilities);
        return coverage(merged,system);
    }

    private static IndexBundle coverage(IndexBundle indexes,MicroserviceSystem system) {
        PolyglotComponentIndexer.coverage(indexes.componentIndex().getMetadata(),system);
        PolyglotComponentIndexer.coverage(indexes.endpointIndex().getMetadata(),system);
        return indexes;
    }

    /** Kept separate so ordinary Java extraction/indexer compatibility can be verified locally. */
    public static IndexBundle indexJava(MicroserviceSystem system, Config config, String revision, IRRequestModel request) {
        try {
            CimetModelCompatibility.prepare(system);
            EndpointIndex endpoints = new EndpointIndexer().indexEndpoints(system, revision);
            ComponentIndex components = new ComponentIndexer(config, endpoints,
                    request.getRolePriority(), request.getDefaultRolePriority()).generateIndex(system, revision);
            Map<String, String> capabilities = Map.of("javaSourceIndex", "supported", "controlFlow", "partial",
                    "resolvedIrCallTargets", "partial", "constructors", "supported", "authorizationPolicy", "partial");
            endpoints.getMetadata().setAnalysisCapabilities(capabilities);
            endpoints.getMetadata().setLimitations(CimetModelCompatibility.LIMITATIONS);
            components.getMetadata().setAnalysisCapabilities(capabilities);
            components.getMetadata().setLimitations(CimetModelCompatibility.LIMITATIONS);
            return new IndexBundle(endpoints, components);
        } finally { CimetModelCompatibility.clear(); }
    }

    private static IndexBundle merge(IndexBundle java, IndexBundle js) {
        Map<String, IndexedComponent> components = new LinkedHashMap<>(java.componentIndex().getComponents());
        js.componentIndex().getComponents().forEach((id, component) -> {
            if (components.putIfAbsent(id, component) != null) throw new IllegalArgumentException("Duplicate mixed-language component ID");
        });
        Map<String, EndpointInfo> endpoints = new LinkedHashMap<>(java.endpointIndex().getEndpoints());
        js.endpointIndex().getEndpoints().forEach((id, endpoint) -> {
            if (endpoints.putIfAbsent(id, endpoint) != null) throw new IllegalArgumentException("Duplicate mixed-language endpoint ID");
        });
        IndexMetadata metadata = mergedMetadata(java.componentIndex().getMetadata(), js.componentIndex().getMetadata());
        ComponentIndex result = new ComponentIndex(components, new LinkedHashMap<>(), java.componentIndex().getRoles(), metadata);
        result.setJavascriptExtraction(js.componentIndex().getJavascriptExtraction());
        return new IndexBundle(new EndpointIndex(endpoints,
                mergedMetadata(java.endpointIndex().getMetadata(), js.endpointIndex().getMetadata())), result);
    }

    private static IndexMetadata mergedMetadata(IndexMetadata java, IndexMetadata js) {
        IndexMetadata merged = new IndexMetadata();
        merged.setSystemName(java.getSystemName());
        merged.setIndexedAt(Instant.now().toString());
        merged.setTotalComponents(java.getTotalComponents() + js.getTotalComponents());
        Map<String, Integer> counts = new TreeMap<>(java.getComponentCounts());
        js.getComponentCounts().forEach((key, count) -> counts.merge(key, count, Integer::sum));
        merged.setComponentCounts(counts);
        merged.setMicroserviceCount(java.getMicroserviceCount() + js.getMicroserviceCount());
        merged.setRoleCount(java.getRoleCount());
        merged.setRoles(java.getRoles());
        List<Map<String, String>> sources = new ArrayList<>(java.getSourceRepositories());
        sources.addAll(js.getSourceRepositories());
        merged.setSourceRepositories(sources);
        Map<String, String> capabilities = new LinkedHashMap<>(java.getAnalysisCapabilities());
        capabilities.putAll(js.getAnalysisCapabilities());
        merged.setAnalysisCapabilities(capabilities);
        List<String> limitations = new ArrayList<>(js.getLimitations() == null ? List.of() : js.getLimitations());
        limitations.addAll(java.getLimitations());
        limitations.add("Source-model coverage is scoped per language; authorization generation for a mixed-language index is disabled.");
        merged.setLimitations(limitations);
        Set<String> languages = new TreeSet<>(java.getLanguages() == null ? List.of("java") : java.getLanguages());
        languages.addAll(js.getLanguages() == null ? List.of() : js.getLanguages());
        merged.setLanguages(new ArrayList<>(languages));
        merged.setStatus("partial".equals(java.getStatus()) || "partial".equals(js.getStatus()) ? "partial" : "complete-for-supported-source-patterns");
        List<Map<String,Object>> diagnostics = new ArrayList<>(java.getDiagnostics()==null?List.of():java.getDiagnostics());
        diagnostics.addAll(js.getDiagnostics()==null?List.of():js.getDiagnostics());
        merged.setDiagnostics(diagnostics);
        return merged;
    }
}
