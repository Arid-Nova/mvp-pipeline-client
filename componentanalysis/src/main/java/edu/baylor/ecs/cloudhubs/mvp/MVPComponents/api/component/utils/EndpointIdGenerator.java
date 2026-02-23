package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils;

import edu.university.ecs.lab.common.models.enums.HttpMethod;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Generates deterministic endpoint IDs from API contracts.
 *
 * Format: normalizedService:hash(normalizedService:normalizedUrl:httpMethod)
 *
 * Example:
 * - Service: "ts-user-service"
 * - URL: "/api/v1/users/{id}"
 * - Method: GET
 * - Result: "userservice:abc123def456..." (32 hex chars after colon)
 *
 * The endpoint ID is based purely on the API contract (URL + method + service),
 * not the implementation details. This enables cross-service linking via API contracts.
 */
public class EndpointIdGenerator {

    /**
     * Generate endpoint ID from API contract
     *
     * @param serviceName Raw service name (e.g., "ts-user-service", "TS-USER-SERVICE")
     * @param templateUrl Template URL with parameter placeholders (e.g., "/api/v1/users/{id}")
     * @param httpMethod HTTP method (GET, POST, PUT, DELETE, etc.)
     * @return Endpoint ID in format "serviceName:hash" (e.g., "userservice:abc123...")
     */
    public static String generate(String serviceName, String templateUrl, HttpMethod httpMethod) {
        // 1. Normalize service name
        String normalizedService = normalizeServiceName(serviceName);

        // 2. Normalize URL
        String normalizedUrl = normalizeUrl(templateUrl);

        // 3. Build signature
        String method = httpMethod.toString().toUpperCase();
        String signature = normalizedService + ":" + normalizedUrl + ":" + method;

        // 4. Generate hash
        String hash = generateHash(signature);

        // 5. Return ID with service prefix
        return normalizedService + ":" + hash;
    }

    /**
     * Normalize service name for consistent ID generation.
     *
     * Rules:
     * - Convert to lowercase
     * - Remove separators (-, _)
     * - Remove common prefixes (ts-, ms-, svc-)
     *
     * Examples:
     * - "ts-user-service" → "userservice"
     * - "TS-USER-SERVICE" → "userservice"
     * - "user_service" → "userservice"
     * - "ms-order-svc" → "order"
     *
     * @param serviceName Raw service name
     * @return Normalized service name
     */
    static String normalizeServiceName(String serviceName) {
        if (serviceName == null || serviceName.isEmpty()) {
            return "unknown";
        }

        return serviceName.toLowerCase()
            .replaceAll("[-_]", "")                    // Remove separators
            .replaceAll("^(ts|ms|svc)", "");           // Remove common prefixes
    }

    /**
     * Normalize URL for consistent ID generation.
     *
     * Rules:
     * - Remove protocol and host (http://host:port)
     * - Remove query string (?key=value)
     * - Normalize multiple slashes to single slash
     * - Ensure leading slash
     * - Remove trailing slash
     * - Handle empty path as "/"
     *
     * Examples:
     * - "/api/users" → "/api/users"
     * - "http://host:8080/api/users" → "/api/users"
     * - "/api/users/" → "/api/users"
     * - "/api//users" → "/api/users"
     * - "/api/users?query=1" → "/api/users"
     * - "" → "/"
     *
     * @param url Raw URL
     * @return Normalized URL
     */
    static String normalizeUrl(String url) {
        if (url == null || url.isEmpty()) {
            return "/";
        }

        String normalized = url;

        // Remove protocol and host
        normalized = normalized.replaceAll("^https?://[^/]+", "");

        // Remove query string
        normalized = normalized.replaceAll("\\?.*$", "");

        // Normalize multiple slashes to single slash
        normalized = normalized.replaceAll("/+", "/");

        // Remove leading and trailing slashes temporarily
        normalized = normalized.replaceAll("^/+|/+$", "");

        // Handle empty path
        if (normalized.isEmpty()) {
            return "/";
        }

        // Ensure leading slash, no trailing slash
        return "/" + normalized;
    }

    /**
     * Generate SHA-256 hash (first 128 bits = 32 hex chars).
     *
     * Using first 128 bits provides:
     * - Good collision resistance (2^64 operations to find collision)
     * - Reasonable ID length (32 hex chars)
     * - Consistent with existing hash lengths in the system
     *
     * @param input Input string to hash
     * @return 32-character hex string
     * @throws RuntimeException if SHA-256 is not available
     */
    private static String generateHash(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = md.digest(input.getBytes(StandardCharsets.UTF_8));

            // Convert first 16 bytes to hex (16 bytes = 128 bits = 32 hex chars)
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 16; i++) {
                sb.append(String.format("%02x", hashBytes[i]));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }
}
