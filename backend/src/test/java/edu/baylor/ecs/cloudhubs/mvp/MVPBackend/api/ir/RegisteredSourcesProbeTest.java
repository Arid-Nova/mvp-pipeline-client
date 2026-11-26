package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.SystemRepository;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.RepoBranch;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.*;

class RegisteredSourcesProbeTest {
    @TempDir Path temporary;

    @Test
    void positiveProbeRecognizesSupportedNamesWithoutParsingOrExecutingSource() throws Exception {
        for (String extension : List.of("js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "TS")) {
            Path root = Files.createTempDirectory(temporary, "extension-");
            Files.writeString(root.resolve("malformed." + extension), "function { SOURCE_MUST_NOT_EXECUTE");
            assertTrue(RegisteredSources.containsJavaScript(root, 2, 0), extension);
        }
    }

    @Test
    void completeAbsenceSkipsExcludedDirectoryContentsEvenAtDepthBoundary() throws Exception {
        Path root = Files.createDirectory(temporary.resolve("absent"));
        Files.writeString(root.resolve("Controller.java"), "class Controller {}");
        for (String name : List.of("node_modules", ".git", "dist", "build", "target", "vendor")) {
            Path hidden = Files.createDirectory(root.resolve(name));
            Files.writeString(hidden.resolve("hidden.ts"), "function {");
        }
        assertFalse(RegisteredSources.containsJavaScript(root, 8, 0));
    }

    @Test
    void exhaustedEntryBudgetDoesNotMeanJavaScriptIsAbsent() throws Exception {
        Path root = Files.createDirectory(temporary.resolve("entries"));
        for (int index = 0; index < 4; index++)
            Files.writeString(root.resolve(index + ".txt"), "no parser input");
        IOException failure = assertThrows(IOException.class,
                () -> RegisteredSources.containsJavaScript(root, 3, 4));
        assertEquals("JAVASCRIPT_PRESENCE_INCOMPLETE: ENTRY_LIMIT", failure.getMessage());
    }

    @Test
    void depthBudgetReportsIncompleteForBothJavaScriptAndNonJavaScriptTrees() throws Exception {
        for (String extension : List.of("txt", "ts")) {
            Path root = Files.createDirectory(temporary.resolve("deep-" + extension));
            Path deepest = Files.createDirectories(root.resolve("a").resolve("b"));
            Files.writeString(deepest.resolve("source." + extension), "not executed");
            IOException failure = assertThrows(IOException.class,
                    () -> RegisteredSources.containsJavaScript(root, 10, 1));
            assertEquals("JAVASCRIPT_PRESENCE_INCOMPLETE: DEPTH_LIMIT", failure.getMessage());
        }
    }

    @Test
    void unreadableOrMissingSourceDoesNotReturnAnAbsenceResult() {
        IOException failure = assertThrows(IOException.class,
                () -> RegisteredSources.containsJavaScript(temporary.resolve("missing"), 10, 1));
        assertEquals("JAVASCRIPT_PRESENCE_INCOMPLETE: READ_FAILURE", failure.getMessage());
    }

    @Test
    void probeLimitsCannotDisableTheProductionHardCaps() {
        assertThrows(IllegalArgumentException.class,
                () -> RegisteredSources.containsJavaScript(temporary, 0, 1));
        assertThrows(IllegalArgumentException.class,
                () -> RegisteredSources.containsJavaScript(temporary,
                        RegisteredSources.JAVASCRIPT_PROBE_ENTRY_LIMIT + 1, 1));
        assertThrows(IllegalArgumentException.class,
                () -> RegisteredSources.containsJavaScript(temporary, 1,
                        RegisteredSources.JAVASCRIPT_PROBE_DEPTH_LIMIT + 1));
    }

    @Test
    void registeredSourceCallerPropagatesIncompleteInspectionBeforeStartingNode() throws Exception {
        Path root = Files.createDirectory(temporary.resolve("registered"));
        Path directory = root;
        for (int depth = 0; depth <= RegisteredSources.JAVASCRIPT_PROBE_DEPTH_LIMIT; depth++)
            directory = Files.createDirectory(directory.resolve("d"));
        Files.writeString(directory.resolve("notes.txt"), "non-JavaScript source");
        ObjectMapper mapper = new ObjectMapper();
        var registry = mapper.createObjectNode();
        registry.putArray("inputs").addObject()
                .put("url", "https://github.com/example/probe.git")
                .put("commit", "a".repeat(40)).put("source", root.toString());
        Path manifest = temporary.resolve("registry.json");
        mapper.writeValue(manifest.toFile(), registry);
        SystemRepository repository = new SystemRepository();
        RepoBranch branch = new RepoBranch();
        branch.setRepositoryURL("https://github.com/example/probe.git");
        branch.setBranchName("main");
        repository.setRepoBranchPair(branch);
        repository.setCommitID("a".repeat(40));
        repository.setComponentName("probe");
        repository.setComponentKind("backend");
        var service = new JavaScriptIRService("vendor/javascript", "unavailable-cimet-node", manifest.toString(), "");
        IOException failure = assertThrows(IOException.class,
                () -> service.extractPolyglot("probe-fixture", List.of(repository)));
        assertEquals("JAVASCRIPT_PRESENCE_INCOMPLETE: DEPTH_LIMIT", failure.getMessage());
    }
}
