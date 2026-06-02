package edu.baylor.ecs.cloudhubs.mvp.MVPBackend;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class BackendChatbotIsolationTest {

    @Test
    void backendDoesNotContainChatbotAgentCodeOrRuntimeWiring() throws IOException {
        List<Path> violations = scan(Path.of("src/main/java"), Path.of("src/main/resources"))
            .filter(Files::isRegularFile)
            .filter(path -> {
                String normalizedPath = path.toString().replace('\\', '/').toLowerCase(Locale.ROOT);
                if (normalizedPath.contains("/target/")) {
                    return false;
                }
                try {
                    String content = Files.readString(path).toLowerCase(Locale.ROOT);
                    return normalizedPath.contains("chatbot")
                        || content.contains("chatbot")
                        || content.contains("chatbotconfig")
                        || content.contains("/chatbot");
                } catch (IOException ex) {
                    throw new IllegalStateException("Unable to inspect " + path, ex);
                }
            })
            .toList();

        assertTrue(
            violations.isEmpty(),
            () -> "Backend module must not contain chatbot code, endpoint routing, or runtime wiring: " + violations);
    }

    private Stream<Path> scan(Path... roots) {
        return Stream.of(roots)
            .filter(Files::exists)
            .flatMap(root -> {
                try {
                    return Files.walk(root);
                } catch (IOException ex) {
                    throw new IllegalStateException("Unable to inspect " + root, ex);
                }
            });
    }
}
