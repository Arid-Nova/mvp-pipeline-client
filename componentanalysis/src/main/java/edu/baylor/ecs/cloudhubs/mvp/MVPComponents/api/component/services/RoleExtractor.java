package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;

import java.io.IOException;
import java.nio.file.Path;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts role definitions from Spring Security configuration files.
 * Parses SecurityConfig.java files to find roles defined in hasRole() and hasAnyRole() calls.
 */
public class RoleExtractor {

    // Patterns to match hasRole and hasAnyRole calls
    private static final Pattern HAS_ROLE_PATTERN = Pattern.compile("hasRole\\s*\\(\\s*[\"']([^\"']+)[\"']\\s*\\)");
    private static final Pattern HAS_ANY_ROLE_PATTERN = Pattern.compile("hasAnyRole\\s*\\(([^)]+)\\)");
    private static final Pattern QUOTED_STRING_PATTERN = Pattern.compile("[\"']([^\"']+)[\"']");

    /**
     * Extract all roles from a SecurityConfig.java file
     *
     * @param securityConfigPath Path to the SecurityConfig.java file
     * @return Set of unique roles found in the file
     */
    public static Set<String> extractRolesFromSecurityConfig(Path securityConfigPath) {
        Set<String> roles = new HashSet<>();

        if (securityConfigPath == null || !securityConfigPath.toFile().exists()) {
            return roles;
        }

        try {
            // Parse the security config file
            CompilationUnit cu = StaticJavaParser.parse(securityConfigPath.toFile());

            // Build a map of variable names to their string values
            Map<String, String> variableValues = extractVariableValues(cu);

            // Find all method call expressions
            List<MethodCallExpr> methodCalls = cu.findAll(MethodCallExpr.class);

            for (MethodCallExpr methodCall : methodCalls) {
                String methodName = methodCall.getNameAsString();

                // Check for hasRole() calls
                if ("hasRole".equals(methodName)) {
                    extractRolesFromMethodCall(methodCall, roles, variableValues, false);
                }

                // Check for hasAnyRole() calls
                if ("hasAnyRole".equals(methodName)) {
                    extractRolesFromMethodCall(methodCall, roles, variableValues, true);
                }
            }

        } catch (IOException e) {
            // If parsing fails, return empty set
            return roles;
        }

        return roles;
    }

    /**
     * Extract variable declarations and their string literal values from the compilation unit
     *
     * @param cu The compilation unit to scan
     * @return Map of variable names to their string values
     */
    private static Map<String, String> extractVariableValues(CompilationUnit cu) {
        Map<String, String> variableValues = new HashMap<>();

        // Find all field declarations (class-level variables)
        List<FieldDeclaration> fields = cu.findAll(FieldDeclaration.class);
        for (FieldDeclaration field : fields) {
            for (VariableDeclarator variable : field.getVariables()) {
                if (variable.getInitializer().isPresent() &&
                    variable.getInitializer().get() instanceof StringLiteralExpr) {
                    StringLiteralExpr stringLiteral = (StringLiteralExpr) variable.getInitializer().get();
                    variableValues.put(variable.getNameAsString(), stringLiteral.getValue());
                }
            }
        }

        return variableValues;
    }

