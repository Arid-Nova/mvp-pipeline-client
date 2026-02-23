package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.stmt.CatchClause;
import com.github.javaparser.ast.stmt.TryStmt;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Analyzes authentication filter behavior to determine when filters return 401 errors.
 * This helps identify "optional authentication" scenarios where:
 * - No token → allowed (public endpoint)
 * - Valid token → allowed
 * - Invalid token → 401 (filter rejects it)
 */
public class FilterBehaviorAnalyzer {

    /**
     * Result of filter behavior analysis
     */
    public static class FilterBehavior {
        private boolean returns401OnInvalidToken;
        private List<String> exceptionTypes;
        private String filterType; // "JWT", "OAuth2", "Custom", etc.

        public FilterBehavior() {
            this.exceptionTypes = new ArrayList<>();
        }

        public boolean isReturns401OnInvalidToken() {
            return returns401OnInvalidToken;
        }

        public void setReturns401OnInvalidToken(boolean returns401OnInvalidToken) {
            this.returns401OnInvalidToken = returns401OnInvalidToken;
        }

        public List<String> getExceptionTypes() {
            return exceptionTypes;
        }

        public void setExceptionTypes(List<String> exceptionTypes) {
            this.exceptionTypes = exceptionTypes;
        }

        public String getFilterType() {
            return filterType;
        }

        public void setFilterType(String filterType) {
            this.filterType = filterType;
        }
    }

    /**
     * Analyze a filter class to determine its behavior
     *
     * @param filterPath Path to filter Java file (e.g., JWTFilter.java)
     * @return FilterBehavior describing when the filter returns 401
     */
    public static FilterBehavior analyzeFilter(Path filterPath) {
        FilterBehavior behavior = new FilterBehavior();

        if (filterPath == null || !filterPath.toFile().exists()) {
            return behavior;
        }

        try {
            CompilationUnit cu = StaticJavaParser.parse(filterPath.toFile());

            // Determine filter type from class name or imports
            String filterType = determineFilterType(cu, filterPath);
            behavior.setFilterType(filterType);

            // Find the main filter method (doFilterInternal, doFilter, etc.)
            MethodDeclaration filterMethod = findFilterMethod(cu);
            if (filterMethod == null) {
                return behavior;
            }

            // Analyze catch blocks for 401 responses
            boolean returns401 = analyzeForUnauthorizedResponses(filterMethod, behavior);
            behavior.setReturns401OnInvalidToken(returns401);

        } catch (IOException e) {
            // Return empty behavior on error
        }

        return behavior;
    }

    /**
     * Determine the type of filter from class name or imports
     */
    private static String determineFilterType(CompilationUnit cu, Path filterPath) {
        String fileName = filterPath.getFileName().toString();

        if (fileName.contains("JWT") || fileName.contains("Jwt")) {
            return "JWT";
        }

        if (fileName.contains("OAuth2") || fileName.contains("oauth2")) {
            return "OAuth2";
        }

        // Check imports for JWT/OAuth2 libraries
        boolean hasJwtImports = cu.getImports().stream()
            .anyMatch(imp -> imp.getNameAsString().contains("jwt") ||
                           imp.getNameAsString().contains("jsonwebtoken"));

        if (hasJwtImports) {
            return "JWT";
        }

        boolean hasOAuth2Imports = cu.getImports().stream()
            .anyMatch(imp -> imp.getNameAsString().contains("oauth2"));

        if (hasOAuth2Imports) {
            return "OAuth2";
        }

        return "Custom";
    }

    /**
     * Find the main filter method (doFilterInternal, doFilter, etc.)
     */
    private static MethodDeclaration findFilterMethod(CompilationUnit cu) {
        // Look for common filter method names
        return cu.findAll(MethodDeclaration.class).stream()
            .filter(m -> "doFilterInternal".equals(m.getNameAsString()) ||
                        "doFilter".equals(m.getNameAsString()) ||
                        "filter".equals(m.getNameAsString()))
            .findFirst()
            .orElse(null);
    }

    /**
     * Analyze filter method for 401 (UNAUTHORIZED) responses in catch blocks
     */
    private static boolean analyzeForUnauthorizedResponses(MethodDeclaration method, FilterBehavior behavior) {
        // Find all try-catch blocks
        List<TryStmt> tryStmts = method.findAll(TryStmt.class);

        for (TryStmt tryStmt : tryStmts) {
            for (CatchClause catchClause : tryStmt.getCatchClauses()) {
                // Record exception type
                String exceptionType = catchClause.getParameter().getType().asString();
                behavior.getExceptionTypes().add(exceptionType);

                // Look for setStatus(401) or setStatus(HttpServletResponse.SC_UNAUTHORIZED)
                List<MethodCallExpr> methodCalls = catchClause.getBody().findAll(MethodCallExpr.class);

                for (MethodCallExpr call : methodCalls) {
                    if ("setStatus".equals(call.getNameAsString())) {
                        // Check if argument is 401 or SC_UNAUTHORIZED
                        if (!call.getArguments().isEmpty()) {
                            String arg = call.getArguments().get(0).toString();
                            if (arg.contains("401") ||
                                arg.contains("SC_UNAUTHORIZED") ||
                                arg.contains("UNAUTHORIZED")) {
                                return true;
                            }
                        }
                    }

                    // Also check for sendError(401)
                    if ("sendError".equals(call.getNameAsString())) {
                        if (!call.getArguments().isEmpty()) {
                            String arg = call.getArguments().get(0).toString();
                            if (arg.contains("401") ||
                                arg.contains("SC_UNAUTHORIZED") ||
                                arg.contains("UNAUTHORIZED")) {
                                return true;
                            }
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * Check if a filter configuration has filters that return 401 for invalid tokens
     * This is used to determine if public endpoints can still return 401
     *
     * @param customFilters List of custom filter names from SecurityConfig
     * @param microservicePath Path to microservice source code
     * @return true if any filter returns 401 for invalid tokens
     */
    public static boolean hasFiltersReturning401(List<String> customFilters, Path microservicePath) {
        if (customFilters == null || customFilters.isEmpty()) {
            return false;
        }

        for (String filterName : customFilters) {
            // Common JWT filter patterns
            if (filterName.contains("JWT") || filterName.contains("Jwt") ||
                filterName.contains("Token") || filterName.contains("Auth")) {

                // Try to find and analyze the filter
                Path filterPath = findFilterClass(filterName, microservicePath);
                if (filterPath != null) {
                    FilterBehavior behavior = analyzeFilter(filterPath);
                    if (behavior.isReturns401OnInvalidToken()) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Find a filter class file by name
     */
    private static Path findFilterClass(String filterName, Path microservicePath) {
        // This is a simplified search - in production, you'd want a more robust implementation
        try {
            String fileName = filterName + ".java";
            return java.nio.file.Files.walk(microservicePath)
                .filter(path -> path.getFileName().toString().equals(fileName))
                .findFirst()
                .orElse(null);
        } catch (IOException e) {
            return null;
        }
    }
}
