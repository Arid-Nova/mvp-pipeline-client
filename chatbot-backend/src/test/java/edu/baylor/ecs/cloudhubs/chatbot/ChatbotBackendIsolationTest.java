package edu.baylor.ecs.cloudhubs.chatbot;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class ChatbotBackendIsolationTest {

    @Test
    void mainSourcesDoNotReferenceMvpBackendPackages() throws Exception {
        Path sourceRoot = Path.of("src/main/java");
        List<Path> leakingFiles;
        try (var paths = Files.walk(sourceRoot)) {
            leakingFiles = paths
                .filter(path -> path.toString().endsWith(".java"))
                .filter(path -> containsMvpBackendReference(path))
                .toList();
        }

        assertThat(leakingFiles).isEmpty();
    }

    private boolean containsMvpBackendReference(Path path) {
        try {
            String source = Files.readString(path);
            return source.contains("MVPBackend")
                || source.contains("edu.baylor.ecs.cloudhubs.mvp");
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to read " + path, ex);
        }
    }
}
