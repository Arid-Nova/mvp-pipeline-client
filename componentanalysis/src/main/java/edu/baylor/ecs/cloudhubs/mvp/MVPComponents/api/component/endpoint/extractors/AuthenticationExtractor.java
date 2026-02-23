package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.AuthenticationInfo;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts authentication and authorization information from Spring Security annotations.
 * Supports @PreAuthorize, @Secured, @RolesAllowed, @PermitAll, and OAuth2 scopes.
 */
public class AuthenticationExtractor {

    private static final List<String> AUTH_ANNOTATIONS = Arrays.asList(
        "PreAuthorize", "Secured", "RolesAllowed", "Authenticated"
    );

    private static final List<String> PERMIT_ALL_ANNOTATIONS = Arrays.asList(
        "PermitAll", "AllowAnonymous"
    );

    /**
     * Extract authentication info from method and class annotations.
     * Method-level annotations override class-level annotations.
     */
    public static AuthenticationInfo extractAuthentication(
        MethodDeclaration method,
        com.github.javaparser.ast.body.ClassOrInterfaceDeclaration clazz
    ) {
        // Check method-level annotations first
        AuthenticationInfo methodAuth = checkAnnotations(method.getAnnotations());

        // If method has @PermitAll, return public access
        if (methodAuth != null && methodAuth.isPermitAll()) {
            return methodAuth;
        }

        // If method has security annotations, use those
        if (methodAuth != null && methodAuth.isRequired()) {
            return methodAuth;
        }

        // Check class-level annotations if method has no security
        if (clazz != null) {
            AuthenticationInfo classAuth = checkAnnotations(clazz.getAnnotations());
            if (classAuth != null) {
                return classAuth;
            }
        }

        // No security annotations found - public endpoint
        return AuthenticationInfo.createPublic();
    }

    /**
     * Check a list of annotations for security-related annotations
     */
    private static AuthenticationInfo checkAnnotations(NodeList<AnnotationExpr> annotations) {
        AuthenticationInfo authInfo = null;

        for (AnnotationExpr annotation : annotations) {
            String annotationName = annotation.getNameAsString();

            // Check for @PermitAll
            if (PERMIT_ALL_ANNOTATIONS.contains(annotationName)) {
                return AuthenticationInfo.createPublic();
            }

            // Check for @PreAuthorize
            if ("PreAuthorize".equals(annotationName)) {
                if (authInfo == null) {
                    authInfo = new AuthenticationInfo();
                }
                authInfo.setRequired(true);

                // Parse SpEL expression
                if (annotation instanceof SingleMemberAnnotationExpr) {
                    String value = ((SingleMemberAnnotationExpr) annotation)
                        .getMemberValue().toString();
                    // Remove quotes
                    value = value.replaceAll("^\"|\"$", "");
                    authInfo.setSpelExpression(value);

                    // Extract roles from SpEL
                    List<String> roles = extractRolesFromSpEL(value);
                    if (!roles.isEmpty()) {
                        authInfo.setRequiredRoles(roles);
                    }

                    // Extract authorities from SpEL
                    List<String> authorities = extractAuthoritiesFromSpEL(value);
                    if (!authorities.isEmpty()) {
                        authInfo.setRequiredAuthorities(authorities);
                    }

                    // Extract OAuth2 scopes
                    List<String> scopes = extractOAuth2ScopesFromSpEL(value);
                    if (!scopes.isEmpty()) {
                        authInfo.setOauthScopes(scopes);
                        authInfo.setAuthenticationType("OAUTH2");
                    }
                }
            }

            // Check for @Secured
            if ("Secured".equals(annotationName)) {
                if (authInfo == null) {
                    authInfo = new AuthenticationInfo();
                }
                authInfo.setRequired(true);

                // Parse roles array
                if (annotation instanceof SingleMemberAnnotationExpr) {
                    List<String> roles = parseRolesArray(
                        ((SingleMemberAnnotationExpr) annotation).getMemberValue()
                    );
                    authInfo.setRequiredRoles(roles);
                }
            }

            // Check for @RolesAllowed
            if ("RolesAllowed".equals(annotationName)) {
                if (authInfo == null) {
                    authInfo = new AuthenticationInfo();
                }
                authInfo.setRequired(true);

                // Parse roles array
                if (annotation instanceof SingleMemberAnnotationExpr) {
                    List<String> roles = parseRolesArray(
                        ((SingleMemberAnnotationExpr) annotation).getMemberValue()
                    );
                    authInfo.setRequiredRoles(roles);
                }
            }

            // Check for @Authenticated
            if ("Authenticated".equals(annotationName)) {
                if (authInfo == null) {
                    authInfo = new AuthenticationInfo();
                }
                authInfo.setRequired(true);
            }
        }

        // Set default failure statuses if auth is required
        if (authInfo != null && authInfo.isRequired()) {
            if (authInfo.getAuthFailureStatuses() == null) {
                authInfo.setAuthFailureStatuses(
                    AuthenticationInfo.createPublic().getAuthFailureStatuses()
                );
            }
        }

        return authInfo;
    }

