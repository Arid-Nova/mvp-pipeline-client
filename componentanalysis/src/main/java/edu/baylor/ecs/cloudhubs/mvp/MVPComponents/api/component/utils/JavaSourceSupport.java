package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseProblemException;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;

import java.io.IOException;
import java.nio.file.Path;

/** Isolated Java 21 parsing for source files used by component extraction. */
public final class JavaSourceSupport {
    private JavaSourceSupport() { }

    /** Match the engine's language level without changing shared StaticJavaParser settings. */
    public static CompilationUnit parse(Path source) throws IOException {
        JavaParser parser = new JavaParser(new ParserConfiguration()
                .setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_21));
        var result = parser.parse(source);
        if (!result.isSuccessful() || result.getResult().isEmpty())
            throw new ParseProblemException(result.getProblems());
        return result.getResult().orElseThrow();
    }
}
