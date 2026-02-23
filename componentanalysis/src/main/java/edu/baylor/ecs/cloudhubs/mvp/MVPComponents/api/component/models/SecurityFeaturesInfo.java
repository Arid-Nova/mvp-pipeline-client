package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Represents security features configuration for a microservice.
 * This information is extracted from Spring Security configuration.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SecurityFeaturesInfo {

    /**
     * Session management configuration
     */
    private SessionManagementConfig sessionManagement;

    /**
     * CORS (Cross-Origin Resource Sharing) configuration
     */
    private CorsConfig cors;

    /**
     * Whether CSRF protection is enabled
     */
    private boolean csrfEnabled;

    /**
     * Whether HTTP Basic authentication is enabled
     */
    private boolean httpBasicEnabled;

    /**
     * Whether form login is enabled
     */
    private boolean formLoginEnabled;

    /**
     * Whether logout is configured
     */
    private boolean logoutEnabled;

    /**
     * Whether cache control headers are enabled
     */
    private boolean cacheControlEnabled;

    /**
     * Password encoder configuration
     */
    private PasswordEncoderConfig passwordEncoder;

    /**
     * Custom security filters configured
     */
    private List<String> customFilters;

    /**
     * Session management configuration
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class SessionManagementConfig {
        /**
         * Session creation policy
         */
        private SessionCreationPolicy policy;

        /**
         * Whether sessions are created
         */
        private boolean createsSession;

        /**
         * URL to redirect to when session is invalid
         */
        private String invalidSessionUrl;

        /**
         * Session timeout in seconds
         */
        private Integer sessionTimeout;

        /**
         * Maximum number of concurrent sessions per user
         */
        private Integer maxSessions;

        /**
         * Session creation policy enum
         */
        public enum SessionCreationPolicy {
            /**
             * No session will be created or used
             */
            STATELESS,

            /**
             * Session will always be created if one doesn't exist
             */
            ALWAYS,

            /**
             * Session will be created only if required
             */
            IF_REQUIRED,

            /**
             * Session will never be created, but will use if exists
             */
            NEVER
        }
    }

    /**
     * CORS configuration
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class CorsConfig {
        /**
         * Allowed origins (e.g., ["http://localhost:3000", "*"])
         */
        private List<String> allowedOrigins;

        /**
         * Allowed HTTP methods (e.g., ["GET", "POST", "*"])
         */
        private List<String> allowedMethods;

        /**
         * Allowed headers (e.g., ["Content-Type", "Authorization", "*"])
         */
        private List<String> allowedHeaders;

        /**
         * Whether credentials (cookies, auth headers) are allowed
         */
        private boolean allowCredentials;

        /**
         * Max age for preflight request cache (in seconds)
         */
        private Integer maxAge;

        /**
         * Exposed headers
         */
        private List<String> exposedHeaders;
    }

    /**
     * Password encoder configuration
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PasswordEncoderConfig {
        /**
         * Type of password encoder
         */
        private PasswordEncoderType type;

        /**
         * Strength/rounds for encoder (BCrypt rounds, SCrypt work factor, etc.)
         */
        private Integer strength;

        /**
         * Password encoder type
         */
        public enum PasswordEncoderType {
            /**
             * BCrypt password encoder
             */
            BCRYPT,

            /**
             * SCrypt password encoder
             */
            SCRYPT,

            /**
             * Argon2 password encoder
             */
            ARGON2,

            /**
             * PBKDF2 password encoder
             */
            PBKDF2,

            /**
             * Plain text (not recommended)
             */
            PLAIN_TEXT,

            /**
             * Custom password encoder
             */
            CUSTOM
        }
    }

    // ============== FACTORY METHODS ==============

    /**
     * Create default security features configuration
     */
    public static SecurityFeaturesInfo createDefault() {
        SecurityFeaturesInfo info = new SecurityFeaturesInfo();
        info.setCsrfEnabled(true);
        info.setHttpBasicEnabled(false);
        info.setFormLoginEnabled(false);
        info.setLogoutEnabled(false);
        info.setCacheControlEnabled(false);
        info.setCustomFilters(new ArrayList<>());
        return info;
    }

    /**
     * Create stateless REST API security configuration
     */
    public static SecurityFeaturesInfo createStatelessRest() {
        SecurityFeaturesInfo info = new SecurityFeaturesInfo();

        // Stateless session
        SessionManagementConfig session = new SessionManagementConfig();
        session.setPolicy(SessionManagementConfig.SessionCreationPolicy.STATELESS);
        session.setCreatesSession(false);
        info.setSessionManagement(session);

        // Typically disabled for REST APIs
        info.setCsrfEnabled(false);
        info.setHttpBasicEnabled(false);
        info.setFormLoginEnabled(false);
        info.setLogoutEnabled(false);
        info.setCacheControlEnabled(true);
        info.setCustomFilters(new ArrayList<>());

        return info;
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder("Security Features: ");
        if (sessionManagement != null) {
            sb.append("Session=").append(sessionManagement.getPolicy()).append(", ");
        }
        sb.append("CSRF=").append(csrfEnabled ? "enabled" : "disabled");
        if (httpBasicEnabled) {
            sb.append(", HTTP Basic enabled");
        }
        if (cors != null) {
            sb.append(", CORS configured");
        }
        return sb.toString();
    }
}
