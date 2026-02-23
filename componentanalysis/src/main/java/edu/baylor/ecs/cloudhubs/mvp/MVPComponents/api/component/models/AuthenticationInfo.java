package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Authentication and authorization information for endpoints.
 * Captures security requirements from Spring Security annotations.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AuthenticationInfo {

    /**
     * Whether authentication is required
     */
    private boolean required;

    /**
     * Required roles (from @PreAuthorize, @Secured, @RolesAllowed)
     */
    private List<String> requiredRoles;

    /**
     * SpEL expression from @PreAuthorize
     */
    private String spelExpression;

    /**
     * Authentication type (BASIC, BEARER, OAUTH2, etc.)
     */
    private String authenticationType;

    /**
     * Expected HTTP status for auth failures
     * e.g., {"noAuth": 401, "wrongRole": 403}
     */
    private Map<String, Integer> authFailureStatuses;

    /**
     * OAuth2 scopes required
     */
    private List<String> oauthScopes;

    /**
     * Whether anonymous access is explicitly permitted (@PermitAll)
     */
    private boolean permitAll;

    /**
     * Authorities required (from @PreAuthorize hasAuthority)
     */
    private List<String> requiredAuthorities;

    /**
     * Source of authentication information
     * Values: "annotation", "securityConfig", "both", "default"
     */
    private String source;

    /**
     * Authentication mechanism details (JWT, session, OAuth2, etc.)
     * This is typically set at microservice level, not per-endpoint
     */
    private AuthenticationMechanism mechanism;

    /**
     * Whether authentication is optional (token validation occurs if provided, but not required)
     * This happens when:
     * - Authentication filter (e.g., JWTFilter) is configured to run on all requests
     * - Endpoint is marked as permitAll() (public)
     * - Invalid tokens will still trigger 401, but no token allows access
     */
    private boolean optionalAuthentication;

    /**
     * Create authentication info with no requirements (public endpoint)
     */
    public static AuthenticationInfo createPublic() {
        AuthenticationInfo info = new AuthenticationInfo();
        info.setRequired(false);
        info.setPermitAll(true);
        return info;
    }

    /**
     * Create authentication info with role requirements
     */
    public static AuthenticationInfo createWithRoles(List<String> roles) {
        AuthenticationInfo info = new AuthenticationInfo();
        info.setRequired(true);
        info.setRequiredRoles(new ArrayList<>(roles));
        info.setAuthFailureStatuses(createDefaultFailureStatuses());
        return info;
    }

    /**
     * Create authentication info with SpEL expression
     */
    public static AuthenticationInfo createWithSpEL(String spelExpression) {
        AuthenticationInfo info = new AuthenticationInfo();
        info.setRequired(true);
        info.setSpelExpression(spelExpression);
        info.setAuthFailureStatuses(createDefaultFailureStatuses());
        return info;
    }

    /**
     * Create default failure statuses
     */
    private static Map<String, Integer> createDefaultFailureStatuses() {
        Map<String, Integer> statuses = new HashMap<>();
        statuses.put("noAuth", 401);
        statuses.put("wrongRole", 403);
        return statuses;
    }

    /**
     * Add a required role
     */
    public void addRequiredRole(String role) {
        if (requiredRoles == null) {
            requiredRoles = new ArrayList<>();
        }
        requiredRoles.add(role);
    }

    /**
     * Add a required authority
     */
    public void addRequiredAuthority(String authority) {
        if (requiredAuthorities == null) {
            requiredAuthorities = new ArrayList<>();
        }
        requiredAuthorities.add(authority);
    }

    /**
     * Add an OAuth2 scope
     */
    public void addOAuthScope(String scope) {
        if (oauthScopes == null) {
            oauthScopes = new ArrayList<>();
        }
        oauthScopes.add(scope);
    }

    /**
     * Check if this endpoint has any security requirements
     */
    @JsonIgnore
    public boolean hasSecurityRequirements() {
        return required && !permitAll;
    }

    /**
     * Get a summary of security requirements
     */
    @JsonIgnore
    public String getSecuritySummary() {
        if (permitAll) {
            return "Public (PermitAll)";
        }
        if (!required) {
            return "Public (No Security)";
        }

        StringBuilder summary = new StringBuilder("Authenticated");
        if (requiredRoles != null && !requiredRoles.isEmpty()) {
            summary.append(" - Roles: ").append(String.join(", ", requiredRoles));
        }
        if (requiredAuthorities != null && !requiredAuthorities.isEmpty()) {
            summary.append(" - Authorities: ").append(String.join(", ", requiredAuthorities));
        }
        if (oauthScopes != null && !oauthScopes.isEmpty()) {
            summary.append(" - Scopes: ").append(String.join(", ", oauthScopes));
        }

        return summary.toString();
    }

    @Override
    public String toString() {
        return getSecuritySummary();
    }
}
