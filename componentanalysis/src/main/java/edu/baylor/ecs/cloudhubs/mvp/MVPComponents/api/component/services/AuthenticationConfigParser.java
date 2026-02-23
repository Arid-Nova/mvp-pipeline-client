package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.BlockStmt;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.AuthenticationMechanism;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.SecurityFeaturesInfo;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Parses Spring Security configuration to extract authentication mechanism and security features.
 * Analyzes SecurityConfig.java and related configuration files.
 */
public class AuthenticationConfigParser {

    /**
     * Parse authentication configuration from SecurityConfig.java
     *
     * @param securityConfigPath Path to SecurityConfig.java
     * @return Authentication mechanism and security features
     */
    public static ParsedSecurityConfig parseSecurityConfig(Path securityConfigPath) {
        ParsedSecurityConfig config = new ParsedSecurityConfig();

        if (securityConfigPath == null || !securityConfigPath.toFile().exists()) {
            return config;
        }

        try {
            CompilationUnit cu = StaticJavaParser.parse(securityConfigPath.toFile());

            // Extract authentication mechanism
            config.authenticationMechanism = extractAuthenticationMechanism(cu);

            // Extract security features
            config.securityFeatures = extractSecurityFeatures(cu);

        } catch (IOException e) {
            // Return empty config on error
        }

        return config;
    }

    /**
     * Extract authentication mechanism from SecurityConfig
     */
    private static AuthenticationMechanism extractAuthenticationMechanism(CompilationUnit cu) {
        // Find configure(HttpSecurity) method
        MethodDeclaration configureMethod = findConfigureMethod(cu);
        if (configureMethod == null) {
            return AuthenticationMechanism.createNone();
        }

        // Check for JWT filter
        if (hasJWTFilter(configureMethod)) {
            return extractJWTMechanism(cu);
        }

        // Check for OAuth2
        if (hasOAuth2ResourceServer(configureMethod)) {
            return AuthenticationMechanism.createOAuth2("Authorization", "Bearer ");
        }

        // Check for HTTP Basic
        if (hasHttpBasicEnabled(configureMethod)) {
            return AuthenticationMechanism.createBasic();
        }

        // Check for session-based (form login)
        if (hasFormLogin(configureMethod)) {
            return AuthenticationMechanism.createSession();
        }

        // Default: no specific authentication
        return AuthenticationMechanism.createNone();
    }

    /**
     * Extract JWT authentication mechanism details
     */
    private static AuthenticationMechanism extractJWTMechanism(CompilationUnit cu) {
        AuthenticationMechanism jwt = AuthenticationMechanism.createJWT("Authorization", "Bearer ");

        // Try to find JWT utility class for more details
        // Look for imports of JWT-related classes
        cu.getImports().forEach(importDecl -> {
            String importName = importDecl.getNameAsString();
            if (importName.contains("jwt") || importName.contains("JWT")) {
                // JWT mechanism confirmed
                jwt.setTokenFormat("JWT");
            }
        });

        return jwt;
    }

    /**
     * Extract security features configuration
     */
    private static SecurityFeaturesInfo extractSecurityFeatures(CompilationUnit cu) {
        SecurityFeaturesInfo features = SecurityFeaturesInfo.createDefault();

        // Find configure(HttpSecurity) method
        MethodDeclaration configureMethod = findConfigureMethod(cu);
        if (configureMethod == null) {
            return features;
        }

        BlockStmt body = configureMethod.getBody().orElse(null);
        if (body == null) {
            return features;
        }

        List<MethodCallExpr> methodCalls = body.findAll(MethodCallExpr.class);

        // Extract session management
        features.setSessionManagement(extractSessionManagement(methodCalls));

        // Extract CORS from corsConfigurer bean
        features.setCors(extractCorsConfig(cu));

        // Extract security feature flags
        features.setCsrfEnabled(!hasFeatureDisabled(methodCalls, "csrf"));
        features.setHttpBasicEnabled(!hasFeatureDisabled(methodCalls, "httpBasic"));
        features.setFormLoginEnabled(hasFeatureEnabled(methodCalls, "formLogin"));
        features.setLogoutEnabled(hasFeatureEnabled(methodCalls, "logout"));
        features.setCacheControlEnabled(hasFeatureEnabled(methodCalls, "cacheControl"));

        // Extract custom filters
        features.setCustomFilters(extractCustomFilters(methodCalls));

        // Extract password encoder
        features.setPasswordEncoder(extractPasswordEncoder(cu));

        return features;
    }

