package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import edu.university.ecs.lab.common.models.enums.HttpMethod;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Enhanced information for method call nodes in the CFG.
 * Provides detailed method resolution and call context.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"targetMethodId", "canonicalId", "resolved", "objectType", "returnUsed", "isStatic",
                   "callType", "targetService", "endpoint", "httpMethod", "isAsync", "serviceDiscoveryPattern",
                   "targetEndpointId", "endpointResolved", "normalizedUrl", "urlVariableName", "hasConditionalUrl",
                   "branchCondition", "pathBranchNodeId"})
public class MethodCallInfo {

    /**
     * Resolution confidence levels
     */
    public enum ResolutionLevel {
        EXACT,      // Method resolved with exact match including parameters
        PARTIAL,    // Method resolved by name only (possible overloads)
        UNRESOLVED  // Method not found in index
    }

    /**
     * Method call types for microservice analysis
     */
    public enum CallType {
        LOCAL,              // Method call within the same service
        REMOTE_HTTP,        // HTTP call to another service (RestTemplate, WebClient)
        REMOTE_ASYNC,       // Asynchronous remote call
        SERVICE_DISCOVERY,  // Call using service discovery (e.g., serviceResolver)
        DATABASE,           // Database operation call
        EXTERNAL_API        // Call to external third-party service
    }

    /**
     * Target method ID that matches indexed component IDs
     */
    private String targetMethodId;

    /**
     * Canonical method signature for cross-service references
     */
    private String canonicalId;

    /**
     * Resolution confidence level
     */
    private ResolutionLevel resolved;

    /**
     * Type of the object/class the method is called on
     */
    private String objectType;

    /**
     * Whether the return value is used/assigned
     */
    private Boolean returnUsed;

    /**
     * Whether this is a static method call
     */
    private Boolean isStatic;

    /**
     * Type of method call (local, remote, etc.)
     */
    private CallType callType;

    /**
     * Target service name for remote calls (e.g., "ts-order-service")
     */
    private String targetService;

    /**
     * Endpoint path for remote calls (e.g., "/api/v1/orderservice/order/admin")
     */
    private String endpoint;

    /**
     * HTTP method for remote calls (GET, POST, PUT, DELETE, etc.)
     */
    private HttpMethod httpMethod;

    /**
     * Whether this is an asynchronous call
     */
    private Boolean isAsync;

    /**
     * Service discovery pattern used (e.g., "serviceResolver.getServiceUrl")
     */
    private String serviceDiscoveryPattern;

    /**
     * Target endpoint ID resolved from pattern matching.
     * This is the endpoint ID (API-based) of the remote endpoint being called.
     * Format: normalizedService:hash (e.g., "userservice:abc123...")
     *
     * Presence rules:
     * - Present with value: Remote call successfully resolved to a known endpoint
     * - Present with null: Remote call attempted but endpoint not found in endpoints.json
     * - Absent: Not a remote call (local call, no endpoint resolution attempted)
     */
    @com.fasterxml.jackson.annotation.JsonIgnore  // Don't use Lombok getter for JSON
    private String targetEndpointId;

    /**
     * Whether the endpoint was successfully resolved via pattern matching.
     * - true: Pattern matching succeeded, targetEndpointId is set
     * - false: Pattern matching failed (dynamic URL, external API, etc.)
     * - null: Not a remote call or resolution not attempted
     */
    private Boolean endpointResolved;

    /**
     * Normalized URL template from pattern matching.
     * For concrete URL "/api/users/123", this would be "/api/users/{id}"
     * Used for debugging and understanding how the URL was matched.
     */
    private String normalizedUrl;

    /**
     * Name of the URL variable used in the remote call (if URL is passed via variable).
     * Example: For restTemplate.exchange(requestOrderURL, ...), this would be "requestOrderURL"
     * Used for conditional URL tracking.
     */
    private String urlVariableName;

    /**
     * Whether this remote call uses a conditionally-assigned URL variable.
     * If true, the URL variable has different values based on branch conditions,
     * and this node should be duplicated to represent all possible remote calls.
     */
    private Boolean hasConditionalUrl;

    /**
     * Branch condition that leads to this specific remote call path.
     * Only set when this node is one of multiple duplicated nodes for a conditional URL.
     * Example: "info.getTripId().startsWith(\"G\")" or "!(info.getTripId().startsWith(\"G\"))"
     */
    private String branchCondition;

    /**
     * Node ID of the branch assignment that corresponds to this remote call path.
     * Only set when this node is one of multiple duplicated nodes for a conditional URL.
     * Links the remote call back to the specific ASSIGNMENT node that set this URL value.
     */
    private Integer pathBranchNodeId;

