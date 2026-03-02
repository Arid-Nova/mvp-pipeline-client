package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Index of all REST API endpoints across microservices.
 * Generated in Phase 1, consumed by Phase 2 for remote call resolution.
 *
 * This index enables:
 * - O(1) lookup of endpoints by endpoint ID
 * - Pattern matching for URL-based endpoint resolution
 * - API contract analysis independent of implementation
 * - Cross-service linking via API contracts
 *
 * Example usage:
 * <pre>
 * EndpointIndex index = endpointIndexer.indexEndpoints(system);
 * EndpointInfo endpoint = index.findByEndpointId("userservice:abc123...");
 * List<EndpointInfo> userEndpoints = index.findByService("ts-user-service");
 * </pre>
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class EndpointIndex {

    public String id;

    /**
     * Map of endpoint IDs to endpoint information.
     * Key format: "serviceName:hash" (endpoint ID, API-based)
     * This allows O(1) lookup by endpoint ID.
     *
     * Example keys:
     * - "userservice:abc123def456..."
     * - "orderservice:789xyz012abc..."
     */
    private Map<String, EndpointInfo> endpoints;

    /**
     * Metadata about the endpoint index
     * Includes system name, commit info, timestamp, counts, etc.
     */
    private IndexMetadata metadata;

    public EndpointIndex(Map<String, EndpointInfo> endpoints, IndexMetadata metadata) {
        this.id = null;
        this.endpoints = endpoints;
        this.metadata = metadata;
    }

    // ============== LOOKUP METHODS ==============

    /**
     * Find endpoint by endpoint ID (API-based hash).
     * Provides O(1) lookup performance.
     *
     * @param endpointId Endpoint ID in format "serviceName:hash"
     * @return EndpointInfo if found, null otherwise
     */
    public EndpointInfo findByEndpointId(String endpointId) {
        return endpoints != null ? endpoints.get(endpointId) : null;
    }

    /**
     * Find endpoint by method ID (implementation-based hash).
     * This is less efficient than findByEndpointId as it requires a linear search.
     *
     * @param methodId Method ID in format "serviceName:hash"
     * @return EndpointInfo if found, null otherwise
     */
    public EndpointInfo findByMethodId(String methodId) {
        if (endpoints == null) {
            return null;
        }

        return endpoints.values().stream()
            .filter(e -> methodId.equals(e.getMethodId()))
            .findFirst()
            .orElse(null);
    }

    /**
     * Find all endpoints for a specific service.
     * Service names are normalized for matching (case-insensitive, separator-insensitive).
     *
     * @param serviceName Raw service name (e.g., "ts-user-service", "TS-USER-SERVICE")
     * @return List of endpoints for the service, empty list if none found
     */
    public List<EndpointInfo> findByService(String serviceName) {
        if (endpoints == null || serviceName == null) {
            return Collections.emptyList();
        }

        String normalized = normalizeServiceName(serviceName);

        return endpoints.values().stream()
            .filter(e -> normalized.equals(normalizeServiceName(e.getServiceName())))
            .collect(Collectors.toList());
    }

    /**
     * Find all endpoints with a specific HTTP method.
     *
     * @param httpMethod HTTP method (GET, POST, PUT, DELETE, etc.)
     * @return List of endpoints with the specified method, empty list if none found
     */
    public List<EndpointInfo> findByHttpMethod(String httpMethod) {
        if (endpoints == null || httpMethod == null) {
            return Collections.emptyList();
        }

        String normalizedMethod = httpMethod.toUpperCase();

        return endpoints.values().stream()
            .filter(e -> normalizedMethod.equals(e.getHttpMethod()))
            .collect(Collectors.toList());
    }

    /**
     * Find endpoints matching a path pattern.
     * Supports simple prefix matching.
     *
     * @param pathPrefix Path prefix to match (e.g., "/api/v1/users")
     * @return List of endpoints with matching paths, empty list if none found
     */
    public List<EndpointInfo> findByPathPrefix(String pathPrefix) {
        if (endpoints == null || pathPrefix == null) {
            return Collections.emptyList();
        }

        return endpoints.values().stream()
            .filter(e -> e.getFullUri() != null && e.getFullUri().startsWith(pathPrefix))
            .collect(Collectors.toList());
    }

    /**
     * Get all endpoints as a list.
     *
     * @return List of all endpoints, empty list if none exist
     */
    @JsonIgnore
    public List<EndpointInfo> getAllEndpoints() {
        return endpoints != null ? new ArrayList<>(endpoints.values()) : Collections.emptyList();
    }

    /**
     * Get count of endpoints.
     *
     * @return Number of endpoints in the index
     */
    public int size() {
        return endpoints != null ? endpoints.size() : 0;
    }

    /**
     * Check if index is empty.
     *
     * @return true if no endpoints exist
     */
    @JsonIgnore
    public boolean isEmpty() {
        return endpoints == null || endpoints.isEmpty();
    }

    // ============== UTILITY METHODS ==============

    /**
     * Normalize service name for consistent matching.
     * - Convert to lowercase
     * - Remove separators (-, _)
     * - Remove common prefixes (ts-, ms-, svc-)
     *
     * @param serviceName Raw service name
     * @return Normalized service name
     */
    private String normalizeServiceName(String serviceName) {
        if (serviceName == null) {
            return "unknown";
        }

        return serviceName.toLowerCase()
            .replaceAll("[-_]", "")
            .replaceAll("^(ts|ms|svc)", "");
    }

    /**
     * Get summary statistics about the endpoint index.
     *
     * @return Map with statistics (count by HTTP method, count by service, etc.)
     */
    @JsonIgnore
    public Map<String, Object> getStatistics() {
        if (endpoints == null || endpoints.isEmpty()) {
            return Collections.emptyMap();
        }

        return Map.of(
            "totalEndpoints", endpoints.size(),
            "byHttpMethod", endpoints.values().stream()
                .collect(Collectors.groupingBy(
                    EndpointInfo::getHttpMethod,
                    Collectors.counting()
                )),
            "byService", endpoints.values().stream()
                .collect(Collectors.groupingBy(
                    EndpointInfo::getServiceName,
                    Collectors.counting()
                ))
        );
    }
}
