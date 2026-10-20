package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;

/** Uses the production comparison implementation with saved IR files, without databases or target execution. */
public final class LocalJavaScriptDeltaCli {
    public static void main(String[] args) throws Exception {
        if (args.length != 6 || !"--before".equals(args[0]) || !"--after".equals(args[2]) || !"--output".equals(args[4]))
            throw new IllegalArgumentException("Usage: --before SAVED_IR --after SAVED_IR --output NEW_JSON");
        Path before = Path.of(args[1]), after = Path.of(args[3]), output = Path.of(args[5]);
        for (Path source : new Path[]{before, after})
            if (!Files.isRegularFile(source, LinkOption.NOFOLLOW_LINKS) || Files.size(source) > 128L * 1024 * 1024)
                throw new IllegalArgumentException("IR input must be a bounded regular JSON file");
        ObjectMapper mapper = new ObjectMapper();
        var result = new JavaScriptAnalysisDelta().compare(mapper.readTree(before.toFile()), mapper.readTree(after.toFile()));
        Files.write(output, mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(result), StandardOpenOption.CREATE_NEW);
        System.out.println("Compared JavaScript source, architecture and security evidence.");
    }
}
