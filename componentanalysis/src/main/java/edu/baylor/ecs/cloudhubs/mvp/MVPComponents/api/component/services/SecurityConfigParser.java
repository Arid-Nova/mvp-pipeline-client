package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.BlockStmt;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.SecurityRule;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.PathPatternMatcher;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Parses Spring Security configuration files to extract security rules.
 * Specifically looks for antMatchers() calls in configure(HttpSecurity) method.
 */
public class SecurityConfigParser {

    /**
     * Parse security rules from a SecurityConfig.java file
     *
     * @param securityConfigPath Path to SecurityConfig.java
     * @return List of security rules extracted from the file
     */
    public static List<SecurityRule> parseSecurityConfig(Path securityConfigPath) {
        List<SecurityRule> rules = new ArrayList<>();

        if (securityConfigPath == null || !securityConfigPath.toFile().exists()) {
            return rules;
        }

        try {
            // Parse the file
            CompilationUnit cu = StaticJavaParser.parse(securityConfigPath.toFile());

            // Build variable value map for resolving constants
            Map<String, String> variableValues = extractVariableValues(cu);

            // Find the configure(HttpSecurity) method
            MethodDeclaration configureMethod = findConfigureMethod(cu);
            if (configureMethod == null) {
                return rules;
            }

            // Extract security rules from method calls
            rules.addAll(extractSecurityRules(configureMethod, variableValues));

        } catch (IOException e) {
            // If parsing fails, return empty list
            return rules;
        }

        return rules;
    }

    /**
     * Find the configure(HttpSecurity) method in the compilation unit
     */
    private static MethodDeclaration findConfigureMethod(CompilationUnit cu) {
        for (MethodDeclaration method : cu.findAll(MethodDeclaration.class)) {
            if ("configure".equals(method.getNameAsString())) {
                // Check if it has HttpSecurity parameter
                if (method.getParameters().size() == 1 &&
                    method.getParameter(0).getType().asString().contains("HttpSecurity")) {
                    return method;
                }
            }
        }
        return null;
    }

