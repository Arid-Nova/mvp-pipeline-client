package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.Objects;

/**
 * Represents endpoint information extracted from REST API controller methods.
 * This is a standalone model that does not extend IndexedComponent but provides
 * comprehensive endpoint metadata including HTTP details and parameter information.
 */
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class EndpointInfo {
    /**
     * Unique identifier for this endpoint (service-scoped)
     */
    private String id;
    
    /**
     * Reference to the controller method that handles this endpoint
     */
    private String methodId;
    
    /**
     * HTTP method (GET, POST, PUT, DELETE, etc.)
     */
    private String httpMethod;
    
    /**
     * Complete endpoint URI with actual parameter names (e.g., "/api/v1/users/{userId}")
     */
    private String fullUri;

    /**
     * Simplified endpoint URI with {?} placeholders for pattern matching (e.g., "/api/v1/users/{?}")
     */
    private String simplifiedUri;

    /**
     * Detailed information about path parameters
     */
    private List<ParameterDetail> pathParameterDetails;
    
    /**
     * Detailed information about query parameters
     */
    private List<ParameterDetail> queryParameterDetails;
    
    /**
     * Detailed information about request body parameter
     */
    private ParameterDetail requestBodyDetail;
    
    /**
     * Response type returned by the endpoint
     */
    private String responseType;
    
    /**
     * Fully qualified name of the controller class containing this endpoint
     */
    private String controllerClass;
    
    /**
     * Name of the controller method
     */
    private String methodName;
    
    /**
     * Description or documentation for the endpoint
     */
    private String description;

    /**
     * Authentication and authorization requirements for this endpoint
     */
    private AuthenticationInfo authentication;

    /**
     * Authorization information for this endpoint (roles, permissions)
     * Separate from authentication which tracks identity verification
     */
    private AuthorizationInfo authorization;

    /**
     * Response schema information including status codes and response types
     */
    private ResponseSchemaInfo responseSchema;

    /**
     * Endpoint-based ID generated from API contract (service:url:method).
     * This ID is based purely on the API contract, not implementation details.
     * Format: normalizedService:hash (e.g., "userservice:abc123...")
     * Used for cross-service linking via API contracts.
     */
    private String endpointId;

    /**
     * Service name that owns this endpoint (extracted from id for convenience).
     * Example: "ts-user-service"
     */
    private String serviceName;

    /**
     * Example curl command showing how to call this endpoint.
     * Includes path variables, query params, headers, and request body.
     * LLM-friendly format for test case generation.
     */
    private String curlExample;

    /**
     * Physical service name - the microservice where the controller class actually resides.
     * Example: "ts-preserve-service" (when controller is in preserve-service but exposes /orderservice paths)
     */
    private String physicalServiceName;

    /**
     * URL-derived service name - extracted from the URL path pattern.
     * Example: "ts-order-service" (derived from /api/v1/orderservice/... path)
     * This is used for remote call resolution when services call each other by logical API paths.
     * May be null if no service name can be derived from the URL.
     */
    private String urlDerivedServiceName;

    // ============== JSON SERIALIZATION GETTERS ==============

    public String getId() { return id; }
    public String getMethodId() { return methodId; }
    public String getHttpMethod() { return httpMethod; }
    public String getFullUri() { return fullUri; }
    public String getSimplifiedUri() { return simplifiedUri; }
    public List<ParameterDetail> getPathParameterDetails() { return pathParameterDetails; }
    public List<ParameterDetail> getQueryParameterDetails() { return queryParameterDetails; }
    public ParameterDetail getRequestBodyDetail() { return requestBodyDetail; }
    public String getResponseType() { return responseType; }
    public String getControllerClass() { return controllerClass; }
    public String getMethodName() { return methodName; }
    public String getDescription() { return description; }
    public AuthenticationInfo getAuthentication() { return authentication; }
    public AuthorizationInfo getAuthorization() { return authorization; }
    public ResponseSchemaInfo getResponseSchema() { return responseSchema; }
    public String getEndpointId() { return endpointId; }
    public String getServiceName() { return serviceName; }
    public String getCurlExample() { return curlExample; }
    public String getPhysicalServiceName() { return physicalServiceName; }
    public String getUrlDerivedServiceName() { return urlDerivedServiceName; }

    // ============== UTILITY METHODS ==============
    
    /**
     * Find a parameter by name in path parameters
     * 
     * @param parameterName The name of the parameter to find
     * @return true if the parameter exists in path parameters
     */
    public boolean hasPathParameter(String parameterName) {
        return pathParameterDetails != null && 
               pathParameterDetails.stream().anyMatch(p -> parameterName.equals(p.getName()));
    }
    
    /**
     * Find a parameter by name in query parameters
     * 
     * @param parameterName The name of the parameter to find
     * @return true if the parameter exists in query parameters
     */
    public boolean hasQueryParameter(String parameterName) {
        return queryParameterDetails != null && 
               queryParameterDetails.stream().anyMatch(p -> parameterName.equals(p.getName()));
    }
    
    /**
     * Check if this endpoint has a request body
     * 
     * @return true if the endpoint accepts a request body
     */
    public boolean hasRequestBody() {
        return requestBodyDetail != null;
    }
    
    /**
     * Check if this endpoint has path parameters
     * 
     * @return true if the endpoint has path parameters
     */
    public boolean hasPathParameters() {
        return pathParameterDetails != null && !pathParameterDetails.isEmpty();
    }
    
    /**
     * Check if this endpoint has query parameters
     * 
     * @return true if the endpoint has query parameters
     */
    public boolean hasQueryParameters() {
        return queryParameterDetails != null && !queryParameterDetails.isEmpty();
    }
    
    
    /**
     * Find a path parameter detail by name
     * 
     * @param parameterName The name of the parameter to find
     * @return The ParameterDetail if found, null otherwise
     */
    public ParameterDetail findPathParameterDetail(String parameterName) {
        if (pathParameterDetails == null) {
            return null;
        }
        return pathParameterDetails.stream()
            .filter(param -> parameterName.equals(param.getName()))
            .findFirst()
            .orElse(null);
    }
    
    /**
     * Find a query parameter detail by name
     * 
     * @param parameterName The name of the parameter to find
     * @return The ParameterDetail if found, null otherwise
     */
    public ParameterDetail findQueryParameterDetail(String parameterName) {
        if (queryParameterDetails == null) {
            return null;
        }
        return queryParameterDetails.stream()
            .filter(param -> parameterName.equals(param.getName()))
            .findFirst()
            .orElse(null);
    }
    
    /**
     * Check if this endpoint has detailed parameter information
     * 
     * @return true if parameter details are available
     */
    public boolean hasParameterDetails() {
        return (pathParameterDetails != null && !pathParameterDetails.isEmpty()) ||
               (queryParameterDetails != null && !queryParameterDetails.isEmpty()) ||
               requestBodyDetail != null;
    }
    
    
    
    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        EndpointInfo that = (EndpointInfo) obj;
        return Objects.equals(id, that.id) &&
               Objects.equals(methodId, that.methodId) &&
               Objects.equals(httpMethod, that.httpMethod) &&
               Objects.equals(fullUri, that.fullUri) &&
               Objects.equals(simplifiedUri, that.simplifiedUri) &&
               Objects.equals(pathParameterDetails, that.pathParameterDetails) &&
               Objects.equals(queryParameterDetails, that.queryParameterDetails) &&
               Objects.equals(requestBodyDetail, that.requestBodyDetail) &&
               Objects.equals(responseType, that.responseType) &&
               Objects.equals(controllerClass, that.controllerClass) &&
               Objects.equals(methodName, that.methodName) &&
               Objects.equals(description, that.description) &&
               Objects.equals(authentication, that.authentication) &&
               Objects.equals(authorization, that.authorization) &&
               Objects.equals(responseSchema, that.responseSchema) &&
               Objects.equals(endpointId, that.endpointId) &&
               Objects.equals(serviceName, that.serviceName) &&
               Objects.equals(curlExample, that.curlExample) &&
               Objects.equals(physicalServiceName, that.physicalServiceName) &&
               Objects.equals(urlDerivedServiceName, that.urlDerivedServiceName);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, methodId, httpMethod, fullUri, simplifiedUri,
                          pathParameterDetails, queryParameterDetails,
                          requestBodyDetail, responseType, controllerClass,
                          methodName, description, authentication, authorization, responseSchema,
                          endpointId, serviceName, curlExample, physicalServiceName, urlDerivedServiceName);
    }

    @Override
    public String toString() {
        return "EndpointInfo{" +
               "id='" + id + '\'' +
               ", methodId='" + methodId + '\'' +
               ", httpMethod='" + httpMethod + '\'' +
               ", fullUri='" + fullUri + '\'' +
               ", simplifiedUri='" + simplifiedUri + '\'' +
               ", pathParameterDetails=" + pathParameterDetails +
               ", queryParameterDetails=" + queryParameterDetails +
               ", requestBodyDetail=" + requestBodyDetail +
               ", responseType='" + responseType + '\'' +
               ", controllerClass='" + controllerClass + '\'' +
               ", methodName='" + methodName + '\'' +
               ", description='" + description + '\'' +
               ", authentication=" + authentication +
               ", authorization=" + authorization +
               ", responseSchema=" + responseSchema +
               ", endpointId='" + endpointId + '\'' +
               ", serviceName='" + serviceName + '\'' +
               ", curlExample='" + curlExample + '\'' +
               ", physicalServiceName='" + physicalServiceName + '\'' +
               ", urlDerivedServiceName='" + urlDerivedServiceName + '\'' +
               '}';
    }
}