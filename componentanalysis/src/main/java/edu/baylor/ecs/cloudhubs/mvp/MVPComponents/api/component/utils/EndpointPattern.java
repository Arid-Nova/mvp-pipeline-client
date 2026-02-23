package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.EndpointInfo;
import edu.university.ecs.lab.common.models.enums.HttpMethod;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

/**
 * Represents a parsed endpoint template for pattern matching.
 *
 * Converts template URLs like "/api/orders/{orderId}/items/{itemId}"
 * into structured segments (STATIC vs VARIABLE) for efficient matching
 * against concrete URLs like "/api/orders/123/items/456".
 *
 * Example:
 * <pre>
 * Template: /api/orders/{orderId}/items/{itemId}
 * Segments: [STATIC(api), STATIC(orders), VARIABLE(orderId), STATIC(items), VARIABLE(itemId)]
 *
 * Concrete: /api/orders/abc-123/items/item-456
 * Match: api=api ✓, orders=orders ✓, {orderId}=abc-123 ✓, items=items ✓, {itemId}=item-456 ✓
 * Result: MATCH!
 * </pre>
 */
@Getter
@AllArgsConstructor
public class EndpointPattern {

    /**
     * Service name used for indexing (may be URL-derived or physical).
     * This is the primary service name used for pattern matching.
     * Example: "ts-order-service"
     */
    private String serviceName;

    /**
     * Physical service name - where the controller code actually resides.
     * Example: "ts-preserve-service" (when controller is in preserve-service but exposes /orderservice paths)
     * May be null if not provided.
     */
    private String physicalServiceName;

    /**
     * Template URL with parameter placeholders (simplified with {?})
     * Used for pattern matching.
     * Example: /api/orders/{?}/items/{?}
     */
    private String templateUrl;

    /**
     * Full URL with actual parameter names (for metadata/display)
     * Example: /api/orders/{orderId}/items/{itemId}
     */
    private String fullUrl;

    /**
     * HTTP method
     */
    private HttpMethod httpMethod;

    /**
     * Pre-computed endpoint ID (API-based hash).
     * This is what we return when a match succeeds - no need to recompute.
     */
    private String endpointId;

    /**
     * Parsed URL segments for matching (from simplifiedUri)
     */
    private List<UrlSegment> segments;

    /**
     * Count of static segments (for specificity sorting).
     * Patterns with more static segments are more specific and tried first.
     */
    private int staticSegmentCount;

    /**
     * URL segment: either STATIC or VARIABLE
     */
    @Getter
    @AllArgsConstructor
    public static class UrlSegment {
        public enum Type { STATIC, VARIABLE }

        private Type type;
        private String value;  // "orders" for static, "orderId" for variable

        @Override
        public String toString() {
            return type + "(" + value + ")";
        }
    }

    // ============== FACTORY METHODS ==============

    /**
     * Create pattern from EndpointInfo.
     * Uses simplifiedUri for pattern matching (already normalized with {?} placeholders)
     * and fullUri for metadata/display purposes.
     *
     * @param endpoint Endpoint information with template URL
     * @return EndpointPattern ready for matching
     */
    public static EndpointPattern from(EndpointInfo endpoint) {
        String serviceName = endpoint.getServiceName();
        String physicalServiceName = endpoint.getPhysicalServiceName();
        String simplifiedUrl = endpoint.getSimplifiedUri();
        String fullUrl = endpoint.getFullUri();
        HttpMethod httpMethod = HttpMethod.valueOf(endpoint.getHttpMethod());
        String endpointId = endpoint.getEndpointId();

        // Use simplifiedUri for pattern matching (already has {?} placeholders)
        // Fall back to fullUri if simplifiedUri is not available
        String templateUrl = (simplifiedUrl != null && !simplifiedUrl.isEmpty())
            ? simplifiedUrl
            : fullUrl;

        // Parse template into segments
        List<UrlSegment> segments = parseTemplate(templateUrl);

        // Count static segments for specificity
        int staticCount = (int) segments.stream()
            .filter(s -> s.getType() == UrlSegment.Type.STATIC)
            .count();

        return new EndpointPattern(
            serviceName,
            physicalServiceName,
            templateUrl,
            fullUrl,
            httpMethod,
            endpointId,
            segments,
            staticCount
        );
    }