    /**
     * Extract roles from a hasRole() or hasAnyRole() method call expression
     *
     * @param methodCall The method call expression
     * @param roles Set to add extracted roles to
     * @param variableValues Map of variable names to their string values
     * @param isMultiRole True if this is hasAnyRole (multiple roles), false for hasRole (single role)
     */
    private static void extractRolesFromMethodCall(MethodCallExpr methodCall, Set<String> roles,
                                                   Map<String, String> variableValues, boolean isMultiRole) {
        if (methodCall.getArguments().isEmpty()) {
            return;
        }

        // Process each argument
        methodCall.getArguments().forEach(arg -> {
            String argString = arg.toString();

            // Check if this is a string literal (quoted)
            if (argString.startsWith("\"") || argString.startsWith("'")) {
                // Extract the string literal value
                String cleanedArg = argString.replaceAll("[\"']", "").trim();
                if (!cleanedArg.isEmpty()) {
                    roles.add(cleanedArg);
                }
            } else {
                // This might be a variable reference - try to resolve it
                String variableName = argString.trim();

                // Check if this variable exists in our map
                if (variableValues.containsKey(variableName)) {
                    // Use the actual value instead of the variable name
                    String actualValue = variableValues.get(variableName);
                    if (actualValue != null && !actualValue.isEmpty()) {
                        roles.add(actualValue);
                    }
                } else {
                    // If we can't resolve it, try to extract quoted strings using regex
                    Matcher matcher = QUOTED_STRING_PATTERN.matcher(argString);
                    while (matcher.find()) {
                        String role = matcher.group(1).trim();
                        if (!role.isEmpty()) {
                            roles.add(role);
                        }
                    }
                }
            }
        });
    }

    /**
     * Extract all roles from a SecurityConfig.java file using regex-based parsing
     * This is a fallback method when JavaParser fails or for additional coverage
     *
     * @param securityConfigPath Path to the SecurityConfig.java file
     * @return Set of unique roles found in the file
     */
    public static Set<String> extractRolesUsingRegex(Path securityConfigPath) {
        Set<String> roles = new HashSet<>();

        if (securityConfigPath == null || !securityConfigPath.toFile().exists()) {
            return roles;
        }

        try {
            // Read the entire file content
            String content = java.nio.file.Files.readString(securityConfigPath);

            // Extract roles from hasRole() calls
            Matcher hasRoleMatcher = HAS_ROLE_PATTERN.matcher(content);
            while (hasRoleMatcher.find()) {
                String role = hasRoleMatcher.group(1).trim();
                if (!role.isEmpty()) {
                    roles.add(role);
                }
            }

            // Extract roles from hasAnyRole() calls
            Matcher hasAnyRoleMatcher = HAS_ANY_ROLE_PATTERN.matcher(content);
            while (hasAnyRoleMatcher.find()) {
                String rolesString = hasAnyRoleMatcher.group(1);

                // Extract individual roles from the comma-separated list
                Matcher quotedMatcher = QUOTED_STRING_PATTERN.matcher(rolesString);
                while (quotedMatcher.find()) {
                    String role = quotedMatcher.group(1).trim();
                    if (!role.isEmpty()) {
                        roles.add(role);
                    }
                }
            }

        } catch (IOException e) {
            // If reading fails, return empty set
            return roles;
        }

        return roles;
    }

    /**
     * Extract all roles from a SecurityConfig file, trying both JavaParser and regex methods
     *
     * @param securityConfigPath Path to the SecurityConfig.java file
     * @return Set of unique roles found in the file
     */
    public static Set<String> extractRoles(Path securityConfigPath) {
        Set<String> roles = new HashSet<>();

        // Try JavaParser method first
        roles.addAll(extractRolesFromSecurityConfig(securityConfigPath));

        // Also try regex method for additional coverage
        roles.addAll(extractRolesUsingRegex(securityConfigPath));

        return roles;
    }

    /**
     * Normalize role name by removing common prefixes
     * Spring Security sometimes uses "ROLE_" prefix which should be removed for consistency
     *
     * @param role The role name to normalize
     * @return Normalized role name
     */
    public static String normalizeRole(String role) {
        if (role == null || role.isEmpty()) {
            return role;
        }

        // Remove ROLE_ prefix if present
        if (role.startsWith("ROLE_")) {
            return role.substring(5);
        }

        return role;
    }

    /**
     * Extract and normalize all roles from a SecurityConfig file
     *
     * @param securityConfigPath Path to the SecurityConfig.java file
     * @return Set of unique normalized roles
     */
    public static Set<String> extractAndNormalizeRoles(Path securityConfigPath) {
        Set<String> roles = extractRoles(securityConfigPath);
        Set<String> normalizedRoles = new HashSet<>();

        for (String role : roles) {
            normalizedRoles.add(normalizeRole(role));
        }

        return normalizedRoles;
    }
}
