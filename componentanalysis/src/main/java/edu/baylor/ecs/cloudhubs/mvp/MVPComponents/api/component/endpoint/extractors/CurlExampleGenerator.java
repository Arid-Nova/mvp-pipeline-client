package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.AuthenticationMechanism;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.EndpointInfo;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.ParameterDetail;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.ValidationConstraint;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Generates example curl commands for REST endpoints.
 *
 * <p>The generated curl commands include:
 * <ul>
 *   <li>HTTP method and URL with sample path variable values</li>
 *   <li>Query parameters with sample values</li>
 *   <li>Authentication headers based on endpoint requirements</li>
 *   <li>Request body JSON (when applicable)</li>
 * </ul>
 *
 * <p>This is useful for LLM-based test case generation as curl commands
 * are universally understood and compact.
 *
 * @author Claude Code
 * @version 1.0
 */
public class CurlExampleGenerator {
    /** Default base URL if not configured */
    private static final String DEFAULT_BASE_URL = "http://localhost:8080";

    /** System property key for base URL */
    private static final String BASE_URL_PROPERTY = "indexer.baseUrl";

    private final String baseUrl;
    private final DTOSchemaIntrospector dtoIntrospector;

    /**
     * Creates a CurlExampleGenerator with the default base URL.
     */
    public CurlExampleGenerator() {
        this(null, null);
    }

    /**
     * Creates a CurlExampleGenerator with a custom base URL.
     *
     * @param baseUrl The base URL to use for examples (e.g., "<a href="https://api.example.com">Link</a>")
     * @param dtoIntrospector Optional DTO introspector for request body examples
     */
    public CurlExampleGenerator(String baseUrl, DTOSchemaIntrospector dtoIntrospector) {
        // Priority: constructor param > system property > default
        if (baseUrl != null && !baseUrl.isEmpty()) {
            this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        } else {
            String sysProp = System.getProperty(BASE_URL_PROPERTY);
            if (sysProp != null && !sysProp.isEmpty()) {
                this.baseUrl = sysProp.endsWith("/") ? sysProp.substring(0, sysProp.length() - 1) : sysProp;
            } else {
                this.baseUrl = DEFAULT_BASE_URL;
            }
        }
        this.dtoIntrospector = dtoIntrospector;
    }

