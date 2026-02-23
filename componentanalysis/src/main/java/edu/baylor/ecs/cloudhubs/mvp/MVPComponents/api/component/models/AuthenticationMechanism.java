package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.HashMap;
import java.util.Map;

/**
 * Represents the authentication mechanism used by a microservice or endpoint.
 * This information is critical for generating authentication test cases.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AuthenticationMechanism {

    /**
     * Type of authentication mechanism
     */
    private AuthenticationType type;

    /**
     * Where the authentication token/credential is located
     */
    private TokenLocation tokenLocation;

    /**
     * HTTP header name for token (e.g., "Authorization")
     * Only applicable when tokenLocation is HEADER
     */
    private String tokenHeaderName;

    /**
     * Prefix for the token in the header (e.g., "Bearer ")
     * Only applicable for token-based auth
     */
    private String tokenPrefix;

    /**
     * Format of the token (e.g., "JWT", "OPAQUE")
     */
    private String tokenFormat;

    /**
     * JWT-specific claim mappings
     * Maps logical fields to JWT claim names
     * Example: {"username": "subject", "roles": "roles", "authorities": "authorities"}
     */
    private Map<String, String> jwtClaims;

    /**
     * Token validation rules
     */
    private TokenValidationRules validationRules;

    /**
     * Expected HTTP status codes for authentication failures
     * Example: {"noAuth": 401, "invalidToken": 401, "expiredToken": 401}
     */
    private Map<String, Integer> authFailureStatuses;

    /**
     * Authentication mechanism type
     */
    public enum AuthenticationType {
        /**
         * JSON Web Token authentication
         */
        JWT,

        /**
         * Session-based authentication (cookies)
         */
        SESSION,

        /**
         * OAuth2 authentication
         */
        OAUTH2,

        /**
         * HTTP Basic authentication
         */
        BASIC,

        /**
         * API Key authentication
         */
        API_KEY,

        /**
         * Custom authentication mechanism
         */
        CUSTOM,

        /**
         * No authentication required
         */
        NONE
    }

    /**
     * Location of authentication token/credential
     */
    public enum TokenLocation {
        /**
         * Token in HTTP header
         */
        HEADER,

        /**
         * Token in cookie
         */
        COOKIE,

        /**
         * Token in query parameter
         */
        QUERY_PARAM,

        /**
         * Token in request body
         */
        BODY
    }

    /**
     * Token validation rules
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class TokenValidationRules {
        /**
         * Whether token expiration is validated
         */
        private boolean validateExpiration;

        /**
         * Whether token signature is validated
         */
        private boolean validateSignature;

        /**
         * Map of exception types to error messages
         * Example: {"ExpiredJwtException": "Token expired"}
         */
        private Map<String, String> exceptionHandling;
    }

    // ============== FACTORY METHODS ==============

    /**
     * Create JWT-based authentication mechanism
     */
    public static AuthenticationMechanism createJWT(String headerName, String prefix) {
        AuthenticationMechanism mechanism = new AuthenticationMechanism();
        mechanism.setType(AuthenticationType.JWT);
        mechanism.setTokenLocation(TokenLocation.HEADER);
        mechanism.setTokenHeaderName(headerName);
        mechanism.setTokenPrefix(prefix);
        mechanism.setTokenFormat("JWT");

        // Default JWT claims mapping
        Map<String, String> claims = new HashMap<>();
        claims.put("username", "subject");
        claims.put("roles", "roles");
        claims.put("authorities", "authorities");
        mechanism.setJwtClaims(claims);

        // Default validation rules
        TokenValidationRules rules = new TokenValidationRules();
        rules.setValidateExpiration(true);
        rules.setValidateSignature(true);
        mechanism.setValidationRules(rules);

        // Default failure statuses
        Map<String, Integer> failures = new HashMap<>();
        failures.put("noAuth", 401);
        failures.put("invalidToken", 401);
        failures.put("expiredToken", 401);
        mechanism.setAuthFailureStatuses(failures);

        return mechanism;
    }

    /**
     * Create session-based authentication mechanism
     */
    public static AuthenticationMechanism createSession() {
        AuthenticationMechanism mechanism = new AuthenticationMechanism();
        mechanism.setType(AuthenticationType.SESSION);
        mechanism.setTokenLocation(TokenLocation.COOKIE);

        Map<String, Integer> failures = new HashMap<>();
        failures.put("noSession", 401);
        failures.put("expiredSession", 401);
        mechanism.setAuthFailureStatuses(failures);

        return mechanism;
    }

    /**
     * Create OAuth2 authentication mechanism
     */
    public static AuthenticationMechanism createOAuth2(String headerName, String prefix) {
        AuthenticationMechanism mechanism = new AuthenticationMechanism();
        mechanism.setType(AuthenticationType.OAUTH2);
        mechanism.setTokenLocation(TokenLocation.HEADER);
        mechanism.setTokenHeaderName(headerName);
        mechanism.setTokenPrefix(prefix);
        mechanism.setTokenFormat("OAuth2");

        Map<String, Integer> failures = new HashMap<>();
        failures.put("noAuth", 401);
        failures.put("invalidToken", 401);
        failures.put("insufficientScope", 403);
        mechanism.setAuthFailureStatuses(failures);

        return mechanism;
    }

    /**
     * Create HTTP Basic authentication mechanism
     */
    public static AuthenticationMechanism createBasic() {
        AuthenticationMechanism mechanism = new AuthenticationMechanism();
        mechanism.setType(AuthenticationType.BASIC);
        mechanism.setTokenLocation(TokenLocation.HEADER);
        mechanism.setTokenHeaderName("Authorization");
        mechanism.setTokenPrefix("Basic ");

        Map<String, Integer> failures = new HashMap<>();
        failures.put("noAuth", 401);
        failures.put("invalidCredentials", 401);
        mechanism.setAuthFailureStatuses(failures);

        return mechanism;
    }

    /**
     * Create API Key authentication mechanism
     */
    public static AuthenticationMechanism createApiKey(String headerName) {
        AuthenticationMechanism mechanism = new AuthenticationMechanism();
        mechanism.setType(AuthenticationType.API_KEY);
        mechanism.setTokenLocation(TokenLocation.HEADER);
        mechanism.setTokenHeaderName(headerName);

        Map<String, Integer> failures = new HashMap<>();
        failures.put("noApiKey", 401);
        failures.put("invalidApiKey", 401);
        mechanism.setAuthFailureStatuses(failures);

        return mechanism;
    }

    /**
     * Create no authentication mechanism
     */
    public static AuthenticationMechanism createNone() {
        AuthenticationMechanism mechanism = new AuthenticationMechanism();
        mechanism.setType(AuthenticationType.NONE);
        return mechanism;
    }

    @Override
    public String toString() {
        if (type == AuthenticationType.NONE) {
            return "No Authentication";
        }
        return String.format("%s Authentication (%s: %s%s)",
                type,
                tokenLocation,
                tokenHeaderName != null ? tokenHeaderName : "",
                tokenPrefix != null ? " with prefix '" + tokenPrefix + "'" : "");
    }
}