    // ============== PARSING ==============

    /**
     * Parse template URL into segments.
     *
     * Example: /api/orders/{orderId}/items/{itemId}
     * Result: [STATIC(api), STATIC(orders), VARIABLE(orderId), STATIC(items), VARIABLE(itemId)]
     *
     * @param templateUrl Template URL with {param} placeholders
     * @return List of parsed segments
     */
    private static List<UrlSegment> parseTemplate(String templateUrl) {
        List<UrlSegment> segments = new ArrayList<>();

        // Normalize and split
        String normalized = templateUrl.replaceAll("^/+|/+$", "");
        if (normalized.isEmpty()) {
            return segments;  // Root path
        }

        String[] parts = normalized.split("/");

        for (String part : parts) {
            if (part.matches("\\{[^}]+\\}")) {
                // Variable segment: {orderId}
                String varName = part.substring(1, part.length() - 1);
                segments.add(new UrlSegment(UrlSegment.Type.VARIABLE, varName));
            } else {
                // Static segment: api, orders, etc.
                segments.add(new UrlSegment(UrlSegment.Type.STATIC, part));
            }
        }

        return segments;
    }

    // ============== MATCHING ==============

    /**
     * Try to match a concrete URL against this pattern.
     *
     * Example:
     * - Template: /api/orders/{orderId}/items/{itemId}
     * - Concrete: /api/orders/123/items/456
     * - Result: true (all segments match)
     *
     * Matching rules:
     * 1. Must have same number of segments
     * 2. STATIC segments: must match exactly (case-insensitive)
     * 3. VARIABLE segments: must be valid path variable format
     *
     * @param concreteUrl Concrete URL to match (may include host, query params)
     * @return true if match succeeds, false otherwise
     */
    public boolean matches(String concreteUrl) {
        // Normalize concrete URL
        String normalized = normalizeConcreteUrl(concreteUrl);

        // Split into parts
        String[] parts = normalized.isEmpty() ? new String[0] : normalized.split("/");

        // Must have same number of segments
        if (parts.length != this.segments.size()) {
            return false;
        }

        // Check each segment
        for (int i = 0; i < segments.size(); i++) {
            UrlSegment segment = segments.get(i);
            String concrete = parts[i];

            if (segment.getType() == UrlSegment.Type.STATIC) {
                // Static segments must match exactly (case-insensitive)
                if (!segment.getValue().equalsIgnoreCase(concrete)) {
                    return false;
                }
            } else {
                // Variable segment - validate it looks like a valid path variable
                if (!isValidPathVariable(concrete)) {
                    return false;
                }
            }
        }

        return true;  // All segments matched!
    }

    /**
     * Calculate confidence score for position-based matching against a concrete URL.
     *
     * Position-based matching ignores variable names and matches purely by:
     * - URL structure (number of segments)
     * - Static segment values
     * - Variable segment positions
     *
     * Examples:
     * - Template: /api/users/{id} vs Concrete: /api/users/{userId}
     *   → confidence = 100 (all static parts match, same structure)
     *
     * - Template: /api/v1/orderservice/order/{id} vs Concrete: /api/v1/orderservice/order/{order}
     *   → confidence = 100 (all static parts match)
     *
     * - Template: /api/users/{id}/profile vs Concrete: /api/users/{id}
     *   → confidence = 0 (different structure - different segment count)
     *
     * - Template: /api/users/{id} vs Concrete: /api/orders/{id}
     *   → confidence = 50 (1/2 static segments match)
     *
     * @param concreteUrl Concrete URL (may be a template with variables)
     * @return Confidence score (0-100), where:
     *         - 100 = perfect match (all static segments match, same structure)
     *         - 90-99 = very high confidence (most static segments match)
     *         - 70-89 = medium confidence (some static segments match)
     *         - <70 = low confidence (few static segments match or wrong structure)
     *         - 0 = no match (completely different structure)
     */
    public int calculatePositionBasedConfidence(String concreteUrl) {
        // Parse the concrete URL (which may also be a template)
        List<UrlSegment> concreteSegments = parseTemplate(normalizeConcreteUrl(concreteUrl));

        // Check structure match
        if (this.segments.size() != concreteSegments.size()) {
            return 0;  // Different structure - no match
        }

        if (this.segments.isEmpty()) {
            return 100;  // Both are root paths
        }

        // Count matching static segments
        int totalStaticSegments = 0;
        int matchingStaticSegments = 0;

        for (int i = 0; i < this.segments.size(); i++) {
            UrlSegment templateSeg = this.segments.get(i);
            UrlSegment concreteSeg = concreteSegments.get(i);

            // Both are variables at same position - always match (position-based)
            if (templateSeg.getType() == UrlSegment.Type.VARIABLE &&
                concreteSeg.getType() == UrlSegment.Type.VARIABLE) {
                continue;  // Variables match by position
            }

            // Both are static - check if values match
            if (templateSeg.getType() == UrlSegment.Type.STATIC &&
                concreteSeg.getType() == UrlSegment.Type.STATIC) {
                totalStaticSegments++;

                if (templateSeg.getValue().equalsIgnoreCase(concreteSeg.getValue())) {
                    matchingStaticSegments++;
                }
                continue;
            }

            // One is static, one is variable - this is a mismatch
            // This means the structure is fundamentally different
            return 0;
        }

        // Calculate confidence based on static segment match ratio
        if (totalStaticSegments == 0) {
            // All segments are variables - perfect structural match
            return 100;
        }

        // Confidence = (matching static segments / total static segments) * 100
        int baseConfidence = (matchingStaticSegments * 100) / totalStaticSegments;

        // Adjust for partial matches:
        // If all static segments match but there are variables, it's still 100%
        // If most match, scale appropriately
        return baseConfidence;
    }

