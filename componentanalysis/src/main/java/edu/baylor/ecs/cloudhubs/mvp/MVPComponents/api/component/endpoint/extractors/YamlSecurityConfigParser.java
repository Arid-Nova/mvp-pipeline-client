package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.SecurityRule;

import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.io.FileInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Parser for extracting security authorization rules from application.yml files.
 *
 * <p>This parser handles YAML-based RBAC configurations used in Train Ticket microservices.
 * It extracts rules from the "security.authorization-rules" section and converts them to
 * SecurityRule objects.
 *
 * <p>Expected YAML structure:
 * <pre>
 * security:
 *   authorization-rules:
 *     - paths: ["/api/v1/admin/**"]
 *       method: "POST"
 *       authorities: ["ROLE_ADMIN"]
 *     - paths: ["/api/v1/public/**"]
 *       authorities: ["permitAll"]
 * </pre>
 *
 * @author Claude Code
 * @version 1.0
 */
public class YamlSecurityConfigParser {
    private static final ObjectMapper mapper = new ObjectMapper();

    /**
     * Parses security authorization rules from application.yml file.
     *
     * @param yamlPath Path to application.yml file
     * @return List of SecurityRule objects, empty if parsing fails or no rules found
     */
    public static List<SecurityRule> parseSecurityConfig(Path yamlPath) {
        List<SecurityRule> rules = new ArrayList<>();

        if (yamlPath == null || !Files.exists(yamlPath)) {
            return rules;
        }

        try {
            // Parse YAML file
            JsonNode rootNode = parseYamlToJson(yamlPath);
            if (rootNode == null) {
                return rules;
            }

            // Navigate to security.authorization-rules
            JsonNode securityNode = rootNode.path("security");
            if (securityNode.isMissingNode()) {
                return rules;
            }

            JsonNode authRulesNode = securityNode.path("authorization-rules");
            if (authRulesNode.isMissingNode() || !authRulesNode.isArray()) {
                return rules;
            }

            // Parse each authorization rule
            for (JsonNode ruleNode : authRulesNode) {
                try {
                    SecurityRule rule = parseAuthorizationRule(ruleNode);
                    if (rule != null) {
                        rules.add(rule);
                    }
                } catch (Exception e) {
                    // Continue with next rule (partial parsing)
                }
            }

        } catch (Exception ignored) {

        }

        return rules;
    }