    /**
     * Generates a curl command example for the given endpoint.
     *
     * @param endpoint The endpoint information
     * @return A curl command string
     */
    public String generate(EndpointInfo endpoint) {
        if (endpoint == null) {
            return null;
        }

        try {
            StringBuilder curl = new StringBuilder("curl -X ");
            curl.append(endpoint.getHttpMethod());

            // Build URL with path variables replaced
            String url = buildExampleUrl(endpoint);
            curl.append(" '").append(url).append("'");

            // Add headers
            Map<String, String> headers = buildHeaders(endpoint);
            for (Map.Entry<String, String> header : headers.entrySet()) {
                curl.append(" -H '").append(header.getKey()).append(": ").append(header.getValue()).append("'");
            }

            // Add request body
            if (endpoint.getRequestBodyDetail() != null) {
                String body = generateRequestBody(endpoint.getRequestBodyDetail());
                if (body != null && !body.isEmpty()) {
                    curl.append(" -d '").append(body).append("'");
                }
            }

            return curl.toString();

        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Builds the example URL with path variables and query parameters filled in.
     */
    private String buildExampleUrl(EndpointInfo endpoint) {
        String url = baseUrl + endpoint.getFullUri();

        // Replace path variables with sample values
        if (endpoint.getPathParameterDetails() != null) {
            for (ParameterDetail param : endpoint.getPathParameterDetails()) {
                String sampleValue = generateSampleValue(param);
                url = url.replace("{" + param.getName() + "}", sampleValue);
                // Also replace {?} placeholders in case original URL wasn't preserved
                url = url.replaceFirst("\\{\\?\\}", sampleValue);
            }
        }

        // Add query parameters
        if (endpoint.getQueryParameterDetails() != null && !endpoint.getQueryParameterDetails().isEmpty()) {
            StringBuilder queryString = new StringBuilder();
            for (ParameterDetail param : endpoint.getQueryParameterDetails()) {
                if (!queryString.isEmpty()) {
                    queryString.append("&");
                }
                String value = param.getDefaultValue() != null ? param.getDefaultValue() : generateSampleValue(param);
                queryString.append(param.getName()).append("=").append(value);
            }
            url += "?" + queryString;
        }

        return url;
    }

    /**
     * Builds headers based on endpoint authentication requirements.
     * Always includes a Bearer token placeholder for LLM test generation purposes,
     * since most microservice endpoints require authentication and LLMs benefit
     * from seeing the auth header format even for public endpoints.
     */
    private Map<String, String> buildHeaders(EndpointInfo endpoint) {
        Map<String, String> headers = new LinkedHashMap<>();

        // Determine authentication type from endpoint or default to Bearer
        AuthenticationMechanism.AuthenticationType authType = null;
        if (endpoint.getAuthentication() != null && endpoint.getAuthentication().getMechanism() != null) {
            authType = endpoint.getAuthentication().getMechanism().getType();
        }

        // Add authentication header based on mechanism type
        // Always include auth header for LLM test generation (most APIs require auth)
        if (authType != null) {
            switch (authType) {
                case JWT:
                    headers.put("Authorization", "Bearer <jwt-token>");
                    break;
                case BASIC:
                    headers.put("Authorization", "Basic <base64-credentials>");
                    break;
                case API_KEY:
                    headers.put("X-API-Key", "<api-key>");
                    break;
                case OAUTH2:
                    headers.put("Authorization", "Bearer <oauth2-token>");
                    break;
                case SESSION:
                    headers.put("Cookie", "SESSION=<session-id>");
                    break;
                case CUSTOM:
                    headers.put("Authorization", "<custom-auth>");
                    break;
                case NONE:
                    // Explicitly no authentication - don't add header
                    break;
                default:
                    // Unknown type - default to Bearer
                    headers.put("Authorization", "Bearer <token>");
                    break;
            }
        } else {
            // No mechanism specified - default to Bearer token (most common)
            headers.put("Authorization", "Bearer <token>");
        }

        // Add Content-Type for request body
        if (endpoint.getRequestBodyDetail() != null) {
            headers.put("Content-Type", "application/json");
        }

        return headers;
    }

    /**
     * Generates a sample request body JSON.
     */
    private String generateRequestBody(ParameterDetail bodyParam) {
        if (bodyParam == null) {
            return null;
        }

        // Try to use DTO introspector for realistic body
        if (dtoIntrospector != null) {
            String introspectedBody = dtoIntrospector.generateJsonExample(bodyParam.getType());
            if (introspectedBody != null) {
                return introspectedBody;
            }
        }

        // Fallback: generate a simple placeholder JSON
        return generatePlaceholderJson(bodyParam);
    }

    /**
     * Generates a placeholder JSON for the request body.
     */
    private String generatePlaceholderJson(ParameterDetail bodyParam) {
        String type = bodyParam.getType();
        if (type == null) {
            type = "Object";
        }

        // Generate a basic JSON structure based on common naming patterns
        StringBuilder json = new StringBuilder("{");

        String lowerType = type.toLowerCase();
        if (lowerType.contains("user")) {
            json.append("\"id\": \"12345\", \"username\": \"john_doe\", \"email\": \"user@example.com\"");
        } else if (lowerType.contains("order")) {
            json.append("\"id\": \"67890\", \"status\": \"PENDING\", \"totalAmount\": 99.99");
        } else if (lowerType.contains("product")) {
            json.append("\"id\": \"11111\", \"name\": \"Sample Product\", \"price\": 29.99");
        } else if (lowerType.contains("payment")) {
            json.append("\"amount\": 100.00, \"currency\": \"USD\", \"method\": \"CREDIT_CARD\"");
        } else if (lowerType.contains("address")) {
            json.append("\"street\": \"123 Main St\", \"city\": \"Springfield\", \"zipCode\": \"12345\"");
        } else if (lowerType.contains("login") || lowerType.contains("auth")) {
            json.append("\"username\": \"user\", \"password\": \"********\"");
        } else if (lowerType.contains("register") || lowerType.contains("signup")) {
            json.append("\"username\": \"newuser\", \"email\": \"new@example.com\", \"password\": \"********\"");
        } else {
            // Generic placeholder
            json.append("\"field1\": \"value1\", \"field2\": \"value2\"");
        }

        json.append("}");
        return json.toString();
    }

    /**
     * Generates a sample value based on parameter type and name.
     */
    private String generateSampleValue(ParameterDetail param) {
        String type = param.getType();
        String name = param.getName();

        if (type == null) {
            type = "String";
        }

        // Check for validation constraints for better examples
        if (param.getValidationConstraints() != null) {
            for (ValidationConstraint constraint : param.getValidationConstraints()) {
                if ("Email".equals(constraint.getConstraintType())) {
                    return "user@example.com";
                }
            }
        }

        // Generate based on parameter name heuristics
        if (name != null) {
            String lowerName = name.toLowerCase();
            if (lowerName.contains("id")) return "12345";
            if (lowerName.contains("uuid")) return "550e8400-e29b-41d4-a716-446655440000";
            if (lowerName.contains("name")) return "sample-name";
            if (lowerName.contains("email")) return "user@example.com";
            if (lowerName.contains("phone")) return "555-123-4567";
            if (lowerName.contains("date")) return "2024-01-15";
            if (lowerName.contains("time")) return "10:30:00";
            if (lowerName.contains("status")) return "ACTIVE";
            if (lowerName.contains("type")) return "DEFAULT";
            if (lowerName.contains("code")) return "ABC123";
            if (lowerName.contains("token")) return "sample-token";
            if (lowerName.contains("page")) return "0";
            if (lowerName.contains("size") || lowerName.contains("limit")) return "10";
            if (lowerName.contains("offset") || lowerName.contains("skip")) return "0";
            if (lowerName.contains("sort")) return "createdAt";
            if (lowerName.contains("order")) return "asc";
            if (lowerName.contains("search") || lowerName.contains("query") || lowerName.contains("keyword")) return "search-term";
            if (lowerName.contains("filter")) return "all";
            if (lowerName.contains("enabled") || lowerName.contains("active")) return "true";
        }

        // Generate based on type
        return switch (type.toLowerCase()) {
            case "string" -> "example-value";
            case "long", "integer", "int" -> "12345";
            case "double", "float", "bigdecimal" -> "123.45";
            case "boolean" -> "true";
            case "uuid" -> "550e8400-e29b-41d4-a716-446655440000";
            case "date", "localdate" -> "2024-01-15";
            case "datetime", "localdatetime", "instant", "zoneddatetime" -> "2024-01-15T10:30:00Z";
            default -> "example";
        };
    }
}
