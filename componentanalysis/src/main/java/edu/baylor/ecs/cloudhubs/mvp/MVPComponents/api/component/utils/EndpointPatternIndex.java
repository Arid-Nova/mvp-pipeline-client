package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.EndpointIndex;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.EndpointInfo;
import edu.university.ecs.lab.common.models.enums.HttpMethod;

import java.util.*;

/**
 * Index for efficient pattern matching of concrete URLs to endpoint templates.
 *
 * Built from EndpointIndex in Phase 1, used in Phase 2 for remote call resolution.
 *
 * Architecture:
 * - Three-level index: serviceName → HttpMethod → List<EndpointPattern>
 * - Patterns sorted by specificity (more static segments = higher priority)
 * - Exact matching first, heuristic fallback if no match
 *
 * Example usage:
 * <pre>
 * EndpointPatternIndex index = new EndpointPatternIndex(endpointIndex);
 *
 * EndpointMatchResult result = index.resolve(
 *     "user-service",
 *     "/api/users/123",
 *     HttpMethod.GET
 * );
 *
 * if (result.isMatched()) {
 *     String endpointId = result.getEndpointId();
 *     callInfo.setTargetEndpointId(endpointId);
 * }
 * </pre>
 */
public class EndpointPatternIndex {

    /**
     * Three-level index: serviceName → HttpMethod → List<EndpointPattern>
     * Patterns are sorted by specificity (more static segments = higher priority)
     *
     * Example:
     * {
     *   "userservice": {
     *     GET: [
     *       Pattern(/api/users/{id}, static=2),           // More specific (tried first)
     *       Pattern(/api/{resource}/{id}, static=1)       // Less specific (tried second)
     *     ],
     *     POST: [...]
     *   }
     * }
     */
    private Map<String, Map<HttpMethod, List<EndpointPattern>>> index;

    /**
     * Build pattern index from endpoint index.
     * This is called once in Phase 2 initialization.
     *
     * @param endpointIndex Endpoint index from Phase 1
     */
    public EndpointPatternIndex(EndpointIndex endpointIndex) {
        this.index = new HashMap<>();
        buildIndex(endpointIndex);
    }

    // ============== INDEX BUILDING ==============

    /**
     * Build the pattern index from endpoint index.
     * Groups patterns by service and HTTP method, sorts by specificity.
     */
    private void buildIndex(EndpointIndex endpointIndex) {
        for (EndpointInfo endpoint : endpointIndex.getAllEndpoints()) {
            // Normalize service name
            String serviceName = normalizeServiceName(endpoint.getServiceName());

            // Parse HTTP method
            HttpMethod method;
            try {
                method = HttpMethod.valueOf(endpoint.getHttpMethod());
            } catch (IllegalArgumentException e) {
                // Skip invalid methods
                continue;
            }

            // Create pattern
            EndpointPattern pattern = EndpointPattern.from(endpoint);

            // Add to index
            index.computeIfAbsent(serviceName, k -> new HashMap<>())
                 .computeIfAbsent(method, k -> new ArrayList<>())
                 .add(pattern);
        }

        // Sort patterns by specificity (more static segments = higher priority)
        for (Map<HttpMethod, List<EndpointPattern>> methodMap : index.values()) {
            for (List<EndpointPattern> patterns : methodMap.values()) {
                patterns.sort((a, b) ->
                    // Sort descending by static count (most specific first)
                    Integer.compare(b.getStaticSegmentCount(), a.getStaticSegmentCount())
                );
            }
        }
    }

    // ============== RESOLUTION METHODS ==============

    /**
     * Resolve a concrete URL to an endpoint ID.
     * Convenience method that returns just the endpoint ID.
     *
     * @param targetService Service name from remote call
     * @param concreteUrl Concrete URL (may include host, query params)
     * @param httpMethod HTTP method
     * @return Endpoint ID if match found, null otherwise
     */
    public String resolveEndpointId(String targetService, String concreteUrl, HttpMethod httpMethod) {
        EndpointMatchResult result = resolve(targetService, concreteUrl, httpMethod);
        return result.isMatched() ? result.getEndpointId() : null;
    }