    /**
     * Extract roles from SpEL expression.
     * Handles: hasRole('ADMIN'), hasAnyRole('ADMIN', 'USER')
     */
    private static List<String> extractRolesFromSpEL(String spel) {
        List<String> roles = new ArrayList<>();

        // Pattern for hasRole('ROLE') or hasAnyRole('ROLE1', 'ROLE2')
        Pattern pattern = Pattern.compile("hasAnyRole\\s*\\(([^)]+)\\)|hasRole\\s*\\(['\"]([^'\"]+)['\"]\\)");
        Matcher matcher = pattern.matcher(spel);

        while (matcher.find()) {
            if (matcher.group(1) != null) {
                // hasAnyRole with multiple roles
                String rolesStr = matcher.group(1);
                String[] roleParts = rolesStr.split(",");
                for (String part : roleParts) {
                    String role = part.trim().replaceAll("['\"]", "");
                    roles.add(role);
                }
            } else if (matcher.group(2) != null) {
                // hasRole with single role
                roles.add(matcher.group(2));
            }
        }

        return roles;
    }

    /**
     * Extract authorities from SpEL expression.
     * Handles: hasAuthority('WRITE_PRIVILEGE'), hasAnyAuthority('READ', 'WRITE')
     */
    private static List<String> extractAuthoritiesFromSpEL(String spel) {
        List<String> authorities = new ArrayList<>();

        // Pattern for hasAuthority or hasAnyAuthority
        Pattern pattern = Pattern.compile("hasAnyAuthority\\s*\\(([^)]+)\\)|hasAuthority\\s*\\(['\"]([^'\"]+)['\"]\\)");
        Matcher matcher = pattern.matcher(spel);

        while (matcher.find()) {
            if (matcher.group(1) != null) {
                // hasAnyAuthority with multiple authorities
                String authStr = matcher.group(1);
                String[] authParts = authStr.split(",");
                for (String part : authParts) {
                    String auth = part.trim().replaceAll("['\"]", "");
                    // Filter out OAuth2 scopes (they start with SCOPE_)
                    if (!auth.startsWith("SCOPE_")) {
                        authorities.add(auth);
                    }
                }
            } else if (matcher.group(2) != null) {
                // hasAuthority with single authority
                String auth = matcher.group(2);
                if (!auth.startsWith("SCOPE_")) {
                    authorities.add(auth);
                }
            }
        }

        return authorities;
    }

    /**
     * Extract OAuth2 scopes from SpEL expression.
     * OAuth2 scopes typically start with SCOPE_ prefix.
     */
    private static List<String> extractOAuth2ScopesFromSpEL(String spel) {
        List<String> scopes = new ArrayList<>();

        // Pattern for authorities that start with SCOPE_
        Pattern pattern = Pattern.compile("hasAuthority\\s*\\(['\"]SCOPE_([^'\"]+)['\"]\\)|" +
                                         "hasAnyAuthority\\s*\\(([^)]*SCOPE_[^)]+)\\)");
        Matcher matcher = pattern.matcher(spel);

        while (matcher.find()) {
            if (matcher.group(1) != null) {
                // Single scope from hasAuthority
                scopes.add(matcher.group(1));
            } else if (matcher.group(2) != null) {
                // Multiple scopes from hasAnyAuthority
                String authStr = matcher.group(2);
                String[] authParts = authStr.split(",");
                for (String part : authParts) {
                    String auth = part.trim().replaceAll("['\"]", "");
                    if (auth.startsWith("SCOPE_")) {
                        scopes.add(auth.substring(6)); // Remove SCOPE_ prefix
                    }
                }
            }
        }

        return scopes;
    }

    /**
     * Parse roles array from @Secured or @RolesAllowed annotation.
     * Handles: {"ADMIN", "USER"} or "ADMIN"
     */
    private static List<String> parseRolesArray(Expression expr) {
        List<String> roles = new ArrayList<>();

        if (expr instanceof ArrayInitializerExpr) {
            ArrayInitializerExpr arrayExpr = (ArrayInitializerExpr) expr;
            for (Expression value : arrayExpr.getValues()) {
                if (value instanceof StringLiteralExpr) {
                    roles.add(((StringLiteralExpr) value).getValue());
                }
            }
        } else if (expr instanceof StringLiteralExpr) {
            roles.add(((StringLiteralExpr) expr).getValue());
        }

        return roles;
    }
}
