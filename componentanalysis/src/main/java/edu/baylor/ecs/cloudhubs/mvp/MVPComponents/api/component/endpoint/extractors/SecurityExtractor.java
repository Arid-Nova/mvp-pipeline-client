package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.PathPatternMatcher;
import edu.university.ecs.lab.common.models.ir.Microservice;
import edu.university.ecs.lab.common.models.ir.MicroserviceSystem;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service for extracting and applying security and authorization information to endpoints.
 *
 * <p>This service is responsible for:
 * <ul>
 *   <li>Parsing Spring Security configurations from SecurityConfig.java files</li>
 *   <li>Extracting authorization rules (roles, URL patterns, access rules)</li>
 *   <li>Enriching endpoints with authorization information</li>
 *   <li>Detecting optional authentication scenarios</li>
 *   <li>Parsing authentication mechanisms (JWT, OAuth2, Basic Auth, etc.)</li>
 * </ul>
 *
 * <p>The extractor analyzes Security configuration files at the microservice level
 * and applies the rules to individual endpoints based on URL pattern matching.
 *
 * @author Claude Code Refactoring
 * @version 2.0
 */
public class SecurityExtractor {
    /**
     * Parses security configurations for all microservices in the system.
     * Extracts rules from both SecurityConfig.java and application.yml files.
     * YAML rules take precedence over Java rules when both define the same pattern.
     *
     * @param system The microservice system
     * @return Map of microservice name to list of security rules (merged from all sources)
     */
    public Map<String, List<SecurityRule>> parseSecurityConfigs(MicroserviceSystem system) {
        Map<String, List<SecurityRule>> securityRules = new HashMap<>();

        for (Microservice microservice : system.getMicroservices()) {
            Path microservicePath = microservice.getPath();
            if (microservicePath == null) {
                continue;
            }

            // Resolve the microservice path
            Path resolvedPath = resolveMicroservicePath(microservicePath);
            if (resolvedPath == null || !Files.exists(resolvedPath)) {
                continue;
            }

            List<SecurityRule> allRules = new ArrayList<>();

            // Step 1: Validate SecurityProperties.java (if exists)
            Path securityPropertiesPath = findSecurityProperties(resolvedPath);
            if (securityPropertiesPath != null && Files.exists(securityPropertiesPath)) {
                SecurityPropertiesParser.ValidationResult validation =
                    SecurityPropertiesParser.validateSecurityProperties(securityPropertiesPath);
            }

            // Step 2: Parse SecurityConfig.java (Java-based rules)
            Path securityConfigPath = findSecurityConfig(resolvedPath, "src/main/java/*/config/SecurityConfig.java");
            if (securityConfigPath != null && Files.exists(securityConfigPath)) {
                List<SecurityRule> javaRules = SecurityConfigParser.parseSecurityConfig(securityConfigPath);
                // Mark all Java rules with source="java"
                javaRules.forEach(rule -> rule.setSource("java"));
                allRules.addAll(javaRules);
            }

            // Step 3: Parse application.yml (YAML-based rules)
            Path applicationYmlPath = findApplicationYml(resolvedPath);
            if (applicationYmlPath != null && Files.exists(applicationYmlPath)) {
                List<SecurityRule> yamlRules = YamlSecurityConfigParser.parseYamlSecurityConfig(applicationYmlPath);
                // YAML rules are already marked with source="yaml" by the parser
                allRules.addAll(yamlRules);
            }

            // Step 4: Merge rules with YAML precedence
            List<SecurityRule> mergedRules = mergeSecurityRules(allRules);

            if (!mergedRules.isEmpty()) {
                securityRules.put(microservice.getName(), mergedRules);
            }
        }

        return securityRules;
    }