    /**
     * Resolve concrete URL to endpoint with full match information.
     * This is the main resolution method used by the CFG generator.
     *
     * Strategy:
     * 1. Normalize service name
     * 2. Get candidate patterns for (service, method)
     * 3. Try exact matching against each pattern (by specificity)
     * 4. If no exact match, try heuristic normalization
     * 5. Return result with match type
     *
     * @param targetService Service name from remote call (e.g., "ts-user-service")
     * @param concreteUrl Concrete URL (e.g., "/api/users/123", "http://host/api/users/123")
     * @param httpMethod HTTP method (GET, POST, etc.)
     * @return EndpointMatchResult with match status and details
     */
    public EndpointMatchResult resolve(String targetService, String concreteUrl, HttpMethod httpMethod) {
        // Validate inputs
        if (targetService == null || concreteUrl == null || httpMethod == null) {
            return EndpointMatchResult.noMatch();
        }

        // Normalize service name
        String normalizedService = normalizeServiceName(targetService);

        // Get candidate patterns for this service + method
        List<EndpointPattern> patterns = index
            .getOrDefault(normalizedService, Collections.emptyMap())
            .getOrDefault(httpMethod, Collections.emptyList());

        // Try exact matching first (patterns already sorted by specificity)
        for (EndpointPattern pattern : patterns) {
            if (pattern.matches(concreteUrl)) {
                // Found exact match!
                // Use getDisplayUrl() to return the full URL with actual parameter names (e.g., {userId})
                // rather than simplified placeholders (e.g., {?})
                return EndpointMatchResult.exactMatch(
                    pattern.getEndpointId(),
                    pattern.getDisplayUrl()
                );
            }
        }

        // No exact match - try position-based fuzzy matching (only returns if confidence >= 90%)
        return tryFuzzyMatch(normalizedService, concreteUrl, httpMethod);
    }

    /**
     * Try position-based fuzzy matching when no exact pattern matches.
     *
     * Instead of generating phantom endpoint IDs, this method:
     * 1. Tries position-based matching against ALL real endpoints in the index
     * 2. Calculates confidence score for each candidate
     * 3. Returns the best match ONLY if confidence >= 90%
     * 4. Returns NO_MATCH otherwise (no fake IDs!)
     *
     * This ensures we ONLY reference endpoints that actually exist in the system.
     *
     * Example:
     * - Concrete: "/api/v1/orderservice/order/{order}"
     * - Real endpoint: "/api/v1/orderservice/order/{id}" (confidence: 100%)
     * - Result: FUZZY_HIGH_CONFIDENCE match with real endpoint ID
     *
     * - Concrete: "/api/new-feature/12345"
     * - No matching real endpoints (confidence: <90%)
     * - Result: NO_MATCH (targetEndpointId = null)
     *
     * @param serviceName Normalized service name
     * @param concreteUrl Concrete URL (may be a template)
     * @param httpMethod HTTP method
     * @return Fuzzy match result (only if confidence >= 90%), or NO_MATCH
     */
    private EndpointMatchResult tryFuzzyMatch(String serviceName, String concreteUrl, HttpMethod httpMethod) {
        // Get ALL candidate patterns for this service + method
        List<EndpointPattern> patterns = index
            .getOrDefault(serviceName, Collections.emptyMap())
            .getOrDefault(httpMethod, Collections.emptyList());

        if (patterns.isEmpty()) {
            return EndpointMatchResult.noMatch();
        }

        // Try position-based matching against each real endpoint
        EndpointPattern bestMatch = null;
        int bestConfidence = 0;

        for (EndpointPattern pattern : patterns) {
            int confidence = pattern.calculatePositionBasedConfidence(concreteUrl);

            if (confidence > bestConfidence) {
                bestConfidence = confidence;
                bestMatch = pattern;
            }
        }

        // Only return match if confidence meets threshold (90%)
        if (bestConfidence >= 90 && bestMatch != null) {
            // High confidence fuzzy match - use the REAL endpoint ID
            // Use getDisplayUrl() to return URL with actual parameter names
            return EndpointMatchResult.fuzzyMatch(
                bestMatch.getEndpointId(),      // Real endpoint ID from index
                bestMatch.getDisplayUrl(),      // Real template URL with parameter names
                bestConfidence                  // Confidence score
            );
        }

        // Confidence too low or no match - return null (no fake IDs!)
        return EndpointMatchResult.noMatch();
    }