    /**
     * Extract session management configuration
     */
    private static SecurityFeaturesInfo.SessionManagementConfig extractSessionManagement(List<MethodCallExpr> methodCalls) {
        SecurityFeaturesInfo.SessionManagementConfig config = new SecurityFeaturesInfo.SessionManagementConfig();

        for (MethodCallExpr call : methodCalls) {
            if ("sessionCreationPolicy".equals(call.getNameAsString()) && !call.getArguments().isEmpty()) {
                Expression arg = call.getArguments().get(0);
                if (arg instanceof FieldAccessExpr) {
                    FieldAccessExpr fieldAccess = (FieldAccessExpr) arg;
                    String policyName = fieldAccess.getNameAsString();
                    try {
                        SecurityFeaturesInfo.SessionManagementConfig.SessionCreationPolicy policy =
                                SecurityFeaturesInfo.SessionManagementConfig.SessionCreationPolicy.valueOf(policyName);
                        config.setPolicy(policy);
                        config.setCreatesSession(policy != SecurityFeaturesInfo.SessionManagementConfig.SessionCreationPolicy.STATELESS);
                    } catch (IllegalArgumentException e) {
                        // Unknown policy, skip
                    }
                }
            }

            if ("maximumSessions".equals(call.getNameAsString()) && !call.getArguments().isEmpty()) {
                Expression arg = call.getArguments().get(0);
                if (arg instanceof IntegerLiteralExpr) {
                    config.setMaxSessions(((IntegerLiteralExpr) arg).asInt());
                }
            }

            if ("invalidSessionUrl".equals(call.getNameAsString()) && !call.getArguments().isEmpty()) {
                Expression arg = call.getArguments().get(0);
                if (arg instanceof StringLiteralExpr) {
                    config.setInvalidSessionUrl(((StringLiteralExpr) arg).getValue());
                }
            }
        }

        return config;
    }

    /**
     * Extract CORS configuration from corsConfigurer bean
     */
    private static SecurityFeaturesInfo.CorsConfig extractCorsConfig(CompilationUnit cu) {
        // Find corsConfigurer() method
        MethodDeclaration corsMethod = cu.findAll(MethodDeclaration.class).stream()
                .filter(m -> "corsConfigurer".equals(m.getNameAsString()))
                .findFirst()
                .orElse(null);

        if (corsMethod == null) {
            return null;
        }

        SecurityFeaturesInfo.CorsConfig config = new SecurityFeaturesInfo.CorsConfig();
        config.setAllowedOrigins(new ArrayList<>());
        config.setAllowedMethods(new ArrayList<>());
        config.setAllowedHeaders(new ArrayList<>());

        List<MethodCallExpr> methodCalls = corsMethod.findAll(MethodCallExpr.class);

        for (MethodCallExpr call : methodCalls) {
            String methodName = call.getNameAsString();

            if ("allowedOrigins".equals(methodName)) {
                config.setAllowedOrigins(extractStringListFromArgs(call.getArguments()));
            } else if ("allowedMethods".equals(methodName)) {
                config.setAllowedMethods(extractStringListFromArgs(call.getArguments()));
            } else if ("allowedHeaders".equals(methodName)) {
                config.setAllowedHeaders(extractStringListFromArgs(call.getArguments()));
            } else if ("allowCredentials".equals(methodName) && !call.getArguments().isEmpty()) {
                Expression arg = call.getArguments().get(0);
                if (arg instanceof BooleanLiteralExpr) {
                    config.setAllowCredentials(((BooleanLiteralExpr) arg).getValue());
                }
            } else if ("maxAge".equals(methodName) && !call.getArguments().isEmpty()) {
                Expression arg = call.getArguments().get(0);
                if (arg instanceof IntegerLiteralExpr) {
                    config.setMaxAge(((IntegerLiteralExpr) arg).asInt());
                } else if (arg instanceof LongLiteralExpr) {
                    config.setMaxAge((int) ((LongLiteralExpr) arg).asLong());
                }
            }
        }

        return config;
    }

    /**
     * Extract password encoder configuration
     */
    private static SecurityFeaturesInfo.PasswordEncoderConfig extractPasswordEncoder(CompilationUnit cu) {
        // Find passwordEncoder() bean method
        MethodDeclaration encoderMethod = cu.findAll(MethodDeclaration.class).stream()
                .filter(m -> "passwordEncoder".equals(m.getNameAsString()))
                .findFirst()
                .orElse(null);

        if (encoderMethod == null) {
            return null;
        }

        SecurityFeaturesInfo.PasswordEncoderConfig config = new SecurityFeaturesInfo.PasswordEncoderConfig();

        // Look for return statement
        encoderMethod.findAll(ObjectCreationExpr.class).forEach(creation -> {
            String typeName = creation.getType().getNameAsString();
            if (typeName.contains("BCrypt")) {
                config.setType(SecurityFeaturesInfo.PasswordEncoderConfig.PasswordEncoderType.BCRYPT);
                // BCrypt default strength is 10
                if (!creation.getArguments().isEmpty()) {
                    Expression arg = creation.getArguments().get(0);
                    if (arg instanceof IntegerLiteralExpr) {
                        config.setStrength(((IntegerLiteralExpr) arg).asInt());
                    }
                }
            } else if (typeName.contains("SCrypt")) {
                config.setType(SecurityFeaturesInfo.PasswordEncoderConfig.PasswordEncoderType.SCRYPT);
            } else if (typeName.contains("Argon2")) {
                config.setType(SecurityFeaturesInfo.PasswordEncoderConfig.PasswordEncoderType.ARGON2);
            } else if (typeName.contains("Pbkdf2") || typeName.contains("PBKDF2")) {
                config.setType(SecurityFeaturesInfo.PasswordEncoderConfig.PasswordEncoderType.PBKDF2);
            }
        });

        return config;
    }

