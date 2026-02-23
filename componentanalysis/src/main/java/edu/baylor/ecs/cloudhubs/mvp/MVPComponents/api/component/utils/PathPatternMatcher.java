package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.SecurityRule;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Utility for matching HTTP endpoint paths against Spring Security Ant-style patterns.
 *
 * Supports:
 * - ** matches zero or more path segments (e.g., /api/** matches /api/v1/users)
 * - * matches exactly one path segment (e.g., /api/* matches /api/v1 but not /api/v1/users)
 * - ? matches exactly one character
 * - Path variables like {id} are treated as wildcards
 */
public class PathPatternMatcher {

    /**
     * Find all security rules that match the given URI and HTTP method
     *
     * @param uri The endpoint URI to match (e.g., "/api/v1/users/123")
     * @param httpMethod The HTTP method (e.g., "GET", "POST", null)
     * @param rules List of security rules to match against
     * @return List of matching rules (may be empty)
     */
    public static List<SecurityRule> findMatchingRules(String uri, String httpMethod, List<SecurityRule> rules) {
        if (rules == null || rules.isEmpty()) {
            return new ArrayList<>();
        }

        return rules.stream()
            .filter(rule -> matches(rule, uri, httpMethod))
            .collect(Collectors.toList());
    }

    /**
     * Get the most specific matching rule from a list of matches.
     * Returns the rule with the highest priority.
     *
     * @param matches List of matching security rules
     * @return The most specific rule, or null if list is empty
     */
    public static SecurityRule getMostSpecificMatch(List<SecurityRule> matches) {
        if (matches == null || matches.isEmpty()) {
            return null;
        }

        return matches.stream()
            .max((r1, r2) -> Integer.compare(r1.getPriority(), r2.getPriority()))
            .orElse(null);
    }

    /**
     * Check if a security rule matches the given URI and HTTP method
     *
     * @param rule The security rule to test
     * @param uri The URI to match
     * @param httpMethod The HTTP method to match
     * @return true if the rule matches
     */
    public static boolean matches(SecurityRule rule, String uri, String httpMethod) {
        if (rule == null || uri == null) {
            return false;
        }

        // Check HTTP method match
        if (rule.getHttpMethod() != null && httpMethod != null) {
            if (!rule.getHttpMethod().equalsIgnoreCase(httpMethod)) {
                return false;
            }
        }

        // Check pattern match
        return matchesPattern(rule.getPattern(), uri);
    }

    /**
     * Check if a URI matches an Ant-style pattern
     *
     * @param pattern The Ant-style pattern (e.g., "/api/**", "/users/{id}")
     * @param uri The URI to test
     * @return true if the URI matches the pattern
     */
    public static boolean matchesPattern(String pattern, String uri) {
        if (pattern == null || uri == null) {
            return false;
        }

        // Normalize paths (remove trailing slashes)
        pattern = normalizePath(pattern);
        uri = normalizePath(uri);

        // Convert Ant-style pattern to regex
        String regex = convertAntPatternToRegex(pattern);

        try {
            return Pattern.matches(regex, uri);
        } catch (Exception e) {
            // If regex compilation fails, fall back to exact match
            return pattern.equals(uri);
        }
    }

    /**
     * Calculate the specificity/priority of a pattern.
     * Higher values indicate more specific patterns.
     *
     * Priority rules:
     * - Exact match (no wildcards): 1000
     * - Path variable {id}: 900
     * - Single segment wildcard *: 800
     * - Multi-segment wildcard **: 700 - (number of segments before **)
     * - Question mark ?: same as *
     *
     * @param pattern The pattern to evaluate
     * @return Priority score (higher = more specific)
     */
    public static int calculateSpecificity(String pattern) {
        if (pattern == null) {
            return 0;
        }

        pattern = normalizePath(pattern);

        // Exact match (no wildcards or path variables)
        if (!pattern.contains("**") && !pattern.contains("*") &&
            !pattern.contains("?") && !pattern.contains("{")) {
            return 1000;
        }

        // Count path segments
        String[] segments = pattern.split("/");
        int segmentCount = segments.length;

        // Path variables {id} - high priority
        if (pattern.contains("{") && pattern.contains("}")) {
            return 900;
        }

        // Single segment wildcard *
        if (pattern.contains("*") && !pattern.contains("**")) {
            return 800;
        }

        // Question mark ? (single character)
        if (pattern.contains("?")) {
            return 800;
        }

        // Multi-segment wildcard ** - priority depends on position
        if (pattern.contains("**")) {
            // More specific if ** appears later in the pattern
            // e.g., /api/v1/users/** is more specific than /api/**
            int doubleStarIndex = pattern.indexOf("**");
            int segmentsBeforeWildcard = pattern.substring(0, doubleStarIndex).split("/").length;
            return 700 + segmentsBeforeWildcard * 10;
        }

        // Default
        return 600;
    }

    /**
     * Convert Ant-style pattern to regex
     *
     * @param antPattern The Ant-style pattern
     * @return Regex pattern string
     */
    private static String convertAntPatternToRegex(String antPattern) {
        StringBuilder regex = new StringBuilder("^");

        int i = 0;
        while (i < antPattern.length()) {
            char c = antPattern.charAt(i);

            if (c == '*') {
                // Check for **
                if (i + 1 < antPattern.length() && antPattern.charAt(i + 1) == '*') {
                    // ** matches zero or more path segments
                    // If preceded by '/', make the '/' + content optional to match base path
                    // e.g., /users/** should match /users, /users/, /users/123
                    if (regex.length() > 0 && regex.charAt(regex.length() - 1) == '/') {
                        regex.deleteCharAt(regex.length() - 1);
                        regex.append("(/.*)?");
                    } else {
                        regex.append(".*");
                    }
                    i += 2;
                } else {
                    // * matches one path segment (not including /)
                    regex.append("[^/]*");
                    i++;
                }
            } else if (c == '?') {
                // ? matches exactly one character (not including /)
                regex.append("[^/]");
                i++;
            } else if (c == '{') {
                // Path variable like {id} - match any path segment
                int closeBrace = antPattern.indexOf('}', i);
                if (closeBrace != -1) {
                    regex.append("[^/]+");
                    i = closeBrace + 1;
                } else {
                    // Malformed path variable, escape the brace
                    regex.append("\\{");
                    i++;
                }
            } else if (c == '.' || c == '+' || c == '(' || c == ')' ||
                       c == '[' || c == ']' || c == '^' || c == '$' ||
                       c == '|' || c == '\\') {
                // Escape regex special characters
                regex.append('\\').append(c);
                i++;
            } else {
                // Regular character
                regex.append(c);
                i++;
            }
        }

        regex.append("$");
        return regex.toString();
    }

    /**
     * Normalize a path by removing trailing slashes
     *
     * @param path The path to normalize
     * @return Normalized path
     */
    private static String normalizePath(String path) {
        if (path == null || path.isEmpty()) {
            return path;
        }

        // Remove trailing slash unless it's the root path
        if (path.length() > 1 && path.endsWith("/")) {
            return path.substring(0, path.length() - 1);
        }

        return path;
    }
}