    /**
     * Try heuristic URL normalization when no pattern matches.
     *
     * @deprecated This method generates phantom endpoint IDs that don't exist.
     * Use tryFuzzyMatch instead which only references real endpoints.
     */
    @Deprecated
    private EndpointMatchResult tryHeuristicMatch(String serviceName, String concreteUrl, HttpMethod httpMethod) {
        // Apply heuristic normalization
        String heuristicUrl = heuristicNormalize(concreteUrl);

        // Generate endpoint ID from heuristic template
        String heuristicId = EndpointIdGenerator.generate(serviceName, heuristicUrl, httpMethod);

        // Return heuristic match
        return EndpointMatchResult.heuristicMatch(heuristicId, heuristicUrl);
    }

    // ============== HEURISTIC NORMALIZATION ==============

    /**
     * Heuristically normalize a URL by replacing values that look like IDs
     * with generic {id} placeholder.
     *
     * ID detection heuristics:
     * - Pure numbers (123, 456)
     * - UUIDs (550e8400-e29b-41d4-a716-446655440000)
     * - Long alphanumeric strings (abc123def456, mongodb-objectid)
     *
     * Examples:
     * - "/api/users/123" → "/api/users/{id}"
     * - "/api/orders/abc-123/items/456" → "/api/orders/{id}/items/{id}"
     * - "/api/products/550e8400-e29b-41d4-a716-446655440000" → "/api/products/{id}"
     *
     * @param concreteUrl Concrete URL
     * @return Normalized URL with {id} placeholders
     */
    private String heuristicNormalize(String concreteUrl) {
        // Remove protocol, host, query string
        String normalized = concreteUrl
            .replaceAll("^https?://[^/]+", "")  // Remove host
            .replaceAll("\\?.*$", "");          // Remove query

        // Split into segments
        String[] parts = normalized.split("/");
        StringBuilder result = new StringBuilder();

        for (String part : parts) {
            if (part.isEmpty()) continue;

            result.append("/");

            if (looksLikeId(part)) {
                // Replace ID-like segment with generic {id}
                result.append("{id}");
            } else {
                // Keep non-ID segment as-is
                result.append(part);
            }
        }

        return result.length() == 0 ? "/" : result.toString();
    }

    /**
     * Detect if a URL segment looks like an ID.
     *
     * Heuristics:
     * 1. UUID pattern (8-4-4-4-12 hex digits)
     * 2. Pure numbers (digits only)
     * 3. Long alphanumeric strings (8+ chars with optional dashes)
     * 4. MongoDB ObjectId (24 hex digits)
     *
     * @param segment URL segment to check
     * @return true if looks like an ID
     */
    private boolean looksLikeId(String segment) {
        if (segment == null || segment.isEmpty()) {
            return false;
        }

        // UUID pattern: 8-4-4-4-12 hex digits
        if (segment.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
            return true;
        }

        // Pure numbers (common for integer IDs)
        if (segment.matches("\\d+")) {
            return true;
        }

        // Long alphanumeric strings (8+ chars, possibly with dashes)
        // Examples: "abc123def456", "user-550e8400"
        if (segment.matches("[a-zA-Z0-9]{8,}(-[a-zA-Z0-9]+)*")) {
            return true;
        }

        // MongoDB ObjectId (24 hex digits)
        if (segment.matches("[0-9a-f]{24}")) {
            return true;
        }

        return false;
    }

    // ============== UTILITY METHODS ==============

    /**
     * Normalize service name for consistent matching.
     * - Convert to lowercase
     * - Remove separators (-, _)
     * - Remove common prefixes (ts-, ms-, svc-)
     *
     * Examples:
     * - "ts-user-service" → "userservice"
     * - "TS-USER-SERVICE" → "userservice"
     * - "user_service" → "userservice"
     *
     * @param serviceName Raw service name
     * @return Normalized service name
     */
    private String normalizeServiceName(String serviceName) {
        if (serviceName == null) {
            return "unknown";
        }

        return serviceName.toLowerCase()
            .replaceAll("[-_]", "")                    // Remove separators
            .replaceAll("^(ts|ms|svc)", "");           // Remove common prefixes
    }