    /**
     * Extract custom filters from filter chain
     */
    private static List<String> extractCustomFilters(List<MethodCallExpr> methodCalls) {
        List<String> filters = new ArrayList<>();

        for (MethodCallExpr call : methodCalls) {
            String methodName = call.getNameAsString();
            if (methodName.startsWith("addFilterBefore") || methodName.startsWith("addFilterAfter") ||
                    methodName.equals("addFilter")) {
                if (!call.getArguments().isEmpty()) {
                    Expression arg = call.getArguments().get(0);
                    if (arg instanceof ObjectCreationExpr) {
                        ObjectCreationExpr creation = (ObjectCreationExpr) arg;
                        String filterName = creation.getType().getNameAsString();
                        filters.add(filterName);
                    }
                }
            }
        }

        return filters;
    }

    // ============== HELPER METHODS ==============

    /**
     * Find configure(HttpSecurity) method
     */
    private static MethodDeclaration findConfigureMethod(CompilationUnit cu) {
        return cu.findAll(MethodDeclaration.class).stream()
                .filter(m -> "configure".equals(m.getNameAsString()))
                .filter(m -> m.getParameters().size() == 1 &&
                        m.getParameter(0).getType().asString().contains("HttpSecurity"))
                .findFirst()
                .orElse(null);
    }

    /**
     * Check if JWT filter is configured
     */
    private static boolean hasJWTFilter(MethodDeclaration method) {
        return method.findAll(ObjectCreationExpr.class).stream()
                .anyMatch(creation -> creation.getType().getNameAsString().contains("JWT"));
    }

    /**
     * Check if OAuth2 resource server is configured
     */
    private static boolean hasOAuth2ResourceServer(MethodDeclaration method) {
        return method.findAll(MethodCallExpr.class).stream()
                .anyMatch(call -> call.getNameAsString().contains("oauth2ResourceServer"));
    }

    /**
     * Check if HTTP Basic is enabled
     */
    private static boolean hasHttpBasicEnabled(MethodDeclaration method) {
        List<MethodCallExpr> methodCalls = method.findAll(MethodCallExpr.class);
        for (MethodCallExpr call : methodCalls) {
            if ("httpBasic".equals(call.getNameAsString())) {
                // Check if it's followed by .disable()
                if (call.getParentNode().isPresent() &&
                        call.getParentNode().get() instanceof MethodCallExpr) {
                    MethodCallExpr parent = (MethodCallExpr) call.getParentNode().get();
                    if ("disable".equals(parent.getNameAsString())) {
                        return false;
                    }
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Check if form login is configured
     */
    private static boolean hasFormLogin(MethodDeclaration method) {
        return method.findAll(MethodCallExpr.class).stream()
                .anyMatch(call -> "formLogin".equals(call.getNameAsString()));
    }

    /**
     * Check if a feature is explicitly disabled
     */
    private static boolean hasFeatureDisabled(List<MethodCallExpr> methodCalls, String featureName) {
        for (MethodCallExpr call : methodCalls) {
            if (featureName.equals(call.getNameAsString())) {
                // Look for chained .disable()
                if (call.getParentNode().isPresent() &&
                        call.getParentNode().get() instanceof MethodCallExpr) {
                    MethodCallExpr parent = (MethodCallExpr) call.getParentNode().get();
                    if ("disable".equals(parent.getNameAsString())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Check if a feature is explicitly enabled
     */
    private static boolean hasFeatureEnabled(List<MethodCallExpr> methodCalls, String featureName) {
        return methodCalls.stream()
                .anyMatch(call -> featureName.equals(call.getNameAsString()));
    }

    /**
     * Extract string list from method arguments
     */
    private static List<String> extractStringListFromArgs(List<Expression> args) {
        List<String> result = new ArrayList<>();
        for (Expression arg : args) {
            if (arg instanceof StringLiteralExpr) {
                result.add(((StringLiteralExpr) arg).getValue());
            } else if (arg instanceof FieldAccessExpr) {
                // Handle constants like ALL
                result.add("*");
            }
        }
        return result;
    }

    /**
     * Parsed security configuration result
     */
    public static class ParsedSecurityConfig {
        public AuthenticationMechanism authenticationMechanism;
        public SecurityFeaturesInfo securityFeatures;

        public ParsedSecurityConfig() {
            this.authenticationMechanism = AuthenticationMechanism.createNone();
            this.securityFeatures = SecurityFeaturesInfo.createDefault();
        }
    }
}