    /**
     * Extract variable declarations and their values
     */
    private static Map<String, String> extractVariableValues(CompilationUnit cu) {
        Map<String, String> variableValues = new HashMap<>();

        // Extract field declarations
        for (FieldDeclaration field : cu.findAll(FieldDeclaration.class)) {
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
     * Extract security rules from the configure method
     */
    private static List<SecurityRule> extractSecurityRules(MethodDeclaration method, Map<String, String> variableValues) {
        List<SecurityRule> rules = new ArrayList<>();

        if (!method.getBody().isPresent()) {
            return rules;
        }

        BlockStmt body = method.getBody().get();

        // Find all method call expressions
        List<MethodCallExpr> methodCalls = body.findAll(MethodCallExpr.class);

        int ruleOrder = 1000; // Rules defined first have higher priority

        for (MethodCallExpr methodCall : methodCalls) {
            String methodName = methodCall.getNameAsString();

            // Look for antMatchers calls
            if ("antMatchers".equals(methodName)) {
                SecurityRule rule = parseAntMatchersCall(methodCall, variableValues, ruleOrder);
                if (rule != null) {
                    rules.add(rule);
                    ruleOrder--; // Later rules have lower priority
                }
            }

            // Look for anyRequest() - this is a catch-all rule
            if ("anyRequest".equals(methodName)) {
                SecurityRule rule = parseAnyRequestCall(methodCall, variableValues, ruleOrder);
                if (rule != null) {
                    rules.add(rule);
                }
            }
        }

        return rules;
    }

    /**
     * Parse an antMatchers() method call
     *
     * Examples:
     * .antMatchers("/api/**").permitAll()
     * .antMatchers(HttpMethod.POST, "/api/users").hasRole("ADMIN")
     * .antMatchers(HttpMethod.GET, "/api/users/**").hasAnyRole("ADMIN", "USER")
     */
    private static SecurityRule parseAntMatchersCall(MethodCallExpr antMatchersCall,
                                                     Map<String, String> variableValues,
                                                     int baseOrder) {
        SecurityRule rule = new SecurityRule();

        // Parse arguments
        NodeList<Expression> args = antMatchersCall.getArguments();
        if (args.isEmpty()) {
            return null;
        }

        String httpMethod = null;
        List<String> patterns = new ArrayList<>();

        // Parse arguments
        for (Expression arg : args) {
            if (arg instanceof FieldAccessExpr) {
                // This is likely HttpMethod.GET, HttpMethod.POST, etc.
                FieldAccessExpr fieldAccess = (FieldAccessExpr) arg;
                if ("HttpMethod".equals(fieldAccess.getScope().toString())) {
                    httpMethod = fieldAccess.getNameAsString();
                }
            } else if (arg instanceof StringLiteralExpr) {
                // This is a URL pattern
                patterns.add(((StringLiteralExpr) arg).getValue());
            } else if (arg instanceof NameExpr) {
                // This might be a variable reference
                String varName = ((NameExpr) arg).getNameAsString();
                if (variableValues.containsKey(varName)) {
                    patterns.add(variableValues.get(varName));
                }
            }
        }

        if (patterns.isEmpty()) {
            return null;
        }

        // For now, use the first pattern (most antMatchers have single pattern)
        String pattern = patterns.get(0);
        rule.setPattern(pattern);
        rule.setHttpMethod(httpMethod);

        // Calculate priority based on pattern specificity and order
        int specificity = PathPatternMatcher.calculateSpecificity(pattern);
        rule.setPriority(specificity + baseOrder);

        // Find the chained method call after antMatchers to determine access rules
        // .antMatchers(...).hasRole(...) or .antMatchers(...).permitAll()
        parseAccessRestriction(antMatchersCall, rule, variableValues);

        return rule;
    }

    /**
     * Parse anyRequest() call - this is the catch-all rule
     *
     * Examples:
     * .anyRequest().authenticated()
     * .anyRequest().permitAll()
     */
    private static SecurityRule parseAnyRequestCall(MethodCallExpr anyRequestCall,
                                                    Map<String, String> variableValues,
                                                    int baseOrder) {
        SecurityRule rule = new SecurityRule();
        rule.setPattern("/**"); // Match everything
        rule.setHttpMethod(null); // All HTTP methods
        rule.setPriority(100); // Lowest priority (catch-all)

        parseAccessRestriction(anyRequestCall, rule, variableValues);

        return rule;
    }

    /**
     * Parse the chained access restriction method after antMatchers
     *
     * Looks for methods like:
     * - hasRole("ADMIN")
     * - hasAnyRole("ADMIN", "USER")
     * - hasAuthority("WRITE")
     * - hasAnyAuthority("READ", "WRITE")
     * - permitAll()
     * - authenticated()
     * - denyAll()
     */
    private static void parseAccessRestriction(MethodCallExpr antMatchersCall,
                                              SecurityRule rule,
                                              Map<String, String> variableValues) {
        // Walk up the expression tree to find chained method calls
        Node parent = antMatchersCall.getParentNode().orElse(null);

        while (parent != null) {
            if (parent instanceof MethodCallExpr) {
                MethodCallExpr parentCall = (MethodCallExpr) parent;
                String methodName = parentCall.getNameAsString();

                switch (methodName) {
                    case "hasRole":
                        rule.setRequiredRoles(parseRoleArguments(parentCall, variableValues, false));
                        return;
                    case "hasAnyRole":
                        rule.setRequiredRoles(parseRoleArguments(parentCall, variableValues, true));
                        return;
                    case "hasAuthority":
                        rule.setRequiredAuthorities(parseAuthorityArguments(parentCall, variableValues, false));
                        return;
                    case "hasAnyAuthority":
                        rule.setRequiredAuthorities(parseAuthorityArguments(parentCall, variableValues, true));
                        return;
                    case "permitAll":
                        rule.setPermitAll(true);
                        return;
                    case "authenticated":
                        rule.setAuthenticated(true);
                        return;
                    case "denyAll":
                        rule.setDenyAll(true);
                        return;
                }

                // Continue walking up the tree
                parent = parentCall.getParentNode().orElse(null);
            } else {
                // Move to next parent
                parent = parent.getParentNode().orElse(null);
            }
        }
    }

    /**
     * Parse role arguments from hasRole() or hasAnyRole()
     */
    private static List<String> parseRoleArguments(MethodCallExpr methodCall,
                                                   Map<String, String> variableValues,
                                                   boolean isMultiple) {
        List<String> roles = new ArrayList<>();

        for (Expression arg : methodCall.getArguments()) {
            if (arg instanceof StringLiteralExpr) {
                String role = ((StringLiteralExpr) arg).getValue();
                roles.add(role);
            } else if (arg instanceof NameExpr) {
                // Variable reference
                String varName = ((NameExpr) arg).getNameAsString();
                if (variableValues.containsKey(varName)) {
                    roles.add(variableValues.get(varName));
                }
            }
        }

        return roles;
    }

    /**
     * Parse authority arguments from hasAuthority() or hasAnyAuthority()
     */
    private static List<String> parseAuthorityArguments(MethodCallExpr methodCall,
                                                        Map<String, String> variableValues,
                                                        boolean isMultiple) {
        // Same logic as parseRoleArguments
        return parseRoleArguments(methodCall, variableValues, isMultiple);
    }
}
