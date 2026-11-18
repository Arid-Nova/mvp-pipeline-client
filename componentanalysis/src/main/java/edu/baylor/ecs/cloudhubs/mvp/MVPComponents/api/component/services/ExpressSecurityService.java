package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** Runs the trusted Express analyzer; source is parsed as data and never executed. */
public final class ExpressSecurityService {
    private static final long MAX_BYTES = 64L * 1024 * 1024;
    private final ObjectMapper mapper = new ObjectMapper();
    private final Path adapter;
    private final String node;

    public ExpressSecurityService(Path adapter, String node) {
        this.adapter = adapter.toAbsolutePath().normalize();
        this.node = node;
    }

    public ObjectNode analyze(Path source, ObjectNode snapshot) throws IOException, InterruptedException {
        return analyze(source, snapshot, mapper.createObjectNode());
    }

    public ObjectNode analyze(Path source, ObjectNode snapshot, JsonNode profile) throws IOException, InterruptedException {
        Path entry = adapter.resolve("analyzer.cjs");
        if (!Files.isRegularFile(entry, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("Express security adapter is missing; run scripts/vendor_javascript_security.py and install its locked dependencies");
        }
        ObjectNode input = mapper.createObjectNode();
        input.put("sourceRoot", source.toString());
        input.set("component", snapshot.path("component").deepCopy());
        input.set("snapshot", snapshot);
        if (profile != null && !profile.isMissingNode() && !profile.isNull()) {
            if (!profile.isObject() || mapper.writeValueAsBytes(profile).length > 64 * 1024)
                throw new IOException("Express analysis profile must be a bounded object");
            input.set("analysisProfile", profile.deepCopy());
        }
        byte[] bytes = mapper.writeValueAsBytes(input);
        if (bytes.length > 32L * 1024 * 1024) throw new IOException("Express security input exceeds the supported size");
        Path directory = Files.createTempDirectory("aridnova-express-");
        Path request = directory.resolve("input.json"), output = directory.resolve("output.json"), log = directory.resolve("process.log");
        Process process = null;
        try {
            Files.write(request, bytes);
            process = new ProcessBuilder(node, "--max-old-space-size=512", entry.toString(),
                    "--input", request.toString(), "--output", output.toString())
                    .directory(adapter.toFile()).redirectErrorStream(true).redirectOutput(log.toFile()).start();
            if (!process.waitFor(90, TimeUnit.SECONDS)) throw new IOException("Express security analysis timed out");
            if (process.exitValue() != 0) throw new IOException("Express security analyzer failed; no security verdict was saved");
            if (!Files.isRegularFile(output, LinkOption.NOFOLLOW_LINKS) || Files.size(output) > MAX_BYTES) {
                throw new IOException("Express security output is missing or exceeds the supported size");
            }
            JsonNode report = mapper.readTree(Files.readAllBytes(output));
            validate(report, snapshot);
            return (ObjectNode) report;
        } finally {
            if (process != null && process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                process.waitFor(5, TimeUnit.SECONDS);
            }
            Files.deleteIfExists(request);
            Files.deleteIfExists(output);
            Files.deleteIfExists(log);
            Files.deleteIfExists(directory);
        }
    }

    static void validate(JsonNode report, JsonNode snapshot) throws IOException {
        if (report == null || !report.isObject() || report.path("schemaVersion").asInt() != 1
                || !"aridnova-express-security".equals(report.path("analyzer").asText())
                || !Set.of("partial", "complete").contains(report.path("status").asText())
                || !report.path("sourceDigest").asText().matches("[a-f0-9]{64}")
                || !report.path("endpoints").isArray() || !report.path("findings").isArray()
                || !report.path("coverage").isObject() || !report.path("limitations").isArray()) {
            throw new IOException("Invalid Express security report envelope");
        }
        for (String field : List.of("name", "kind", "repositoryURL", "commit")) {
            if (!report.path("component").path(field).equals(snapshot.path("component").path(field))) {
                throw new IOException("Express security report source identity does not match the extracted snapshot");
            }
        }
        Set<String> expected = new HashSet<>(), actual = new HashSet<>();
        snapshot.path("endpoints").forEach(endpoint -> expected.add(endpoint.path("id").asText()));
        for (JsonNode endpoint : report.path("endpoints")) {
            String id = endpoint.path("endpointId").asText();
            if (!expected.contains(id) || !actual.add(id)
                    || !Set.of("required", "optional", "not-observed", "unknown").contains(endpoint.path("authentication").path("status").asText())) {
                throw new IOException("Express security report contains invalid endpoint bindings");
            }
        }
        if (!expected.equals(actual)) throw new IOException("Express security report omitted endpoint coverage records");
    }

    public static ObjectNode aggregate(List<JsonNode> snapshots) {
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode result = mapper.createObjectNode();
        result.put("schemaVersion", 1);
        result.put("analyzer", "aridnova-express-security");
        var reports = result.putArray("components");
        int backends = 0;
        for (JsonNode snapshot : snapshots) {
            if ("backend".equals(snapshot.path("component").path("kind").asText())) {
                backends++;
                if (snapshot.path("security").isObject()) reports.add(snapshot.path("security"));
            }
        }
        boolean complete = reports.size() == backends && backends > 0;
        for (JsonNode report : reports) complete &= "complete".equals(report.path("status").asText());
        result.put("status", backends == 0 ? "not-applicable" : reports.size() != backends ? "unsupported" : complete ? "complete" : "partial");
        result.put("completionScope", "declared-static-security-properties");
        result.putObject("coverage").put("declaredBackends", backends).put("analyzedBackends", reports.size());
        result.putArray("limitations").add("Static Express source evidence; dynamic dispatch and deployment policies may be unresolved.")
                .add("Observed guards and paths do not establish vulnerability absence or a complete formal authorization model.");
        return result;
    }
}