    /**
     * Find the service name by matching a URL path against all endpoints in the index.
     * This is a fallback method when the service name cannot be determined from
     * variable tracking or URL variable name patterns.
     *
     * Strategy:
     * 1. Iterate through all services in the index
     * 2. For each service, check if any endpoint pattern matches the given URL
     * 3. Return the first matching service name (denormalized to ts-format)
     *
     * Example:
     * - URL: /api/v1/orderservice/order/admin, Method: PUT
     * - Searches all services for a matching pattern
     * - Returns: "ts-order-service" (from the matched endpoint's metadata)
     *
     * @param urlPath Concrete URL path to match
     * @param httpMethod HTTP method (GET, POST, etc.)
     * @return Service name if a matching endpoint is found, null otherwise
     */
    public String findServiceByUrlPath(String urlPath, HttpMethod httpMethod) {
        if (urlPath == null || httpMethod == null) {
            return null;
        }

        // Search all services for a matching pattern
        for (Map.Entry<String, Map<HttpMethod, List<EndpointPattern>>> serviceEntry : index.entrySet()) {
            String normalizedService = serviceEntry.getKey();
            Map<HttpMethod, List<EndpointPattern>> methodMap = serviceEntry.getValue();

            // Check patterns for the specific HTTP method
            List<EndpointPattern> patterns = methodMap.get(httpMethod);
            if (patterns == null || patterns.isEmpty()) {
                continue;
            }

            for (EndpointPattern pattern : patterns) {
                if (pattern.matches(urlPath)) {
                    // Found a match - return the original service name from the pattern
                    String serviceName = pattern.getServiceName();
                    if (serviceName != null && !serviceName.isEmpty()) {
                        return serviceName;
                    }
                    // Fallback: reconstruct service name from normalized form
                    return "ts-" + normalizedService + "-service";
                }
            }
        }

        // No match found - try fuzzy matching with relaxed criteria
        return findServiceByFuzzyMatch(urlPath, httpMethod);
    }

    /**
     * Try fuzzy matching when exact pattern matching fails.
     * Uses position-based confidence scoring to find the best match.
     *
     * @param urlPath URL path to match
     * @param httpMethod HTTP method
     * @return Service name if confidence is high enough (>= 80%), null otherwise
     */
    private String findServiceByFuzzyMatch(String urlPath, HttpMethod httpMethod) {
        String bestService = null;
        int bestConfidence = 0;

        for (Map.Entry<String, Map<HttpMethod, List<EndpointPattern>>> serviceEntry : index.entrySet()) {
            Map<HttpMethod, List<EndpointPattern>> methodMap = serviceEntry.getValue();

            List<EndpointPattern> patterns = methodMap.get(httpMethod);
            if (patterns == null || patterns.isEmpty()) {
                continue;
            }

            for (EndpointPattern pattern : patterns) {
                int confidence = pattern.calculatePositionBasedConfidence(urlPath);
                if (confidence > bestConfidence) {
                    bestConfidence = confidence;
                    bestService = pattern.getServiceName();
                    if (bestService == null || bestService.isEmpty()) {
                        bestService = "ts-" + serviceEntry.getKey() + "-service";
                    }
                }
            }
        }

        // Only return if confidence is high enough (80% threshold for service discovery)
        if (bestConfidence >= 80 && bestService != null) {
            return bestService;
        }

        return null;
    }

    /**
     * Get statistics about the pattern index.
     *
     * @return Map with statistics (pattern counts by service/method)
     */
    public Map<String, Object> getStatistics() {
        int totalPatterns = 0;
        Map<String, Integer> byService = new HashMap<>();
        Map<String, Integer> byMethod = new HashMap<>();

        for (Map.Entry<String, Map<HttpMethod, List<EndpointPattern>>> serviceEntry : index.entrySet()) {
            String service = serviceEntry.getKey();
            int serviceCount = 0;

            for (Map.Entry<HttpMethod, List<EndpointPattern>> methodEntry : serviceEntry.getValue().entrySet()) {
                HttpMethod method = methodEntry.getKey();
                int count = methodEntry.getValue().size();

                serviceCount += count;
                totalPatterns += count;

                byMethod.put(method.toString(), byMethod.getOrDefault(method.toString(), 0) + count);
            }

            byService.put(service, serviceCount);
        }

        return Map.of(
            "totalPatterns", totalPatterns,
            "services", index.size(),
            "byService", byService,
            "byMethod", byMethod
        );
    }
}