    /**
     * Custom JSON getter for targetEndpointId.
     * Only includes this field when endpoint resolution was attempted (endpointResolved is not null).
     * Uses a special marker to distinguish "don't include field" from "include as null".
     */
    @JsonProperty("targetEndpointId")
    @JsonInclude(value = JsonInclude.Include.CUSTOM, valueFilter = RemoteCallNullFilter.class)
    public Object getTargetEndpointIdForJson() {
        if (endpointResolved == null) {
            // Not a remote call - don't include field at all
            // Return special marker that filter will recognize
            return RemoteCallNullFilter.OMIT;
        }
        // Remote call - include field (even if null)
        return targetEndpointId;
    }

    /**
     * Regular getter for programmatic access (not for JSON serialization).
     */
    public String getTargetEndpointId() {
        return targetEndpointId;
    }

    /**
     * Custom filter for targetEndpointId that allows null values for remote calls
     * but omits the field entirely for non-remote calls.
     */
    public static class RemoteCallNullFilter {
        // Special marker object to indicate "omit this field"
        static final Object OMIT = new Object();

        @Override
        public boolean equals(Object obj) {
            // Return true to EXCLUDE field, false to INCLUDE field
            return obj == OMIT;  // Exclude only if it's our special marker
        }

        @Override
        public int hashCode() {
            return super.hashCode();
        }
    }

    /**
     * Create method call info for an exact resolution
     */
    public static MethodCallInfo createExact(String targetMethodId, String canonicalId, String objectType) {
        return new MethodCallInfo(targetMethodId, canonicalId, ResolutionLevel.EXACT, objectType, null, null,
                                CallType.LOCAL, null, null, null, null, null, null, null, null,
                                null, null, null, null);
    }

    /**
     * Create method call info for a partial resolution
     */
    public static MethodCallInfo createPartial(String targetMethodId, String canonicalId, String objectType) {
        return new MethodCallInfo(targetMethodId, canonicalId, ResolutionLevel.PARTIAL, objectType, null, null,
                                CallType.LOCAL, null, null, null, null, null, null, null, null,
                                null, null, null, null);
    }

    /**
     * Create method call info for an unresolved method
     */
    public static MethodCallInfo createUnresolved(String objectType) {
        return new MethodCallInfo(null, null, ResolutionLevel.UNRESOLVED, objectType, null, null,
                                CallType.LOCAL, null, null, null, null, null, null, null, null,
                                null, null, null, null);
    }

    /**
     * Create method call info for a remote HTTP call
     */
    public static MethodCallInfo createRemoteCall(String targetService, String endpoint,
                                                 HttpMethod httpMethod, String objectType) {
        return new MethodCallInfo(null, null, ResolutionLevel.PARTIAL, objectType, null, null,
                                CallType.REMOTE_HTTP, targetService, endpoint, httpMethod, false, null,
                                null, null, null, null, null, null, null);
    }

    /**
     * Create method call info for a service discovery call
     */
    public static MethodCallInfo createServiceDiscoveryCall(String serviceName, String discoveryPattern, String objectType) {
        return new MethodCallInfo(null, null, ResolutionLevel.PARTIAL, objectType, null, null,
                                CallType.SERVICE_DISCOVERY, serviceName, null, null, false, discoveryPattern,
                                null, null, null, null, null, null, null);
    }

    /**
     * Check if the method call was successfully resolved
     */
    public boolean isResolved() {
        return resolved == ResolutionLevel.EXACT || resolved == ResolutionLevel.PARTIAL;
    }

    /**
     * Check if the resolution is exact (with parameter matching)
     */
    public boolean isExactResolution() {
        return resolved == ResolutionLevel.EXACT;
    }

    /**
     * Check if this is a remote service call
     */
    public boolean isRemoteCall() {
        return callType == CallType.REMOTE_HTTP || callType == CallType.REMOTE_ASYNC || callType == CallType.EXTERNAL_API;
    }

    /**
     * Check if this is a service discovery call
     */
    public boolean isServiceDiscoveryCall() {
        return callType == CallType.SERVICE_DISCOVERY;
    }

    /**
     * Check if this is a local method call
     */
    public boolean isLocalCall() {
        return callType == CallType.LOCAL;
    }

    /**
     * Get a description suitable for CFG node display
     */
    public String getDisplayDescription() {
        if (isRemoteCall()) {
            StringBuilder desc = new StringBuilder();
            if (targetService != null) {
                desc.append(targetService);
            }
            if (endpoint != null) {
                desc.append(endpoint);
            }
            if (httpMethod != null) {
                desc.append(" [").append(httpMethod).append("]");
            }
            return desc.toString();
        } else if (isServiceDiscoveryCall()) {
            return "service-discovery: " + (targetService != null ? targetService : "unknown");
        }
        return objectType != null ? objectType : "local-call";
    }
}