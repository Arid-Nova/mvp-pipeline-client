package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Authorization information for endpoints - represents "what can you do".
 * Separate from AuthenticationInfo which represents "who are you".
 *
 * Authorization is extracted from:
 * 1. Method-level annotations (@PreAuthorize, @Secured, @RolesAllowed)
 * 2. Spring Security configuration (antMatchers with hasRole, hasAnyRole, etc.)
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AuthorizationInfo {

    /**
     * Required roles for access
     * Always present (empty list if no roles required)
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    private List<String> requiredRoles;

    /**
     * Whether this endpoint is public (no authorization required)
     */
    private boolean isPublic;

    /**
     * Whether authentication is required but no specific roles/authorities
     * (authenticated() in SecurityConfig)
     */
    private boolean requiresAuthentication;

    /**
     * Source of authorization information
     * Values: "annotation", "SecurityConfig", "yaml", "both", "default"
     */
    private String source;

    /**
     * The pattern from SecurityConfig that matched (if source includes securityConfig)
     * Example: "/api/v1/users/**"
     */
    private String matchedPattern;

    /**
     * The HTTP method from SecurityConfig rule that matched
     * Example: "POST", null means all methods
     */
    private String matchedHttpMethod;

    /**
     * Priority/specificity of the matched pattern
     * Higher values indicate more specific patterns
     */
    private Integer matchPriority;

    /**
     * Create public authorization (no requirements)
     */
    public static AuthorizationInfo createPublic() {
        AuthorizationInfo info = new AuthorizationInfo();
        info.setRequiredRoles(new ArrayList<>());
        info.setPublic(true);
        info.setSource("default");
        return info;
    }

    /**
     * Create authorization with role requirements
     */
    public static AuthorizationInfo createWithRoles(List<String> roles, String source) {
        AuthorizationInfo info = new AuthorizationInfo();
        info.setRequiredRoles(new ArrayList<>(roles));
        info.setPublic(false);
        info.setSource(source);
        return info;
    }

    /**
     * Create authorization requiring authentication but no specific roles
     */
    public static AuthorizationInfo createAuthenticated(String source) {
        AuthorizationInfo info = new AuthorizationInfo();
        info.setRequiredRoles(new ArrayList<>());
        info.setRequiresAuthentication(true);
        info.setPublic(false);
        info.setSource(source);
        return info;
    }

    /**
     * Add a required role
     */
    public void addRequiredRole(String role) {
        if (requiredRoles == null) {
            requiredRoles = new ArrayList<>();
        }
        if (!requiredRoles.contains(role)) {
            requiredRoles.add(role);
        }
    }

    /**
     * Check if this endpoint has any authorization requirements
     */
    @JsonIgnore
    public boolean hasRequirements() {
        return !isPublic && (hasRoleRequirements() || requiresAuthentication);
    }

    /**
     * Check if this endpoint has role requirements
     */
    @JsonIgnore
    public boolean hasRoleRequirements() {
        return requiredRoles != null && !requiredRoles.isEmpty();
    }

    /**
     * Get a human-readable summary of authorization requirements
     */
    @JsonIgnore
    public String getSummary() {
        if (isPublic) {
            return "Public (No Authorization Required)";
        }

        StringBuilder summary = new StringBuilder();

        if (requiresAuthentication && !hasRoleRequirements()) {
            summary.append("Authenticated Users Only");
        } else {
            if (hasRoleRequirements()) {
                summary.append("Roles: ").append(String.join(", ", requiredRoles));
            }
        }

        if (source != null) {
            summary.append(" (from ").append(source).append(")");
        }

        return summary.toString();
    }

    @Override
    public String toString() {
        return getSummary();
    }
}
