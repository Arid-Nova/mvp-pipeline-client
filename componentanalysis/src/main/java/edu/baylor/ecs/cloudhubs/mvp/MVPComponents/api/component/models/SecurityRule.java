package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.PathPatternMatcher;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/**
 * Represents a security rule extracted from Spring Security configuration.
 * Typically corresponds to an antMatchers() rule in SecurityConfig.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SecurityRule {

    /**
     * URL pattern to match (e.g., "/api/v1/users/**")
     * Supports Spring Security pattern syntax:
     * - ** matches zero or more path segments
     * - * matches exactly one path segment
     * - ? matches exactly one character
     */
    private String pattern;

    /**
     * HTTP method to match (e.g., "GET", "POST", null for all methods)
     */
    private String httpMethod;

    /**
     * Required roles for access (from hasRole, hasAnyRole)
     */
    private List<String> requiredRoles;

    /**
     * Required authorities for access (from hasAuthority, hasAnyAuthority)
     */
    private List<String> requiredAuthorities;

    /**
     * Whether this rule permits all access (permitAll)
     */
    private boolean permitAll;

    /**
     * Whether this rule requires authentication but no specific role (authenticated)
     */
    private boolean authenticated;

    /**
     * Whether this rule denies all access (denyAll)
     */
    private boolean denyAll;

    /**
     * Priority/specificity of this pattern (higher = more specific)
     * Used to determine which rule applies when multiple patterns match
     */
    private int priority;

    /**
     * Source of this security rule
     * Values: "java" (from SecurityConfig.java), "yaml" (from application.yml)
     */
    private String source;

    /**
     * Check if this rule has any role requirements
     */
    public boolean hasRoleRequirements() {
        return requiredRoles != null && !requiredRoles.isEmpty();
    }

    /**
     * Check if this rule has any authority requirements
     */
    public boolean hasAuthorityRequirements() {
        return requiredAuthorities != null && !requiredAuthorities.isEmpty();
    }

    /**
     * Check if this rule has any security requirements
     */
    public boolean hasSecurityRequirements() {
        return hasRoleRequirements() || hasAuthorityRequirements() || authenticated || denyAll;
    }

    /**
     * Checks if this rule matches an endpoint (pattern and HTTP method).
     *
     * @param endpointUri The endpoint URI to check
     * @param endpointMethod The HTTP method of the endpoint (or null)
     * @return true if this rule applies to the endpoint
     */
    public boolean matchesEndpoint(String endpointUri, String endpointMethod) {
        // Check pattern match
        if (pattern == null || !matchesPattern(endpointUri, pattern)) {
            return false;
        }

        // Check HTTP method match (null httpMethod means all methods)
        if (httpMethod != null && endpointMethod != null) {
            return httpMethod.equalsIgnoreCase(endpointMethod);
        }

        return true;
    }

    /**
     * Checks if a URI matches this rule's URL pattern (supports wildcards).
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
     * Merges this rule with another rule, applying precedence logic.
     * YAML rules take precedence over Java rules when both exist for the same pattern.
     *
     * @param otherRule The other rule to merge with
     * @return A new SecurityRule representing the merged result
     */
    public SecurityRule mergeWith(SecurityRule otherRule) {
        if (otherRule == null) {
            return this;
        }

        // YAML takes precedence - if this is YAML, return this
        if ("yaml".equals(this.source)) {
            return this;
        }

        // If other is YAML, return other
        if ("yaml".equals(otherRule.source)) {
            return otherRule;
        }

        // Both are same source - merge based on priority
        if (this.priority >= otherRule.priority) {
            return this;
        } else {
            return otherRule;
        }
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder("SecurityRule{");
        sb.append("pattern='").append(pattern).append('\'');
        if (httpMethod != null) {
            sb.append(", method=").append(httpMethod);
        }
        if (permitAll) {
            sb.append(", permitAll");
        } else if (denyAll) {
            sb.append(", denyAll");
        } else if (authenticated) {
            sb.append(", authenticated");
        }
        if (hasRoleRequirements()) {
            sb.append(", roles=").append(requiredRoles);
        }
        if (hasAuthorityRequirements()) {
            sb.append(", authorities=").append(requiredAuthorities);
        }
        sb.append(", priority=").append(priority);
        if (source != null) {
            sb.append(", source=").append(source);
        }
        sb.append('}');
        return sb.toString();
    }
}
