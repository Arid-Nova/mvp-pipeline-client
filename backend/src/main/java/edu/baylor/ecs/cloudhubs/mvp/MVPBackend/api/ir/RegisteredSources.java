package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Pattern;

/** Operator-controlled source exports. Request data never selects an arbitrary filesystem path. */
final class RegisteredSources {
    private static final Pattern URL = Pattern.compile("https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\\.git)?");
    
    record Identity(String url, String commit, String name, String kind) { }
    record Source(Path directory, String url, String commit, String name, String kind, JsonNode profile) { }
    
    static List<Source> resolve(Path manifest, List<Identity> requested) throws IOException {
        if (manifest == null) 
            throw new IllegalArgumentException("Set CIMET_LOCAL_SOURCES_FILE to an operator-controlled source registry");
        
        if (!Files.isRegularFile(manifest, LinkOption.NOFOLLOW_LINKS) || Files.size(manifest) > 1024 * 1024)
            throw new IOException("Source registry must be a regular JSON file no larger than 1 MiB");
        
        ObjectMapper mapper = new ObjectMapper();
        JsonNode content = mapper.readTree(Files.readAllBytes(manifest));
        JsonNode inputs = content == null ? null : content.get("inputs");
        
        if (inputs == null || !inputs.isArray() || inputs.size() > 128) 
            throw new IOException("Source registry requires a bounded inputs array");
        
        List<Source> sources = new ArrayList<>();
        Set<String> identities = new HashSet<>();
        
        for (Identity request : requested) {
            String url = url(request.url());
            if (request.commit() == null || !request.commit().matches("[a-fA-F0-9]{40}"))
                throw new IllegalArgumentException("Registered exports require an exact 40-character commit SHA");
            
            String commit = request.commit().toLowerCase(Locale.ROOT);
            String name = request.name() == null || request.name().isBlank() ? url.substring(url.lastIndexOf('/')+1, url.length()-4) : request.name();
            
            if (!name.matches("[A-Za-z0-9_.-]{1,128}") || !identities.add(url+"@"+commit+":"+name))
                throw new IllegalArgumentException("Repository component identities must be unique with a valid component name");
            
            JsonNode match = null;
            for (JsonNode entry : inputs) {
                if (!entry.path("url").isTextual() || !entry.path("commit").isTextual()) continue;
                
                String candidate;
                try { 
                    candidate = url(entry.path("url").asText()); 
                } catch (IllegalArgumentException invalid) { continue; }
                
                if (url.equals(candidate) && commit.equalsIgnoreCase(entry.path("commit").asText())) {
                    if (match != null) 
                        throw new IOException("Duplicate source registry repository and commit");
                    match = entry;
                }
            }

            if (match == null || !match.path("source").isTextual()) 
                throw new IllegalArgumentException("No registered source export matches repository and commit");

            Path directory;
            try { 
                directory = Path.of(match.path("source").asText()); 
            } catch(RuntimeException invalid) { 
                throw new IOException("Invalid registered source directory"); 
            }

            if (!directory.isAbsolute() || Files.isSymbolicLink(directory) || !Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS))
                throw new IOException("Registered source must be an existing absolute directory without symbolic links");
            
            JsonNode profile = match.path("analysisProfile");
            if (!profile.isMissingNode() && (!profile.isObject() || mapper.writeValueAsBytes(profile).length > 64 * 1024))
                throw new IOException("Analysis profile must be a bounded object");
            
            sources.add(new Source(directory.toRealPath(), url, commit, name, request.kind() == null ? "backend" : request.kind(), profile));
        }
        
        return sources;
    }

    static final int JAVASCRIPT_PROBE_ENTRY_LIMIT = 100_000;
    static final int JAVASCRIPT_PROBE_DEPTH_LIMIT = 64;
    private static final Set<String> PROBE_EXCLUDED_DIRECTORIES =
            Set.of("node_modules", ".git", "dist", "build", "target", "vendor");

    /**
     * An absence result requires a complete inspection. Exhausted or unreadable
     * exports fail explicitly, rather than silently omitting JavaScript reports.
     */
    static boolean containsJavaScript(Path directory) throws IOException {
        return containsJavaScript(directory, JAVASCRIPT_PROBE_ENTRY_LIMIT, JAVASCRIPT_PROBE_DEPTH_LIMIT);
    }

    // Smaller trusted limits are useful for regression tests; callers cannot raise the hard caps.
    static boolean containsJavaScript(Path directory, int entryLimit, int depthLimit) throws IOException {
        if (entryLimit < 1 || entryLimit > JAVASCRIPT_PROBE_ENTRY_LIMIT
                || depthLimit < 0 || depthLimit > JAVASCRIPT_PROBE_DEPTH_LIMIT)
            throw new IllegalArgumentException("JavaScript presence probe limits are outside their hard caps");
        boolean[] found = {false};
        int[] visited = {0};
        Files.walkFileTree(directory, EnumSet.noneOf(FileVisitOption.class), depthLimit + 1,
                new SimpleFileVisitor<>() {
            private void admit() throws IOException {
                if (++visited[0] > entryLimit) throw incomplete("ENTRY_LIMIT");
            }

            @Override
            public FileVisitResult preVisitDirectory(Path path, java.nio.file.attribute.BasicFileAttributes attributes)
                    throws IOException {
                admit();
                return !path.equals(directory) && excluded(path)
                        ? FileVisitResult.SKIP_SUBTREE : FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, java.nio.file.attribute.BasicFileAttributes attributes)
                    throws IOException {
                admit();
                // walkFileTree presents a directory at its maximum depth as a
                // file. Its contents were not inspected, so absence is unknown.
                if (attributes.isDirectory() && !excluded(file)) throw incomplete("DEPTH_LIMIT");
                if (attributes.isRegularFile()
                        && file.getFileName().toString().toLowerCase(Locale.ROOT)
                        .matches(".*\\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$")) {
                    found[0] = true;
                    return FileVisitResult.TERMINATE;
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException failure) throws IOException {
                throw incomplete("READ_FAILURE");
            }

            @Override
            public FileVisitResult postVisitDirectory(Path path, IOException failure) throws IOException {
                if (failure != null) throw incomplete("READ_FAILURE");
                return FileVisitResult.CONTINUE;
            }
        });
        return found[0];
    }

    private static boolean excluded(Path path) {
        return PROBE_EXCLUDED_DIRECTORIES.contains(path.getFileName().toString());
    }

    private static IOException incomplete(String reason) {
        return new IOException("JAVASCRIPT_PRESENCE_INCOMPLETE: " + reason);
    }

    private static String url(String value) {
        if (value == null || value.length() > 512 || !URL.matcher(value).matches())
            throw new IllegalArgumentException("Repository identity must be a GitHub HTTPS owner/repository URL without credentials or query parameters");
        
        return value.endsWith(".git") ? value : value+".git";
    }
}
