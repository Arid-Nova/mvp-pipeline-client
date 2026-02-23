package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Response schema information for endpoints.
 * Captures HTTP status codes and their corresponding response types.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ResponseSchemaInfo {
    /**
     * Map of HTTP status codes to response types
     * e.g., {"200": ResponseTypeInfo(...), "404": ResponseTypeInfo(...)}
     */
    private Map<String, ResponseTypeInfo> statusCodes;

    /**
     * Default response type (typically for 200)
     */
    private String defaultResponseType;

    /**
     * Whether this endpoint returns reactive types (Mono/Flux)
     */
    private boolean isReactive;

    /**
     * Whether this endpoint returns paginated results (Page/Slice)
     */
    private boolean isPaginated;

    /**
     * Whether this endpoint consumes multipart/form-data
     */
    private boolean consumesMultipart;

    /**
     * Create a simple response schema with just the default type
     */
    public static ResponseSchemaInfo createSimple(String responseType) {
        ResponseSchemaInfo schema = new ResponseSchemaInfo();
        schema.setDefaultResponseType(responseType);
        schema.setStatusCodes(new HashMap<>());

        // Add 200 status code with simple type info
        ResponseTypeInfo typeInfo = new ResponseTypeInfo();
        typeInfo.setTypeName(responseType);
        typeInfo.setFullTypeName(responseType);
        schema.getStatusCodes().put("200", typeInfo);

        return schema;
    }

    /**
     * Add a status code mapping
     */
    public void addStatusCode(String statusCode, ResponseTypeInfo typeInfo) {
        if (statusCodes == null) {
            statusCodes = new HashMap<>();
        }
        statusCodes.put(statusCode, typeInfo);
    }

    /**
     * Add a status code with a simple type name
     */
    public void addStatusCode(String statusCode, String typeName) {
        ResponseTypeInfo typeInfo = new ResponseTypeInfo();
        typeInfo.setTypeName(typeName);
        typeInfo.setFullTypeName(typeName);
        addStatusCode(statusCode, typeInfo);
    }

    /**
     * Check if a specific status code is defined
     */
    public boolean hasStatusCode(String statusCode) {
        return statusCodes != null && statusCodes.containsKey(statusCode);
    }

    /**
     * Get response type for a specific status code
     */
    public ResponseTypeInfo getResponseType(String statusCode) {
        return statusCodes != null ? statusCodes.get(statusCode) : null;
    }

    /**
     * Response type information
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ResponseTypeInfo {
        /**
         * Simple type name (e.g., "OrderDTO")
         */
        private String typeName;

        /**
         * Fully qualified type name (e.g., "com.example.dto.OrderDTO")
         */
        private String fullTypeName;

        /**
         * Field names in the response type
         */
        private List<String> fields;

        /**
         * Whether this is a generic type (e.g., ResponseEntity<T>)
         */
        private boolean isGeneric;

        /**
         * Generic type parameter (e.g., "OrderDTO" from ResponseEntity<OrderDTO>)
         */
        private String genericType;

        /**
         * Whether this is an Optional type
         */
        private boolean isOptional;

        /**
         * Whether this is a reactive type (Mono/Flux)
         */
        private boolean isReactive;

        /**
         * Whether this is a paginated type (Page/Slice)
         */
        private boolean isPaginated;

        /**
         * Description or documentation for this response type
         */
        private String description;

        /**
         * Source of this status code
         * Values: "method_return_type", "auth_required", "role_check",
         *         "method_body", "exception_handler", "validation_failure", "spring_default"
         */
        private String source;

        /**
         * Create a simple response type info
         */
        public static ResponseTypeInfo createSimple(String typeName, String fullTypeName) {
            ResponseTypeInfo info = new ResponseTypeInfo();
            info.setTypeName(typeName);
            info.setFullTypeName(fullTypeName);
            return info;
        }

        /**
         * Create a generic response type info
         */
        public static ResponseTypeInfo createGeneric(String typeName, String genericType) {
            ResponseTypeInfo info = new ResponseTypeInfo();
            info.setTypeName(typeName);
            info.setFullTypeName(typeName + "<" + genericType + ">");
            info.setGeneric(true);
            info.setGenericType(genericType);
            return info;
        }
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder("ResponseSchemaInfo{");
        if (defaultResponseType != null) {
            sb.append("default=").append(defaultResponseType);
        }
        if (statusCodes != null && !statusCodes.isEmpty()) {
            sb.append(", codes=").append(statusCodes.keySet());
        }
        if (isReactive) {
            sb.append(", reactive");
        }
        if (isPaginated) {
            sb.append(", paginated");
        }
        if (consumesMultipart) {
            sb.append(", multipart");
        }
        sb.append("}");
        return sb.toString();
    }
}