    /**
     * Merges security rules from multiple sources, applying YAML precedence.
     * YAML rules override Java rules for the same pattern.
     *
     * @param rules List of security rules from all sources
     * @return Merged list with YAML taking precedence
     */
    private List<SecurityRule> mergeSecurityRules(List<SecurityRule> rules) {
        if (rules.isEmpty()) {
            return rules;
        }

        // Group rules by pattern+method key
        Map<String, List<SecurityRule>> rulesByKey = new HashMap<>();
        for (SecurityRule rule : rules) {
            String key = rule.getPattern() + "|" + (rule.getHttpMethod() != null ? rule.getHttpMethod() : "ALL");
            rulesByKey.computeIfAbsent(key, k -> new ArrayList<>()).add(rule);
        }

        // For each group, apply YAML precedence
        List<SecurityRule> mergedRules = new ArrayList<>();
        for (List<SecurityRule> ruleGroup : rulesByKey.values()) {
            if (ruleGroup.size() == 1) {
                // No conflict, use as-is
                mergedRules.add(ruleGroup.get(0));
            } else {
                // Multiple rules for same pattern - YAML takes precedence
                SecurityRule yamlRule = ruleGroup.stream()
                    .filter(r -> "yaml".equals(r.getSource()))
                    .findFirst()
                    .orElse(null);

                if (yamlRule != null) {
                    mergedRules.add(yamlRule);
                } else {
                    // All are Java rules - use highest priority
                    SecurityRule highestPriority = ruleGroup.stream()
                        .max((r1, r2) -> Integer.compare(r1.getPriority(), r2.getPriority()))
                        .get();
                    mergedRules.add(highestPriority);
                }
            }
        }

        // Sort by priority (descending), then by HTTP method specificity
        // Rules with specific HTTP methods should come before catch-all rules (method=null)
        mergedRules.sort((r1, r2) -> {
            int priorityCompare = Integer.compare(r2.getPriority(), r1.getPriority());
            if (priorityCompare != 0) {
                return priorityCompare;
            }
            // Same priority: specific HTTP method before null (catch-all)
            // r1 has method, r2 doesn't → r1 first (return -1)
            // r1 doesn't have method, r2 does → r2 first (return 1)
            // Both have or both don't → equal (return 0)
            boolean r1HasMethod = r1.getHttpMethod() != null;
            boolean r2HasMethod = r2.getHttpMethod() != null;
            if (r1HasMethod && !r2HasMethod) {
                return -1;
            } else if (!r1HasMethod && r2HasMethod) {
                return 1;
            }
            return 0;
        });

        return mergedRules;
    }

