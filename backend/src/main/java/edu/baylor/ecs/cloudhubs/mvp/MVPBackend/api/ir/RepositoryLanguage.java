package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import java.util.Locale;
import java.util.Set;

/** The request language is a validated hint; the registry selects each source file's parser. */
public final class RepositoryLanguage {
    private RepositoryLanguage() { }
    public static final Set<String> SUPPORTED = Set.of("auto", "polyglot", "java", "javascript", "typescript", "python", "go", "csharp");
    public static String normalize(String language) {
        String value = language == null || language.isBlank() ? "auto" : language.trim().toLowerCase(Locale.ROOT);
        value = switch(value) { case "js" -> "javascript"; case "ts" -> "typescript"; case "c#", "c-sharp" -> "csharp"; default -> value; };
        if (!SUPPORTED.contains(value)) throw new IllegalArgumentException("Supported repository languages: auto, polyglot, java, javascript, typescript, python, go, csharp");
        return value;
    }
    public static boolean javascript(String language) { return Set.of("javascript", "typescript").contains(normalize(language)); }
}
