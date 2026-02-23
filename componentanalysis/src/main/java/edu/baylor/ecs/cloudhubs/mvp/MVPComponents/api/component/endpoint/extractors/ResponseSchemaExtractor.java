package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.AuthenticationInfo;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.AuthorizationInfo;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.ResponseSchemaInfo;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Extracts response schema information from method declarations.
 * Handles various response patterns including ResponseEntity, reactive types, pagination, etc.
 */
public class ResponseSchemaExtractor {

    /**
     * Extract response schema from method declaration
     */
    public static ResponseSchemaInfo extractResponseSchema(
        MethodDeclaration method,
        ExceptionHandlerRegistry exceptionRegistry
    ) {
        ResponseSchemaInfo schema = new ResponseSchemaInfo();
        schema.setStatusCodes(new HashMap<>());

        // Extract return type information
        Type returnType = method.getType();
        String returnTypeStr = returnType.asString();

        // Check for reactive types (Mono/Flux)
        if (isReactiveType(returnTypeStr)) {
            schema.setReactive(true);
            returnTypeStr = extractReactiveInnerType(returnTypeStr);
        }

        // Check for paginated types (Page/Slice)
        if (isPaginatedType(returnTypeStr)) {
            schema.setPaginated(true);
        }

        // Check for MultipartFile in parameters
        if (hasMultipartFile(method)) {
            schema.setConsumesMultipart(true);
        }

        // Parse return type and extract status codes
        Map<String, ResponseSchemaInfo.ResponseTypeInfo> statusCodes = extractStatusCodesFromReturnType(returnTypeStr, method);
        schema.setStatusCodes(statusCodes);

        // Set default response type
        if (statusCodes.containsKey("200")) {
            schema.setDefaultResponseType(statusCodes.get("200").getTypeName());
        } else if (!statusCodes.isEmpty()) {
            // Use first available status code as default
            String firstKey = statusCodes.keySet().iterator().next();
            schema.setDefaultResponseType(statusCodes.get(firstKey).getTypeName());
        } else {
            schema.setDefaultResponseType(returnTypeStr);
        }

        // Scan method body for explicit status code returns
        scanMethodBodyForStatusCodes(method, schema);

        // Add exception-based status codes
        addExceptionStatusCodes(method, schema, exceptionRegistry);

        return schema;
    }

    /**
     * Check if return type is reactive (Mono/Flux/Publisher)
     */
    private static boolean isReactiveType(String returnType) {
        return returnType.startsWith("Mono<") ||
               returnType.startsWith("Flux<") ||
               returnType.startsWith("Publisher<");
    }

    /**
     * Extract inner type from reactive wrapper
     */
    private static String extractReactiveInnerType(String returnType) {
        int start = returnType.indexOf('<');
        int end = returnType.lastIndexOf('>');
        if (start > 0 && end > start) {
            return returnType.substring(start + 1, end).trim();
        }
        return returnType;
    }

    /**
     * Check if return type is paginated (Page/Slice)
     */
    private static boolean isPaginatedType(String returnType) {
        return returnType.startsWith("Page<") ||
               returnType.startsWith("Slice<");
    }

