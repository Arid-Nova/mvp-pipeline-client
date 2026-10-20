package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.IRRequestModel;
import java.nio.file.*;

/** Runs the actual component extraction path without starting Spring, MongoDB or the target app. */
public final class LocalComponentCli {
    public static void main(String[] args) throws Exception {
        if (args.length != 4 || !"--request".equals(args[0]) || !"--output".equals(args[2]))
            throw new IllegalArgumentException("Usage: LocalComponentCli --request request.json --output result.json");
        Path output = Path.of(args[3]).toAbsolutePath();
        if (Files.exists(output)) throw new IllegalArgumentException("Output already exists; choose a new file");
        ObjectMapper mapper = new ObjectMapper();
        IRRequestModel request = mapper.readValue(Path.of(args[1]).toFile(), IRRequestModel.class);
        JavaScriptSourceService sources = new JavaScriptSourceService(env("CIMET_JAVASCRIPT_ADAPTER", "vendor/javascript"),
                env("CIMET_NODE_EXECUTABLE", "node"), env("CIMET_LOCAL_SOURCES_FILE", ""), env("CIMET_JAVASCRIPT_CONFIG", ""));
        long start = System.nanoTime();
        IndexBundle result = new ComponentExtractionService(sources).extract(request);
        Files.createDirectories(output.getParent());
        ObjectNode summary = mapper.createObjectNode();
        summary.put("analysis", "upgraded-pipeline-component-extraction");
        summary.put("extractor", "edu.university.ecs.lab:cimet-extract-lib:1.3.0-polyglot-SNAPSHOT");
        summary.put("indexedEndpoints", result.endpointIndex().getEndpoints().size());
        summary.put("indexedComponents", result.componentIndex().getComponents().size());
        summary.set("metadata", mapper.valueToTree(result.componentIndex().getMetadata()));
        summary.set("analysisCapabilities", mapper.valueToTree(result.componentIndex().getMetadata().getAnalysisCapabilities()));
        summary.put("elapsedMilliseconds", (System.nanoTime() - start) / 1_000_000);
        summary.put("springServerStarted", false);
        summary.put("databasesUsed", false);
        summary.put("targetApplicationExecuted", false);
        summary.put("llmUsed", false);
        summary.set("endpointIndex", mapper.valueToTree(result.endpointIndex()));
        summary.set("componentIndex", mapper.valueToTree(result.componentIndex()));
        try (var stream = Files.newOutputStream(output, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            mapper.writerWithDefaultPrettyPrinter().writeValue(stream, summary);
        }
        System.out.println("Indexed endpoints=" + result.endpointIndex().getEndpoints().size()
                + ", components=" + result.componentIndex().getComponents().size());
    }
    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