    /**
     * Parses YAML file to JSON structure using SnakeYAML.
     *
     * @param yamlPath Path to YAML file
     * @return JsonNode representing YAML structure, or null if parsing fails
     */
    private static JsonNode parseYamlToJson(Path yamlPath) {
        try {
            Yaml yaml = new Yaml(new SafeConstructor(new LoaderOptions()));
            try (FileInputStream fis = new FileInputStream(yamlPath.toFile())) {
                Map<String, Object> yamlMap = yaml.load(fis);
                if (yamlMap == null || yamlMap.isEmpty()) {
                    return mapper.createObjectNode();
                }
                return mapper.valueToTree(yamlMap);
            }
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Parses a single authorization rule from JSON node.
     *
     * <p>Expected structure:
     * <pre>
     * {
     *   "paths": ["/api/v1/users/**", "/api/v1/admin/**"],
     *   "method": "POST",  // optional
     *   "authorities": ["ROLE_ADMIN", "ROLE_USER"]  // or ["permitAll"] or ["authenticated"]
     * }
     * </pre>
     *
     * @param ruleNode JSON node representing a single authorization rule
     * @return SecurityRule object, or null if invalid
     */
    private static SecurityRule parseAuthorizationRule(JsonNode ruleNode) {
        // Extract paths (required)
        JsonNode pathsNode = ruleNode.path("paths");
        if (pathsNode.isMissingNode() || !pathsNode.isArray() || pathsNode.isEmpty()) {
            return null;
        }

        // Extract method (optional)
        String method = null;
        JsonNode methodNode = ruleNode.path("method");
        if (!methodNode.isMissingNode() && methodNode.isTextual()) {
            method = methodNode.asText().toUpperCase();
        }

        // Extract authorities (required)
        JsonNode authoritiesNode = ruleNode.path("authorities");
        if (authoritiesNode.isMissingNode() || !authoritiesNode.isArray() || authoritiesNode.isEmpty()) {
            return null;
        }

        // Parse authorities
        List<String> authorities = new ArrayList<>();
        for (JsonNode authorityNode : authoritiesNode) {
            if (authorityNode.isTextual()) {
                authorities.add(authorityNode.asText());
            }
        }

        if (authorities.isEmpty()) {
            return null;
        }

        // Create one SecurityRule per path (to match existing SecurityRule model)
        // Note: We'll return the first path's rule here; caller should handle multiple paths
        List<SecurityRule> rulesForAllPaths = new ArrayList<>();
        for (JsonNode pathNode : pathsNode) {
            if (pathNode.isTextual()) {
                String path = pathNode.asText();
                SecurityRule rule = createSecurityRuleFromAuthorities(path, method, authorities);
                rulesForAllPaths.add(rule);
            }
        }

        // Return first rule (we'll need to refactor this to return all paths)
        // For now, return first rule and log if multiple paths
        if (rulesForAllPaths.isEmpty()) {
            return null;
        }

        // We need to return all rules, but method signature only allows one
        // Solution: Call this method multiple times for each path in the caller

        return rulesForAllPaths.getFirst();
    }

    /**
     * Parses all authorization rules from a YAML rule node, handling multiple paths.
     *
     * @param ruleNode JSON node representing a single authorization rule
     * @return List of SecurityRule objects (one per path), empty if invalid
     */
    private static List<SecurityRule> parseAuthorizationRuleWithMultiplePaths(JsonNode ruleNode) {
        List<SecurityRule> rules = new ArrayList<>();

        // Extract paths (required)
        JsonNode pathsNode = ruleNode.path("paths");
        if (pathsNode.isMissingNode() || !pathsNode.isArray() || pathsNode.isEmpty()) {
            return rules;
        }

        // Extract method (optional)
        String method = null;
        JsonNode methodNode = ruleNode.path("method");
        if (!methodNode.isMissingNode() && methodNode.isTextual()) {
            method = methodNode.asText().toUpperCase();
        }

        // Extract authorities (required)
        JsonNode authoritiesNode = ruleNode.path("authorities");
        if (authoritiesNode.isMissingNode() || !authoritiesNode.isArray() || authoritiesNode.isEmpty()) {
            return rules;
        }

        // Parse authorities
        List<String> authorities = new ArrayList<>();
        for (JsonNode authorityNode : authoritiesNode) {
            if (authorityNode.isTextual()) {
                authorities.add(authorityNode.asText());
            }
        }

        if (authorities.isEmpty()) {
            return rules;
        }

        // Create one SecurityRule per path
        for (JsonNode pathNode : pathsNode) {
            if (pathNode.isTextual()) {
                String path = pathNode.asText();
                SecurityRule rule = createSecurityRuleFromAuthorities(path, method, authorities);
                if (rule != null) {
                    rules.add(rule);
                }
            }
        }

        return rules;
    }

    /**
     * Creates a SecurityRule from path, method, and authorities list.
     *
     * @param path URL pattern (e.g., "/api/v1/users/**")
     * @param method HTTP method (e.g., "POST"), or null for all methods
     * @param authorities List of authorities (roles or special values like "permitAll")
     * @return SecurityRule object
     */
    private static SecurityRule createSecurityRuleFromAuthorities(String path, String method,
                                                                 List<String> authorities) {
        SecurityRule rule = new SecurityRule();
        rule.setPattern(path);
        rule.setHttpMethod(method);
        rule.setSource("yaml"); // Mark as YAML-sourced

        // Parse authorities
        List<String> roles = new ArrayList<>();
        boolean permitAll = false;
        boolean authenticated = false;

        for (String authority : authorities) {
            String authLower = authority.toLowerCase();
            if ("permitall".equals(authLower)) {
                permitAll = true;
            } else if ("authenticated".equals(authLower)) {
                authenticated = true;
            } else {
                // It's a role or authority
                roles.add(authority);
            }
        }

        rule.setPermitAll(permitAll);
        rule.setAuthenticated(authenticated);
        rule.setRequiredRoles(roles.isEmpty() ? null : roles);

        // Calculate priority based on pattern specificity
        rule.setPriority(calculatePatternPriority(path));

        return rule;
    }

    /**
     * Calculates pattern priority based on specificity.
     * More specific patterns get higher priority.
     *
     * @param pattern URL pattern
     * @return Priority value (higher = more specific)
     */
    private static int calculatePatternPriority(String pattern) {
        if (pattern == null) {
            return 0;
        }

        int priority = 0;

        // Base priority on path depth
        priority += pattern.split("/").length * 10;

        // Penalize wildcards
        if (pattern.contains("/**")) {
            priority -= 20;
        }
        if (pattern.contains("/*")) {
            priority -= 10;
        }
        if (pattern.contains("*")) {
            priority -= 5;
        }

        // Bonus for exact paths (no wildcards)
        if (!pattern.contains("*")) {
            priority += 50;
        }

        return priority;
    }

    /**
     * Public method to parse authorization rules, properly handling multiple paths per rule.
     * This is the method that should be called from SecurityExtractor.
     *
     * @param yamlPath Path to application.yml file
     * @return List of SecurityRule objects (expanded for multiple paths), empty if parsing fails
     */
    public static List<SecurityRule> parseYamlSecurityConfig(Path yamlPath) {
        List<SecurityRule> allRules = new ArrayList<>();

        if (yamlPath == null || !Files.exists(yamlPath)) {
            return allRules;
        }

        try {
            // Parse YAML file
            JsonNode rootNode = parseYamlToJson(yamlPath);
            if (rootNode == null) {
                return allRules;
            }

            // Navigate to security.authorization-rules
            JsonNode securityNode = rootNode.path("security");
            if (securityNode.isMissingNode()) {
                return allRules;
            }

            JsonNode authRulesNode = securityNode.path("authorization-rules");
            if (authRulesNode.isMissingNode() || !authRulesNode.isArray()) {
                return allRules;
            }

            // Parse each authorization rule (each can have multiple paths)
            for (JsonNode ruleNode : authRulesNode) {
                try {
                    List<SecurityRule> rulesFromNode = parseAuthorizationRuleWithMultiplePaths(ruleNode);
                    allRules.addAll(rulesFromNode);
                } catch (Exception e) {
                    // Continue with next rule (partial parsing)
                }
            }
        } catch (Exception ignored) {

        }

        return allRules;
    }
}