    /**
     * Check if method has MultipartFile parameters
     */
    private static boolean hasMultipartFile(MethodDeclaration method) {
        for (Parameter param : method.getParameters()) {
            String paramType = param.getTypeAsString();
            if (paramType.equals("MultipartFile") || paramType.endsWith(".MultipartFile")) {
                return true;
            }
            // Check for @RequestPart annotation
            if (param.getAnnotationByName("RequestPart").isPresent()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Extract status codes from return type analysis
     */
    private static Map<String, ResponseSchemaInfo.ResponseTypeInfo> extractStatusCodesFromReturnType(
        String returnType,
        MethodDeclaration method
    ) {
        Map<String, ResponseSchemaInfo.ResponseTypeInfo> statusCodes = new HashMap<>();

        // Handle ResponseEntity<T>
        if (returnType.startsWith("ResponseEntity<")) {
            String innerType = extractGenericType(returnType);

            // Check for Optional<T> inside ResponseEntity
            if (innerType.startsWith("Optional<")) {
                // Add both 200 and 404 status codes for Optional
                String optionalInnerType = extractGenericType(innerType);

                ResponseSchemaInfo.ResponseTypeInfo successType = ResponseSchemaInfo.ResponseTypeInfo.createSimple(optionalInnerType, optionalInnerType);
                successType.setOptional(true);
                statusCodes.put("200", successType);

                // Optional typically means 404 when empty
                statusCodes.put("404", ResponseSchemaInfo.ResponseTypeInfo.createSimple("void", "void"));
            } else {
                // Regular ResponseEntity<T>
                ResponseSchemaInfo.ResponseTypeInfo typeInfo = ResponseSchemaInfo.ResponseTypeInfo.createGeneric("ResponseEntity", innerType);
                statusCodes.put("200", typeInfo);
            }
        } else if (returnType.startsWith("Optional<")) {
            // Optional<T> return type implies 200 or 404
            String innerType = extractGenericType(returnType);

            ResponseSchemaInfo.ResponseTypeInfo successType = ResponseSchemaInfo.ResponseTypeInfo.createSimple(innerType, innerType);
            successType.setOptional(true);
            statusCodes.put("200", successType);
            statusCodes.put("404", ResponseSchemaInfo.ResponseTypeInfo.createSimple("void", "void"));
        } else if (returnType.startsWith("Page<") || returnType.startsWith("Slice<")) {
            // Paginated response
            String innerType = extractGenericType(returnType);

            ResponseSchemaInfo.ResponseTypeInfo typeInfo = ResponseSchemaInfo.ResponseTypeInfo.createGeneric(
                returnType.substring(0, returnType.indexOf('<')),
                innerType
            );
            typeInfo.setPaginated(true);
            statusCodes.put("200", typeInfo);
        } else {
            // Simple return type
            ResponseSchemaInfo.ResponseTypeInfo typeInfo = ResponseSchemaInfo.ResponseTypeInfo.createSimple(returnType, returnType);
            statusCodes.put("200", typeInfo);
        }

        return statusCodes;
    }

    /**
     * Extract generic type parameter from a generic type
     */
    private static String extractGenericType(String genericType) {
        int start = genericType.indexOf('<');
        int end = genericType.lastIndexOf('>');
        if (start > 0 && end > start) {
            return genericType.substring(start + 1, end).trim();
        }
        return genericType;
    }

    /**
     * Scan method body for explicit status code returns
     */
    private static void scanMethodBodyForStatusCodes(MethodDeclaration method, ResponseSchemaInfo schema) {
        if (!method.getBody().isPresent()) {
            return;
        }

        // Find ResponseEntity method calls
        List<MethodCallExpr> methodCalls = method.getBody().get().findAll(MethodCallExpr.class);

        for (MethodCallExpr call : methodCalls) {
            String methodName = call.getNameAsString();

            // ResponseEntity.ok() -> 200
            if (methodName.equals("ok")) {
                if (!schema.hasStatusCode("200")) {
                    schema.addStatusCode("200", extractTypeFromCall(call));
                }
            }
            // ResponseEntity.created() -> 201
            else if (methodName.equals("created")) {
                schema.addStatusCode("201", extractTypeFromCall(call));
            }
            // ResponseEntity.accepted() -> 202
            else if (methodName.equals("accepted")) {
                schema.addStatusCode("202", extractTypeFromCall(call));
            }
            // ResponseEntity.noContent() -> 204
            else if (methodName.equals("noContent")) {
                schema.addStatusCode("204", "void");
            }
            // ResponseEntity.notFound() -> 404
            else if (methodName.equals("notFound")) {
                schema.addStatusCode("404", "void");
            }
            // ResponseEntity.badRequest() -> 400
            else if (methodName.equals("badRequest")) {
                schema.addStatusCode("400", extractTypeFromCall(call));
            }
            // ResponseEntity.status(code)
            else if (methodName.equals("status")) {
                if (!call.getArguments().isEmpty()) {
                    String statusArg = call.getArguments().get(0).toString();
                    Integer statusCode = parseStatusCode(statusArg);
                    if (statusCode != null) {
                        schema.addStatusCode(statusCode.toString(), extractTypeFromCall(call));
                    }
                }
            }
        }

        // Find new ResponseEntity<>(..., HttpStatus.XXX) constructions
        List<ObjectCreationExpr> objectCreations = method.getBody().get().findAll(ObjectCreationExpr.class);

        for (ObjectCreationExpr creation : objectCreations) {
            if (creation.getTypeAsString().startsWith("ResponseEntity")) {
                // Check for HttpStatus argument
                if (creation.getArguments().size() >= 2) {
                    String statusArg = creation.getArguments().get(1).toString();
                    Integer statusCode = parseStatusCode(statusArg);
                    if (statusCode != null) {
                        String responseType = "Object"; // Default
                        if (creation.getType() instanceof ClassOrInterfaceType) {
                            ClassOrInterfaceType type = (ClassOrInterfaceType) creation.getType();
                            if (type.getTypeArguments().isPresent() && !type.getTypeArguments().get().isEmpty()) {
                                responseType = type.getTypeArguments().get().get(0).asString();
                            }
                        }
                        schema.addStatusCode(statusCode.toString(), responseType);
                    }
                }
            }
        }
    }

    /**
     * Parse status code from argument (HttpStatus enum or integer)
     */
    private static Integer parseStatusCode(String statusArg) {
        // Handle HttpStatus.XXX
        if (statusArg.contains("HttpStatus.")) {
            String statusName = statusArg.substring(statusArg.lastIndexOf('.') + 1);
            return mapHttpStatusToCode(statusName);
        }

        // Handle integer literals
        try {
            return Integer.parseInt(statusArg);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Map HttpStatus enum name to integer code
     */
    private static Integer mapHttpStatusToCode(String statusName) {
        switch (statusName) {
            case "OK": return 200;
            case "CREATED": return 201;
            case "ACCEPTED": return 202;
            case "NO_CONTENT": return 204;
            case "BAD_REQUEST": return 400;
            case "UNAUTHORIZED": return 401;
            case "FORBIDDEN": return 403;
            case "NOT_FOUND": return 404;
            case "CONFLICT": return 409;
            case "INTERNAL_SERVER_ERROR": return 500;
            default: return null;
        }
    }

    /**
     * Extract type from ResponseEntity method call
     */
    private static String extractTypeFromCall(MethodCallExpr call) {
        // Try to infer from arguments
        if (!call.getArguments().isEmpty()) {
            return call.getArguments().get(0).calculateResolvedType().describe();
        }
        return "Object";
    }

    /**
     * Add exception-based status codes from throws clauses and method body
     */
    private static void addExceptionStatusCodes(
        MethodDeclaration method,
        ResponseSchemaInfo schema,
        ExceptionHandlerRegistry exceptionRegistry
    ) {
        if (exceptionRegistry == null) {
            return;
        }

        // Check throws clause
        for (com.github.javaparser.ast.type.ReferenceType thrownException : method.getThrownExceptions()) {
            String exceptionType = thrownException.asString();
            Integer statusCode = exceptionRegistry.getStatusCode(exceptionType);

            if (statusCode != null) {
                String responseType = exceptionRegistry.getResponseType(exceptionType);
                if (responseType == null) {
                    responseType = "ErrorResponse";
                }
                schema.addStatusCode(statusCode.toString(), responseType);
            }
        }

        // Scan for throw statements in method body
        if (method.getBody().isPresent()) {
            List<com.github.javaparser.ast.stmt.ThrowStmt> throwStmts =
                method.getBody().get().findAll(com.github.javaparser.ast.stmt.ThrowStmt.class);

            for (com.github.javaparser.ast.stmt.ThrowStmt throwStmt : throwStmts) {
                if (throwStmt.getExpression() instanceof ObjectCreationExpr) {
                    ObjectCreationExpr creation = (ObjectCreationExpr) throwStmt.getExpression();
                    String exceptionType = creation.getTypeAsString();

                    Integer statusCode = exceptionRegistry.getStatusCode(exceptionType);
                    if (statusCode != null) {
                        String responseType = exceptionRegistry.getResponseType(exceptionType);
                        if (responseType == null) {
                            responseType = "ErrorResponse";
                        }
                        schema.addStatusCode(statusCode.toString(), responseType);
                    }
                }
            }
        }
    }

    /**
     * Add authentication and authorization-based status codes
     * Adds 401 (Unauthorized) and 403 (Forbidden) based on security requirements
     *
     * @param schema Response schema to enrich
     * @param authentication Authentication information
     * @param authorization Authorization information
     */
    public static void addAuthenticationStatusCodes(
        ResponseSchemaInfo schema,
        AuthenticationInfo authentication,
        AuthorizationInfo authorization
    ) {
        if (schema == null) {
            return;
        }

        // Check for required authentication
        boolean authRequired = authentication != null && authentication.isRequired() && !authentication.isPermitAll();

        // Check for optional authentication (public endpoint with token validation)
        boolean optionalAuth = authentication != null && authentication.isOptionalAuthentication();

        // Add 401 for required authentication
        if (authRequired) {
            if (!schema.hasStatusCode("401")) {
                ResponseSchemaInfo.ResponseTypeInfo unauthorizedType = ResponseSchemaInfo.ResponseTypeInfo.createSimple("ErrorResponse", "ErrorResponse");
                unauthorizedType.setSource("auth_required");

                // Get description from authentication mechanism if available
                String description = "Missing or invalid authentication token";
                if (authentication.getMechanism() != null) {
                    String tokenType = authentication.getMechanism().getTokenFormat();
                    if (tokenType != null) {
                        description = "Missing or invalid " + tokenType + " token";
                    }
                }
                unauthorizedType.setDescription(description);

                schema.addStatusCode("401", unauthorizedType);
            }

            // If there are role requirements, add 403 - Forbidden
            if (authorization != null && !authorization.isPublic()) {
                if (authorization.hasRoleRequirements()) {
                    if (!schema.hasStatusCode("403")) {
                        ResponseSchemaInfo.ResponseTypeInfo forbiddenType = ResponseSchemaInfo.ResponseTypeInfo.createSimple("ErrorResponse", "ErrorResponse");
                        forbiddenType.setSource("role_check");

                        // Build description with required roles
                        StringBuilder desc = new StringBuilder("Insufficient privileges");
                        if (authorization.hasRoleRequirements()) {
                            desc.append(". Required roles: ").append(String.join(", ", authorization.getRequiredRoles()));
                        }
                        forbiddenType.setDescription(desc.toString());

                        schema.addStatusCode("403", forbiddenType);
                    }
                }
            }
        }
        // Add 401 for optional authentication (only when invalid token is provided)
        else if (optionalAuth) {
            if (!schema.hasStatusCode("401")) {
                ResponseSchemaInfo.ResponseTypeInfo unauthorizedType = ResponseSchemaInfo.ResponseTypeInfo.createSimple("ErrorResponse", "ErrorResponse");
                unauthorizedType.setSource("optional_auth");

                // Build description for optional authentication
                StringBuilder description = new StringBuilder("Invalid or malformed authentication token");
                if (authentication.getMechanism() != null) {
                    String tokenType = authentication.getMechanism().getTokenFormat();
                    if (tokenType != null) {
                        description = new StringBuilder("Invalid or malformed " + tokenType + " token");
                    }
                }
                description.append(" (only when token is provided; no token allows access)");

                unauthorizedType.setDescription(description.toString());
                schema.addStatusCode("401", unauthorizedType);
            }
        }
    }
}
