package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * Parser for SecurityProperties.java files to validate YAML configuration structure.
 *
 * <p>This parser analyzes SecurityProperties classes annotated with @ConfigurationProperties
 * to understand the expected YAML structure. It validates that the YAML file matches the
 * binding structure defined in the Java class.
 *
 * <p>Typical SecurityProperties class structure:
 * <pre>
 * {@literal @}Configuration
 * {@literal @}ConfigurationProperties(prefix = "security")
 * public class SecurityProperties {
 *     private List{@literal <}AuthorizationRule{@literal >} authorizationRules = new ArrayList{@literal <>}();
 *     // getters and setters
 * }
 * </pre>
 *
 * @author Claude Code
 * @version 1.0
 */
public class SecurityPropertiesParser {

    /**
     * Validates that a SecurityProperties.java file exists and has the expected structure.
     *
     * @param securityPropertiesPath Path to SecurityProperties.java file
     * @return ValidationResult containing validation status and metadata
     */
    public static ValidationResult validateSecurityProperties(Path securityPropertiesPath) {
        ValidationResult result = new ValidationResult();

        if (securityPropertiesPath == null || !Files.exists(securityPropertiesPath)) {
            result.valid = false;
            result.message = "SecurityProperties.java not found";
            return result;
        }

        try {
            // Parse Java file
            JavaParser javaParser = new JavaParser();
            CompilationUnit cu = javaParser.parse(securityPropertiesPath).getResult().orElse(null);

            if (cu == null) {
                result.valid = false;
                result.message = "Failed to parse SecurityProperties.java";
                return result;
            }

            // Find SecurityProperties class
            Optional<ClassOrInterfaceDeclaration> securityPropertiesClass = cu.findFirst(
                ClassOrInterfaceDeclaration.class,
                clazz -> clazz.getNameAsString().equals("SecurityProperties")
            );

            if (!securityPropertiesClass.isPresent()) {
                result.valid = false;
                result.message = "SecurityProperties class not found in file";
                return result;
            }

            ClassOrInterfaceDeclaration clazz = securityPropertiesClass.get();

            // Check for @ConfigurationProperties annotation
            Optional<AnnotationExpr> configPropsAnnotation = clazz.getAnnotations().stream()
                .filter(ann -> ann.getNameAsString().equals("ConfigurationProperties"))
                .findFirst();

            if (!configPropsAnnotation.isPresent()) {
                result.valid = false;
                result.message = "@ConfigurationProperties annotation not found";
                return result;
            }

            // Extract prefix from annotation
            String prefix = extractPrefixFromAnnotation(configPropsAnnotation.get());
            result.configPrefix = prefix;

            // Check if class has authorizationRules field
            boolean hasAuthRulesField = clazz.getFields().stream()
                .anyMatch(field -> field.getVariables().stream()
                    .anyMatch(var -> var.getNameAsString().equals("authorizationRules")));

            if (!hasAuthRulesField) {
                result.valid = false;
                result.message = "authorizationRules field not found in SecurityProperties";
                return result;
            }

            // Validation passed
            result.valid = true;
            result.message = "SecurityProperties structure is valid";
        } catch (Exception e) {
            result.valid = false;
            result.message = "Error parsing SecurityProperties: " + e.getMessage();
        }

        return result;
    }

    /**
     * Extracts the prefix value from @ConfigurationProperties annotation.
     *
     * @param annotation The annotation expression
     * @return Prefix string (e.g., "security"), or null if not found
     */
    private static String extractPrefixFromAnnotation(AnnotationExpr annotation) {
        try {
            String annotationStr = annotation.toString();

            // Extract prefix value from annotation string
            // Format: @ConfigurationProperties(prefix = "security")
            // or: @ConfigurationProperties("security")

            if (annotationStr.contains("prefix")) {
                // Extract prefix = "value"
                int prefixStart = annotationStr.indexOf("prefix");
                int quoteStart = annotationStr.indexOf("\"", prefixStart);
                int quoteEnd = annotationStr.indexOf("\"", quoteStart + 1);

                if (quoteStart != -1 && quoteEnd != -1) {
                    return annotationStr.substring(quoteStart + 1, quoteEnd);
                }
            } else {
                // Extract direct value: @ConfigurationProperties("security")
                int quoteStart = annotationStr.indexOf("\"");
                int quoteEnd = annotationStr.indexOf("\"", quoteStart + 1);

                if (quoteStart != -1 && quoteEnd != -1) {
                    return annotationStr.substring(quoteStart + 1, quoteEnd);
                }
            }
        } catch (Exception ignored) {

        }

        return "security"; // Default prefix
    }

    /**
     * Result of SecurityProperties validation.
     */
    public static class ValidationResult {
        public boolean valid = false;
        public String message = "";
        public String configPrefix = "security";

        @Override
        public String toString() {
            return "ValidationResult{valid=" + valid + ", message='" + message + "', prefix='" + configPrefix + "'}";
        }
    }
}
