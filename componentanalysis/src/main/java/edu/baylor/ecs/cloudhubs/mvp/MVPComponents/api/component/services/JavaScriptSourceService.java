package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsonorg.JsonOrgModule;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.SystemRepository;
import edu.university.ecs.lab.javascript.JavaScriptExtractionService;
import edu.university.ecs.lab.javascript.JavaScriptIRConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Executes only the bundled static analyzer against server-registered source exports. */
@Service
public class JavaScriptSourceService {
    private static final Pattern URL = Pattern.compile("https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\\.git)?");
    private static final Pattern SHA = Pattern.compile("[a-fA-F0-9]{40}");
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_.-]{1,128}");
    private static final long MANIFEST_LIMIT = 1024 * 1024;
    private final ObjectMapper mapper = new ObjectMapper().registerModule(new JsonOrgModule());
    private final JavaScriptExtractionService analyzer;
    private final ExpressSecurityService security;
    private final Path manifest;
    private final Path analyzerConfig;
    private final Path adapterDirectory;
    private final String nodeExecutable;

    public JavaScriptSourceService(
            @Value("${CIMET_JAVASCRIPT_ADAPTER:vendor/javascript}") String adapter,
            @Value("${CIMET_NODE_EXECUTABLE:node}") String node,
            @Value("${CIMET_LOCAL_SOURCES_FILE:}") String sourcesFile,
            @Value("${CIMET_JAVASCRIPT_CONFIG:}") String config) {
        adapterDirectory = Path.of(adapter);
        nodeExecutable = node;
        analyzer = new JavaScriptExtractionService(adapterDirectory, node);
        security = new ExpressSecurityService(Path.of(adapter).toAbsolutePath().resolveSibling("security"), node);
        manifest = sourcesFile == null || sourcesFile.isBlank() ? null : Path.of(sourcesFile).toAbsolutePath().normalize();
        analyzerConfig = config == null || config.isBlank() ? null : Path.of(config).toAbsolutePath().normalize();
    }

    public boolean hasLocalSources() { return manifest != null; }

    public edu.university.ecs.lab.common.models.ir.MicroserviceSystem extractNative(String systemName, List<SystemRepository> repositories) throws Exception {
        var sources = RegisteredSources.resolve(manifest, repositories.stream().map(source -> new RegisteredSources.Identity(
                source.repoBranchPair.repositoryURL, source.commitID, source.componentName, source.componentKind)).toList());
        var local = new ArrayList<edu.university.ecs.lab.intermediate.create.services.IRExtractionService.LocalSource>();
        for (var source : sources) {
            if("frontend".equals(source.kind())) continue;
            var repository = new edu.university.ecs.lab.common.config.RepositoryConfig(
                    new edu.university.ecs.lab.common.config.RepositoryBranchPair(source.url(), "registered-export"), source.commit());
            local.add(new edu.university.ecs.lab.intermediate.create.services.IRExtractionService.LocalSource(source.directory(), repository, source.name()));
        }
        var system = local.isEmpty() ? new edu.university.ecs.lab.common.models.ir.MicroserviceSystem(systemName,new java.util.LinkedHashSet<>(),new java.util.LinkedHashSet<>())
                : edu.university.ecs.lab.intermediate.create.services.IRExtractionService.extractLocal(systemName, local,
                edu.university.ecs.lab.common.parsers.ParserRegistry.createDefault(adapterDirectory, nodeExecutable, analyzerConfig));
        // The transport IR stores repository-relative paths. The Java AST index needs trusted local bindings.
        for (var service : system.getMicroservices()) for (var source : sources) if (source.url().equals(service.getRepositoryURL())) {
            var metadata=service.getMetadata()==null ? new org.json.JSONObject() : service.getMetadata();
            metadata.put("sourceServicePath",service.getPath()==null ? "/" : service.getPath().toString().replace('\\','/'));
            service.setMetadata(metadata);
            service.setPath(localPath(source.directory(), service.getPath()));
            for (var type : service.getClasses()) type.setPath(localPath(source.directory(),type.getPath()));
        }
        return system;
    }

    private static Path localPath(Path root, Path relative) throws IOException {
        String value = relative == null ? "" : relative.toString().replace('\\','/').replaceFirst("^/+", "");
        Path path = root.resolve(value).normalize();
        if (!path.startsWith(root)) throw new IOException("IR source path is outside registered root");
        return path;
    }

    public List<JsonNode> extractAvailableSnapshots(List<SystemRepository> repositories) throws IOException, InterruptedException {
        if (!hasLocalSources()) return List.of();
        var sources = RegisteredSources.resolve(manifest, repositories.stream().map(source -> new RegisteredSources.Identity(
                source.repoBranchPair.repositoryURL,source.commitID,source.componentName,source.componentKind)).toList());
        List<SystemRepository> requests = new ArrayList<>();
        for(int index=0;index<sources.size();index++) {
            var source=sources.get(index);
            if(!RegisteredSources.containsJavaScript(source.directory())) continue;
            SystemRepository copy=new SystemRepository(); copy.setRepoBranchPair(repositories.get(index).getRepoBranchPair());
            copy.setCommitID(source.commit()); copy.setComponentName(source.name()); copy.setComponentKind(source.kind()); copy.setLanguage("javascript");
            requests.add(copy);
        }
        return requests.isEmpty()?List.of():extract(requests);
    }

    public void validateSources(List<SystemRepository> repositories) throws IOException {
        if (!repositories.isEmpty()) resolve(repositories);
    }

    public List<JsonNode> extract(List<SystemRepository> repositories) throws IOException, InterruptedException {
        List<JsonNode> snapshots = new ArrayList<>();
        for (Source source : resolve(repositories)) {
            ObjectNode snapshot = extractSnapshot(source.directory, source.kind, source.name);
            ObjectNode component = (ObjectNode) snapshot.get("component");
            component.put("repositoryURL", source.url);
            component.put("commit", source.commit);
            component.put("sourceBinding", "registered-source-export");
            if ("backend".equals(source.kind)) snapshot.set("security", security.analyze(source.directory, snapshot, source.profile));
            snapshots.add(snapshot);
        }
        return snapshots;
    }
    private ObjectNode extractSnapshot(Path directory, String kind, String name) throws IOException, InterruptedException {
        if (analyzerConfig != null) return analyzer.extract(directory,kind,name,analyzerConfig);
        Path neutral=Files.createTempFile("aridnova-javascript-profile-", ".json");
        try {
            Files.writeString(neutral,"{\"wrappers\":[],\"backendEnv\":[],\"backendOrigins\":[]}");
            return analyzer.extract(directory,kind,name,neutral);
        } finally { Files.deleteIfExists(neutral); }
    }

    private List<Source> resolve(List<SystemRepository> repositories) throws IOException {
        if (repositories.isEmpty() || repositories.size() > 8) {
            throw new IllegalArgumentException("Between 1 and 8 JavaScript repositories are required");
        }
        if (manifest == null) throw new IllegalArgumentException(
                "JavaScript extraction requires server-configured CIMET_LOCAL_SOURCES_FILE with pinned source exports");
        if (!Files.isRegularFile(manifest, LinkOption.NOFOLLOW_LINKS) || Files.size(manifest) > MANIFEST_LIMIT) {
            throw new IOException("Local source manifest is missing, linked, or too large");
        }
        JsonNode registry;
        try { JsonNode root=mapper.readTree(Files.readAllBytes(manifest)); if(root==null) throw new IOException("Empty source manifest"); registry=root.path("inputs"); }
        catch (IOException failure) { throw new IOException("Local source manifest is invalid JSON"); }
        if (!registry.isArray() || registry.size() > 128) throw new IOException("Local source manifest requires a bounded inputs array");
        List<Source> resolved = new ArrayList<>();
        Set<String> identities = new HashSet<>();
        for (SystemRepository request : repositories) {
            if (request == null || request.repoBranchPair == null) throw new IllegalArgumentException("Repository URL is required");
            String url = normalizeUrl(request.repoBranchPair.repositoryURL);
            if (request.commitID == null || !SHA.matcher(request.commitID).matches()) {
                throw new IllegalArgumentException("JavaScript source exports require an exact 40-character commit SHA");
            }
            String commit = request.commitID.toLowerCase(Locale.ROOT);
            String kind = request.componentKind;
            if (!"backend".equals(kind) && !"frontend".equals(kind)) {
                throw new IllegalArgumentException("JavaScript componentKind must be backend or frontend");
            }
            String name = request.componentName == null ? url.substring(url.lastIndexOf('/') + 1, url.length() - 4) : request.componentName;
            if (!NAME.matcher(name).matches() || !identities.add(kind + ":" + name)) {
                throw new IllegalArgumentException("JavaScript component names must be unique per kind and use letters, numbers, dots, underscores or hyphens");
            }
            JsonNode match = null;
            for (JsonNode entry : registry) {
                if (!entry.path("url").isTextual() || !entry.path("commit").isTextual()) continue;
                String entryUrl;
                try { entryUrl = normalizeUrl(entry.path("url").asText()); }
                catch (IllegalArgumentException invalid) { continue; }
                if (url.equals(entryUrl) && commit.equalsIgnoreCase(entry.path("commit").asText())) {
                    if (match != null) throw new IOException("Duplicate repository and commit in local source manifest");
                    match = entry;
                }
            }
            if (match == null || !match.path("source").isTextual()) {
                throw new IllegalArgumentException("No registered local source export matches the requested repository and commit");
            }
            Path directory;
            try { directory = Path.of(match.path("source").asText()); }
            catch (RuntimeException invalid) { throw new IOException("Registered source directory is invalid"); }
            if (!directory.isAbsolute() || Files.isSymbolicLink(directory)
                    || !Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS)) {
                throw new IOException("Registered source must be an existing absolute directory, not a symbolic link");
            }
            JsonNode profile = match.path("analysisProfile");
            if (!profile.isMissingNode() && (!profile.isObject() || mapper.writeValueAsBytes(profile).length > 64 * 1024))
                throw new IOException("Registered analysis profile must be a bounded object");
            resolved.add(new Source(directory.toRealPath(), url, commit, kind, name, profile));
        }
        return resolved;
    }

    private static String normalizeUrl(String value) {
        if (value == null || value.length() > 512 || !URL.matcher(value).matches()) {
            throw new IllegalArgumentException("JavaScript repository identity must be a GitHub HTTPS owner/repository URL without credentials or query parameters");
        }
        return value.endsWith(".git") ? value : value + ".git";
    }

    private record Source(Path directory, String url, String commit, String kind, String name, JsonNode profile) { }
}
