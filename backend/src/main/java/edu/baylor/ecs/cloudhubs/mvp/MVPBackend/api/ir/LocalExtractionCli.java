package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.IRRequestModel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/** Runs the same IRService extraction stage without starting Spring, a database, or downstream stages. */
public final class LocalExtractionCli {
    private LocalExtractionCli() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 4 || !"--request".equals(args[0]) || !"--output".equals(args[2])) {
            throw new IllegalArgumentException("Usage: LocalExtractionCli --request request.json --output ir.json");
        }
        Path request = Path.of(args[1]), output = Path.of(args[3]);
        if (!Files.isRegularFile(request) || Files.size(request) > 128 * 1024) {
            throw new IllegalArgumentException("Request must be a JSON file no larger than 128 KiB");
        }
        if (Files.exists(output)) throw new IllegalArgumentException("Output already exists; choose a new path");
        ObjectMapper mapper = new ObjectMapper();
        IRRequestModel input = mapper.readValue(Files.readAllBytes(request), IRRequestModel.class);
        JavaScriptIRService javascript = new JavaScriptIRService(
                setting("CIMET_JAVASCRIPT_ADAPTER", "vendor/javascript"),
                setting("CIMET_NODE_EXECUTABLE", "node"),
                setting("CIMET_LOCAL_SOURCES_FILE", ""),
                setting("CIMET_JAVASCRIPT_CONFIG", ""));
        ObjectNode result = new IRService(null, javascript).extractIR(input);
        if (output.toAbsolutePath().getParent() != null) Files.createDirectories(output.toAbsolutePath().getParent());
        Files.write(output, mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(result), StandardOpenOption.CREATE_NEW);
        System.out.println("IR extracted locally: " + result.path("microservices").size() + " backend components, "
                + result.path("orphans").size() + " orphan modules; no downstream pipeline stages were invoked.");
    }

    private static String setting(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