    /**
     * Normalize concrete URL for matching.
     *
     * Removes:
     * - Protocol and host (http://host:8080)
     * - Query string (?key=value)
     * - Leading/trailing slashes
     *
     * Examples:
     * - "http://host:8080/api/users/123" → "api/users/123"
     * - "/api/users/123?query=1" → "api/users/123"
     * - "/api/users/123/" → "api/users/123"
     *
     * @param url Concrete URL
     * @return Normalized URL without host, query, slashes
     */
    private String normalizeConcreteUrl(String url) {
        String normalized = url;

        // Remove protocol and host
        normalized = normalized.replaceAll("^https?://[^/]+", "");

        // Remove query string
        normalized = normalized.replaceAll("\\?.*$", "");

        // Remove leading/trailing slashes
        normalized = normalized.replaceAll("^/+|/+$", "");

        return normalized;
    }

    /**
     * Check if a value looks like a valid path variable.
     *
     * Valid path variables:
     * - Alphanumeric with dashes, underscores, dots
     * - Not empty, not too long (< 200 chars)
     * - No slashes
     *
     * Examples:
     * - "123" ✓
     * - "abc-456" ✓
     * - "user_789" ✓
     * - "550e8400-e29b-41d4-a716-446655440000" ✓ (UUID)
     * - "abc/def" ✗ (contains slash)
     * - "" ✗ (empty)
     * - "a".repeat(300) ✗ (too long)
     *
     * @param value Value to check
     * @return true if valid, false otherwise
     */
    private boolean isValidPathVariable(String value) {
        if (value == null || value.isEmpty()) {
            return false;
        }

        // Reject if contains slash or too long
        if (value.contains("/") || value.length() > 200) {
            return false;
        }

        // Accept alphanumeric, dashes, underscores, dots
        // Common formats: "123", "abc-123", "user_456", "v1.0", UUIDs
        return value.matches("[a-zA-Z0-9._-]+");
    }

    // ============== UTILITY METHODS ==============

    /**
     * Get debug representation of this pattern.
     *
     * @return Human-readable pattern description
     */
    public String toDebugString() {
        return String.format("EndpointPattern{service=%s, physicalService=%s, method=%s, templateUrl=%s, fullUrl=%s, segments=%s, static=%d}",
            serviceName, physicalServiceName, httpMethod, templateUrl, fullUrl, segments, staticSegmentCount);
    }

    @Override
    public String toString() {
        return String.format("%s %s:%s", httpMethod, serviceName, templateUrl);
    }

    /**
     * Get the full URL with actual parameter names (for display/metadata).
     * Falls back to templateUrl if fullUrl is not available.
     *
     * @return Full URL with parameter names
     */
    public String getDisplayUrl() {
        return (fullUrl != null && !fullUrl.isEmpty()) ? fullUrl : templateUrl;
    }
}