    /**
     * Finds application.yml file in a microservice.
     *
     * @param microservicePath The microservice root path
     * @return Path to application.yml, or null if not found
     */
    private Path findApplicationYml(Path microservicePath) {
        try {
            Path ymlPath = microservicePath.resolve("src/main/resources/application.yml");
            if (Files.exists(ymlPath)) {
                return ymlPath;
            }

            // Try .yaml extension
            Path yamlPath = microservicePath.resolve("src/main/resources/application.yaml");
            if (Files.exists(yamlPath)) {
                return yamlPath;
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Finds SecurityProperties.java file in a microservice.
     *
     * @param microservicePath The microservice root path
     * @return Path to SecurityProperties.java, or null if not found
     */
    private Path findSecurityProperties(Path microservicePath) {
        try {
            return recursiveFindFile(microservicePath, "SecurityProperties.java");
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Parses authentication mechanisms and security features from SecurityConfig files.
     *
     * @param system The microservice system
     * @param authMechanismsByMicroservice Output map for authentication mechanisms by microservice
     * @param securityFeaturesByMicroservice Output map for security features by microservice
     */
    public void parseAuthenticationConfigs(MicroserviceSystem system,
                                          Map<String, AuthenticationMechanism> authMechanismsByMicroservice,
                                          Map<String, SecurityFeaturesInfo> securityFeaturesByMicroservice) {
        for (Microservice microservice : system.getMicroservices()) {
            Path microservicePath = microservice.getPath();
            if (microservicePath == null) {
                continue;
            }

            // Resolve the microservice path
            Path resolvedPath = resolveMicroservicePath(microservicePath);
            if (resolvedPath == null || !Files.exists(resolvedPath)) {
                continue;
            }

            // Find SecurityConfig.java
            Path securityConfigPath = findSecurityConfig(resolvedPath, "src/main/java/*/config/SecurityConfig.java");
            if (securityConfigPath != null && Files.exists(securityConfigPath)) {
                AuthenticationConfigParser.ParsedSecurityConfig config =
                        AuthenticationConfigParser.parseSecurityConfig(securityConfigPath);

                if (config.authenticationMechanism != null) {
                    authMechanismsByMicroservice.put(microservice.getName(), config.authenticationMechanism);
                }
                if (config.securityFeatures != null) {
                    securityFeaturesByMicroservice.put(microservice.getName(), config.securityFeatures);
                }
            }
        }
    }

    /**
     * Enriches endpoints with authorization information based on security rules.
     *
     * @param endpoints Map of endpoints to enrich
     * @param securityRules Security rules organized by microservice
     */
    public void enrichEndpointsWithAuthorization(Map<String, EndpointInfo> endpoints,
                                                Map<String, List<SecurityRule>> securityRules) {
        int enriched = 0;

        for (EndpointInfo endpoint : endpoints.values()) {
            // Extract microservice name from endpoint ID
            String microserviceName = extractMicroserviceNameFromEndpointId(endpoint.getId());

            // Get security rules for this microservice
            List<SecurityRule> rules = securityRules.get(microserviceName);
            if (rules == null || rules.isEmpty()) {
                continue;
            }

            // Find matching security rule for this endpoint (considering both URI and HTTP method)
            SecurityRule matchingRule = findMatchingSecurityRule(endpoint.getFullUri(), endpoint.getHttpMethod(), rules);
            if (matchingRule != null) {
                // Build authorization info from the matching rule
                AuthorizationInfo authorization = buildAuthorizationFromSecurityRule(
                    endpoint.getAuthentication(),
                    matchingRule
                );
                endpoint.setAuthorization(authorization);

                // Update authentication source
                updateAuthenticationSource(endpoint, matchingRule);

                enriched++;
            }
        }
    }

    /**
     * Enriches endpoints with authentication mechanism information and detects optional authentication.
     *
     * @param endpoints Map of endpoints to enrich
     * @param authMechanismsByMicroservice Authentication mechanisms by microservice
     * @param securityFeaturesByMicroservice Security features by microservice
     * @param system The microservice system (for path resolution)
     */
    public void enrichEndpointsWithAuthenticationMechanism(Map<String, EndpointInfo> endpoints,
                                                          Map<String, AuthenticationMechanism> authMechanismsByMicroservice,
                                                          Map<String, SecurityFeaturesInfo> securityFeaturesByMicroservice,
                                                          MicroserviceSystem system) {
        int enriched = 0;

        for (EndpointInfo endpoint : endpoints.values()) {
            // Extract microservice name from endpoint ID
            String microserviceName = extractMicroserviceNameFromEndpointId(endpoint.getId());

            // Get authentication mechanism for this microservice
            AuthenticationMechanism mechanism = authMechanismsByMicroservice.get(microserviceName);
            SecurityFeaturesInfo securityFeatures = securityFeaturesByMicroservice.get(microserviceName);

            // Set mechanism on endpoint's authentication info
            if (endpoint.getAuthentication() != null && mechanism != null) {
                endpoint.getAuthentication().setMechanism(mechanism);
                enriched++;
            } else if (endpoint.getAuthentication() == null && mechanism != null) {
                // Create basic authentication info if none exists
                AuthenticationInfo auth = new AuthenticationInfo();
                auth.setMechanism(mechanism);
                auth.setRequired(mechanism.getType() != AuthenticationMechanism.AuthenticationType.NONE);
                endpoint.setAuthentication(auth);
                enriched++;
            }

            // Detect optional authentication
            detectOptionalAuthentication(endpoint, mechanism, securityFeatures, microserviceName, system);

            // Re-evaluate response schema with optional authentication
            if (endpoint.getAuthentication() != null && endpoint.getAuthentication().isOptionalAuthentication()) {
                if (endpoint.getResponseSchema() != null) {
                    ResponseSchemaExtractor.addAuthenticationStatusCodes(
                        endpoint.getResponseSchema(),
                        endpoint.getAuthentication(),
                        endpoint.getAuthorization()
                    );
                }
            }
        }
    }

    /**
     * Detects optional authentication scenarios where:
     * - Endpoint is public (no authentication required)
     * - BUT authentication filter (e.g., JWTFilter) validates tokens if provided
     * - Invalid tokens trigger 401 errors
     *
     * @param endpoint The endpoint to check
     * @param mechanism The authentication mechanism for the microservice
     * @param securityFeatures Security features including custom filters
     * @param microserviceName Name of the microservice
     * @param system The microservice system
     */
    private void detectOptionalAuthentication(EndpointInfo endpoint,
                                             AuthenticationMechanism mechanism,
                                             SecurityFeaturesInfo securityFeatures,
                                             String microserviceName,
                                             MicroserviceSystem system) {
        AuthenticationInfo auth = endpoint.getAuthentication();
        if (auth == null) {
            return;
        }

        // Check if endpoint is public (not required or permitAll)
        boolean isPublicEndpoint = !auth.isRequired() || auth.isPermitAll();
        if (!isPublicEndpoint) {
            return; // Not optional if authentication is required
        }

        // Check if mechanism is token-based (JWT, OAuth2, API Key)
        if (mechanism == null) {
            return;
        }

        boolean isTokenBased = mechanism.getType() == AuthenticationMechanism.AuthenticationType.JWT ||
                              mechanism.getType() == AuthenticationMechanism.AuthenticationType.OAUTH2 ||
                              mechanism.getType() == AuthenticationMechanism.AuthenticationType.API_KEY;

        if (!isTokenBased) {
            return;
        }

        // Check for custom security filters that validate tokens
        if (securityFeatures != null && securityFeatures.getCustomFilters() != null) {
            boolean hasTokenValidationFilter = securityFeatures.getCustomFilters().stream()
                .anyMatch(filter -> filter.contains("JWT") || filter.contains("Token") || filter.contains("Auth"));

            if (hasTokenValidationFilter) {
                auth.setOptionalAuthentication(true);
            }
        }
    }

    /**
     * Finds a security rule that matches the given endpoint URI and HTTP method.
     *
     * @param endpointUri The endpoint URI to match
     * @param httpMethod The HTTP method to match (GET, POST, etc.)
     * @param rules List of security rules
     * @return Matching SecurityRule, or null if no match
     */
    private SecurityRule findMatchingSecurityRule(String endpointUri, String httpMethod, List<SecurityRule> rules) {
        if (endpointUri == null || rules == null) {
            return null;
        }

        for (SecurityRule rule : rules) {
            if (rule.getPattern() != null && matchesPattern(endpointUri, rule.getPattern())) {
                // Check HTTP method match: rule with no method matches all, otherwise must match exactly
                if (rule.getHttpMethod() == null ||
                    rule.getHttpMethod().equalsIgnoreCase(httpMethod)) {
                    return rule;
                }
            }
        }

        return null;
    }

    /**
     * Checks if a URI matches a URL pattern (supports wildcards).
     * Delegates to PathPatternMatcher for proper Ant-style pattern matching.
     *
     * @param uri The URI to check
     * @param pattern The pattern to match against
     * @return true if matches, false otherwise
     */
    private boolean matchesPattern(String uri, String pattern) {
        return PathPatternMatcher.matchesPattern(pattern, uri);
    }

    /**
     * Builds AuthorizationInfo from a SecurityRule.
     *
     * @param authentication Existing authentication info
     * @param rule The security rule
     * @return Complete AuthorizationInfo
     */
    private AuthorizationInfo buildAuthorizationFromSecurityRule(AuthenticationInfo authentication,
                                                                SecurityRule rule) {
        AuthorizationInfo authorization = new AuthorizationInfo();

        // Set roles
        authorization.setRequiredRoles(rule.getRequiredRoles() != null ? rule.getRequiredRoles() : List.of());

        // Set authentication requirement
        boolean requiresAuth = !rule.isPermitAll() && !rule.isDenyAll();
        authorization.setRequiresAuthentication(requiresAuth);
        authorization.setPublic(!requiresAuth);

        // Note: AuthorizationInfo only tracks roles, not authorities
        // In Spring Security, roles are authorities with ROLE_ prefix
        // If we have authorities but no roles, we could convert them to roles if needed
        // For now, we rely on the roles field from the SecurityRule

        // Set source based on rule source
        String source = "yaml".equals(rule.getSource()) ? "yaml" : "SecurityConfig";
        authorization.setSource(source);

        return authorization;
    }

    /**
     * Updates the authentication info based on the security rule.
     * Synchronizes authentication fields with authorization to avoid contradictions.
     *
     * @param endpoint The endpoint to update
     * @param securityRule The matching security rule
     */
    private void updateAuthenticationSource(EndpointInfo endpoint, SecurityRule securityRule) {
        if (endpoint.getAuthentication() != null && securityRule != null) {
            AuthenticationInfo auth = endpoint.getAuthentication();

            // Use the rule's source to determine authentication source
            String source = "yaml".equals(securityRule.getSource()) ? "yaml" : "SecurityConfig";
            auth.setSource(source);

            // Synchronize authentication fields with the security rule
            auth.setRequired(!securityRule.isPermitAll() && !securityRule.isDenyAll());
            auth.setPermitAll(securityRule.isPermitAll());

            // Copy roles from security rule if present
            if (securityRule.hasRoleRequirements()) {
                auth.setRequiredRoles(new ArrayList<>(securityRule.getRequiredRoles()));
            } else if (securityRule.isPermitAll()) {
                // Clear roles if permitAll
                auth.setRequiredRoles(null);
            }
        }
    }

    /**
     * Extracts microservice name from an endpoint ID.
     *
     * @param endpointId The endpoint ID (format: "serviceName:hash")
     * @return Microservice name
     */
    private String extractMicroserviceNameFromEndpointId(String endpointId) {
        if (endpointId == null || !endpointId.contains(":")) {
            return "";
        }
        return endpointId.substring(0, endpointId.indexOf(":"));
    }

    /**
     * Resolves a microservice path, handling Git-relative and absolute paths.
     *
     * <p>Microservice paths from the IR are Git-relative (e.g., "/ts-contacts-service").
     * This method converts them to actual filesystem paths using the clone directory structure.
     *
     * @param microservicePath The path from the IR model (Git-relative)
     * @return Resolved absolute path, or null if not resolvable
     */
    private Path resolveMicroservicePath(Path microservicePath) {
        if (microservicePath == null) {
            return null;
        }

        // If already absolute and exists, return as-is
        if (microservicePath.isAbsolute() && Files.exists(microservicePath)) {
            return microservicePath;
        }

        // Convert Git-relative path to local filesystem path
        // Git-relative: /ts-contacts-service
        // Local:        ./clone/train-ticket-aitest/ts-contacts-service
        String gitPath = microservicePath.toString();

        // Find all repositories in clone directory
        Path cloneDir = Path.of(edu.university.ecs.lab.common.utils.FileUtils.getClonePath());
        Path currentDir = Path.of(System.getProperty("user.dir"));
        Path resolvedCloneDir = currentDir.resolve(cloneDir);

        if (!Files.exists(resolvedCloneDir)) {
            return null;
        }

        try {
            // Try to find the microservice in any of the cloned repositories
            java.util.stream.Stream<Path> repoDirs = Files.list(resolvedCloneDir)
                .filter(Files::isDirectory);

            for (Path repoDir : (Iterable<Path>) repoDirs::iterator) {
                // Try appending microservice name to repo directory
                Path candidate = repoDir.resolve(gitPath.startsWith("/") ? gitPath.substring(1) : gitPath);
                if (Files.exists(candidate)) {
                    return candidate;
                }
            }
        } catch (Exception ignored) { }

        // Fallback: Try to resolve relative to current directory
        Path resolved = currentDir.resolve(microservicePath);
        if (Files.exists(resolved)) {
            return resolved;
        }

        return null;
    }

    /**
     * Finds a SecurityConfig file using a glob pattern.
     *
     * @param microservicePath The microservice root path
     * @param pattern The glob pattern (e.g., "src/main/java/∗/config/SecurityConfig.java")
     * @return Path to SecurityConfig.java, or null if not found
     */
    private Path findSecurityConfig(Path microservicePath, String pattern) {
        try {
            // Common locations for SecurityConfig.java
            String[] possiblePaths = {
                "src/main/java/config/SecurityConfig.java",
                "src/main/java/com/config/SecurityConfig.java",
                "src/main/java/*/config/SecurityConfig.java"
            };

            for (String possiblePath : possiblePaths) {
                Path resolved = microservicePath.resolve(possiblePath.replace("*", "**"));
                if (Files.exists(resolved)) {
                    return resolved;
                }
            }

            // Recursive search as fallback
            return recursiveFindFile(microservicePath, "SecurityConfig.java");

        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Recursively searches for a file by name.
     *
     * @param directory The directory to search
     * @param fileName The file name to find
     * @return Path to the file, or null if not found
     */
    private Path recursiveFindFile(Path directory, String fileName) {
        try {
            return Files.walk(directory, 10)
                .filter(path -> path.getFileName().toString().equals(fileName))
                .findFirst()
                .orElse(null);
        } catch (Exception e) {
            return null;
        }
    }
}
